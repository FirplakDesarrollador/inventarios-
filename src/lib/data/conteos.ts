import type { Bodega } from "@/lib/bodegas";
import { createClient } from "@/lib/supabase/server";

// Los numeric de Postgres llegan como string o number según el driver; se normalizan a number.
const n = (v: unknown) => (v == null ? null : Number(v));

export interface ResumenMes {
  mes: string; // AAAA-MM-01
  articulos: number;
  conDiferencia: number;
  exactitud: number;
  sobranteValorizado: number;
  faltanteValorizado: number;
  ajustesExcel: number;
}

export async function getResumenMensual(bodega: string): Promise<ResumenMes[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.schema("Inventarios").rpc("resumen_mensual", { p_bodega: bodega });
  if (error) throw new Error(`resumen_mensual: ${error.message}`);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    mes: String(r.mes),
    articulos: Number(r.articulos),
    conDiferencia: Number(r.con_diferencia),
    exactitud: Number(r.exactitud),
    sobranteValorizado: Number(r.sobrante_valorizado),
    faltanteValorizado: Number(r.faltante_valorizado),
    ajustesExcel: Number(r.ajustes_excel),
  }));
}

export interface ResumenBodega extends Omit<ResumenMes, "ajustesExcel"> {
  bodega: string;
}

// Último mes con conteos de cada tablero.
export async function getResumenBodegas(): Promise<Map<string, ResumenBodega>> {
  const supabase = await createClient();
  const { data, error } = await supabase.schema("Inventarios").rpc("resumen_bodegas");
  if (error) throw new Error(`resumen_bodegas: ${error.message}`);
  return new Map(
    (data ?? []).map((r: Record<string, unknown>) => [
      String(r.bodega),
      {
        bodega: String(r.bodega),
        mes: String(r.mes),
        articulos: Number(r.articulos),
        conDiferencia: Number(r.con_diferencia),
        exactitud: Number(r.exactitud),
        sobranteValorizado: Number(r.sobrante_valorizado),
        faltanteValorizado: Number(r.faltante_valorizado),
      },
    ]),
  );
}

export interface FilaComparativo {
  itemCode: string;
  descripcion: string;
  diferencia: number | null;
  diferenciaValorizada: number | null;
  cantidadSap: number | null;
  valorSap: number | null;
  variacionCantidad: number;
  variacionCosto: number;
  variacionPct: number | null;
  origen: "ambos" | "solo_excel" | "solo_sap";
  observacion: string | null;
  documentosSap: string | null; // "SAI 101330, EAI 38803"
  documentoExcel: string | null; // #DOC anotado en el Excel
}

export async function getComparativoAjustes(
  bodega: Pick<Bodega, "codigo" | "bodegasSap" | "conceptosAjuste">,
  desde: string,
  hasta: string,
): Promise<FilaComparativo[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.schema("Inventarios").rpc("comparativo_ajustes", {
    p_bodega: bodega.codigo,
    p_bodegas_sap: bodega.bodegasSap,
    p_conceptos: bodega.conceptosAjuste,
    p_desde: desde,
    p_hasta: hasta,
  });
  if (error) throw new Error(`comparativo_ajustes: ${error.message}`);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    itemCode: String(r.item_code),
    descripcion: String(r.descripcion ?? ""),
    diferencia: n(r.diferencia),
    diferenciaValorizada: n(r.diferencia_valorizada),
    cantidadSap: n(r.cantidad_sap),
    valorSap: n(r.valor_sap),
    variacionCantidad: Number(r.variacion_cantidad),
    variacionCosto: Number(r.variacion_costo),
    variacionPct: n(r.variacion_pct),
    origen: r.origen as FilaComparativo["origen"],
    observacion: (r.observacion as string | null) ?? null,
    documentosSap: (r.documentos_sap as string | null) ?? null,
    documentoExcel: (r.documento_excel as string | null) ?? null,
  }));
}

export interface FilaDiferencia {
  itemCode: string;
  descripcion: string;
  fechaConteo: string;
  conteo: number | null;
  teorico: number | null;
  cantidad: number;
  valorizado: number;
  observacion: string | null;
}

// Sobrantes y faltantes del conteo que NO se marcaron para ajuste (página "No Ajustes" de Power BI),
// y los artículos sin diferencia que tienen comentario.
export async function getDiferenciasSinAjuste(bodega: string, desde: string, hasta: string) {
  const supabase = await createClient();
  const filas: Record<string, unknown>[] = [];
  const PAGE = 1000; // límite de filas por respuesta de la API de Supabase

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .schema("Inventarios")
      .from("conteos_vigentes")
      .select("item_code, descripcion, fecha_conteo, conteo_definitivo, stock_teorico, sobrante, sobrante_valorizado, faltante, faltante_valorizado, observacion")
      .eq("bodega", bodega)
      .gte("fecha_conteo", desde)
      .lte("fecha_conteo", hasta)
      .or("ajuste.is.null,ajuste.neq.SI")
      .or("sobrante.neq.0,faltante.neq.0,observacion.not.is.null")
      .order("descripcion")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`conteos_vigentes: ${error.message}`);
    filas.push(...data);
    if (data.length < PAGE) break;
  }

  const base = (r: Record<string, unknown>) => ({
    itemCode: String(r.item_code),
    descripcion: String(r.descripcion ?? ""),
    fechaConteo: String(r.fecha_conteo),
    conteo: n(r.conteo_definitivo),
    teorico: n(r.stock_teorico),
    observacion: (r.observacion as string | null) ?? null,
  });

  const sobrantes: FilaDiferencia[] = filas
    .filter((r) => Number(r.sobrante) !== 0)
    .map((r) => ({ ...base(r), cantidad: Number(r.sobrante), valorizado: Number(r.sobrante_valorizado) }));
  const faltantes: FilaDiferencia[] = filas
    .filter((r) => Number(r.faltante) !== 0)
    .map((r) => ({ ...base(r), cantidad: Number(r.faltante), valorizado: Number(r.faltante_valorizado) }));
  // Sin diferencia pero con comentario del equipo (p. ej. "Obsoletos", "Defectuosas, pendiente reclamación").
  const comentados: FilaDiferencia[] = filas
    .filter((r) => Number(r.sobrante) === 0 && Number(r.faltante) === 0 && r.observacion)
    .map((r) => ({ ...base(r), cantidad: 0, valorizado: 0 }));

  return { sobrantes, faltantes, comentados };
}

// Artículos contados en el rango (con y sin diferencia), para el indicador de exactitud.
export async function getConteoArticulos(bodega: string, desde: string, hasta: string) {
  const supabase = await createClient();
  const base = () =>
    supabase
      .schema("Inventarios")
      .from("conteos_vigentes")
      .select("item_code", { count: "exact", head: true })
      .eq("bodega", bodega)
      .gte("fecha_conteo", desde)
      .lte("fecha_conteo", hasta);

  const [total, conDiferencia] = await Promise.all([base(), base().or("sobrante.neq.0,faltante.neq.0")]);
  if (total.error) throw new Error(total.error.message);
  if (conDiferencia.error) throw new Error(conDiferencia.error.message);
  return { total: total.count ?? 0, conDiferencia: conDiferencia.count ?? 0 };
}
