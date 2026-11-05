/**
 * Admin: performance snapshot, inventory management, movement log, customers.
 *
 * Numbers are computed from the local cache so the screen is instant and works
 * on a phone with no signal; the sync loop keeps that cache current.
 */

import { esc, money, num, int, round2, compact, toDate, fmtDateTime, relTime, downloadFile } from '../util.js';
import { icon, emptyState, openModal, toast, confirmAction, dayLabel, stockBadge, printNow } from '../ui.js';
import api, { hasBase } from '../api.js';
import * as store from '../store.js';
import { openProductForm, openStockForm } from './product-form.js';

const inventoryFilters = { q: '', showArchived: false };

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function localStats() {
  const live = store.state.orders.filter((order) => order.status !== 'CANCELLED');
  const today = startOfToday();
  const todayOrders = live.filter((order) => {
    const date = toDate(order.created_at);
    return date && date >= today;
  });

  const products = store.activeProducts();
  const stockUnits = products.reduce((sum, p) => sum + num(p.stock_qty), 0);
  const stockValue = products.reduce((sum, p) => sum + num(p.stock_qty) * num(p.member_price), 0);
  const lowStock = products
    .filter((p) => store.stockLevel(p) !== 'ok')
    .sort((a, b) => num(a.stock_qty) - num(b.stock_qty));

  // 7 day series including today.
  const series = [];
  for (let i = 6; i >= 0; i -= 1) {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - i);
    const next = new Date(day);
    next.setDate(next.getDate() + 1);
    const dayOrders = live.filter((order) => {
      const date = toDate(order.created_at);
      return date && date >= day && date < next;
    });
    series.push({
      day: day.toISOString().slice(0, 10),
      orders: dayOrders.length,
      revenue: round2(dayOrders.reduce((sum, o) => sum + num(o.total_amount), 0)),
    });
  }

  const productTotals = new Map();
  for (const order of live) {
    for (const item of order.items || []) {
      const key = Number(item.product_id) || item.name;
      const entry = productTotals.get(key) || { name: item.name, quantity: 0, revenue: 0 };
      entry.quantity += num(item.quantity);
      entry.revenue += num(item.line_total);
      productTotals.set(key, entry);
    }
  }
  const top = [...productTotals.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 5);

  return {
    totalOrders: live.length,
    totalRevenue: round2(live.reduce((sum, o) => sum + num(o.total_amount), 0)),
    totalPv: round2(live.reduce((sum, o) => sum + num(o.total_pv), 0)),
    todayOrders: todayOrders.length,
    todayRevenue: round2(todayOrders.reduce((sum, o) => sum + num(o.total_amount), 0)),
    todayPv: round2(todayOrders.reduce((sum, o) => sum + num(o.total_pv), 0)),
    stockUnits,
    stockValue: round2(stockValue),
    lowStock,
    series,
    top,
  };
}

function statsHtml(stats) {
  const currency = store.currency();
  return `
    <div class="stat-grid">
      <div class="stat">
        <div class="stat__label">Today</div>
        <div class="stat__value">${money(stats.todayRevenue, currency)}</div>
        <div class="stat__hint">${int(stats.todayOrders)} order(s) · ${stats.todayPv.toFixed(0)} PV</div>
      </div>
      <div class="stat stat--gold">
        <div class="stat__label">All time revenue</div>
        <div class="stat__value">${compact(stats.totalRevenue, currency)}</div>
        <div class="stat__hint">${int(stats.totalOrders)} order(s)</div>
      </div>
      <div class="stat">
        <div class="stat__label">Stock on hand</div>
        <div class="stat__value">${int(stats.stockUnits)}</div>
        <div class="stat__hint">${compact(stats.stockValue, currency)} at member price</div>
      </div>
      <div class="stat">
        <div class="stat__label">Needs attention</div>
        <div class="stat__value" style="color:${stats.lowStock.length ? 'var(--danger)' : 'var(--primary)'}">${int(stats.lowStock.length)}</div>
        <div class="stat__hint">low or out of stock</div>
      </div>
    </div>
  `;
}

