-- Un mismo conteo puede quedar en dos archivos mensuales (p. ej. 73 artículos contados a inicios de
-- junio que están tanto en el Excel de mayo como en el de junio). Esta vista deja una sola fila por
-- bodega + artículo + fecha de conteo, prefiriendo el archivo cuyo mes coincide con la fecha de conteo
-- y, si no, el archivo más reciente.

create view "Inventarios".conteos_vigentes
with (security_invoker = true)
as
select distinct on (c.bodega, c.item_code, c.fecha_conteo) c.*
from "Inventarios".conteos_ciclicos c
order by c.bodega, c.item_code, c.fecha_conteo,
         (date_trunc('month', c.fecha_conteo)::date = c.periodo_inicio) desc,
         c.periodo_inicio desc;

grant select on "Inventarios".conteos_vigentes to authenticated, service_role;

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
  origen                 text
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
    from "Inventarios".conteos_vigentes c
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
  from "Inventarios".conteos_vigentes c
  where c.bodega = p_bodega
    and c.fecha_conteo is not null
  group by 1
  order by 1;
$$;
