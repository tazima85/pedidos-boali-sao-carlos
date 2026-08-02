# Pedidos Boali São Carlos — Piloto Alunos Velocity

Site estático (HTML/CSS/JS puro, sem build) com duas páginas:

- `/` — página do cliente, onde ele monta e envia o pedido.
- `/admin/` — painel administrativo (sem login), onde se cadastram pratos, sucos,
  sobremesas, janelas de horário, a chave Pix e se vê o pedido consolidado.

Os dados (pedidos, produtos, janelas de horário, chave Pix) ficam no
[Supabase](https://supabase.com) (Postgres, plano gratuito), acessado direto do
navegador. Não há backend próprio — por isso o projeto funciona hospedado no
GitHub Pages.

## 1. Criar e configurar o projeto no Supabase

1. Crie uma conta e um projeto gratuito em [supabase.com](https://supabase.com).
2. No painel do projeto, abra **SQL Editor** → **New query**, cole o conteúdo de
   [`sql/schema.sql`](sql/schema.sql) e rode. Isso cria as tabelas `products`,
   `extra_items`, `time_windows`, `orders`, `order_extra_items`, `config` e as
   políticas de RLS (Row Level Security) que liberam o acesso necessário para
   o piloto.

   Se o projeto Supabase já existia antes de sucos/sobremesas múltiplos e do
   número sequencial de pedido, rode também, uma vez cada,
   [`sql/migration_002_numero_e_multiplos_extras.sql`](sql/migration_002_numero_e_multiplos_extras.sql) e
   [`sql/migration_003_multiplos_pratos.sql`](sql/migration_003_multiplos_pratos.sql)
   (nessa ordem) — migram os pedidos já salvos sem perder dados.
3. Em **Project Settings → API**, copie:
   - **Project URL**
   - **anon public key**
4. Cole os dois valores em [`js/config.js`](js/config.js):

   ```js
   export const SUPABASE_URL = "https://SEU-PROJETO.supabase.co";
   export const SUPABASE_ANON_KEY = "sua-anon-key-aqui";
   ```

   Esse arquivo é usado tanto pela página do cliente quanto pelo admin. A
   `anon key` é pública por design do Supabase (é a chave que o navegador do
   cliente usa) — a proteção fica por conta das policies de RLS definidas no
   `schema.sql`, não do sigilo dessa chave.

5. Cadastre pelo menos um prato, uma janela de horário e a chave Pix pelo
   painel `/admin/` antes de testar a página do cliente.

### ⚠️ Plano gratuito do Supabase pausa após 7 dias sem uso

Se o projeto do Supabase ficar 7 dias corridos sem nenhuma requisição, ele é
pausado automaticamente e precisa ser reativado manualmente em
**supabase.com → seu projeto → Restore/Resume**. Para um piloto usado com
frequência isso não deve ser problema, mas se ficar muito tempo sem uso,
reative antes de uma nova rodada de pedidos.

## 2. Confirmação automática por WhatsApp

Assim que um pedido é enviado em `/`, o site tenta avisar o cliente por
WhatsApp (mensagem com o número do pedido, itens, pagamento e horário de
retirada). Isso passa por uma **Supabase Edge Function** — não existe forma
seguro de mandar WhatsApp direto do navegador sem expor uma chave de API no
código público do site.

Essa etapa é opcional: se você pular, os pedidos continuam funcionando
normalmente, só não sai a mensagem de confirmação.

1. Crie uma conta em [z-api.io](https://www.z-api.io) e conecte um número de
   WhatsApp real escaneando o QR Code (igual ao WhatsApp Web).
2. No painel do Z-API, pegue **Instance ID** e **Token** (em Instâncias Web →
   sua instância). Depois vá em **Segurança → 3. Token de segurança da
   conta → Configurar agora** e ative o **Client-Token** (a Z-API manda um
   código de confirmação por e-mail/SMS/WhatsApp para validar) — sem isso o
   envio é rejeitado com erro `your client-token is not configured`. O valor
   só aparece uma vez, então copie e guarde assim que gerar.
3. No painel do Supabase, vá em **Edge Functions → New function**, dê o nome
   `send-order-whatsapp` e cole o conteúdo de
   [`supabase/functions/send-order-whatsapp/index.ts`](supabase/functions/send-order-whatsapp/index.ts).
   Não precisa instalar a Supabase CLI — dá para criar e publicar direto pelo
   editor do painel.
4. Em **Edge Functions → send-order-whatsapp → Secrets**, cadastre:

   | Nome | Valor |
   |---|---|
   | `SUPABASE_URL` | a mesma URL usada em `js/config.js` |
   | `SUPABASE_ANON_KEY` | a mesma anon key usada em `js/config.js` |
   | `ZAPI_INSTANCE_ID` | Instance ID do Z-API |
   | `ZAPI_TOKEN` | Token da instância do Z-API |
   | `ZAPI_CLIENT_TOKEN` | Client-Token de segurança da conta Z-API |

5. Teste pela própria aba de teste da function no painel do Supabase, enviando
   `{ "order_id": "uuid-de-um-pedido-existente" }` — confira se a mensagem
   chega no WhatsApp antes de testar pelo site.

O texto da mensagem fica todo dentro da function (`buildMessage` em
`index.ts`) — dá para editar aí sem mexer no resto do projeto.

## 3. Rodar localmente

Como as páginas usam ES Modules (`<script type="module">`), abrir os arquivos
`.html` direto do disco (`file://`) não funciona — o navegador bloqueia os
imports. Sirva a pasta com um servidor estático simples, por exemplo:

```bash
# na raiz do projeto
npx serve .
# ou
python -m http.server 8080
```

Depois acesse `http://localhost:PORTA/` (cliente) e
`http://localhost:PORTA/admin/` (admin).

## 4. Publicar no GitHub Pages

1. Suba o conteúdo desta pasta para um repositório no GitHub (a raiz do
   repositório deve ser a raiz deste projeto).
2. Em **Settings → Pages**, escolha a branch (ex.: `main`) e a pasta `/ (root)`.
3. Aguarde o deploy. O site fica em `https://SEU-USUARIO.github.io/SEU-REPO/`
   e o admin em `https://SEU-USUARIO.github.io/SEU-REPO/admin/`.

Todos os caminhos de CSS/JS/imagens no projeto são relativos (não começam com
`/`), então funcionam tanto em `http://localhost/` quanto no subcaminho
`/SEU-REPO/` do GitHub Pages, sem configuração extra.

O arquivo `.nojekyll` na raiz evita que o GitHub Pages processe o site com
Jekyll (não é necessário para este projeto, mas evita surpresas).

## 5. Logo

Coloque o arquivo da logo em [`assets/logo.png`](assets/logo.png) (fundo
laranja `#F7582E`, símbolo em creme `#FAF3E0`). Até lá — ou se o arquivo não
carregar — o cabeçalho mostra automaticamente um selo "BO" como fallback, então
o site não quebra sem a imagem.

## Estrutura do projeto

```
index.html            página do cliente
css/style.css          estilos compartilhados (cliente + admin)
js/config.js            credenciais do Supabase (edite aqui)
js/supabaseClient.js    inicialização do cliente Supabase
js/client.js             lógica da página do cliente
assets/logo.png         logo (adicione o arquivo)
admin/index.html        painel administrativo
admin/js/admin.js       lógica do admin (CRUD + consolidado)
sql/schema.sql                              tabelas + RLS para rodar no Supabase (projeto novo)
sql/migration_002_numero_e_multiplos_extras.sql  migração para projetos já existentes
sql/migration_003_multiplos_pratos.sql           migração para projetos já existentes
supabase/functions/send-order-whatsapp/index.ts  Edge Function que envia a confirmação por WhatsApp
```

## Modelo de dados

Ver [`sql/schema.sql`](sql/schema.sql) — tabelas `products`, `extra_items`
(sucos e sobremesas, diferenciados pelo campo `categoria`), `time_windows`,
`orders` (com `numero`, um contador sequencial legível começando em 100),
`order_products` (pratos escolhidos em cada pedido, com `quantidade`),
`order_extra_items` (sucos/sobremesas escolhidos em cada pedido, com
`quantidade`) — em ambos, um pedido pode ter vários itens, inclusive
repetido — e `config` (linha única com `pix_key`).

## Regras de negócio implementadas

- Pedido só é aceito se existir uma `time_window` ativa cujo intervalo
  (`data` + `hora_inicio`/`hora_fim`) contenha o momento atual no navegador do
  cliente. Fora da janela, o botão de enviar fica desabilitado e o banner
  mostra a próxima janela cadastrada (ou "pedidos fechados no momento", se não
  houver nenhuma futura).
- Nome, WhatsApp (validado como celular com DDD, 11 dígitos), pelo menos um
  prato e forma de pagamento são obrigatórios; suco e sobremesa são
  opcionais. Prato, suco e sobremesa aceitam seleção múltipla e quantidade
  por item (o mesmo item pode ser pedido mais de uma vez, por exemplo).
- Depois de confirmado, o resumo do pedido continua visível (com fonte mais
  clara) até o cliente montar um novo pedido — só nome e WhatsApp são
  limpos, para evitar reenvio sem querer.
- Sem controle de estoque e sem limite de pedidos por cliente/janela.
- Pix mostra a chave cadastrada em `/admin/`; Cartão mostra aviso de que o
  pagamento é combinado na entrega/retirada — nenhum dos dois integra gateway
  de pagamento.
- O admin não tem login: qualquer pessoa com o link `/admin/` consegue
  cadastrar produtos, janelas, a chave Pix e ver o consolidado. Isso é
  intencional para este piloto (ver escopo abaixo).
- O CSV exportado no consolidado usa `;` como separador (compatível com Excel
  em pt-BR) e é filtrado pela janela de horário selecionada.
- Ao enviar o pedido, o site tenta mandar uma confirmação por WhatsApp (ver
  seção 2). Se essa etapa não estiver configurada ou falhar, o pedido é salvo
  normalmente mesmo assim — a notificação nunca bloqueia o fluxo de compra.

## Fora de escopo neste piloto

Confirmação automática de pagamento Pix, gateway de cartão, login no admin,
controle de estoque e limite de "1 pedido por pessoa".
