# Improving the forecast with live observations

Status: step 3 (showing observations) is built on branch `feat/imgw-station-observations`. Steps 1 and 2 are still proposals. Sources were checked on 29 September 2026.

## The problem

ICON-D2 (the 2.2 km model we use for today and tomorrow) sometimes gets south-east winds wrong at Kuźnica and Rewa. We want to catch these misses and correct them, at least for the next 1–3 hours.

## Why south-east wind is hard in the Bay of Puck

- **Warm air over cold water.** SE wind brings warm air from the land across the cooler bay. The air near the water surface becomes "stable": it stops mixing with the faster wind higher up. Whether that faster wind reaches 10 m decides whether the spot is on or off. Models often get this mixing wrong. On 29 September ICON-D2 showed 5.5 m/s at 10 m but 8.2 m/s at 80 m for Kuźnica. With a gap that big, a small error in mixing moves the surface wind a lot.
- **Rewa is offshore in SE.** The wind comes straight off the land, so it's gusty and shaped by the terrain.
- **Kuźnica gets a short fetch.** The wind crosses only about 15–20 km of water from the Gdynia/Rewa side.
- **ECMWF can't tell the two spots apart.** Kuźnica and Rewa fall in the same 9 km ECMWF grid cell, so they get identical values.

## What we can observe

| Source | Closest to | What it gives | Catch |
| --- | --- | --- | --- |
| IMGW telemetry API (`danepubliczne.imgw.pl/api/data/meteo`) | Rewa: Gdynia (~13 km). Kuźnica: Rozewie (~19 km) and Hel (~21 km) | Free JSON, no key. Wind speed, max wind and direction every 10 minutes. Also Gdańsk Port Północny and Świbno. | Only the latest reading. We have to poll it and keep our own history. |
| IMGW synop API (`/api/data/synop`) | Hel, Gdańsk, Łeba, Elbląg | Hourly wind and pressure | Coarser in time |
| Holfuy 1478, SurfPeople Chałupy 3 | Kuźnica (~5 km) | Wind station at a kite school. Its owner says readings are reliable for SW through SE. | Needs an API key from Holfuy or the station owner |
| METAR, Gdańsk airport (EPGD) | – | Wind every 30 minutes | Inland and on higher ground, so a poor match for the bay |
| Maritime Office (umgdy) Jastarnia and Hel | Kuźnica | Wind readings | Images only, not usable data |
| Radar (IMGW, RainViewer) | – | Rain and showers | Doesn't show wind. Only helps with shower gusts and gust fronts. |

IMGW timestamps are in UTC, not local time.

A quick check on 29 September at 16:00 UTC (18:00 local), in light SE wind, gave mixed results. ICON-D2 was 1–2 m/s too weak at Rozewie, Gdynia and Hel. ECMWF was close at Rozewie, Gdynia and Gdańsk but about 2.5 m/s too strong at Hel. That's one hour, so it proves the comparison works, not which model is best.

## Suggested approach

### Step 1: Measure the SE error on past data

Before building anything live, find out how wrong each model usually is in SE wind.

- Get old forecasts from Open-Meteo's previous-runs API. It keeps past runs of ICON-D2, ICON-EU and ECMWF.
- Get what actually happened from IMGW's monthly archives for Hel, Gdynia and Rozewie.
- Keep only hours with wind from about 100–170°, and compare.

If a model is always too strong or too weak in SE, we apply a simple correction factor per model and wind direction. For example, "ICON-D2 in SE at Rewa: multiply by 0.8." This works at every lead time, not just the next two hours, and needs no live data.

### Step 2: Live correction for the next 1–3 hours

1. Every 10 minutes, fetch the IMGW readings (and Holfuy, if we get a key) and store them. The server already fetches them (see step 3) but keeps only the latest reading in memory, so storing a history is the missing part.
2. For each spot, compare each model with its reference stations over the last 2–3 hours. Kuźnica uses Hel, Rozewie and Chałupy. Rewa uses Gdynia and Gdańsk Port Północny.
3. Give more weight to the model that has been closest lately. Blending by weight works better than switching to a single "winner", which would flip back and forth on noise.
4. If the station shows 30% more wind than the models predicted, raise the next hour by about the same amount. Then fade the correction back to the normal forecast over 2–3 hours.

Stations aren't at the spots. Gdynia, for example, sits in a sheltered harbour. So we use them for "how far off is the model right now", not as a replacement for the spot's wind.

### Step 3: Show observations in the app (done)

Instead of attaching a station to each spot, the app shows the stations on their own. "Nearest spot" pairs them in misleading ways: Gdynia comes out nearest to Gdańsk Brzeźno, not Rewa, and no station is close to Kuźnica. Each station reading is shown next to ICON-D2 at the same place and time, so riders can see whether the model is right at the moment.

- **Server.** Every 10 minutes it fetches IMGW telemetry, then ICON-D2 at the station points in 15-minute steps, and pairs each reading with the nearest step. It serves the result at `/api/observations`. It keeps coastal stations within 15 km of a spot and no higher than 80 m, which gives Łeba, Rozewie, Gdynia, Gdańsk-Port Północny, Hel and Gdańsk-Świbno. Rębiechowo (airport, 146 m) is left out. The limits are set in `.env.example`.
- **Map.** Each station is a square dot with a dashed rectangular box, so it's clearly different from the round spot discs. The box shows observed wind, ICON-D2, and the difference (ICON-D2 minus observed, in knots). Green is under 3 kt, amber 3–6 kt, red over 6 kt. A direction error of 30° or more is shown too. Tap for details.
- **Mobile.** A Stations button next to Map shows the same comparison as cards, with the timeline cut down to the current hour.
- **When shown.** By default only at the current hour, because readings describe the present. The "Station check" setting switches between current hour, always and hidden.

This already makes step 2's comparison visible, but only for the present moment. No history is kept, and nothing corrects the forecast yet.

## Other signals worth using

All of these are available from Open-Meteo for free.

- **Air vs sea temperature.** If the air (2 m temperature) is warmer than the sea surface (Open-Meteo marine API), the air over the water is stable, and the forecast wind is often too high.
- **Wind at 10 m vs 80 m.** A big difference means the surface wind depends on mixing, so there's more room for error.
- **Clouds and sunshine.** A sunny afternoon heats the land. That makes Rewa gustier and can create a local breeze that fights the SE wind at Kuźnica.
- **Boundary layer height.** This is how deep the mixed layer of air is. Only ECMWF provides it; ICON returns nothing.
- **Pressure.** Pressure differences between the IMGW stations give a rough independent wind estimate, and a falling or rising trend helps time fronts. This helps recognise the weather pattern more than it helps the 1–2 hour forecast.

These could flag "low-confidence SE hours" in the app even before we have any correction in place.

## Order of work

1. ~~Show IMGW observations in the app (step 3).~~ Done: live station view, obs vs ICON-D2.
2. Offline check of SE error on past data (step 1). This tells us whether a fixed correction is enough.
3. Store the readings the server already fetches, so we build our own history.
4. Live blending and correction (step 2), if step 1 shows the errors change from day to day rather than staying constant.
