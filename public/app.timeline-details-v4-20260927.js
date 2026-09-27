'use strict';
// Baltic Wind front-end. Pulls the server-cached forecast (/api/forecast) once,
// then drives the map, the timeline, the per-day daylight wind bars, and the
// spot-detail graph entirely from that data. No per-user calls to Open-Meteo.

const WIND_COLORS = ['#73879c', '#25d88a', '#b7de36', '#f2bc35', '#ff713f', '#e83655', '#a855f7'];
const windColor = s =>
  s < threshold ? WIND_COLORS[0] : s < threshold + 6 ? WIND_COLORS[1] : s < threshold + 13 ? WIND_COLORS[2] :
  s < threshold + 20 ? WIND_COLORS[3] : s < threshold + 26 ? WIND_COLORS[4] : s < threshold + 33 ? WIND_COLORS[5] : WIND_COLORS[6];
const COMPASS = ['N','NE','E','SE','S','SW','W','NW'];
const DIRECTION_EDGE_TOLERANCE_DEG = 5;
// Open-Meteo gives the meteorological direction wind comes FROM.
// Wind barbs keep that convention: the staff points toward where the wind comes FROM.
function windBarb(deg, speedKt) {
  if (deg == null) return '';
  const kt = Math.max(0, Math.round(Number(speedKt) || 0));
  if (kt < 1) {
    return `<svg class="wind-barb wind-barb-calm" viewBox="0 0 32 32" aria-hidden="true">`
      + `<circle cx="16" cy="16" r="6" class="barb-calm"/>`
      + `</svg>`;
  }
  let rest = kt < 5 ? 0 : Math.round(kt / 5) * 5;
  const pennants = Math.floor(rest / 50); rest -= pennants * 50;
  const full = Math.floor(rest / 10); rest -= full * 10;
  const half = rest >= 5 ? 1 : 0;
  let marks = '', y = 6;
  for (let i = 0; i < pennants; i++, y += 4) {
    marks += `<path d="M16 ${y} L25 ${y + 3} L16 ${y + 6} Z" class="barb-fill"/>`;
  }
  for (let i = 0; i < full; i++, y += 4) {
    marks += `<line x1="16" y1="${y}" x2="25" y2="${y + 4}"/>`;
  }
  if (half) marks += `<line x1="16" y1="${y}" x2="22" y2="${y + 3}"/>`;
  return `<svg class="wind-barb" viewBox="0 0 32 32" aria-hidden="true" style="--barb-rot:${normDeg(deg)}deg">`
    + `<g><line x1="16" y1="27" x2="16" y2="5"/>${marks}</g>`
    + `</svg>`;
}

function windArrow(deg) {
  if (deg == null) return '';
  return `<svg class="wind-arrow" viewBox="0 0 32 32" aria-hidden="true" style="--arrow-rot:${normDeg(deg + 180)}deg">`
    + `<g><line x1="16" y1="27" x2="16" y2="8"/><path d="M16 5 L10 13 L22 13 Z"/></g>`
    + `</svg>`;
}

const compassFrom = deg => COMPASS[Math.round(deg / 45) % 8];
const r = (v, d = 0) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);
const normDeg = deg => ((deg % 360) + 360) % 360;
const inRange = (deg, a, b) => {
  const d = normDeg(deg), from = normDeg(a), to = normDeg(b);
  return from <= to ? d >= from && d <= to : d >= from || d <= to;
};
const directionRangeWidth = (a, b) => {
  const from = normDeg(a), to = normDeg(b);
  return from <= to ? to - from : to + 360 - from;
};
const directionOk = (spot, deg) => deg != null && (!spot.goodFrom || !spot.goodFrom.length || spot.goodFrom.some(([a, b]) =>
  directionRangeWidth(a, b) + DIRECTION_EDGE_TOLERANCE_DEG * 2 >= 359
    || inRange(deg, a - DIRECTION_EDGE_TOLERANCE_DEG, b + DIRECTION_EDGE_TOLERANCE_DEG)
));
const directionStatus = (spot, deg) => directionOk(spot, deg) ? 'suitable direction' : 'offshore / cross-offshore';

// Blend model provenance → colour/short-label for the graph band + legend.
const MODEL_META = {
  icon_d2: { short: 'ICON-D2', color: '#35b9ff' },
  icon_eu: { short: 'ICON-EU', color: '#b7de36' },
  ecmwf_ifs: { short: 'ECMWF', color: '#a855f7' },
  ecmwf_ifs025: { short: 'ECMWF', color: '#a855f7' }
};
const modelShort = id => (MODEL_META[id] && MODEL_META[id].short) || id || '—';
const modelColor = id => (MODEL_META[id] && MODEL_META[id].color) || '#94a9bd';
// Full label prefers the server's per-model label (e.g. "ICON-D2 2.2 km"), falls back to short.
const modelLabel = id => {
  const m = S && S.models && S.models.find(x => x.id === id);
  return (m && m.label) || modelShort(id);
};

const el = id => document.getElementById(id);
const THRESHOLD_KEY = 'sultansradar.thresholdKt';
const MARKER_STYLE_KEY = 'sultansradar.markerStyle';
const DIR_OVERRIDES_KEY = 'sultansradar.directionSectors';
const DIR_INVERT_KEY = 'sultansradar.directionRoseInvert';
let S = null;        // forecast payload
let times = [];      // master hourly time array (ISO local, "YYYY-MM-DDTHH:MM")
let t0 = 0;          // epoch of times[0], parsed as UTC for consistent indexing
let curIdx = 0;
let selName = null;
let detailView = 'table';
let graphStartIdx = 0;
let graphEndIdx = 0;
const MIN_GRAPH_RANGE_H = 6;
let threshold = 12;
let markerStyle = 'barbs';
let dirOverrides = {};
let dirRoseInvert = true;
let dirDrag = null;
let mobileMapOpen = false;
let map, markerObjs = [];
let timelineIdxs = [];

const toIdx = iso => (Date.parse((iso.length === 16 ? iso : iso.slice(0, 16)) + ':00Z') - t0) / 3_600_000;

async function boot() {
  const map0 = initMap();
  try {
    const res = await fetch('/api/forecast', { cache: 'no-store' });
    S = await res.json();
  } catch (e) {
    el('loading').textContent = 'Could not load forecast. Is the server running?';
    return;
  }
  if (!S.spots.length || !S.spots[0].hourly) {
    el('loading').textContent = S.stale ? 'Forecast not fetched yet — retry shortly.' : 'No forecast data.';
    return;
  }
  S.spots.forEach(s => { s.defaultGoodFrom = JSON.parse(JSON.stringify(s.goodFrom || [])); });
  dirOverrides = loadDirectionOverrides();
  applyDirectionOverrides();
  threshold = loadThreshold(S.threshold_kt || 12);
  markerStyle = loadMarkerStyle();
  times = S.spots[0].hourly.time;
  t0 = Date.parse(times[0] + ':00Z');
  graphStartIdx = 0;
  graphEndIdx = Math.max(0, times.length - 1);
  setupGraphRangeControl();
  el('loading').hidden = true;

  const fmtModelTime = iso => new Date(iso).toLocaleString('en-GB', { timeZone: S.timezone || 'Europe/Warsaw', hour12: false, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  const fetched = S.generated ? new Date(S.generated).toLocaleString('en-GB', { timeZone: S.timezone || 'Europe/Warsaw', hour12: false }) : '—';
  const init = S.model_run ? `Init ${fmtModelTime(S.model_run)}` : 'Init —';
  const updated = S.model_availability ? `Updated ${fmtModelTime(S.model_availability)}` : 'Updated —';
  const next = S.model_next_update_expected ? `Next ~${fmtModelTime(S.model_next_update_expected)}` : '';
  el('updated').textContent = (S.stale ? '⚠ stale · ' : '') + [init, updated, next].filter(Boolean).join(' · ');
  el('updated').title = `Our server fetched this forecast: ${fetched}`;
  if (S.stale) el('updated').classList.add('stale');
  if (S.blend && S.blend.length) {
    el('modelBtn').textContent = S.blend.join(' → ');
    el('modelBtn').title = 'Seamless blend — best model per lead time: ' + S.blend.join(' → ');
  }
  setupUserSettings();
  setupThresholdControl();
  setupMarkerStyleControl();

  addMarkers(map0);
  // Tight fit: minimal padding so there's no dead sea west of Łeba / east of Krynica Morska.
  map0.fitBounds(L.latLngBounds(S.spots.map(s => [s.lat, s.lon])), { paddingTopLeft: [24, 20], paddingBottomRight: [24, 20] });
  buildTimeline();
  curIdx = nearestTimelineIndex(nowIndex());
  el('days').addEventListener('keydown', onTimelineKey);
  el('play').onclick = togglePlay;
  el('prevSlot').onclick = () => stepTimeline(-1);
  el('nextSlot').onclick = () => stepTimeline(1);
  el('mobileMapToggle').onclick = toggleMobileMap;
  el('gpClose').onclick = clearSelection;
  setupGraphPanelDrag();
  el('tableView').onclick = () => setDetailView('table');
  el('graphView').onclick = () => setDetailView('graph');
  el('spotSettings').onclick = openDirectionSettings;
  el('dirClose').onclick = closeDirectionSettings;
  el('dirSave').onclick = saveDirectionSettings;
  el('dirReset').onclick = resetDirectionSettings;
  el('dirCopy').onclick = copyDirectionConfig;
  el('dirFrom').oninput = renderDirectionRoseFromInputs;
  el('dirTo').oninput = renderDirectionRoseFromInputs;
  dirRoseInvert = localStorage.getItem(DIR_INVERT_KEY) !== '0';
  el('dirInvert').checked = dirRoseInvert;
  el('dirInvert').onchange = () => {
    dirRoseInvert = el('dirInvert').checked;
    localStorage.setItem(DIR_INVERT_KEY, dirRoseInvert ? '1' : '0');
    const s = selName && S.spots.find(x => x.name === selName);
    if (s) syncDirectionSettingsFields(s);
  };
  setupDirectionDrag();
  el('spotLiveToggle').onclick = toggleLiveConditions;
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !el('gpLivePanel').hidden) {
      setLiveOpen(false);
      el('spotLiveToggle').focus();
    }
  });
  update(curIdx);
  // Re-run label de-collision whenever the view changes (zoom changes disc spacing;
  // pan/resize change which labels would run off the edge).
  map0.on('zoomend moveend resize', () => { if (S) drawMarkers(curIdx); });
}

