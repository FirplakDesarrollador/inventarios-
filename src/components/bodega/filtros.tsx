import { nombreMes } from "@/lib/format";

interface FiltrosProps {
  meses: string[]; // AAAA-MM-01
  mes: string;
  diaDesde: number;
  diaHasta: number;
  q: string;
}

// Formulario GET: los filtros viven en la URL, así un enlace compartido abre la misma vista.
export function Filtros({ meses, mes, diaDesde, diaHasta, q }: FiltrosProps) {
  const campo =
    "w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink focus:border-brand focus:ring-2 focus:ring-brand/15 focus:outline-none";
  const etiqueta = "mb-1 block text-xs font-medium text-brand-secondary";

  return (
    <form method="get" className="grid gap-3 rounded-2xl border border-line bg-white p-4 sm:grid-cols-2 lg:grid-cols-[1.2fr_0.6fr_0.6fr_2fr_auto] lg:items-end">
      <div>
        <label htmlFor="mes" className={etiqueta}>Mes</label>
        <select id="mes" name="mes" defaultValue={mes} className={`${campo} capitalize`}>
          {meses.map((m) => (
            <option key={m} value={m.slice(0, 7)}>{nombreMes(m)}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="desde" className={etiqueta}>Día desde</label>
        <input id="desde" name="desde" type="number" min={1} max={31} defaultValue={diaDesde} className={campo} />
      </div>
      <div>
        <label htmlFor="hasta" className={etiqueta}>Día hasta</label>
        <input id="hasta" name="hasta" type="number" min={1} max={31} defaultValue={diaHasta} className={campo} />
      </div>
      <div className="sm:col-span-2 lg:col-span-1">
        <label htmlFor="q" className={etiqueta}>Artículo</label>
        <input id="q" name="q" type="search" defaultValue={q} placeholder="Código, descripción o comentario" className={campo} />
      </div>
      <button type="submit" className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark sm:col-span-2 lg:col-span-1">
        Aplicar
      </button>
    </form>
  );
}
