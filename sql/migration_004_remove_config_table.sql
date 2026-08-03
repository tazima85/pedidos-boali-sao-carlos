-- =========================================================
-- Migração 004 — Pedidos Boali São Carlos
-- Rode em: Supabase > SQL Editor > New query (uma vez só)
--
-- A chave Pix deixou de ser editável pelo admin e de ficar salva no banco:
-- agora é um valor fixo em js/config.js (PIX_KEY). A tabela config, que só
-- guardava essa chave, não é mais usada — este script remove ela.
-- =========================================================

drop table if exists config;
