-- =========================================================
-- Migração 003 — Pedidos Boali São Carlos
-- Rode em: Supabase > SQL Editor > New query (uma vez só)
--
-- O que muda:
-- Prato principal deixa de ser um único item por pedido: agora o cliente
-- pode escolher vários pratos, inclusive repetindo o mesmo prato com
-- quantidade — igual já funciona para suco/sobremesa. Isso move product_id
-- da tabela orders para uma nova tabela order_products.
--
-- Pedidos já existentes são preservados: o prato que já estava salvo é
-- migrado para a nova tabela com quantidade 1 antes da coluna antiga ser
-- removida.
-- =========================================================

-- 1. Nova tabela para múltiplos pratos por pedido
create table if not exists order_products (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references orders(id) on delete cascade,
  product_id  uuid not null references products(id),
  quantidade  integer not null default 1 check (quantidade > 0)
);

alter table order_products enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'order_products' and policyname = 'order_products_select') then
    create policy "order_products_select" on order_products for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'order_products' and policyname = 'order_products_insert') then
    create policy "order_products_insert" on order_products for insert with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'order_products' and policyname = 'order_products_update') then
    create policy "order_products_update" on order_products for update using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'order_products' and policyname = 'order_products_delete') then
    create policy "order_products_delete" on order_products for delete using (true);
  end if;
end $$;

-- 2. Migrar product_id existente para a nova tabela
insert into order_products (order_id, product_id, quantidade)
select id, product_id, 1 from orders where product_id is not null;

-- 3. Remover a coluna antiga (substituída pela tabela order_products)
alter table orders drop column if exists product_id;
