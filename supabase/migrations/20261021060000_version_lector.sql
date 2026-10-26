-- Versión del lector de Excel con que se sincronizó cada archivo: cuando cambia la lógica de lectura,
-- la sincronización vuelve a leer los archivos de versiones anteriores aunque no hayan cambiado en SharePoint.
alter table "Inventarios".archivos_conteo add column version_lector integer not null default 0;
