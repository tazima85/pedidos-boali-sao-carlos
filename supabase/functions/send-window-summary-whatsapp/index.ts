// Supabase Edge Function — send-window-summary-whatsapp
//
// Chamada pelo admin (admin/js/admin.js), botão "Exportar Whats" na aba
// Pedido consolidado. Busca todos os pedidos de uma janela de horário e
// envia um resumo por WhatsApp (via Z-API) para o número informado pelo
// admin na hora — não vem de um número salvo no banco.
//
// Recebe { time_window_id, phone } e monta a mensagem inteira aqui a partir
// do banco (não aceita um texto livre do navegador), para não virar um
// "relay" capaz de mandar qualquer mensagem para qualquer número usando a
// conta Z-API do projeto.
//
// Segredos esperados (configurar em Supabase > Edge Functions > Secrets):
//   SUPABASE_URL, SUPABASE_ANON_KEY  — mesmos valores de js/config.js
//   ZAPI_INSTANCE_ID, ZAPI_TOKEN     — painel do Z-API > sua instância
//   ZAPI_CLIENT_TOKEN                — painel do Z-API > Segurança > Client-Token
//   (os mesmos segredos já usados pela function send-order-whatsapp)
//
// Deploy: cole este arquivo em Supabase > Edge Functions > New function
// (nome da function: send-window-summary-whatsapp). Não depende da Supabase CLI.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ZAPI_INSTANCE_ID = Deno.env.get("ZAPI_INSTANCE_ID")!;
const ZAPI_TOKEN = Deno.env.get("ZAPI_TOKEN")!;
const ZAPI_CLIENT_TOKEN = Deno.env.get("ZAPI_CLIENT_TOKEN") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function brl(value: number | null | undefined) {
  if (value === null || value === undefined) return "R$ 0,00";
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(d: string) {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function formatTime(t: string) {
  return t ? t.slice(0, 5) : "";
}

function formatDateTime(ts: string) {
  return new Date(ts).toLocaleString("pt-BR");
}

function formatQty(qty: number) {
  return qty > 1 ? ` (${qty}x)` : "";
}

type ExtraItem = {
  quantidade: number;
  extra_items: { nome: string; preco: number | null; categoria: string } | null;
};

type ProductRow = {
  quantidade: number;
  products: { nome: string; preco: number | null } | null;
};

type Order = {
  numero: number;
  nome_cliente: string;
  whatsapp_cliente: string;
  forma_pagamento: string;
  criado_em: string;
  order_products: ProductRow[] | null;
  order_extra_items: ExtraItem[] | null;
};

function formatExtrasList(list: ExtraItem[], emptyLabel: string) {
  if (!list.length) return emptyLabel;
  return list.map((oi) => `${oi.extra_items?.nome ?? ""}${formatQty(oi.quantidade)}`).join(", ");
}

function formatProductsList(list: ProductRow[], emptyLabel: string) {
  if (!list.length) return emptyLabel;
  return list.map((row) => `${row.products?.nome ?? ""}${formatQty(row.quantidade)}`).join(", ");
}

function orderItemsTotal(order: Order) {
  let total = 0;
  (order.order_products || []).forEach((row) => {
    total += Number(row.products?.preco || 0) * row.quantidade;
  });
  (order.order_extra_items || []).forEach((oi) => {
    total += Number(oi.extra_items?.preco || 0) * oi.quantidade;
  });
  return total;
}

function buildOrderBlock(order: Order) {
  const produtos = order.order_products || [];
  const extras = order.order_extra_items || [];
  const sucos = extras.filter((oi) => oi.extra_items?.categoria === "suco");
  const sobremesas = extras.filter((oi) => oi.extra_items?.categoria === "sobremesa");
  const pagamento = order.forma_pagamento === "pix" ? "Pix" : "Cartão";

  return `#${order.numero} - ${order.nome_cliente}
WhatsApp: ${order.whatsapp_cliente}
*Prato:* ${formatProductsList(produtos, "-")}
*Suco:* ${formatExtrasList(sucos, "Nenhum")}
*Sobremesa:* ${formatExtrasList(sobremesas, "Nenhuma")}
*Pagamento:* ${pagamento}
Enviado em: ${formatDateTime(order.criado_em)}`;
}

function buildMessage(windowLabel: string, orders: Order[]) {
  const byPagamento: Record<string, number> = { pix: 0, cartao: 0 };
  let total = 0;
  orders.forEach((o) => {
    byPagamento[o.forma_pagamento] = (byPagamento[o.forma_pagamento] || 0) + 1;
    total += orderItemsTotal(o);
  });

  const header = `Pedidos Velocity São Carlos

*Resumo Pedido:* ${windowLabel}

*Total de pedidos:* ${orders.length}
*Total geral:* ${brl(total)}
Pix: ${byPagamento.pix || 0} | Cartão: ${byPagamento.cartao || 0}`;

  const blocks = orders.map(buildOrderBlock);

  return [header, ...blocks].join("\n\n-------\n\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { time_window_id, phone } = await req.json();
    if (!time_window_id) {
      return jsonResponse({ error: "time_window_id é obrigatório" }, 400);
    }
    const phoneDigits = String(phone || "").replace(/\D/g, "");
    if (phoneDigits.length !== 11) {
      return jsonResponse({ error: "Telefone inválido, informe DDD + número (11 dígitos)" }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const { data: window, error: windowError } = await supabase
      .from("time_windows")
      .select("data, hora_inicio, hora_fim")
      .eq("id", time_window_id)
      .single();

    if (windowError || !window) {
      console.error("Janela não encontrada:", windowError);
      return jsonResponse({ error: "Janela de horário não encontrada" }, 404);
    }

    const { data: orders, error: ordersError } = await supabase
      .from("orders")
      .select(`
        numero, nome_cliente, whatsapp_cliente, forma_pagamento, criado_em,
        order_products(quantidade, products(nome, preco)),
        order_extra_items(quantidade, extra_items(nome, preco, categoria))
      `)
      .eq("time_window_id", time_window_id)
      .order("numero", { ascending: true });

    if (ordersError) {
      console.error("Erro ao buscar pedidos:", ordersError);
      return jsonResponse({ error: "Erro ao buscar pedidos" }, 500);
    }

    if (!orders || !orders.length) {
      return jsonResponse({ error: "Nenhum pedido nesta janela." }, 400);
    }

    const windowLabel = `${formatDate(window.data)} — ${formatTime(window.hora_inicio)} às ${formatTime(window.hora_fim)}`;
    const message = buildMessage(windowLabel, orders as unknown as Order[]);
    const phoneWithCountryCode = "55" + phoneDigits;

    const zapiRes = await fetch(
      `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-text`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(ZAPI_CLIENT_TOKEN ? { "Client-Token": ZAPI_CLIENT_TOKEN } : {}),
        },
        body: JSON.stringify({ phone: phoneWithCountryCode, message }),
      }
    );

    if (!zapiRes.ok) {
      const errText = await zapiRes.text();
      console.error("Erro do Z-API:", zapiRes.status, errText);
      return jsonResponse({ error: "Falha ao enviar WhatsApp" }, 502);
    }

    return jsonResponse({ ok: true });
  } catch (e) {
    console.error("Erro inesperado:", e);
    return jsonResponse({ error: String(e) }, 500);
  }
});
