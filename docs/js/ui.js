/**
 * Presentation helpers: icons, toasts, modals, receipts.
 * Views stay declarative; everything imperative lives here.
 */

import { esc, digits, money, fmtDateTime, toDate } from './util.js';

// ── Icons ───────────────────────────────────────────────────────────────────

const PATHS = {
  grid: '<rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2"/>',
  receipt: '<path d="M5 3.5h14v17l-2.8-1.8-2.8 1.8-2.8-1.8L7.8 20.5 5 18.7z"/><path d="M9 8h6M9 12h6"/>',
  chart: '<path d="M3.5 20.5h17"/><rect x="5" y="11" width="3.5" height="6.5" rx="1"/><rect x="10.5" y="6.5" width="3.5" height="11" rx="1"/><rect x="16" y="9" width="3.5" height="8.5" rx="1"/>',
  settings: '<circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.9 19.3a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9v.06A1.7 1.7 0 0 0 21 10.1h.09a2 2 0 1 1 0 4H21a1.7 1.7 0 0 0-1.6 1.03z"/>',
  cart: '<circle cx="9.5" cy="20" r="1.6"/><circle cx="18" cy="20" r="1.6"/><path d="M2.5 3.5h2.6l2.4 11.2h11.3l1.7-7.7H6.4"/>',
  user: '<circle cx="12" cy="8" r="3.8"/><path d="M4.5 21c.7-3.8 3.9-5.6 7.5-5.6s6.8 1.8 7.5 5.6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.9-3.9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  refresh: '<path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1"/><path d="M20.5 4.5V10h-5.4"/>',
  whatsapp: '<path d="M20.4 11.6a8.4 8.4 0 0 1-12.5 7.4L3.6 20.4l1.4-4.2a8.4 8.4 0 1 1 15.4-4.6z"/><path d="M8.8 8.2c.4 2.7 2.4 4.7 5.1 5.2.6.1 1.2-.3 1.3-.9l.1-.6-2-.8-.7.7a5 5 0 0 1-2.1-2.2l.7-.7-.8-2-.6.1c-.6.1-1 .7-.9 1.3z"/>',
  print: '<path d="M7 9V3.5h10V9"/><rect x="3.5" y="9" width="17" height="7.5" rx="2"/><path d="M7 14h10v6.5H7z"/>',
  trash: '<path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l.9 13.5h9.2L17.5 7"/><path d="M10.5 11v6M13.5 11v6"/>',
  check: '<path d="M4.5 12.5l5 5 10-11"/>',
  alert: '<path d="M12 3.5l9 16H3z"/><path d="M12 9.5v4.5M12 17h.01"/>',
  arrowRight: '<path d="M4.5 12h15M13 5.5l6.5 6.5-6.5 6.5"/>',
  download: '<path d="M12 3.5v11M7.5 10.5L12 15l4.5-4.5"/><path d="M4.5 19.5h15"/>',
  logout: '<path d="M15 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2H15"/><path d="M17.5 8.5L21 12l-3.5 3.5M21 12H10"/>',
  edit: '<path d="M4.5 19.5h4L20 8a2.1 2.1 0 0 0-3-3L5.5 16.5z"/>',
  package: '<path d="M12 3.5l8 4.2v8.6l-8 4.2-8-4.2V7.7z"/><path d="M4 7.7l8 4.3 8-4.3M12 12v8.5"/>',
  users: '<circle cx="9" cy="8" r="3.4"/><path d="M2.8 20.5c.6-3.4 3.2-5 6.2-5s5.6 1.6 6.2 5"/><path d="M16 5.2a3.4 3.4 0 0 1 0 6.6M17.5 15.6c2 .6 3.3 2.2 3.7 4.9"/>',
  cloud: '<path d="M7.5 18.5h9.8a3.7 3.7 0 0 0 .3-7.4 5.6 5.6 0 0 0-10.8-1.4 4.4 4.4 0 0 0 .7 8.8z"/>',
  wifiOff: '<path d="M2 2l20 20"/><path d="M8.5 15.5a5 5 0 0 1 7 0"/><path d="M5 12a10 10 0 0 1 3-2M19 12a10 10 0 0 0-6.5-2.9"/><path d="M12 19h.01"/>',
  filter: '<path d="M4 5.5h16l-6.2 7.4V20l-3.6-2v-5.1z"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 1.8"/>',
  bolt: '<path d="M13.5 2.5L5 13.8h5.3L9.8 21.5 19 10h-5.6z"/>',
  dot: '<circle cx="12" cy="12" r="3"/>',
};

export function icon(name, size = 20) {
  const body = PATHS[name] || PATHS.dot;
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}