function loadThreshold(fallback) {
  const saved = Number(localStorage.getItem(THRESHOLD_KEY));
  return Number.isFinite(saved) && saved > 0 ? saved : fallback;
}

function loadMarkerStyle() {
  return localStorage.getItem(MARKER_STYLE_KEY) === 'arrows' ? 'arrows' : 'barbs';
}

const directionMarker = (deg, speedKt) => markerStyle === 'arrows' ? windArrow(deg) : windBarb(deg, speedKt);

function loadDirectionOverrides() {
  try {
    const raw = JSON.parse(localStorage.getItem(DIR_OVERRIDES_KEY) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch { return {}; }
}

function validRanges(ranges) {
  return Array.isArray(ranges) && ranges.every(r =>
    Array.isArray(r) && r.length === 2 && r.every(v => Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 359)
  );
}

function applyDirectionOverrides() {
  S.spots.forEach(s => {
    if (validRanges(dirOverrides[s.name])) s.goodFrom = dirOverrides[s.name].map(([a, b]) => [Number(a), Number(b)]);
    else s.goodFrom = JSON.parse(JSON.stringify(s.defaultGoodFrom || []));
  });
}

function directionRangeText(spot) {
  const ranges = spot.goodFrom || [];
  return rangeText(ranges);
}

function directionToRangeText(spot) {
  const ranges = spot.goodFrom || [];
  return rangeText(convertRanges(ranges));
}

function rangeText(ranges) {
  return ranges && ranges.length ? ranges.map(([a, b]) => `${a}° → ${b}°`).join(', ') : 'all directions';
}

function convertRanges(ranges) {
  return ranges.map(([a, b]) => [normDeg(a + 180), normDeg(b + 180)]);
}

function refreshAfterDirectionChange() {
  buildTimeline();
  update(curIdx);
  if (selName && !el('graphPanel').hidden) renderSpotDetail(selName, detailView);
}

function setupUserSettings() {
  const toggle = el('userSettingsToggle'), panel = el('userSettingsPanel');
  const setOpen = open => {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  };
  toggle.onclick = e => {
    e.stopPropagation();
    setOpen(panel.hidden);
  };
  panel.onclick = e => e.stopPropagation();
  document.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') setOpen(false);
  });
}

function setupThresholdControl() {
  const select = el('thresholdSelect');
  if (![...select.options].some(o => Number(o.value) === threshold)) {
    select.add(new Option(`${threshold} kt`, String(threshold)));
  }
  select.value = String(threshold);
  updateLegend();
  select.onchange = () => {
    threshold = Number(select.value);
    localStorage.setItem(THRESHOLD_KEY, String(threshold));
    updateLegend();
    buildTimeline();
    update(curIdx);
    if (selName && !el('graphPanel').hidden) renderSpotDetail(selName, detailView);
  };
}

function setupMarkerStyleControl() {
  const select = el('markerStyleSelect');
  select.value = markerStyle;
  select.onchange = () => {
    markerStyle = select.value === 'arrows' ? 'arrows' : 'barbs';
    localStorage.setItem(MARKER_STYLE_KEY, markerStyle);
    update(curIdx);
    if (selName && !el('graphPanel').hidden) renderSpotDetail(selName, detailView);
  };
}

function updateLegend() {
  const labels = [`<${threshold}`, threshold, threshold + 6, threshold + 13, threshold + 20, threshold + 26, `${threshold + 33}+`];
  labels.forEach((label, i) => { el(`leg${i}`).textContent = label; });
}

function initMap() {
  map = L.map('map', { zoomControl: true }).setView([54.62, 18.55], 9);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    subdomains: 'abc', maxZoom: 19, attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);
  return map;
}

const windAt = (spot, i) => spot.hourly ? (spot.hourly.wind_speed_10m[i] ?? 0) : 0;
const usableWindAt = (spot, i) => directionOk(spot, spot.hourly.wind_direction_10m[i]) ? windAt(spot, i) : 0;
const maxUsableWindAt = i => S.spots.reduce((m, s) => Math.max(m, usableWindAt(s, i)), 0);

function nowIndex() {
  // current Warsaw wall-clock, matched against the local ISO time grid
  const now = new Date().toLocaleString('sv', { timeZone: S.timezone || 'Europe/Warsaw' }); // "YYYY-MM-DD HH:MM:SS"
  const key = now.slice(0, 13).replace(' ', 'T'); // "YYYY-MM-DDTHH"
  const i = times.findIndex(t => t.slice(0, 13) >= key);
  return i < 0 ? 0 : i;
}

function addMarkers(map) {
  markerObjs = S.spots.map(s => {
    const m = L.marker([s.lat, s.lon], { icon: L.divIcon({ className: '', html: '', iconSize: [0, 0], iconAnchor: [0, 0] }) }).addTo(map);
    m.on('click', () => selectSpot(s.name));
    return { s, m };
  });
}

// ---- map label layout ----
// Labels are placed dynamically each draw so they don't overlap each other, don't
// sit on top of the wind discs, and never run off the map edge. The static dx/dy in
// spots.js is no longer a fixed offset — only its sign is used as a side hint (dx<0
// = prefer placing the label to the west, e.g. for spots near the right edge).
const LABEL_H = 30, DISC_R = 21, GAP = 8, EDGE = 6;

const labelWidth = (name, windLabel) => Math.max(118, name.length * 7.3 + windLabel.length * 7.5 + 32);

function rectOverlap(a, b) {
  const ox = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const oy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return ox * oy;
}
// Penalty (not true area) for a label rect overlapping a disc circle.
function discPenalty(c, rect) {
  const nx = Math.max(rect.x, Math.min(c.x, rect.x + rect.w));
  const ny = Math.max(rect.y, Math.min(c.y, rect.y + rect.h));
  const dx = c.x - nx, dy = c.y - ny, d2 = dx * dx + dy * dy;
  return d2 < c.r * c.r ? (c.r * c.r - d2) : 0;
}

// Named label offsets relative to the disc centre, for the per-spot `place` hint.
const DIRS = {
  E:  w => ({ dx: DISC_R + GAP,        dy: -LABEL_H / 2 }),
  W:  w => ({ dx: -(w + DISC_R + GAP), dy: -LABEL_H / 2 }),
  N:  w => ({ dx: -w / 2,              dy: -(DISC_R + GAP + LABEL_H) }),
  S:  w => ({ dx: -w / 2,              dy: DISC_R + GAP }),
  NE: w => ({ dx: DISC_R + GAP,        dy: -(DISC_R + GAP + LABEL_H) }),
  SE: w => ({ dx: DISC_R + GAP,        dy: DISC_R + GAP }),
  NW: w => ({ dx: -(w + DISC_R + GAP), dy: -(DISC_R + GAP + LABEL_H) }),
  SW: w => ({ dx: -(w + DISC_R + GAP), dy: DISC_R + GAP })
};

