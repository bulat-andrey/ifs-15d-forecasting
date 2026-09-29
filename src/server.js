'use strict';
// GoKite — tiny zero-dependency Node server.
// - Fetches each blend model (ICON-D2, ICON-EU, ECMWF) from Open-Meteo in its own
//   multi-coordinate request, on an independent run-aligned schedule.
// - Merges them into ONE seamless per-spot series: best model per lead time, with a
//   linear crossfade at the seams and per-hour provenance (which model each hour used).
// - Caches the blended payload in memory and serves it + the static front-end.
// - Polls live IMGW-PIB station wind near the spots, pairs it with ICON-D2 at the same
//   point and time, and serves that at /api/observations.
// - Polls live IMGW-PIB station wind near the spots and serves it at /api/observations.
// Friends' browsers hit THIS server, not Open-Meteo, so one shared cache covers everyone.

const http = require('http');
const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const spots = require('./spots');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MODELS = cfg.MODELS;
const ANCHOR = MODELS[MODELS.length - 1];          // coarsest / longest-range (ECMWF) — the base grid
const BOUNDARIES = MODELS.slice(0, -1).map(m => m.useUntilH); // internal seams, e.g. [48, 120]
const HOURLY_VARS = 'wind_speed_10m,wind_direction_10m,wind_gusts_10m,temperature_2m,precipitation';
const SCALAR_VARS = ['wind_speed_10m', 'wind_gusts_10m', 'temperature_2m', 'precipitation']; // linearly blendable
const UA = { 'User-Agent': 'gokite/1.0 (personal, non-commercial)' };

let cache = emptyCache();
const rawByModel = {}; // id -> array (one entry per spot, in `spots` order) | null
const state = {};      // id -> { lastAvail, lastFetchMs, run, avail, interval }
MODELS.forEach(m => { rawByModel[m.id] = null; state[m.id] = { lastAvail: 0, lastFetchMs: 0, run: null, avail: null, interval: null }; });

function emptyCache() {
  return {
    generated: null, stale: true, model: 'blend', blend: MODELS.map(m => m.shortLabel),
    model_run: null, model_availability: null, model_next_update_expected: null, model_update_interval_seconds: null,
    timezone: cfg.TIMEZONE, threshold_kt: cfg.KITE_THRESHOLD_KT, models: [], spots: []
  };
}

function urlFor(m) {
  const p = new URLSearchParams({
    latitude: spots.map(s => s.lat).join(','),
    longitude: spots.map(s => s.lon).join(','),
    hourly: HOURLY_VARS,
    daily: 'sunrise,sunset',
    wind_speed_unit: 'kn',
    timezone: cfg.TIMEZONE,
    forecast_days: String(m.days),
    models: m.id,
    cell_selection: cfg.CELL_SELECTION
  });
  return 'https://api.open-meteo.com/v1/forecast?' + p.toString();
}

async function fetchModel(m) {
  const res = await fetch(urlFor(m), { headers: UA });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + (await res.text()).slice(0, 160));
  const data = await res.json();
  rawByModel[m.id] = Array.isArray(data) ? data : [data]; // multi-coordinate → array, same order as input
  state[m.id].lastFetchMs = Date.now();
}

// Cheap metadata probe (does NOT count toward API limits): run/update timing in unix seconds, or null.
async function fetchMeta(m) {
  try {
    const res = await fetch(`https://api.open-meteo.com/data/${m.meta}/static/meta.json`, { headers: UA });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const j = await res.json();
    return { run: j.last_run_initialisation_time || 0, avail: j.last_run_availability_time || 0, interval: j.update_interval_seconds || 0 };
  } catch (e) {
    console.error(`[meta ${m.id}] failed:`, e.message);
    return null;
  }
}

function nextExpected(avail, interval) { let n = avail + interval; while (n * 1000 <= Date.now()) n += interval; return n; }

