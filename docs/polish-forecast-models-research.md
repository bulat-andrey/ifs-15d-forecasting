# Polish forecast sources for the Baltic kite spots

**Research snapshot:** 2026-09-26  
**Status:** Discovery; no provider or blend change approved

## Decision in brief

The strongest short-range candidates are **ICM UM 1.5 km / 4 km** for a point-data integration and **IMGW AROME / ALARO** for a public-file integration. **IMGW ICON-LAM** and **INCA-PL2** deserve a closer look: ICON-LAM is a newer Poland-focused regional forecast, while INCA-PL2 updates short-range 10 m wind forecasts hourly. **MeteoPG WRF 0.5 km** is geographically interesting for Pomorskie, but machine-readable access appears to require an arrangement. None of these replaces the app's 15-day ECMWF anchor. The model with the smallest grid spacing is not automatically the best wind forecast at a beach; accuracy has to be checked against observations at the actual spots. [IMGW model descriptions][imgw-products], [IMGW short-range catalogue][imgw-short], [ICM forecast map][icm-maps], [MeteoPG description][meteopg]

### What the app needs

The app currently serves **13 spots**, from Łeba (17.54°E) to Krynica Morska (19.44°E), with separate open-coast and sheltered-bay locations. Its [spot list](../src/spots.js) is the source of truth. The [server](../src/server.js) requests hourly **10 m wind speed, 10 m wind direction, 10 m gusts, 2 m temperature and precipitation**. Sunrise and sunset come from the current Open-Meteo feed. The [configuration](../src/config.js) prefers ICON-D2 for roughly the first 48 hours, ICON-EU through 120 hours, then ECMWF IFS to day 15; model outputs are crossfaded near the seams. It requests `cell_selection=sea`. A new source must preserve model provenance and avoid silently substituting a land grid cell for wind on the water.

**Coverage to verify individually:** Łeba, Lubiatowo, Dębki, Jastrzębia Góra, Puck, Jastarnia, Jurata, Hel, Rewa, Gdańsk Brzeźno, Orle, Jantar and Krynica Morska. All are in the current [spot list](../src/spots.js); a published “Poland” or “Pomorskie” domain does not prove that its output grid has a suitable sea cell for each coordinate.

## Candidate forecast models

“Run frequency” means model initialisations, not a promise that a downloadable forecast arrives immediately. “Access” describes what was publicly documented at this snapshot; it does not establish that all five app variables occur in an accessible raw feed.

| Model / producer | Grid and published horizon | Run or update frequency | Wind and other parameters | Machine-readable access; fit for this app |
| --- | --- | --- | --- | --- |
| **UM 1.5 km**, ICM / meteo.pl | 1.5 km; about **78 h** | **2 runs/day**, 00 and 12 UTC; publication about 4.5 h after the start is ICM's general UM guidance | ICM's maps show 10 m wind, speed and gusts, temperature, cloud and precipitation; exact API field names and levels need a logged-in check | `api.meteo.pl` advertises point forecasts, but does not publicly confirm the current UM 1.5 km catalogue or every required field. Strong candidate if account access and use rights are confirmed. [ICM technical schedule][icm-schedule], [ICM maps][icm-maps], [ICM API][icm-api] |
| **UM 4 km**, ICM / meteo.pl | 4 km; **120 h** for 00/12 UTC runs, **60 h** for 06/18 UTC runs | **4 runs/day**; ICM says UM pages appear about 4.5 h after run start | The public maps show 10 m wind and gusts alongside other weather fields | Same point-API questions as UM 1.5 km. Useful as a local medium-short-range comparison through day 5. [ICM schedule][icm-schedule], [ICM maps][icm-maps], [ICM API][icm-api] |
| **AROME 2 km**, IMGW | 2 km; **30 h** | IMGW says **4 runs/day** | IMGW displays 10 m wind and gust forecasts; the exact public GRIB inventory still needs inspection | AROME is listed in IMGW's public **GRIB** datastore, rather than a documented 13-point JSON API. Good first IMGW candidate for today/tomorrow. [IMGW products][imgw-products], [IMGW wind example][imgw-wind], [IMGW datastore][imgw-data] |
| **ALARO 4 km**, IMGW | 4 km; **72 h** | IMGW says **4 runs/day** | IMGW displays wind and gust forecasts and publishes ALARO meteograms for Łeba and Hel | ALARO GRIB is listed in the public datastore. Could provide a 2–3 day complement to AROME. [IMGW products][imgw-products], [IMGW meteograms][imgw-meteograms], [IMGW datastore][imgw-data] |
| **ICON-LAM 2.5 km**, IMGW | 2.5 km; **60 h** on IMGW's current short-range selector | 00/06/12/18 UTC starts are shown in the selector; actual availability per cycle is unverified | The selector offers forecast parameters, but the downloadable wind-field catalogue has not been checked | Promising newer Polish model; public raw-download path and terms are **unconfirmed**. Do not confuse it with the already integrated German ICON-D2 or ICON-EU. [IMGW short-range selector][imgw-short], [IMGW model white paper][imgw-white] |
| **COSMO 2.8 / 7 km**, IMGW | Poland 2.8 km and Baltic-wide 7 km. IMGW's descriptive page says **48 / 78 h**; its current model navigation advertises **60 / 96 h**. | **4 runs/day**, 00/06/12/18 UTC | Wind is shown in IMGW model comparisons; raw public availability differs by product | Public datastore lists COSMO GRIB products. A candidate for comparison, but the conflicting advertised horizons and product packaging need a live-file check before design. [IMGW products][imgw-products], [IMGW current navigation][imgw-short], [IMGW datastore][imgw-data] |
| **INCA-PL2 1 km**, IMGW | **0–8 h** nowcast | Forecast refreshed **hourly** at 1 h steps; analysis uses a 10 min step | Explicitly forecasts **10 m wind components**, plus temperature, humidity and other fields; it adjusts AROME output using telemetry | Attractive “leaving now” wind layer. A public point or raw-grid feed was **not verified**; displayed maps alone are not an ingestion interface. [IMGW products][imgw-products], [IMGW white paper][imgw-white], [IMGW border forecast][imgw-border] |
| **WRF MeteoPG 0.5 km**, Gdańsk University of Technology / TASK | 0.5 km Pomorskie nest; IMGW describes a **72 h** forecast; an older TASK page says **60 h** | IMGW describes **4 runs/day** | WRF produces meteorological forecasts, including wind, but the supplied variables for an external feed need confirmation | Likely covers this spot region geographically; exact coastal cells need validation. No public point API or price was found. A project report says data exchange must be arranged with MeteoPG. [IMGW products][imgw-products], [TASK description][meteopg], [TASK project report][meteopg-report] |
| **WRF 3–3.4 km**, ICM / meteo.pl | Older ICM pages show roughly **72 h**, and one 12 UTC run to 120 h | Older technical page says **4 runs/day** | ICM describes wind forecast maps | Keep as a secondary lead: the current public point-API catalogue and operational status are unclear. This is separate from MeteoPG WRF. [ICM schedule][icm-schedule], [ICM maps][icm-maps] |

