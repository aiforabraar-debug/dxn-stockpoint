/**
 * Orders: the live history from the server, plus anything still queued on
 * this device. Detail view doubles as the receipt screen.
 */

import { esc, money, num, int, fmtDateTime, relTime, downloadFile, digits } from '../util.js';
import {
  icon, emptyState, openModal, closeModal, toast, statusBadge,
  receiptText, orderMessage, waLink, printNow, confirmAction,
} from '../ui.js';
import api, { hasBase } from '../api.js';
import * as store from '../store.js';

const filters = { q: '', status: 'ALL' };
const STATUSES = ['ALL', 'CONFIRMED', 'PACKED', 'DELIVERED', 'CANCELLED'];

function itemsSummary(order) {
  const items = order.items || [];
  if (!items.length) return '—';
  const first = items[0];
  const rest = items.length - 1;
  return rest > 0 ? `${esc(first.name)} +${rest} more` : esc(first.name);
}

function orderRow(order) {
  const currency = store.currency();
  const itemCount = (order.items || []).reduce((sum, i) => sum + num(i.quantity), 0);
  return `
    <tr data-order="${order.id}">
      <td>
        <div style="font-weight:800;font-size:12.5px">${esc(order.order_number)}</div>
        <div class="mono" style="color:var(--faint)">${relTime(order.created_at)}</div>
      </td>
      <td>
        <div style="font-weight:700;font-size:12.5px">${esc(order.customer_name)}</div>
        <div class="mono" style="color:var(--faint)">${esc(order.dxn_member_id || order.customer_phone || '—')}</div>
      </td>
      <td style="max-width:220px">
        <div style="font-size:12px">${itemsSummary(order)}</div>
        <div class="mono" style="color:var(--faint)">${int(itemCount)} unit(s)</div>
      </td>
      <td style="text-align:right;font-weight:800;white-space:nowrap">${money(order.total_amount, currency)}</td>
      <td style="text-align:right" class="mono">${num(order.total_pv).toFixed(0)}</td>
      <td>${statusBadge(order.status)}</td>
      <td>
        <div class="td-actions">
          <button class="btn btn--sm btn--ghost" type="button" data-open="${order.id}" aria-label="Open order">
            ${icon('receipt', 14)}
          </button>
        </div>
      </td>
    </tr>
  `;
}

function matches(order) {
  if (filters.status !== 'ALL' && order.status !== filters.status) return false;
  const q = filters.q.trim().toLowerCase();
  if (!q) return true;
  return (
    String(order.order_number || '').toLowerCase().includes(q) ||
    String(order.customer_name || '').toLowerCase().includes(q) ||
    String(order.dxn_member_id || '').toLowerCase().includes(q) ||
    String(order.customer_phone || '').toLowerCase().includes(q)
  );
}

function outboxSection() {
  const items = store.state.outbox;
  if (!items.length) return '';
  return `
    <div class="card card--pad" style="margin-bottom:18px;border-color:#f3dfae;background:var(--warning-soft)">
      <div class="section-head" style="margin-bottom:10px">
        <div>
          <h2 style="font-size:14px">Waiting to sync (${items.length})</h2>
          <p>These sales live only on this device until the server accepts them.</p>
        </div>
        <button class="btn btn--sm btn--ghost" type="button" id="retryAll">${icon('refresh', 14)} Retry all</button>
      </div>
      <div class="list">
        ${items.map((item) => {
          const total = item.payload.items.reduce((sum, i) => sum + i.unit_price * i.quantity, 0) - num(item.payload.discount);
          return `
          <div class="list__row">
            <div class="list__main">
              <div class="list__title">${esc(item.payload.customer_name)} — ${money(total, store.currency())}</div>
              <div class="list__sub">
                ${item.payload.items.length} line(s) · ${relTime(new Date(item.createdAt).toISOString())}
                ${item.error ? ` · <span style="color:#b91c1c">${esc(item.error)}</span>` : ''}
              </div>
            </div>
            <span class="badge badge--${item.status === 'failed' ? 'danger' : 'warn'}">
              ${item.status === 'failed' ? 'Failed' : 'Queued'}
            </span>
            <button class="btn btn--sm btn--ghost" type="button" data-retry="${esc(item.id)}">Retry</button>
            <button class="btn btn--sm btn--danger" type="button" data-drop="${esc(item.id)}" aria-label="Discard">
              ${icon('trash', 14)}
            </button>
          </div>`;
        }).join('')}
      </div>
    </div>
  `;
}