// Label placement: spots with an explicit `place` hint are pinned to that side; the
// rest are placed greedily (left→right) to avoid discs and already-placed labels.
function computeLabelPlacements(entries) {
  const size = map.getSize(), cw = size.x, ch = size.y;
  const discs = entries.map(e => ({ x: e.cx, y: e.cy, r: DISC_R }));
  const placed = [], out = {};
  const clampRect = (e, off) => ({
    x: Math.max(EDGE, Math.min(cw - e.w - EDGE, e.cx + off.dx)),
    y: Math.max(EDGE, Math.min(ch - LABEL_H - EDGE, e.cy + off.dy)),
    w: e.w, h: LABEL_H
  });
  const record = (e, rect) => { placed.push(rect); out[e.i] = { dx: Math.round(rect.x - e.cx), dy: Math.round(rect.y - e.cy) }; };
  const withNudge = (off, n) => (n ? { dx: off.dx + (n[0] || 0), dy: off.dy + (n[1] || 0) } : off);

  // 1) Pinned labels (explicit direction hint, plus optional nudge) — reserve space first.
  entries.filter(e => DIRS[e.place]).forEach(e => record(e, clampRect(e, withNudge(DIRS[e.place](e.w), e.nudge))));

  // 2) Everything else avoids discs and already-placed labels.
  const vSteps = [0, -(LABEL_H + 4), LABEL_H + 4, -2 * (LABEL_H + 4), 2 * (LABEL_H + 4)];
  entries.filter(e => !DIRS[e.place]).sort((a, b) => a.cx - b.cx).forEach(e => {
    const cands = [];
    (e.prefersLeft ? ['W', 'E'] : ['E', 'W']).forEach(side => vSteps.forEach(vs => {
      const dx = side === 'E' ? DISC_R + GAP : -(e.w + DISC_R + GAP);
      cands.push({ dx, dy: -LABEL_H / 2 + vs });
    }));
    cands.push(DIRS.N(e.w), DIRS.S(e.w));
    let best = null, bestCost = Infinity;
    for (const c of cands) {
      const rect = clampRect(e, c);
      let cost = 0;
      for (const d of discs) cost += discPenalty(d, rect) * 2;
      for (const p of placed) cost += rectOverlap(rect, p) * 4;
      if (cost < bestCost) { bestCost = cost; best = rect; }
      if (cost === 0) break;
    }
    record(e, best);
  });
  return out;
}

function drawMarkers(i) {
  const entries = markerObjs.map(({ s }, idx) => {
    const speed = r(windAt(s, i), 1), gust = r(s.hourly.wind_gusts_10m[i]);
    const windLabel = `${speed} (${gust}) kt`;
    const pt = map.latLngToContainerPoint([s.lat, s.lon]);
    return { i: idx, s, speed, windLabel, w: labelWidth(s.name, windLabel), cx: pt.x, cy: pt.y, prefersLeft: s.dx < 0, place: s.place, nudge: s.nudge };
  });
  const place = computeLabelPlacements(entries);
  entries.forEach(e => {
    const { s } = e;
    const deg = s.hourly.wind_direction_10m[i];
    const dirClass = directionOk(s, deg) ? ' dir-good' : ' dir-bad';
    const active = s.name === selName ? ' active' : '';
    const pos = place[e.i];
    const html = `<div class="pin${active}">`
      + `<div class="disc${dirClass}" style="background:${windColor(e.speed)}"><span>${directionMarker(deg, e.speed)}</span></div>`
      + `<div class="plabel" style="left:${pos.dx}px;top:${pos.dy}px;width:${e.w}px"><span>${s.name}</span>`
      + `<b style="margin-left:auto;color:${windColor(e.speed)}">${e.windLabel}</b></div></div>`;
    markerObjs[e.i].m.setIcon(L.divIcon({ className: '', html, iconSize: [0, 0], iconAnchor: [0, 0] }));
  });
}

// ---- daylight helpers (per-spot daily sunrise/sunset; use spot 0 as reference) ----
function daylightIdxForDay(d) {
  const daily = S.spots[0].daily;
  const sr = daily.sunrise[d], ss = daily.sunset[d];
  if (!sr || !ss) return [];
  const out = [];
  for (let i = 0; i < times.length; i++) if (times[i] >= sr && times[i] <= ss) out.push(i);
  return out;
}
function isDaylight(i) {
  const daily = S.spots[0].daily, date = times[i].slice(0, 10);
  const d = daily.time.indexOf(date);
  if (d < 0) return false;
  return times[i] >= daily.sunrise[d] && times[i] <= daily.sunset[d];
}

// Extra hour around sunrise/sunset: often still enough ambient light for a short kite
// session, even though it's outside astronomical daylight. Used only for the hourly
// table view — "kiteable now" on the map and the daylight timeline stay strictly
// sunrise–sunset.
const DUSK_EXTRA_H = 1;
const DAWN_EXTRA_H = 1;
function shiftIso(iso, hours) {
  return new Date(Date.parse(iso + ':00Z') + hours * 3_600_000).toISOString().slice(0, 16);
}
function isDuskUsable(i) {
  const daily = S.spots[0].daily, date = times[i].slice(0, 10);
  const d = daily.time.indexOf(date);
  if (d < 0 || !daily.sunset[d]) return false;
  return times[i] > daily.sunset[d] && times[i] <= shiftIso(daily.sunset[d], DUSK_EXTRA_H);
}
function isDawnUsable(i) {
  const daily = S.spots[0].daily, date = times[i].slice(0, 10);
  const d = daily.time.indexOf(date);
  if (d < 0 || !daily.sunrise[d]) return false;
  return times[i] >= shiftIso(daily.sunrise[d], -DAWN_EXTRA_H) && times[i] < daily.sunrise[d];
}
function isTableUsable(i) { return isDaylight(i) || isDuskUsable(i) || isDawnUsable(i); }

function buildTimeline() {
  const daily = S.spots[0].daily, days = el('days');
  days.innerHTML = '';
  timelineIdxs = [];
  const fmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  daily.time.forEach((date, d) => {
    const idxs = times.map((t, i) => t.startsWith(date) && isDaylight(i) ? i : -1).filter(i => i >= 0);
    timelineIdxs.push(...idxs);
    const daylightWinds = idxs.map(maxUsableWindAt);
    const hiRaw = daylightWinds.length ? Math.max(...daylightWinds) : 0;
    const hi = Math.round(hiRaw);
    const lo = daylightWinds.length ? Math.round(Math.min(...daylightWinds)) : 0;
    const day = document.createElement('div');
    const weekday = new Date(date + 'T12:00:00Z').getUTCDay();
    day.className = 'day ' + (hiRaw >= threshold ? 'kite ' : '') + (weekday === 0 || weekday === 6 ? 'weekend ' : '');
    day.dataset.day = String(d);

    const bar = document.createElement('div');
    bar.className = 'daywind';
    bar.style.gridTemplateColumns = `repeat(${Math.max(1, idxs.length)}, minmax(6px, 1fr))`;
    idxs.forEach(i => {
      const speed = maxUsableWindAt(i);
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'hourcell';
      cell.dataset.idx = String(i);
      cell.dataset.time = times[i].slice(11, 16);
      cell.style.background = windColor(speed);
      cell.title = `${formatHour(i)} · ${r(speed, 1)} kt`;
      cell.setAttribute('aria-label', `${formatHour(i)}, ${r(speed, 1)} knots`);
      cell.onclick = () => update(i, true);
      bar.appendChild(cell);
    });

    const body = document.createElement('button');
    body.type = 'button';
    body.className = 'daybody';
    body.innerHTML = `<strong>${fmt.format(new Date(date + 'T12:00:00Z'))}</strong>`
      + `<span>${daylightWinds.length ? lo + '–' + hi + ' kt daylight' : 'no daylight data'}</span>`;
    body.onclick = () => update(idxs.length ? idxs[Math.floor(idxs.length / 2)] : 0, true);

    day.appendChild(bar);
    day.appendChild(body);
    days.appendChild(day);
  });
}

function nearestTimelineIndex(i) {
  if (!timelineIdxs.length) return i;
  return timelineIdxs.find(idx => idx >= i) ?? timelineIdxs[timelineIdxs.length - 1];
}

function formatHour(i) {
  return new Date(times[i] + ':00Z').toLocaleString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    hour12: false, timeZone: 'UTC'
  }).replace(',', ' ·');
}

function update(i, fromTimeline = false) {
  curIdx = i;
  const iso = times[i];
  const label = formatHour(i);
  el('timeLabel').textContent = label;
  // active day highlight
  const activeDay = S.spots[0].daily.time.indexOf(iso.slice(0, 10));
  document.querySelectorAll('.day').forEach(b => b.classList.toggle('active', +b.dataset.day === activeDay));
  document.querySelectorAll('.hourcell.active').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.time-badge').forEach(b => b.remove());
  const activeCell = document.querySelector(`.hourcell[data-idx="${i}"]`);
  if (activeCell) {
    activeCell.classList.add('active');
    const day = activeCell.closest('.day');
    const cells = [...activeCell.parentElement.children];
    const pos = cells.indexOf(activeCell);
    const badge = document.createElement('span');
    badge.className = 'time-badge';
    badge.textContent = activeCell.dataset.time;
    badge.style.left = `${((pos + 0.5) / cells.length) * 100}%`;
    day.appendChild(badge);
    if (!fromTimeline) activeCell.scrollIntoView({ block: 'nearest', inline: 'center' });
  }
  drawMarkers(i);
  // Map model badge: which blend model the currently shown hour comes from (same for all spots).
  const mm = el('mapModel');
  if (mm) {
    const prov = S.spots[0].hourly.model, mid = prov ? prov[i] : null;
    if (mid) {
      mm.hidden = false;
      mm.innerHTML = `<i style="background:${modelColor(mid)}"></i><span>shown&nbsp;hour</span><b>${modelLabel(mid)}</b>`;
      mm.title = `The wind shown on the map for this time is from ${modelShort(mid)}`;
    } else { mm.hidden = true; }
  }
  if (selName) fillSelected(selName, i);
  if (selName && detailView === 'table' && !el('graphPanel').hidden) renderSpotTable(selName);
  renderMobileOverview();
}

