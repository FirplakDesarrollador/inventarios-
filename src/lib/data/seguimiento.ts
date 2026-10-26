import "server-only";
import { cacheLife } from "next/cache";
import { ANIO, INV_CICLICOS_DRIVE_ID } from "@/lib/bodegas";
import { parsePeriodo } from "@/lib/conteos/parse";
import { downloadWorkbook, listExcelFiles, type Cell } from "@/lib/graph/excel";
import { createClient } from "@/lib/supabase/server";

// Las bitácoras se leen directo de SharePoint y se guardan en caché 15 minutos.
const CACHE = { stale: 300, revalidate: 900, expire: 3600 };

const normalizar = (s: Cell) =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

function texto(v: Cell): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}

const numero = (v: Cell) => (typeof v === "number" && Number.isFinite(v) ? v : null);

// Fecha de Excel (serial, o Date si SheetJS la convirtió) o "dd/mm/aaaa" -> "aaaa-mm-dd".
function fechaIso(v: Cell | Date): string | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  if (typeof v === "number" && v > 1) return new Date(Date.UTC(1899, 11, 30) + v * 86_400_000).toISOString().slice(0, 10);
  const m = String(v ?? "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}

// Para columnas que mezclan fechas, guías y nombres: las fechas se muestran como dd/mm/aaaa.
function textoOFecha(v: Cell | Date): string | null {
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    const [a, m, d] = fechaIso(v)!.split("-");
    return `${d}/${m}/${a}`;
  }
  if (typeof v === "number" && v > 40_000 && v < 60_000) {
    const [a, m, d] = fechaIso(v)!.split("-");
    return `${d}/${m}/${a}`;
  }
  return texto(v);
}

async function archivoDeCarpeta(carpetaId: string) {
  const [archivo] = (await listExcelFiles(INV_CICLICOS_DRIVE_ID, carpetaId)).sort((a, b) =>
    b.lastModifiedDateTime.localeCompare(a.lastModifiedDateTime),
  );
  if (!archivo) throw new Error("La carpeta no tiene archivos de Excel");
  return archivo;
}

function filaEncabezado(values: Cell[][], nombre: string) {
  const i = values.slice(0, 15).findIndex((row) => row?.some((c) => normalizar(c) === nombre));
  if (i < 0) throw new Error(`No se encontró el encabezado "${nombre}"`);
  const header = values[i].map(normalizar);
  return { fila: i, col: (...nombres: string[]) => nombres.map((n) => header.indexOf(n)).find((c) => c >= 0) ?? -1 };
}

// ---------------------------------------------------------------- Devoluciones (PT-04)

// Estados según la guía de colores del archivo (columnas A a D de cada fila).
export const ESTADOS_DEVOLUCION = {
  solucionada: "Solucionada",
  seguimiento: "Seguimiento fuerte",
  por_facturar: "Recogida, pendiente por facturar",
  pendiente_pt: "Pendiente · producto terminado",
  pendiente_repuestos: "Pendiente · repuestos de bañeras",
  sin_clasificar: "Sin color",
} as const;

export type EstadoDevolucion = keyof typeof ESTADOS_DEVOLUCION;

// Un color secundario (seguimiento, por facturar) prevalece sobre el primario, salvo "solucionada".
const COLORES: [string, EstadoDevolucion][] = [
  ["92D050", "solucionada"],
  ["FFC000", "seguimiento"],
  ["0070C0", "por_facturar"],
  ["FFFF00", "pendiente_pt"],
  ["00B0F0", "pendiente_repuestos"],
];

export interface Devolucion {
  fila: number;
  documento: string;
  fechaIngreso: string | null;
  itemCode: string;
  descripcion: string;
  cantidad: number;
  comentarios: string | null;
  solicitudRecogida: string | null;
  guia: string | null;
  fechaRecogida: string | null;
  costo: number | null;
  estado: EstadoDevolucion;
}