**Adjacent data, outside the wind-model comparison:** ICM's **WAM Baltic wave model** is reported as running twice a day and forecasting waves, not 10 m wind. It could later add wave height/direction to a kite decision, but is not a replacement wind source. [ICM WAM description][icm-wam], [ICM schedule][icm-schedule]

## Access, licence and cost

### ICM point API: the only published per-point price found

The public [ICM API page][icm-api] advertises **0.01 PLN for one parameter at one location from one forecast run**, a **5 PLN minimum top-up**, and a free test point for each model/grid after registration. It describes data indexing delays and says continuous API availability is not guaranteed. Its displayed COAMPS request uses a **2017 example**, so it is evidence of the API shape and advertised tariff, not proof of today's model catalogue. The [payment terms][icm-terms] say prepaid funds can be used for 12 months; tariff and terms should be rechecked before purchasing.

Illustrative **30-day** costs for all 13 locations, **one model**, and one fetch of each new run:

| Fields per spot | 2 runs/day (e.g. UM 1.5 km) | 4 runs/day (e.g. UM 4 km) |
| --- | ---: | ---: |
| Wind speed + direction: 2 | **15.60 PLN/month** | **31.20 PLN/month** |
| Speed + direction + gusts: 3 | **23.40 PLN/month** | **46.80 PLN/month** |
| All five current app fields: 5 | **39.00 PLN/month** | **78.00 PLN/month** |

Formula: `13 spots × fields × 0.01 PLN × runs/day × 30 days`. For example, all five fields at four runs per day cost `13 × 5 × 0.01 × 4 × 30 = 78 PLN`. The table assumes no shared billed grid cell, no failed/retried billable call, no additional level charge, and that the advertised tariff applies to the desired model. It excludes integration work and hosting. Sunrise/sunset can continue to come from the existing Open-Meteo feed.

Paying per call **does not establish permission to republish derived forecasts**. The current [ICM usage FAQ][icm-usage] says creation or distribution of applications using ICM forecasts requires prior written consent and sets additional conditions for UM commercial or advertising use. A provider reply should confirm that this specific personal/shared web app may fetch, cache, transform and display the fields, with the required attribution. ICM also offers [negotiated business delivery][icm-business] by API or batch files; no public quote was found.

### IMGW public data: low stated data fee, higher integration work

