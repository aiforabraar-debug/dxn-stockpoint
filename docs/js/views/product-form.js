/**
 * Create / edit a product. Shared by the catalogue and the admin screen.
 */

import { esc, money, num, int } from '../util.js';
import { icon, openModal, closeModal, toast } from '../ui.js';
import api, { hasBase, ApiError } from '../api.js';
import * as store from '../store.js';

export function openProductForm(product = null) {
  if (!hasBase()) {
    toast('Connect the shop server in Settings before editing products.', 'error');
    return;
  }

  const isEdit = Boolean(product);
  const value = (key, fallback = '') => esc(product?.[key] ?? fallback);

  openModal({
    title: isEdit ? `Edit ${product.name}` : 'New product',
    body: `
      <form id="productForm" autocomplete="off">
        <div class="form-2">
          <label class="field" style="grid-column:1/-1"><span>Product name *</span>
            <input class="input" name="name" required maxlength="160" value="${value('name')}"></label>

          <label class="field"><span>SKU *</span>
            <input class="input" name="sku" required maxlength="64" value="${value('sku')}"
              placeholder="DXN-LZC-3IN1-20"></label>

          <label class="field"><span>Category</span>
            <input class="input" name="category" maxlength="64" list="categoryOptions"
              value="${value('category', 'General')}">
            <datalist id="categoryOptions">
              ${store.categories().map((c) => `<option value="${esc(c)}"></option>`).join('')}
            </datalist>
          </label>

          <label class="field"><span>Retail price</span>
            <input class="input" name="retail_price" type="number" step="0.01" min="0"
              value="${value('retail_price', 0)}"></label>

          <label class="field"><span>Member price</span>
            <input class="input" name="member_price" type="number" step="0.01" min="0"
              value="${value('member_price', 0)}"></label>

          <label class="field"><span>PV points</span>
            <input class="input" name="pv_points" type="number" step="0.01" min="0"
              value="${value('pv_points', 0)}"></label>

          <label class="field"><span>Low stock alert at</span>
            <input class="input" name="low_stock_at" type="number" step="1" min="0"
              value="${value('low_stock_at', 5)}"></label>

          ${isEdit ? '' : `<label class="field" style="grid-column:1/-1"><span>Opening stock</span>
            <input class="input" name="stock_qty" type="number" step="1" min="0" value="0"></label>`}

          <label class="field" style="grid-column:1/-1"><span>Product photo URL</span>
            <input class="input" name="image_url" id="productImageUrl" maxlength="255"
              value="${value('image_url')}" placeholder="images/products/lingzhi-coffee-3in1.jpg or https://…">
            <small style="font-size:11px;color:var(--muted)">Leave blank to use the bundled DXN photo for this SKU.</small></label>

          <div class="field" style="grid-column:1/-1;align-items:center">
            <span>Preview</span>
            <div id="productImagePreview" class="product__media" style="max-width:190px;width:100%;margin-top:2px">
              <div class="product__placeholder">
                <img src="icons/logo-mark-96.png" alt="" loading="lazy">
                <span>DXN product</span>
              </div>
              <img class="product__img" id="productImagePreviewImg" alt="" hidden>
            </div>
          </div>

          <label class="field" style="grid-column:1/-1"><span>Description</span>
            <textarea class="textarea" name="description" maxlength="500">${value('description')}</textarea></label>
        </div>
        <p style="font-size:12px;color:var(--muted)">
          ${isEdit
            ? 'Stock is changed from the Admin screen so every movement is logged.'
            : `Opening stock is recorded as a movement. Currency: ${esc(store.currency())}.`}
        </p>
      </form>
    `,
    footer: `
      <button class="btn btn--ghost" type="button" data-close>Cancel</button>
      <button class="btn btn--primary" type="submit" form="productForm" id="productSave">
        ${icon('check', 16)} ${isEdit ? 'Save changes' : 'Create product'}
      </button>
    `,
    onMount(panel) {
      const form = panel.querySelector('#productForm');
      const save = panel.querySelector('#productSave');
      const imageInput = panel.querySelector('#productImageUrl');
      const preview = panel.querySelector('#productImagePreviewImg');

      const paintPreview = () => {
        const raw = String(imageInput?.value || '').trim()
          || store.PRODUCT_IMAGES[String(form.elements.sku?.value || '').trim()] || '';
        let src = '';
        try {
          src = raw ? new URL(raw, document.baseURI).href : '';
        } catch {
          src = raw;
        }
        if (!preview) return;
        if (!src) {
          preview.hidden = true;
          preview.removeAttribute('src');
          return;
        }
        preview.src = src;
        preview.hidden = false;
      };

      imageInput?.addEventListener('input', paintPreview);
      form.elements.sku?.addEventListener('input', paintPreview);
      preview?.addEventListener('error', () => { preview.hidden = true; });
      paintPreview();

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const data = new FormData(form);
        const body = {
          sku: String(data.get('sku') || '').trim(),
          name: String(data.get('name') || '').trim(),
          category: String(data.get('category') || 'General').trim() || 'General',
          description: String(data.get('description') || '').trim() || null,
          retail_price: num(data.get('retail_price')),
          member_price: num(data.get('member_price')),
          pv_points: num(data.get('pv_points')),
          low_stock_at: Math.max(0, Math.round(num(data.get('low_stock_at'), 5))),
          image_url: String(data.get('image_url') || '').trim() || null,
        };

        if (!body.name || !body.sku) {
          toast('Name and SKU are required.', 'error');
          return;
        }
        if (body.member_price > body.retail_price) {
          toast('Member price is usually not higher than retail.', 'error');
        }

        save.disabled = true;
        save.innerHTML = 'Saving…';
        try {
          let result;
          if (isEdit) {
            result = await api.updateProduct(product.id, body);
          } else {
            body.stock_qty = Math.max(0, Math.round(num(data.get('stock_qty'))));
            result = await api.createProduct(body);
          }
          if (result?.product) store.upsertProducts([result.product]);
          toast(isEdit ? 'Product updated — every device will pick it up.' : 'Product created.', 'ok');
          closeModal();
          store.syncNow({ quiet: true });
        } catch (error) {
          const message = error instanceof ApiError ? error.message : 'Could not save the product.';
          toast(message, 'error');
          save.disabled = false;
          save.innerHTML = isEdit ? 'Save changes' : 'Create product';
        }
      });
    },
  });
}

