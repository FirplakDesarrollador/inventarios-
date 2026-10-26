import { GraficaDevoluciones, type DevolucionesMes } from "@/components/bodega/graficas-seguimiento";
import { Tile } from "@/components/bodega/indicadores";
import { Seccion, Vacio, td, th } from "@/components/bodega/tablas";
import { ANIO, type BodegaSeguimiento } from "@/lib/bodegas";
import {
  ESTADOS_DEVOLUCION,
  claveSalida,
  getDevoluciones,
  getResumenConceptosSap,
  getSalidasPorDevolucion,
  type Devolucion,
  type EstadoDevolucion,
  type SalidaDevolucion,
} from "@/lib/data/seguimiento";
import { fmtNumero, fmtPesos, hoyBogota } from "@/lib/format";

// Color de cada estado tal como lo usa la bitácora, para reconocerlo junto a su nombre.
const COLOR_EXCEL: Record<EstadoDevolucion, string> = {
  solucionada: "#92D050",
  seguimiento: "#FFC000",
  por_facturar: "#0070C0",
  pendiente_pt: "#FFFF00",
  pendiente_repuestos: "#00B0F0",
  sin_clasificar: "transparent",
};

const ABIERTAS: EstadoDevolucion[] = ["seguimiento", "por_facturar", "pendiente_pt", "pendiente_repuestos"];

type Situacion = "abierta" | "solucionada" | "revisar" | "con_salida";

const VISTAS = {
  abiertas: "Abiertas (todas)",
  seguimiento: ESTADOS_DEVOLUCION.seguimiento,
  por_facturar: ESTADOS_DEVOLUCION.por_facturar,
  pendiente_pt: ESTADOS_DEVOLUCION.pendiente_pt,
  pendiente_repuestos: ESTADOS_DEVOLUCION.pendiente_repuestos,
  revisar: "Sin color y sin salida en SAP",
  solucionada: ESTADOS_DEVOLUCION.solucionada,
  con_salida: "Sin color, con salida en SAP",
  todas: "Todas",
} as const;

type Vista = keyof typeof VISTAS;

interface Fila extends Devolucion {
  salida: SalidaDevolucion | null;
  situacion: Situacion;
  dias: number | null;
}

function situacion(d: Devolucion, salida: SalidaDevolucion | null): Situacion {
  if (d.estado === "solucionada") return "solucionada";
  if (d.estado !== "sin_clasificar") return "abierta";
  return salida ? "con_salida" : "revisar";
}

function enVista(f: Fila, vista: Vista) {
  if (vista === "todas") return true;
  if (vista === "abiertas") return f.situacion === "abierta";
  if (vista === "revisar" || vista === "con_salida") return f.situacion === vista;
  return f.estado === vista;
}

function diasDesde(fecha: string | null, hoy: number) {
  return fecha ? Math.floor((hoy - Date.parse(fecha)) / 86_400_000) : null;
}

