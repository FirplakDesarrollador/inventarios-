import type { Cell } from "@/lib/graph/excel";

const MESES = [
  "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
  "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE",
];

function mesDePalabra(palabra: string) {
  const i = MESES.findIndex((m) => palabra === m || (palabra.length >= 3 && palabra.length <= 4 && m.startsWith(palabra)));
  return i >= 0 ? i : null;
}

// Reconoce el mes (completo o abreviado) y el año de un nombre o ruta. Si no trae año se usa anioPorDefecto.
// "INVENTARIO FEBRERO-MARZO MP-01 ALMACEN 2026.xlsx" -> { periodo: "Febrero-Marzo", periodoInicio: "2026-02-01" }
// "Abril/INVEN. PLANTA FV 09-04.xlsx" (2026)          -> { periodo: "Abril", periodoInicio: "2026-04-01" }
export function parsePeriodo(nombre: string, anioPorDefecto?: number) {
  const upper = nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  const anio = upper.match(/\b(20\d{2})\b/)?.[1] ?? anioPorDefecto?.toString();
  const meses = [
    ...new Set(
      (upper.match(/[A-Z]+/g) ?? []).map(mesDePalabra).filter((i): i is number => i !== null),
    ),
  ];
  if (!anio || meses.length === 0) return null;

  const periodo = meses.map((i) => MESES[i].charAt(0) + MESES[i].slice(1).toLowerCase()).join("-");
  return { periodo, periodoInicio: `${anio}-${String(meses[0] + 1).padStart(2, "0")}-01` };
}

function finDeMes(periodoInicio: string) {
  const [anio, mes] = periodoInicio.split("-").map(Number);
  return new Date(Date.UTC(anio, mes, 0)).toISOString().slice(0, 10);
}

// Los encabezados se comparan sin mayúsculas ni tildes porque varían entre bodegas.
const normalizar = (s: Cell) =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

// Hay dos plantillas de conteo:
//  A (MP-01, CEDI, plantas): FECHA (X), Stock Teorico, Sobrante/Faltante (valorizados), AJUSTE SI/NO.
//  B (bodegas pequeñas):      Cantidad acumulada (stock SAP), Conteo, Diferencia(s), sin fecha.
// Para cada dato se usa la primera alternativa que exista en la hoja.
const COLUMNAS = {
  item: ["numero de articulo"],
  descripcion: ["descripcion del articulo", "descripcion"],
  familia: ["familia"],
  tipoToc: ["tipo toc"],
  fecha: ["fecha (x)"],
  dia: ["dia"], // plantilla B de Moldes: día del mes en que se contó
  teorico: ["stock teorico", "cantidad acumulada", "cantidad teorica", "cantidad"],
  costo: ["costo unitario", "valor uni", "valor unitario", "valor unid"],
  valorAcumulado: ["valor acumulado"],
  sobrante: ["sobrante (entrada)"],
  sobranteVal: ["sobrante valorizado"],
  faltante: ["faltante (salida)"],
  faltanteVal: ["faltante valorizado"],
  diferencia: ["diferencia", "diferencias"],
  valorDiferencia: ["valor diferencia", "valor diferencias", "valor total"],
  ajusteSi: ["ajuste si"],
  ajusteNo: ["ajuste no"],
  ajustar: ["ajustar", "ajuste"],
  concepto: ["concepto"],
  bodega: ["bodega"],
  doc: ["#doc", "# doc", "# entrada"],
} as const;

type Col = keyof typeof COLUMNAS;

// Columnas de comentarios: cada plantilla usa una o varias; se leen todas y se unen.
const COMENTARIOS = ["observacion", "observaciones", "comentarios adicionales", "comentarios", "observaciones negociacion"];

function num(value: Cell): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  return null; // vacíos y errores de Excel (#N/A, #REF!…)
}

function text(value: Cell): string | null {
  const s = String(value ?? "").trim();
  return s === "" || s.startsWith("#N/A") ? null : s;
}

// Excel guarda las fechas como días desde 1899-12-30.
function excelDate(value: Cell): string | null {
  if (typeof value !== "number" || value < 1) return null;
  return new Date(Date.UTC(1899, 11, 30) + value * 86_400_000).toISOString().slice(0, 10);
}

const redondear = (v: number) => Math.round(v * 1e6) / 1e6;

export type Plantilla = "A" | "B";