/** Swaps every `<i data-icon="cart">` in the tree for real SVG markup. */
export function hydrateIcons(root = document) {
  for (const node of root.querySelectorAll('[data-icon]')) {
    if (node.dataset.hydrated === '1') continue;
    node.innerHTML = icon(node.dataset.icon, Number(node.dataset.size) || 20);
    node.dataset.hydrated = '1';
  }
}

// ── Toasts ──────────────────────────────────────────────────────────────────

export function toast(message, kind = 'info') {
  const stack = document.getElementById('toastStack');
  if (!stack) return;
  const node = document.createElement('div');
  node.className = kind === 'error' ? 'toast toast--error' : kind === 'ok' ? 'toast toast--ok' : 'toast';
  node.textContent = message;
  stack.appendChild(node);
  setTimeout(() => node.remove(), 3600);
  while (stack.children.length > 4) stack.firstElementChild.remove();
}

// ── Modal ───────────────────────────────────────────────────────────────────

const modalEl = () => document.getElementById('modal');
const panelEl = () => document.getElementById('modalPanel');

let modalCloser = null;

export function openModal({ title = '', body = '', footer = '', onMount, dismissible = true } = {}) {
  const modal = modalEl();
  const panel = panelEl();
  if (!modal || !panel) return null;

  panel.innerHTML = `
    <div class="modal__head">
      <h3>${esc(title)}</h3>
      <button class="modal__close" type="button" data-close aria-label="Close">${icon('close')}</button>
    </div>
    <div class="modal__body">${body}</div>
    ${footer ? `<div class="modal__foot">${footer}</div>` : ''}
  `;

  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';

  const close = () => closeModal();
  modalCloser = close;

  panel.querySelectorAll('[data-close]').forEach((btn) => btn.addEventListener('click', close));
  modal.onclick = (event) => {
    if (event.target === modal && dismissible) close();
  };

  document.addEventListener('keydown', onEscape);
  if (typeof onMount === 'function') onMount(panel, close);
  const focusable = panel.querySelector('input, select, textarea, button:not([data-close])');
  if (focusable) setTimeout(() => focusable.focus({ preventScroll: true }), 60);
  return panel;
}

function onEscape(event) {
  if (event.key === 'Escape') closeModal();
}

export function closeModal() {
  const modal = modalEl();
  if (!modal || !modal.classList.contains('is-open')) return;
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
  modal.onclick = null;
  document.body.style.overflow = '';
  document.removeEventListener('keydown', onEscape);
  setTimeout(() => {
    const panel = panelEl();
    if (panel && !modal.classList.contains('is-open')) panel.innerHTML = '';
  }, 220);
  if (modalCloser) {
    const fn = modalCloser;
    modalCloser = null;
    try {
      fn();
    } catch { /* ignore */ }
  }
}

export function confirmAction({
  title = 'Are you sure?',
  message = '',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  input = null,
} = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
      closeModal();
    };

    openModal({
      title,
      body: `
        <p style="font-size:14px;color:var(--muted);line-height:1.6">${esc(message)}</p>
        ${input ? `<label class="field" style="margin-top:16px"><span>${esc(input.label || '')}</span>
          <input class="input" data-confirm-input type="${esc(input.type || 'text')}"
            inputmode="${esc(input.inputmode || 'text')}" value="${esc(input.value || '')}"
            placeholder="${esc(input.placeholder || '')}"></label>` : ''}
      `,
      footer: `
        <button class="btn btn--ghost" type="button" data-cancel>${esc(cancelLabel)}</button>
        <button class="btn ${danger ? 'btn--danger' : 'btn--primary'}" type="button" data-ok>${esc(confirmLabel)}</button>
      `,
      onMount(panel, close) {
        panel.querySelector('[data-cancel]')?.addEventListener('click', () => finish(false));
        panel.querySelector('[data-ok]')?.addEventListener('click', () => {
          const field = panel.querySelector('[data-confirm-input]');
          finish(input ? (field?.value ?? '') : true);
        });
        panel.querySelector('[data-confirm-input]')?.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            const field = panel.querySelector('[data-confirm-input]');
            finish(field?.value ?? '');
          }
        });
        panel.closest('.modal').addEventListener('click', (event) => {
          if (event.target.classList.contains('modal')) close();
        });
      },
    });

    // Dismissing with the X resolves false.
    const modal = modalEl();
    const observer = new MutationObserver(() => {
      if (!modal.classList.contains('is-open')) {
        finish(input ? null : false);
        observer.disconnect();
      }
    });
    observer.observe(modal, { attributes: true, attributeFilter: ['class'] });
  });
}

// ── Receipts & messaging ────────────────────────────────────────────────────

const SEP = '-'.repeat(32);