// ---- blending helpers ----
const CF = cfg.CROSSFADE_H > 0 ? cfg.CROSSFADE_H : 1;
const HALF = CF / 2;
// 0 below (b-HALF), ramps linearly to 1 above (b+HALF)
const rampUp = (x, b) => Math.min(1, Math.max(0, (x - (b - HALF)) / CF));
// Per-model blend weight at a given rolling lead hour, from the seam boundaries.
function modelWeights(leadH) {
  return MODELS.map((m, k) => {
    let w = 1;
    if (k > 0) w *= rampUp(leadH, BOUNDARIES[k - 1]);          // fade in at the lower seam
    if (k < MODELS.length - 1) w *= (1 - rampUp(leadH, BOUNDARIES[k])); // fade out at the upper seam
    return w;
  });
}

const tms = iso => Date.parse(iso.slice(0, 16) + ':00Z');

// Match the current instant to Open-Meteo's local wall-clock ISO timeline.
function localWallMs(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: cfg.TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(date).reduce((o, p) => { if (p.type !== 'literal') o[p.type] = p.value; return o; }, {});
  return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
}

// Merge the latest per-model raw responses into one blended payload.
function buildBlend() {
  // Base grid = the longest-range model that has data (anchor/ECMWF, else fall back coarsest→finest).
  let base = null;
  for (let k = MODELS.length - 1; k >= 0; k--) if (rawByModel[MODELS[k].id]) { base = MODELS[k]; break; }
  if (!base) return; // nothing fetched yet — keep stale cache

  const outSpots = spots.map((s, si) => {
    const baseSpot = (rawByModel[base.id] && rawByModel[base.id][si]) || {};
    const time = (baseSpot.hourly && baseSpot.hourly.time) || [];
    const gridStart = time.length ? tms(time[0]) : 0; // local midnight of day 0
    const nowLeadH = (localWallMs() - gridStart) / 3.6e6;

    // Per-model time→index lookup for this spot (models requested separately => own grids).
    const lut = MODELS.map(m => {
      const r = rawByModel[m.id] && rawByModel[m.id][si];
      const t = r && r.hourly && r.hourly.time;
      const map = new Map();
      if (t) for (let i = 0; i < t.length; i++) map.set(t[i], i);
      return { m, r, map };
    });

    const out = { time, wind_direction_10m: new Array(time.length), model: new Array(time.length) };
    SCALAR_VARS.forEach(v => (out[v] = new Array(time.length)));

    for (let j = 0; j < time.length; j++) {
      const t = time[j];
      const leadH = (tms(t) - gridStart) / 3.6e6 - nowLeadH;
      const w = modelWeights(leadH);

      // Resolve each model's row index + effective (availability-gated) weight; track dominant.
      let dom = -1, domW = -1;
      const pm = lut.map((L, k) => {
        const i = L.map.has(t) ? L.map.get(t) : null;
        const has = i != null && L.r && L.r.hourly && L.r.hourly.wind_speed_10m && L.r.hourly.wind_speed_10m[i] != null;
        const eff = has ? w[k] : 0;
        if (eff > domW) { domW = eff; dom = k; }
        return { L, i, has, eff };
      });

      // Scalars: weighted crossfade across models that have data; fall back to nearest available.
      SCALAR_VARS.forEach(v => {
        let ws = 0, vs = 0;
        for (const p of pm) {
          if (p.eff <= 0) continue;
          const val = p.L.r.hourly[v] && p.L.r.hourly[v][p.i];
          if (val != null) { vs += p.eff * val; ws += p.eff; }
        }
        if (ws > 0) { out[v][j] = vs / ws; return; }
        let f = null;
        for (const p of pm) { if (!p.has) continue; const val = p.L.r.hourly[v] && p.L.r.hourly[v][p.i]; if (val != null) { f = val; break; } }
        out[v][j] = f;
      });

      // Direction is angular — don't average it. Take it from the dominant available model.
      let dk = (dom >= 0 && pm[dom].has) ? dom : pm.findIndex(p => p.has);
      if (dk >= 0) {
        const dir = pm[dk].L.r.hourly.wind_direction_10m;
        out.wind_direction_10m[j] = dir ? dir[pm[dk].i] : null;
        out.model[j] = MODELS[dk].id; // provenance
      } else {
        out.wind_direction_10m[j] = null;
        out.model[j] = null;
      }
    }

    // Daily (sunrise/sunset for daylight windows): prefer the longest-range model available.
    let daily = null;
    for (let k = MODELS.length - 1; k >= 0; k--) {
      const r = rawByModel[MODELS[k].id] && rawByModel[MODELS[k].id][si];
      if (r && r.daily && r.daily.time) { daily = r.daily; break; }
    }

    return {
      name: s.name, lat: s.lat, lon: s.lon, dx: s.dx, dy: s.dy, place: s.place, nudge: s.nudge, wg: s.wg,
      goodFrom: s.goodFrom, externalLinks: s.externalLinks || [],
      grid_lat: baseSpot.latitude, grid_lon: baseSpot.longitude, elevation: baseSpot.elevation,
      hourly: out, daily
    };
  });

  // Header/run info comes from the anchor (long-range) model; per-model detail in models[].
  const a = state[ANCHOR.id];
  const iso = sec => (sec ? new Date(sec * 1000).toISOString() : null);
  cache = {
    generated: new Date().toISOString(),
    stale: false,
    model: 'blend',
    blend: MODELS.map(m => m.shortLabel),
    model_run: iso(a.run),
    model_availability: iso(a.avail),
    model_next_update_expected: (a.avail && a.interval) ? iso(nextExpected(a.avail, a.interval)) : null,
    model_update_interval_seconds: a.interval || null,
    timezone: cfg.TIMEZONE,
    threshold_kt: cfg.KITE_THRESHOLD_KT,
    models: MODELS.map(m => ({ id: m.id, label: m.label, short: m.shortLabel, useUntilH: m.useUntilH === Infinity ? null : m.useUntilH, run: iso(state[m.id].run), availability: iso(state[m.id].avail), fetched: state[m.id].lastFetchMs ? new Date(state[m.id].lastFetchMs).toISOString() : null, updateIntervalSeconds: state[m.id].interval || null, loaded: !!rawByModel[m.id] })),
    spots: outSpots
  };
  console.log(`[blend] ${cache.generated} spots=${outSpots.length} models=${MODELS.filter(m => rawByModel[m.id]).map(m => m.shortLabel).join('+')}`);
}

