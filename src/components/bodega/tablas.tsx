import type { FilaComparativo, FilaDiferencia } from "@/lib/data/conteos";
import { fmtNumero, fmtPct, fmtPesosDec } from "@/lib/format";

// Variación de costo a partir de la cual se resalta la celda (Power BI marca el 16 % y no el -8 %).
const UMBRAL_VARIACION = 0.1;

export const th = "sticky top-0 z-10 bg-white px-3 py-2 text-xs font-medium whitespace-nowrap text-brand-secondary border-b border-line";
export const td = "px-3 py-2 whitespace-nowrap tabular-nums";

export function Seccion({ id, titulo, descripcion, children }: { id: string; titulo: string; descripcion: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-4 rounded-2xl border border-line bg-white">
      <header className="border-b border-line px-5 py-4">
        <h2 className="text-sm font-semibold text-brand">{titulo}</h2>
        <p className="mt-0.5 text-xs text-brand-secondary">{descripcion}</p>
      </header>
      {children}
    </section>
  );
}

export function Vacio({ texto }: { texto: string }) {
  return <p className="px-5 py-8 text-center text-sm text-brand-secondary">{texto}</p>;
}

export function TablaAjustes({
  filas,
  bodegasSap,
  conceptos,
}: {
  filas: FilaComparativo[];
  bodegasSap: string[];
  conceptos: string[];
}) {
  const conExcel = filas.filter((f) => f.origen !== "solo_sap");
  const soloSap = filas.filter((f) => f.origen === "solo_sap");
  const suma = (k: keyof FilaComparativo, rows = conExcel) => rows.reduce((s, f) => s + (Number(f[k]) || 0), 0);
  const totalValorSap = suma("valorSap");
  const totalVariacion = suma("variacionCosto");

  return (
    <Seccion
      id="ajustes"
      titulo="Ajustes del conteo vs ajustes en SAP"
      descripcion={`Artículos marcados para ajuste en el Excel frente a los ajustes registrados en SAP (${bodegasSap.join(", ")}) en el mismo rango, con los conceptos ${conceptos.join(", ")} y los que anote el Excel.`}
    >
      {conExcel.length === 0 ? (
        <Vacio texto="No hay artículos marcados para ajuste en este rango." />
      ) : (
        <div className="max-h-[28rem] overflow-auto">
          <table className="w-full text-sm text-ink">
            <thead>
              <tr className="text-right">
                <th className={`${th} text-left`}>Artículo</th>
                <th className={th}>Diferencia</th>
                <th className={th}>Diferencia valorizada</th>
                <th className={th}>Cantidad ajustada SAP</th>
                <th className={th}>Valor ajustado SAP</th>
                <th className={`${th} text-left`}>Documento</th>
                <th className={th}>Variación cantidad</th>
                <th className={th}>Variación costo</th>
                <th className={th}>Variación %</th>
                <th className={`${th} text-left`}>Comentarios</th>
              </tr>
            </thead>
            <tbody>
              {conExcel.map((f) => {
                const alerta = f.origen === "solo_excel" || (f.variacionPct != null && Math.abs(f.variacionPct) >= UMBRAL_VARIACION) || f.variacionCantidad !== 0;
                return (
                  <tr key={f.itemCode} className="border-b border-line/60 text-right odd:bg-cream/40">
                    <td className={`${td} text-left`}>
                      <span className="block max-w-[26rem] truncate" title={f.descripcion}>{f.descripcion}</span>
                      <span className="text-xs text-brand-secondary">{f.itemCode}</span>
                    </td>
                    <td className={td}>{fmtNumero(f.diferencia)}</td>
                    <td className={td}>{fmtPesosDec(f.diferenciaValorizada)}</td>
                    <td className={td}>{f.origen === "solo_excel" ? <span className="text-brand-secondary">Sin ajuste</span> : fmtNumero(f.cantidadSap)}</td>
                    <td className={td}>{fmtPesosDec(f.valorSap)}</td>
                    <Documento fila={f} />
                    <td className={td}>{fmtNumero(f.variacionCantidad)}</td>
                    <td className={td}>{fmtPesosDec(f.variacionCosto)}</td>
                    <td className={`${td} ${alerta ? "bg-red-50 font-semibold text-red-700" : ""}`}>
                      {alerta && <span aria-label="Revisar">⚠ </span>}
                      {f.origen === "solo_excel" ? "Pendiente" : fmtPct(f.variacionPct)}
                    </td>
                    <Comentario texto={f.observacion} />
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="sticky bottom-0 bg-white text-right font-semibold">
                <td className={`${td} text-left`}>Total</td>
                <td className={td}>{fmtNumero(suma("diferencia"))}</td>
                <td className={td}>{fmtPesosDec(suma("diferenciaValorizada"))}</td>
                <td className={td}>{fmtNumero(suma("cantidadSap"))}</td>
                <td className={td}>{fmtPesosDec(totalValorSap)}</td>
                <td />
                <td className={td}>{fmtNumero(suma("variacionCantidad"))}</td>
                <td className={td}>{fmtPesosDec(totalVariacion)}</td>
                <td className={td}>{totalValorSap ? fmtPct(totalVariacion / totalValorSap) : "—"}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {soloSap.length > 0 && (
        <div className="border-t border-line bg-cream/40 px-5 py-4">
          <p className="text-sm font-semibold text-brand">
            ⚠ {soloSap.length} {soloSap.length === 1 ? "ajuste" : "ajustes"} en SAP sin registro AJUSTE SI en el Excel
          </p>
          <ul className="mt-2 space-y-1 text-sm text-ink">
            {soloSap.map((f) => (
              <li key={f.itemCode} className="flex flex-wrap justify-between gap-x-4 tabular-nums">
                <span>{f.descripcion} <span className="text-xs text-brand-secondary">{f.itemCode}</span></span>
                <span>
                  {f.documentosSap && <span className="mr-3 text-xs text-brand-secondary">{f.documentosSap}</span>}
                  {fmtNumero(f.cantidadSap)} · {fmtPesosDec(f.valorSap)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Seccion>
  );
}

// Documentos de SAP (concepto + número). Si SAP no tiene ajuste, el #DOC que anotó el Excel, si lo hay.
function Documento({ fila }: { fila: FilaComparativo }) {
  return (
    <td className="px-3 py-2 text-left text-xs leading-snug tabular-nums">
      {fila.documentosSap ?? (fila.documentoExcel ? <span className="text-brand-secondary">Excel: {fila.documentoExcel}</span> : "—")}
    </td>
  );
}

function Comentario({ texto }: { texto: string | null }) {
  return <td className="min-w-[16rem] px-3 py-2 text-left text-xs leading-snug text-ink/80">{texto ?? ""}</td>;
}

export function TablaDiferencias({
  id,
  titulo,
  filas,
  etiqueta,
}: {
  id: string;
  titulo: string;
  filas: FilaDiferencia[];
  etiqueta: string;
}) {
  const totalCantidad = filas.reduce((s, f) => s + f.cantidad, 0);
  const totalValor = filas.reduce((s, f) => s + f.valorizado, 0);
  const conComentario = filas.filter((f) => f.observacion).length;

  return (
    <Seccion
      id={id}
      titulo={titulo}
      descripcion={`${fmtNumero(filas.length)} artículos sin marca de ajuste en el Excel · ${fmtNumero(conComentario)} con comentario`}
    >
      {filas.length === 0 ? (
        <Vacio texto="Sin diferencias en este rango." />
      ) : (
        <div className="max-h-[28rem] overflow-auto">
          <table className="w-full text-sm text-ink">
            <thead>
              <tr className="text-right">
                <th className={`${th} text-left`}>Artículo</th>
                <th className={th}>Conteo</th>
                <th className={th}>Teórico</th>
                <th className={th}>{etiqueta}</th>
                <th className={th}>Valorizado</th>
                <th className={`${th} text-left`}>Comentarios</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.itemCode + f.fechaConteo} className="border-b border-line/60 text-right odd:bg-cream/40">
                  <td className={`${td} text-left`}>
                    <span className="block max-w-[22rem] truncate" title={f.descripcion}>{f.descripcion}</span>
                    <span className="text-xs text-brand-secondary">{f.itemCode} · {f.fechaConteo}</span>
                  </td>
                  <td className={td}>{fmtNumero(f.conteo)}</td>
                  <td className={td}>{fmtNumero(f.teorico)}</td>
                  <td className={td}>{fmtNumero(f.cantidad)}</td>
                  <td className={td}>{fmtPesosDec(f.valorizado)}</td>
                  <Comentario texto={f.observacion} />
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="sticky bottom-0 bg-white text-right font-semibold">
                <td className={`${td} text-left`}>Total</td>
                <td className={td} />
                <td className={td} />
                <td className={td}>{fmtNumero(totalCantidad)}</td>
                <td className={td}>{fmtPesosDec(totalValor)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Seccion>
  );
}

// Artículos sin diferencia que el equipo comentó (obsoletos, defectuosos, pendientes de reclamación…).
export function TablaComentarios({ filas }: { filas: FilaDiferencia[] }) {
  return (
    <Seccion
      id="comentarios"
      titulo="Artículos con comentarios sin diferencia"
      descripcion={`${fmtNumero(filas.length)} artículos que cuadran con SAP pero tienen una observación en el Excel`}
    >
      {filas.length === 0 ? (
        <Vacio texto="No hay comentarios en artículos sin diferencia en este rango." />
      ) : (
        <div className="max-h-[28rem] overflow-auto">
          <table className="w-full text-sm text-ink">
            <thead>
              <tr className="text-right">
                <th className={`${th} text-left`}>Artículo</th>
                <th className={th}>Conteo</th>
                <th className={th}>Teórico</th>
                <th className={`${th} text-left`}>Comentarios</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.itemCode + f.fechaConteo} className="border-b border-line/60 text-right odd:bg-cream/40">
                  <td className={`${td} text-left`}>
                    <span className="block max-w-[26rem] truncate" title={f.descripcion}>{f.descripcion}</span>
                    <span className="text-xs text-brand-secondary">{f.itemCode} · {f.fechaConteo}</span>
                  </td>
                  <td className={td}>{fmtNumero(f.conteo)}</td>
                  <td className={td}>{fmtNumero(f.teorico)}</td>
                  <Comentario texto={f.observacion} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Seccion>
  );
}