/** Stock take / delivery / shrinkage for one product. */
export function openStockForm(product) {
  if (!hasBase()) {
    toast('Connect the shop server in Settings first.', 'error');
    return;
  }

  openModal({
    title: `Stock — ${product.name}`,
    body: `
      <div style="display:flex;gap:12px;justify-content:space-between;margin-bottom:18px;
        background:var(--surface-2);border:1.5px solid var(--border);border-radius:12px;padding:14px">
        <div><div class="stat__label">On hand</div>
          <div style="font-size:26px;font-weight:800;color:var(--primary)">${int(product.stock_qty)}</div></div>
        <div style="text-align:right"><div class="stat__label">Stock value</div>
          <div style="font-size:16px;font-weight:800">${money(num(product.stock_qty) * num(product.member_price), store.currency())}</div>
          <div class="stat__hint">at member price</div></div>
      </div>

      <div class="form-2">
        <label class="field"><span>Receive / remove units</span>
          <input class="input" id="stockDelta" type="number" step="1" placeholder="+24 or -2" value=""></label>
        <label class="field"><span>Reason</span>
          <select class="select" id="stockReason">
            <option value="delivery">Delivery in</option>
            <option value="adjustment">Adjustment</option>
            <option value="damaged">Damaged</option>
            <option value="return">Customer return</option>
            <option value="sample">Sample / gift</option>
          </select></label>
      </div>

      <div style="display:flex;gap:10px;align-items:flex-end;padding-top:4px;border-top:1px dashed var(--border);margin-top:6px">
        <label class="field" style="flex:1;margin-top:14px"><span>Or set the counted quantity</span>
          <input class="input" id="stockCount" type="number" step="1" min="0" placeholder="${int(product.stock_qty)}"></label>
        <button class="btn btn--ghost" type="button" id="stockCountSave" style="margin-bottom:14px">Stock take</button>
      </div>
    `,
    footer: `
      <button class="btn btn--ghost" type="button" data-close>Close</button>
      <button class="btn btn--primary" type="button" id="stockApply">${icon('check', 16)} Apply movement</button>
    `,
    onMount(panel) {
      const apply = panel.querySelector('#stockApply');
      const countSave = panel.querySelector('#stockCountSave');

      const run = async (fn, button) => {
        button.disabled = true;
        const label = button.textContent;
        button.textContent = 'Saving…';
        try {
          const result = await fn();
          if (result?.product) store.upsertProducts([result.product]);
          toast('Stock updated.', 'ok');
          closeModal();
          store.syncNow({ quiet: true });
        } catch (error) {
          toast(error instanceof ApiError ? error.message : 'Could not update stock.', 'error');
        } finally {
          button.disabled = false;
          button.textContent = label;
        }
      };

      apply.addEventListener('click', () => {
        const delta = Math.round(num(panel.querySelector('#stockDelta').value));
        const reason = panel.querySelector('#stockReason').value;
        if (!delta) {
          toast('Enter a non-zero number of units.', 'error');
          return;
        }
        run(() => api.stockAdjust(product.id, delta, reason), apply);
      });

      countSave.addEventListener('click', () => {
        const field = panel.querySelector('#stockCount');
        const qty = Math.round(num(field.value));
        if (field.value === '' || qty < 0) {
          toast('Enter the counted quantity.', 'error');
          return;
        }
        run(() => api.stockUpdate(product.id, qty, 'stock_take'), countSave);
      });
    },
  });
}