// Run-aligned refresh for a single model: fetch only when a NEW run is available (+settle),
// with a safety net if metadata is unreachable. `force` fetches now (cold start).
async function refreshModel(m, force = false) {
  const meta = await fetchMeta(m);
  if (meta) { state[m.id].run = meta.run; state[m.id].avail = meta.avail; state[m.id].interval = meta.interval; }
  let did = false;

  if (meta && meta.avail) {
    const settled = Date.now() >= (meta.avail + cfg.POST_RUN_DELAY_MIN * 60) * 1000;
    if (force || (meta.avail > state[m.id].lastAvail && settled)) {
      try { await fetchModel(m); state[m.id].lastAvail = meta.avail; did = true; console.log(`[fetch ${m.id}] ok run=${new Date(meta.run * 1000).toISOString()}`); }
      catch (e) { console.error(`[fetch ${m.id}] failed:`, e.message); }
    }
  } else if (force) {
    try { await fetchModel(m); did = true; console.log(`[fetch ${m.id}] ok (no metadata)`); }
    catch (e) { console.error(`[fetch ${m.id}] failed:`, e.message); }
  }

  if (!did && Date.now() - state[m.id].lastFetchMs > cfg.SAFETY_REFRESH_MIN * 60_000) {
    try { await fetchModel(m); if (meta && meta.avail) state[m.id].lastAvail = meta.avail; did = true; console.warn(`[fetch ${m.id}] safety refresh`); }
    catch (e) { console.error(`[fetch ${m.id}] safety failed:`, e.message); }
  }
  return did;
}

async function tick() {
  let changed = false;
  for (const m of MODELS) if (await refreshModel(m)) changed = true;
  if (changed) buildBlend();
  else if (cache.stale) buildBlend(); // (re)build if we have any data but never blended
}

