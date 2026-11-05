/**
 * Small helpers shared by every view. No dependencies, no build step.
 */

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

/** Escapes text for safe interpolation into an innerHTML template. */
export function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function round2(value) {
  return Math.round(num(value) * 100) / 100;
}

/** 1234.5 -> "1,234.50" (no currency symbol; the caller adds it). */
export function money(value, currency) {
  const amount = round2(num(value)).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency ? `${currency} ${amount}` : amount;
}

export function int(value) {
  return num(value).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

/** Compact money for stat tiles: 12,340.00 -> 12.34k */
export function compact(value, currency) {
  const n = num(value);
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  const body = abs >= 1000000
    ? `${round2(abs / 1000000)}M`
    : abs >= 10000
      ? `${round2(abs / 1000)}k`
      : money(abs);
  return currency ? `${sign}${currency} ${body}` : `${sign}${body}`;
}

const dateFmt = new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat(undefined, {
  day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
});

export function toDate(value) {
  if (!value) return null;
  // Server timestamps are UTC; "2026-10-31 09:15:00" has no zone marker.
  const raw = String(value);
  const iso = raw.includes('T') || raw.endsWith('Z') ? raw : raw.replace(' ', 'T') + 'Z';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function fmtDate(value) {
  const d = toDate(value);
  return d ? dateFmt.format(d) : '—';
}

export function fmtDateTime(value) {
  const d = toDate(value);
  return d ? dateTimeFmt.format(d) : '—';
}

export function relTime(value) {
  const d = toDate(value);
  if (!d) return '—';
  const diff = Date.now() - d.getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return fmtDate(value);
}

export function uuid() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  // RFC 4122 v4 fallback for very old browsers.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function debounce(fn, wait = 220) {
  let timer = 0;
  const wrapped = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
  wrapped.cancel = () => clearTimeout(timer);
  return wrapped;
}

export function sortBy(list, key, direction = 1) {
  return [...list].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (typeof av === 'string' || typeof bv === 'string') {
      return String(av ?? '').localeCompare(String(bv ?? '')) * direction;
    }
    return (num(av) - num(bv)) * direction;
  });
}

export function groupBy(list, key) {
  const out = new Map();
  for (const item of list) {
    const k = typeof key === 'function' ? key(item) : item[key];
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(item);
  }
  return out;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

export function downloadFile(filename, text, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Digits only — WhatsApp deep links reject "+", spaces and dashes. */
export function digits(value) {
  return String(value ?? '').replace(/\D+/g, '');
}

export function firstWords(text, count = 2) {
  return String(text ?? '').trim().split(/\s+/).slice(0, count).join(' ');
}

export function plural(count, one, many) {
  return `${int(count)} ${count === 1 ? one : many}`;
}
