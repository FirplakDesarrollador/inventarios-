-- Movimientos de SAP de una o varias bodegas agrupados por concepto (tableros sin conteo: PT-04).
create function "Inventarios".resumen_conceptos(
  p_bodegas  text[],
  p_desde    date,
  p_hasta    date
)
returns table (
  concepto  text,
  lineas    bigint,
  cantidad  numeric,
  valor     numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select m.concepto, count(*), sum(m.cantidad), sum(m.total_linea)
  from "Inventarios".movimientos_mercancia m
  where m.bodega = any (p_bodegas)
    and m.fecha between p_desde and p_hasta
  group by m.concepto
  order by abs(sum(m.total_linea)) desc;
$$;

grant execute on function "Inventarios".resumen_conceptos(text[], date, date) to authenticated;