function chartHtml(series) {
  const currency = store.currency();
  const max = Math.max(1, ...series.map((d) => d.revenue));
  return `
    <div class="card card--pad">
      <div class="section-head" style="margin-bottom:4px">
        <div><h2 style="font-size:14px">Last 7 days</h2><p>Revenue per day</p></div>
      </div>
      <div class="chart">
        ${series.map((day) => `
          <div class="chart__col" title="${esc(day.day)} — ${money(day.revenue, currency)} (${day.orders} orders)">
            <div class="chart__val">${day.revenue ? compact(day.revenue) : ''}</div>
            <div class="chart__bar" style="height:${Math.max(3, Math.round((day.revenue / max) * 105))}px;opacity:${day.revenue ? 1 : 0.28}"></div>
            <div class="chart__day">${esc(dayLabel(day.day))}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function lowStockHtml(stats) {
  if (!stats.lowStock.length) {
    return `
      <div class="card card--pad">
        <div class="section-head" style="margin-bottom:4px"><div><h2 style="font-size:14px">Stock alerts</h2></div></div>
        <div class="empty" style="padding:24px 10px">
          <div class="empty__icon" style="font-size:28px">${icon('check', 30)}</div>
          <p>Every product is above its alert level.</p>
        </div>
      </div>
    `;
  }
  return `
    <div class="card card--pad">
      <div class="section-head" style="margin-bottom:4px">
        <div><h2 style="font-size:14px">Stock alerts</h2><p>${stats.lowStock.length} product(s)</p></div>
        <button class="btn btn--sm btn--ghost" type="button" id="adminRestock">Restock</button>
      </div>
      <div class="list">
        ${stats.lowStock.slice(0, 8).map((product) => `
          <div class="list__row">
            ${store.imageFor(product) ? `<img class="list__thumb" src="${esc(store.imageFor(product))}" alt="" loading="lazy" decoding="async" onerror="this.remove()">` : ''}
            <div class="list__main">
              <div class="list__title">${esc(product.name)}</div>
              <div class="list__sub">${esc(product.sku)}</div>
            </div>
            <span class="badge badge--${num(product.stock_qty) <= 0 ? 'danger' : 'warn'}">${int(product.stock_qty)} left</span>
            <button class="btn btn--sm btn--ghost" type="button" data-stock="${product.id}" aria-label="Adjust stock">${icon('plus', 14)}</button>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function inventoryRows() {
  const q = inventoryFilters.q.trim().toLowerCase();
  return store.state.products
    .filter((p) => (inventoryFilters.showArchived ? true : Number(p.is_active ?? 1) === 1))
    .filter((p) => !q || `${p.name} ${p.sku} ${p.category}`.toLowerCase().includes(q))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

function inventoryTableHtml() {
  const rows = inventoryRows();
  const currency = store.currency();
  if (!rows.length) return emptyState('Nothing here', 'Adjust the search or add a product.', 'package');

  return `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Product</th><th>Category</th>
          <th style="text-align:right">Stock</th>
          <th style="text-align:right">Retail</th>
          <th style="text-align:right">Member</th>
          <th style="text-align:right">PV</th>
          <th>Status</th><th></th>
        </tr></thead>
        <tbody>
          ${rows.map((product) => `
            <tr data-product-row="${product.id}" style="${Number(product.is_active ?? 1) === 0 ? 'opacity:.55' : ''}">
              <td>
                <div style="display:flex;align-items:center">
                  ${store.imageFor(product) ? `<img class="admin-thumb" src="${esc(store.imageFor(product))}" alt="" loading="lazy" decoding="async" onerror="this.remove()">` : ''}
                  <div>
                    <div style="font-weight:700;font-size:12.5px">${esc(product.name)}</div>
                    <div class="mono" style="color:var(--faint)">${esc(product.sku)}</div>
                  </div>
                </div>
              </td>
              <td style="font-size:12px;color:var(--muted)">${esc(product.category)}</td>
              <td style="text-align:right;font-weight:800">${int(product.stock_qty)}</td>
              <td style="text-align:right">${money(product.retail_price, currency)}</td>
              <td style="text-align:right">${money(product.member_price, currency)}</td>
              <td style="text-align:right" class="mono">${num(product.pv_points).toFixed(0)}</td>
              <td>${Number(product.is_active ?? 1) === 0 ? '<span class="badge badge--muted">Archived</span>' : stockBadge(product)}</td>
              <td>
                <div class="td-actions">
                  <button class="btn btn--sm btn--ghost" type="button" data-stock="${product.id}" aria-label="Stock">${icon('package', 14)}</button>
                  <button class="btn btn--sm btn--ghost" type="button" data-edit="${product.id}" aria-label="Edit">${icon('edit', 14)}</button>
                  <button class="btn btn--sm btn--ghost" type="button" data-archive="${product.id}" aria-label="Archive">
                    ${icon(Number(product.is_active ?? 1) === 0 ? 'refresh' : 'trash', 14)}
                  </button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

export function renderAdmin(root) {
  if (!store.state.isAdmin) {
    root.innerHTML = `
      <div class="card card--pad" style="max-width:520px;margin:40px auto;text-align:center">
        <div style="display:grid;place-items:center;margin-bottom:12px;color:var(--primary)">${icon('chart', 34)}</div>
        <h2 style="font-size:18px;font-weight:800;margin-bottom:6px">Admin is locked</h2>
        <p style="font-size:13px;color:var(--muted);margin-bottom:18px">
          Sign in with the shop PIN to manage inventory, stock and settings.
        </p>
        <button class="btn btn--primary btn--block" type="button" data-signin>${icon('user', 16)} Sign in with PIN</button>
      </div>
    `;
    root.querySelector('[data-signin]')?.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('dxn:login'));
    });
    return;
  }

  const stats = localStats();

  root.innerHTML = `
    <div class="section-head">
      <div>
        <h2>Admin</h2>
        <p>${esc(store.state.settings.branch_name || 'Stockpoint')} · synced ${store.state.lastSyncAt ? relTime(new Date(store.state.lastSyncAt).toISOString()) : 'not yet'}</p>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn--ghost" type="button" id="adminExport">${icon('download', 16)} Export stock</button>
        <button class="btn btn--primary" type="button" id="adminAdd">${icon('plus', 16)} New product</button>
      </div>
    </div>

    ${statsHtml(stats)}

    <div class="split" style="margin-bottom:18px">
      ${chartHtml(stats.series)}
      ${lowStockHtml(stats)}
    </div>

    <div class="card card--pad" style="margin-bottom:18px">
      <div class="section-head" style="margin-bottom:12px">
        <div><h2 style="font-size:14px">Best sellers</h2><p>By units sold</p></div>
      </div>
      ${stats.top.length ? `
        <div class="list">
          ${stats.top.map((product, index) => `
            <div class="list__row">
              <span class="badge badge--info">#${index + 1}</span>
              <div class="list__main">
                <div class="list__title">${esc(product.name)}</div>
                <div class="list__sub">${int(product.quantity)} unit(s)</div>
              </div>
              <strong style="font-size:13px">${money(product.revenue, store.currency())}</strong>
            </div>
          `).join('')}
        </div>` : '<p style="font-size:13px;color:var(--muted)">No sales recorded yet.</p>'}
    </div>

    <div class="section-head" style="margin-top:26px">
      <div><h2 style="font-size:16px">Inventory</h2><p>${int(store.state.products.length)} product(s) in the catalogue</p></div>
    </div>

    <div class="toolbar">
      <div class="search-wrap">
        <input class="input input--search" id="invSearch" type="search" autocomplete="off"
          placeholder="Search inventory…" value="${esc(inventoryFilters.q)}">
      </div>
      <label class="chip ${inventoryFilters.showArchived ? 'is-active' : ''}" style="display:inline-flex;align-items:center;gap:8px">
        <input type="checkbox" id="invArchived" ${inventoryFilters.showArchived ? 'checked' : ''}> Show archived
      </label>
    </div>

    <div id="inventoryList">${inventoryTableHtml()}</div>

    <div class="section-head" style="margin-top:26px">
      <div><h2 style="font-size:16px">Stock movements</h2><p>The audit trail behind every quantity</p></div>
      <button class="btn btn--ghost" type="button" id="loadMovements">${icon('clock', 16)} Load log</button>
    </div>
    <div id="movementsBox">
      ${emptyState('Movement log not loaded', 'Tap “Load log” to pull the last 100 stock changes from the server.', 'clock')}
    </div>

    <div class="section-head" style="margin-top:26px">
      <div><h2 style="font-size:16px">Customers</h2><p>${int(store.state.customers.length)} with order history</p></div>
    </div>
    <div class="card card--pad">
      ${store.state.customers.length ? `
        <div class="list">
          ${store.state.customers.slice(0, 12).map((customer) => `
            <div class="list__row">
              <div class="list__main">
                <div class="list__title">${esc(customer.name)}
                  ${customer.is_member ? '<span class="badge badge--info">Member</span>' : ''}</div>
                <div class="list__sub">${esc(customer.dxn_member_id || customer.phone || '—')} · ${int(customer.total_orders)} order(s)</div>
              </div>
              <strong style="font-size:13px">${money(customer.total_spent, store.currency())}</strong>
              <span class="badge badge--muted">${num(customer.total_pv).toFixed(0)} PV</span>
            </div>
          `).join('')}
        </div>` : '<p style="font-size:13px;color:var(--muted)">Customers appear automatically once an order is saved with a phone or member ID.</p>'}
    </div>
  `;

  bind(root);
}

function bind(root) {
  const list = root.querySelector('#inventoryList');
  const search = root.querySelector('#invSearch');

  const paint = () => {
    list.innerHTML = inventoryTableHtml();
  };

  search?.addEventListener('input', () => {
    inventoryFilters.q = search.value;
    paint();
  });

  root.querySelector('#invArchived')?.addEventListener('change', (event) => {
    inventoryFilters.showArchived = event.target.checked;
    paint();
  });

  root.querySelector('#adminAdd')?.addEventListener('click', () => openProductForm(null));

  root.querySelector('#adminExport')?.addEventListener('click', () => {
    const rows = [['SKU', 'Name', 'Category', 'Stock', 'Retail', 'Member', 'PV', 'Active']];
    for (const product of store.state.products) {
      rows.push([
        product.sku, product.name, product.category, product.stock_qty,
        product.retail_price, product.member_price, product.pv_points, product.is_active,
      ]);
    }
    const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    downloadFile(`dxn-stock-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv;charset=utf-8');
    toast('Stock snapshot downloaded.');
  });

  root.querySelector('#adminRestock')?.addEventListener('click', () => {
    const first = localStats().lowStock[0];
    if (first) openStockForm(first);
  });

  const onListClick = (event) => {
    const edit = event.target.closest('[data-edit]');
    const stock = event.target.closest('[data-stock]');
    const archive = event.target.closest('[data-archive]');

    if (edit) {
      const product = store.productById(Number(edit.dataset.edit));
      if (product) openProductForm(product);
      return;
    }
    if (stock) {
      const product = store.productById(Number(stock.dataset.stock));
      if (product) openStockForm(product);
      return;
    }
    if (archive) {
      const product = store.productById(Number(archive.dataset.archive));
      if (product) toggleArchive(product);
    }
  };

  list.addEventListener('click', onListClick);
  root.querySelectorAll('[data-stock]').forEach((button) => {
    if (button.closest('#inventoryList')) return;
    button.addEventListener('click', () => {
      const product = store.productById(Number(button.dataset.stock));
      if (product) openStockForm(product);
    });
  });

  root.querySelector('#loadMovements')?.addEventListener('click', async () => {
    const box = root.querySelector('#movementsBox');
    if (!hasBase()) {
      toast('Connect the shop server to read the movement log.', 'error');
      return;
    }
    box.innerHTML = '<div class="skeleton" style="height:120px"></div>';
    try {
      const result = await api.movements(100);
      const movements = result?.movements || [];
      box.innerHTML = movements.length ? `
        <div class="table-wrap">
          <table>
            <thead><tr><th>When</th><th>Product</th><th style="text-align:right">Change</th>
              <th style="text-align:right">After</th><th>Reason</th></tr></thead>
            <tbody>
              ${movements.map((row) => `
                <tr>
                  <td class="mono">${esc(fmtDateTime(row.created_at))}</td>
                  <td>${esc(row.product_name)}<div class="mono" style="color:var(--faint)">${esc(row.product_sku)}</div></td>
                  <td style="text-align:right;font-weight:800;color:${row.delta < 0 ? 'var(--danger)' : 'var(--success)'}">
                    ${row.delta > 0 ? '+' : ''}${int(row.delta)}</td>
                  <td style="text-align:right">${int(row.quantity_after)}</td>
                  <td><span class="badge badge--muted">${esc(row.reason)}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>` : emptyState('No movements yet', 'Sales and stock changes will appear here.', 'clock');
    } catch (error) {
      box.innerHTML = `<div class="card card--pad"><p style="font-size:13px;color:var(--danger)">${esc(error.message)}</p></div>`;
    }
  });
}

async function toggleArchive(product) {
  const archived = Number(product.is_active ?? 1) === 0;
  if (!hasBase()) {
    toast('Connect the shop server to change the catalogue.', 'error');
    return;
  }
  const ok = await confirmAction({
    title: archived ? `Restore ${product.name}?` : `Archive ${product.name}?`,
    message: archived
      ? 'It becomes visible in the catalogue again on every device.'
      : 'Archived products stay in past orders but disappear from the point of sale.',
    confirmLabel: archived ? 'Restore' : 'Archive',
    danger: !archived,
  });
  if (!ok) return;

  try {
    const result = archived ? await api.restoreProduct(product.id) : await api.archiveProduct(product.id);
    if (result?.product) store.upsertProducts([result.product]);
    else store.upsertProducts([{ ...product, is_active: archived ? 1 : 0 }]);
    toast(archived ? 'Product restored.' : 'Product archived.', 'ok');
    store.syncNow({ quiet: true });
  } catch (error) {
    toast(error.message || 'Could not update the product.', 'error');
  }
}
