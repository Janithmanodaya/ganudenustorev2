/**
 * Lightweight client-side recommendations using browser cookies.
 * Stores a compact interest profile and ranks listings by affinity.
 */

const COOKIE_NAME = 'gd_reco_profile';
const COOKIE_MAX_DAYS = 90;

// Cookie helpers
function readCookie(name) {
  try {
    const parts = document.cookie.split(';').map(s => s.trim());
    for (const p of parts) {
      if (!p) continue;
      const [k, ...rest] = p.split('=');
      if (decodeURIComponent(k) === name) {
        const v = rest.join('=');
        return decodeURIComponent(v || '');
      }
    }
  } catch (_) {}
  return '';
}
function writeCookie(name, value, days) {
  try {
    const d = new Date();
    d.setTime(d.getTime() + Math.max(1, (days || COOKIE_MAX_DAYS)) * 24 * 60 * 60 * 1000);
    const expires = 'expires=' + d.toUTCString();
    document.cookie = encodeURIComponent(name) + '=' + encodeURIComponent(value) + ';' + expires + ';path=/;SameSite=Lax';
  } catch (_) {}
}
function getProfile() {
  try {
    const raw = readCookie(COOKIE_NAME);
    if (!raw) return defaultProfile();
    const obj = JSON.parse(raw);
    return sanitizeProfile(obj);
  } catch (_) {
    return defaultProfile();
  }
}
function setProfile(p) {
  try {
    const compact = compactProfile(p);
    writeCookie(COOKIE_NAME, JSON.stringify(compact), COOKIE_MAX_DAYS);
  } catch (_) {}
}
function defaultProfile() {
  return {
    categories: {},         // { Vehicle: 3, Property: 1, ... }
    sub_categories: {},     // { Bike: 4, Car: 1, ... }
    models: {},             // { Honda Dio: 3, ... }
    locations: {},          // { Kandy: 2, ... }
    keywords: {},           // { honda: 5, house: 2, ... }
    price_buckets: {        // coarse distribution
      '0-100k': 0,
      '100k-500k': 0,
      '500k-1m': 0,
      '1m-3m': 0,
      '3m+': 0
    },
    recent_listing_ids: [], // last 20 viewed
    last_searches: [],      // last 10 queries
    updated_at: Date.now()
  };
}
function sanitizeProfile(p) {
  const d = defaultProfile();
  const out = { ...d, ...(p || {}) };
  out.categories = out.categories || {};
  out.sub_categories = out.sub_categories || {};
  out.models = out.models || {};
  out.locations = out.locations || {};
  out.keywords = out.keywords || {};
  out.price_buckets = out.price_buckets || d.price_buckets;
  out.recent_listing_ids = Array.isArray(out.recent_listing_ids) ? out.recent_listing_ids.slice(-20) : [];
  out.last_searches = Array.isArray(out.last_searches) ? out.last_searches.slice(-10) : [];
  out.updated_at = Number(out.updated_at || Date.now());
  return out;
}
function compactProfile(p) {
  // Limit number of keys to keep cookie small
  const trimObj = (obj, max = 24) => {
    const entries = Object.entries(obj || {});
    entries.sort((a, b) => (b[1] || 0) - (a[1] || 0));
    const trimmed = entries.slice(0, max);
    return Object.fromEntries(trimmed);
  };
  return {
    categories: trimObj(p.categories, 12),
    sub_categories: trimObj(p.sub_categories, 24),
    models: trimObj(p.models, 24),
    locations: trimObj(p.locations, 24),
    keywords: trimObj(p.keywords, 48),
    price_buckets: p.price_buckets || defaultProfile().price_buckets,
    recent_listing_ids: Array.isArray(p.recent_listing_ids) ? p.recent_listing_ids.slice(-20) : [],
    last_searches: Array.isArray(p.last_searches) ? p.last_searches.slice(-10) : [],
    updated_at: Date.now()
  };
}