function onTimelineKey(e) {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
  e.preventDefault();
  if (!timelineIdxs.length) return;
  if (e.key === 'Home') return update(timelineIdxs[0]);
  if (e.key === 'End') return update(timelineIdxs[timelineIdxs.length - 1]);
  stepTimeline(e.key === 'ArrowRight' ? 1 : -1, false);
}

function fillSelected(name, i) {
  const s = S.spots.find(x => x.name === name);
  if (!s) return;
  const windKt = windAt(s, i), speed = r(windKt, 1), statusSpeed = windKt, gust = r(s.hourly.wind_gusts_10m[i]), deg = s.hourly.wind_direction_10m[i];
  const temp = r(s.hourly.temperature_2m[i]), precip = r(s.hourly.precipitation[i], 1);
  el('gpName').textContent = s.name;
  el('spotName').textContent = s.name;
  el('spotDirRange').textContent = `Suitable FROM ${directionRangeText(s)}`;
  el('spotDirRange').title = `Accepts ${DIRECTION_EDGE_TOLERANCE_DEG}° near edges. Same sector shown as wind blowing TO: ${directionToRangeText(s)}`;
  el('spotSpeed').textContent = speed;
  el('spotArrow').innerHTML = directionMarker(deg, speed);
  el('spotArrow').style.background = windColor(speed);
  el('spotArrow').classList.toggle('dir-good', directionOk(s, deg));
  el('spotArrow').classList.toggle('dir-bad', !directionOk(s, deg));
  el('spotDirText').textContent = compassFrom(deg) + ' · ' + Math.round(deg) + '°';
  el('spotGust').textContent = gust + ' kt';
  el('spotTemp').textContent = temp + ' °C';
  el('spotPrecip').textContent = precip + ' mm';
  const kite = el('spotKite'), day = isDaylight(i), dirOk = directionOk(s, deg);
  const ok = statusSpeed >= threshold && day && dirOk;
  kite.classList.toggle('no', !ok);
  kite.textContent = ok ? 'Kiteable now' : statusSpeed < threshold ? `Below ${threshold} kt` : !day ? 'Dark — not daylight' : 'Offshore direction';
  kite.title = `Forecast for ${formatHour(i)}`;
  const wg = el('spotWg');
  if (s.wg) {
    wg.hidden = false; wg.removeAttribute('aria-disabled');
    wg.href = s.wg; wg.style.opacity = '1'; wg.style.pointerEvents = 'auto';
    wg.setAttribute('aria-label', `Open Windguru Pro forecast for ${s.name}`);
    wg.title = `Open Windguru Pro forecast for ${s.name}`;
  } else {
    wg.hidden = true; wg.removeAttribute('href');
  }
  el('spotSummary').hidden = false;
}

function renderMobileOverview() {
  if (!S || !times.length) return;
  const date = times[curIdx].slice(0, 10);
  const dateText = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC'
  });
  el('mobileBoardDate').textContent = dateText;
  el('mobileTime').textContent = times[curIdx].slice(11, 16);
  el('mobileTimeZone').textContent = S.timezone || 'local';
  el('mobileTimeList').innerHTML = S.spots[0].daily.time.map(day => {
    const dayIndexes = times.map((t, i) => t.startsWith(day) && isTableUsable(i) ? i : -1).filter(i => i >= 0);
    if (!dayIndexes.length) return '';
    const dayModels = [...new Set(dayIndexes.map(i => S.spots[0].hourly.model && S.spots[0].hourly.model[i]).filter(Boolean))];
    const modelText = dayModels.length ? ` [${dayModels.map(modelShort).join('/')}]` : '';
    const slots = dayIndexes.map(i => {
      const strongest = maxUsableWindAt(i);
      const greenSpots = S.spots.filter(s => {
        const speed = windAt(s, i), deg = s.hourly.wind_direction_10m[i];
        return speed >= threshold && isDaylight(i) && directionOk(s, deg);
      });
      const good = greenSpots.length > 0;
      const active = i === curIdx ? ' active' : '';
      const height = Math.max(12, Math.min(100, strongest / 30 * 100));
      const fallbackSpot = S.spots.find(s => s.name === 'Gdańsk Brzeźno');
      const tempSpots = greenSpots.length ? greenSpots : (fallbackSpot ? [fallbackSpot] : []);
      const tempValues = tempSpots.map(s => s.hourly.temperature_2m[i]).filter(v => v != null);
      const temp = tempValues.length ? tempValues.reduce((sum, value) => sum + value, 0) / tempValues.length : null;
      const precip = S.spots[0].hourly.precipitation[i];
      const precipText = precip > 0 ? r(precip, 1) : '';
      return `<button class="mobile-time-slot${good ? ' good' : ''}${active}" style="--wind-height:${height.toFixed(1)}%" type="button" data-time-idx="${i}" aria-label="${formatHour(i)}, ${r(strongest, 1)} knots, ${temp != null ? r(temp) + ' degrees' : 'temperature unavailable'}, ${precip > 0 ? r(precip, 1) + ' millimetres precipitation' : 'no precipitation'}${good ? ', kiteable period' : ''}">`
        + `<span class="mobile-time-temp">${temp != null ? r(temp) + '°' : '—'}</span>`
        + `<span class="mobile-wind-column"></span><span class="mobile-time-precip">${precipText}</span><small>${times[i].slice(11, 13)}</small></button>`;
    }).join('');
    const weekend = [0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay());
    return `<div class="mobile-time-day${weekend ? ' weekend' : ''}"><b title="Forecast model${modelText}">${dayName(day)}${modelText}</b><div class="mobile-time-slots">${slots}</div></div>`;
  }).join('');
  el('mobileTimeList').querySelectorAll('[data-time-idx]').forEach(button => {
    button.onclick = () => update(Number(button.dataset.timeIdx), true);
  });
  el('mobileTimeList').querySelector('.mobile-time-slot.active')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  el('mobileSpotList').innerHTML = S.spots.map(s => {
    const windKt = windAt(s, curIdx), speed = r(windKt, 1), statusSpeed = windKt;
    const gust = r(s.hourly.wind_gusts_10m[curIdx]);
    const deg = s.hourly.wind_direction_10m[curIdx];
    const temp = r(s.hourly.temperature_2m[curIdx]);
    const suitable = directionOk(s, deg);
    const usable = statusSpeed >= threshold && isDaylight(curIdx) && suitable;
    const aria = usable ? 'Kiteable' : statusSpeed < threshold ? `Below ${threshold} knots` : suitable ? 'Limited' : 'Unsuitable direction';
    return `<button class="mobile-spot ${usable ? 'is-kiteable' : ''}" type="button" data-spot="${s.name}" aria-label="${s.name}: ${aria}">`
      + `<span class="mobile-spot-main"><strong>${s.name}</strong></span>`
      + `<span class="mobile-spot-dir ${suitable ? 'dir-good' : 'dir-bad'}">${directionMarker(deg, speed)}<small>${Math.round(deg)}°</small></span>`
      + `<span class="mobile-spot-values"><b>${speed} (${gust}) kt</b><span>${temp}°</span></span>`
      + `</button>`;
  }).join('');
  el('mobileSpotList').querySelectorAll('[data-spot]').forEach(button => {
    button.onclick = () => selectSpot(button.dataset.spot);
  });
}

function toggleMobileMap() {
  mobileMapOpen = !mobileMapOpen;
  document.querySelector('.map-shell').classList.toggle('mobile-map-open', mobileMapOpen);
  el('mobileMapToggle').textContent = mobileMapOpen ? 'Forecast' : 'Map';
  el('mobileMapToggle').setAttribute('aria-label', mobileMapOpen ? 'Show forecast overview' : 'Show map');
  if (mobileMapOpen) map.invalidateSize();
}

function openDirectionSettings() {
  if (!selName) return;
  const s = S.spots.find(x => x.name === selName);
  if (!s) return;
  el('graphPanel').hidden = true;
  const panel = el('dirSettings');
  panel.style.left = '';
  panel.style.top = '';
  panel.style.right = '';
  panel.style.transform = '';
  el('dirSpotName').textContent = s.name;
  el('dirInvert').checked = dirRoseInvert;
  syncDirectionSettingsFields(s);
  panel.hidden = false;
}

function closeDirectionSettings() {
  el('dirSettings').hidden = true;
}

