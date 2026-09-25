// Central configuration. Override any value via environment variables (see .env.example).
module.exports = {
  // Server binds to loopback only; Caddy terminates TLS and reverse-proxies to it.
  HOST: process.env.HOST || '127.0.0.1',
  PORT: Number(process.env.PORT || 8787),

  // Open-Meteo ECMWF model id. 'ecmwf_ifs' is the full-resolution 9 km IFS HRES
  // (verified: it snaps to a ~9 km grid cell). 'ecmwf_ifs025' is the coarse 0.25°.
  MODEL: process.env.OPENMETEO_MODEL || 'ecmwf_ifs',

  TIMEZONE: process.env.TIMEZONE || 'Europe/Warsaw',
  FORECAST_DAYS: Number(process.env.FORECAST_DAYS || 15),

  // --- Seamless multi-model blend ---
  // Ordered finest → coarsest. For each spot and each hour we pick the best model by
  // lead time (hours from now): ICON-D2 near-term, ICON-EU mid-range, ECMWF long-range,
  // with a linear crossfade of CROSSFADE_H hours centred on each boundary so values
  // don't jump at the seams. Each model is fetched independently and run-aligned:
  //   - id:        Open-Meteo `models=` parameter
  //   - meta:      path segment for the free metadata endpoint (differs from `id`!)
  //   - days:      forecast_days requested (trimmed to what the model is used for → lower call weight)
  //   - useUntilH: preferred up to this lead time (hours); the last model is the catch-all
  // `days` is trimmed to just past each model's seam so the crossfade has data on BOTH
  // sides of the boundary (the finer model overlaps ~1 day into the next model's range).
  // Seams (useUntilH) are grid hours from local midnight, matching calendar horizons:
  // 0–48 h = today+tomorrow (D2), 48–120 h = days 2–4 (EU), 120 h+ = long range (ECMWF).
  MODELS: [
    { id: 'icon_d2',   meta: 'dwd_icon_d2', label: 'ICON-D2 2.2 km', shortLabel: 'ICON-D2', days: 3,  useUntilH: 48 },
    { id: 'icon_eu',   meta: 'dwd_icon_eu', label: 'ICON-EU 7 km',   shortLabel: 'ICON-EU', days: 6,  useUntilH: 120 },
    { id: process.env.OPENMETEO_MODEL || 'ecmwf_ifs', meta: 'ecmwf_ifs', label: 'ECMWF IFS 9 km', shortLabel: 'ECMWF', days: Number(process.env.FORECAST_DAYS || 15), useUntilH: Infinity }
  ],
  CROSSFADE_H: Number(process.env.CROSSFADE_H || 6), // width of the linear blend window at each model seam

  // Kiteable sustained-wind threshold, in knots.
  KITE_THRESHOLD_KT: Number(process.env.KITE_THRESHOLD_KT || 12),

  // Run-aligned refresh. IFS runs every 6 h; the new run appears on Open-Meteo a few
  // hours after its initialisation. Instead of blindly polling, we watch the model's
  // metadata (last_run_availability_time — a FREE call that doesn't count toward limits)
  // and fetch the forecast shortly after a new run becomes available.
  METADATA_POLL_MIN: Number(process.env.METADATA_POLL_MIN || 5),   // how often to check the cheap metadata
  POST_RUN_DELAY_MIN: Number(process.env.POST_RUN_DELAY_MIN || 3), // wait this long after availability before fetching
  SAFETY_REFRESH_MIN: Number(process.env.SAFETY_REFRESH_MIN || 180), // force a refetch if metadata is unreachable this long

  // Grid-cell preference: 'sea' biases toward the open-water cell (more representative
  // of the wind a kiter feels on the water). Use 'land' or 'nearest' to experiment.
  CELL_SELECTION: process.env.CELL_SELECTION || 'sea'
};
