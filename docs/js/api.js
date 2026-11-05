/**
 * Transport layer for the Mohammadpur Stock Point API (PHP 8 + MySQL).
 *
 * The base URL is chosen on first run and stored in localStorage, so the same
 * static build can talk to a local dev server, ByetHost, or anything else
 * that serves api/public.
 */

const BASE_KEY = 'dxn.apiBase.v2';
const DEFAULT_BASE = 'https://dxnstock.byethost7.com';
const TOKEN_KEY = 'dxn.token.v2';
const TOKEN_META_KEY = 'dxn.tokenMeta.v2';

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'network_error', payload = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.payload = payload;
  }

  get isOffline() {
    return this.status === 0;
  }

  get isAuth() {
    return this.status === 401 || this.status === 403;
  }
}

/** trims trailing slashes and drops a trailing /api/v1 that users often paste. */
export function normalizeBase(input) {
  let base = String(input ?? '').trim();
  if (!base) return '';
  if (!/^https?:\/\//i.test(base)) base = `https://${base}`;
  base = base.replace(/\/+$/, '');
  base = base.replace(/\/api\/v1$/i, '');
  base = base.replace(/\/index\.php$/i, '');
  return base;
}

export function getBase() {
  try {
    return localStorage.getItem(BASE_KEY) || DEFAULT_BASE;
  } catch {
    return DEFAULT_BASE;
  }
}

export function setBase(value) {
  const base = normalizeBase(value);
  try {
    if (base) localStorage.setItem(BASE_KEY, base);
    else localStorage.removeItem(BASE_KEY);
  } catch { /* storage blocked — session only */ }
  return base;
}

export function hasBase() {
  return getBase() !== '';
}

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function getTokenMeta() {
  try {
    const raw = localStorage.getItem(TOKEN_META_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setToken(token, meta = null) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(TOKEN_META_KEY, JSON.stringify(meta || {}));
    } else {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(TOKEN_META_KEY);
    }
  } catch { /* ignore */ }
}

export function isTokenExpired(meta = getTokenMeta()) {
  if (!meta?.expires_at) return false;
  const when = Date.parse(meta.expires_at);
  return Number.isFinite(when) ? when < Date.now() + 60000 : false;
}

const TIMEOUT = 20000;

async function request(path, { method = 'GET', body, auth = true, timeout = TIMEOUT } = {}) {
  const base = getBase();
  if (!base) {
    throw new ApiError('No shop server connected yet.', { status: 0, code: 'no_base' });
  }

  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const token = getToken();
  if (auth && token && !isTokenExpired()) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  let response;
  try {
    response = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      cache: 'no-store',
    });
  } catch (error) {
    clearTimeout(timer);
    if (error?.name === 'AbortError') {
      throw new ApiError('The shop server took too long to answer.', { status: 0, code: 'timeout' });
    }
    throw new ApiError('Cannot reach the shop server. Check the connection or the API address.', {
      status: 0,
      code: 'network_error',
    });
  }
  clearTimeout(timer);

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    throw new ApiError(
      `The server replied with something that is not JSON (HTTP ${response.status}). Is the API address pointing at api/public?`,
      { status: response.status, code: 'bad_gateway' },
    );
  }

  if (!response.ok || payload?.success === false) {
    const code = payload?.error?.code || 'http_error';
    const message = payload?.message || payload?.error?.message || `Request failed (HTTP ${response.status})`;
    if (response.status === 401 && auth) setToken('');
    throw new ApiError(message, { status: response.status, code, payload });
  }

  return payload ?? {};
}

const qs = (params = {}) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
};

