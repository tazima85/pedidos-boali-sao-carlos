import { supabase, isSupabaseConfigured } from "./supabaseClient.js";

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

// ---------- State ----------
const state = {
  products: [],
  sucos: [],
  sobremesas: [],
  timeWindows: [],
  selectedProduct: null,
  selectedSuco: null,
  selectedSobremesa: null,
  paymentMethod: null,
  pixKey: "",
  activeWindow: null,
};

const els = {
  banner: document.getElementById("banner"),
  configWarning: document.getElementById("config-warning"),
  productsGrid: document.getElementById("products-grid"),
  sucosGrid: document.getElementById("sucos-grid"),
  sobremesasGrid: document.getElementById("sobremesas-grid"),
  paymentDetail: document.getElementById("payment-detail"),
  submitBtn: document.getElementById("submit-btn"),
  form: document.getElementById("order-form"),
  formMsg: document.getElementById("form-msg"),
  nome: document.getElementById("nome_cliente"),
  whatsapp: document.getElementById("whatsapp_cliente"),
  summaryProduct: document.getElementById("summary-product"),
  summarySuco: document.getElementById("summary-suco"),
  summarySobremesa: document.getElementById("summary-sobremesa"),
  summaryPayment: document.getElementById("summary-payment"),
  summaryTotal: document.getElementById("summary-total"),
};

