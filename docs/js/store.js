/**
 * Client-side state: an offline-first cache, a cart, an outbox and the sync
 * loop that keeps this browser and every other device on the same data.
 *
 * Everything a shop needs to keep selling lives in localStorage, so a dropped
 * connection or a closed tab never loses a sale.
 */

import api, { ApiError, getBase, hasBase, getToken, getTokenMeta, isTokenExpired, setToken } from './api.js';
import { num, round2, uuid, sortBy } from './util.js';

const CACHE_KEY = 'dxn.cache.v2';
const CART_KEY = 'dxn.cart.v2';
const OUTBOX_KEY = 'dxn.outbox.v2';
const SESSION_KEY = 'dxn.session.v2';

const POLL_MS = 15000;
const MAX_ORDERS = 400;

/**
 * Product photography bundled with the app so the catalogue looks right even
 * on the first offline launch. Files live in docs/images/products/ and the
 * original source URLs are recorded in docs/images/products/sources.json.
 */
export const PRODUCT_IMAGES = {
  'DXN-SOAP-GANO': 'images/products/ganozhi-beauty-soap.jpg',
  'DXN-ALOE-BAR-1': null,
  'DXN-ALOE-BAR-3': null,
  'DXN-NEEM-BAR-1': 'images/products/neem-bathing-bar.jpg',
  'DXN-NEEM-BAR-3': 'images/products/neem-bathing-bar.jpg',
  'DXN-SHAMPOO-GANO': 'images/products/ganozhi-shampoo.jpg',
  'DXN-NEEM-FACEWASH': 'images/products/neem-face-wash.jpg',
  'DXN-PAPAYA-SCRUB': 'images/products/papaya-facial-scrub.jpg',
  'DXN-APRICOT-SCRUB': null,
  'DXN-ALOE-SCRUB': 'images/products/aloe-facial-scrub.jpg',
  'DXN-ALOE-CLEANSING-JELLY': 'images/products/aloe-cleansing-gel.jpg',
  'DXN-TOOTHPASTE-120': 'images/products/ganozhi-toothpaste.jpg',
  'DXN-TOOTHPASTE-50': 'images/products/ganozhi-toothpaste.jpg',
  'DXN-TOOTHPASTE-IND-150': 'images/products/ganozhi-toothpaste.jpg',
  'DXN-TOOTHPASTE-IND-75': 'images/products/ganozhi-toothpaste.jpg',
  'DXN-TALCUM': 'images/products/talcum-powder.jpg',
  'DXN-SUNSCREEN-100': 'images/products/sun-screen-lotion.jpg',
  'DXN-BODY-LOTION': 'images/products/aloe-body-lotion.jpg',
  'DXN-BODY-SCRUB-200': 'images/products/body-scrub.jpg',
  'DXN-HAIR-OIL-100': 'images/products/hair-oil.jpg',
  'DXN-HAIR-PACK-20X5': null,
  'DXN-RISHI-GANO-TEA-200': 'images/products/rishi-gano-tea.jpg',
  'DXN-MASALA-TEA-100': 'images/products/masala-tea.jpg',
  'DXN-LZC-BLACK-20': 'images/products/lingzhi-black-coffee.jpg',
  'DXN-LZC-3IN1-20': 'images/products/lingzhi-coffee-3in1.jpg',
  'DXN-LZC-LITE-20': 'images/products/lingzhi-coffee-lite.jpg',
  'DXN-WHITE-COFFEE-20': 'images/products/white-coffee.jpg',
  'DXN-ZHI-MOCHA-20': 'images/products/zhi-mocha-premium.jpg',
  'DXN-EU-CAFE-20': 'images/products/eu-cafe.jpg',
  'DXN-VITA-CAFE-20': 'images/products/vita-cafe.jpg',
  'DXN-CORDYCEPS-COFFEE-20': 'images/products/cordyceps-coffee.jpg',
  'DXN-LIONS-MANE-COFFEE-20': 'images/products/lions-mane-coffee.jpg',
  'DXN-COCOZHI-500': 'images/products/cocozhi.jpg',
  'DXN-SPIRULINA-CEREAL-500': 'images/products/spirulina-cereal.jpg',
  'DXN-CORDYCEPS-CEREAL-500': 'images/products/cordyceps-cereal.jpg',
  'DXN-LEMONZHI-500': 'images/products/lemonzhi.jpg',
  'DXN-ZHI-YOBITE-30': 'images/products/zhi-yobite.jpg',
  'DXN-LINA-YOBITE-30': 'images/products/lina-yobite.jpg',
  'DXN-APPLE-ENZYME-750': 'images/products/apple-enzyme.jpg',
  'DXN-APPLE-JAM-300': 'images/products/apple-jam.jpg',
  'DXN-LIONS-MANE-OOCHA': 'images/products/lions-mane-ooocha.jpg',
  'DXN-LIONS-MANE-MATCHA': 'images/products/lions-mane-lemon-matcha.jpg',
  'DXN-SPIRUDLE-PLAIN': 'images/products/spirudle.jpg',
  'DXN-GOJI-BERRY': 'images/products/goji-berry.jpg',
  'DXN-OOCHA-NOODLES': 'images/products/oocha-noodles.jpg',
  'DXN-OOCHA-NOODLES-TYF': 'images/products/oocha-noodles-tyf.jpg',
  'DXN-VEGGIE-NOODLE': 'images/products/veggie-noodle.jpg',
  'DXN-RG-POWDER-50': 'images/products/rg-powder-50.jpg',
  'DXN-GL-POWDER-80': 'images/products/gl-powder-80.jpg',
  'DXN-CORDYCEPS-POWDER-30': 'images/products/cordyceps-powder-30.jpg',
  'DXN-LIONS-MANE-POWDER-30': 'images/products/lions-mane-powder-30.jpg',
};

