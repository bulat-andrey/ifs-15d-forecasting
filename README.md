# Sultans Radar

Kite-surf forecast for 13 Polish Baltic spots. Map-first: each spot is coloured by
sustained wind and shows where the wind blows; the timeline highlights
**daylight** kiteable windows (you don't kite in the dark), and selecting a spot opens a
Windguru-style 15-day graph. Forecast data comes from a server-side cached
**ICON-D2 → ICON-EU → ECMWF IFS** blend via [Open-Meteo](https://open-meteo.com):
high-resolution short range, broader European mid range, and ECMWF long range.

## How it works

```
Open-Meteo (ICON-D2 2.2km + ICON-EU 7km + ECMWF IFS 9km)
        │  watches free model METADATA, fetches each model only when a new run lands
        ▼
 Node server (src/server.js) ── blends + caches ──► GET /api/forecast (JSON)
        │  also serves the static UI
        ▼
 Browser (public/) ── Leaflet map + timeline + graph
        ▲
 Caddy ── TLS + reverse proxy (deploy/Caddyfile)
```

Your friends' browsers hit **your** server, not Open-Meteo. One shared cache covers
everyone, and the server refreshes only when upstream model runs change. No API key,
no backend database, no build step.

## Layout

| Path | What |
|---|---|
| `src/server.js` | Zero-dependency Node HTTP server: static hosting + blended `/api/forecast` + scheduled refresh |
| `src/spots.js` | The 13 spots (coords + label offsets) — single source of truth |
| `src/config.js` | Port, blend models, refresh cadence, kite threshold (all env-overridable) |
| `public/index.html` · `app.js` · `styles.css` | The front-end |
| `deploy/Caddyfile` | Reverse proxy + automatic HTTPS |
| `deploy/baltic-wind.service` | systemd unit |

## Run locally

With Docker Compose (no host Node.js installation):

```bash
docker compose up --build
```

Open http://127.0.0.1:8787. Changes under `public/` appear after a browser reload;
changes under `src/` restart the Node development server. Stop it with
`docker compose down`. The container only mounts `src/` and `public/`; `docs/local/`
is excluded from the image build context.

To run without Docker, use **Node.js ≥ 18** (built-in `fetch`). No `npm install` is needed — there are no dependencies.

```bash
node src/server.js
# → baltic-wind listening on http://127.0.0.1:8787
```

Open http://127.0.0.1:8787. First load fetches all 13 spots for each blend model;
`/api/health` reports freshness and loaded model state.

Config via env (see `.env.example`): `PORT`, `OPENMETEO_MODEL` (`ecmwf_ifs` = 9 km HRES,
`ecmwf_ifs025` = 0.25° long-range fallback), `FORECAST_DAYS`, `CROSSFADE_H`,
`POST_RUN_DELAY_MIN`, `METADATA_POLL_MIN`, `KITE_THRESHOLD_KT`, and `CELL_SELECTION`
(`sea`/`land`/`nearest`).

**Refresh is run-aligned, not clock-based.** The server polls each model's metadata endpoint
(`/data/<model>/static/meta.json`, which is **free** and doesn't count toward limits) every
`METADATA_POLL_MIN` minutes. It re-fetches only the model whose
`last_run_availability_time` advanced, after `POST_RUN_DELAY_MIN` minutes of settle time.
A `SAFETY_REFRESH_MIN` fallback re-fetches if metadata is unreachable.

The default blend is:

| Lead time | Model |
|---|---|
| 0-48 h | ICON-D2 2.2 km |
| 48-120 h | ICON-EU 7 km |
| 120 h+ | ECMWF IFS 9 km |

`CROSSFADE_H` controls a linear blend around model seams so the graph does not jump sharply
when control passes from one model to the next.

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

- Weather: **Open-Meteo**, CC BY 4.0, using DWD ICON and ECMWF IFS open data.
  Attribution is shown in the UI footer — keep it.
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
- The graph includes a small model-provenance band so you can see which hours come from
  ICON-D2, ICON-EU, or ECMWF.
- Ideas: per-spot preferred wind direction (onshore/offshore/side filtering), gust-spread
  warning, a "best session this week" banner, AIFS as a second-opinion overlay.