// Utils
function bump(map, key, inc = 1) {
  if (!key) return;
  const k = String(key).trim();
  if (!k) return;
  map[k] = (map[k] || 0) + Number(inc);
}
function tokenize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3 && !STOP_WORDS.has(w));
}
const STOP_WORDS = new Set([
  'the','and','for','with','from','this','that','your','you','our',
  'in','on','to','of','a','an','by','at','or','as','is','are','was','were',
  'new','like','very','good','best','great'
]);

function priceBucket(n) {
  const v = Number(n);
  if (!isFinite(v) || v <= 0) return null;
  if (v <= 100_000) return '0-100k';
  if (v <= 500_000) return '100k-500k';
  if (v <= 1_000_000) return '500k-1m';
  if (v <= 3_000_000) return '1m-3m';
  return '3m+';
}

function parseListing(listing) {
  const sj = (() => { try { return JSON.parse(listing.structured_json || '{}'); } catch (_) { return {}; } })();
  const main_category = String(listing.main_category || '').trim();
  const sub_category = String(sj.sub_category || '').trim();
  const model_name = String(sj.model_name || '').trim();
  const location = String(listing.location || '').trim();
  const price = listing.price != null ? Number(listing.price) : null;
  const title = String(listing.title || '');
  const desc = String(listing.seo_description || listing.description || '');
  const tokens = Array.from(new Set([...tokenize(title), ...tokenize(desc), ...tokenize(model_name), ...tokenize(sub_category)]));
  const urgent = !!(listing.is_urgent || listing.urgent);
  const created_at = listing.created_at ? new Date(listing.created_at).getTime() : null;
  return { main_category, sub_category, model_name, location, price, tokens, urgent, created_at };
}

// Tracking
export function trackSearch(term) {
  try {
    const p = getProfile();
    const tks = tokenize(term);
    for (const t of tks) bump(p.keywords, t, 1.5);
    p.last_searches = [...p.last_searches, String(term)].slice(-10);
    p.updated_at = Date.now();
    setProfile(p);
  } catch (_) {}
}

export function trackView(listing) {
  try {
    const p = getProfile();
    const f = parseListing(listing);
    if (f.main_category) bump(p.categories, f.main_category, 2);
    if (f.sub_category) bump(p.sub_categories, f.sub_category, 1.5);
    if (f.model_name) bump(p.models, f.model_name, 1.5);
    if (f.location) bump(p.locations, f.location, 1.2);
    for (const t of f.tokens) bump(p.keywords, t, 1);
    const pb = priceBucket(f.price);
    if (pb) bump(p.price_buckets, pb, 1);
    const id = Number(listing.id);
    if (Number.isFinite(id)) {
      const next = Array.isArray(p.recent_listing_ids) ? p.recent_listing_ids.filter(x => Number(x) !== id) : [];
      p.recent_listing_ids = [...next, id].slice(-20);
    }
    p.updated_at = Date.now();
    setProfile(p);
  } catch (_) {}
}

// Core scoring
function scoreListing(listing, profile, context) {
  const f = parseListing(listing);
  let score = 0;

  // Category/sub/model match
  if (f.main_category) score += (profile.categories[f.main_category] || 0) * 3.0;
  if (f.sub_category) score += (profile.sub_categories[f.sub_category] || 0) * 2.2;
  if (f.model_name) score += (profile.models[f.model_name] || 0) * 2.0;
  if (f.location) score += (profile.locations[f.location] || 0) * 1.6;

  // Keyword affinity (title/desc)
  for (const t of f.tokens) score += (profile.keywords[t] || 0) * 0.9;

  // Last search term boost
  const lastQ = String(context?.query || '').trim().toLowerCase();
  if (lastQ) {
    const qTokens = tokenize(lastQ);
    const overlap = qTokens.filter(t => f.tokens.includes(t)).length;
    score += overlap * 2.5;
  }

  // Price preference: bucket proximity
  const pb = priceBucket(f.price);
  if (pb) score += (profile.price_buckets[pb] || 0) * 1.2;

  // Recency boost
  if (f.created_at) {
    const days = Math.max(0, (Date.now() - f.created_at) / (1000 * 60 * 60 * 24));
    const recency = Math.max(0, 1.0 - Math.min(1.0, days / 30)); // within 30 days
    score += recency * 4.0;
  }

  // Urgent boost
  if (f.urgent) score += 3.0;

  // Small tie-breaker: lower price gets slight boost
  if (Number.isFinite(f.price)) {
    const pr = Math.log10(Math.max(1, f.price));
    score += Math.max(0, 5.0 - pr) * 0.4;
  }

  // Penalize items already viewed recently
  if (Array.isArray(profile.recent_listing_ids) && profile.recent_listing_ids.includes(Number(listing.id))) {
    score *= 0.6;
  }

  return score;
}

