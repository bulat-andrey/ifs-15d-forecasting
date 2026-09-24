# Baltic Wind

Kite-surf forecast for 13 Polish Baltic spots. Map-first: each spot is coloured by
sustained wind and shows where the wind blows; the timeline highlights
**daylight** kiteable windows (you don't kite in the dark), and selecting a spot opens a
Windguru-style 15-day graph. Medium-range data from **ECMWF IFS (9 km)** via
[Open-Meteo](https://open-meteo.com) — complements a short-range Windguru Pro/ICON view.

## How it works

```
Open-Meteo (ECMWF IFS 9km)
        │  watches the free model METADATA, fetches only when a new 6-hourly run lands
        ▼
 Node server (src/server.js) ── in-memory cache ──► GET /api/forecast (JSON)
        │  also serves the static UI
        ▼
 Browser (public/) ── Leaflet map + timeline + graph
        ▲
 Caddy ── TLS + reverse proxy (deploy/Caddyfile)
```

Your friends' browsers hit **your** server, not Open-Meteo — one shared cache covers
everyone, so total upstream calls are trivial (well inside the free, non-commercial tier).
No API key, no backend database, no build step.

## Layout

| Path | What |
|---|---|
| `src/server.js` | Zero-dependency Node HTTP server: static hosting + `/api/forecast` + scheduled refresh |
| `src/spots.js` | The 13 spots (coords + label offsets) — single source of truth |
| `src/config.js` | Port, model, refresh cadence, kite threshold (all env-overridable) |
| `public/index.html` · `app.js` · `styles.css` | The front-end |
| `deploy/Caddyfile` | Reverse proxy + automatic HTTPS |
| `deploy/baltic-wind.service` | systemd unit |

## Run locally

Requires **Node.js ≥ 18** (uses built-in `fetch`). No `npm install` needed — there are no dependencies.

```bash
node src/server.js
# → baltic-wind listening on http://127.0.0.1:8787
```

Open http://127.0.0.1:8787. First load fetches all 13 spots; `/api/health` reports freshness.

Config via env (see `.env.example`): `PORT`, `OPENMETEO_MODEL` (`ecmwf_ifs` = 9 km HRES,
`ecmwf_ifs025` = 0.25°), `POST_RUN_DELAY_MIN`, `METADATA_POLL_MIN`, `KITE_THRESHOLD_KT`,
`CELL_SELECTION` (`sea`/`land`/`nearest`).

**Refresh is run-aligned, not clock-based.** IFS runs every 6 h and appears on Open-Meteo
a few hours after its initialisation. The server polls the model's *metadata* endpoint
(`/data/<model>/static/meta.json`, which is **free** and doesn't count toward limits) every
`METADATA_POLL_MIN` minutes, and re-fetches the forecast only once `last_run_availability_time`
advances — `POST_RUN_DELAY_MIN` minutes later, for Open-Meteo's eventual-consistency settle.
That's ~4 forecast fetches/day instead of 48. A `SAFETY_REFRESH_MIN` fallback re-fetches if the
metadata is unreachable. (Open-Meteo suggests waiting ~10 min after availability across their
redundant servers; bump `POST_RUN_DELAY_MIN` if you ever see a stale read.)

## Deploy on a small Linux server

1. Copy the repo to the box, e.g. `/opt/baltic-wind`, and install Node ≥ 18.
2. Create a service user and install the unit:
   ```bash
   sudo useradd --system --home /opt/baltic-wind baltic || true
   sudo cp deploy/baltic-wind.service /etc/systemd/system/
   # edit WorkingDirectory/User in the unit if your paths differ
   sudo systemctl daemon-reload
   sudo systemctl enable --now baltic-wind
   sudo systemctl status baltic-wind
   ```
   The service binds to `127.0.0.1:8787` only.
3. Point Caddy at it. Put your domain in `deploy/Caddyfile` (DNS A/AAAA → this server), then:
   ```bash
   sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
   sudo systemctl reload caddy
   ```
   Caddy obtains and renews HTTPS automatically. Browse `https://your-domain`.

Open ports **80 and 443** to the internet (Caddy needs 80 for the ACME challenge); keep
**8787 closed** — only Caddy talks to it over loopback.

## Data & licence

- Weather: **Open-Meteo**, CC BY 4.0, ECMWF IFS open data. Attribution is shown in the UI
  footer — keep it.
- Free tier is **non-commercial**. This is a personal app for you and friends; if it ever
  goes commercial, switch to a paid Open-Meteo plan (`customer-api.open-meteo.com` + `apikey`).
- Basemap: OpenStreetMap standard tiles, dark-inverted in CSS. For heavier/public traffic,
  move to a keyed dark basemap (MapTiler / Thunderforest / Carto) rather than OSM's public tiles.
- Code: MIT (see `LICENSE`).

## Notes / next steps

- `cell_selection=sea` biases each spot to its open-water grid cell. Flip to `land`/`nearest`
  to compare.
- Wind direction from Open-Meteo is the direction wind comes **from**; labels keep that
  meteorological convention, while map arrows show where the wind blows **to**.
- Ideas: per-spot preferred wind direction (onshore/offshore/side filtering), gust-spread
  warning, a "best session this week" banner, AIFS as a second-opinion model overlay.