function fmtFecha(iso: string | null) {
  if (!iso) return "—";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

export async function TableroDevoluciones({
  bodega,
  sp,
}: {
  bodega: BodegaSeguimiento;
  sp: Record<string, string | string[] | undefined>;
}) {
  const desde = `${ANIO}-01-01`;
  const hasta = `${ANIO}-12-31`;
  const [bitacora, salidas, conceptos] = await Promise.all([
    getDevoluciones(bodega.carpetaId),
    getSalidasPorDevolucion(bodega.bodegasSap, desde, hasta),
    getResumenConceptosSap(bodega.bodegasSap, desde, hasta),
  ]);

  const hoy = Date.parse(hoyBogota());
  const filas: Fila[] = bitacora.devoluciones.map((d) => {
    const salida = salidas.get(claveSalida(d.documento, d.itemCode)) ?? null;
    return { ...d, salida, situacion: situacion(d, salida), dias: diasDesde(d.fechaIngreso, hoy) };
  });

  const vista: Vista = typeof sp.vista === "string" && sp.vista in VISTAS ? (sp.vista as Vista) : "abiertas";
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";
  const visibles = filas
    .filter((f) => enVista(f, vista))
    .filter(
      (f) =>
        !q ||
        [f.documento, f.itemCode, f.descripcion, f.comentarios ?? "", f.guia ?? "", f.salida?.documentos ?? ""].some((t) =>
          t.toLowerCase().includes(q),
        ),
    )
    .sort((a, b) =>
      vista === "abiertas" || ABIERTAS.includes(vista as EstadoDevolucion) || vista === "revisar"
        ? (a.fechaIngreso ?? "").localeCompare(b.fechaIngreso ?? "")
        : (b.fechaIngreso ?? "").localeCompare(a.fechaIngreso ?? ""),
    );

  const de = (s: Situacion) => filas.filter((f) => f.situacion === s);
  const abiertas = de("abierta");
  const revisar = de("revisar");
  const unidades = (fs: Fila[]) => fs.reduce((s, f) => s + f.cantidad, 0);
  const masAntigua = Math.max(0, ...abiertas.map((f) => f.dias ?? 0));
  const criticas = abiertas.filter((f) => f.estado === "seguimiento" || f.estado === "por_facturar").length;

  const porMes = new Map<string, DevolucionesMes>();
  for (const f of filas) {
    const mes = f.fechaIngreso?.slice(0, 7);
    if (!mes || !mes.startsWith(String(ANIO))) continue;
    const r = porMes.get(mes) ?? { mes, abiertas: 0, revisar: 0, solucionadas: 0, conSalida: 0 };
    if (f.situacion === "abierta") r.abiertas++;
    else if (f.situacion === "revisar") r.revisar++;
    else if (f.situacion === "solucionada") r.solucionadas++;
    else r.conSalida++;
    porMes.set(mes, r);
  }

  const campo =
    "w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink focus:border-brand focus:ring-2 focus:ring-brand/15 focus:outline-none";
  const etiqueta = "mb-1 block text-xs font-medium text-brand-secondary";

  return (
    <div className="space-y-6">
      <p className="text-sm text-brand-secondary">
        {bitacora.archivo} · hoja <b className="text-brand">{bitacora.hoja}</b> · actualizado{" "}
        {new Date(bitacora.modificado).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota" })}
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          titulo="Abiertas"
          valor={fmtNumero(abiertas.length)}
          detalle={`${fmtNumero(unidades(abiertas))} unidades · la más antigua lleva ${fmtNumero(masAntigua)} días`}
        />
        <Tile titulo="Seguimiento fuerte o por facturar" valor={fmtNumero(criticas)} detalle="Colores naranja y azul oscuro de la bitácora" />
        <Tile
          titulo="Sin color y sin salida en SAP"
          valor={fmtNumero(revisar.length)}
          detalle={`${fmtNumero(unidades(revisar))} unidades sin estado ni salida que cite su DEV`}
        />
        <Tile
          titulo="Cerradas"
          valor={fmtNumero(de("solucionada").length + de("con_salida").length)}
          detalle={`${fmtNumero(de("solucionada").length)} en verde · ${fmtNumero(de("con_salida").length)} con salida en SAP`}
        />
      </div>

      <GraficaDevoluciones porMes={[...porMes.values()].sort((a, b) => a.mes.localeCompare(b.mes))} />

      <form method="get" className="grid gap-3 rounded-2xl border border-line bg-white p-4 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
        <div>
          <label htmlFor="vista" className={etiqueta}>Estado</label>
          <select id="vista" name="vista" defaultValue={vista} className={campo}>
            {Object.entries(VISTAS).map(([v, texto]) => (
              <option key={v} value={v}>{texto}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="q" className={etiqueta}>Buscar</label>
          <input id="q" name="q" type="search" defaultValue={q} placeholder="DEV, código, descripción, guía o comentario" className={campo} />
        </div>
        <button type="submit" className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark">
          Aplicar
        </button>
      </form>

      <Seccion
        id="devoluciones"
        titulo={VISTAS[vista]}
        descripcion={`${fmtNumero(visibles.length)} registros · ${fmtNumero(unidades(visibles))} unidades. La salida en SAP se busca por el número de DEV citado en los comentarios del documento y el artículo.`}
      >
        {visibles.length === 0 ? (
          <Vacio texto="No hay devoluciones con este filtro." />
        ) : (
          <div className="max-h-[36rem] overflow-auto">
            <table className="w-full text-sm text-ink">
              <thead>
                <tr className="text-right">
                  <th className={`${th} text-left`}>DEV / NC</th>
                  <th className={`${th} text-left`}>Ingreso</th>
                  <th className={`${th} text-left`}>Artículo</th>
                  <th className={th}>Cant.</th>
                  <th className={`${th} text-left`}>Estado</th>
                  <th className={`${th} text-left`}>Salida en SAP</th>
                  <th className={`${th} text-left`}>Recogida</th>
                  <th className={`${th} text-left`}>Comentarios</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((f) => (
                  <tr key={f.fila} className="border-b border-line/60 text-right align-top odd:bg-cream/40">
                    <td className={`${td} text-left`}>{f.documento}</td>
                    <td className={`${td} text-left`}>
                      {fmtFecha(f.fechaIngreso)}
                      {f.dias != null && <span className="block text-xs text-brand-secondary">{fmtNumero(f.dias)} días</span>}
                    </td>
                    <td className={`${td} text-left`}>
                      <span className="block max-w-[20rem] truncate" title={f.descripcion}>{f.descripcion}</span>
                      <span className="text-xs text-brand-secondary">{f.itemCode}</span>
                    </td>
                    <td className={td}>{fmtNumero(f.cantidad)}</td>
                    <td className="px-3 py-2 text-left text-xs">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          aria-hidden
                          className="size-3 shrink-0 rounded-sm border border-line"
                          style={{ backgroundColor: COLOR_EXCEL[f.estado] }}
                        />
                        {ESTADOS_DEVOLUCION[f.estado]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-left text-xs tabular-nums">
                      {f.salida ? (
                        <>
                          {f.salida.documentos}
                          <span className="block text-brand-secondary">{fmtFecha(f.salida.ultimaFecha)} · {fmtNumero(f.salida.cantidad)}</span>
                        </>
                      ) : (
                        <span className="text-brand-secondary">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-left text-xs leading-snug">
                      {f.solicitudRecogida && <span className="block">Solicitada: {f.solicitudRecogida}</span>}
                      {f.guia && <span className="block">Guía: {f.guia}</span>}
                      {f.fechaRecogida && <span className="block">Recogida: {f.fechaRecogida}</span>}
                      {!f.solicitudRecogida && !f.guia && !f.fechaRecogida && <span className="text-brand-secondary">—</span>}
                    </td>
                    <td className="min-w-[20rem] px-3 py-2 text-left text-xs leading-snug text-ink/80">
                      <span className="line-clamp-3" title={f.comentarios ?? ""}>{f.comentarios ?? ""}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Seccion>

      <Seccion
        id="sap"
        titulo={`Movimientos de SAP en ${bodega.bodegasSap.join(", ")} durante ${ANIO}`}
        descripcion="Entradas y salidas de mercancía agrupadas por concepto"
      >
        {conceptos.length === 0 ? (
          <Vacio texto="Sin movimientos en SAP." />
        ) : (
          <table className="w-full text-sm text-ink">
            <thead>
              <tr className="text-right">
                <th className={`${th} text-left`}>Concepto</th>
                <th className={th}>Líneas</th>
                <th className={th}>Cantidad</th>
                <th className={th}>Valor</th>
              </tr>
            </thead>
            <tbody>
              {conceptos.map((c) => (
                <tr key={c.concepto} className="border-b border-line/60 text-right odd:bg-cream/40">
                  <td className={`${td} text-left font-medium`}>{c.concepto}</td>
                  <td className={td}>{fmtNumero(c.lineas)}</td>
                  <td className={td}>{fmtNumero(c.cantidad)}</td>
                  <td className={td}>{fmtPesos(c.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Seccion>
    </div>
  );
}
