"use client";

import { useMemo } from "react";
import { EChart, type EChartOption } from "@/components/charts/EChart";
import { fmtCompacto, fmtPct, fmtPesos, mesCorto, nombreMes } from "@/lib/format";
import type { ResumenMes } from "@/lib/data/conteos";

// Par divergente validado (dataviz validate_palette, superficie blanca): CVD ΔE 15.7, contraste >= 3:1.
const SOBRANTE = "#2f6f9f";
const FALTANTE = "#d0603f";
const TEXTO_SECUNDARIO = "#749094";
const GRILLA = "#ece7dd";
const TEXTO = "#1d1d1b";

const axisBase = {
  axisLine: { show: false },
  axisTick: { show: false },
  axisLabel: { color: TEXTO_SECUNDARIO, fontSize: 11 },
  splitLine: { lineStyle: { color: GRILLA } },
};

const tooltipBase = {
  backgroundColor: "#ffffff",
  borderColor: "#e8e2d5",
  textStyle: { color: TEXTO, fontSize: 12 },
  extraCssText: "box-shadow: 0 4px 12px rgba(37,65,83,.12); border-radius: 8px;",
};

export function GraficasMensuales({ resumen }: { resumen: ResumenMes[] }) {
  const meses = resumen.map((r) => mesCorto(r.mes));

  const exactitud = useMemo<EChartOption>(
    () => ({
      grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
      tooltip: {
        ...tooltipBase,
        trigger: "axis",
        axisPointer: { type: "line", lineStyle: { color: TEXTO_SECUNDARIO, type: "dashed" } },
        formatter: (params: { dataIndex: number }[]) => {
          const r = resumen[params[0].dataIndex];
          return `<b>${nombreMes(r.mes)}</b><br/>Exactitud: <b>${fmtPct(r.exactitud)}</b><br/>${r.conDiferencia} de ${r.articulos} artículos con diferencia`;
        },
      },
      xAxis: { type: "category", data: meses, ...axisBase, splitLine: { show: false } },
      yAxis: {
        type: "value",
        min: (v: { min: number }) => Math.max(0, Math.floor(v.min * 10) / 10 - 0.05),
        max: 1,
        ...axisBase,
        axisLabel: { ...axisBase.axisLabel, formatter: (v: number) => fmtPct(v) },
      },
      series: [
        {
          name: "Exactitud",
          type: "line",
          data: resumen.map((r) => r.exactitud),
          lineStyle: { width: 2, color: SOBRANTE },
          itemStyle: { color: SOBRANTE, borderColor: "#ffffff", borderWidth: 2 },
          symbol: "circle",
          symbolSize: 9,
          emphasis: { scale: 1.3 },
        },
      ],
    }),
    [resumen, meses],
  );

  const diferencias = useMemo<EChartOption>(
    () => ({
      grid: { left: 8, right: 16, top: 36, bottom: 8, containLabel: true },
      legend: {
        top: 0,
        left: 0,
        itemWidth: 12,
        itemHeight: 12,
        icon: "roundRect",
        textStyle: { color: TEXTO, fontSize: 12 },
      },
      tooltip: {
        ...tooltipBase,
        trigger: "axis",
        axisPointer: { type: "shadow", shadowStyle: { color: "rgba(37,65,83,0.06)" } },
        formatter: (params: { dataIndex: number }[]) => {
          const r = resumen[params[0].dataIndex];
          const neto = r.sobranteValorizado + r.faltanteValorizado;
          return `<b>${nombreMes(r.mes)}</b><br/>
            <span style="color:${SOBRANTE}">■</span> Sobrante: <b>${fmtPesos(r.sobranteValorizado)}</b><br/>
            <span style="color:${FALTANTE}">■</span> Faltante: <b>${fmtPesos(r.faltanteValorizado)}</b><br/>
            Neto: <b>${fmtPesos(neto)}</b>`;
        },
      },
      xAxis: { type: "category", data: meses, ...axisBase, splitLine: { show: false } },
      yAxis: {
        type: "value",
        ...axisBase,
        axisLabel: { ...axisBase.axisLabel, formatter: (v: number) => fmtCompacto(v) },
      },
      series: [
        {
          name: "Sobrante valorizado",
          type: "bar",
          stack: "neto",
          barMaxWidth: 28,
          data: resumen.map((r) => r.sobranteValorizado),
          itemStyle: { color: SOBRANTE, borderRadius: [4, 4, 0, 0] },
        },
        {
          name: "Faltante valorizado",
          type: "bar",
          stack: "neto",
          barMaxWidth: 28,
          data: resumen.map((r) => r.faltanteValorizado),
          itemStyle: { color: FALTANTE, borderRadius: [0, 0, 4, 4] },
        },
      ],
    }),
    [resumen, meses],
  );

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <figure className="rounded-2xl border border-line bg-white p-5">
        <figcaption className="mb-1 text-sm font-semibold text-brand">Exactitud del inventario por mes</figcaption>
        <p className="mb-3 text-xs text-brand-secondary">Artículos contados sin diferencia frente al stock teórico de SAP</p>
        <EChart option={exactitud} className="h-64 w-full" ariaLabel="Exactitud del inventario por mes" />
      </figure>
      <figure className="rounded-2xl border border-line bg-white p-5">
        <figcaption className="mb-1 text-sm font-semibold text-brand">Diferencias valorizadas por mes</figcaption>
        <p className="mb-3 text-xs text-brand-secondary">Sobrantes y faltantes encontrados en el conteo, incluidos los ajustados</p>
        <EChart option={diferencias} className="h-64 w-full" ariaLabel="Sobrantes y faltantes valorizados por mes" />
      </figure>
    </div>
  );
}
