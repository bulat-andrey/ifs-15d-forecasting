'use strict';
// Baltic Wind — tiny zero-dependency Node server.
// - Fetches all 13 spots from Open-Meteo in ONE multi-coordinate request, server-side.
// - Caches the transformed payload in memory and re-fetches on a schedule.
// - Serves the static front-end and a /api/forecast JSON endpoint.
// Friends' browsers hit THIS server, not Open-Meteo, so one shared cache covers everyone.

const http = require('http');
const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const spots = require('./spots');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

let cache = { generated: null, stale: true, model: cfg.MODEL, model_run: null, model_availability: null, model_next_update_expected: null, model_update_interval_seconds: null, threshold_kt: cfg.KITE_THRESHOLD_KT, spots: [] };
const META_URL = `https://api.open-meteo.com/data/${cfg.MODEL}/static/meta.json`;
let lastAvail = 0;        // last run availability time (unix s) we've already fetched
let lastFetchMs = 0;      // wall-clock of our last successful forecast fetch

function openMeteoUrl() {
  const p = new URLSearchParams({
    latitude: spots.map(s => s.lat).join(','),
    longitude: spots.map(s => s.lon).join(','),
    hourly: 'wind_speed_10m,wind_direction_10m,wind_gusts_10m,temperature_2m,precipitation',
    daily: 'sunrise,sunset',
    wind_speed_unit: 'kn',
    timezone: cfg.TIMEZONE,
    forecast_days: String(cfg.FORECAST_DAYS),
    models: cfg.MODEL,
    cell_selection: cfg.CELL_SELECTION
  });
  return 'https://api.open-meteo.com/v1/forecast?' + p.toString();
}

async function fetchForecast(runSec, availSec, intervalSec) {
  const url = openMeteoUrl();
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'baltic-wind/1.0 (personal, non-commercial)' } });
    if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + (await res.text()).slice(0, 200));
    const data = await res.json();
    const arr = Array.isArray(data) ? data : [data]; // multi-coordinate → array, same order as input
    let nextExpected = null;
    if (availSec && intervalSec) {
      nextExpected = availSec + intervalSec;
      while (nextExpected * 1000 <= Date.now()) nextExpected += intervalSec;
    }
    cache = {
      generated: new Date().toISOString(),
      stale: false,
      model: cfg.MODEL,
      model_run: runSec ? new Date(runSec * 1000).toISOString() : null,
      model_availability: availSec ? new Date(availSec * 1000).toISOString() : null,
      model_next_update_expected: nextExpected ? new Date(nextExpected * 1000).toISOString() : null,
      model_update_interval_seconds: intervalSec || null,
      timezone: cfg.TIMEZONE,
      threshold_kt: cfg.KITE_THRESHOLD_KT,
      spots: spots.map((s, i) => {
        const d = arr[i] || {};
        return {
          name: s.name, lat: s.lat, lon: s.lon, dx: s.dx, dy: s.dy, place: s.place, nudge: s.nudge, wg: s.wg,
          grid_lat: d.latitude, grid_lon: d.longitude, elevation: d.elevation,
          hourly: d.hourly || null,
          daily: d.daily || null
        };
      })
    };
    lastFetchMs = Date.now();
    console.log(`[fetch] ok ${cache.generated} run=${cache.model_run || '?'} (${cache.spots.length} spots)`);
    return true;
  } catch (e) {
    cache.stale = true; // keep last-good payload, just flag it
    console.error('[fetch] failed:', e.message);
    return false;
  }
}

// Cheap metadata probe (does NOT count toward API limits). Returns run/update timing in unix seconds, or null.
async function fetchMeta() {
  try {
    const res = await fetch(META_URL, { headers: { 'User-Agent': 'baltic-wind/1.0 (personal, non-commercial)' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const m = await res.json();
    return {
      run: m.last_run_initialisation_time || 0,
      avail: m.last_run_availability_time || 0,
      interval: m.update_interval_seconds || 0
    };
  } catch (e) {
    console.error('[meta] failed:', e.message);
    return null;
  }
}

// Run-aligned scheduler: fetch the forecast only when a NEW model run has become
// available (plus a short settle delay), watching the free metadata endpoint.
async function tick() {
  const meta = await fetchMeta();
  if (meta && meta.avail) {
    const dueMs = (meta.avail + cfg.POST_RUN_DELAY_MIN * 60) * 1000;
    if (meta.avail > lastAvail && Date.now() >= dueMs) {
      if (await fetchForecast(meta.run, meta.avail, meta.interval)) lastAvail = meta.avail;
      return;
    }
  }
  // Safety net: if metadata is unreachable and our data is old, refetch anyway.
  if (Date.now() - lastFetchMs > cfg.SAFETY_REFRESH_MIN * 60_000) {
    console.warn('[tick] safety refresh (metadata unavailable or stale)');
    await fetchForecast(meta && meta.run, meta && meta.avail, meta && meta.interval);
    if (meta && meta.avail) lastAvail = meta.avail;
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json'
};

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');

  if (u.pathname === '/api/forecast') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    return res.end(JSON.stringify(cache));
  }
  if (u.pathname === '/api/health') {
    res.writeHead(cache.stale ? 503 : 200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ ok: !cache.stale, generated: cache.generated }));
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
    // HTML must always revalidate so new ?v= asset URLs are picked up; the versioned
    // JS/CSS/assets are safe to cache long-term (their URL changes when they change).
    headers['cache-control'] = ext === '.html' ? 'no-cache' : 'public, max-age=31536000';
    res.writeHead(200, headers);
    res.end(buf);
  });
});

server.listen(cfg.PORT, cfg.HOST, () => {
  console.log(`baltic-wind listening on http://${cfg.HOST}:${cfg.PORT} (model=${cfg.MODEL}, run-aligned refresh, meta poll ${cfg.METADATA_POLL_MIN}min, +${cfg.POST_RUN_DELAY_MIN}min settle)`);
});

// Cold start: fetch once immediately so the app isn't empty, seeding lastAvail from metadata
// so we don't refetch until the next run lands.
(async () => {
  const meta = await fetchMeta();
  await fetchForecast(meta && meta.run, meta && meta.avail, meta && meta.interval);
  if (meta && meta.avail) lastAvail = meta.avail;
})();
setInterval(tick, cfg.METADATA_POLL_MIN * 60_000);
