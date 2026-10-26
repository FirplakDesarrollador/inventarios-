import Link from "next/link";
import { Suspense } from "react";
import { AppHeader } from "@/components/app-header";
import { BODEGAS, SEGUIMIENTOS, type Bodega, type BodegaSeguimiento } from "@/lib/bodegas";
import { getResumenBodegas, type ResumenBodega } from "@/lib/data/conteos";
import { fmtCompacto, fmtPct, nombreMes } from "@/lib/format";

type Tablero = Bodega | BodegaSeguimiento;

const GRUPOS: { titulo: string; incluye: (b: Tablero) => boolean }[] = [
  { titulo: "Materia prima y plantas", incluye: (b) => b.codigo.startsWith("MP-") },
  { titulo: "Producto terminado", incluye: (b) => b.codigo === "CEDI" || b.codigo.startsWith("PT-") || b.codigo.startsWith("CT-") },
  { titulo: "Tiendas FPK Home", incluye: (b) => b.codigo.startsWith("FH") },
];

function Tarjeta({ bodega, resumen }: { bodega: Tablero; resumen?: ResumenBodega }) {
  return (
    <Link
      href={`/bodegas/${bodega.codigo.toLowerCase()}`}
      className="group flex flex-col rounded-2xl border border-line bg-white p-5 transition hover:border-brand/40 hover:shadow-sm"
    >
      <p className="text-xs font-semibold tracking-wider text-brand-secondary uppercase">{bodega.codigo}</p>
      <p className="mt-1 font-semibold text-brand">{bodega.nombre}</p>

      {resumen ? (
        <div className="mt-4 flex items-end justify-between gap-4">
          <div>
            <p className="text-2xl font-semibold text-brand tabular-nums">{fmtPct(resumen.exactitud)}</p>
            <p className="text-xs text-brand-secondary">exactitud · {nombreMes(resumen.mes)}</p>
          </div>
          <div className="text-right text-xs text-brand-secondary tabular-nums">
            <p>Sobrante {fmtCompacto(resumen.sobranteValorizado)}</p>
            <p>Faltante {fmtCompacto(resumen.faltanteValorizado)}</p>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-brand-secondary">{"tipo" in bodega ? bodega.descripcion : "Sin conteos sincronizados"}</p>
      )}
    </Link>
  );
}

// CEDI primero y luego por código, para que PT-04 y PT-07 queden en su lugar.
const porCodigo = (a: Tablero, b: Tablero) => (a.codigo === "CEDI" ? -1 : b.codigo === "CEDI" ? 1 : a.codigo.localeCompare(b.codigo));

async function Bodegas() {
  const resumen = await getResumenBodegas();
  return (
    <div className="space-y-8">
      {GRUPOS.map((g) => (
        <section key={g.titulo}>
          <h2 className="mb-3 text-sm font-semibold text-brand-secondary">{g.titulo}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[...BODEGAS, ...SEGUIMIENTOS].filter(g.incluye).sort(porCodigo).map((b) => (
              <Tarjeta key={b.codigo} bodega={b} resumen={resumen.get(b.codigo)} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export default function Home() {
  return (
    <>
      <Suspense fallback={<div className="h-[57px] border-b border-line bg-white" />}>
        <AppHeader />
      </Suspense>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-semibold text-brand">Bodegas</h1>
        <p className="mt-1 mb-8 text-sm text-brand-secondary">
          Conteos cíclicos 2026 de SharePoint comparados con los ajustes registrados en SAP. Cada tarjeta muestra el último mes con conteos.
        </p>

        <Suspense
          fallback={
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }, (_, i) => <div key={i} className="h-36 animate-pulse rounded-2xl bg-white" />)}
            </div>
          }
        >
          <Bodegas />
        </Suspense>
      </main>
    </>
  );
}