export async function getDevoluciones(carpetaId: string) {
  "use cache";
  cacheLife(CACHE);

  const archivo = await archivoDeCarpeta(carpetaId);
  const libro = await downloadWorkbook(INV_CICLICOS_DRIVE_ID, archivo.id, { estilos: true });
  // El libro es de 2025 y trae una hoja por año: "PT-04 2026".
  const hoja = libro.hojas.find((h) => new RegExp(`^PT-04\\s+${ANIO}$`, "i").test(h.trim()));
  if (!hoja) throw new Error(`El archivo ${archivo.name} no tiene la hoja PT-04 ${ANIO}`);

  const values = libro.leer(hoja);
  const { fila: encabezado, col } = filaEncabezado(values, "codigo");
  const c = {
    documento: col("dev/nc"),
    fecha: col("fecha ingreso"),
    item: col("codigo"),
    descripcion: col("descripcion"),
    cantidad: col("cantidad"),
    comentarios: col("comentarios"),
    solicitud: col("sol. recogida"),
    guia: col("r. programada(guia)"),
    recogida: col("fecha de recogida"),
    costo: col("costo del articulo"),
  };

  const devoluciones: Devolucion[] = [];
  values.forEach((row, i) => {
    if (i <= encabezado || !row) return;
    const itemCode = texto(row[c.item]);
    if (!itemCode) return;
    const colores = new Set([0, 1, 2, 3].map((col) => libro.relleno(hoja, i, col)));
    devoluciones.push({
      fila: i + 1,
      documento: texto(row[c.documento]) ?? "",
      fechaIngreso: fechaIso(row[c.fecha]),
      itemCode,
      descripcion: texto(row[c.descripcion]) ?? "",
      cantidad: numero(row[c.cantidad]) ?? (Number(row[c.cantidad]) || 0),
      comentarios: texto(row[c.comentarios]),
      solicitudRecogida: textoOFecha(row[c.solicitud]),
      guia: textoOFecha(row[c.guia]),
      fechaRecogida: textoOFecha(row[c.recogida]),
      costo: numero(row[c.costo]),
      estado: COLORES.find(([rgb]) => colores.has(rgb))?.[1] ?? "sin_clasificar",
    });
  });

  return { archivo: archivo.name, hoja, modificado: archivo.lastModifiedDateTime, devoluciones };
}

// ---------------------------------------------------------------- Cortes de stock (PT-07)

// Fecha de una hoja nombrada por mes y día: "Agosto 31", "Sept 16", "Octubre 2" -> "2026-08-31".
function fechaDeHoja(nombre: string, anio: number) {
  const periodo = parsePeriodo(nombre, anio);
  const dia = Number(nombre.match(/\b(\d{1,2})\b/)?.[1]);
  return periodo && dia >= 1 && dia <= 31 ? `${periodo.periodoInicio.slice(0, 8)}${String(dia).padStart(2, "0")}` : null;
}

export interface ArticuloCorte {
  itemCode: string;
  descripcion: string;
  cantidad: number;
  valor: number;
}

export interface CorteStock {
  hoja: string;
  fecha: string;
  articulos: ArticuloCorte[];
}

export async function getCortesStock(carpetaId: string) {
  "use cache";
  cacheLife(CACHE);

  const archivo = await archivoDeCarpeta(carpetaId);
  const libro = await downloadWorkbook(INV_CICLICOS_DRIVE_ID, archivo.id);
  const cortes: CorteStock[] = [];
  for (const hoja of libro.hojas) {
    const fecha = fechaDeHoja(hoja, ANIO);
    if (!fecha || libro.ocultas.has(hoja)) continue;
    const values = libro.leer(hoja);
    const { fila: encabezado, col } = filaEncabezado(values, "numero de articulo");
    const c = {
      item: col("numero de articulo"),
      descripcion: col("descripcion"),
      cantidad: col("cantidad acumulada"),
      valor: col("valor acumulado"),
    };
    const articulos = values
      .slice(encabezado + 1)
      .filter((row) => row && /^[A-Z0-9]{3,}-/i.test(texto(row[c.item]) ?? ""))
      .map((row) => ({
        itemCode: texto(row[c.item])!,
        descripcion: texto(row[c.descripcion]) ?? "",
        cantidad: numero(row[c.cantidad]) ?? 0,
        valor: numero(row[c.valor]) ?? 0,
      }));
    cortes.push({ hoja, fecha, articulos });
  }
  cortes.sort((a, b) => a.fecha.localeCompare(b.fecha));
  return { archivo: archivo.name, modificado: archivo.lastModifiedDateTime, cortes };
}