function brl(value) {
  if (value === null || value === undefined || value === "") return null;
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatTime(t) {
  return t ? t.slice(0, 5) : "";
}

function formatDate(d) {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

// ---------- WhatsApp mask/validation ----------
// Brazilian cell numbers: 2-digit DDD + 9-digit number (with leading 9) = 11 digits.
function onlyDigits(str) {
  return (str || "").replace(/\D/g, "");
}

function formatWhatsapp(rawValue) {
  const digits = onlyDigits(rawValue).slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function isValidWhatsapp(value) {
  return onlyDigits(value).length === 11;
}

// ---------- Time window logic ----------
function windowRange(w) {
  const start = new Date(`${w.data}T${w.hora_inicio}`);
  const end = new Date(`${w.data}T${w.hora_fim}`);
  return { start, end };
}

function evaluateWindows(windows) {
  const now = new Date();
  const active = windows
    .filter((w) => w.ativa)
    .find((w) => {
      const { start, end } = windowRange(w);
      return now >= start && now <= end;
    });

  if (active) return { active, next: null };

  const next = windows
    .filter((w) => w.ativa)
    .map((w) => ({ w, ...windowRange(w) }))
    .filter(({ start }) => start > now)
    .sort((a, b) => a.start - b.start)[0];

  return { active: null, next: next ? next.w : null };
}

function renderBanner() {
  const { active, next } = evaluateWindows(state.timeWindows);
  state.activeWindow = active;

  if (active) {
    els.banner.className = "banner banner--open";
    els.banner.textContent = `Pedidos abertos agora até ${formatTime(active.hora_fim)}`;
  } else if (next) {
    els.banner.className = "banner banner--closed";
    els.banner.textContent = `Pedidos fechados no momento. Próxima janela: ${formatDate(next.data)} das ${formatTime(next.hora_inicio)} às ${formatTime(next.hora_fim)}`;
  } else {
    els.banner.className = "banner banner--closed";
    els.banner.textContent = "Pedidos fechados no momento.";
  }

  updateSubmitState();
}

// ---------- Data loading ----------
async function loadData() {
  const [productsRes, extrasRes, windowsRes, configRes] = await Promise.all([
    supabase.from("products").select("*").eq("ativo", true).order("nome"),
    supabase.from("extra_items").select("*").eq("ativo", true).order("nome"),
    supabase.from("time_windows").select("*").eq("ativa", true),
    supabase.from("config").select("pix_key").eq("id", 1).maybeSingle(),
  ]);

  if (productsRes.error || extrasRes.error || windowsRes.error) {
    els.formMsg.textContent = "Erro ao carregar dados do Supabase. Verifique a configuração.";
    els.formMsg.className = "form-msg form-msg--error";
    console.error(productsRes.error || extrasRes.error || windowsRes.error);
    return;
  }

  state.products = productsRes.data || [];
  state.sucos = (extrasRes.data || []).filter((i) => i.categoria === "suco");
  state.sobremesas = (extrasRes.data || []).filter((i) => i.categoria === "sobremesa");
  state.timeWindows = windowsRes.data || [];
  state.pixKey = configRes.data?.pix_key || "";

  renderProducts();
  renderExtras("sucos", state.sucos, els.sucosGrid);
  renderExtras("sobremesas", state.sobremesas, els.sobremesasGrid);
  renderBanner();
}

// ---------- Rendering: cards ----------
function renderProducts() {
  els.productsGrid.innerHTML = "";
  if (state.products.length === 0) {
    els.productsGrid.innerHTML = '<p class="empty-state">Nenhum prato disponível no momento.</p>';
    return;
  }
  state.products.forEach((p) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "pick-card";
    card.innerHTML = `
      <span class="pick-card__nome">${escapeHtml(p.nome)}</span>
      ${p.descricao ? `<span class="pick-card__desc">${escapeHtml(p.descricao)}</span>` : ""}
      ${p.preco != null ? `<span class="pick-card__preco">${brl(p.preco)}</span>` : ""}
    `;
    card.addEventListener("click", () => {
      state.selectedProduct = p;
      renderProducts();
      renderSummary();
      updateSubmitState();
    });
    if (state.selectedProduct?.id === p.id) card.classList.add("selected");
    els.productsGrid.appendChild(card);
  });
}

function renderExtras(kind, items, container) {
  container.innerHTML = "";

  const noneCard = document.createElement("button");
  noneCard.type = "button";
  noneCard.className = "pick-card pick-card--none";
  noneCard.textContent = "Nenhum";
  const isNoneSelected = kind === "sucos" ? !state.selectedSuco : !state.selectedSobremesa;
  if (isNoneSelected) noneCard.classList.add("selected");
  noneCard.addEventListener("click", () => {
    if (kind === "sucos") state.selectedSuco = null;
    else state.selectedSobremesa = null;
    renderExtras(kind, items, container);
    renderSummary();
  });
  container.appendChild(noneCard);

  if (items.length === 0) return;

  items.forEach((item) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "pick-card";
    card.innerHTML = `
      <span class="pick-card__nome">${escapeHtml(item.nome)}</span>
      ${item.preco != null ? `<span class="pick-card__preco">${brl(item.preco)}</span>` : ""}
    `;
    const selected = kind === "sucos" ? state.selectedSuco?.id === item.id : state.selectedSobremesa?.id === item.id;
    if (selected) card.classList.add("selected");
    card.addEventListener("click", () => {
      if (kind === "sucos") state.selectedSuco = item;
      else state.selectedSobremesa = item;
      renderExtras(kind, items, container);
      renderSummary();
    });
    container.appendChild(card);
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Payment ----------
document.querySelectorAll(".payment-option").forEach((btn) => {
  btn.addEventListener("click", () => {
    state.paymentMethod = btn.dataset.payment;
    document.querySelectorAll(".payment-option").forEach((b) => b.classList.toggle("selected", b === btn));

    if (state.paymentMethod === "pix") {
      els.paymentDetail.style.display = "block";
      els.paymentDetail.innerHTML = state.pixKey
        ? `Faça seu pix antes de finalizar o pedido e guarde o comprovante. Chave Pix: <code>${escapeHtml(state.pixKey)}</code>`
        : "Chave Pix ainda não configurada pelo admin.";
    } else {
      els.paymentDetail.style.display = "block";
      els.paymentDetail.textContent = "O pagamento será realizado na retirada.";
    }

    renderSummary();
    updateSubmitState();
  });
});

// ---------- Summary ----------
function renderSummary() {
  els.summaryProduct.textContent = state.selectedProduct
    ? `${state.selectedProduct.nome}${state.selectedProduct.preco != null ? ` — ${brl(state.selectedProduct.preco)}` : ""}`
    : "—";
  els.summarySuco.textContent = state.selectedSuco
    ? `${state.selectedSuco.nome}${state.selectedSuco.preco != null ? ` — ${brl(state.selectedSuco.preco)}` : ""}`
    : "Nenhum";
  els.summarySobremesa.textContent = state.selectedSobremesa
    ? `${state.selectedSobremesa.nome}${state.selectedSobremesa.preco != null ? ` — ${brl(state.selectedSobremesa.preco)}` : ""}`
    : "Nenhuma";
  els.summaryPayment.textContent = state.paymentMethod === "pix" ? "Pix" : state.paymentMethod === "cartao" ? "Cartão" : "—";

  const total =
    Number(state.selectedProduct?.preco || 0) +
    Number(state.selectedSuco?.preco || 0) +
    Number(state.selectedSobremesa?.preco || 0);
  els.summaryTotal.textContent = brl(total) || "R$ 0,00";
}

// ---------- Submit gating ----------
function updateSubmitState() {
  const ready =
    isSupabaseConfigured &&
    state.activeWindow &&
    state.selectedProduct &&
    state.paymentMethod &&
    els.nome.value.trim() &&
    isValidWhatsapp(els.whatsapp.value);
  els.submitBtn.disabled = !ready;
}

els.nome.addEventListener("input", updateSubmitState);

els.whatsapp.addEventListener("input", () => {
  const cursorAtEnd = els.whatsapp.selectionEnd === els.whatsapp.value.length;
  els.whatsapp.value = formatWhatsapp(els.whatsapp.value);
  if (cursorAtEnd) {
    els.whatsapp.selectionStart = els.whatsapp.selectionEnd = els.whatsapp.value.length;
  }
  updateSubmitState();
});

// ---------- Submit ----------
els.form.addEventListener("submit", async (e) => {
  e.preventDefault();
  els.formMsg.textContent = "";
  els.formMsg.className = "form-msg";

  if (!state.activeWindow) {
    els.formMsg.textContent = "Pedidos fechados no momento.";
    els.formMsg.className = "form-msg form-msg--error";
    return;
  }

  if (!isValidWhatsapp(els.whatsapp.value)) {
    els.formMsg.textContent = "Informe um WhatsApp válido, com DDD (11 dígitos).";
    els.formMsg.className = "form-msg form-msg--error";
    return;
  }

  els.submitBtn.disabled = true;
  els.submitBtn.textContent = "Enviando...";

  const { error } = await supabase.from("orders").insert({
    nome_cliente: els.nome.value.trim(),
    whatsapp_cliente: els.whatsapp.value.trim(),
    product_id: state.selectedProduct.id,
    suco_id: state.selectedSuco?.id || null,
    sobremesa_id: state.selectedSobremesa?.id || null,
    forma_pagamento: state.paymentMethod,
    time_window_id: state.activeWindow.id,
  });

  els.submitBtn.textContent = "Confirmar pedido";

  if (error) {
    console.error(error);
    els.formMsg.textContent = "Erro ao enviar pedido. Tente novamente.";
    els.formMsg.className = "form-msg form-msg--error";
    updateSubmitState();
    return;
  }

  els.formMsg.textContent = "Pedido enviado com sucesso!";
  els.formMsg.className = "form-msg form-msg--success";

  // Reset selections for a possible new order, keep window/products loaded
  state.selectedProduct = null;
  state.selectedSuco = null;
  state.selectedSobremesa = null;
  state.paymentMethod = null;
  els.form.reset();
  document.querySelectorAll(".payment-option").forEach((b) => b.classList.remove("selected"));
  els.paymentDetail.style.display = "none";
  renderProducts();
  renderExtras("sucos", state.sucos, els.sucosGrid);
  renderExtras("sobremesas", state.sobremesas, els.sobremesasGrid);
  renderSummary();
  updateSubmitState();
});

// ---------- Init ----------
function init() {
  if (!isSupabaseConfigured) {
    els.configWarning.style.display = "flex";
    els.banner.textContent = "Aguardando configuração do Supabase.";
    return;
  }
  loadData();
  // Re-evaluate the active window periodically in case it opens/closes
  // while a customer keeps the page open.
  setInterval(renderBanner, 60000);
  setInterval(loadData, 5 * 60000);
}

init();
