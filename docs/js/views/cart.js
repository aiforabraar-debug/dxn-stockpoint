/**
 * The cart drawer: lines, customer details, totals, checkout.
 *
 * Checkout never talks to the network directly — it hands the sale to the
 * outbox, which survives a refresh and retries until the server confirms it.
 */

import { esc, money, round2, digits, int } from '../util.js';
import { icon, emptyState, openModal, closeModal, toast, receiptText, waLink, printNow } from '../ui.js';
import * as store from '../store.js';
import { hasBase } from '../api.js';

const PAYMENTS = ['CASH', 'BKASH', 'NAGAD', 'CARD', 'BANK TRANSFER'];

function lineRow(line) {
  const currency = store.currency();
  const atMax = line.qty >= line.available;
  const photo = store.imageFor(line.product);
  return `
    <div class="cart-row" data-line="${line.productId}">
      ${photo ? `<img class="cart-row__thumb" src="${esc(photo)}" alt="" loading="lazy" decoding="async" onerror="this.remove()">` : ''}
      <div class="cart-row__main">
        <div class="cart-row__name">${esc(line.product.name)}</div>
        <div class="cart-row__meta">${money(line.price, currency)} each · ${line.linePv ? `${line.linePv.toFixed(0)} PV` : 'no PV'}</div>
      </div>
      <div class="stepper">
        <button type="button" data-dec="${line.productId}" aria-label="Decrease">${icon('minus', 14)}</button>
        <span>${line.qty}</span>
        <button type="button" data-inc="${line.productId}" aria-label="Increase" ${atMax ? 'disabled' : ''}>${icon('plus', 14)}</button>
      </div>
      <div style="text-align:right;min-width:74px">
        <div style="font-size:13px;font-weight:800">${money(line.lineTotal, currency)}</div>
        <button type="button" data-remove="${line.productId}" style="font-size:10.5px;color:var(--muted)">remove</button>
      </div>
    </div>
  `;
}

export function renderCart(body, foot) {
  if (!body || !foot) return;
  const totals = store.cartTotals();
  const currency = store.currency();
  const { sale } = store.state;

  if (!totals.lines.length) {
    body.innerHTML = emptyState('The cart is empty', 'Tap Add on any product to start a sale.', 'cart');
    foot.innerHTML = `
      <button class="btn btn--ghost btn--block" type="button" data-close-cart>Keep browsing</button>
    `;
    foot.querySelector('[data-close-cart]').addEventListener('click', () => closeCart());
    return;
  }

  body.innerHTML = `
    ${totals.lines.map(lineRow).join('')}

    <div class="card card--pad" style="margin-top:6px">
      <div class="section-head" style="margin-bottom:10px">
        <div><h2 style="font-size:14px">Customer</h2></div>
        <button class="btn btn--sm btn--ghost" type="button" data-fill-walkin>Walk-in</button>
      </div>

      <label class="field"><span>Name</span>
        <input class="input" id="saleName" value="${esc(sale.customer_name)}" placeholder="Walk-in customer" maxlength="160"></label>

      <div class="form-2">
        <label class="field"><span>Phone</span>
          <input class="input" id="salePhone" inputmode="tel" value="${esc(sale.customer_phone)}" placeholder="01XXXXXXXXX" maxlength="40"></label>
        <label class="field"><span>DXN member ID</span>
          <input class="input" id="saleMember" value="${esc(sale.dxn_member_id)}" placeholder="Optional" maxlength="40"></label>
      </div>

      <div class="form-2">
        <label class="field"><span>Payment</span>
          <select class="select" id="salePayment">
            ${PAYMENTS.map((method) => `<option value="${method}" ${sale.payment_method === method ? 'selected' : ''}>${method}</option>`).join('')}
          </select></label>
        <label class="field"><span>Discount (${esc(currency)})</span>
          <input class="input" id="saleDiscount" type="number" min="0" step="0.01" value="${Number(sale.discount) || ''}" placeholder="0.00"></label>
      </div>

      <label class="field" style="margin-bottom:0"><span>Note</span>
        <input class="input" id="saleNote" value="${esc(sale.note)}" placeholder="Delivery instructions, etc." maxlength="200"></label>
    </div>
  `;

  foot.innerHTML = `
    <div class="totals">
      <div class="totals__row"><span>${int(totals.units)} item(s)</span><strong>${money(totals.subtotal, currency)}</strong></div>
      ${totals.discount > 0 ? `<div class="totals__row"><span>Discount</span><strong>-${money(totals.discount, currency)}</strong></div>` : ''}
      <div class="totals__row totals__row--grand"><span>Total</span><strong>${money(totals.total, currency)}</strong></div>
      <div class="totals__row"><span>PV points</span><strong>${round2(totals.pv).toFixed(2)}</strong></div>
    </div>
    <button class="btn btn--primary btn--block" type="button" id="checkoutBtn">
      ${icon('check', 16)} Save sale · ${money(totals.total, currency)}
    </button>
    <div style="display:flex;gap:10px">
      <button class="btn btn--ghost" type="button" id="clearCartBtn" style="flex:1">Clear</button>
      <button class="btn btn--wa" type="button" id="quoteBtn" style="flex:1">
        ${icon('whatsapp', 16)} Quote
      </button>
    </div>
  `;

  bindBody(body);
  bindFoot(foot);
}