const PRODUCT_DESCRIPTIONS = {
  'DXN-SOAP-GANO': 'Ganozhi translucent beauty soap with Ganoderma extract and moisturisers.',
  'DXN-ALOE-BAR-1': 'Aloe vera bathing bar that cleanses gently while keeping skin soft and hydrated.',
  'DXN-ALOE-BAR-3': 'Three-bar family pack of the aloe vera bathing bar.',
  'DXN-NEEM-BAR-1': 'Neem bathing bar with natural neem extract for everyday skin care.',
  'DXN-NEEM-BAR-3': 'Three-bar family pack of the neem bathing bar.',
  'DXN-SHAMPOO-GANO': 'Ganozhi nourishing shampoo with Ganoderma extract for soft, healthy-looking hair.',
  'DXN-NEEM-FACEWASH': 'Gentle neem face wash that clears oil and impurities without drying the skin.',
  'DXN-PAPAYA-SCRUB': 'Papaya facial scrub that lifts dead skin for a fresher, brighter face.',
  'DXN-APRICOT-SCRUB': 'Apricot facial scrub with fine granules to smooth and refresh the skin.',
  'DXN-ALOE-SCRUB': 'Aloe vera facial scrub for gentle exfoliation and soft, calm skin.',
  'DXN-ALOE-CLEANSING-JELLY': 'Aloe vera cleansing jelly that removes make-up and daily grime gently.',
  'DXN-TOOTHPASTE-120': 'Ganozhi toothpaste with Ganoderma extract for everyday oral care. 150g tube.',
  'DXN-TOOTHPASTE-50': 'Travel-size 50g tube of Ganozhi toothpaste.',
  'DXN-TOOTHPASTE-IND-150': 'Indian-made 150g Ganozhi toothpaste tube.',
  'DXN-TOOTHPASTE-IND-75': 'Indian-made 75g Ganozhi toothpaste tube.',
  'DXN-TALCUM': 'DXN talcum powder that keeps skin fresh, dry and comfortable.',
  'DXN-SUNSCREEN-100': 'Daily sun screen lotion for light, non-greasy protection outdoors.',
  'DXN-BODY-LOTION': 'Aloe vera hand and body lotion that moisturises without a greasy feel.',
  'DXN-BODY-SCRUB-200': 'Body scrub with natural exfoliating grains for smooth, refreshed skin.',
  'DXN-HAIR-OIL-100': 'Herbal hair oil that helps reduce hair fall and nourish the scalp.',
  'DXN-HAIR-PACK-20X5': 'Nourishing hair pack sachets for a weekly deep-conditioning treatment.',
  'DXN-RISHI-GANO-TEA-200': 'Premium herbal tea blending ginseng and Ganoderma extract.',
  'DXN-MASALA-TEA-100': 'Aromatic spiced masala tea blend for a warming cup.',
  'DXN-LZC-BLACK-20': 'DXN Lingzhi Black Coffee with Ganoderma extract. 20 sachets.',
  'DXN-LZC-3IN1-20': 'The classic DXN coffee: premium instant coffee blended with Ganoderma lucidum extract, sugar and non-dairy creamer. 20 sachets.',
  'DXN-LZC-LITE-20': 'A lighter, creamier Lingzhi coffee with reduced sugar for an everyday cup.',
  'DXN-WHITE-COFFEE-20': 'Smooth white coffee with Ganoderma extract and a creamy finish.',
  'DXN-ZHI-MOCHA-20': 'A rich mocha blend of coffee, cocoa and Ganoderma extract for a cafe-style cup at home.',
  'DXN-EU-CAFE-20': 'Smooth European-style instant coffee enriched with Ganoderma extract.',
  'DXN-VITA-CAFE-20': 'Six-in-one coffee blend with ginseng, tongkat ali and Ganoderma extract.',
  'DXN-CORDYCEPS-COFFEE-20': 'Instant coffee blended with cordyceps extract, creamer and cane sugar.',
  'DXN-LIONS-MANE-COFFEE-20': 'Coffee enriched with lion\'s mane mushroom extract for a smooth, earthy cup.',
  'DXN-COCOZHI-500': 'Healthy cocoa drink with Ganoderma extract, 20 sachets of 25g.',
  'DXN-SPIRULINA-CEREAL-500': 'Nutritious spirulina cereal drink mix, 20 sachets of 25g.',
  'DXN-CORDYCEPS-CEREAL-500': 'Cordyceps cereal drink mix, 20 sachets of 25g.',
  'DXN-LEMONZHI-500': 'Refreshing lemon and Ganoderma drink mix, 25 sachets of 20g.',
  'DXN-ZHI-YOBITE-30': 'Oat-based nutritious drink mix from DXN. 30g pack.',
  'DXN-LINA-YOBITE-30': 'Oat-based nutritious drink mix from DXN. 30g pack.',
  'DXN-APPLE-ENZYME-750': 'Fermented apple enzyme drink for digestion and daily wellbeing. 750ml.',
  'DXN-APPLE-JAM-300': 'Apple jam made from fermented apples, 300g jar.',
  'DXN-LIONS-MANE-OOCHA': 'Oocha green tea blend with lion\'s mane mushroom extract.',
  'DXN-LIONS-MANE-MATCHA': 'Lemon matcha drink with lion\'s mane mushroom extract.',
  'DXN-SPIRUDLE-PLAIN': 'Spirulina noodle made without artificial colouring.',
  'DXN-GOJI-BERRY': 'Dried goji berries, a naturally sweet source of antioxidants.',
  'DXN-OOCHA-NOODLES': 'Oocha noodles made with nutritious ingredients for a quick meal.',
  'DXN-OOCHA-NOODLES-TYF': 'Oocha noodles in Tom Yam flavour.',
  'DXN-VEGGIE-NOODLE': 'Vegetable noodle from DXN, quick to cook and light to eat.',
  'DXN-RG-POWDER-50': 'Reishi Gano (RG) Ganoderma lucidum mushroom powder, 50g.',
  'DXN-GL-POWDER-80': 'Ganocelium (GL) Ganoderma mycelium powder, 80g.',
  'DXN-CORDYCEPS-POWDER-30': 'Cordyceps mushroom powder, 30g.',
  'DXN-LIONS-MANE-POWDER-30': 'Lion\'s mane mushroom powder, 30g.',
};