// Identifica si una hoja es de conteo y con qué plantilla. Devuelve null para hojas de apoyo
// (Kardex, auditoría de stock, cronogramas…), que no tienen columna de conteo.
export function detectarPlantilla(values: Cell[][]) {
  const headerRow = values.slice(0, 15).findIndex((row) => row?.some((c) => normalizar(c) === COLUMNAS.item[0]));
  if (headerRow < 0) return null;

  const header = values[headerRow].map(normalizar);
  const idx = Object.fromEntries(
    Object.entries(COLUMNAS).map(([key, nombres]) => [key, nombres.map((n) => header.indexOf(n)).find((i) => i >= 0) ?? -1]),
  ) as Record<Col, number>;
  // "Conteo definitivo" / "Conteo definitivo 2" (después de despachos pendientes): vale el último.
  // Si no hay, "Conteo total" (Moldes, suma de varios conteos), "Conteo", el conteo de Sodimac (Fulfillment)
  // o "Lo que queda" (Servicios).
  const definitivo = header.reduce((last, h, i) => (h.startsWith("conteo definitivo") ? i : last), -1);
  const conteoIdx =
    [definitivo, ...["conteo total", "conteo", "conteo sodimac", "inv sodimac", "lo que queda"].map((n) => header.indexOf(n))].find(
      (i) => i >= 0,
    ) ?? -1;

  const plantillaA = ["fecha", "teorico", "sobrante", "faltante", "ajusteSi"].every((k) => idx[k as Col] >= 0);
  const plantillaB = idx.teorico >= 0 && conteoIdx >= 0;
  const plantilla: Plantilla | null = plantillaA ? "A" : plantillaB ? "B" : null;
  // Cuando un archivo tiene varias hojas de conteo, la que anota el concepto de ajuste es la versión ajustada.
  const anotaAjuste = idx.concepto >= 0 || idx.ajusteSi >= 0;
  const comentariosIdx = header.map((h, i) => (COMENTARIOS.includes(h) ? i : -1)).filter((i) => i >= 0);
  // Sin columna de comentarios con nombre (Servicios), se anotan en las columnas sin título que siguen a la
  // última; de esas solo vale el texto (en algunos meses la salida queda sin título y trae números).
  const comentariosSinTitulo = comentariosIdx.length === 0;
  if (comentariosSinTitulo) {
    const ultima = header.findLastIndex((h) => h !== "");
    for (let i = ultima + 1; ultima >= 0 && i < Math.max(header.length, ultima + 2); i++) comentariosIdx.push(i);
  }
  return plantilla ? { plantilla, headerRow, idx, conteoIdx, anotaAjuste, comentariosIdx, comentariosSinTitulo } : null;
}