function readDirectionInputs() {
  const from = Math.max(0, Math.min(359, Math.round(Number(el('dirFrom').value))));
  const to = Math.max(0, Math.min(359, Math.round(Number(el('dirTo').value))));
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return [[from, to]];
}

function displayedRangesForSpot(spot) {
  const ranges = spot.goodFrom || [];
  return dirRoseInvert ? convertRanges(ranges) : ranges;
}

function storedRangesFromDisplayed(ranges) {
  return dirRoseInvert ? convertRanges(ranges) : ranges;
}

function syncDirectionSettingsFields(spot) {
  const displayRanges = displayedRangesForSpot(spot);
  const [from = 0, to = 359] = displayRanges[0] || [];
  el('dirFrom').value = from;
  el('dirTo').value = to;
  renderDirectionRose(displayRanges);
  updateDirectionSummary(spot, displayRanges);
}

function rosePoint(deg, radius, cx = 150, cy = 150) {
  const a = (normDeg(deg) - 90) * Math.PI / 180;
  return [cx + Math.cos(a) * radius, cy + Math.sin(a) * radius];
}

function sectorPath(from, to, rOuter = 112, rInner = 78) {
  let end = normDeg(to);
  const start = normDeg(from);
  if (end <= start) end += 360;
  const large = end - start > 180 ? 1 : 0;
  const [o1x, o1y] = rosePoint(start, rOuter), [o2x, o2y] = rosePoint(end, rOuter);
  const [i2x, i2y] = rosePoint(end, rInner), [i1x, i1y] = rosePoint(start, rInner);
  return `M ${o1x.toFixed(1)} ${o1y.toFixed(1)} A ${rOuter} ${rOuter} 0 ${large} 1 ${o2x.toFixed(1)} ${o2y.toFixed(1)} L ${i2x.toFixed(1)} ${i2y.toFixed(1)} A ${rInner} ${rInner} 0 ${large} 0 ${i1x.toFixed(1)} ${i1y.toFixed(1)} Z`;
}

function renderDirectionRoseFromInputs() {
  const ranges = readDirectionInputs();
  if (ranges) renderDirectionRose(ranges);
}

function renderDirectionRose(ranges) {
  let ticks = '', labels = '';
  for (let d = 0; d <= 350; d += 10) {
    const major = d % 30 === 0;
    const [x1, y1] = rosePoint(d, major ? 116 : 121);
    const [x2, y2] = rosePoint(d, 128);
    const [lx, ly] = rosePoint(d, major ? 98 : 104);
    ticks += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" class="${major ? 'major' : ''}"/>`;
    labels += `<text x="${lx.toFixed(1)}" y="${(ly + 3).toFixed(1)}" class="${major ? 'major' : ''}">${d}</text>`;
  }
  const sector = ranges.map(([a, b]) => `<path d="${sectorPath(a, b)}"/>`).join('');
  el('dirRose').innerHTML = `<svg viewBox="0 0 300 300" role="img" aria-label="Suitable wind direction rose">`
    + `<circle cx="150" cy="150" r="128" class="outer"/>`
    + `<g class="sector">${sector}</g>`
    + `<g class="ticks">${ticks}</g><g class="labels">${labels}</g>`
    + `<text x="150" y="28" class="cardinal">N</text><text x="272" y="154" class="cardinal">E</text><text x="150" y="280" class="cardinal">S</text><text x="28" y="154" class="cardinal">W</text>`
    + `<circle cx="150" cy="150" r="4" class="center"/>`
    + `</svg>`;
  if (selName) {
    const s = S.spots.find(x => x.name === selName);
    if (s) updateDirectionSummary(s, ranges);
  }
}

function updateDirectionSummary(spot, displayRanges = displayedRangesForSpot(spot)) {
  const fromText = directionRangeText(spot);
  const toText = directionToRangeText(spot);
  el('dirSummary').textContent = dirRoseInvert
    ? `Preview wind blowing TO: ${rangeText(displayRanges)} · app uses FROM: ${fromText} ±${DIRECTION_EDGE_TOLERANCE_DEG}°`
    : `Editing wind FROM: ${rangeText(displayRanges)} ±${DIRECTION_EDGE_TOLERANCE_DEG}° · wind blows TO: ${toText}`;
}

function setupDirectionDrag() {
  const panel = el('dirSettings'), handle = el('dirDragHandle');
  const move = e => {
    if (!dirDrag) return;
    e.preventDefault();
    const shell = document.querySelector('.map-shell').getBoundingClientRect();
    const rect = panel.getBoundingClientRect();
    const x = Math.max(8, Math.min(shell.width - rect.width - 8, e.clientX - shell.left - dirDrag.dx));
    const y = Math.max(8, Math.min(shell.height - rect.height - 8, e.clientY - shell.top - dirDrag.dy));
    panel.style.left = `${x}px`;
    panel.style.top = `${y}px`;
    panel.style.right = 'auto';
    panel.style.transform = 'none';
  };
  const up = () => { dirDrag = null; document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); };
  handle.addEventListener('pointerdown', e => {
    const rect = panel.getBoundingClientRect();
    dirDrag = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    handle.setPointerCapture?.(e.pointerId);
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  });
}

function saveDirectionSettings() {
  if (!selName) return;
  const displayRanges = readDirectionInputs();
  if (!displayRanges) return;
  const ranges = storedRangesFromDisplayed(displayRanges);
  dirOverrides[selName] = ranges;
  localStorage.setItem(DIR_OVERRIDES_KEY, JSON.stringify(dirOverrides));
  applyDirectionOverrides();
  refreshAfterDirectionChange();
  const s = S.spots.find(x => x.name === selName);
  if (s) syncDirectionSettingsFields(s);
  const btn = el('dirSave');
  btn.textContent = 'Saved';
  setTimeout(() => { btn.textContent = 'Save'; }, 900);
}

function resetDirectionSettings() {
  if (!selName) return;
  delete dirOverrides[selName];
  localStorage.setItem(DIR_OVERRIDES_KEY, JSON.stringify(dirOverrides));
  applyDirectionOverrides();
  refreshAfterDirectionChange();
  const s = S.spots.find(x => x.name === selName);
  if (s) syncDirectionSettingsFields(s);
}

async function copyDirectionConfig() {
  if (!selName) return;
  const displayRanges = readDirectionInputs();
  if (!displayRanges) return;
  const ranges = storedRangesFromDisplayed(displayRanges);
  const snippet = `goodFrom: ${JSON.stringify(ranges)}`;
  try {
    await navigator.clipboard.writeText(snippet);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = snippet;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  const btn = el('dirCopy');
  btn.textContent = 'Copied';
  setTimeout(() => { btn.textContent = 'Copy config'; }, 1000);
}

const LIVE_KINDS = {
  camera: { label: 'Camera', icon: '▣' },
  wind: { label: 'Wind reading', icon: '〰' },
  observations: { label: 'Observations', icon: '◉' }
};

function renderLiveLinks(spot) {
  const links = spot.externalLinks || [];
  const toggle = el('spotLiveToggle');
  const cards = el('gpLiveCards');
  cards.replaceChildren();
  toggle.hidden = links.length === 0;
  toggle.textContent = `Live (${links.length})`;
  toggle.setAttribute('aria-label', `Show ${links.length} live sources`);
  if (!links.length) return;

  for (const [proximity, heading] of [['direct', 'At this spot'], ['nearby', 'Nearby']]) {
    const group = links.filter(link => link.proximity === proximity);
    if (!group.length) continue;
    const title = document.createElement('h3');
    title.className = 'live-group-title';
    title.textContent = heading;
    cards.appendChild(title);
    for (const link of group) {
      const kind = LIVE_KINDS[link.type] || LIVE_KINDS.observations;
      const card = document.createElement('a');
      card.className = 'live-card';
      card.href = link.url;
      card.target = '_blank';
      card.rel = 'noopener noreferrer';
      card.setAttribute('aria-label', `Open ${kind.label.toLowerCase()} from ${link.label} at ${link.location} in a new tab`);
      const icon = document.createElement('span');
      icon.className = 'live-card-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = kind.icon;
      const body = document.createElement('span');
      body.className = 'live-card-body';
      const type = document.createElement('span');
      type.className = 'live-card-kind';
      type.textContent = kind.label;
      const provider = document.createElement('b');
      provider.textContent = link.label;
      const location = document.createElement('span');
      location.className = 'live-card-place';
      location.textContent = link.location;
      body.append(type, provider, location);
      const open = document.createElement('span');
      open.className = 'live-card-open';
      open.textContent = 'Open ↗';
      card.append(icon, body, open);
      cards.appendChild(card);
    }
  }
}

function setLiveOpen(open) {
  const panel = el('gpLivePanel');
  const toggle = el('spotLiveToggle');
  panel.hidden = !open;
  el('graphPanel').classList.toggle('live-open', open);
  toggle.setAttribute('aria-expanded', String(open));
  if (selName) {
    const spot = S.spots.find(s => s.name === selName);
    const count = (spot.externalLinks || []).length;
    toggle.textContent = `Live (${count})`;
    toggle.setAttribute('aria-label', open ? 'Show forecast' : `Show ${count} live sources`);
  }
}

function toggleLiveConditions() {
  const opening = el('gpLivePanel').hidden;
  setLiveOpen(opening);
  if (opening) el('gpLiveCards').querySelector('a')?.focus();
}

function selectSpot(name, showGraph = true) {
  selName = name;
  const spot = S.spots.find(s => s.name === name);
  renderLiveLinks(spot);
  setLiveOpen(false);
  fillSelected(name, curIdx);
  drawMarkers(curIdx);
  if (showGraph) renderSpotDetail(name, 'table'); else el('graphPanel').hidden = true;
}

function clearSelection() {
  setLiveOpen(false);
  selName = null;
  el('graphPanel').hidden = true;
  el('spotSummary').hidden = true;
  closeDirectionSettings();
  drawMarkers(curIdx);
}

function setDetailView(view) {
  if (!selName) return;
  renderSpotDetail(selName, view);
}

let graphRangeRenderFrame = null;
function graphRangeLabel(i) {
  return new Date(times[i] + ':00Z').toLocaleString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    hour12: false, timeZone: 'UTC'
  }).replace(',', ' ·');
}

