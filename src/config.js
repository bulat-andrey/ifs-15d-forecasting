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
