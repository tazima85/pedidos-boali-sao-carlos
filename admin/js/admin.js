import { supabase, isSupabaseConfigured } from "../../js/supabaseClient.js";

// ---------- Logo fallback ----------
// type="module" scripts run after the <img> has already attempted to load,
// so a failed image may fire "error" before this listener attaches — check
// the already-failed state too, not just future error events.
const logoImg = document.getElementById("logo-img");
function showLogoFallback() {
  const fallback = document.createElement("div");
  fallback.className = "app-header__logo-fallback";
  fallback.textContent = "BO";
  logoImg.replaceWith(fallback);
}
if (logoImg.complete && logoImg.naturalWidth === 0) {
  showLogoFallback();
} else {
  logoImg.addEventListener("error", showLogoFallback, { once: true });
}

if (!isSupabaseConfigured) {
  document.getElementById("config-warning").style.display = "flex";
}

function brl(value) {
  if (value === null || value === undefined || value === "") return "—";
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function formatTime(t) {
  return t ? t.slice(0, 5) : "";
}

function formatDate(d) {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function formatDateTime(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleString("pt-BR");
}

// ---------- Tabs ----------
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
    if (btn.dataset.tab === "consolidado") loadConsolidadoWindows();
  });
});

// =========================================================
// Pratos (products)
// =========================================================
let editingProdutoId = null;
const formPrato = document.getElementById("form-prato");
const pratoNome = document.getElementById("prato-nome");
const pratoDesc = document.getElementById("prato-desc");
const pratoPreco = document.getElementById("prato-preco");
const pratoCancelEdit = document.getElementById("prato-cancel-edit");

