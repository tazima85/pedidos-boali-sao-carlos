-- =========================================================
-- Migração 002 — Pedidos Boali São Carlos
-- Rode em: Supabase > SQL Editor > New query (uma vez só)
--
-- O que muda:
-- 1. Cada pedido passa a ter um número sequencial legível (ex: 100, 101, 102...),
--    além do id uuid interno.
-- 2. Suco e sobremesa deixam de ser um único item por pedido: agora o cliente
--    pode escolher vários sucos/sobremesas, inclusive repetindo o mesmo item
--    com quantidade. Isso move suco_id/sobremesa_id da tabela orders para
--    uma nova tabela order_extra_items.
--
-- Pedidos já existentes são preservados: o suco/sobremesa que já estava
-- salvo é migrado para a nova tabela com quantidade 1 antes das colunas
-- antigas serem removidas.
-- =========================================================

-- 1. Número sequencial do pedido, começando em 100
create sequence if not exists orders_numero_seq start with 100;

alter table orders add column if not exists numero integer;
alter table orders alter column numero set default nextval('orders_numero_seq');

update orders set numero = nextval('orders_numero_seq') where numero is null;

alter table orders alter column numero set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_numero_key'
  ) then
    alter table orders add constraint orders_numero_key unique (numero);
  end if;
end $$;

-- 2. Nova tabela para múltiplos sucos/sobremesas por pedido
create table if not exists order_extra_items (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references orders(id) on delete cascade,
  extra_item_id  uuid not null references extra_items(id),
  quantidade     integer not null default 1 check (quantidade > 0)
);

alter table order_extra_items enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'order_extra_items' and policyname = 'order_extra_items_select') then
    create policy "order_extra_items_select" on order_extra_items for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'order_extra_items' and policyname = 'order_extra_items_insert') then
    create policy "order_extra_items_insert" on order_extra_items for insert with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'order_extra_items' and policyname = 'order_extra_items_update') then
    create policy "order_extra_items_update" on order_extra_items for update using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'order_extra_items' and policyname = 'order_extra_items_delete') then
    create policy "order_extra_items_delete" on order_extra_items for delete using (true);
  end if;
end $$;

-- 3. Migrar suco_id / sobremesa_id existentes para a nova tabela
insert into order_extra_items (order_id, extra_item_id, quantidade)
select id, suco_id, 1 from orders where suco_id is not null;

insert into order_extra_items (order_id, extra_item_id, quantidade)
select id, sobremesa_id, 1 from orders where sobremesa_id is not null;

-- 4. Remover as colunas antigas (substituídas pela tabela order_extra_items)
alter table orders drop column if exists suco_id;
alter table orders drop column if exists sobremesa_id;
