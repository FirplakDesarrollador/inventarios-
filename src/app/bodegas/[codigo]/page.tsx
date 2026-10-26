import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AppHeader } from "@/components/app-header";
import { Filtros } from "@/components/bodega/filtros";
import { GraficasMensuales } from "@/components/bodega/graficas-mensuales";
import { Indicadores } from "@/components/bodega/indicadores";
import { TablaAjustes, TablaComentarios, TablaDiferencias } from "@/components/bodega/tablas";
import { TableroCortes } from "@/components/bodega/cortes-stock";
import { TableroDevoluciones } from "@/components/bodega/devoluciones";
import { getBodega, getSeguimiento } from "@/lib/bodegas";
import {
  getComparativoAjustes,
  getConteoArticulos,
  getDiferenciasSinAjuste,
  getResumenMensual,
} from "@/lib/data/conteos";
import { nombreMes } from "@/lib/format";

function ultimoDiaDelMes(mes: string) {
  const [anio, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(anio, m, 0)).getUTCDate();
}

function clampDia(valor: string | string[] | undefined, porDefecto: number, max: number) {
  const n = Number(Array.isArray(valor) ? valor[0] : valor);
  return Number.isInteger(n) && n >= 1 ? Math.min(n, max) : porDefecto;
}

// La búsqueda cubre código, descripción y comentarios.
const coincide = (q: string) => (f: { itemCode: string; descripcion: string; observacion: string | null }) =>
  !q ||
  f.itemCode.toLowerCase().includes(q) ||
  f.descripcion.toLowerCase().includes(q) ||
  (f.observacion ?? "").toLowerCase().includes(q);

function Atajos({ enlaces }: { enlaces: { id: string; texto: string; cantidad?: number }[] }) {
  return (
    <nav aria-label="Secciones del tablero" className="flex flex-wrap gap-2">
      {enlaces.map((e) => (
        <a
          key={e.id}
          href={`#${e.id}`}
          className="rounded-full border border-line bg-white px-3 py-1.5 text-sm text-brand transition hover:border-brand/40 hover:bg-cream"
        >
          {e.texto}
          {e.cantidad !== undefined && <span className="ml-1.5 text-brand-secondary tabular-nums">{e.cantidad}</span>}
        </a>
      ))}
    </nav>
  );
}

function Encabezado({ codigo, nombre }: { codigo: string; nombre: string }) {
  return (
    <>
      <nav className="mb-2 text-xs text-brand-secondary">
        <Link href="/" className="hover:text-brand hover:underline">Bodegas</Link> / {codigo}
      </nav>
      <h1 className="mb-6 text-2xl font-semibold text-brand">{codigo} · {nombre}</h1>
    </>
  );
}