async function loadPratos() {
  const { data, error } = await supabase.from("products").select("*").order("nome");
  if (error) { console.error(error); return; }
  const tbody = document.querySelector("#table-pratos tbody");
  tbody.innerHTML = "";
  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Nenhum prato cadastrado.</td></tr>';
    return;
  }
  data.forEach((p) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(p.nome)}</td>
      <td>${escapeHtml(p.descricao) || "—"}</td>
      <td>${brl(p.preco)}</td>
      <td><span class="badge ${p.ativo ? "badge--on" : "badge--off"}">${p.ativo ? "Ativo" : "Inativo"}</span></td>
      <td class="row-actions">
        <button class="btn btn-secondary btn-small" data-action="edit">Editar</button>
        <button class="btn btn-secondary btn-small" data-action="toggle">${p.ativo ? "Desativar" : "Ativar"}</button>
        <button class="btn btn-danger btn-small" data-action="delete">Excluir</button>
      </td>
    `;
    tr.querySelector('[data-action="edit"]').addEventListener("click", () => {
      editingProdutoId = p.id;
      pratoNome.value = p.nome;
      pratoDesc.value = p.descricao || "";
      pratoPreco.value = p.preco ?? "";
      pratoCancelEdit.style.display = "inline-block";
      formPrato.querySelector('button[type="submit"]').textContent = "Salvar alterações";
      pratoNome.focus();
    });
    tr.querySelector('[data-action="toggle"]').addEventListener("click", async () => {
      await supabase.from("products").update({ ativo: !p.ativo }).eq("id", p.id);
      loadPratos();
    });
    tr.querySelector('[data-action="delete"]').addEventListener("click", async () => {
      if (!confirm(`Excluir o prato "${p.nome}"? Pedidos já enviados que o referenciam serão mantidos.`)) return;
      const { error: delErr } = await supabase.from("products").delete().eq("id", p.id);
      if (delErr) alert("Não foi possível excluir (pode haver pedidos vinculados). Considere desativar em vez de excluir.");
      loadPratos();
    });
    tbody.appendChild(tr);
  });
}

function resetPratoForm() {
  editingProdutoId = null;
  formPrato.reset();
  pratoCancelEdit.style.display = "none";
  formPrato.querySelector('button[type="submit"]').textContent = "Adicionar prato";
}

pratoCancelEdit.addEventListener("click", resetPratoForm);

formPrato.addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    nome: pratoNome.value.trim(),
    descricao: pratoDesc.value.trim() || null,
    preco: pratoPreco.value === "" ? null : Number(pratoPreco.value),
  };
  if (editingProdutoId) {
    await supabase.from("products").update(payload).eq("id", editingProdutoId);
  } else {
    await supabase.from("products").insert(payload);
  }
  resetPratoForm();
  loadPratos();
});

// =========================================================
// Sucos & Sobremesas (extra_items)
// =========================================================
let editingExtraId = null;
const formExtra = document.getElementById("form-extra");
const extraCategoria = document.getElementById("extra-categoria");
const extraNome = document.getElementById("extra-nome");
const extraPreco = document.getElementById("extra-preco");
const extraCancelEdit = document.getElementById("extra-cancel-edit");

function renderExtraTable(tbodySelector, items, categoriaLabel) {
  const tbody = document.querySelector(tbodySelector);
  tbody.innerHTML = "";
  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty-state">Nenhum(a) ${categoriaLabel} cadastrado(a).</td></tr>`;
    return;
  }
  items.forEach((item) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(item.nome)}</td>
      <td>${brl(item.preco)}</td>
      <td><span class="badge ${item.ativo ? "badge--on" : "badge--off"}">${item.ativo ? "Ativo" : "Inativo"}</span></td>
      <td class="row-actions">
        <button class="btn btn-secondary btn-small" data-action="edit">Editar</button>
        <button class="btn btn-secondary btn-small" data-action="toggle">${item.ativo ? "Desativar" : "Ativar"}</button>
        <button class="btn btn-danger btn-small" data-action="delete">Excluir</button>
      </td>
    `;
    tr.querySelector('[data-action="edit"]').addEventListener("click", () => {
      editingExtraId = item.id;
      extraCategoria.value = item.categoria;
      extraNome.value = item.nome;
      extraPreco.value = item.preco ?? "";
      extraCancelEdit.style.display = "inline-block";
      formExtra.querySelector('button[type="submit"]').textContent = "Salvar alterações";
      extraNome.focus();
    });
    tr.querySelector('[data-action="toggle"]').addEventListener("click", async () => {
      await supabase.from("extra_items").update({ ativo: !item.ativo }).eq("id", item.id);
      loadExtras();
    });
    tr.querySelector('[data-action="delete"]').addEventListener("click", async () => {
      if (!confirm(`Excluir "${item.nome}"? Pedidos já enviados que o referenciam serão mantidos.`)) return;
      const { error: delErr } = await supabase.from("extra_items").delete().eq("id", item.id);
      if (delErr) alert("Não foi possível excluir (pode haver pedidos vinculados). Considere desativar em vez de excluir.");
      loadExtras();
    });
    tbody.appendChild(tr);
  });
}

async function loadExtras() {
  const { data, error } = await supabase.from("extra_items").select("*").order("nome");
  if (error) { console.error(error); return; }
  renderExtraTable("#table-sucos tbody", data.filter((i) => i.categoria === "suco"), "suco");
  renderExtraTable("#table-sobremesas tbody", data.filter((i) => i.categoria === "sobremesa"), "sobremesa");
}

function resetExtraForm() {
  editingExtraId = null;
  formExtra.reset();
  extraCancelEdit.style.display = "none";
  formExtra.querySelector('button[type="submit"]').textContent = "Adicionar item";
}

extraCancelEdit.addEventListener("click", resetExtraForm);

formExtra.addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    categoria: extraCategoria.value,
    nome: extraNome.value.trim(),
    preco: extraPreco.value === "" ? null : Number(extraPreco.value),
  };
  if (editingExtraId) {
    await supabase.from("extra_items").update(payload).eq("id", editingExtraId);
  } else {
    await supabase.from("extra_items").insert(payload);
  }
  resetExtraForm();
  loadExtras();
});

// =========================================================
// Janelas de horário (time_windows)
// =========================================================
let editingJanelaId = null;
const formJanela = document.getElementById("form-janela");
const janelaData = document.getElementById("janela-data");
const janelaInicio = document.getElementById("janela-inicio");
const janelaFim = document.getElementById("janela-fim");
const janelaCancelEdit = document.getElementById("janela-cancel-edit");

async function loadJanelas() {
  const { data, error } = await supabase.from("time_windows").select("*").order("data", { ascending: false }).order("hora_inicio", { ascending: false });
  if (error) { console.error(error); return; }
  const tbody = document.querySelector("#table-janelas tbody");
  tbody.innerHTML = "";
  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Nenhuma janela cadastrada.</td></tr>';
    return;
  }
  data.forEach((w) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${formatDate(w.data)}</td>
      <td>${formatTime(w.hora_inicio)}</td>
      <td>${formatTime(w.hora_fim)}</td>
      <td><span class="badge ${w.ativa ? "badge--on" : "badge--off"}">${w.ativa ? "Ativa" : "Inativa"}</span></td>
      <td class="row-actions">
        <button class="btn btn-secondary btn-small" data-action="edit">Editar</button>
        <button class="btn btn-secondary btn-small" data-action="toggle">${w.ativa ? "Desativar" : "Ativar"}</button>
        <button class="btn btn-danger btn-small" data-action="delete">Excluir</button>
      </td>
    `;
    tr.querySelector('[data-action="edit"]').addEventListener("click", () => {
      editingJanelaId = w.id;
      janelaData.value = w.data;
      janelaInicio.value = w.hora_inicio;
      janelaFim.value = w.hora_fim;
      janelaCancelEdit.style.display = "inline-block";
      formJanela.querySelector('button[type="submit"]').textContent = "Salvar alterações";
      janelaData.focus();
    });
    tr.querySelector('[data-action="toggle"]').addEventListener("click", async () => {
      await supabase.from("time_windows").update({ ativa: !w.ativa }).eq("id", w.id);
      loadJanelas();
    });
    tr.querySelector('[data-action="delete"]').addEventListener("click", async () => {
      if (!confirm("Excluir esta janela de horário?")) return;
      const { error: delErr } = await supabase.from("time_windows").delete().eq("id", w.id);
      if (delErr) alert("Não foi possível excluir (pode haver pedidos vinculados a esta janela).");
      loadJanelas();
    });
    tbody.appendChild(tr);
  });
}