export const api = {
  // ── Service ──────────────────────────────────────────────────────────────
  health: () => request('/api/v1/health', { auth: false }),
  config: () => request('/api/v1/config', { auth: false }),

  // ── Auth ─────────────────────────────────────────────────────────────────
  async login(pin) {
    const result = await request('/api/v1/auth/login', { method: 'POST', body: { pin }, auth: false });
    setToken(result.token, { expires_at: result.expires_at, role: result.role });
    return result;
  },
  me: () => request('/api/v1/auth/me'),
  changePin: (newPin) => request('/api/v1/auth/pin', { method: 'POST', body: { new_pin: newPin } }),
  logout: () => setToken(''),

  // ── Catalogue ────────────────────────────────────────────────────────────
  products: (includeInactive = false) =>
    request(`/api/v1/products${qs({ include_inactive: includeInactive ? 1 : 0 })}`, { auth: includeInactive }),
  product: (id) => request(`/api/v1/products/${id}`),
  createProduct: (body) => request('/api/v1/products', { method: 'POST', body }),
  updateProduct: (id, body) => request(`/api/v1/products/${id}`, { method: 'PUT', body }),
  archiveProduct: (id) => request(`/api/v1/products/${id}`, { method: 'DELETE' }),
  restoreProduct: (id) => request(`/api/v1/products/${id}/restore`, { method: 'POST' }),

  // ── Stock ────────────────────────────────────────────────────────────────
  stockUpdate: (productId, newQuantity, reason = 'stock_take') =>
    request('/api/v1/stock/update', { method: 'POST', body: { productId, newQuantity, reason } }),
  stockAdjust: (productId, delta, reason = 'adjustment') =>
    request('/api/v1/stock/adjust', { method: 'POST', body: { productId, delta, reason } }),
  movements: (limit = 100) => request(`/api/v1/stock/movements${qs({ limit })}`),

  // ── Orders ───────────────────────────────────────────────────────────────
  orders: (params = {}) => request(`/api/v1/orders${qs(params)}`),
  order: (id) => request(`/api/v1/orders/${id}`),
  createOrder: (payload) => request('/api/v1/orders', { method: 'POST', body: payload }),
  setOrderStatus: (id, status) =>
    request(`/api/v1/orders/${id}/status`, { method: 'POST', body: { status } }),
  receipt: (id) => request(`/api/v1/orders/${id}/receipt`),

  // ── Reports ──────────────────────────────────────────────────────────────
  customers: (q = '') => request(`/api/v1/customers${qs({ q })}`),
  dashboard: () => request('/api/v1/dashboard'),
  salesReport: (from, to) => request(`/api/v1/reports/sales${qs({ from, to })}`),

  // ── Courier (SteadFast) ─────────────────────────────────────────────────
  courierSettings: () => request('/api/v1/courier/settings'),
  saveCourierSettings: (body) => request('/api/v1/courier/settings', { method: 'PUT', body }),
  shipOrder: (id, body = {}) => request(`/api/v1/courier/ship/${id}`, { method: 'POST', body }),
  courierStatus: (id) => request(`/api/v1/courier/status/${id}`),
  courierBalance: () => request('/api/v1/courier/balance'),
  courierReturn: (id, reason = '') => request(`/api/v1/courier/return/${id}`, { method: 'POST', body: { reason } }),
  courierReturns: () => request('/api/v1/courier/returns'),

  // ── Settings & sync ──────────────────────────────────────────────────────
  settings: () => request('/api/v1/settings'),
  saveSettings: (patch) => request('/api/v1/settings', { method: 'PUT', body: patch }),
  sync: (since = 0) => request(`/api/v1/sync${qs({ since })}`),
  syncStatus: () => request('/api/v1/sync/status'),

  /** Used by the Settings screen to prove a base URL is a real Stockpoint API. */
  async probe(baseOverride) {
    const base = normalizeBase(baseOverride || getBase());
    if (!base) throw new ApiError('Enter the API address first.', { code: 'no_base' });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const res = await fetch(`${base}/api/v1/health`, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
        cache: 'no-store',
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok && !payload) throw new ApiError(`HTTP ${res.status} from ${base}/api/v1/health`);
      return { base, health: payload };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(
        `Could not read ${base}/api/v1/health. Make sure the API is uploaded and api/public is the web root.`,
      );
    } finally {
      clearTimeout(timer);
    }
  },
};

export default api;