IMGW's [public datastore][imgw-data] lists **AROME and ALARO GRIB forecast files** and COSMO products. The [published data terms][imgw-terms] generally permit free use subject to conditions, require source attribution and a processing notice for transformed data, and describe cases where an agreement or charge applies. They also allow a request for continuous direct access, with a possible fee for system adaptations. There is **no published per-spot tariff** for these GRIB files. It would be premature to call this route “zero cost”: bandwidth, storage, GRIB decoding, run monitoring and maintenance have not been measured, and the app's use case should be checked against the terms. The current portal was not audited for file size, completeness or update lag.

### MeteoPG and dedicated feeds

No public MeteoPG raw-feed price was found. [TASK's description][meteopg] identifies its model and portal; a [technical project report][meteopg-report] says a public download API is unavailable and data exchange can be arranged with the team. Treat its monetary cost and delivery format as **quote required**. The same applies to a dedicated ICM/IMGW point or batch feed beyond their published interfaces.

| Route | Monetary cost confidence | Engineering effort | Main dependency |
| --- | --- | --- | --- |
| Link to provider forecast page | Usually no data-ingestion fee established here | Low | Useful to riders, but cannot enter our graph or blend |
| ICM advertised point API | Budgetable **only if** the desired model/fields and tariff are confirmed | Medium | Registration, written use permission, grid mapping, retries and cost cap |
| IMGW public GRIB extraction | No per-point fee found; infrastructure cost unmeasured | High | GRIB parser, selective downloads, projection/sea-cell mapping and operational monitoring |
| Provider-arranged point/batch feed | **Quote required** | Medium to high | Written contract, data format, freshness and availability terms |

## Freshness: three different clocks

1. **Run cadence** is when a model starts (for example 00/06/12/18 UTC). It does not say when our server can fetch it.
2. **Publication lag** is when the model output appears. ICM says UM forecasts reach its page roughly **4.5 hours after start**, and its API adds indexing delay without an uptime guarantee. IMGW's published run schedules do not provide an equivalent verified API publication SLA. [ICM FAQ][icm-faq], [ICM API][icm-api]
3. **App freshness** is when the app discovers and ingests a complete run. The current code polls Open-Meteo metadata every **5 minutes**, waits **3 minutes** after availability, and has a **180-minute** safety refresh. Those controls are provider-specific; an IMGW/ICM adapter would need its own run and completeness checks. [App configuration](../src/config.js), [app server](../src/server.js)

For any candidate, record run initialization time, first visible file/response time, last required field arrival, and app ingestion time over at least several consecutive days. Reject partial runs or stale data and continue serving the last good forecast with explicit provenance.

## Forecast quality: what is known and what is not

IMGW demonstrably forecasts **10 m wind speed/direction and gusts** from its regional models; its AROME example and ALARO meteograms establish this, while the exact **downloadable** field inventory remains to be checked. [IMGW wind example][imgw-wind], [IMGW meteograms][imgw-meteograms]

Published resolution is a description of the grid, **not a measured accuracy score** at Łeba or Puck. A Polish 0.5–2 km model may represent shoreline and bay geometry better than a 7–9 km model, but could still choose a land cell, miss a sea-breeze shift or predict the timing of a gust poorly. IMGW's own [case study][imgw-case] shows AROME and ALARO gust errors changing with place and run in one event; it does not establish a winner for these 13 spots. No comparable coast-specific error statistics for the exact app coordinates were found in the reviewed sources.

The useful acceptance test is a **parallel forecast trial**, without altering the main blend:

- Verify all 13 coordinates are inside each output domain and record the selected **sea/land mask, grid-cell centre and distance to spot**.
- Compare model values at equal valid times and lead-time bands (0–8 h, 8–30 h, 30–72 h, 72–120 h) against the current blend and available nearby observations. Keep an observation's actual location visible; a Jastarnia or Hel station is not a measurement at every nearby beach.
- Measure wind-speed bias and mean absolute error, circular direction error, gust error, threshold hits/misses around the app's 12 kt kite threshold, missing hours, and run publication lag **per spot and lead time**. Check open coast, the Puck/Hel bay, Gdańsk Bay, and Krynica separately.
- Assess whether adding the new model helps a rider decide **when and where to go**, not only whether it produces more spatial detail. Start with a labeled second-opinion line or comparison panel; promote a source into the blend only if that trial supports it.

IMGW publishes hourly [SYNOP wind observations][imgw-products] and the existing app links to local/nearby stations in [the spot inventory](spot-external-links.md). Observation permissions and historical availability must be checked before automating a benchmark.

## Practical integration shapes

### A. ICM point adapter

Register for the free test point; inspect the logged-in catalogue for **UM 1.5 km and UM 4 km**, grid/coordinate lookup, 10 m wind speed/direction/gust, temperature and precipitation, units, valid times, and one full current run. Confirm use rights. A server-side adapter would cache one response per run/spot/field, cap chargeable fetches, normalize to the app's hourly contract, and leave ECMWF for the rest of the 15 days. This is the shortest path **if** the catalog and permission checks pass. [ICM API][icm-api], [ICM usage FAQ][icm-usage]

### B. IMGW GRIB extractor

Audit a current AROME and ALARO run. Confirm public file URLs, lead-time increments, wind `u/v` or speed/direction, gust definition, units, projection, land/sea mask, file sizes and latency. Download only the needed fields or files if the server supports selective access; decode offline into a small per-spot JSON cache that matches the existing server's contract. The app's zero-dependency Node runtime would likely need a separate GRIB decoding process or a new library/service. Test ingestion cost before deciding which model(s) to run continuously. [IMGW datastore][imgw-data], [IMGW products][imgw-products]

### C. Provider-arranged feed

Ask IMGW or MeteoPG for point/batch delivery covering the 13 coordinates, named parameters, 10 m wind, sea-cell selection, update schedule, archive, attribution and a quote. This can avoid our own full-grid processing if terms and price are suitable. [IMGW terms][imgw-terms], [TASK report][meteopg-report]

## Open questions before a PRD or ADR

1. Which user experience matters most: a **second-opinion model line**, a replacement for the first 48–72 hours, or a **0–8 h “go now”** wind view? This changes which feed deserves the cost.
2. Does ICM's current API offer UM 1.5/4 km for every required field and all coastal coordinates? What is its written permission and current tariff for this app?
3. Which IMGW GRIB products actually expose 10 m speed/direction or `u/v`, gusts, temperature and precipitation, and at what lead-time interval? Are AROME/ALARO/COSMO runs complete and timely for several days?
4. Is IMGW ICON-LAM available as raw reusable data, and does INCA-PL2 offer an ingestible 10 m wind field?
5. What are MeteoPG's source-data terms, delivery options and quote for the 13 points?
6. Which observations can be used for a fair, location-aware wind verification without treating nearby stations as exact spot measurements?

## Sources

- [ICM API pricing, free test point, example and reliability statement][icm-api]
- [ICM API payment terms][icm-terms]
- [ICM current model map and parameter categories][icm-maps]
- [ICM published run/horizon schedule][icm-schedule] and [FAQ on publication timing][icm-faq]
- [ICM usage FAQ][icm-usage] and [business delivery offer][icm-business]
- [IMGW model descriptions, schedules, observations and nowcasting][imgw-products]
- [IMGW current short-range model selector][imgw-short] and [model white paper][imgw-white]
- [IMGW public GRIB datastore][imgw-data] and [data-use terms][imgw-terms]
- [IMGW AROME/ALARO wind example][imgw-wind], [ALARO meteograms][imgw-meteograms], and [gust case study][imgw-case]
- [IMGW INCA-PL2 wind display][imgw-border]
- [TASK MeteoPG model description][meteopg] and [technical project report][meteopg-report]
- [ICM WAM explanation][icm-wam]

[icm-api]: https://api.meteo.pl/
[icm-terms]: https://api.meteo.pl/s/terms/
[icm-maps]: https://mapy.meteo.pl/
[icm-schedule]: https://bardzotest.meteo.pl/
[icm-faq]: https://www.meteo.pl/faq
[icm-usage]: https://www.meteo.pl/faq-category/zasady-korzystania-z-prognoz
[icm-business]: https://www.meteo.pl/oferta
[imgw-products]: https://cmm.imgw.pl/produkty-cmm/
[imgw-short]: https://cmm.imgw.pl/cmm/?page_id=48626
[imgw-white]: https://cmm.imgw.pl/wp-content/uploads/2023/08/imgw-pib-monografia_biala-ksiega-numerycznych-modeli-pogody.pdf
[imgw-data]: https://danepubliczne.imgw.pl/pl/datastore?product=ALARO_pub
[imgw-terms]: https://danepubliczne.imgw.pl/regulations
[imgw-wind]: https://modele.imgw.pl/cmm/wp-content/uploads/zjawiskaEktremalne/Raport%20ko%C5%84cowy%20ze%20zdarzenia%20z%20dnia%201%20IV%202024%20roku.pdf
[imgw-meteograms]: https://modele.imgw.pl/cmm/?page_id=31687
[imgw-case]: https://www.imgw.pl/sites/default/files/2023-03/mhwm_2022_10_2.pdf
[imgw-border]: https://modele.imgw.pl/?page_id=35717
[meteopg]: https://task.gda.pl/pl/badania-i-rozwoj/projekty/meteopg
[meteopg-report]: https://task.gda.pl/assets/projekty/Raport-techniczny-Final-2025-v.2.6.2.pdf
[icm-wam]: https://www.meteo.pl/nowoczesna-prognoza-falowania-baltyku-jak-model-wam-zmienia-podejscie-do-planowania-aktywnosci-na-morzu
