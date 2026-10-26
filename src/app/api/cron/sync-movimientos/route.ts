import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { fetchApiSap } from "@/lib/sap/api";

const BATCH_SIZE = 1000;
// Cloudflare corta a los 100 s; un mes de movimientos tarda ~15 s en la API de SAP.
const MAX_DIAS_POR_LLAMADA = 31;
// Por defecto se re-sincronizan los últimos días para recoger documentos contabilizados con fecha atrasada.
const DIAS_POR_DEFECTO = 7;

export const maxDuration = 300;

type MovimientoSap = {
  tipo: "E" | "S";
  DocEntry: number;
  LineNum: number;
  DocNum: number;
  lista_precios: string | null;
  usuario: string | null;
  fecha: string;
  referencia: string | null;
  comentarios: string | null;
  ItemCode: string;
  Dscription: string | null;
  cantidad: string | number;
  unidad: string | null;
  WhsCode: string;
  precio_inventario: string | number | null;
  total_linea: string | number | null;
  concepto: string | null;
  centro_costos: string | null;
  concepto_consolidado: string | null;
};

const COLUMNAS_REQUERIDAS = ["tipo", "DocEntry", "LineNum", "fecha", "ItemCode", "WhsCode", "cantidad"];

function toIsoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addDays(isoDate: string, days: number) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toIsoDate(d);
}

// Parte [desde, hasta] en tramos de máximo MAX_DIAS_POR_LLAMADA días.
function tramos(desde: string, hasta: string) {
  const result: { desde: string; hasta: string }[] = [];
  for (let inicio = desde; inicio <= hasta; inicio = addDays(inicio, MAX_DIAS_POR_LLAMADA)) {
    const fin = addDays(inicio, MAX_DIAS_POR_LLAMADA - 1);
    result.push({ desde: inicio, hasta: fin < hasta ? fin : hasta });
  }
  return result;
}

function mapRow(r: MovimientoSap) {
  return {
    tipo: r.tipo,
    doc_entry: r.DocEntry,
    line_num: r.LineNum,
    doc_num: r.DocNum,
    fecha: String(r.fecha).slice(0, 10),
    bodega: r.WhsCode.trim(),
    item_code: r.ItemCode.trim(),
    descripcion: r.Dscription,
    cantidad: r.cantidad,
    unidad: r.unidad,
    precio_inventario: r.precio_inventario,
    total_linea: r.total_linea,
    concepto: r.concepto,
    concepto_consolidado: r.concepto_consolidado,
    centro_costos: r.centro_costos,
    lista_precios: r.lista_precios,
    usuario: r.usuario,
    referencia: r.referencia,
    comentarios: r.comentarios,
    sincronizado_en: new Date().toISOString(),
  };
}

// Sincroniza entradas/salidas de mercancía de SAP a "Inventarios".movimientos_mercancia.
// Parámetros opcionales: ?desde=AAAA-MM-DD&hasta=AAAA-MM-DD (por defecto, los últimos 7 días) y ?dry=1.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  const { searchParams } = new URL(request.url);
  const hoy = toIsoDate(new Date());
  const hasta = searchParams.get("hasta") ?? hoy;
  const desde = searchParams.get("desde") ?? addDays(hasta, -(DIAS_POR_DEFECTO - 1));
  const dry = searchParams.get("dry") === "1";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta) || desde > hasta) {
    return NextResponse.json({ error: "Rango de fechas inválido (AAAA-MM-DD, desde <= hasta)" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const detalle: { desde: string; hasta: string; recibidas: number; upserted: number }[] = [];
  const errores: string[] = [];

  try {
    for (const tramo of tramos(desde, hasta)) {
      const rows = await fetchApiSap<MovimientoSap>(
        `/inventarios/?desde=${tramo.desde}&hasta=${tramo.hasta}`,
      );

      // Si el endpoint cambia de columnas, abortar en vez de escribir basura.
      const faltantes = rows.length ? COLUMNAS_REQUERIDAS.filter((c) => !(c in rows[0])) : [];
      if (faltantes.length) {
        throw new Error(`/inventarios/ no trae las columnas: ${faltantes.join(", ")}`);
      }

      const movimientos = rows.map(mapRow);
      let upserted = 0;

      if (!dry) {
        for (let i = 0; i < movimientos.length; i += BATCH_SIZE) {
          const batch = movimientos.slice(i, i + BATCH_SIZE);
          const { error } = await supabase
            .schema("Inventarios")
            .from("movimientos_mercancia")
            .upsert(batch, { onConflict: "tipo,doc_entry,line_num" });
          if (error) {
            console.error(`[sync-movimientos] Error en upsert ${tramo.desde} (batch ${i}):`, error.message);
            errores.push(error.message);
          } else {
            upserted += batch.length;
          }
        }
      }

      detalle.push({ ...tramo, recibidas: rows.length, upserted });
      console.log(`[sync-movimientos] ${tramo.desde} a ${tramo.hasta}: ${rows.length} recibidas, ${upserted} upserted`);
    }

    const result = {
      success: errores.length === 0,
      desde,
      hasta,
      dry,
      recibidas: detalle.reduce((s, d) => s + d.recibidas, 0),
      upserted: detalle.reduce((s, d) => s + d.upserted, 0),
      tramos: detalle,
      errores: errores.slice(0, 5),
      elapsed_seconds: ((Date.now() - startTime) / 1000).toFixed(1),
    };
    console.log("[sync-movimientos] Completado:", JSON.stringify(result));

    return NextResponse.json(result, { status: errores.length ? 500 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[sync-movimientos] Error:", message);
    return NextResponse.json({ success: false, error: message, tramos: detalle }, { status: 500 });
  }
}