// ---------------------------------------------------------------- Movimientos de SAP

export interface MovimientoSap {
  fecha: string;
  documento: string; // concepto + DocNum
  concepto: string | null;
  itemCode: string;
  descripcion: string;
  cantidad: number;
  valor: number;
  comentarios: string | null;
}

export async function getMovimientosSap(bodegas: string[], desde: string, hasta: string): Promise<MovimientoSap[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("Inventarios")
    .from("movimientos_mercancia")
    .select("fecha, doc_num, concepto, item_code, descripcion, cantidad, total_linea, comentarios")
    .in("bodega", bodegas)
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha", { ascending: false })
    .limit(1000);
  if (error) throw new Error(`movimientos_mercancia: ${error.message}`);
  return (data ?? []).map((r) => ({
    fecha: String(r.fecha),
    documento: [r.concepto, r.doc_num].filter(Boolean).join(" "),
    concepto: r.concepto as string | null,
    itemCode: String(r.item_code),
    descripcion: String(r.descripcion ?? ""),
    cantidad: Number(r.cantidad),
    valor: Number(r.total_linea ?? 0),
    comentarios: (r.comentarios as string | null) ?? null,
  }));
}

// Salidas de SAP que citan una devolución ("DEV 6133"), por devolución + artículo.
export interface SalidaDevolucion {
  documentos: string;
  cantidad: number;
  valor: number;
  ultimaFecha: string;
}

export const claveSalida = (devolucion: string, itemCode: string) => `${devolucion.replace(/\D/g, "")}|${itemCode}`;

export async function getSalidasPorDevolucion(bodegas: string[], desde: string, hasta: string) {
  const supabase = await createClient();
  const salidas = new Map<string, SalidaDevolucion>();
  // PostgREST devuelve máximo 1000 filas por consulta: se pagina.
  for (let desdeFila = 0; ; desdeFila += 1000) {
    const { data, error } = await supabase
      .schema("Inventarios")
      .rpc("salidas_por_devolucion", { p_bodegas: bodegas, p_desde: desde, p_hasta: hasta })
      .order("devolucion")
      .order("item_code")
      .range(desdeFila, desdeFila + 999);
    if (error) throw new Error(`salidas_por_devolucion: ${error.message}`);
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      salidas.set(claveSalida(String(r.devolucion), String(r.item_code)), {
        documentos: String(r.documentos),
        cantidad: Number(r.cantidad),
        valor: Number(r.valor),
        ultimaFecha: String(r.ultima_fecha),
      });
    }
    if (!data || data.length < 1000) break;
  }
  return salidas;
}

// Movimientos del año agrupados por concepto (PT-04 tiene miles de líneas).
export interface ResumenConcepto {
  concepto: string;
  lineas: number;
  cantidad: number;
  valor: number;
}

export async function getResumenConceptosSap(bodegas: string[], desde: string, hasta: string): Promise<ResumenConcepto[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("Inventarios")
    .rpc("resumen_conceptos", { p_bodegas: bodegas, p_desde: desde, p_hasta: hasta });
  if (error) throw new Error(`resumen_conceptos: ${error.message}`);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    concepto: String(r.concepto ?? "—"),
    lineas: Number(r.lineas),
    cantidad: Number(r.cantidad),
    valor: Number(r.valor),
  }));
}