/** Shown on a cold start so the shop is never staring at an empty screen. */
const SEED_PRODUCTS = [
  ['DXN-SOAP-GANO', 'Ganozhi Soap 75g', 'Personal Care', 470, 390, 65, 0],
  ['DXN-ALOE-BAR-1', 'Aloe Vera Bathing Bar (100g)', 'Personal Care', 185, 155, 35, 0],
  ['DXN-ALOE-BAR-3', 'Aloe Vera Bathing Bar (Family Pack, 3x100g)', 'Personal Care', 490, 410, 95, 0],
  ['DXN-NEEM-BAR-1', 'Neem Bathing Bar (100g)', 'Personal Care', 210, 175, 35, 0],
  ['DXN-NEEM-BAR-3', 'Neem Bathing Bar (Family Pack, 3x100g)', 'Personal Care', 490, 410, 95, 0],
  ['DXN-SHAMPOO-GANO', 'Ganozhi Shampoo 200ml', 'Personal Care', 440, 365, 65, 0],
  ['DXN-NEEM-FACEWASH', 'Neem Face Wash 100ml', 'Personal Care', 230, 190, 45, 0],
  ['DXN-PAPAYA-SCRUB', 'Papaya Facial Scrub 100ml', 'Personal Care', 280, 235, 55, 0],
  ['DXN-APRICOT-SCRUB', 'Apricot Facial Scrub 100ml', 'Personal Care', 280, 235, 55, 0],
  ['DXN-ALOE-SCRUB', 'Aloe Vera Facial Scrub 100ml', 'Personal Care', 1400, 1165, 190, 0],
  ['DXN-ALOE-CLEANSING-JELLY', 'Aloe Vera Cleansing Jelly', 'Personal Care', 1310, 1090, 145, 0],
  ['DXN-TOOTHPASTE-120', 'Ganozhi Toothpaste (Malaysian) 150g', 'Personal Care', 1000, 835, 110, 0],
  ['DXN-TOOTHPASTE-50', 'Ganozhi Toothpaste (Malaysian) 50g', 'Personal Care', 640, 535, 70, 0],
  ['DXN-TOOTHPASTE-IND-150', 'Ganozhi Toothpaste (Indian) 150g', 'Personal Care', 840, 700, 135, 0],
  ['DXN-TOOTHPASTE-IND-75', 'Ganozhi Toothpaste (Indian) 75g', 'Personal Care', 565, 470, 85, 0],
  ['DXN-TALCUM', 'Talcum Powder', 'Personal Care', 1430, 1190, 225, 0],
  ['DXN-SUNSCREEN-100', 'Sun Screen Lotion 100ml', 'Personal Care', 295, 245, 35, 0],
  ['DXN-BODY-LOTION', 'Aloe Vera Body Lotion', 'Personal Care', 1530, 1275, 180, 0],
  ['DXN-BODY-SCRUB-200', 'Body Scrub 200g', 'Personal Care', 540, 450, 90, 0],
  ['DXN-HAIR-OIL-100', 'Hair Oil 100ml', 'Personal Care', 710, 590, 135, 0],
  ['DXN-HAIR-PACK-20X5', 'Hair Pack (20g x 5)', 'Personal Care', 290, 240, 45, 0],
  ['DXN-RISHI-GANO-TEA-200', 'Rishi Gano Tea 200g', 'Coffee & Tea', 545, 455, 90, 0],
  ['DXN-MASALA-TEA-100', 'Masala Tea 100g', 'Coffee & Tea', 300, 250, 60, 0],
  ['DXN-LZC-BLACK-20', 'Lingzhi Black Coffee (5g x 20)', 'Coffee & Tea', 1190, 990, 350, 0],
  ['DXN-LZC-3IN1-20', 'Lingzhi Coffee 3-in-1', 'Coffee & Tea', 2460, 2050, 475, 0],
  ['DXN-LZC-LITE-20', 'Lingzhi Coffee 3-in-1 Lite', 'Coffee & Tea', 2370, 1975, 365, 0],
  ['DXN-WHITE-COFFEE-20', 'White Coffee Zhino', 'Coffee & Tea', 2550, 2125, 290, 0],
  ['DXN-ZHI-MOCHA-20', 'Zhi Mocha Coffee', 'Coffee & Tea', 1510, 1260, 290, 0],
  ['DXN-EU-CAFE-20', 'Eu Cafe', 'Coffee & Tea', 2140, 1785, 300, 0],
  ['DXN-VITA-CAFE-20', 'Vita Cafe', 'Coffee & Tea', 2460, 2050, 345, 0],
  ['DXN-CORDYCEPS-COFFEE-20', 'Cordyceps Coffee 3-in-1', 'Coffee & Tea', 2330, 1940, 450, 0],
  ['DXN-LIONS-MANE-COFFEE-20', 'Lion\'s Mane Coffee', 'Coffee & Tea', 2840, 2365, 390, 0],
  ['DXN-COCOZHI-500', 'Cocozhi 500g', 'Food & Drink', 2695, 2245, 525, 0],
  ['DXN-SPIRULINA-CEREAL-500', 'Spirulina Cereal 500g', 'Food & Drink', 3180, 2650, 540, 0],
  ['DXN-CORDYCEPS-CEREAL-500', 'Cordyceps Cereal 500g', 'Food & Drink', 4255, 3545, 825, 0],
  ['DXN-LEMONZHI-500', 'Lemonzhi 500g', 'Food & Drink', 895, 745, 175, 0],
  ['DXN-ZHI-YOBITE-30', 'Zhi Yobite 30g', 'Food & Drink', 840, 700, 125, 0],
  ['DXN-LINA-YOBITE-30', 'Lina Yobite 30g', 'Food & Drink', 840, 700, 125, 0],
  ['DXN-APPLE-ENZYME-750', 'Apple Enzyme Drink 750ml', 'Food & Drink', 4060, 3385, 570, 0],
  ['DXN-APPLE-JAM-300', 'Apple Fermented Jam 300g', 'Food & Drink', 1555, 1295, 225, 0],
  ['DXN-LIONS-MANE-OOCHA', 'Lion\'s Mane Oocha', 'Food & Drink', 2810, 2340, 395, 0],
  ['DXN-LIONS-MANE-MATCHA', 'Lion\'s Mane Lemon Matcha', 'Food & Drink', 2020, 1685, 305, 0],
  ['DXN-SPIRUDLE-PLAIN', 'Spirudle', 'Food & Drink', 1225, 1020, 190, 0],
  ['DXN-GOJI-BERRY', 'Goji Berry', 'Food & Drink', 4115, 3430, 625, 0],
  ['DXN-OOCHA-NOODLES', 'Oocha Noodles', 'Food & Drink', 1225, 1020, 175, 0],
  ['DXN-OOCHA-NOODLES-TYF', 'Oocha Noodles (TYF)', 'Food & Drink', 1915, 1595, 235, 0],
  ['DXN-VEGGIE-NOODLE', 'Veggie Noodle', 'Food & Drink', 1060, 885, 170, 0],
  ['DXN-RG-POWDER-50', 'RG Powder 50g', 'Supplements', 4145, 3455, 1070, 0],
  ['DXN-GL-POWDER-80', 'GL Powder 80g', 'Supplements', 3060, 2550, 770, 0],
  ['DXN-CORDYCEPS-POWDER-30', 'Cordyceps Powder 30g', 'Supplements', 3275, 2730, 960, 0],
  ['DXN-LIONS-MANE-POWDER-30', 'Lion\'s Mane Powder 30g', 'Supplements', 1680, 1400, 390, 0],
].map(([sku, name, category, retail, member, pv, stock], index) => ({
  id: index + 1,
  sku,
  name,
  category,
  description: PRODUCT_DESCRIPTIONS[sku] || null,
  retail_price: retail,
  member_price: member,
  pv_points: pv,
  stock_qty: stock,
  low_stock_at: 5,
  image_url: PRODUCT_IMAGES[sku] || null,
  is_active: 1,
  created_at: null,
  updated_at: null,
  rev: 0,
}));

