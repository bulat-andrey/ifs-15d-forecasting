'use strict';
// Baltic Wind front-end. Pulls the server-cached forecast (/api/forecast) once,
// then drives the map, the timeline, the per-day daylight wind bars, and the
// spot-detail graph entirely from that data. No per-user calls to Open-Meteo.

const WIND_COLORS = ['#73879c', '#25d88a', '#b7de36', '#f2bc35', '#ff713f', '#e83655', '#a855f7'];
const windColor = s =>
  s < threshold ? WIND_COLORS[0] : s < threshold + 6 ? WIND_COLORS[1] : s < threshold + 13 ? WIND_COLORS[2] :
  s < threshold + 20 ? WIND_COLORS[3] : s < threshold + 26 ? WIND_COLORS[4] : s < threshold + 33 ? WIND_COLORS[5] : WIND_COLORS[6];
const ARROWS = ['↑','↗','→','↘','↓','↙','←','↖'];
const COMPASS = ['N','NE','E','SE','S','SW','W','NW'];
// Open-Meteo gives the meteorological direction wind comes FROM.
// Labels keep that convention; arrows show where the air flows TO.
const arrowToward = deg => ARROWS[Math.round(((deg + 180) % 360) / 45) % 8];
const compassFrom = deg => COMPASS[Math.round(deg / 45) % 8];
const r = (v, d = 0) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);

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
let S = null;        // forecast payload
let times = [];      // master hourly time array (ISO local, "YYYY-MM-DDTHH:MM")
let t0 = 0;          // epoch of times[0], parsed as UTC for consistent indexing
let curIdx = 0;
let selName = null;
let threshold = 12;
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
  threshold = loadThreshold(S.threshold_kt || 12);
  times = S.spots[0].hourly.time;
  t0 = Date.parse(times[0] + ':00Z');
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
  setupThresholdControl();

  addMarkers(map0);
  // Tight fit: minimal padding so there's no dead sea west of Łeba / east of Krynica Morska.
  map0.fitBounds(L.latLngBounds(S.spots.map(s => [s.lat, s.lon])), { paddingTopLeft: [24, 20], paddingBottomRight: [24, 20] });
  buildTimeline();
  curIdx = nearestTimelineIndex(nowIndex());
  el('days').addEventListener('keydown', onTimelineKey);
  el('play').onclick = togglePlay;
  el('prevSlot').onclick = () => stepTimeline(-1);
  el('nextSlot').onclick = () => stepTimeline(1);
  el('gpClose').onclick = clearSelection;
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
    if (selName && !el('graphPanel').hidden) renderGraph(selName);
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
const maxWindAt = i => S.spots.reduce((m, s) => Math.max(m, windAt(s, i)), 0);

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
    const speed = r(windAt(s, i)), gust = r(s.hourly.wind_gusts_10m[i]);
    const windLabel = `${speed} (${gust}) kt`;
    const pt = map.latLngToContainerPoint([s.lat, s.lon]);
    return { i: idx, s, speed, windLabel, w: labelWidth(s.name, windLabel), cx: pt.x, cy: pt.y, prefersLeft: s.dx < 0, place: s.place, nudge: s.nudge };
  });
  const place = computeLabelPlacements(entries);
  entries.forEach(e => {
    const { s } = e;
    const deg = s.hourly.wind_direction_10m[i];
    const active = s.name === selName ? ' active' : '';
    const pos = place[e.i];
    const html = `<div class="pin${active}">`
      + `<div class="disc" style="background:${windColor(e.speed)}">${arrowToward(deg)}</div>`
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

function buildTimeline() {
  const daily = S.spots[0].daily, days = el('days');
  days.innerHTML = '';
  timelineIdxs = [];
  const fmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  daily.time.forEach((date, d) => {
    const idxs = times.map((t, i) => t.startsWith(date) && isDaylight(i) ? i : -1).filter(i => i >= 0);
    timelineIdxs.push(...idxs);
    const daylightWinds = idxs.map(maxWindAt);
    const hi = daylightWinds.length ? Math.round(Math.max(...daylightWinds)) : 0;
    const lo = daylightWinds.length ? Math.round(Math.min(...daylightWinds)) : 0;
    const day = document.createElement('div');
    const weekday = new Date(date + 'T12:00:00Z').getUTCDay();
    day.className = 'day ' + (hi >= threshold ? 'kite ' : '') + (weekday === 0 || weekday === 6 ? 'weekend ' : '');
    day.dataset.day = String(d);

    const bar = document.createElement('div');
    bar.className = 'daywind';
    bar.style.gridTemplateColumns = `repeat(${Math.max(1, idxs.length)}, minmax(6px, 1fr))`;
    idxs.forEach(i => {
      const speed = Math.round(maxWindAt(i));
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'hourcell';
      cell.dataset.idx = String(i);
      cell.dataset.time = times[i].slice(11, 16);
      cell.style.background = windColor(speed);
      cell.title = `${formatHour(i)} · ${speed} kt`;
      cell.setAttribute('aria-label', `${formatHour(i)}, ${speed} knots`);
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
  const speed = r(windAt(s, i)), gust = r(s.hourly.wind_gusts_10m[i]), deg = s.hourly.wind_direction_10m[i];
  const temp = r(s.hourly.temperature_2m[i]), precip = r(s.hourly.precipitation[i], 1);
  el('gpName').textContent = s.name;
  el('spotName').textContent = s.name;
  el('spotSpeed').textContent = speed;
  el('spotArrow').textContent = arrowToward(deg);
  el('spotArrow').style.background = windColor(speed);
  el('spotDirText').textContent = compassFrom(deg) + ' · ' + Math.round(deg) + '°';
  el('spotGust').textContent = gust + ' kt';
  el('spotTemp').textContent = temp + ' °C';
  el('spotPrecip').textContent = precip + ' mm';
  const kite = el('spotKite'), day = isDaylight(i);
  const ok = speed >= threshold && day;
  kite.classList.toggle('no', !ok);
  kite.textContent = ok ? 'Kiteable' : speed < threshold ? `Below ${threshold} kt` : 'Dark — not daylight';
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
  if (showGraph) renderGraph(name); else el('graphPanel').hidden = true;
}

function clearSelection() {
  setLiveOpen(false);
  selName = null;
  el('graphPanel').hidden = true;
  el('spotSummary').hidden = true;
  drawMarkers(curIdx);
}

// ---- spot-detail forecast graph (SVG) ----
function renderGraph(name) {
  const s = S.spots.find(x => x.name === name);
  if (!s) return;
  const H = 260, W = 1000, padL = 34, padR = 30, padT = 12, padB = 22;
  const N = times.length, h = s.hourly;
  const wind = h.wind_speed_10m, gust = h.wind_gusts_10m, dir = h.wind_direction_10m, precip = h.precipitation;
  const wMax = Math.max(25, ...gust.filter(v => v != null)) * 1.1;
  const pMax = Math.max(1, ...precip.filter(v => v != null));
  const x = i => padL + (i / (N - 1)) * (W - padL - padR);
  const yW = v => H - padB - (v / wMax) * (H - padT - padB);
  const path = (arr, y) => 'M' + arr.map((v, i) => (v == null ? '' : `${x(i).toFixed(1)},${y(v).toFixed(1)}`)).filter(Boolean).join(' L');

  // daylight shading per day
  let shade = '';
  const daily = s.daily;
  daily.time.forEach((date, d) => {
    if (!daily.sunrise[d] || !daily.sunset[d]) return;
    const x1 = x(Math.max(0, toIdx(daily.sunrise[d]))), x2 = x(Math.min(N - 1, toIdx(daily.sunset[d])));
    shade += `<rect x="${x1.toFixed(1)}" y="${padT}" width="${(x2 - x1).toFixed(1)}" height="${H - padT - padB}" fill="rgba(53,185,255,.06)"/>`;
  });
  // day gridlines + weekday ticks at local midnight
  let ticks = '';
  daily.time.forEach(date => {
    const xi = x(Math.max(0, toIdx(date + 'T00:00')));
    const lbl = new Date(date + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
    ticks += `<line x1="${xi.toFixed(1)}" y1="${padT}" x2="${xi.toFixed(1)}" y2="${H - padB}" stroke="rgba(160,200,220,.12)"/>`
      + `<text x="${(xi + 3).toFixed(1)}" y="${H - 8}" fill="#94a9bd" font-size="10">${lbl}</text>`;
  });
  // precip bars
  let bars = '';
  for (let i = 0; i < N; i++) { const v = precip[i]; if (v > 0) { const bh = (v / pMax) * 40; bars += `<rect x="${(x(i) - 1).toFixed(1)}" y="${(H - padB - bh).toFixed(1)}" width="2.4" height="${bh.toFixed(1)}" fill="var(--precip)" opacity=".8"/>`; } }
  // threshold line
  const yThr = yW(threshold);
  const thr = `<line x1="${padL}" y1="${yThr.toFixed(1)}" x2="${W - padR}" y2="${yThr.toFixed(1)}" stroke="#f2bc35" stroke-dasharray="5 5" opacity=".8"/><text x="${W - padR}" y="${(yThr - 4).toFixed(1)}" fill="#f2bc35" font-size="10" text-anchor="end">${threshold} kt</text>`;
  // wind axis labels
  let axis = '';
  [0, 10, 20, 30, 40].filter(v => v <= wMax).forEach(v => { axis += `<text x="4" y="${(yW(v) + 3).toFixed(1)}" fill="#5f7d88" font-size="9">${v}</text>`; });

  // model provenance band along the very top + a faint seam divider where models hand off
  let band = '', seams = '';
  const mv = h.model;
  if (mv && mv.length) {
    let start = 0;
    for (let i = 1; i <= N; i++) {
      if (i === N || mv[i] !== mv[start]) {
        const id = mv[start];
        if (id) band += `<rect x="${x(start).toFixed(1)}" y="2.5" width="${Math.max(0, x(i - 1) - x(start)).toFixed(1)}" height="5" fill="${modelColor(id)}" opacity=".92"><title>${modelShort(id)}</title></rect>`;
        if (i < N) { // seam between mv[i-1] and mv[i]
          const xi = x(i).toFixed(1);
          seams += `<line x1="${xi}" y1="${padT}" x2="${xi}" y2="${H - padB}" stroke="${modelColor(mv[i])}" stroke-width="1" stroke-dasharray="3 4" opacity=".5"/>`
            + `<text x="${(x(i) + 4).toFixed(1)}" y="${padT + 16}" fill="${modelColor(mv[i])}" font-size="9" opacity=".85">${modelShort(mv[i])}</text>`;
        }
        start = i;
      }
    }
  }

  const svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Forecast graph for ${s.name}">`
    + shade + ticks + seams + bars + thr + axis + band
    + `<path d="${path(gust, yW)}" fill="none" stroke="var(--gust)" stroke-width="1.6"/>`
    + `<path d="${path(wind, yW)}" fill="none" stroke="var(--wind)" stroke-width="2"/>`
    + `</svg>`;
  el('graph').innerHTML = svg;
  el('gpDir').innerHTML = dir.map((deg, i) => i % 6 === 0
    ? `<span title="${formatHour(i)} · ${compassFrom(deg)} ${Math.round(deg)}°">${arrowToward(deg)}</span>`
    : ''
  ).join('');
  el('gpName').textContent = s.name;
  const legendModels = (S.models && S.models.length) ? S.models : (S.blend || []).map(sh => ({ short: sh }));
  const legend = legendModels
    .map(m => `<span style="white-space:nowrap"><i style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${modelColor(m.id)};margin-right:4px;vertical-align:middle"></i>${m.short || m.id}</span>`)
    .join('<span style="opacity:.45;margin:0 6px">→</span>');
  el('gpSub').innerHTML = (legend || 'blended') + ` · ${times.length} h · daylight shaded · dashed = ${threshold} kt`;
  el('graphPanel').hidden = false;
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
