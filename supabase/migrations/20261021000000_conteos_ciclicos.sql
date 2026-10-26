-- Conteos cíclicos por bodega, leídos de la hoja "Inventario BD" de los Excel mensuales en SharePoint
-- (sitio InvCiclicos). Cada archivo se reemplaza completo en cada sincronización.

create table "Inventarios".archivos_conteo (
  archivo_id      text        primary key,          -- id del driveItem en SharePoint
  bodega          text        not null,
  nombre          text        not null,
  periodo         text        not null,              -- etiqueta del reporte: 'Julio', 'Febrero-Marzo'
  periodo_inicio  date        not null,              -- primer día del primer mes del reporte
  modificado_en   timestamptz not null,              -- lastModifiedDateTime en SharePoint
  filas           integer     not null,
  sincronizado_en timestamptz not null default now()
);

create table "Inventarios".conteos_ciclicos (
  archivo_id          text          not null references "Inventarios".archivos_conteo (archivo_id) on delete cascade,
  bodega              text          not null,
  periodo_inicio      date          not null,
  fecha_conteo        date,                          -- FECHA (X)
  item_code           text          not null,
  descripcion         text,
  familia             text,
  tipo_toc            text,
  conteo_definitivo   numeric(19,6),
  stock_teorico       numeric(19,6),
  costo_unitario      numeric(19,6),
  sobrante            numeric(19,6) not null default 0, -- Sobrante (entrada)
  sobrante_valorizado numeric(19,6) not null default 0,
  faltante            numeric(19,6) not null default 0, -- Faltante (salida), negativo
  faltante_valorizado numeric(19,6) not null default 0,
  ajuste              text          check (ajuste in ('SI', 'NO')),
  concepto            text,                          -- EAI / SAI cuando ajuste = 'SI'
  doc_sap             text,                          -- #DOC
  observacion         text,
  primary key (archivo_id, item_code)
);

create index conteos_ciclicos_bodega_fecha_idx on "Inventarios".conteos_ciclicos (bodega, fecha_conteo);
create index conteos_ciclicos_bodega_periodo_idx on "Inventarios".conteos_ciclicos (bodega, periodo_inicio);

alter table "Inventarios".archivos_conteo enable row level security;
alter table "Inventarios".conteos_ciclicos enable row level security;

create policy "Lectura para usuarios autenticados" on "Inventarios".archivos_conteo
  for select to authenticated using (true);
create policy "Lectura para usuarios autenticados" on "Inventarios".conteos_ciclicos
  for select to authenticated using (true);

grant select on "Inventarios".archivos_conteo, "Inventarios".conteos_ciclicos to authenticated;
grant all on "Inventarios".archivos_conteo, "Inventarios".conteos_ciclicos to service_role;

-- Ajustes marcados en el Excel (AJUSTE SI) frente a los ajustes EAI/SAI registrados en SAP,
-- por artículo, para una bodega y un rango de fechas (fecha de conteo / fecha de contabilización).
-- Reproduce la página "Ajustes SAP" de Power BI; además devuelve los ajustes de SAP sin fila en el Excel.
create or replace function "Inventarios".comparativo_ajustes(p_bodega text, p_desde date, p_hasta date)
returns table (
  item_code              text,
  descripcion            text,
  diferencia             numeric,
  diferencia_valorizada  numeric,
  cantidad_sap           numeric,
  valor_sap              numeric,
  variacion_cantidad     numeric,
  variacion_costo        numeric,
  variacion_pct          numeric,
  origen                 text   -- 'ambos' | 'solo_excel' | 'solo_sap'
)
language sql
stable
security invoker
set search_path = ''
as $$
  with excel as (
    select c.item_code,
           max(c.descripcion) as descripcion,
           sum(c.sobrante + c.faltante) as diferencia,
           sum(c.sobrante_valorizado + c.faltante_valorizado) as diferencia_valorizada
    from "Inventarios".conteos_ciclicos c
    where c.bodega = p_bodega
      and c.ajuste = 'SI'
      and c.fecha_conteo between p_desde and p_hasta
    group by c.item_code
  ),
  sap as (
    select m.item_code,
           max(m.descripcion) as descripcion,
           sum(m.cantidad) as cantidad_sap,
           sum(m.total_linea) as valor_sap
    from "Inventarios".movimientos_mercancia m
    where m.bodega = p_bodega
      and m.concepto in ('EAI', 'SAI')
      and m.fecha between p_desde and p_hasta
    group by m.item_code
  )
  select coalesce(e.item_code, s.item_code),
         coalesce(e.descripcion, s.descripcion),
         e.diferencia,
         e.diferencia_valorizada,
         s.cantidad_sap,
         s.valor_sap,
         coalesce(e.diferencia, 0) - coalesce(s.cantidad_sap, 0),
         coalesce(e.diferencia_valorizada, 0) - coalesce(s.valor_sap, 0),
         case when s.valor_sap is not null and s.valor_sap <> 0
              then (coalesce(e.diferencia_valorizada, 0) - s.valor_sap) / s.valor_sap end,
         case when e.item_code is null then 'solo_sap'
              when s.item_code is null then 'solo_excel'
              else 'ambos' end
  from excel e
  full join sap s on s.item_code = e.item_code
  order by 2;
$$;

-- Indicadores por mes de conteo para una bodega: artículos contados, exactitud y diferencias valorizadas.
create or replace function "Inventarios".resumen_mensual(p_bodega text)
returns table (
  mes                  date,
  articulos            bigint,
  con_diferencia       bigint,
  exactitud            numeric,
  sobrante_valorizado  numeric,
  faltante_valorizado  numeric,
  ajustes_excel        bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select date_trunc('month', c.fecha_conteo)::date,
         count(*),
         count(*) filter (where c.sobrante <> 0 or c.faltante <> 0),
         1 - count(*) filter (where c.sobrante <> 0 or c.faltante <> 0)::numeric / count(*),
         sum(c.sobrante_valorizado),
         sum(c.faltante_valorizado),
         count(*) filter (where c.ajuste = 'SI')
  from "Inventarios".conteos_ciclicos c
  where c.bodega = p_bodega
    and c.fecha_conteo is not null
  group by 1
  order by 1;
$$;

grant execute on function "Inventarios".comparativo_ajustes(text, date, date) to authenticated;
grant execute on function "Inventarios".resumen_mensual(text) to authenticated;
