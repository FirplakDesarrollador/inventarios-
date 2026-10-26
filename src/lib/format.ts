const pesos = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const pesosDecimales = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numero = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });
const porcentaje = new Intl.NumberFormat("es-CO", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
const compacto = new Intl.NumberFormat("es-CO", { notation: "compact", maximumFractionDigits: 1 });

type Num = number | null | undefined;

export const fmtPesos = (v: Num) => (v == null ? "—" : pesos.format(v));
export const fmtPesosDec = (v: Num) => (v == null ? "—" : pesosDecimales.format(v));
export const fmtNumero = (v: Num) => (v == null ? "—" : numero.format(v));
export const fmtPct = (v: Num) => (v == null ? "—" : porcentaje.format(v));
export const fmtCompacto = (v: Num) => (v == null ? "—" : compacto.format(v));

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

// "2026-07" o "2026-07-01" -> "julio 2026"
export function nombreMes(isoMes: string) {
  const [anio, mes] = isoMes.split("-");
  return `${MESES[Number(mes) - 1]} ${anio}`;
}

export function mesCorto(isoMes: string) {
  const [anio, mes] = isoMes.split("-");
  return `${MESES[Number(mes) - 1].slice(0, 3)} ${anio.slice(2)}`;
}

// Fecha de hoy en Colombia ("AAAA-MM-DD"), para contar días sin que la hora del servidor (UTC) los corra.
export function hoyBogota() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
}
