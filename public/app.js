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
  update(curIdx);
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

function drawMarkers(i) {
  markerObjs.forEach(({ s, m }) => {
    const speed = r(windAt(s, i));
    const gust = r(s.hourly.wind_gusts_10m[i]);
    const deg = s.hourly.wind_direction_10m[i];
    const active = s.name === selName ? ' active' : '';
    const windLabel = `${speed} (${gust}) kt`;
    const w = Math.max(118, s.name.length * 7.3 + windLabel.length * 7.5 + 32);
    const html = `<div class="pin${active}">`
      + `<div class="disc" style="background:${windColor(speed)}">${arrowToward(deg)}</div>`
      + `<div class="plabel" style="left:${s.dx}px;top:${s.dy}px;width:${w}px"><span>${s.name}</span>`
      + `<b style="margin-left:auto;color:${windColor(speed)}">${windLabel}</b></div></div>`;
    m.setIcon(L.divIcon({ className: '', html, iconSize: [0, 0], iconAnchor: [0, 0] }));
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
  kite.textContent = ok ? 'Kiteable now' : speed < threshold ? `Below ${threshold} kt` : 'Dark — not daylight';
  const wg = el('spotWg');
  if (s.wg) {
    wg.hidden = false; wg.removeAttribute('aria-disabled');
    wg.href = s.wg; wg.style.opacity = '1'; wg.style.pointerEvents = 'auto';
    wg.setAttribute('aria-label', `Open Windguru Pro forecast for ${s.name}`);
    wg.title = `Open Windguru Pro forecast for ${s.name}`;
  } else {
    wg.hidden = false; wg.removeAttribute('href');
    wg.style.opacity = '.5'; wg.style.pointerEvents = 'none';
    wg.setAttribute('aria-label', 'Windguru Pro link coming soon');
    wg.title = 'Windguru Pro link coming soon';
  }
  el('spotSummary').hidden = false;
}

function selectSpot(name, showGraph = true) {
  selName = name;
  fillSelected(name, curIdx);
  drawMarkers(curIdx);
  if (showGraph) renderGraph(name); else el('graphPanel').hidden = true;
}

function clearSelection() {
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

  const svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Forecast graph for ${s.name}">`
    + shade + ticks + bars + thr + axis
    + `<path d="${path(gust, yW)}" fill="none" stroke="var(--gust)" stroke-width="1.6"/>`
    + `<path d="${path(wind, yW)}" fill="none" stroke="var(--wind)" stroke-width="2"/>`
    + `</svg>`;
  el('graph').innerHTML = svg;
  el('gpDir').innerHTML = dir.map((deg, i) => i % 6 === 0
    ? `<span title="${formatHour(i)} · ${compassFrom(deg)} ${Math.round(deg)}°">${arrowToward(deg)}</span>`
    : ''
  ).join('');
  el('gpName').textContent = s.name;
  el('gpSub').textContent = `${S.model === 'ecmwf_ifs' ? 'ECMWF IFS 9 km' : S.model} · ${times.length} h · daylight shaded · dashed = ${threshold} kt`;
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