export function renderOrders(root) {
  if (!store.state.isAdmin) {
    root.innerHTML = `
      <div class="card card--pad" style="max-width:520px;margin:40px auto;text-align:center">
        <div style="display:grid;place-items:center;margin-bottom:12px;color:var(--primary)">${icon('receipt', 34)}</div>
        <h2 style="font-size:18px;font-weight:800;margin-bottom:6px">Order history is for the shop</h2>
        <p style="font-size:13px;color:var(--muted);margin-bottom:18px">
          Sign in with the shop PIN to review orders, change their status and print receipts.
        </p>
        <button class="btn btn--primary btn--block" type="button" data-signin>${icon('user', 16)} Sign in with PIN</button>
      </div>
      ${outboxSection()}
    `;
    root.querySelector('[data-signin]')?.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('dxn:login'));
    });
    bindOutbox(root);
    return;
  }

  const orders = store.state.orders.filter(matches);

  root.innerHTML = `
    <div class="section-head">
      <div>
        <h2>Orders</h2>
        <p>${int(store.state.orders.length)} order(s) cached · newest first</p>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn--ghost" type="button" id="ordersRefresh">${icon('refresh', 16)} Refresh</button>
        <button class="btn btn--ghost" type="button" id="ordersExport">${icon('download', 16)} CSV</button>
      </div>
    </div>

    ${outboxSection()}

    <div class="toolbar">
      <div class="search-wrap">
        <input class="input input--search" id="orderSearch" type="search" autocomplete="off"
          placeholder="Order no, customer, member ID…" value="${esc(filters.q)}">
      </div>
      <div class="chips">
        ${STATUSES.map((status) => `
          <button class="chip ${filters.status === status ? 'is-active' : ''}" data-status="${status}" type="button">${status}</button>
        `).join('')}
      </div>
    </div>

    <div id="ordersList">
      ${orders.length ? `
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th>Order</th><th>Customer</th><th>Items</th>
              <th style="text-align:right">Total</th><th style="text-align:right">PV</th>
              <th>Status</th><th></th>
            </tr></thead>
            <tbody>${orders.map(orderRow).join('')}</tbody>
          </table>
        </div>` : emptyState(
          store.state.orders.length ? 'No orders match' : 'No orders yet',
          store.state.orders.length ? 'Try another status or clear the search.' : 'Sales made on the web or Android land here.',
          'receipt',
        )}
    </div>
  `;

  const search = root.querySelector('#orderSearch');
  const list = root.querySelector('#ordersList');

  const paint = () => {
    const rows = store.state.orders.filter(matches);
    list.innerHTML = rows.length
      ? `<div class="table-wrap"><table>
          <thead><tr><th>Order</th><th>Customer</th><th>Items</th>
            <th style="text-align:right">Total</th><th style="text-align:right">PV</th>
            <th>Status</th><th></th></tr></thead>
          <tbody>${rows.map(orderRow).join('')}</tbody></table></div>`
      : emptyState('No orders match', 'Try another status or clear the search.', 'receipt');
  };

  search.addEventListener('input', () => {
    filters.q = search.value;
    paint();
  });

  root.querySelectorAll('[data-status]').forEach((chip) => {
    chip.addEventListener('click', () => {
      filters.status = chip.dataset.status;
      root.querySelectorAll('[data-status]').forEach((c) => c.classList.toggle('is-active', c === chip));
      paint();
    });
  });

  root.querySelector('#ordersRefresh')?.addEventListener('click', () => {
    store.syncNow();
    toast('Refreshing orders…');
  });

  root.querySelector('#ordersExport')?.addEventListener('click', () => {
    const rows = [['Order', 'Date', 'Customer', 'Member ID', 'Items', 'Total', 'PV', 'Payment', 'Status']];
    for (const order of store.state.orders) {
      rows.push([
        order.order_number,
        order.created_at,
        order.customer_name,
        order.dxn_member_id || '',
        (order.items || []).map((i) => `${i.name} x${i.quantity}`).join(' | '),
        num(order.total_amount).toFixed(2),
        num(order.total_pv).toFixed(2),
        order.payment_method,
        order.status,
      ]);
    }
    const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    downloadFile(`dxn-orders-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv;charset=utf-8');
    toast('CSV downloaded.');
  });

  list.addEventListener('click', (event) => {
    const button = event.target.closest('[data-open]');
    const row = event.target.closest('[data-order]');
    const id = Number(button?.dataset.open || row?.dataset.order || 0);
    if (!id) return;
    const order = store.state.orders.find((o) => Number(o.id) === id);
    if (order) openOrder(order);
  });

  bindOutbox(root);
}

function bindOutbox(root) {
  root.querySelector('#retryAll')?.addEventListener('click', () => {
    store.retryAll();
    toast('Retrying queued sales…');
  });

  root.querySelectorAll('[data-retry]').forEach((button) => {
    button.addEventListener('click', () => {
      store.retryOutboxItem(button.dataset.retry);
      toast('Retrying…');
    });
  });

  root.querySelectorAll('[data-drop]').forEach((button) => {
    button.addEventListener('click', async () => {
      const ok = await confirmAction({
        title: 'Discard this queued sale?',
        message: 'The sale was never confirmed by the server, so it will not appear in any report. This cannot be undone.',
        confirmLabel: 'Discard',
        danger: true,
      });
      if (!ok) return;
      const item = store.state.outbox.find((o) => o.id === button.dataset.drop);
      if (item) {
        for (const line of item.payload.items) {
          const product = store.productById(line.product_id);
          if (product) product.stock_qty = num(product.stock_qty) + line.quantity;
        }
      }
      store.dropFromOutbox(button.dataset.drop);
      store.persistCache();
      toast('Queued sale discarded.');
      store.notify();
    });
  });
}

export function openOrder(order) {
  const currency = store.currency();
  const text = receiptText(order, store.state.settings);
  const rows = (order.items || []).map((item) => `
    <tr>
      <td>${esc(item.name)}</td>
      <td style="text-align:center">${int(item.quantity)}</td>
      <td style="text-align:right">${money(item.unit_price, currency)}</td>
      <td style="text-align:right;font-weight:700">${money(item.line_total, currency)}</td>
    </tr>
  `).join('');

  openModal({
    title: `Order ${order.order_number}`,
    body: `
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:16px">
        ${statusBadge(order.status)}
        <span class="badge badge--muted">${esc(order.payment_method)}</span>
        <span class="badge badge--muted">${order.is_member ? 'Member price' : 'Retail price'}</span>
        <span style="font-size:12px;color:var(--muted)">${esc(fmtDateTime(order.created_at))}</span>
      </div>

      <div class="card card--pad" style="margin-bottom:16px">
        <div class="list">
          <div class="list__row"><div class="list__main">
            <div class="list__title">${esc(order.customer_name)}</div>
            <div class="list__sub">${esc(order.customer_phone || 'no phone')} ${order.dxn_member_id ? `· ${esc(order.dxn_member_id)}` : ''}</div>
          </div></div>
        </div>
        <div class="table-wrap" style="margin-top:10px">
          <table style="min-width:0">
            <thead><tr><th>Item</th><th style="text-align:center">Qty</th>
              <th style="text-align:right">Price</th><th style="text-align:right">Total</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="4">No line items stored.</td></tr>'}</tbody>
          </table>
        </div>
        <div class="totals" style="margin-top:14px">
          <div class="totals__row"><span>Subtotal</span><strong>${money(order.subtotal, currency)}</strong></div>
          ${num(order.discount) > 0 ? `<div class="totals__row"><span>Discount</span><strong>-${money(order.discount, currency)}</strong></div>` : ''}
          <div class="totals__row totals__row--grand"><span>Total</span><strong>${money(order.total_amount, currency)}</strong></div>
          <div class="totals__row"><span>PV</span><strong>${num(order.total_pv).toFixed(2)}</strong></div>
        </div>
      </div>

      ${order.note ? `<p style="font-size:13px;color:var(--muted);margin-bottom:14px">Note: ${esc(order.note)}</p>` : ''}

      <div class="section-head" style="margin-bottom:8px"><div><h2 style="font-size:13px">Change status</h2></div></div>
      <div class="chips" id="statusChips">
        ${['PENDING', 'CONFIRMED', 'PACKED', 'DELIVERED', 'CANCELLED'].map((status) => `
          <button class="chip ${order.status === status ? 'is-active' : ''}" data-set-status="${status}" type="button">${status}</button>
        `).join('')}
      </div>

      <div class="card card--pad" style="margin-top:18px;margin-bottom:14px" id="courierBox">
        <div class="section-head" style="margin-bottom:8px">
          <div><h2 style="font-size:13px">SteadFast courier</h2></div>
          ${order.courier_consignment_id
            ? `<span class="badge badge--ok">Shipped</span>`
            : `<span class="badge badge--muted">Not shipped</span>`}
        </div>
        ${order.courier_consignment_id ? `
          <div class="list">
            <div class="list__row">
              <div class="list__main">
                <div class="list__title">Consignment ${esc(order.courier_consignment_id)}</div>
                <div class="list__sub">Tracking: <span class="mono">${esc(order.courier_tracking_code || '—')}</span> · ${esc(order.courier_status || 'in_review')}</div>
              </div>
              <button class="btn btn--sm btn--ghost" type="button" id="sfRefreshStatus">${icon('refresh',14)} Refresh</button>
            </div>
          </div>
        ` : `
          <p style="font-size:12.5px;color:var(--muted);margin-bottom:10px">
            Create a SteadFast shipment for this order. Customer phone and an address are required.
          </p>
          <label class="field"><span>Recipient address</span>
            <input class="input" id="sfAddress" placeholder="House 17, Road 3, Dhanmondi, Dhaka 1209" maxlength="250"></label>
          <label class="field"><span>COD amount (BDT)</span>
            <input class="input" id="sfCod" type="number" min="0" step="1" value="${num(order.total_amount)}"></label>
          <label class="field"><span>Item description (optional)</span>
            <input class="input" id="sfDesc" maxlength="250" placeholder="DXN products"></label>
          <button class="btn btn--primary btn--block" type="button" id="sfShipBtn" style="margin-top:10px">
            ${icon('truck',16)} Ship via SteadFast
          </button>
        `}
        <div id="sfMsg" style="margin-top:8px;font-size:12.5px"></div>
      </div>

      <details style="margin-top:18px">
        <summary style="cursor:pointer;font-size:12.5px;font-weight:700;color:var(--muted)">Show text receipt</summary>
        <pre class="receipt" style="margin-top:10px">${esc(text)}</pre>
      </details>
    `,
    footer: `
      <button class="btn btn--ghost" type="button" data-close>Close</button>
      <button class="btn btn--ghost" type="button" id="orderPrint">${icon('print', 16)} Print</button>
      <button class="btn btn--wa" type="button" id="orderWa">${icon('whatsapp', 16)} WhatsApp</button>
    `,
    onMount(panel) {
      panel.querySelectorAll('[data-set-status]').forEach((chip) => {
        chip.addEventListener('click', async () => {
          const status = chip.dataset.setStatus;
          if (status === order.status) return;
          if (!hasBase()) {
            toast('Connect the shop server to change order status.', 'error');
            return;
          }
          chip.disabled = true;
          try {
            const result = await api.setOrderStatus(order.id, status);
            if (result?.order) store.upsertOrders([result.order]);
            toast(`Order marked ${status}.`, 'ok');
            closeModal();
            store.syncNow({ quiet: true });
          } catch (error) {
            toast(error.message || 'Could not change the status.', 'error');
            chip.disabled = false;
          }
        });
      });

      const sfMsg = panel.querySelector('#sfMsg');
      panel.querySelector('#sfShipBtn')?.addEventListener('click', async () => {
        const btn = panel.querySelector('#sfShipBtn');
        const address = panel.querySelector('#sfAddress')?.value.trim() || '';
        const cod = num(panel.querySelector('#sfCod')?.value, order.total_amount);
        const desc = panel.querySelector('#sfDesc')?.value.trim() || '';
        if (!address) { toast('Recipient address is required.', 'error'); return; }
        if (!hasBase()) { toast('Connect the shop server first.', 'error'); return; }
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> Shipping…';
        try {
          const result = await api.shipOrder(order.id, { recipient_address: address, cod_amount: cod, item_description: desc });
          if (result?.order) store.upsertOrders([result.order]);
          toast('Shipment created with SteadFast.', 'ok');
          closeModal();
          store.syncNow({ quiet: true });
        } catch (error) {
          if (sfMsg) sfMsg.innerHTML = `<span style="color:var(--danger)">${esc(error.message || 'Could not create shipment.')}</span>`;
          toast(error.message || 'Could not create shipment.', 'error');
          btn.disabled = false;
          btn.innerHTML = `${icon('truck',16)} Ship via SteadFast`;
        }
      });

      panel.querySelector('#sfRefreshStatus')?.addEventListener('click', async () => {
        const btn = panel.querySelector('#sfRefreshStatus');
        btn.disabled = true;
        try {
          const result = await api.courierStatus(order.id);
          if (result?.order) store.upsertOrders([result.order]);
          toast(`Status: ${result.courier_status}`, 'ok');
          closeModal();
          store.syncNow({ quiet: true });
        } catch (error) {
          toast(error.message || 'Could not refresh status.', 'error');
        } finally {
          btn.disabled = false;
        }
      });

      panel.querySelector('#orderPrint')?.addEventListener('click', () => printNow());
      panel.querySelector('#orderWa')?.addEventListener('click', () => {
        const phone = digits(order.customer_phone) || store.state.settings.whatsapp_number;
        window.open(waLink(phone, orderMessage(order, store.state.settings)), '_blank', 'noopener');
      });
    },
  });
}