function bindBody(body) {
  body.querySelectorAll('[data-inc]').forEach((button) => {
    button.addEventListener('click', () => {
      const id = Number(button.dataset.inc);
      const line = store.state.cart.find((l) => Number(l.productId) === id);
      if (!line) return;
      const result = store.addToCart(id, 1);
      if (!result.ok) toast(result.message, 'error');
    });
  });

  body.querySelectorAll('[data-dec]').forEach((button) => {
    button.addEventListener('click', () => {
      const id = Number(button.dataset.dec);
      const line = store.state.cart.find((l) => Number(l.productId) === id);
      if (!line) return;
      store.setQty(id, line.qty - 1);
    });
  });

  body.querySelectorAll('[data-remove]').forEach((button) => {
    button.addEventListener('click', () => store.removeFromCart(Number(button.dataset.remove)));
  });

  const name = body.querySelector('#saleName');
  const phone = body.querySelector('#salePhone');
  const member = body.querySelector('#saleMember');
  const payment = body.querySelector('#salePayment');
  const discount = body.querySelector('#saleDiscount');
  const note = body.querySelector('#saleNote');

  // Text fields write straight to the store but must not steal focus, so we
  // persist quietly and refresh only the totals.
  const onField = (field, key, transform = (v) => v) => {
    field.addEventListener('input', () => {
      store.state.sale[key] = transform(field.value);
      store.persistCart();
      refreshTotals();
    });
    field.addEventListener('change', () => {
      store.state.sale[key] = transform(field.value);
      store.persistCart();
      refreshTotals();
    });
  };

  onField(name, 'customer_name');
  onField(phone, 'customer_phone', (v) => v.trim());
  onField(member, 'dxn_member_id', (v) => v.trim().toUpperCase());
  onField(payment, 'payment_method');
  onField(note, 'note');
  onField(discount, 'discount', (v) => Math.max(0, Number(v) || 0));

  body.querySelector('[data-fill-walkin]')?.addEventListener('click', () => {
    store.updateSale({ customer_name: 'Walk-in customer', customer_phone: '', dxn_member_id: '' });
  });
}

function refreshTotals() {
  const foot = document.getElementById('cartFoot');
  if (!foot) return;
  const totals = store.cartTotals();
  const currency = store.currency();
  const grand = foot.querySelector('.totals__row--grand strong');
  if (grand) grand.textContent = money(totals.total, currency);
  const button = foot.querySelector('#checkoutBtn');
  if (button) button.innerHTML = `${icon('check', 16)} Save sale · ${money(totals.total, currency)}`;
  const rows = foot.querySelectorAll('.totals__row');
  if (rows[1] && totals.discount > 0 && rows.length > 3) {
    rows[1].innerHTML = `<span>Discount</span><strong>-${money(totals.discount, currency)}</strong>`;
  }
}

function bindFoot(foot) {
  foot.querySelector('#checkoutBtn')?.addEventListener('click', async () => {
    const button = foot.querySelector('#checkoutBtn');
    const totals = store.cartTotals();
    if (!totals.lines.length) return;

    // Guard against selling more than the shelf holds; the server enforces the
    // same rule, this just fails fast with a friendly message.
    const short = totals.lines.find((line) => line.qty > line.available);
    if (short) {
      toast(`Not enough stock for ${short.product.name} (${short.available} left).`, 'error');
      return;
    }

    button.disabled = true;
    const label = button.innerHTML;
    button.innerHTML = '<span class="spinner"></span> Saving…';

    const result = store.enqueueOrder();
    button.disabled = false;
    button.innerHTML = label;

    if (!result.ok) {
      toast(result.message, 'error');
      return;
    }

    const item = store.state.outbox[store.state.outbox.length - 1];
    closeCart();
    toast(hasBase() ? 'Sale saved — syncing to every device.' : 'Sale saved on this device.', 'ok');
    openSaleSlip(item);
  });

  foot.querySelector('#clearCartBtn')?.addEventListener('click', () => {
    store.clearCart();
    toast('Cart cleared.');
  });

  foot.querySelector('#quoteBtn')?.addEventListener('click', () => {
    const totals = store.cartTotals();
    if (!totals.lines.length) return;
    const currency = store.currency();
    const lines = [
      `*${store.state.settings.branch_name || 'Mohammadpur Stock Point'}* — quotation`,
      '',
      ...totals.lines.map((l) => `• ${l.product.name} × ${l.qty} — ${money(l.lineTotal, currency)}`),
      '',
      `*Total: ${money(totals.total, currency)}*`,
      `PV: ${totals.pv.toFixed(2)}`,
    ];
    window.open(waLink(store.state.settings.whatsapp_number, lines.join('\n')), '_blank', 'noopener');
  });
}

