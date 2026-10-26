import { GraficaCortes } from "@/components/bodega/graficas-seguimiento";
import { Tile } from "@/components/bodega/indicadores";
import { Seccion, Vacio, td, th } from "@/components/bodega/tablas";
import { ANIO, type BodegaSeguimiento } from "@/lib/bodegas";
import { getCortesStock, getMovimientosSap, type ArticuloCorte, type CorteStock } from "@/lib/data/seguimiento";
import { fmtNumero, fmtPesos } from "@/lib/format";

const total = (c: CorteStock, k: "cantidad" | "valor") => c.articulos.reduce((s, a) => s + a[k], 0);

interface Cambio {
  itemCode: string;
  descripcion: string;
  antes: number;
  ahora: number;
  diferencia: number;
  valorDiferencia: number;
  tipo: "Nuevo" | "Salió" | "Aumentó" | "Disminuyó";
}

// Artículos cuyo stock cambió entre dos cortes, ordenados por el valor del cambio.
function cambios(anterior: CorteStock, actual: CorteStock): Cambio[] {
  const antes = new Map(anterior.articulos.map((a) => [a.itemCode, a]));
  const ahora = new Map(actual.articulos.map((a) => [a.itemCode, a]));
  const resultado: Cambio[] = [];
  for (const itemCode of new Set([...antes.keys(), ...ahora.keys()])) {
    const a = antes.get(itemCode);
    const b = ahora.get(itemCode);
    const diferencia = (b?.cantidad ?? 0) - (a?.cantidad ?? 0);
    if (Math.abs(diferencia) < 1e-9) continue;
    resultado.push({
      itemCode,
      descripcion: (b ?? a)!.descripcion,
      antes: a?.cantidad ?? 0,
      ahora: b?.cantidad ?? 0,
      diferencia,
      valorDiferencia: (b?.valor ?? 0) - (a?.valor ?? 0),
      tipo: !a ? "Nuevo" : !b ? "Salió" : diferencia > 0 ? "Aumentó" : "Disminuyó",
    });
  }
  return resultado.sort((x, y) => Math.abs(y.valorDiferencia) - Math.abs(x.valorDiferencia));
}

