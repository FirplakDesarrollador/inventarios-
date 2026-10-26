-- Un tablero puede agrupar varias bodegas de SAP (CEDI = PT-01, PT-02, PT-08) y cada uno define
-- qué conceptos de SAP cuentan como ajuste del conteo (CEDI usa también SCA).
-- conteos_ciclicos.bodega pasa a ser el código del tablero ('MP-01', 'CEDI'); la bodega de SAP que
-- anota el Excel en las filas ajustadas queda en bodega_excel.

alter table "Inventarios".conteos_ciclicos add column bodega_excel text;

-- La vista se recrea para incluir la columna nueva (select c.* se expande al crearla).
drop view "Inventarios".conteos_vigentes;
create view "Inventarios".conteos_vigentes
with (security_invoker = true)
as
select distinct on (c.bodega, c.item_code, c.fecha_conteo) c.*
from "Inventarios".conteos_ciclicos c
order by c.bodega, c.item_code, c.fecha_conteo,
         (date_trunc('month', c.fecha_conteo)::date = c.periodo_inicio) desc,
         c.periodo_inicio desc;
grant select on "Inventarios".conteos_vigentes to authenticated, service_role;

drop function "Inventarios".comparativo_ajustes(text, date, date);

create function "Inventarios".comparativo_ajustes(
  p_bodega       text,    -- código del tablero en conteos_ciclicos
  p_bodegas_sap  text[],  -- WhsCode de SAP que agrupa
  p_conceptos    text[],  -- conceptos de SAP que cuentan como ajuste del conteo
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
    where m.bodega = any (p_bodegas_sap)
      and m.concepto = any (p_conceptos)
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

grant execute on function "Inventarios".comparativo_ajustes(text, text[], text[], date, date) to authenticated;