/** Fills in bundled artwork/descriptions when the server row has none. */
function decorateProduct(product) {
  if (!product) return product;
  return {
    ...product,
    image_url: product.image_url || PRODUCT_IMAGES[product.sku] || null,
    description: product.description || PRODUCT_DESCRIPTIONS[product.sku] || null,
  };
}

/** Absolute URL for a product photo, safe for API rows and bundled files. */
export function imageFor(product) {
  if (!product) return null;
  const raw = product.image_url || PRODUCT_IMAGES[product.sku] || null;
  if (!raw) return null;
  try {
    return new URL(raw, document.baseURI).href;
  } catch {
    return raw;
  }
}

const DEFAULT_SETTINGS = {
  branch_name: 'Mohammadpur Stock Point',
  whatsapp_number: '8801939994578',
  currency: 'BDT',
  low_stock_threshold: 5,
  receipt_footer: 'Thank you for choosing Mohammadpur Stock Point. Wealth through health.',
  business_address: 'H # 1, R # 11, B # A, Chandrima Model Town, Dhaka-1207',
  business_phone: '01939994578',
  allow_public_orders: 1,
};

/** Placeholder profile shipped before the Mohammadpur rebrand. */
const LEGACY_SETTINGS = {
  branch_name: ['DXN Stockpoint', 'DXN Stockpoint Central'],
  whatsapp_number: ['8801987851131'],
  receipt_footer: ['Thank you for choosing DXN!', 'Thank you for choosing DXN. Wealth through health.'],
  business_address: [''],
  business_phone: [''],
};