function fmtFecha(iso: string) {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

export async function TableroCortes({
  bodega,
  sp,
}: {
  bodega: BodegaSeguimiento;
  sp: Record<string, string | string[] | undefined>;
}) {
  const [{ archivo, modificado, cortes }, movimientos] = await Promise.all([
    getCortesStock(bodega.carpetaId),
    getMovimientosSap(bodega.bodegasSap, `${ANIO}-01-01`, `${ANIO}-12-31`),
  ]);
  if (cortes.length === 0) return <p className="text-sm text-brand-secondary">El archivo {archivo} no tiene hojas de corte.</p>;

  const elegido = cortes.findIndex((c) => c.fecha === sp.corte);
  const indice = elegido >= 0 ? elegido : cortes.length - 1;
  const actual = cortes[indice];
  const anterior = indice > 0 ? cortes[indice - 1] : null;
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";
  const coincide = (a: Pick<ArticuloCorte, "itemCode" | "descripcion">) =>
    !q || a.itemCode.toLowerCase().includes(q) || a.descripcion.toLowerCase().includes(q);

  const lista = anterior ? cambios(anterior, actual).filter(coincide) : [];
  const stock = actual.articulos.filter(coincide).sort((a, b) => b.valor - a.valor);
  const valor = total(actual, "valor");
  const variacion = anterior ? valor - total(anterior, "valor") : null;
  // Movimientos de SAP entre el corte anterior (exclusivo) y el actual (inclusivo).
  const movimientosPeriodo = movimientos.filter((m) => m.fecha <= actual.fecha && (!anterior || m.fecha > anterior.fecha));

  const campo =
    "w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink focus:border-brand focus:ring-2 focus:ring-brand/15 focus:outline-none";
  const etiqueta = "mb-1 block text-xs font-medium text-brand-secondary";

  return (
    <div className="space-y-6">
      <p className="text-sm text-brand-secondary">
        {archivo} · actualizado{" "}
        {new Date(modificado).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota" })}
      </p>

      <form method="get" className="grid gap-3 rounded-2xl border border-line bg-white p-4 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
        <div>
          <label htmlFor="corte" className={etiqueta}>Corte</label>
          <select id="corte" name="corte" defaultValue={actual.fecha} className={campo}>
            {cortes.map((c) => (
              <option key={c.fecha} value={c.fecha}>{c.hoja}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="q" className={etiqueta}>Artículo</label>
          <input id="q" name="q" type="search" defaultValue={q} placeholder="Código o descripción" className={campo} />
        </div>
        <button type="submit" className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark">
          Aplicar
        </button>
      </form>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile titulo={`Valor al corte (${actual.hoja})`} valor={fmtPesos(valor)} detalle="Valor acumulado de SAP" />
        <Tile titulo="Unidades" valor={fmtNumero(total(actual, "cantidad"))} detalle={`${fmtNumero(actual.articulos.length)} artículos`} />
        <Tile
          titulo="Cambio frente al corte anterior"
          valor={variacion == null ? "—" : fmtPesos(variacion)}
          detalle={anterior ? `Desde ${anterior.hoja}` : "Es el primer corte del año"}
        />
        <Tile
          titulo="Artículos que cambiaron"
          valor={anterior ? fmtNumero(cambios(anterior, actual).length) : "—"}
          detalle={`${fmtNumero(movimientosPeriodo.length)} líneas de SAP en el periodo`}
        />
      </div>

      <GraficaCortes
        cortes={cortes.map((c) => ({
          fecha: c.fecha,
          hoja: c.hoja,
          unidades: total(c, "cantidad"),
          valor: total(c, "valor"),
          articulos: c.articulos.length,
        }))}
      />

      {anterior && (
        <Seccion
          id="cambios"
          titulo={`Cambios del ${anterior.hoja} al ${actual.hoja}`}
          descripcion={`${fmtNumero(lista.length)} artículos con stock distinto entre los dos cortes`}
        >
          {lista.length === 0 ? (
            <Vacio texto="El stock no cambió entre estos cortes." />
          ) : (
            <div className="max-h-[28rem] overflow-auto">
              <table className="w-full text-sm text-ink">
                <thead>
                  <tr className="text-right">
                    <th className={`${th} text-left`}>Artículo</th>
                    <th className={`${th} text-left`}>Cambio</th>
                    <th className={th}>{anterior.hoja}</th>
                    <th className={th}>{actual.hoja}</th>
                    <th className={th}>Diferencia</th>
                    <th className={th}>Valor diferencia</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((c) => (
                    <tr key={c.itemCode} className="border-b border-line/60 text-right odd:bg-cream/40">
                      <td className={`${td} text-left`}>
                        <span className="block max-w-[26rem] truncate" title={c.descripcion}>{c.descripcion}</span>
                        <span className="text-xs text-brand-secondary">{c.itemCode}</span>
                      </td>
                      <td className={`${td} text-left`}>{c.tipo}</td>
                      <td className={td}>{fmtNumero(c.antes)}</td>
                      <td className={td}>{fmtNumero(c.ahora)}</td>
                      <td className={td}>{fmtNumero(c.diferencia)}</td>
                      <td className={td}>{fmtPesos(c.valorDiferencia)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Seccion>
      )}

      <Seccion
        id="sap"
        titulo={`Movimientos de SAP en ${bodega.bodegasSap.join(", ")}`}
        descripcion={anterior ? `Entre el ${anterior.hoja} y el ${actual.hoja}` : `Hasta el ${actual.hoja}`}
      >
        {movimientosPeriodo.length === 0 ? (
          <Vacio texto="Sin movimientos en SAP en este periodo." />
        ) : (
          <div className="max-h-[28rem] overflow-auto">
            <table className="w-full text-sm text-ink">
              <thead>
                <tr className="text-right">
                  <th className={`${th} text-left`}>Fecha</th>
                  <th className={`${th} text-left`}>Documento</th>
                  <th className={`${th} text-left`}>Artículo</th>
                  <th className={th}>Cantidad</th>
                  <th className={th}>Valor</th>
                  <th className={`${th} text-left`}>Comentarios</th>
                </tr>
              </thead>
              <tbody>
                {movimientosPeriodo.map((m, k) => (
                  <tr key={k} className="border-b border-line/60 text-right odd:bg-cream/40">
                    <td className={`${td} text-left`}>{fmtFecha(m.fecha)}</td>
                    <td className={`${td} text-left`}>{m.documento}</td>
                    <td className={`${td} text-left`}>
                      <span className="block max-w-[22rem] truncate" title={m.descripcion}>{m.descripcion}</span>
                      <span className="text-xs text-brand-secondary">{m.itemCode}</span>
                    </td>
                    <td className={td}>{fmtNumero(m.cantidad)}</td>
                    <td className={td}>{fmtPesos(m.valor)}</td>
                    <td className="min-w-[16rem] px-3 py-2 text-left text-xs leading-snug text-ink/80">{m.comentarios ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Seccion>

      <Seccion
        id="stock"
        titulo={`Stock al ${actual.hoja}`}
        descripcion={`${fmtNumero(stock.length)} artículos, ordenados por valor`}
      >
        <div className="max-h-[28rem] overflow-auto">
          <table className="w-full text-sm text-ink">
            <thead>
              <tr className="text-right">
                <th className={`${th} text-left`}>Artículo</th>
                <th className={th}>Cantidad</th>
                <th className={th}>Valor</th>
              </tr>
            </thead>
            <tbody>
              {stock.map((a) => (
                <tr key={a.itemCode} className="border-b border-line/60 text-right odd:bg-cream/40">
                  <td className={`${td} text-left`}>
                    <span className="block max-w-[30rem] truncate" title={a.descripcion}>{a.descripcion}</span>
                    <span className="text-xs text-brand-secondary">{a.itemCode}</span>
                  </td>
                  <td className={td}>{fmtNumero(a.cantidad)}</td>
                  <td className={td}>{fmtPesos(a.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Seccion>
    </div>
  );
}
