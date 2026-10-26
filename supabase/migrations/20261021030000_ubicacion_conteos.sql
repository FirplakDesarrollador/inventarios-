-- Las tiendas FPK Home agrupan dos bodegas de SAP (disponible y exhibición) en un tablero, y un mismo
-- artículo puede contarse el mismo día en las dos. "ubicacion" las separa para que la deduplicación no
-- junte conteos distintos. Entre copias del mismo conteo (corrección, versión 1…) gana el archivo del
-- mes de la fecha de conteo y, después, el modificado más recientemente.

alter table "Inventarios".conteos_ciclicos add column ubicacion text not null default '';

drop view "Inventarios".conteos_vigentes;
create view "Inventarios".conteos_vigentes
with (security_invoker = true)
as
select distinct on (c.bodega, c.ubicacion, c.item_code, c.fecha_conteo) c.*
from "Inventarios".conteos_ciclicos c
join "Inventarios".archivos_conteo a on a.archivo_id = c.archivo_id
order by c.bodega, c.ubicacion, c.item_code, c.fecha_conteo,
         (date_trunc('month', c.fecha_conteo)::date = c.periodo_inicio) desc,
         a.modificado_en desc;
grant select on "Inventarios".conteos_vigentes to authenticated, service_role;
