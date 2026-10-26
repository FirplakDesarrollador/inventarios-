-- Entradas (OIGN/IGN1) y salidas (OIGE/IGE1) de mercancía de SAP, sincronizadas desde
-- la API interna FastAPI (/inventarios/?desde=&hasta=). Las salidas llegan con cantidad
-- y total_linea negativos.

create table "Inventarios".movimientos_mercancia (
  tipo                 char(1)       not null check (tipo in ('E', 'S')),
  doc_entry            integer       not null,
  line_num             integer       not null,
  doc_num              integer       not null,
  fecha                date          not null,
  bodega               text          not null,
  item_code            text          not null,
  descripcion          text,
  cantidad             numeric(19,6) not null,
  unidad               text,
  precio_inventario    numeric(19,6),
  total_linea          numeric(19,6),
  concepto             text,
  concepto_consolidado text,
  centro_costos        text,
  lista_precios        text,
  usuario              text,
  referencia           text,
  comentarios          text,
  sincronizado_en      timestamptz   not null default now(),
  primary key (tipo, doc_entry, line_num)
);

comment on table "Inventarios".movimientos_mercancia is
  'Entradas y salidas de mercancía de SAP (E = OIGN, S = OIGE). Llave: tipo + DocEntry + LineNum.';

create index movimientos_mercancia_fecha_idx  on "Inventarios".movimientos_mercancia (fecha);
create index movimientos_mercancia_bodega_idx on "Inventarios".movimientos_mercancia (bodega, fecha);
create index movimientos_mercancia_item_idx   on "Inventarios".movimientos_mercancia (item_code);

-- Lectura para usuarios autenticados de la app; la escritura solo la hace la sincronización (service_role).
alter table "Inventarios".movimientos_mercancia enable row level security;

create policy "Lectura para usuarios autenticados"
  on "Inventarios".movimientos_mercancia
  for select
  to authenticated
  using (true);

grant usage on schema "Inventarios" to authenticated, service_role;
grant select on "Inventarios".movimientos_mercancia to authenticated;
grant all on "Inventarios".movimientos_mercancia to service_role;