// ---- live station observations (IMGW-PIB telemetry) ----
// One free, keyless call returns the latest 10-minute reading for ~800 Polish stations.
// We keep only stations near a spot that currently report wind speed AND direction,
// and pair each reading with ICON-D2 at the same point and time, so the map can show
// "is the model right at the moment?".
const IMGW_METEO_URL = 'https://danepubliczne.imgw.pl/api/data/meteo';
const MS_TO_KT = 1.943844;
const OBS_MODEL = MODELS.find(m => m.id === cfg.OBS_MODEL) || { id: cfg.OBS_MODEL, shortLabel: cfg.OBS_MODEL };
let observations = { generated: null, source: 'IMGW-PIB', model: OBS_MODEL.id, model_label: OBS_MODEL.shortLabel, stations: [] };

// Great-circle distance in km.
function distanceKm(aLat, aLon, bLat, bLon) {
  const rad = Math.PI / 180, dLat = (bLat - aLat) * rad, dLon = (bLon - aLon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
function nearestSpot(lat, lon) {
  let best = null;
  for (const s of spots) {
    const km = distanceKm(lat, lon, s.lat, s.lon);
    if (!best || km < best.km) best = { name: s.name, km };
  }
  return best;
}

// IMGW timestamps look like "2026-09-29 16:10:00" and are UTC.
const imgwTimeMs = s => (s ? Date.parse(s.replace(' ', 'T') + 'Z') : NaN);
const num = v => (v == null || v === '' ? null : Number(v));
// "GDAŃSK-PORT PÓŁNOCNY" -> "Gdańsk-Port Północny"
const titleCase = s => s.toLocaleLowerCase('pl').replace(/(^|[\s\-.(])(\p{L})/gu, (m, sep, ch) => sep + ch.toLocaleUpperCase('pl'));

function parseObservations(rows) {
  const now = Date.now();
  return rows.map(o => {
    const lat = num(o.lat), lon = num(o.lon);
    const speed = num(o.wiatr_srednia_predkosc), dir = num(o.wiatr_kierunek);
    const t = imgwTimeMs(o.wiatr_srednia_predkosc_data);
    if (lat == null || lon == null || speed == null || dir == null || !Number.isFinite(t)) return null;
    const elevation = num(o.wysokosc_npm);
    if (elevation != null && elevation > cfg.OBS_MAX_ELEVATION_M) return null;
    const near = nearestSpot(lat, lon);
    if (near.km > cfg.OBS_MAX_SPOT_KM) return null;
    if (now - t > cfg.OBS_MAX_AGE_MIN * 60_000) return null;
    // Direction and max wind must belong to (roughly) the same reading as the mean speed.
    const sameReading = s => Math.abs(imgwTimeMs(s) - t) <= 10 * 60_000;
    if (!sameReading(o.wiatr_kierunek_data)) return null;
    const max = num(o.wiatr_predkosc_maksymalna);
    const maxOk = max != null && sameReading(o.wiatr_predkosc_maksymalna_data);
    return {
      id: String(o.kod_stacji),
      name: titleCase(String(o.nazwa_stacji || '')),
      lat, lon,
      elevation,
      speed_kt: speed * MS_TO_KT,
      max_kt: maxOk ? max * MS_TO_KT : null,
      dir: ((dir % 360) + 360) % 360,
      time: new Date(t).toISOString(),
      near_spot: near.name,
      near_spot_km: Math.round(near.km * 10) / 10,
      model: null
    };
  }).filter(Boolean).sort((a, b) => a.lon - b.lon);
}

// ICON-D2 at the station points, native 15-minute steps, only a few hours around now.
// `cell_selection=nearest` compares against the grid cell at the station itself.
async function fetchStationModel(stations) {
  const p = new URLSearchParams({
    latitude: stations.map(s => s.lat).join(','),
    longitude: stations.map(s => s.lon).join(','),
    minutely_15: 'wind_speed_10m,wind_direction_10m,wind_gusts_10m',
    models: OBS_MODEL.id,
    wind_speed_unit: 'kn',
    timezone: 'GMT',
    past_minutely_15: String(Math.ceil(cfg.OBS_MAX_AGE_MIN / 15) + 1),
    forecast_minutely_15: '4',
    cell_selection: 'nearest'
  });
  const res = await fetch('https://api.open-meteo.com/v1/forecast?' + p.toString(), { headers: UA, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + (await res.text()).slice(0, 160));
  const data = await res.json();
  const list = Array.isArray(data) ? data : [data];
  stations.forEach((s, k) => {
    const m = list[k] && list[k].minutely_15;
    if (!m || !m.time) return;
    // Nearest 15-minute step to the observation time (Open-Meteo GMT times have no "Z").
    const obsMs = Date.parse(s.time);
    let best = -1, bestDiff = Infinity;
    m.time.forEach((iso, i) => {
      const diff = Math.abs(Date.parse(iso + ':00Z') - obsMs);
      if (diff < bestDiff && m.wind_speed_10m[i] != null) { bestDiff = diff; best = i; }
    });
    if (best < 0 || bestDiff > 15 * 60_000) return;
    s.model = {
      time: new Date(Date.parse(m.time[best] + ':00Z')).toISOString(),
      speed_kt: m.wind_speed_10m[best],
      gust_kt: m.wind_gusts_10m ? m.wind_gusts_10m[best] : null,
      dir: m.wind_direction_10m ? m.wind_direction_10m[best] : null
    };
  });
}

async function refreshObservations() {
  let stations;
  try {
    const res = await fetch(IMGW_METEO_URL, { headers: UA, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const rows = await res.json();
    if (!Array.isArray(rows)) throw new Error('unexpected payload');
    stations = parseObservations(rows);
  } catch (e) {
    // Keep the last good set; the client greys out readings as they age.
    console.error('[obs] failed:', e.message);
    return;
  }
  if (stations.length) {
    try { await fetchStationModel(stations); }
    catch (e) { console.error(`[obs ${OBS_MODEL.id}] failed:`, e.message); } // still show observations
  }
  observations = { generated: new Date().toISOString(), source: 'IMGW-PIB', model: OBS_MODEL.id, model_label: OBS_MODEL.shortLabel, stations };
  console.log(`[obs] ${observations.generated} stations=${stations.length} with ${OBS_MODEL.shortLabel}=${stations.filter(s => s.model).length}`);
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json'
};

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8', allow: 'GET, HEAD' });
    return res.end('method not allowed');
  }

  if (u.pathname === '/api/forecast') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    return res.end(JSON.stringify(cache));
  }
  if (u.pathname === '/api/observations') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    return res.end(JSON.stringify(observations));
  }
  if (u.pathname === '/api/health') {
    res.writeHead(cache.stale ? 503 : 200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ ok: !cache.stale, generated: cache.generated, models: cache.models.map(m => ({ id: m.id, loaded: m.loaded, availability: m.availability })) }));
  }

  // static file serving, path-traversal safe
  let rel = decodeURIComponent(u.pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const fp = path.join(PUBLIC_DIR, path.normalize(rel));
  if (!fp.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(fp, (err, buf) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('not found'); }
    const ext = path.extname(fp);
    const headers = { 'content-type': MIME[ext] || 'application/octet-stream' };
    headers['cache-control'] = ['.html', '.js', '.css'].includes(ext) ? 'no-cache' : 'public, max-age=31536000';
    res.writeHead(200, headers);
    res.end(buf);
  });
});

server.listen(cfg.PORT, cfg.HOST, () => {
  console.log(`gokite listening on http://${cfg.HOST}:${cfg.PORT} (blend=${MODELS.map(m => m.shortLabel).join('→')}, crossfade ${CF}h, meta poll ${cfg.METADATA_POLL_MIN}min, +${cfg.POST_RUN_DELAY_MIN}min settle)`);
});

// Cold start: fetch every model immediately (in parallel) so the app isn't empty,
// seeding each model's lastAvail so we don't refetch until its next run lands.
(async () => {
  await Promise.all(MODELS.map(m => refreshModel(m, true)));
  buildBlend();
})();
setInterval(tick, cfg.METADATA_POLL_MIN * 60_000);

// Observations are independent of the forecast cache and don't gate /api/health.
refreshObservations();
setInterval(refreshObservations, cfg.OBS_POLL_MIN * 60_000);
