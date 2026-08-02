// Supabase Edge Function — send-order-whatsapp
//
// Chamada pelo site (js/client.js) logo após um pedido ser gravado. Busca o
// pedido completo no banco, monta a mensagem de confirmação e envia via
// Z-API (gateway de WhatsApp) para o número informado no pedido.
//
// Segredos esperados (configurar em Supabase > Edge Functions > Secrets):
//   SUPABASE_URL, SUPABASE_ANON_KEY  — mesmos valores de js/config.js
//   ZAPI_INSTANCE_ID, ZAPI_TOKEN     — painel do Z-API > sua instância
//   ZAPI_CLIENT_TOKEN                — painel do Z-API > Segurança > Client-Token
//
// Deploy: cole este arquivo em Supabase > Edge Functions > New function
// (nome da function: send-order-whatsapp). Não depende da Supabase CLI.

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

function formatExtrasList(list: ExtraItem[], emptyLabel: string) {
  if (!list.length) return emptyLabel;
  return list.map((oi) => `${oi.extra_items?.nome ?? ""}${formatQty(oi.quantidade)}`).join(", ");
}

function formatProductsList(list: ProductRow[], emptyLabel: string) {
  if (!list.length) return emptyLabel;
  return list.map((row) => `${row.products?.nome ?? ""}${formatQty(row.quantidade)}`).join(", ");
}

// Data/hora limite de retirada: fim da janela de horário + 45 minutos.
function pickupDeadline(data: string, horaFim: string) {
  const dt = new Date(`${data}T${horaFim}`);
  dt.setMinutes(dt.getMinutes() + 45);
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const yyyy = dt.getFullYear();
  const hh = String(dt.getHours()).padStart(2, "0");
  const mi = String(dt.getMinutes()).padStart(2, "0");
  return { date: `${dd}/${mm}/${yyyy}`, time: `${hh}:${mi}` };
}

function buildMessage(order: any) {
  const produtos: ProductRow[] = order.order_products || [];
  const extras: ExtraItem[] = order.order_extra_items || [];
  const sucos = extras.filter((oi) => oi.extra_items?.categoria === "suco");
  const sobremesas = extras.filter((oi) => oi.extra_items?.categoria === "sobremesa");

  let total = 0;
  produtos.forEach((row) => {
    total += Number(row.products?.preco || 0) * row.quantidade;
  });
  extras.forEach((oi) => {
    total += Number(oi.extra_items?.preco || 0) * oi.quantidade;
  });

  const pagamento = order.forma_pagamento === "pix" ? "Pix" : "Cartão (pagar na retirada)";
  const deadline = pickupDeadline(order.time_windows.data, order.time_windows.hora_fim);

  return `Olá ${order.nome_cliente}, seu pedido #${order.numero} na Boali São Carlos foi recebido!

*Prato:* ${formatProductsList(produtos, "-")}
*Suco:* ${formatExtrasList(sucos, "Nenhum")}
*Sobremesa:* ${formatExtrasList(sobremesas, "Nenhuma")}
*Pagamento:* ${pagamento}
*Total:* ${brl(total)}

Retirada: ${formatDate(order.time_windows.data)} até ${deadline.time}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { order_id } = await req.json();
    if (!order_id) {
      return jsonResponse({ error: "order_id é obrigatório" }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const { data: order, error } = await supabase
      .from("orders")
      .select(`
        *,
        order_products(quantidade, products(nome, preco)),
        time_windows(data, hora_inicio, hora_fim),
        order_extra_items(quantidade, extra_items(nome, preco, categoria))
      `)
      .eq("id", order_id)
      .single();

    if (error || !order) {
      console.error("Pedido não encontrado:", error);
      return jsonResponse({ error: "Pedido não encontrado" }, 404);
    }

    const message = buildMessage(order);
    const phone = "55" + String(order.whatsapp_cliente || "").replace(/\D/g, "");

    const zapiRes = await fetch(
      `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-text`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(ZAPI_CLIENT_TOKEN ? { "Client-Token": ZAPI_CLIENT_TOKEN } : {}),
        },
        body: JSON.stringify({ phone, message }),
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
