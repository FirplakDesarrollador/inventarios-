import { fmtNumero, fmtPct, fmtPesos } from "@/lib/format";

interface IndicadoresProps {
  articulos: number;
  conDiferencia: number;
  sobranteSinAjuste: number;
  faltanteSinAjuste: number;
  diferenciaAjustada: number;
  valorSap: number;
}

export function Tile({ titulo, valor, detalle }: { titulo: string; valor: string; detalle: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-5">
      <p className="text-xs font-medium text-brand-secondary">{titulo}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-brand tabular-nums">{valor}</p>
      <p className="mt-1 text-xs text-brand-secondary">{detalle}</p>
    </div>
  );
}

export function Indicadores(p: IndicadoresProps) {
  const exactitud = p.articulos ? 1 - p.conDiferencia / p.articulos : null;
  const variacion = p.diferenciaAjustada - p.valorSap;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Tile
        titulo="Exactitud"
        valor={fmtPct(exactitud)}
        detalle={`${fmtNumero(p.conDiferencia)} de ${fmtNumero(p.articulos)} artículos con diferencia`}
      />
      <Tile titulo="Sobrante sin ajustar" valor={fmtPesos(p.sobranteSinAjuste)} detalle="Valorizado al costo del Excel" />
      <Tile titulo="Faltante sin ajustar" valor={fmtPesos(p.faltanteSinAjuste)} detalle="Valorizado al costo del Excel" />
      <Tile
        titulo="Ajustes: Excel vs SAP"
        valor={fmtPesos(variacion)}
        detalle={`Excel ${fmtPesos(p.diferenciaAjustada)} · SAP ${fmtPesos(p.valorSap)}`}
      />
    </div>
  );
}
