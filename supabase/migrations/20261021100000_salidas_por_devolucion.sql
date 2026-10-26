-- Salidas de SAP que citan una devolución en sus comentarios ("DEV 6133"), agrupadas por devolución y
-- artículo. Sirve para cruzar la bitácora de devoluciones en tránsito (PT-04) con lo que ya salió en SAP.
create function "Inventarios".salidas_por_devolucion(
  p_bodegas  text[],
  p_desde    date,
  p_hasta    date
)
returns table (
  devolucion   text,
  item_code    text,
  documentos   text,
  cantidad     numeric,
  valor        numeric,
  ultima_fecha date
)
language sql
stable
security invoker
set search_path = ''
as $$
  select d.devolucion,
         m.item_code,
         string_agg(distinct concat_ws(' ', m.concepto, m.doc_num), ', '),
         sum(m.cantidad),
         sum(m.total_linea),
         max(m.fecha)
  from "Inventarios".movimientos_mercancia m
  cross join lateral (
    select distinct x[1] as devolucion
    from regexp_matches(coalesce(m.comentarios, ''), 'DEV\s*\.?\s*(\d+)', 'gi') as x
  ) d
  where m.bodega = any (p_bodegas)
    and m.tipo = 'S'
    and m.fecha between p_desde and p_hasta
  group by d.devolucion, m.item_code;
$$;

grant execute on function "Inventarios".salidas_por_devolucion(text[], date, date) to authenticated;