/** Fills the new shop profile over untouched placeholder values only. */
function withDefaults(settings) {
  const merged = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  for (const [key, placeholders] of Object.entries(LEGACY_SETTINGS)) {
    if (placeholders.includes(String(merged[key] ?? ''))) merged[key] = DEFAULT_SETTINGS[key];
  }
  return merged;
}

export const state = {
  ready: false,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  syncState: 'idle', // idle | syncing | online | pending | offline | local | error
  syncError: '',
  lastSyncAt: 0,
  lastPush: 0,
  rev: 0,
  products: [],
  orders: [],
  customers: [],
  settings: { ...DEFAULT_SETTINGS },
  cart: [],
  sale: emptySale(),
  tier: 'retail',
  outbox: [],
  isAdmin: false,
  health: null,
};

function emptySale() {
  return {
    customer_name: '',
    customer_phone: '',
    dxn_member_id: '',
    payment_method: 'CASH',
    discount: 0,
    note: '',
  };
}

// ── Persistence ─────────────────────────────────────────────────────────────

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false; // private mode or quota — the session keeps working in memory
  }
}

export function persistCache() {
  write(CACHE_KEY, {
    rev: state.rev,
    products: state.products,
    orders: state.orders,
    customers: state.customers,
    settings: state.settings,
    savedAt: Date.now(),
  });
}

export function persistCart() {
  write(CART_KEY, { cart: state.cart, sale: state.sale, tier: state.tier });
}

export function persistOutbox() {
  write(OUTBOX_KEY, state.outbox);
}

// ── Tiny observable ─────────────────────────────────────────────────────────

