import { NextResponse } from "next/server";
import { BODEGAS, INV_CICLICOS_DRIVE_ID, getBodega, type Bodega } from "@/lib/bodegas";
import { detectarPlantilla, parseHojaConteo, parsePeriodo, periodoPorFechas } from "@/lib/conteos/parse";
import { downloadWorkbook, listExcelFiles, type Cell, type DriveFile } from "@/lib/graph/excel";
import { createAdminClient } from "@/lib/supabase/server";

const BATCH_SIZE = 1000;
// Subir este número cuando cambie la forma de leer los Excel (lib/conteos/parse.ts): los archivos leídos
// con una versión anterior se vuelven a sincronizar aunque no hayan cambiado en SharePoint.
const VERSION_LECTOR = 2; // 2: une todas las columnas de comentarios
// Margen antes del límite de la función: lo que no alcance se sincroniza en la siguiente ejecución.
const PRESUPUESTO_MS = 240_000;

export const maxDuration = 300;

type Db = ReturnType<ReturnType<typeof createAdminClient>["schema"]>;
type Resultado = { bodega: string; archivo: string; estado: string; hoja?: string; plantilla?: string; filas?: number };

interface Unidad {
  archivoId: string; // id del archivo en SharePoint, más "#<hoja>" en los libros anuales
  nombre: string;
  hoja: string;
  values: Cell[][];
}

// Hojas de conteo a sincronizar de un libro descargado.
function elegirHojas(bodega: Bodega, archivo: DriveFile, libro: Awaited<ReturnType<typeof downloadWorkbook>>): Unidad[] {
  if (bodega.fuente === "libro-anual") {
    return libro.hojas
      .filter((h) => bodega.hojaMensual.test(h.trim()))
      .map((hoja) => ({ archivoId: `${archivo.id}#${hoja}`, nombre: hoja, hoja, values: libro.leer(hoja) }));
  }

  // Un archivo = una unidad: la hoja de conteo (la preferida si existe; si no, plantilla A antes que B).
  // Con todasLasHojas, cada hoja de conteo es una unidad.
  const candidatas = libro.hojas
    .filter((hoja) => !libro.ocultas.has(hoja))
    .map((hoja) => {
      const values = libro.leer(hoja);
      return { hoja, values, det: detectarPlantilla(values) };
    })
    .filter((c) => c.det !== null)
    .sort((a, b) => {
      const pref = (c: typeof a) => (bodega.hojaPreferida?.test(c.hoja.trim()) ? 0 : 1);
      const ajuste = (c: typeof a) => (c.det!.anotaAjuste ? 0 : 1);
      return pref(a) - pref(b) || a.det!.plantilla.localeCompare(b.det!.plantilla) || ajuste(a) - ajuste(b);
    });
  if (bodega.todasLasHojas) {
    return candidatas.map((c) => ({ archivoId: `${archivo.id}#${c.hoja}`, nombre: archivo.path, hoja: c.hoja, values: c.values }));
  }
  const elegida = candidatas[0];
  return elegida ? [{ archivoId: archivo.id, nombre: archivo.path, hoja: elegida.hoja, values: elegida.values }] : [];
}

async function listarArchivos(bodega: Bodega): Promise<DriveFile[]> {
  const carpetas = bodega.fuente === "carpeta" ? bodega.carpetas : [{ id: bodega.carpetaId, profundidad: 0 }];
  const archivos: DriveFile[] = [];
  for (const carpeta of carpetas) {
    const encontrados = await listExcelFiles(INV_CICLICOS_DRIVE_ID, carpeta.id, carpeta.profundidad);
    archivos.push(...encontrados.filter((a) => (!carpeta.incluir || carpeta.incluir.test(a.path)) && !bodega.excluir?.test(a.path)));
  }
  return archivos;
}

async function reemplazarUnidad(db: Db, bodega: Bodega, archivo: DriveFile, unidad: Unidad, dry: boolean): Promise<Resultado> {
  const base = { bodega: bodega.codigo, archivo: unidad.nombre, hoja: unidad.hoja };
  // El mes sale del nombre de la hoja (libro anual) o de la ruta del archivo (carpeta del mes / nombre);
  // si no lo dicen, del mes con más fechas de conteo de la hoja.
  const ctx = {
    archivoId: unidad.archivoId,
    bodega: bodega.codigo,
    ubicacion: bodega.ubicacion?.(archivo.path) ?? "",
  };
  let periodo = parsePeriodo(bodega.fuente === "libro-anual" ? unidad.hoja : archivo.path, bodega.anio);

  let parsed;
  try {
    parsed = parseHojaConteo(unidad.values, { ...ctx, periodoInicio: periodo?.periodoInicio ?? `${bodega.anio}-01-01` });
    if (!periodo) {
      periodo = periodoPorFechas(parsed.filas.map((f) => f.fecha_conteo));
      if (!periodo) return { ...base, estado: "omitido: no se reconoce el mes (ni en el nombre ni en las fechas)" };
      parsed = parseHojaConteo(unidad.values, { ...ctx, periodoInicio: periodo.periodoInicio });
    }
  } catch (error) {
    return { ...base, estado: `error leyendo: ${error instanceof Error ? error.message : String(error)}` };
  }
  const { plantilla, filas } = parsed;
  if (dry) return { ...base, estado: `dry: ${periodo.periodo}`, plantilla, filas: filas.length };

  // Borrar el registro elimina sus filas en cascada.
  const { error: delError } = await db.from("archivos_conteo").delete().eq("archivo_id", unidad.archivoId);
  if (delError) throw new Error(delError.message);

  const { error: insError } = await db.from("archivos_conteo").insert({
    archivo_id: unidad.archivoId,
    bodega: bodega.codigo,
    nombre: unidad.hoja === unidad.nombre ? unidad.nombre : `${unidad.nombre} › ${unidad.hoja}`,
    periodo: periodo.periodo,
    periodo_inicio: periodo.periodoInicio,
    modificado_en: archivo.lastModifiedDateTime,
    filas: filas.length,
    version_lector: VERSION_LECTOR,
  });
  if (insError) throw new Error(insError.message);

  for (let i = 0; i < filas.length; i += BATCH_SIZE) {
    const { error } = await db.from("conteos_ciclicos").insert(filas.slice(i, i + BATCH_SIZE));
    if (error) throw new Error(`${unidad.nombre}: ${error.message}`);
  }

  console.log(`[sync-conteos] ${bodega.codigo} ${unidad.nombre} [${unidad.hoja}]: ${filas.length} filas`);
  return { ...base, estado: "sincronizado", plantilla, filas: filas.length };
}