/** Receipt preview for a sale that may still be in the outbox. */
export function openSaleSlip(item) {
  const payload = item.payload;
  const currency = store.currency();
  const order = {
    order_number: 'PENDING',
    created_at: new Date(item.createdAt || Date.now()).toISOString(),
    customer_name: payload.customer_name,
    dxn_member_id: payload.dxn_member_id,
    payment_method: payload.payment_method,
    subtotal: payload.items.reduce((sum, i) => sum + i.unit_price * i.quantity, 0),
    discount: payload.discount,
    total_amount: payload.items.reduce((sum, i) => sum + i.unit_price * i.quantity, 0) - payload.discount,
    total_pv: payload.items.reduce((sum, i) => sum + i.unit_pv * i.quantity, 0),
    items: payload.items.map((i) => {
      const product = store.productById(i.product_id);
      return {
        name: product?.name || `Product ${i.product_id}`,
        quantity: i.quantity,
        unit_price: i.unit_price,
        line_total: i.unit_price * i.quantity,
      };
    }),
  };

  const text = receiptText(order, store.state.settings);
  const whatsappText = text.replace(/\n/g, '\n');

  openModal({
    title: 'Sale saved',
    body: `
      <div id="slipWrap" style="background:var(--surface-2);padding:14px;border-radius:14px">
        <pre class="receipt" style="border-style:solid">${esc(text)}</pre>
      </div>
      <p style="font-size:12px;color:var(--muted);margin-top:14px;text-align:center">
        ${hasBase()
          ? 'Queued for sync. The order number appears in Orders once the server confirms it.'
          : 'Stored on this device. Connect the shop server in Settings to share it with every other device.'}
      </p>
      <p style="font-size:12px;color:var(--muted);text-align:center">
        ${payload.items.length} line(s) · ${money(order.total_amount, currency)} · PV ${order.total_pv.toFixed(2)}
      </p>
    `,
    footer: `
      <button class="btn btn--ghost" type="button" data-close>Done</button>
      <button class="btn btn--ghost" type="button" id="slipPrint">${icon('print', 16)} Print</button>
      <button class="btn btn--wa" type="button" id="slipWa">${icon('whatsapp', 16)} WhatsApp</button>
    `,
    onMount(panel) {
      panel.querySelector('#slipPrint')?.addEventListener('click', () => printNow());
      panel.querySelector('#slipWa')?.addEventListener('click', () => {
        const phone = digits(payload.customer_phone) || store.state.settings.whatsapp_number;
        window.open(waLink(phone, whatsappText), '_blank', 'noopener');
      });
    },
  });
}

export function openCart() {
  const drawer = document.getElementById('cartDrawer');
  const overlay = document.getElementById('overlay');
  if (!drawer) return;
  renderCart(document.getElementById('cartBody'), document.getElementById('cartFoot'));
  drawer.classList.add('is-open');
  drawer.setAttribute('aria-hidden', 'false');
  if (overlay) {
    overlay.hidden = false;
    requestAnimationFrame(() => overlay.classList.add('is-open'));
  }
  document.body.style.overflow = 'hidden';
}

export function closeCart() {
  const drawer = document.getElementById('cartDrawer');
  const overlay = document.getElementById('overlay');
  if (!drawer) return;
  drawer.classList.remove('is-open');
  drawer.setAttribute('aria-hidden', 'true');
  if (overlay) {
    overlay.classList.remove('is-open');
    setTimeout(() => { overlay.hidden = true; }, 220);
  }
  document.body.style.overflow = '';
}

export function isCartOpen() {
  return document.getElementById('cartDrawer')?.classList.contains('is-open') || false;
}

export { closeModal };