// Mes con más fechas de conteo, para hojas cuyo nombre no dice el mes (p. ej. "INVENTARIO CT-02.xlsx").
export function periodoPorFechas(fechas: (string | null)[]) {
  const porMes = new Map<string, number>();
  for (const f of fechas) if (f) porMes.set(f.slice(0, 7), (porMes.get(f.slice(0, 7)) ?? 0) + 1);
  const [mes] = [...porMes.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
  return mes ? parsePeriodo(`${MESES[Number(mes.slice(5)) - 1]} ${mes.slice(0, 4)}`) : null;
}

export function parseHojaConteo(
  values: Cell[][],
  ctx: { archivoId: string; bodega: string; ubicacion: string; periodoInicio: string },
) {
  const det = detectarPlantilla(values);
  if (!det) throw new Error("La hoja no tiene la estructura de conteo");
  const { plantilla, headerRow, idx, conteoIdx, comentariosIdx, comentariosSinTitulo } = det;

  // Une los comentarios de todas las columnas, sin repetir el mismo texto.
  const comentarios = (row: Cell[]) => {
    const textos = [
      ...new Set(
        comentariosIdx
          .filter((i) => !comentariosSinTitulo || typeof row[i] === "string")
          .map((i) => text(row[i]))
          .filter((t): t is string => t !== null),
      ),
    ];
    return textos.length ? textos.join(" · ") : null;
  };
  const at = (row: Cell[], i: number) => (i >= 0 ? row[i] : null);
  const fechaPorDefecto = finDeMes(ctx.periodoInicio);

  // En algunas plantillas A (plantas) la columna FECHA (X) queda vacía: el día contado se marca con una
  // "x" en las columnas de días, y la fila de arriba trae la fecha de cada columna. Esas fechas suelen
  // estar desactualizadas (de otro año), así que solo se usan si caen en el periodo del archivo; si no,
  // vale el número de día del encabezado con el mes del archivo.
  const encabezado = values[headerRow];
  const filaFechas = values[headerRow - 1] ?? [];
  const [anioPeriodo, mesPeriodo] = ctx.periodoInicio.split("-").map(Number);
  const limite = new Date(Date.UTC(anioPeriodo, mesPeriodo + 1, 0)).toISOString().slice(0, 10); // fin del mes siguiente
  const columnasDia =
    idx.fecha > idx.item
      ? encabezado
          .map((h, i) => ({ h, i }))
          .filter(({ h, i }) => i > idx.item && i < idx.fecha && typeof h === "number" && Number.isInteger(h) && h >= 1 && h <= 37)
          .map(({ i }) => i)
      : [];
  function fechaPorMarca(row: Cell[]): string | null {
    const i = columnasDia.find((c) => text(row[c]));
    if (i === undefined) return null;
    const f = excelDate(filaFechas[i] ?? null);
    if (f && f >= ctx.periodoInicio && f <= limite) return f;
    return diaDelPeriodo(Number(encabezado[i]));
  }

  // Día del mes del archivo; si no es válido, fin de mes.
  function diaDelPeriodo(dia: number) {
    return Number.isInteger(dia) && dia >= 1 && dia <= Number(fechaPorDefecto.slice(8))
      ? `${ctx.periodoInicio.slice(0, 8)}${String(dia).padStart(2, "0")}`
      : fechaPorDefecto;
  }

  // Plantilla B: no trae fecha; se usa la columna "Dia" si existe, o el fin de mes del archivo.
  function fechaPorDia(row: Cell[]) {
    return diaDelPeriodo(num(at(row, idx.dia)) ?? 0);
  }

  const porItem = new Map<string, ReturnType<typeof toRow>>();
  function toRow(row: Cell[], itemCode: string) {
    const teorico = num(at(row, idx.teorico));
    const conteo = num(at(row, conteoIdx));
    const valorAcumulado = num(at(row, idx.valorAcumulado));
    const costo =
      num(at(row, idx.costo)) ?? (valorAcumulado != null && teorico ? valorAcumulado / teorico : null);

    let sobrante: number, faltante: number, sobranteVal: number, faltanteVal: number;
    if (plantilla === "A") {
      sobrante = num(at(row, idx.sobrante)) ?? 0;
      faltante = num(at(row, idx.faltante)) ?? 0;
      sobranteVal = num(at(row, idx.sobranteVal)) ?? (costo ?? 0) * sobrante;
      faltanteVal = num(at(row, idx.faltanteVal)) ?? (costo ?? 0) * faltante;
    } else {
      // Plantilla B: la diferencia se calcula como conteo − stock SAP, porque la columna "Diferencia" no
      // tiene un sentido fijo (en Moldes es stock − conteo). Solo si falta alguno se usa la columna.
      const dif =
        conteo != null && teorico != null ? redondear(conteo - teorico) : (num(at(row, idx.diferencia)) ?? 0);
      // El valor de la diferencia a veces viene sin signo: el signo lo da la diferencia en unidades.
      const valor = Math.abs(num(at(row, idx.valorDiferencia)) ?? (costo ?? 0) * dif);
      sobrante = dif > 0 ? dif : 0;
      faltante = dif < 0 ? dif : 0;
      sobranteVal = dif > 0 ? valor : 0;
      faltanteVal = dif < 0 ? -valor : 0;
    }

    // Concepto de SAP (EAI, SAI, SCA…); a veces traen una "X" suelta. En la plantilla B la columna
    // "Ajuste"/"Ajustar" puede traer directamente el concepto (p. ej. "SAF").
    const codigo = (v: Cell) => {
      const s = text(v);
      return s && /^[A-Z]{2,4}$/.test(s) ? s : null;
    };
    const conceptoSap = codigo(at(row, idx.concepto)) ?? (plantilla === "B" ? codigo(at(row, idx.ajustar)) : null);
    const ajuste =
      plantilla === "A"
        ? text(at(row, idx.ajusteSi)) ? "SI" : text(at(row, idx.ajusteNo)) ? "NO" : null
        : text(at(row, idx.ajustar)) || conceptoSap || text(at(row, idx.doc)) ? "SI" : null;

    return {
      archivo_id: ctx.archivoId,
      bodega: ctx.bodega,
      ubicacion: ctx.ubicacion,
      periodo_inicio: ctx.periodoInicio,
      fecha_conteo: plantilla === "A" ? (excelDate(at(row, idx.fecha)) ?? fechaPorMarca(row)) : fechaPorDia(row),
      item_code: itemCode,
      descripcion: text(at(row, idx.descripcion)),
      familia: text(at(row, idx.familia)),
      tipo_toc: text(at(row, idx.tipoToc)),
      conteo_definitivo: conteo,
      stock_teorico: teorico,
      costo_unitario: costo == null ? null : redondear(costo),
      sobrante: redondear(sobrante),
      sobrante_valorizado: redondear(sobranteVal),
      faltante: redondear(faltante),
      faltante_valorizado: redondear(faltanteVal),
      ajuste,
      concepto: conceptoSap,
      bodega_excel: text(at(row, idx.bodega)),
      doc_sap: text(at(row, idx.doc)),
      observacion: comentarios(row),
    };
  }

  for (const row of values.slice(headerRow + 1)) {
    if (!row) continue;
    const itemCode = text(at(row, idx.item));
    // Las filas de totales o subtítulos no tienen código con formato de artículo.
    if (itemCode && /^[A-Z0-9]{3,}-/i.test(itemCode)) porItem.set(itemCode, toRow(row, itemCode));
  }
  return { plantilla, filas: Array.from(porItem.values()) };
}
