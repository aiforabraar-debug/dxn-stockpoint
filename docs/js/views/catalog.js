/**
 * Catalogue / point of sale.
 *
 * Filter state lives in the module so a sync (which re-renders the view) never
 * resets what the shopkeeper was looking at.
 */

import { esc, money, num, int } from '../util.js';
import { icon, emptyState, toast } from '../ui.js';
import { openProductForm } from './product-form.js';
import * as store from '../store.js';

const filters = { q: '', category: 'all', lowOnly: false };

export function resetFilters() {
  filters.q = '';
  filters.category = 'all';
  filters.lowOnly = false;
}

function matches(product) {
  if (filters.category !== 'all' && product.category !== filters.category) return false;
  if (filters.lowOnly && store.stockLevel(product) === 'ok') return false;
  const q = filters.q.trim().toLowerCase();
  if (!q) return true;
  return (
    String(product.name || '').toLowerCase().includes(q) ||
    String(product.sku || '').toLowerCase().includes(q) ||
    String(product.category || '').toLowerCase().includes(q)
  );
}

function card(product) {
  const level = store.stockLevel(product);
  const currency = store.currency();
  const price = store.unitPrice(product);
  const other = store.state.tier === 'member' ? num(product.retail_price) : num(product.member_price);
  const otherLabel = store.state.tier === 'member' ? 'Retail' : 'Member';
  const soldOut = level === 'out';
  const pv = num(product.pv_points);
  const photo = store.imageFor(product);

  return `
    <article class="product ${soldOut ? 'is-out' : ''}" data-product="${product.id}">
      <div class="product__top">
        <span class="product__cat">${esc(product.category || 'General')}</span>
        <span class="product__pv">${pv ? `${int(pv)} PV` : '—'}</span>
      </div>
      <div class="product__media">
        <div class="product__placeholder">
          <img src="icons/logo-mark-96.png" alt="" loading="lazy">
          <span>DXN product</span>
        </div>
        ${photo ? `<img class="product__img" src="${esc(photo)}" alt="${esc(product.name)}" loading="lazy" decoding="async" onerror="this.remove()">` : ''}
      </div>
      <div>
        <h3 class="product__name">${esc(product.name)}</h3>
        <div class="product__sku">${esc(product.sku)}</div>
      </div>
      <div class="product__stock">
        <i class="stock-dot ${level === 'ok' ? '' : level}"></i>
        ${soldOut ? 'Out of stock' : `${int(product.stock_qty)} in stock`}
        ${level === 'low' ? '<span class="badge badge--warn">Low</span>' : ''}
      </div>
      <div class="product__foot">
        <div class="price">
          ${money(price, currency)}
          <small>${otherLabel} ${money(other, currency)}</small>
        </div>
        <button class="btn btn--primary btn--sm" type="button" data-add="${product.id}" ${soldOut ? 'disabled' : ''}>
          ${icon('plus', 14)} ${soldOut ? 'Sold out' : 'Add'}
        </button>
      </div>
    </article>
  `;
}

function gridHtml() {
  const products = store.activeProducts().filter(matches);
  if (!products.length) {
    return emptyState(
      store.state.products.length ? 'Nothing matches that filter' : 'Catalogue is empty',
      store.state.products.length
        ? 'Try another category or clear the search.'
        : 'Add your first product from the Admin screen.',
      'search',
    );
  }
  return products.map(card).join('');
}