export function receiptText(order, settings = {}) {
  const currency = settings.currency || 'BDT';
  const lines = [];
  lines.push(String(settings.branch_name || 'Mohammadpur Stock Point').toUpperCase());
  if (settings.business_address) lines.push(String(settings.business_address));
  if (settings.business_phone) lines.push(`Tel: ${settings.business_phone}`);
  lines.push(SEP);
  lines.push(`Order   : ${order.order_number || ''}`);
  lines.push(`Date    : ${fmtDateTime(order.created_at)}`);
  lines.push(`Customer: ${order.customer_name || 'Walk-in customer'}`);
  if (order.dxn_member_id) lines.push(`Member  : ${order.dxn_member_id}`);
  lines.push(`Payment : ${order.payment_method || 'CASH'}`);
  lines.push(SEP);

  for (const item of order.items || []) {
    lines.push(`${String(item.name).slice(0, 22).padEnd(22)} x${item.quantity}`);
    lines.push(`  @ ${Number(item.unit_price).toFixed(2)} = ${Number(item.line_total).toFixed(2)}`);
  }

  lines.push(SEP);
  if (Number(order.discount) > 0) {
    lines.push(`Subtotal: ${Number(order.subtotal).toFixed(2)}`);
    lines.push(`Discount: -${Number(order.discount).toFixed(2)}`);
  }
  lines.push(`TOTAL   : ${Number(order.total_amount).toFixed(2)} ${currency}`);
  lines.push(`PV      : ${Number(order.total_pv).toFixed(2)}`);
  lines.push(SEP);
  if (settings.receipt_footer) lines.push(String(settings.receipt_footer));
  return lines.join('\n');
}

/** WhatsApp message with the same information as the receipt, minus the rules. */
export function orderMessage(order, settings = {}) {
  const currency = settings.currency || 'BDT';
  const lines = [];
  lines.push(`*${settings.branch_name || 'Mohammadpur Stock Point'}*`);
  lines.push(`Order ${order.order_number}`);
  if (order.created_at) lines.push(fmtDateTime(order.created_at));
  lines.push('');
  lines.push(`Customer: ${order.customer_name}`);
  if (order.dxn_member_id) lines.push(`DXN ID: ${order.dxn_member_id}`);
  lines.push('');
  for (const item of order.items || []) {
    lines.push(`• ${item.name} × ${item.quantity} — ${money(item.line_total, currency)}`);
  }
  lines.push('');
  if (Number(order.discount) > 0) {
    lines.push(`Subtotal: ${money(order.subtotal, currency)}`);
    lines.push(`Discount: -${money(order.discount, currency)}`);
  }
  lines.push(`*Total: ${money(order.total_amount, currency)}*`);
  lines.push(`PV: ${Number(order.total_pv).toFixed(2)}`);
  lines.push(`Payment: ${order.payment_method}`);
  if (settings.receipt_footer) {
    lines.push('');
    lines.push(settings.receipt_footer);
  }
  return lines.join('\n');
}

export function waLink(number, text) {
  const phone = digits(number);
  const encoded = encodeURIComponent(text);
  return phone ? `https://wa.me/${phone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
}

export function printNow() {
  window.print();
}

// ── Fragments ───────────────────────────────────────────────────────────────

export function emptyState(title, text, iconName = 'package') {
  return `
    <div class="empty">
      <div class="empty__icon">${icon(iconName, 44)}</div>
      <h3>${esc(title)}</h3>
      <p>${esc(text)}</p>
    </div>
  `;
}

export function statusBadge(status) {
  const map = {
    PENDING: 'warn',
    CONFIRMED: 'info',
    PACKED: 'info',
    DELIVERED: 'ok',
    CANCELLED: 'danger',
  };
  return `<span class="badge badge--${map[status] || 'muted'}">${esc(status || 'UNKNOWN')}</span>`;
}

export function stockBadge(product) {
  const qty = Number(product.stock_qty) || 0;
  if (qty <= 0) return '<span class="badge badge--danger">Out of stock</span>';
  const threshold = Math.max(Number(product.low_stock_at) || 5, 5);
  if (qty <= threshold) return '<span class="badge badge--warn">Low stock</span>';
  return '<span class="badge badge--ok">In stock</span>';
}

export function syncLabel(state) {
  switch (state) {
    case 'syncing': return 'Syncing…';
    case 'online': return 'Live';
    case 'pending': return 'Sending…';
    case 'offline': return 'Offline';
    case 'error': return 'Sync error';
    case 'local': return 'Not connected';
    default: return 'Ready';
  }
}

export function dayLabel(isoDay) {
  const date = toDate(`${isoDay}T00:00:00Z`);
  if (!date) return isoDay;
  return date.toLocaleDateString(undefined, { weekday: 'short' });
}