function resetJanelaForm() {
  editingJanelaId = null;
  formJanela.reset();
  janelaCancelEdit.style.display = "none";
  formJanela.querySelector('button[type="submit"]').textContent = "Adicionar janela";
}

janelaCancelEdit.addEventListener("click", resetJanelaForm);

formJanela.addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    data: janelaData.value,
    hora_inicio: janelaInicio.value,
    hora_fim: janelaFim.value,
  };
  if (payload.hora_fim <= payload.hora_inicio) {
    alert("A hora de fim deve ser depois da hora de início.");
    return;
  }
  if (editingJanelaId) {
    await supabase.from("time_windows").update(payload).eq("id", editingJanelaId);
  } else {
    await supabase.from("time_windows").insert(payload);
  }
  resetJanelaForm();
  loadJanelas();
});

// =========================================================
// Chave Pix (config)
// =========================================================
const formPix = document.getElementById("form-pix");
const pixKeyInput = document.getElementById("pix-key");
const pixMsg = document.getElementById("pix-msg");

async function loadPix() {
  const { data, error } = await supabase.from("config").select("pix_key").eq("id", 1).maybeSingle();
  if (error) { console.error(error); return; }
  pixKeyInput.value = data?.pix_key || "";
}

formPix.addEventListener("submit", async (e) => {
  e.preventDefault();
  const { error } = await supabase.from("config").update({ pix_key: pixKeyInput.value.trim() }).eq("id", 1);
  pixMsg.textContent = error ? "Erro ao salvar a chave Pix." : "Chave Pix salva com sucesso.";
  pixMsg.className = `form-msg ${error ? "form-msg--error" : "form-msg--success"}`;
});

// =========================================================
// Pedido consolidado
// =========================================================
const consolidadoJanelaSelect = document.getElementById("consolidado-janela");
const consolidadoStats = document.getElementById("consolidado-stats");
const consolidadoTbody = document.querySelector("#table-consolidado tbody");
const btnExportCsv = document.getElementById("btn-export-csv");

let currentOrders = [];
let currentWindowLabel = "";

async function loadConsolidadoWindows() {
  const { data, error } = await supabase.from("time_windows").select("*").order("data", { ascending: false }).order("hora_inicio", { ascending: false });
  if (error) { console.error(error); return; }
  const previousValue = consolidadoJanelaSelect.value;
  consolidadoJanelaSelect.innerHTML = "";
  if (!data.length) {
    consolidadoJanelaSelect.innerHTML = '<option value="">Nenhuma janela cadastrada</option>';
    consolidadoTbody.innerHTML = '<tr><td colspan="7" class="empty-state">Nenhuma janela cadastrada.</td></tr>';
    consolidadoStats.innerHTML = "";
    return;
  }
  data.forEach((w) => {
    const opt = document.createElement("option");
    opt.value = w.id;
    opt.textContent = `${formatDate(w.data)} — ${formatTime(w.hora_inicio)} às ${formatTime(w.hora_fim)}${w.ativa ? "" : " (inativa)"}`;
    consolidadoJanelaSelect.appendChild(opt);
  });
  consolidadoJanelaSelect.value = data.some((w) => w.id === previousValue) ? previousValue : data[0].id;
  loadConsolidadoOrders();
}

consolidadoJanelaSelect.addEventListener("change", loadConsolidadoOrders);

async function loadConsolidadoOrders() {
  const windowId = consolidadoJanelaSelect.value;
  if (!windowId) return;
  currentWindowLabel = consolidadoJanelaSelect.options[consolidadoJanelaSelect.selectedIndex]?.textContent || "";

  const { data, error } = await supabase
    .from("orders")
    .select(`
      *,
      products(nome, preco),
      suco:extra_items!orders_suco_id_fkey(nome, preco),
      sobremesa:extra_items!orders_sobremesa_id_fkey(nome, preco)
    `)
    .eq("time_window_id", windowId)
    .order("criado_em", { ascending: true });

  if (error) {
    console.error(error);
    consolidadoTbody.innerHTML = '<tr><td colspan="7" class="empty-state">Erro ao carregar pedidos.</td></tr>';
    return;
  }

  currentOrders = data || [];
  renderConsolidadoTable();
  renderConsolidadoStats();
}

