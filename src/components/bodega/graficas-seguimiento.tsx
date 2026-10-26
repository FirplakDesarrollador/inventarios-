"use client";

import { useMemo } from "react";
import { EChart, type EChartOption } from "@/components/charts/EChart";
import { fmtCompacto, fmtNumero, fmtPesos, mesCorto, nombreMes } from "@/lib/format";

// Categórica validada (dataviz validate_palette, superficie clara): azul, naranja, aqua en ese orden;
// "Con salida en SAP" es el resto y va en gris neutro.
const ABIERTAS = "#2a78d6";
const REVISAR = "#eb6834";
const SOLUCIONADAS = "#1baf7a";
const CON_SALIDA = "#b9b6ad";
const BARRA = "#2f6f9f";
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

export interface DevolucionesMes {
  mes: string; // AAAA-MM
  abiertas: number;
  revisar: number;
  solucionadas: number;
  conSalida: number;
}

const SERIES: { clave: keyof Omit<DevolucionesMes, "mes">; nombre: string; color: string }[] = [
  { clave: "abiertas", nombre: "Abiertas", color: ABIERTAS },
  { clave: "revisar", nombre: "Sin color y sin salida en SAP", color: REVISAR },
  { clave: "solucionadas", nombre: "Solucionadas", color: SOLUCIONADAS },
  { clave: "conSalida", nombre: "Sin color, con salida en SAP", color: CON_SALIDA },
];

export function GraficaDevoluciones({ porMes }: { porMes: DevolucionesMes[] }) {
  const option = useMemo<EChartOption>(
    () => ({
      grid: { left: 8, right: 16, top: 56, bottom: 8, containLabel: true },
      legend: { top: 0, left: 0, itemWidth: 12, itemHeight: 12, icon: "roundRect", textStyle: { color: TEXTO, fontSize: 12 } },
      tooltip: {
        ...tooltipBase,
        trigger: "axis",
        axisPointer: { type: "shadow", shadowStyle: { color: "rgba(37,65,83,0.06)" } },
        formatter: (params: { dataIndex: number }[]) => {
          const r = porMes[params[0].dataIndex];
          const total = SERIES.reduce((s, x) => s + r[x.clave], 0);
          return `<b>${nombreMes(r.mes)}</b> · ${fmtNumero(total)} registros<br/>${SERIES.map(
            (x) => `<span style="color:${x.color}">■</span> ${x.nombre}: <b>${fmtNumero(r[x.clave])}</b>`,
          ).join("<br/>")}`;
        },
      },
      xAxis: { type: "category", data: porMes.map((r) => mesCorto(r.mes)), ...axisBase, splitLine: { show: false } },
      yAxis: { type: "value", minInterval: 1, ...axisBase },
      series: SERIES.map((x) => ({
        name: x.nombre,
        type: "bar",
        stack: "total",
        barMaxWidth: 32,
        data: porMes.map((r) => r[x.clave]),
        itemStyle: { color: x.color, borderColor: "#ffffff", borderWidth: 1 },
      })),
    }),
    [porMes],
  );

  return (
    <figure className="rounded-2xl border border-line bg-white p-5">
      <figcaption className="mb-1 text-sm font-semibold text-brand">Devoluciones por mes de ingreso</figcaption>
      <p className="mb-3 text-xs text-brand-secondary">Estado según el color de la bitácora y la salida registrada en SAP</p>
      <EChart option={option} className="h-72 w-full" ariaLabel="Devoluciones por mes de ingreso y estado" />
    </figure>
  );
}

export interface ResumenCorte {
  fecha: string;
  hoja: string;
  unidades: number;
  valor: number;
  articulos: number;
}

export function GraficaCortes({ cortes }: { cortes: ResumenCorte[] }) {
  const option = useMemo<EChartOption>(
    () => ({
      grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
      tooltip: {
        ...tooltipBase,
        trigger: "axis",
        axisPointer: { type: "shadow", shadowStyle: { color: "rgba(37,65,83,0.06)" } },
        formatter: (params: { dataIndex: number }[]) => {
          const c = cortes[params[0].dataIndex];
          return `<b>${c.hoja}</b><br/>Valor: <b>${fmtPesos(c.valor)}</b><br/>${fmtNumero(c.unidades)} unidades · ${fmtNumero(c.articulos)} artículos`;
        },
      },
      xAxis: { type: "category", data: cortes.map((c) => c.hoja), ...axisBase, splitLine: { show: false } },
      yAxis: { type: "value", ...axisBase, axisLabel: { ...axisBase.axisLabel, formatter: (v: number) => fmtCompacto(v) } },
      series: [
        {
          name: "Valor del stock",
          type: "bar",
          barMaxWidth: 40,
          data: cortes.map((c) => c.valor),
          itemStyle: { color: BARRA, borderRadius: [4, 4, 0, 0] },
          label: { show: true, position: "top", color: TEXTO_SECUNDARIO, fontSize: 11, formatter: (p: { value: number }) => fmtCompacto(p.value) },
        },
      ],
    }),
    [cortes],
  );

  return (
    <figure className="rounded-2xl border border-line bg-white p-5">
      <figcaption className="mb-1 text-sm font-semibold text-brand">Valor del stock en cada corte</figcaption>
      <p className="mb-3 text-xs text-brand-secondary">Valor acumulado de SAP según cada hoja del archivo</p>
      <EChart option={option} className="h-64 w-full" ariaLabel="Valor del stock de ferias en cada corte" />
    </figure>
  );
}