const listeners = new Set();

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let queued = false;

export function notify() {
  if (queued) return;
  queued = true;
  queueMicrotask(() => {
    queued = false;
    for (const fn of listeners) {
      try {
        fn(state);
      } catch (error) {
        console.error(error);
      }
    }
  });
}

/** Renders immediately while a poll is in flight. */
export function notifyNow() {
  for (const fn of listeners) {
    try {
      fn(state);
    } catch (error) {
      console.error(error);
    }
  }
}

// ── Boot ────────────────────────────────────────────────────────────────────

export function hydrate() {
  const cache = read(CACHE_KEY, null);
  if (cache) {
    state.rev = num(cache.rev);
    state.products = Array.isArray(cache.products) ? cache.products : [];
    state.orders = Array.isArray(cache.orders) ? cache.orders : [];
    state.customers = Array.isArray(cache.customers) ? cache.customers : [];
    state.settings = withDefaults(cache.settings);
    state.lastSyncAt = num(cache.savedAt);
  }

  state.products = state.products.map(decorateProduct);
  if (!state.products.length) state.products = SEED_PRODUCTS.map((p) => decorateProduct({ ...p }));

  const savedCart = read(CART_KEY, null);
  if (savedCart) {
    state.cart = Array.isArray(savedCart.cart) ? savedCart.cart : [];
    state.sale = { ...emptySale(), ...(savedCart.sale || {}) };
    state.tier = savedCart.tier === 'member' ? 'member' : 'retail';
  }

  state.outbox = read(OUTBOX_KEY, []) || [];

  const session = read(SESSION_KEY, null);
  state.isAdmin = Boolean(session?.isAdmin) && Boolean(getToken()) && !isTokenExpired(getTokenMeta());
  if (!state.isAdmin && session?.isAdmin) write(SESSION_KEY, { isAdmin: false });

  state.syncState = hasBase() ? 'idle' : 'local';
  state.ready = true;
  return state;
}

export function setAdmin(flag) {
  state.isAdmin = Boolean(flag);
  write(SESSION_KEY, { isAdmin: state.isAdmin });
  if (!flag) {
    setToken('');
    if (state.settings) {
      // admin-only fields never stay in the shared cache
      const { admin_pin_hash, ...rest } = state.settings;
      state.settings = rest;
    }
  }
  notify();
}

/** Re-reads the cache another tab just wrote. */
export function refreshFromStorage() {
  const cache = read(CACHE_KEY, null);
  if (!cache) return;
  state.rev = num(cache.rev);
  state.products = (Array.isArray(cache.products) ? cache.products : state.products).map(decorateProduct);
  state.orders = Array.isArray(cache.orders) ? cache.orders : state.orders;
  state.customers = Array.isArray(cache.customers) ? cache.customers : state.customers;
  state.settings = withDefaults(cache.settings);
  state.lastSyncAt = num(cache.savedAt) || state.lastSyncAt;
  const outbox = read(OUTBOX_KEY, null);
  if (Array.isArray(outbox)) state.outbox = outbox;
  notify();
}

// ── Derived data ────────────────────────────────────────────────────────────

export const currency = () => state.settings.currency || DEFAULT_SETTINGS.currency;

export const activeProducts = () => state.products.filter((p) => Number(p.is_active ?? 1) === 1);

export const productById = (id) => state.products.find((p) => Number(p.id) === Number(id)) || null;

export function unitPrice(product) {
  if (!product) return 0;
  return state.tier === 'member' ? num(product.member_price) : num(product.retail_price);
}

export function stockLevel(product) {
  const qty = num(product?.stock_qty);
  const threshold = Math.max(num(product?.low_stock_at, 5), num(state.settings.low_stock_threshold, 5));
  if (qty <= 0) return 'out';
  if (qty <= threshold) return 'low';
  return 'ok';
}

export function categories() {
  return [...new Set(activeProducts().map((p) => p.category).filter(Boolean))].sort();
}

export function cartLines() {
  return state.cart
    .map((line) => {
      const product = productById(line.productId);
      if (!product) return null;
      const price = unitPrice(product);
      const pv = num(product.pv_points);
      return {
        product,
        productId: product.id,
        qty: line.qty,
        price,
        pv,
        lineTotal: round2(price * line.qty),
        linePv: round2(pv * line.qty),
        available: num(product.stock_qty),
      };
    })
    .filter(Boolean);
}

export function cartTotals() {
  const lines = cartLines();
  const subtotal = round2(lines.reduce((sum, l) => sum + l.lineTotal, 0));
  const pv = round2(lines.reduce((sum, l) => sum + l.linePv, 0));
  const discount = Math.min(round2(num(state.sale.discount)), subtotal);
  const total = round2(Math.max(0, subtotal - discount));
  const units = lines.reduce((sum, l) => sum + l.qty, 0);
  return { lines, subtotal, discount, total, pv, units, count: lines.length };
}

