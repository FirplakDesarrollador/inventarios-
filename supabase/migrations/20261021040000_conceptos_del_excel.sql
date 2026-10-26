-- Cada bodega ajusta con conceptos distintos (EAI/SAI, SCA/ECA en CEFI, EOA/SOA en devoluciones…).
-- Además de los conceptos configurados, cuentan como ajuste del conteo los que el propio Excel anota
-- en sus filas de ajuste dentro del rango.

create or replace function "Inventarios".comparativo_ajustes(
  p_bodega       text,
  p_bodegas_sap  text[],
  p_conceptos    text[],
  p_desde        date,
  p_hasta        date
)
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
  with excel_rango as (
    select c.*
    from "Inventarios".conteos_vigentes c
    where c.bodega = p_bodega
      and c.fecha_conteo between p_desde and p_hasta
  ),
  excel as (
    select c.item_code,
           max(c.descripcion) as descripcion,
           sum(c.sobrante + c.faltante) as diferencia,
           sum(c.sobrante_valorizado + c.faltante_valorizado) as diferencia_valorizada
    from excel_rango c
    where c.ajuste = 'SI'
    group by c.item_code
  ),
  conceptos as (
    select unnest(p_conceptos) as concepto
    union
    select distinct c.concepto from excel_rango c where c.ajuste = 'SI' and c.concepto is not null
  ),
  sap as (
    select m.item_code,
           max(m.descripcion) as descripcion,
           sum(m.cantidad) as cantidad_sap,
           sum(m.total_linea) as valor_sap
    from "Inventarios".movimientos_mercancia m
    where m.bodega = any (p_bodegas_sap)
      and m.concepto in (select concepto from conceptos)
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