async function sincronizarBodega(db: Db, bodega: Bodega, opts: { forzar: boolean; dry: boolean; limite: number }) {
  const resultados: Resultado[] = [];
  const archivos = await listarArchivos(bodega);

  const { data: previos, error } = await db
    .from("archivos_conteo")
    .select("archivo_id, modificado_en, version_lector")
    .eq("bodega", bodega.codigo);
  if (error) throw new Error(error.message);

  const archivoDe = (archivoId: string) => archivoId.split("#")[0];
  const borrar = async (ids: string[]) => {
    if (!ids.length || opts.dry) return;
    const { error: delError } = await db.from("archivos_conteo").delete().in("archivo_id", ids);
    if (delError) throw new Error(delError.message);
  };

  // Archivos borrados de SharePoint: se eliminan con sus filas.
  const vigentes = new Set(archivos.map((a) => a.id));
  await borrar(previos.filter((p) => !vigentes.has(archivoDe(p.archivo_id))).map((p) => p.archivo_id));

  let pendientes = 0;
  for (const archivo of archivos) {
    const modificado = new Date(archivo.lastModifiedDateTime).getTime();
    const previosDelArchivo = previos.filter((p) => archivoDe(p.archivo_id) === archivo.id);
    const sinCambios =
      previosDelArchivo.length > 0 &&
      previosDelArchivo.every(
        (p) => new Date(p.modificado_en).getTime() === modificado && p.version_lector === VERSION_LECTOR,
      );
    if (!opts.forzar && !opts.dry && sinCambios) continue;
    if (Date.now() > opts.limite) {
      pendientes++;
      continue;
    }

    let unidades: Unidad[];
    try {
      unidades = elegirHojas(bodega, archivo, await downloadWorkbook(INV_CICLICOS_DRIVE_ID, archivo.id));
    } catch (e) {
      resultados.push({ bodega: bodega.codigo, archivo: archivo.path, estado: `error descargando: ${e instanceof Error ? e.message : String(e)}` });
      continue;
    }

    // Hojas que ya no existen en el libro (o archivo que dejó de tener hoja de conteo).
    const ids = new Set(unidades.map((u) => u.archivoId));
    await borrar(previosDelArchivo.filter((p) => !ids.has(p.archivo_id)).map((p) => p.archivo_id));
    if (unidades.length === 0) {
      resultados.push({ bodega: bodega.codigo, archivo: archivo.path, estado: "omitido: sin hoja de conteo" });
      continue;
    }

    for (const unidad of unidades) {
      resultados.push(await reemplazarUnidad(db, bodega, archivo, unidad, opts.dry));
    }
  }

  if (pendientes) {
    resultados.push({ bodega: bodega.codigo, archivo: `${pendientes} archivos`, estado: "pendiente: se sincronizan en la siguiente ejecución" });
  }
  return resultados;
}

// Sincroniza los conteos cíclicos de los Excel de SharePoint a "Inventarios".conteos_ciclicos.
// Solo relee los archivos modificados desde la última sincronización.
// Parámetros opcionales: ?bodega=MP-01 (por defecto todas), ?forzar=1 (relee todo) y ?dry=1 (no escribe).
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  const { searchParams } = new URL(request.url);
  const forzar = searchParams.get("forzar") === "1";
  const dry = searchParams.get("dry") === "1";
  const codigo = searchParams.get("bodega");
  const bodegas = codigo ? [getBodega(codigo)].filter((b) => b !== undefined) : BODEGAS;
  if (bodegas.length === 0) {
    return NextResponse.json({ error: `Bodega no configurada: ${codigo}` }, { status: 400 });
  }

  const db = createAdminClient().schema("Inventarios");
  const resultados: Resultado[] = [];

  try {
    for (const bodega of bodegas) {
      resultados.push(...(await sincronizarBodega(db, bodega, { forzar, dry, limite: startTime + PRESUPUESTO_MS })));
    }

    const conError = resultados.filter((r) => r.estado.startsWith("error"));
    const result = {
      success: conError.length === 0,
      archivos: resultados,
      elapsed_seconds: ((Date.now() - startTime) / 1000).toFixed(1),
    };
    console.log("[sync-conteos] Completado:", JSON.stringify({ ...result, archivos: resultados.length }));
    return NextResponse.json(result, { status: conError.length ? 500 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[sync-conteos] Error:", message);
    return NextResponse.json({ success: false, error: message, archivos: resultados }, { status: 500 });
  }
}
