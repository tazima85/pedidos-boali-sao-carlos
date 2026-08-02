-- =========================================================
-- Pedidos Boali São Carlos — schema Supabase (Postgres)
-- Rode este script inteiro em: Supabase > SQL Editor > New query
-- =========================================================

create extension if not exists "pgcrypto";

-- ---------- products ----------
create table if not exists products (
  id        uuid primary key default gen_random_uuid(),
  nome      text not null,
  descricao text,
  preco     numeric(10,2),
  ativo     boolean not null default true,
  criado_em timestamptz not null default now()
);

-- ---------- extra_items (sucos e sobremesas) ----------
create table if not exists extra_items (
  id        uuid primary key default gen_random_uuid(),
  categoria text not null check (categoria in ('suco', 'sobremesa')),
  nome      text not null,
  preco     numeric(10,2),
  ativo     boolean not null default true,
  criado_em timestamptz not null default now()
);

-- ---------- time_windows ----------
create table if not exists time_windows (
  id           uuid primary key default gen_random_uuid(),
  data         date not null,
  hora_inicio  time not null,
  hora_fim     time not null,
  ativa        boolean not null default true,
  criado_em    timestamptz not null default now()
);

-- ---------- orders ----------
-- "numero" é um código sequencial curto (iniciando em 100) para identificar
-- o pedido de forma legível no admin e na retirada — o "id" uuid continua
-- sendo a chave primária real.
create sequence if not exists orders_numero_seq start with 100;

create table if not exists orders (
  id                uuid primary key default gen_random_uuid(),
  numero            integer not null default nextval('orders_numero_seq') unique,
  criado_em         timestamptz not null default now(),
  nome_cliente      text not null,
  whatsapp_cliente  text not null,
  product_id        uuid not null references products(id),
  forma_pagamento   text not null check (forma_pagamento in ('pix', 'cartao')),
  time_window_id    uuid not null references time_windows(id)
);

-- ---------- order_extra_items (sucos/sobremesas escolhidos em cada pedido) ----------
-- Um pedido pode ter vários sucos/sobremesas, inclusive repetindo o mesmo
-- item (nesse caso soma-se a quantidade em vez de criar outra linha).
create table if not exists order_extra_items (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references orders(id) on delete cascade,
  extra_item_id  uuid not null references extra_items(id),
  quantidade     integer not null default 1 check (quantidade > 0)
);

-- ---------- config (linha única com a chave Pix) ----------
create table if not exists config (
  id      smallint primary key default 1 check (id = 1),
  pix_key text
);

insert into config (id, pix_key)
values (1, '')
on conflict (id) do nothing;

-- =========================================================
-- Row Level Security
-- Piloto sem autenticação: tanto a página do cliente quanto o
-- admin usam a mesma "anon key" pública do Supabase. Por isso as
-- policies abaixo liberam leitura/escrita geral nessas tabelas.
-- Não coloque dados sensíveis neste projeto além do necessário
-- ao piloto (nome e WhatsApp do cliente).
-- =========================================================

alter table products          enable row level security;
alter table extra_items       enable row level security;
alter table time_windows      enable row level security;
alter table orders            enable row level security;
alter table order_extra_items enable row level security;
alter table config            enable row level security;

-- products
create policy "products_select" on products for select using (true);
create policy "products_insert" on products for insert with check (true);
create policy "products_update" on products for update using (true) with check (true);
create policy "products_delete" on products for delete using (true);

-- extra_items
create policy "extra_items_select" on extra_items for select using (true);
create policy "extra_items_insert" on extra_items for insert with check (true);
create policy "extra_items_update" on extra_items for update using (true) with check (true);
create policy "extra_items_delete" on extra_items for delete using (true);

-- time_windows
create policy "time_windows_select" on time_windows for select using (true);
create policy "time_windows_insert" on time_windows for insert with check (true);
create policy "time_windows_update" on time_windows for update using (true) with check (true);
create policy "time_windows_delete" on time_windows for delete using (true);

-- orders (cliente só precisa inserir e o admin ler; liberamos geral por simplicidade do piloto)
create policy "orders_select" on orders for select using (true);
create policy "orders_insert" on orders for insert with check (true);
create policy "orders_update" on orders for update using (true) with check (true);
create policy "orders_delete" on orders for delete using (true);

-- order_extra_items
create policy "order_extra_items_select" on order_extra_items for select using (true);
create policy "order_extra_items_insert" on order_extra_items for insert with check (true);
create policy "order_extra_items_update" on order_extra_items for update using (true) with check (true);
create policy "order_extra_items_delete" on order_extra_items for delete using (true);

-- config
create policy "config_select" on config for select using (true);
create policy "config_update" on config for update using (true) with check (true);