export function cartCount() {
  return state.cart.reduce((sum, line) => sum + line.qty, 0);
}

export const pendingCount = () => state.outbox.filter((o) => o.status !== 'failed').length;
export const failedCount = () => state.outbox.filter((o) => o.status === 'failed').length;

// ── Cart ────────────────────────────────────────────────────────────────────

export function setTier(tier) {
  state.tier = tier === 'member' ? 'member' : 'retail';
  persistCart();
  notify();
}

export function addToCart(productId, qty = 1) {
  const product = productById(productId);
  if (!product) return { ok: false, message: 'That product is no longer in the catalogue.' };

  const existing = state.cart.find((line) => Number(line.productId) === Number(productId));
  const next = (existing?.qty || 0) + qty;
  if (next > num(product.stock_qty)) {
    return { ok: false, message: `Only ${num(product.stock_qty)} left of ${product.name}.` };
  }
  if (next <= 0) {
    state.cart = state.cart.filter((line) => Number(line.productId) !== Number(productId));
  } else if (existing) {
    existing.qty = next;
  } else {
    state.cart.push({ productId: product.id, qty: next });
  }
  persistCart();
  notify();
  return { ok: true };
}

export function setQty(productId, qty) {
  const product = productById(productId);
  const target = Math.max(0, Math.min(Math.round(qty), num(product?.stock_qty)));
  if (target <= 0) {
    removeFromCart(productId);
    return;
  }
  const line = state.cart.find((l) => Number(l.productId) === Number(productId));
  if (line) line.qty = target;
  else state.cart.push({ productId: Number(productId), qty: target });
  persistCart();
  notify();
}

export function removeFromCart(productId) {
  state.cart = state.cart.filter((line) => Number(line.productId) !== Number(productId));
  persistCart();
  notify();
}

export function clearCart() {
  state.cart = [];
  state.sale = emptySale();
  persistCart();
  notify();
}

export function updateSale(patch) {
  state.sale = { ...state.sale, ...patch };
  persistCart();
  notify();
}

export function buildOrderPayload() {
  const { lines, subtotal, discount, total, pv } = cartTotals();
  return {
    client_uuid: uuid(),
    customer_name: (state.sale.customer_name || '').trim() || 'Walk-in customer',
    customer_phone: (state.sale.customer_phone || '').trim(),
    dxn_member_id: (state.sale.dxn_member_id || '').trim(),
    is_member: state.tier === 'member',
    payment_method: state.sale.payment_method || 'CASH',
    discount,
    note: (state.sale.note || '').trim(),
    source: 'web',
    items: lines.map((line) => ({
      product_id: line.productId,
      product_sku: line.product.sku,
      quantity: line.qty,
      unit_price: line.price,
      unit_pv: line.pv,
    })),
    _totals: { subtotal, total, pv }, // stripped before it leaves the device
  };
}

// ── Outbox ──────────────────────────────────────────────────────────────────

export function enqueueOrder() {
  const payload = buildOrderPayload();
  if (!payload.items.length) return { ok: false, message: 'The cart is empty.' };
  const totals = payload._totals;
  delete payload._totals;

  state.outbox.push({
    id: payload.client_uuid,
    payload,
    totals,
    createdAt: Date.now(),
    attempts: 0,
    status: 'pending',
    error: '',
  });
  persistOutbox();
  clearCart();

  // Show the sale immediately: local stock only ever goes down optimistically.
  for (const item of payload.items) {
    const product = productById(item.product_id);
    if (product) product.stock_qty = num(product.stock_qty) - item.quantity;
  }
  persistCache();
  notify();

  syncNow();
  return { ok: true, payload };
}

export function dropFromOutbox(id) {
  state.outbox = state.outbox.filter((item) => item.id !== id);
  persistOutbox();
  notify();
}

export function retryOutboxItem(id) {
  const item = state.outbox.find((o) => o.id === id);
  if (!item) return;
  item.status = 'pending';
  item.error = '';
  item.attempts = 0;
  persistOutbox();
  notify();
  syncNow();
}

export function retryAll() {
  for (const item of state.outbox) {
    item.status = 'pending';
    item.error = '';
  }
  persistOutbox();
  notify();
  syncNow();
}