function topKeys(obj, n = 1) {
  const entries = Object.entries(obj || {});
  entries.sort((a, b) => (b[1] || 0) - (a[1] || 0));
  return entries.slice(0, n).map(([k]) => k);
}

async function fetchPool(opts) {
  const params = new URLSearchParams();
  params.set('sort', 'random');
  params.set('page', '1');
  params.set('limit', String(Math.max(20, Math.min(100, opts?.limit || 60))));
  if (opts?.category) params.set('category', opts.category);
  if (opts?.location) params.set('location', opts.location);
  if (opts?.filters && Object.keys(opts.filters).length) params.set('filters', JSON.stringify(opts.filters));
  const url = `/api/listings/search?${params.toString()}`;
  const r = await fetch(url);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return [];
  return Array.isArray(data.results) ? data.results : [];
}

export async function getSuggestedListings(context = {}) {
  const profile = getProfile();
  // Derive focus from profile
  const category = topKeys(profile.categories, 1)[0] || '';
  const location = topKeys(profile.locations, 1)[0] || '';
  const sub = topKeys(profile.sub_categories, 1)[0] || '';
  const model = topKeys(profile.models, 1)[0] || '';

  const filters = {};
  if (sub) filters.sub_category = sub;
  if (model) filters.model = model;

  // Try a focused pool first
  let pool = await fetchPool({ category, location, filters, limit: 80 });

  // Fallback: if no data found for focused query, fetch a broad random pool
  if (!pool.length) {
    try {
      pool = await fetchPool({ limit: 100 });
    } catch (_) {
      pool = [];
    }
  }

  if (!pool.length) return [];

  const scored = pool
    .map(it => ({ item: it, score: scoreListing(it, profile, { query: context.query || '' }) }))
    .sort((a, b) => b.score - a.score);

  const uniq = [];
  const seen = new Set();
  for (const s of scored) {
    const id = Number(s.item.id);
    if (!Number.isFinite(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    uniq.push(s.item);
    if (uniq.length >= (context.limit || 12)) break;
  }

  // Final fallback: if scoring produced no items (e.g., all invalid ids), return a few random ones
  if (!uniq.length) {
    const out = [];
    for (const it of pool) {
      const id = Number(it.id);
      if (!Number.isFinite(id)) continue;
      out.push(it);
      if (out.length >= (context.limit || 12)) break;
    }
    return out;
  }

  return uniq;
}

export async function getSimilarListings(baseListing, limit = 6) {
  const profile = getProfile();
  const f = parseListing(baseListing);
  const filters = {};
  if (f.sub_category) filters.sub_category = f.sub_category;
  if (f.model_name) filters.model = f.model_name;
  const pool = await fetchPool({ category: f.main_category, location: f.location, filters, limit: 100 });
  const ranked = pool
    .filter(x => Number(x.id) !== Number(baseListing.id))
    .map(it => {
      // Add direct similarity signals
      let bonus = 0;
      const g = parseListing(it);
      if (g.sub_category && f.sub_category && g.sub_category === f.sub_category) bonus += 4.0;
      if (g.model_name && f.model_name && g.model_name === f.model_name) bonus += 3.5;
      if (g.location && f.location && g.location.toLowerCase() === f.location.toLowerCase()) bonus += 2.0;

      // Token overlap
      const overlap = g.tokens.filter(t => f.tokens.includes(t)).length;
      bonus += overlap * 1.2;

      const baseScore = scoreListing(it, profile, {});
      return { item: it, score: baseScore + bonus };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.item);
  return ranked;
}

export function buildUserProfile() {
  // Expose for pages that want to inspect user's profile
  return getProfile();
}