function updateGraphRangeUi() {
  const max = Math.max(1, times.length - 1);
  const start = el('graphStart'), end = el('graphEnd');
  start.value = String(graphStartIdx);
  end.value = String(graphEndIdx);
  const startText = graphRangeLabel(graphStartIdx), endText = graphRangeLabel(graphEndIdx);
  el('graphStartLabel').textContent = startText;
  el('graphEndLabel').textContent = endText;
  start.setAttribute('aria-valuetext', startText);
  end.setAttribute('aria-valuetext', endText);
  const left = graphStartIdx / max * 100;
  const right = graphEndIdx / max * 100;
  const fill = el('graphRangeFill');
  fill.style.left = `${left}%`;
  fill.style.width = `${Math.max(0, right - left)}%`;
  el('graphRangeReset').disabled = graphStartIdx === 0 && graphEndIdx === times.length - 1;
}

function queueGraphRangeRender() {
  if (graphRangeRenderFrame != null) cancelAnimationFrame(graphRangeRenderFrame);
  graphRangeRenderFrame = requestAnimationFrame(() => {
    graphRangeRenderFrame = null;
    if (selName && detailView === 'graph') renderGraph(selName);
  });
}

function setupGraphRangeControl() {
  const start = el('graphStart'), end = el('graphEnd');
  const max = Math.max(1, times.length - 1);
  start.max = end.max = String(max);
  start.value = String(graphStartIdx);
  end.value = String(graphEndIdx);
  start.oninput = () => {
    graphStartIdx = Math.max(0, Math.min(Number(start.value), graphEndIdx - MIN_GRAPH_RANGE_H));
    updateGraphRangeUi();
    queueGraphRangeRender();
  };
  end.oninput = () => {
    graphEndIdx = Math.min(times.length - 1, Math.max(Number(end.value), graphStartIdx + MIN_GRAPH_RANGE_H));
    updateGraphRangeUi();
    queueGraphRangeRender();
  };
  el('graphRangeReset').onclick = () => {
    graphStartIdx = 0;
    graphEndIdx = times.length - 1;
    updateGraphRangeUi();
    queueGraphRangeRender();
  };
  updateGraphRangeUi();
}

function renderSpotDetail(name, view = detailView) {
  detailView = view;
  el('tableView').classList.toggle('active', view === 'table');
  el('graphView').classList.toggle('active', view === 'graph');
  el('spotTable').hidden = view !== 'table';
  el('gpRange').hidden = view !== 'graph';
  el('gpDir').hidden = view !== 'graph';
  el('graph').hidden = view !== 'graph';
  if (view === 'graph') renderGraph(name);
  else renderSpotTable(name);
  el('graphPanel').hidden = false;
}

function dayName(iso) {
  return new Date(iso.slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC'
  });
}

function cellClass(i) {
  return (i === curIdx ? ' active' : '') + (isDaylight(i) ? ' daylight' : ' night');
}

function renderSpotTable(name) {
  const s = S.spots.find(x => x.name === name);
  if (!s) return;
  const h = s.hourly;
  const dayGroups = S.spots[0].daily.time.map(date => ({
    date,
    idxs: times.map((t, i) => t.startsWith(date) && isTableUsable(i) ? i : -1).filter(i => i >= 0)
  })).filter(g => g.idxs.length);
  const idxs = dayGroups.flatMap(g => g.idxs);
  const nDusk = idxs.filter(i => isDuskUsable(i)).length;
  const nDawn = idxs.filter(i => isDawnUsable(i)).length;
  const modelLegend = (S.models && S.models.length ? S.models : []).map(m =>
    `<span><i style="background:${modelColor(m.id)}"></i>${m.short}</span>`
  ).join('');
  const row = (label, cells, cls = '') => `<tr class="${cls}"><th>${label}</th>${cells}</tr>`;
  const activeIdx = idxs.find(idx => idx >= curIdx) ?? idxs[idxs.length - 1];
  const blockHtml = [];
  for (let d = 0; d < dayGroups.length; d += 1) {
    const blockIdxs = dayGroups[d].idxs;
    let dayCells = '', timeCells = '', modelCells = '', windCells = '', gustCells = '', dirCells = '', tempCells = '', precipCells = '';
    blockIdxs.forEach((i, pos) => {
      const t = times[i], prev = blockIdxs[pos - 1], dayStart = prev == null || times[prev].slice(0, 10) !== t.slice(0, 10);
      const dusk = isDuskUsable(i), dawn = isDawnUsable(i);
      const c = (i === activeIdx ? ' active' : '') + (dusk || dawn ? ' dusk' : ' daylight');
      const wind = r(h.wind_speed_10m[i], 1), gust = r(h.wind_gusts_10m[i]), deg = h.wind_direction_10m[i];
      const temp = r(h.temperature_2m[i]), precip = r(h.precipitation[i], 1);
      const mid = h.model && h.model[i];
      const twilightNote = dusk ? ' · dusk — limited light' : dawn ? ' · dawn — limited light' : '';
      const title = `${formatHour(i)} · ${modelLabel(mid)}${twilightNote}`;
      const dirOk = directionOk(s, deg);
      dayCells += `<td class="${c}" title="${title}">${dayStart ? dayName(t) : ''}</td>`;
      timeCells += `<td class="${c}" title="${title}">${t.slice(11, 13)}</td>`;
      modelCells += `<td class="${c} model-cell" title="${modelLabel(mid)}"><i style="background:${modelColor(mid)}"></i></td>`;
      windCells += `<td class="${c} wind-cell" title="${title}" style="background:${windColor(wind)}">${wind}</td>`;
      gustCells += `<td class="${c} gust-cell" title="${title}" style="background:${windColor(gust)}">${gust}</td>`;
      dirCells += `<td class="${c} ${dirOk ? 'dir-good' : 'dir-bad'}" title="${compassFrom(deg)} · ${Math.round(deg)}° · ${directionStatus(s, deg)}"><span class="dir-arrow">${directionMarker(deg, wind)}</span><span class="dir-deg">${Math.round(deg)}°</span></td>`;
      tempCells += `<td class="${c} temp-cell">${temp}</td>`;
      precipCells += `<td class="${c} precip-cell">${precip > 0 ? precip : '-'}</td>`;
    });
    blockHtml.push(`<table class="spot-table" aria-label="Hourly forecast table for ${s.name}">`
      + row('Day', dayCells, 'day-row')
      + row('Time', timeCells, 'time-row')
      + row('Model', modelCells, 'model-row')
      + row('Wind kt', windCells, 'wind-row')
      + row('Gust kt', gustCells, 'gust-row')
      + row('Dir', dirCells, 'dir-row')
      + row('Temp °C', tempCells, 'temp-row')
      + row('Rain mm', precipCells, 'precip-row')
      + `</table>`);
  }
  el('gpName').textContent = s.name;
  const twilightParts = [nDawn ? `${nDawn} dawn` : '', nDusk ? `${nDusk} dusk` : ''].filter(Boolean).join(', ');
  const twilightNote = twilightParts ? `<span style="opacity:.7">+${twilightParts}</span>` : '';
  el('gpSub').innerHTML = `${modelLegend}${twilightNote}`;
  el('spotTable').innerHTML = blockHtml.map(html => `<div class="spot-table-block">${html}</div>`).join('');
  requestAnimationFrame(() => {
    const active = el('spotTable').querySelector('td.active');
    if (active) active.scrollIntoView({ block: 'nearest', inline: 'center' });
  });
}

