// Configuração do Supabase
// 1. Crie um projeto gratuito em https://supabase.com
// 2. Rode o script sql/schema.sql no SQL Editor do projeto
// 3. Copie a "Project URL" e a "anon public key" em
//    Project Settings > API e cole abaixo
//
// Esta chave "anon" é pública por design do Supabase (é ela que o
// navegador do cliente usa) — a proteção dos dados fica a cargo das
// políticas de RLS definidas em sql/schema.sql, não do sigilo desta chave.

export const SUPABASE_URL = "https://blseinmfyovbwpovfegf.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJsc2Vpbm1meW92Yndwb3ZmZWdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU2NTcxOTAsImV4cCI6MjEwMTIzMzE5MH0.LmrXwzyNIBFw6iZjD78S5tbEIgNSAbGPkmgwdaF5ACw";

// Chave Pix exibida ao cliente quando ele escolhe pagamento via Pix.
// Fixa aqui (não é mais editável pelo admin) — para trocar, edite este valor.
export const PIX_KEY = "64092685000126";