export function renderCatalog(root) {
  const { isAdmin, syncState } = store.state;
  const failed = store.failedCount();
  const queued = store.pendingCount();
  const cats = store.categories();

  root.innerHTML = `
    <div class="section-head">
      <div>
        <h2>Point of sale</h2>
        <p>${store.state.tier === 'member' ? 'Member pricing is on' : 'Retail pricing'} ·
          ${int(store.activeProducts().length)} products in the catalogue</p>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${isAdmin ? `<button class="btn btn--ghost" type="button" id="catalogAdd">${icon('plus', 16)} New product</button>` : ''}
        <button class="btn btn--ghost" type="button" id="catalogRefresh">${icon('refresh', 16)} Sync</button>
      </div>
    </div>

    ${failed || queued ? `
      <div class="card card--pad" style="margin-bottom:16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;
        ${failed ? 'background:var(--danger-soft);border-color:#fecaca' : 'background:var(--warning-soft);border-color:#f3dfae'}">
        ${icon('alert', 18)}
        <div style="flex:1;min-width:180px;font-size:13px;font-weight:600">
          ${failed ? `${failed} sale(s) could not be saved by the server.` : ''}
          ${queued ? `${queued} sale(s) waiting to sync.` : ''}
        </div>
        <a class="btn btn--sm btn--ghost" href="#/orders">Open queue</a>
      </div>` : ''}

    <div class="toolbar">
      <div class="search-wrap">
        <label for="catalogSearch" class="visually-hidden" hidden>Search products</label>
        <input class="input input--search" id="catalogSearch" type="search" autocomplete="off"
          placeholder="Search name or SKU…" value="${esc(filters.q)}">
      </div>
      <div class="tier-toggle">
        <label class="switch">
          <input type="checkbox" id="tierToggle" ${store.state.tier === 'member' ? 'checked' : ''} aria-label="Member pricing">
          <span class="switch__track"></span>
        </label>
        <div>
          <strong>Member pricing</strong>
          <small>${store.state.tier === 'member' ? 'Members pay less' : 'Retail walk-in price'}</small>
        </div>
      </div>
    </div>

    <div class="chips" style="margin-bottom:16px">
      <button class="chip ${filters.category === 'all' ? 'is-active' : ''}" data-cat="all" type="button">All</button>
      ${cats.map((cat) => `
        <button class="chip ${filters.category === cat ? 'is-active' : ''}" data-cat="${esc(cat)}" type="button">${esc(cat)}</button>
      `).join('')}
      <button class="chip ${filters.lowOnly ? 'is-active' : ''}" data-low="1" type="button">Low stock</button>
    </div>

    <div class="product-grid" id="productGrid">${gridHtml()}</div>
  `;

  const grid = root.querySelector('#productGrid');
  const search = root.querySelector('#catalogSearch');

  const paint = () => {
    syncState; // touched so a re-render is intentional
    grid.innerHTML = gridHtml();
  };

  search.addEventListener('input', () => {
    filters.q = search.value;
    paint();
  });

  root.querySelectorAll('[data-cat]').forEach((chip) => {
    chip.addEventListener('click', () => {
      filters.category = chip.dataset.cat;
      root.querySelectorAll('[data-cat]').forEach((c) => c.classList.toggle('is-active', c === chip));
      paint();
    });
  });

  root.querySelector('[data-low]')?.addEventListener('click', (event) => {
    filters.lowOnly = !filters.lowOnly;
    event.currentTarget.classList.toggle('is-active', filters.lowOnly);
    paint();
  });

  root.querySelector('#tierToggle')?.addEventListener('change', (event) => {
    store.setTier(event.target.checked ? 'member' : 'retail');
  });

  root.querySelector('#catalogRefresh')?.addEventListener('click', () => {
    store.syncNow();
    toast('Checking for changes…');
  });

  root.querySelector('#catalogAdd')?.addEventListener('click', () => {
    openProductForm(null);
  });

  grid.addEventListener('click', (event) => {
    const button = event.target.closest('[data-add]');
    if (!button) return;
    const result = store.addToCart(Number(button.dataset.add), 1);
    if (!result.ok) {
      toast(result.message, 'error');
      return;
    }
    document.getElementById('cartBtn')?.classList.remove('is-bumped');
    // Small visual acknowledgement without a full re-render.
    button.classList.add('is-added');
    setTimeout(() => button.classList.remove('is-added'), 220);
  });
}