async function Tablero({ params, searchParams }: PageProps<"/bodegas/[codigo]">) {
  const { codigo } = await params;
  const sp = await searchParams;

  // PT-04 y PT-07 no tienen conteo: se muestra su bitácora.
  const seguimiento = getSeguimiento(codigo);
  if (seguimiento) {
    return (
      <div>
        <Encabezado codigo={seguimiento.codigo} nombre={seguimiento.nombre} />
        {seguimiento.tipo === "devoluciones" ? (
          <TableroDevoluciones bodega={seguimiento} sp={sp} />
        ) : (
          <TableroCortes bodega={seguimiento} sp={sp} />
        )}
      </div>
    );
  }

  const bodega = getBodega(codigo);
  if (!bodega) notFound();
  const encabezado = <Encabezado codigo={bodega.codigo} nombre={bodega.nombre} />;

  const resumen = await getResumenMensual(bodega.codigo);
  if (resumen.length === 0) {
    return (
      <>
        {encabezado}
        <p className="text-sm text-brand-secondary">Aún no hay conteos sincronizados para {bodega.codigo}.</p>
      </>
    );
  }

  const meses = resumen.map((r) => r.mes);
  const mesParam = typeof sp.mes === "string" ? `${sp.mes}-01` : undefined;
  const mes = mesParam && meses.includes(mesParam) ? mesParam : meses[meses.length - 1];
  const ultimo = ultimoDiaDelMes(mes);
  const diaDesde = clampDia(sp.desde, 1, ultimo);
  const diaHasta = Math.max(diaDesde, clampDia(sp.hasta, ultimo, ultimo));
  const desde = `${mes.slice(0, 8)}${String(diaDesde).padStart(2, "0")}`;
  const hasta = `${mes.slice(0, 8)}${String(diaHasta).padStart(2, "0")}`;
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";

  const [comparativo, diferencias, articulos] = await Promise.all([
    getComparativoAjustes(bodega, desde, hasta),
    getDiferenciasSinAjuste(bodega.codigo, desde, hasta),
    getConteoArticulos(bodega.codigo, desde, hasta),
  ]);

  const ajustes = comparativo.filter(coincide(q));
  const sobrantes = diferencias.sobrantes.filter(coincide(q));
  const faltantes = diferencias.faltantes.filter(coincide(q));
  const comentados = diferencias.comentados.filter(coincide(q));
  const conExcel = comparativo.filter((f) => f.origen !== "solo_sap");

  return (
    <div className="space-y-6">
      <div className="-mb-6">{encabezado}</div>
      <Filtros meses={meses} mes={mes.slice(0, 7)} diaDesde={diaDesde} diaHasta={diaHasta} q={q} />

      <div>
        <p className="mb-3 text-sm text-brand-secondary">
          Conteos del <b className="text-brand">{diaDesde} al {diaHasta} de {nombreMes(mes)}</b>
        </p>
        <Indicadores
          articulos={articulos.total}
          conDiferencia={articulos.conDiferencia}
          sobranteSinAjuste={diferencias.sobrantes.reduce((s, f) => s + f.valorizado, 0)}
          faltanteSinAjuste={diferencias.faltantes.reduce((s, f) => s + f.valorizado, 0)}
          diferenciaAjustada={conExcel.reduce((s, f) => s + (f.diferenciaValorizada ?? 0), 0)}
          valorSap={conExcel.reduce((s, f) => s + (f.valorSap ?? 0), 0)}
        />
      </div>

      <Atajos
        enlaces={[
          { id: "ajustes", texto: "Ajustes vs SAP", cantidad: ajustes.filter((f) => f.origen !== "solo_sap").length },
          { id: "sobrantes", texto: "Sobrantes", cantidad: sobrantes.length },
          { id: "faltantes", texto: "Faltantes", cantidad: faltantes.length },
          { id: "comentarios", texto: "Con comentarios", cantidad: comentados.length },
          { id: "tendencia", texto: "Tendencia del año" },
        ]}
      />

      <TablaAjustes filas={ajustes} bodegasSap={bodega.bodegasSap} conceptos={bodega.conceptosAjuste} />
      <TablaDiferencias id="sobrantes" titulo="Sobrantes sin ajustar" filas={sobrantes} etiqueta="Sobrante" />
      <TablaDiferencias id="faltantes" titulo="Faltantes sin ajustar" filas={faltantes} etiqueta="Faltante" />
      <TablaComentarios filas={comentados} />

      <div id="tendencia" className="scroll-mt-4">
        <h2 className="mb-3 text-sm font-semibold text-brand">Tendencia del año</h2>
        <GraficasMensuales resumen={resumen} />
      </div>
    </div>
  );
}

function Cargando() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="h-20 animate-pulse rounded-2xl bg-white" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-white" />)}
      </div>
      <div className="h-72 animate-pulse rounded-2xl bg-white" />
    </div>
  );
}

export default function BodegaPage(props: PageProps<"/bodegas/[codigo]">) {
  return (
    <>
      <Suspense fallback={<div className="h-[57px] border-b border-line bg-white" />}>
        <AppHeader />
      </Suspense>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
        <Suspense fallback={<Cargando />}>
          <Tablero {...props} />
        </Suspense>
      </main>
    </>
  );
}