function renderConsolidadoTable() {
  consolidadoTbody.innerHTML = "";
  if (!currentOrders.length) {
    consolidadoTbody.innerHTML = '<tr><td colspan="7" class="empty-state">Nenhum pedido nesta janela.</td></tr>';
    return;
  }
  currentOrders.forEach((o) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(o.nome_cliente)}</td>
      <td>${escapeHtml(o.whatsapp_cliente)}</td>
      <td>${escapeHtml(o.products?.nome) || "—"}</td>
      <td>${escapeHtml(o.suco?.nome) || "—"}</td>
      <td>${escapeHtml(o.sobremesa?.nome) || "—"}</td>
      <td>${o.forma_pagamento === "pix" ? "Pix" : "Cartão"}</td>
      <td>${formatDateTime(o.criado_em)}</td>
    `;
    consolidadoTbody.appendChild(tr);
  });
}

function renderConsolidadoStats() {
  const byPrato = {};
  const byExtra = {};
  const byPagamento = { pix: 0, cartao: 0 };
  let total = 0;

  currentOrders.forEach((o) => {
    const pratoNomeLabel = o.products?.nome || "—";
    byPrato[pratoNomeLabel] = (byPrato[pratoNomeLabel] || 0) + 1;

    if (o.suco?.nome) byExtra[o.suco.nome] = (byExtra[o.suco.nome] || 0) + 1;
    if (o.sobremesa?.nome) byExtra[o.sobremesa.nome] = (byExtra[o.sobremesa.nome] || 0) + 1;

    byPagamento[o.forma_pagamento] = (byPagamento[o.forma_pagamento] || 0) + 1;

    total += Number(o.products?.preco || 0) + Number(o.suco?.preco || 0) + Number(o.sobremesa?.preco || 0);
  });

  function listHtml(obj, emptyLabel) {
    const entries = Object.entries(obj);
    if (!entries.length) return `<p class="empty-state">${emptyLabel}</p>`;
    return `<ul>${entries.map(([k, v]) => `<li>${escapeHtml(k)}: <strong>${v}</strong></li>`).join("")}</ul>`;
  }

  consolidadoStats.innerHTML = `
    <div class="stat-box">
      <h3>Total de pedidos</h3>
      <p style="font-size:1.5rem; font-weight:700; margin:0;">${currentOrders.length}</p>
      <p style="margin:0.35rem 0 0; font-size:0.85rem;">Soma dos itens: <strong>${brl(total)}</strong></p>
    </div>
    <div class="stat-box">
      <h3>Por prato</h3>
      ${listHtml(byPrato, "Nenhum pedido.")}
    </div>
    <div class="stat-box">
      <h3>Por suco / sobremesa</h3>
      ${listHtml(byExtra, "Nenhum item extra pedido.")}
    </div>
    <div class="stat-box">
      <h3>Por forma de pagamento</h3>
      <ul>
        <li>Pix: <strong>${byPagamento.pix || 0}</strong></li>
        <li>Cartão: <strong>${byPagamento.cartao || 0}</strong></li>
      </ul>
    </div>
  `;
}

function csvEscape(value) {
  const str = String(value ?? "");
  if (/[",\n;]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

btnExportCsv.addEventListener("click", () => {
  if (!currentOrders.length) {
    alert("Não há pedidos para exportar nesta janela.");
    return;
  }
  const headers = ["Nome", "WhatsApp", "Prato", "Suco", "Sobremesa", "Pagamento", "Enviado em"];
  const rows = currentOrders.map((o) => [
    o.nome_cliente,
    o.whatsapp_cliente,
    o.products?.nome || "",
    o.suco?.nome || "",
    o.sobremesa?.nome || "",
    o.forma_pagamento === "pix" ? "Pix" : "Cartão",
    formatDateTime(o.criado_em),
  ]);
  const csv = [headers, ...rows].map((r) => r.map(csvEscape).join(";")).join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safeLabel = currentWindowLabel.replace(/[^\w\d-]+/g, "_");
  a.download = `pedidos_${safeLabel || "janela"}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

// ---------- Init ----------
function init() {
  if (!isSupabaseConfigured) return;
  loadPratos();
  loadExtras();
  loadJanelas();
  loadPix();
  loadConsolidadoWindows();
}

init();