// ---- spot-detail forecast graph (SVG) ----
function renderGraph(name) {
  const s = S.spots.find(x => x.name === name);
  if (!s) return;
  const H = 260, W = 1000, padL = 34, padR = 30, padT = 12, padB = 22;
  const N = times.length, h = s.hourly;
  const lo = Math.max(0, Math.min(graphStartIdx, N - 2));
  const hi = Math.min(N - 1, Math.max(graphEndIdx, lo + 1));
  graphStartIdx = lo;
  graphEndIdx = hi;
  updateGraphRangeUi();

  const wind = h.wind_speed_10m, gust = h.wind_gusts_10m, dir = h.wind_direction_10m, precip = h.precipitation;
  const visibleGust = gust.slice(lo, hi + 1).filter(v => v != null);
  const visiblePrecip = precip.slice(lo, hi + 1).filter(v => v != null);
  const wMax = Math.max(25, ...visibleGust) * 1.1;
  const pMax = Math.max(1, ...visiblePrecip);
  const span = Math.max(1, hi - lo), plotW = W - padL - padR;
  const x = i => padL + ((i - lo) / span) * plotW;
  const yW = v => H - padB - (v / wMax) * (H - padT - padB);
  const path = (arr, y) => {
    let d = '', drawing = false;
    for (let i = lo; i <= hi; i++) {
      const v = arr[i];
      if (v == null) { drawing = false; continue; }
      d += `${drawing ? ' L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      drawing = true;
    }
    return d;
  };

  // Daylight shading, clipped to the selected time range.
  let shade = '';
  const daily = s.daily;
  if (daily && daily.time) daily.time.forEach((date, d) => {
    if (!daily.sunrise[d] || !daily.sunset[d]) return;
    const sr = toIdx(daily.sunrise[d]), ss = toIdx(daily.sunset[d]);
    if (ss < lo || sr > hi) return;
    const x1 = x(Math.max(lo, sr)), x2 = x(Math.min(hi, ss));
    shade += `<rect x="${x1.toFixed(1)}" y="${padT}" width="${Math.max(0, x2 - x1).toFixed(1)}" height="${H - padT - padB}" fill="rgba(53,185,255,.06)"/>`;
  });

  // Hour gridlines every 2h (very faint), at the current wall-clock hour so a chosen
  // even hour is a gridline regardless of where the zoomed range starts. Label as many
  // of those gridlines as fit without crowding (every 2h when zoomed in), thinning to
  // every 4th/8th/... gridline as the window widens and pixels per gridline shrink.
  let hourTicks = '';
  const pxPerGridline = (plotW / span) * 2; // 2 = gridline spacing in hours
  // Smallest power-of-2 multiplier so each labeled gridline gets >=26px; closed-form
  // (not a loop) so a degenerate pxPerGridline (0, tiny, or non-finite) can't hang.
  let labelEveryNth = 1;
  if (pxPerGridline > 0 && Number.isFinite(pxPerGridline) && pxPerGridline < 26) {
    labelEveryNth = Math.min(64, 2 ** Math.ceil(Math.log2(26 / pxPerGridline)));
  } else if (!Number.isFinite(pxPerGridline) || pxPerGridline <= 0) {
    labelEveryNth = 64; // degenerate layout (e.g. zero-width panel) — label sparsely, never hang
  }
  let evenHourCount = 0;
  for (let i = lo; i <= hi; i++) {
    if (Number(times[i].slice(11, 13)) % 2 !== 0) continue;
    const xi = x(i);
    hourTicks += `<line x1="${xi.toFixed(1)}" y1="${padT}" x2="${xi.toFixed(1)}" y2="${H - padB}" stroke="rgba(160,200,220,.06)"/>`;
    if (evenHourCount % labelEveryNth === 0) {
      hourTicks += `<text x="${(xi + 2).toFixed(1)}" y="${padT + 9}" fill="#5f7d88" font-size="8">${times[i].slice(11, 13)}</text>`;
    }
    evenHourCount++;
  }

  // Day gridlines + labels at local midnight inside the selected range.
  let ticks = '', firstTick = Infinity;
  if (daily && daily.time) daily.time.forEach(date => {
    const idx = toIdx(date + 'T00:00');
    if (idx < lo || idx > hi) return;
    firstTick = Math.min(firstTick, idx);
    const xi = x(idx);
    const lbl = new Date(date + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
    ticks += `<line x1="${xi.toFixed(1)}" y1="${padT}" x2="${xi.toFixed(1)}" y2="${H - padB}" stroke="rgba(160,200,220,.12)"/>`
      + `<text x="${(xi + 3).toFixed(1)}" y="${H - 8}" fill="#94a9bd" font-size="10">${lbl}</text>`;
  });
  if (firstTick > lo + Math.max(3, span * .08)) {
    ticks += `<text x="${padL + 3}" y="${H - 8}" fill="#94a9bd" font-size="10">${dayName(times[lo])}</text>`;
  }

  // Precipitation bars retain every hourly value in the visible range.
  let bars = '';
  const barW = Math.max(1.5, Math.min(4, plotW / (span + 1) * .7));
  for (let i = lo; i <= hi; i++) {
    const v = precip[i];
    if (v > 0) {
      const bh = (v / pMax) * 40;
      bars += `<rect x="${(x(i) - barW / 2).toFixed(1)}" y="${(H - padB - bh).toFixed(1)}" width="${barW.toFixed(1)}" height="${bh.toFixed(1)}" fill="var(--precip)" opacity=".8"/>`;
    }
  }

  const yThr = yW(threshold);
  const thr = `<line x1="${padL}" y1="${yThr.toFixed(1)}" x2="${W - padR}" y2="${yThr.toFixed(1)}" stroke="#f2bc35" stroke-dasharray="5 5" opacity=".8"/><text x="${W - padR}" y="${(yThr - 4).toFixed(1)}" fill="#f2bc35" font-size="10" text-anchor="end">${threshold} kt</text>`;
  let axis = '';
  [0, 10, 20, 30, 40].filter(v => v <= wMax).forEach(v => { axis += `<text x="4" y="${(yW(v) + 3).toFixed(1)}" fill="#5f7d88" font-size="9">${v}</text>`; });

  // Model provenance band and handoff dividers, clipped to the selected range.
  let band = '', seams = '';
  const mv = h.model;
  if (mv && mv.length) {
    let start = lo;
    for (let i = lo + 1; i <= hi + 1; i++) {
      if (i === hi + 1 || mv[i] !== mv[start]) {
        const id = mv[start];
        const left = start === lo ? padL : x(start - .5);
        const right = i === hi + 1 ? W - padR : x(i - .5);
        if (id) band += `<rect x="${left.toFixed(1)}" y="2.5" width="${Math.max(0, right - left).toFixed(1)}" height="5" fill="${modelColor(id)}" opacity=".92"><title>${modelShort(id)}</title></rect>`;
        if (i <= hi) {
          const xi = x(i - .5);
          seams += `<line x1="${xi.toFixed(1)}" y1="${padT}" x2="${xi.toFixed(1)}" y2="${H - padB}" stroke="${modelColor(mv[i])}" stroke-width="1" stroke-dasharray="3 4" opacity=".5"/>`
            + `<text x="${(xi + 4).toFixed(1)}" y="${padT + 16}" fill="${modelColor(mv[i])}" font-size="9" opacity=".85">${modelShort(mv[i])}</text>`;
        }
        start = i;
      }
    }
  }

  // Curves always retain every hourly value. Point markers expose model cadence:
  // ICON-D2 every hour; ICON-EU and ECMWF at 00/03/06/... local forecast hours.
  const showCadencePoint = i => {
    const id = mv && mv[i];
    if (id === 'icon_d2') return true;
    return (id === 'icon_eu' || (id && id.startsWith('ecmwf'))) && Number(times[i].slice(11, 13)) % 3 === 0;
  };
  let points = '';
  const pointR = Math.max(1.35, Math.min(2.3, plotW / (span + 1) * .22));
  for (let i = lo; i <= hi; i++) {
    if (!showCadencePoint(i)) continue;
    const title = `${formatHour(i)} · ${modelLabel(mv[i])}`;
    if (gust[i] != null) points += `<circle cx="${x(i).toFixed(1)}" cy="${yW(gust[i]).toFixed(1)}" r="${pointR.toFixed(2)}" fill="var(--gust)" stroke="#06101c" stroke-width=".55"><title>${title} · gust ${r(gust[i])} kt</title></circle>`;
    if (wind[i] != null) points += `<circle cx="${x(i).toFixed(1)}" cy="${yW(wind[i]).toFixed(1)}" r="${pointR.toFixed(2)}" fill="var(--wind)" stroke="#06101c" stroke-width=".55"><title>${title} · wind ${r(wind[i], 1)} kt</title></circle>`;
  }

  const svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Forecast graph for ${s.name}, ${graphRangeLabel(lo)} to ${graphRangeLabel(hi)}">`
    + shade + hourTicks + ticks + seams + bars + thr + axis + band
    + `<path d="${path(gust, yW)}" fill="none" stroke="var(--gust)" stroke-width="1.6"/>`
    + `<path d="${path(wind, yW)}" fill="none" stroke="var(--wind)" stroke-width="2"/>`
    + points
    + `<g id="gpHover" opacity="0">`
    + `<line id="gpHoverLine" x1="0" y1="${padT}" x2="0" y2="${H - padB}" stroke="#fff" stroke-width="1" stroke-dasharray="2 3" opacity=".65"/>`
    + `<circle id="gpHoverWind" r="3.4" fill="var(--wind)" stroke="#fff" stroke-width="1"/>`
    + `<circle id="gpHoverGust" r="3.4" fill="var(--gust)" stroke="#fff" stroke-width="1"/>`
    + `</g>`
    + `<rect id="gpHoverCapture" x="${padL}" y="${padT}" width="${plotW}" height="${H - padT - padB}" fill="transparent" style="cursor:crosshair"/>`
    + `</svg>`;
  el('gpSvgHost').innerHTML = svg;
  setupGraphHover(s, lo, hi, x, yW, padL, plotW);

  let directions = '';
  for (let i = lo; i <= hi; i++) {
    const deg = dir[i];
    if (i % 6 === 0 && deg != null) directions += `<span title="${formatHour(i)} · ${compassFrom(deg)} ${Math.round(deg)}°">${directionMarker(deg, wind[i])}</span>`;
  }
  el('gpDir').innerHTML = directions;
  el('gpName').textContent = s.name;

  const visibleModelIds = [...new Set((mv || []).slice(lo, hi + 1).filter(Boolean))];
  const allModels = (S.models && S.models.length) ? S.models : (S.blend || []).map(sh => ({ short: sh }));
  const legendModels = visibleModelIds.length ? visibleModelIds.map(id => allModels.find(m => m.id === id) || { id, short: modelShort(id) }) : allModels;
  const legend = legendModels
    .map(m => `<span><i style="background:${modelColor(m.id)}"></i>${m.short || m.id}</span>`)
    .join('');
  el('gpSub').innerHTML = (legend || 'blended') + `<span style="opacity:.7"> · ${span} h window · points: D2 1 h, EU/ECMWF 3 h</span>`;
  el('graphPanel').hidden = false;
}

// Draggable graph panel: drag by the header (gp-head), except its interactive
// controls (buttons/toggles). The panel starts centered via left:50%+transform;
// on first drag we pin it to an explicit left/top (in px) and drop the transform,
// then keep it clamped inside the map viewport on every move and on window resize.
function setupGraphPanelDrag() {
  const panel = el('graphPanel'), handle = panel.querySelector('.gp-head'), heading = panel.querySelector('.gp-heading');
  let drag = null;

  const clamp = (val, max) => Math.max(0, Math.min(max, val));
  const pinPosition = () => {
    if (panel.dataset.pinned === '1') return;
    const box = panel.getBoundingClientRect(), parent = panel.offsetParent.getBoundingClientRect();
    panel.style.left = `${box.left - parent.left}px`;
    panel.style.top = `${box.top - parent.top}px`;
    panel.style.bottom = 'auto';
    panel.style.transform = 'none';
    panel.dataset.pinned = '1';
  };

  const onMove = e => {
    if (!drag) return;
    const parent = panel.offsetParent.getBoundingClientRect();
    const nx = clamp(e.clientX - parent.left - drag.dx, parent.width - panel.offsetWidth);
    const ny = clamp(e.clientY - parent.top - drag.dy, parent.height - panel.offsetHeight);
    panel.style.left = `${nx}px`;
    panel.style.top = `${ny}px`;
  };
  const onUp = () => {
    drag = null;
    handle.classList.remove('dragging');
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  };

  handle.addEventListener('mousedown', e => {
    if (e.target.closest('button, .view-toggle, a')) return; // don't drag when clicking controls
    e.preventDefault();
    pinPosition();
    const box = panel.getBoundingClientRect();
    drag = { dx: e.clientX - box.left, dy: e.clientY - box.top };
    handle.classList.add('dragging');
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
  handle.style.cursor = 'grab';
  if (heading) heading.style.cursor = 'grab';

  // Re-clamp into the viewport if the window is resized after the panel was moved.
  window.addEventListener('resize', () => {
    if (panel.dataset.pinned !== '1') return;
    const parent = panel.offsetParent.getBoundingClientRect();
    panel.style.left = `${clamp(parseFloat(panel.style.left) || 0, parent.width - panel.offsetWidth)}px`;
    panel.style.top = `${clamp(parseFloat(panel.style.top) || 0, parent.height - panel.offsetHeight)}px`;
  });
}

// Hover crosshair + tooltip for the graph. `x`/`yW` are the SVG-space scale functions
// used for this render; `capture` is a transparent rect the same size as the plot area,
// so pixel math accounts for the SVG stretching (preserveAspectRatio="none").
function setupGraphHover(s, lo, hi, x, yW, padL, plotW) {
  const svgEl = el('gpSvgHost').querySelector('svg');
  const capture = el('gpHoverCapture'), group = el('gpHover'), tip = el('gpTooltip');
  const hoverLine = el('gpHoverLine'), hoverWind = el('gpHoverWind'), hoverGust = el('gpHoverGust');
  if (!svgEl || !capture) return;
  const h = s.hourly;
  const span = Math.max(1, hi - lo);

  const idxFromClientX = clientX => {
    const rect = svgEl.getBoundingClientRect();
    const svgX = (clientX - rect.left) / rect.width * 1000; // viewBox width is fixed at 1000
    const frac = (svgX - padL) / plotW;
    return Math.round(lo + frac * span);
  };

  const showAt = (clientX, clientY) => {
    const i = Math.max(lo, Math.min(hi, idxFromClientX(clientX)));
    const wind = h.wind_speed_10m[i], gust = h.wind_gusts_10m[i];
    if (wind == null && gust == null) { hide(); return; }
    const xi = x(i);
    hoverLine.setAttribute('x1', xi.toFixed(1));
    hoverLine.setAttribute('x2', xi.toFixed(1));
    group.setAttribute('opacity', '1');
    if (wind != null) { hoverWind.style.display = ''; hoverWind.setAttribute('cx', xi.toFixed(1)); hoverWind.setAttribute('cy', yW(wind).toFixed(1)); }
    else hoverWind.style.display = 'none';
    if (gust != null) { hoverGust.style.display = ''; hoverGust.setAttribute('cx', xi.toFixed(1)); hoverGust.setAttribute('cy', yW(gust).toFixed(1)); }
    else hoverGust.style.display = 'none';

    const deg = h.wind_direction_10m[i], temp = h.temperature_2m[i], precip = h.precipitation[i];
    const mid = h.model && h.model[i];
    tip.innerHTML = `<b>${formatHour(i)}</b>`
      + `<span><i style="background:var(--wind)"></i>Wind <b>${r(wind, 1)}</b> kt</span>`
      + `<span><i style="background:var(--gust)"></i>Gust <b>${r(gust)}</b> kt</span>`
      + (deg != null ? `<span>${directionMarker(deg, wind)} ${compassFrom(deg)} · ${Math.round(deg)}°</span>` : '')
      + (temp != null ? `<span>${r(temp)} °C</span>` : '')
      + (precip > 0 ? `<span><i style="background:var(--precip)"></i>${r(precip, 1)} mm</span>` : '')
      + (mid ? `<span class="gp-tooltip-model" style="color:${modelColor(mid)}">${modelLabel(mid)}</span>` : '');
    tip.hidden = false;
    const graphBox = el('graph').getBoundingClientRect();
    const left = Math.max(4, Math.min(graphBox.width - tip.offsetWidth - 4, clientX - graphBox.left + 12));
    const top = Math.max(4, Math.min(graphBox.height - tip.offsetHeight - 4, clientY - graphBox.top - tip.offsetHeight - 12));
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  };
  const hide = () => { group.setAttribute('opacity', '0'); tip.hidden = true; };

  capture.onmousemove = e => showAt(e.clientX, e.clientY);
  capture.onmouseleave = hide;
  capture.ontouchstart = capture.ontouchmove = e => { if (e.touches[0]) { showAt(e.touches[0].clientX, e.touches[0].clientY); e.preventDefault(); } };
  capture.ontouchend = hide;
}

let timer = null;
function stopPlayback() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
  el('play').textContent = '▶';
}

function stepTimeline(delta, stop = true) {
  if (!timelineIdxs.length) return;
  if (stop) stopPlayback();
  const pos = timelineIdxs.indexOf(curIdx);
  const next = Math.max(0, Math.min(timelineIdxs.length - 1, (pos >= 0 ? pos : 0) + delta));
  update(timelineIdxs[next]);
}

function togglePlay() {
  const btn = el('play');
  if (timer) { stopPlayback(); return; }
  clearSelection();
  btn.textContent = '❚❚';
  timer = setInterval(() => {
    if (!timelineIdxs.length) return;
    const pos = timelineIdxs.indexOf(curIdx);
    update(timelineIdxs[((pos >= 0 ? pos : 0) + 1) % timelineIdxs.length]);
  }, 350);
}

boot();