async function flushOutbox() {
  if (!state.outbox.length) return 0;
  let sent = 0;
  let blocked = false;

  for (const item of [...state.outbox]) {
    if (item.status === 'failed') continue;
    try {
      item.attempts += 1;
      const result = await api.createOrder(item.payload);
      state.outbox = state.outbox.filter((o) => o.id !== item.id);
      sent += 1;
      if (result?.order) mergeOrders([result.order]);
      if (result?.duplicate) mergeOrders([result.order]);
    } catch (error) {
      item.error = error.message;
      if (error instanceof ApiError && [400, 403, 404, 409, 422].includes(error.status)) {
        // A permanent rejection (e.g. stock ran out). Keep it visible so the
        // shop can decide; never retry it silently in a loop.
        item.status = 'failed';
      } else {
        blocked = true;
        break;
      }
    }
  }

  persistOutbox();
  if (sent) {
    state.lastPush = Date.now();
    persistCache();
  }
  if (blocked) {
    throw new ApiError('Still offline — queued sales will be pushed when the connection returns.');
  }
  return sent;
}

// ── Sync ────────────────────────────────────────────────────────────────────

function mergeProducts(incoming) {
  const map = new Map(state.products.map((p) => [Number(p.id), p]));
  for (const product of incoming) map.set(Number(product.id), decorateProduct(product));
  state.products = sortBy([...map.values()], 'name');
}

function mergeOrders(incoming) {
  const map = new Map(state.orders.map((o) => [Number(o.id), o]));
  for (const order of incoming) {
    const id = Number(order.id);
    if (!id) continue;
    map.set(id, { ...(map.get(id) || {}), ...order });
  }
  state.orders = [...map.values()]
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')) || Number(b.id) - Number(a.id))
    .slice(0, MAX_ORDERS);
}

/** Lets admin forms push a freshly saved row without waiting for the next poll. */
export function upsertProducts(list) {
  mergeProducts(list || []);
  persistCache();
  notify();
}

export function upsertOrders(list) {
  mergeOrders(list || []);
  persistCache();
  notify();
}

function mergeCustomers(incoming) {
  const map = new Map(state.customers.map((c) => [Number(c.id), c]));
  for (const customer of incoming) map.set(Number(customer.id), { ...(map.get(Number(customer.id)) || {}), ...customer });
  state.customers = [...map.values()].slice(0, 1000);
}

function applySync(payload) {
  if (Array.isArray(payload.products) && payload.products.length) mergeProducts(payload.products);
  if (Array.isArray(payload.orders) && payload.orders.length) mergeOrders(payload.orders);
  if (Array.isArray(payload.customers) && payload.customers.length) mergeCustomers(payload.customers);
  if (payload.settings && typeof payload.settings === 'object') {
    const { admin_pin_hash, ...safe } = payload.settings;
    state.settings = withDefaults({ ...state.settings, ...safe });
  }
  state.rev = Math.max(state.rev, num(payload.server_rev));
}

let syncing = false;

export async function syncNow({ quiet = false } = {}) {
  if (syncing) return;
  if (!hasBase()) {
    state.syncState = 'local';
    if (!quiet) notify();
    return;
  }
  if (!navigator.onLine) {
    state.syncState = 'offline';
    notify();
    return;
  }

  syncing = true;
  state.syncState = 'syncing';
  state.syncError = '';
  notify();

  try {
    await flushOutbox();

    let payload = await api.sync(state.rev);
    applySync(payload);

    let guard = 0;
    while (payload.truncated && guard < 12) {
      guard += 1;
      payload = await api.sync(state.rev);
      applySync(payload);
    }

    state.lastSyncAt = Date.now();
    state.syncState = state.outbox.length ? 'pending' : 'online';
    state.syncError = '';
    persistCache();
  } catch (error) {
    state.syncError = error.message || 'Sync failed';
    state.syncState = error?.status === 0 ? 'offline' : 'error';
  } finally {
    syncing = false;
    notify();
  }
}

export async function verifySession() {
  if (!state.isAdmin || !getToken()) return false;
  try {
    await api.me();
    return true;
  } catch (error) {
    if (error instanceof ApiError && error.isAuth) {
      setAdmin(false);
      return false;
    }
    return state.isAdmin;
  }
}

let loopStarted = false;

export function startSyncLoop() {
  if (loopStarted) return;
  loopStarted = true;

  window.addEventListener('online', () => {
    state.online = true;
    notify();
    syncNow();
  });

  window.addEventListener('offline', () => {
    state.online = false;
    state.syncState = 'offline';
    notify();
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) syncNow({ quiet: true });
  });

  window.addEventListener('storage', (event) => {
    if (event.key === CACHE_KEY || event.key === OUTBOX_KEY) refreshFromStorage();
  });

  setInterval(() => {
    if (!document.hidden && navigator.onLine) syncNow({ quiet: true });
  }, POLL_MS);

  syncNow();
  verifySession();
}

export { DEFAULT_SETTINGS, getBase };
