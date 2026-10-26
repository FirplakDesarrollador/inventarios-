-- Último mes con conteos de cada tablero, para las tarjetas de la página de inicio.
create or replace function "Inventarios".resumen_bodegas()
returns table (
  bodega               text,
  mes                  date,
  articulos            bigint,
  con_diferencia       bigint,
  exactitud            numeric,
  sobrante_valorizado  numeric,
  faltante_valorizado  numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  with por_mes as (
    select c.bodega,
           date_trunc('month', c.fecha_conteo)::date as mes,
           count(*) as articulos,
           count(*) filter (where c.sobrante <> 0 or c.faltante <> 0) as con_diferencia,
           sum(c.sobrante_valorizado) as sobrante_valorizado,
           sum(c.faltante_valorizado) as faltante_valorizado
    from "Inventarios".conteos_vigentes c
    where c.fecha_conteo is not null
    group by 1, 2
  )
  select distinct on (p.bodega)
         p.bodega, p.mes, p.articulos, p.con_diferencia,
         1 - p.con_diferencia::numeric / p.articulos,
         p.sobrante_valorizado, p.faltante_valorizado
  from por_mes p
  order by p.bodega, p.mes desc;
$$;

grant execute on function "Inventarios".resumen_bodegas() to authenticated;
