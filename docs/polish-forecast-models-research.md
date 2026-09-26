# Polish forecast sources for the Baltic kite spots

**Research snapshot:** 2026-09-26  
**Status:** Discovery; no provider or blend change approved

## Decision in brief

The strongest public-file candidates are **IMGW AROME / ALARO**. **IMGW ICON-LAM** and **INCA-PL2** deserve a closer look: IMGW's ICON-LAM is a Poland-focused run of the **same model family as the app's DWD ICON-D2**, while INCA-PL2 updates short-range 10 m wind forecasts hourly. An IMGW run may add geographic coverage or a different forecast, but its value beyond ICON-D2 has not been measured. **MeteoPG WRF 0.5 km** is geographically interesting for Pomorskie, but machine-readable access appears to require an arrangement. ICM's **UM 1.5 km / 4 km** forecasts remain useful to compare. On 2026-09-26 the registered user's ICM [dashboard][icm-dashboard] test selector **and models-list endpoint** showed only **COAMPS and WRF**; this makes UM availability through the standard API uncertain, but a direct UM forecast request has not yet been tested. None of these sources replaces the app's 15-day ECMWF anchor. The model with the smallest grid spacing is not automatically the best wind forecast at a beach; accuracy has to be checked against observations at the actual spots. [IMGW model descriptions][imgw-products], [IMGW short-range catalogue][imgw-short], [DWD ICON-D2 description][dwd-icon-d2], [ICM forecast map][icm-maps], [MeteoPG description][meteopg]

### What the app needs

The app currently serves **13 spots**, from Łeba (17.54°E) to Krynica Morska (19.44°E), with separate open-coast and sheltered-bay locations. Its [spot list](../src/spots.js) is the source of truth. The [server](../src/server.js) requests hourly **10 m wind speed, 10 m wind direction, 10 m gusts, 2 m temperature and precipitation**. Sunrise and sunset come from the current Open-Meteo feed. The [configuration](../src/config.js) prefers ICON-D2 for roughly the first 48 hours, ICON-EU through 120 hours, then ECMWF IFS to day 15; model outputs are crossfaded near the seams. It requests `cell_selection=sea`. A new source must preserve model provenance and avoid silently substituting a land grid cell for wind on the water.

**Coverage to verify individually:** Łeba, Lubiatowo, Dębki, Jastrzębia Góra, Puck, Jastarnia, Jurata, Hel, Rewa, Gdańsk Brzeźno, Orle, Jantar and Krynica Morska. All are in the current [spot list](../src/spots.js); a published “Poland” or “Pomorskie” domain does not prove that its output grid has a suitable sea cell for each coordinate.

## Candidate forecast models

“Run frequency” means model initialisations, not a promise that a downloadable forecast arrives immediately. “Access” combines published documentation with the registered user's 2026-09-26 observation of the authenticated [ICM test selector][icm-dashboard] and models-list response. It does not establish that all five app variables occur in an accessible raw feed.

| Model / producer | Grid and published horizon | Run or update frequency | Wind and other parameters | Machine-readable access; fit for this app |
| --- | --- | --- | --- | --- |
| **UM 1.5 km**, ICM / meteo.pl | 1.5 km; about **78 h** | **2 runs/day**, 00 and 12 UTC; publication about 4.5 h after the start is ICM's general UM guidance | ICM's maps show 10 m wind, speed and gusts, temperature, cloud and precipitation | **Absent from the API test selector and models list.** Direct-request access has **not** been tested; if unavailable, ask ICM about dedicated delivery and terms. [ICM technical schedule][icm-schedule], [ICM maps][icm-maps], [ICM dashboard][icm-dashboard] |
| **UM 4 km**, ICM / meteo.pl | 4 km; **120 h** for 00/12 UTC runs, **60 h** for 06/18 UTC runs | **4 runs/day**; ICM says UM pages appear about 4.5 h after run start | The public maps show 10 m wind and gusts alongside other weather fields | **Absent from the API test selector and models list.** Direct-request access remains untested; useful for visual comparison through day 5 regardless. [ICM schedule][icm-schedule], [ICM maps][icm-maps], [ICM dashboard][icm-dashboard] |
| **AROME 2 km**, IMGW | 2 km; **30 h** | IMGW says **4 runs/day** | IMGW displays 10 m wind and gust forecasts; the exact public GRIB inventory still needs inspection | AROME is listed in IMGW's public **GRIB** datastore, rather than a documented 13-point JSON API. Good first IMGW candidate for today/tomorrow. [IMGW products][imgw-products], [IMGW wind example][imgw-wind], [IMGW datastore][imgw-data] |
| **ALARO 4 km**, IMGW | 4 km; **72 h** | IMGW says **4 runs/day** | IMGW displays wind and gust forecasts and publishes ALARO meteograms for Łeba and Hel | ALARO GRIB is listed in the public datastore. Could provide a 2–3 day complement to AROME. [IMGW products][imgw-products], [IMGW meteograms][imgw-meteograms], [IMGW datastore][imgw-data] |
| **ICON-LAM 2.5 km**, IMGW | 2.5 km; **60 h** on IMGW's current short-range selector | IMGW documents **4 runs/day** (00/06/12/18 UTC); publication lag and completeness remain unmeasured | Current 10 m wind speed/direction and gust **map images** were fetched; numerical fields have not been obtained | IMGW's model documentation lists **GRIB2 and NetCDF output**, but ICON-LAM was absent from the checked public file catalogue and product API. Ask IMGW for numerical output or a point feed; delivery terms and price are unknown. **Same ICON-LAM family as DWD ICON-D2, different operational run**; incremental value remains untested. [IMGW short-range selector][imgw-short], [IMGW model white paper][imgw-white], [DWD ICON-D2 description][dwd-icon-d2], [IMGW public datastore][imgw-data], [IMGW product API][imgw-product-api] |
| **COSMO 2.8 / 7 km**, IMGW | Poland 2.8 km and Baltic-wide 7 km. IMGW's descriptive page says **48 / 78 h**; its current model navigation advertises **60 / 96 h**. | **4 runs/day**, 00/06/12/18 UTC | Wind is shown in IMGW model comparisons; raw public availability differs by product | Public datastore lists COSMO GRIB products. A candidate for comparison, but the conflicting advertised horizons and product packaging need a live-file check before design. [IMGW products][imgw-products], [IMGW current navigation][imgw-short], [IMGW datastore][imgw-data] |
| **INCA-PL2 1 km**, IMGW | **0–8 h** nowcast | Forecast refreshed **hourly** at 1 h steps; analysis uses a 10 min step | Explicitly forecasts **10 m wind components**, plus temperature, humidity and other fields; it adjusts AROME output using telemetry | Attractive “leaving now” wind layer. A public point or raw-grid feed was **not verified**; displayed maps alone are not an ingestion interface. [IMGW products][imgw-products], [IMGW white paper][imgw-white], [IMGW border forecast][imgw-border] |
| **WRF MeteoPG 0.5 km**, Gdańsk University of Technology / TASK | 0.5 km Pomorskie nest; IMGW describes a **72 h** forecast; an older TASK page says **60 h** | IMGW describes **4 runs/day** | WRF produces meteorological forecasts, including wind, but the supplied variables for an external feed need confirmation | Likely covers this spot region geographically; exact coastal cells need validation. No public point API or price was found. A project report says data exchange must be arranged with MeteoPG. [IMGW products][imgw-products], [TASK description][meteopg], [TASK project report][meteopg-report] |
| **WRF 3–3.4 km**, ICM / meteo.pl | Older ICM pages show roughly **72 h**, and one 12 UTC run to 120 h | Older technical page says **4 runs/day** | ICM describes wind forecast maps | **WRF is listed** in the API test selector and models response, but its grid, current run availability and required fields remain untested. This is separate from MeteoPG WRF. [ICM schedule][icm-schedule], [ICM maps][icm-maps], [ICM dashboard][icm-dashboard] |
| **COAMPS**, ICM / meteo.pl | Current grid and horizon **unverified** | Current run frequency **unverified** | API's public example shows a temperature field; required 10 m wind and gust fields need testing | **COAMPS is listed** in the API test selector and models response. Listing does not prove current operational runs or coastal coverage. [ICM API][icm-api], [ICM dashboard][icm-dashboard] |

**Adjacent data, outside the wind-model comparison:** ICM's **WAM Baltic wave model** is reported as running twice a day and forecasting waves, not 10 m wind. It could later add wave height/direction to a kite decision, but is not a replacement wind source. [ICM WAM description][icm-wam], [ICM schedule][icm-schedule]

## Access, licence and cost

### ICM point API: the only published per-point price found

The public [ICM API page][icm-api] advertises **0.01 PLN for one parameter at one location from one forecast run**, a **5 PLN minimum top-up**, and a free test point for each model/grid after registration. It describes data indexing delays and says continuous API availability is not guaranteed. Its displayed COAMPS request uses a **2017 example**. On **2026-09-26**, the registered user saw only COAMPS and WRF in the [dashboard's test selector][icm-dashboard] and obtained this response from the models-list endpoint:

```json
{"models":["coamps","wrf"]}
```

This is a user-supplied authenticated response; its endpoint URL was not recorded. It makes UM availability through the standard API doubtful, but does not prove that a direct UM forecast request will fail or rule out paid/negotiated feeds. A direct UM response is pending. The [payment terms][icm-terms] say prepaid funds can be used for 12 months; tariff and terms should be rechecked before purchasing.

Illustrative **30-day** costs for all 13 locations, **one API model that proves accessible**, and one fetch of each new run. They apply to WRF or COAMPS **if** the required fields are offered, and to UM **only if** a direct request succeeds under the advertised tariff:

| Fields per spot | 2 runs/day scenario | 4 runs/day scenario |
| --- | ---: | ---: |
| Wind speed + direction: 2 | **15.60 PLN/month** | **31.20 PLN/month** |
| Speed + direction + gusts: 3 | **23.40 PLN/month** | **46.80 PLN/month** |
| All five current app fields: 5 | **39.00 PLN/month** | **78.00 PLN/month** |

Formula: `13 spots × fields × 0.01 PLN × runs/day × 30 days`. For example, all five fields at four runs per day cost `13 × 5 × 0.01 × 4 × 30 = 78 PLN`. The table assumes no shared billed grid cell, no failed/retried billable call, no additional level charge, and that the advertised tariff applies to the desired model. It excludes integration work and hosting. Sunrise/sunset can continue to come from the existing Open-Meteo feed.

Paying per call **does not establish permission to republish derived forecasts**. The current [ICM usage FAQ][icm-usage] says creation or distribution of applications using ICM forecasts requires prior written consent and sets additional conditions for UM commercial or advertising use. A provider reply should confirm that this specific personal/shared web app may fetch, cache, transform and display the fields, with the required attribution. ICM also offers [negotiated business delivery][icm-business] by API or batch files; no public quote was found.

### IMGW public data: low stated data fee, higher integration work

IMGW's [public datastore][imgw-data] lists **AROME and ALARO GRIB forecast files** and COSMO products. The [published data terms][imgw-terms] generally permit free use subject to conditions, require source attribution and a processing notice for transformed data, and describe cases where an agreement or charge applies. They also allow a request for continuous direct access, with a possible fee for system adaptations. There is **no published per-spot tariff** for these GRIB files. It would be premature to call this route “zero cost”: bandwidth, storage, GRIB decoding, run monitoring and maintenance have not been measured, and the app's use case should be checked against the terms. The current portal was not audited for file size, completeness or update lag.

#### ICON-LAM access check (2026-09-26)

- **Available publicly as maps:** IMGW's [short-range viewer][imgw-short] serves current ICON-LAM Polska images for 10 m wind speed/direction and gusts. A [00 UTC wind image][imgw-iconlam-wind-image] and [matching gust image][imgw-iconlam-gust-image] for 2026-09-26 both returned JPEGs. The wind image identifies a 2.5 km ICON-LAM run. The viewer advertises a 60 h horizon and 00/06/12/18 UTC starts; this check verified one run and lead time, not a complete feed or a publication schedule.
- **Numerical output exists, public delivery unverified:** IMGW's [model white paper][imgw-white] lists ICON-LAM output formats as **GRIB2 and NetCDF**. The operational and archive product lists in the [public file datastore][imgw-data] and the [documented product API][imgw-product-api] did not list ICON-LAM on this check. The [API guide][imgw-apiinfo] does offer forecast **file listings** through `/api/data/product`: a request for the listed [COSMO `COSMO_HVD_00_00` product][imgw-cosmo-product] returned 63 file entries with download URLs. That particular listing still showed a 2026-09-25 00 UTC run when checked on 2026-09-26, so endpoint availability alone does not establish forecast freshness. The guide does not document a point-forecast endpoint or list an ICON-LAM product. These catalogues may not exhaust every IMGW delivery channel, so this is not proof that access is impossible.
- **Practical route:** Ask IMGW for a public or arranged numerical ICON-LAM endpoint. Its [data terms, §8][imgw-terms] allow requests for unpublished data and continuous direct access via **biznes@imgw.pl**. Ask whether a GRIB2/NetCDF subset or a 13-point time series can be delivered for the app's coordinates, with 10 m wind components or speed/direction, gusts, 2 m temperature and precipitation. Specify sea-cell selection, valid-time interval, all four cycles, typical publication lag, archive depth, format, transfer method, reuse/attribution conditions and any charge. IMGW's terms allow a fee for additional preparation or system adaptation; no ICON-LAM quote is published here.
- **Integration consequence:** The map JPEGs can support a link or visual comparison, but do not provide reliable numeric values for each spot. A confirmed grid feed would require field decoding and coastal-cell checks; a point feed could avoid full-grid ingestion. Neither route is ready to implement until delivery and use rights are confirmed.

#### How IMGW ICON-LAM compares with the app's DWD ICON-D2

**ICON-LAM names the limited-area mode of the ICON model; ICON-D2 is DWD's specific ICON-LAM configuration.** DWD explicitly describes ICON-D2 this way. IMGW runs its own 2.5 km ICON-LAM configuration for Poland, so these forecasts share a modelling framework but are **not the same forecast dataset**. [DWD explanation][dwd-icon-lam], [DWD ICON-D2 description][dwd-icon-d2], [IMGW model white paper][imgw-white]

| Comparison | DWD ICON-D2, already used by the app | IMGW ICON-LAM Polska |
| --- | --- | --- |
| Grid and domain | About **2 km**; DWD describes complete coverage of Germany and several neighbours, plus **parts** of other neighbouring countries. Polish coastal coverage and the distance of each selected cell from the domain boundary still need a spot-level check. | **2.5 km** Poland-centred run; the public map depicts the whole Polish coast, but numerical sea-cell coverage for all 13 spots remains unverified. |
| Runs and published horizon | Open-Meteo publishes ICON-D2 updates **every 3 h** and about **48 h** of forecast. | IMGW documents **00/06/12/18 UTC** runs; its map viewer advertises **60 h**. Actual publication lag is unmeasured. |
| Inputs and setup | DWD documents **ICON-EU lateral boundaries** and **KENDA** data assimilation for operational ICON-D2. | IMGW documents initial and boundary conditions from DWD's **global ICON**. Its local assimilation/physics details were not established in this research. |
| Access here | Already available through the app's Open-Meteo request. | Current public wind/gust maps; a reusable numerical feed has not been found. |

**Decision implication:** IMGW ICON-LAM could differ because its domain, initial/boundary data and run schedule differ, particularly near the eastern edge of the DWD domain. Shared model heritage also means its errors may be correlated with ICON-D2; it should not be counted as an independent model family in a blend. Before paying for a feed or assigning blend weight, verify both models' actual sea cells for all 13 spots and compare same-valid-time wind/gust errors against nearby observations. These are inferences from the documented setups, not measured accuracy claims. [DWD ICON-D2 description][dwd-icon-d2], [IMGW model white paper][imgw-white], [Open-Meteo DWD model details][openmeteo-dwd]

### MeteoPG and dedicated feeds

No public MeteoPG raw-feed price was found. [TASK's description][meteopg] identifies its model and portal; a [technical project report][meteopg-report] says a public download API is unavailable and data exchange can be arranged with the team. Treat its monetary cost and delivery format as **quote required**. The same applies to a dedicated ICM/IMGW point or batch feed beyond their published interfaces.

| Route | Monetary cost confidence | Engineering effort | Main dependency |
| --- | --- | --- | --- |
| Link to provider forecast page | Usually no data-ingestion fee established here | Low | Useful to riders, but cannot enter our graph or blend |
| ICM advertised point API (COAMPS/WRF in models list) | Budgetable **only if** its model, fields, grid and tariff are confirmed | Medium | Written use permission, run checks, grid mapping, retries and cost cap |
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

### IMGW station observations: a future verification feed

IMGW's [API guide][imgw-apiinfo] exposes live **observations**, separate from its model forecast files. A snapshot fetched on 2026-09-26 showed:

| Endpoint | Wind data returned | Coastal use and limits |
| --- | --- | --- |
| [`/api/data/synop`][imgw-synop-api] | 62 station records with measurement date/hour, wind speed and direction; all 62 had those wind values in this snapshot. | Łeba, Hel, Gdańsk and Ustka were present. The guide documents a station-ID filter, e.g. [Hel `12135`][imgw-hel-synop]. No gust field or station coordinates appear in this response. |
| [`/api/data/meteo`][imgw-meteo-api] | 788 station records with coordinates and separately timestamped wind direction, mean speed, maximum speed and `wiatr_poryw_10min`. Mean wind was non-null at 316 stations; 302 of those readings were within an hour of the newest timestamp in this response. | Coastal stations included Łeba, Rozewie, Hel, Gdynia, Gdańsk Port Północny and Gdańsk Świbno. The gust field was non-null at only 61 stations, and only **one** value was within an hour of the newest timestamp. The meaning/period of `wiatr_predkosc_maksymalna`, units and timestamp timezone need confirmation. |

Nearest stations with fresh mean wind were **1.6–20.1 km** from the app's [13 coordinates](../src/spots.js) in this snapshot; the nearest station to Krynica Morska was **Frombork across the lagoon**, not a beach measurement. Filter each field by its own timestamp, retain station identity and distance, and compare like valid times before using observations to judge forecast quality. The existing app links to some local/nearby readings in [the spot inventory](spot-external-links.md). Historical availability and exact reuse conditions for an automated benchmark still need checking. These endpoints cannot supply ICON-LAM forecast values.

## Practical integration shapes

### A. ICM point adapter, if a usable model is confirmed

The user has registered and found **COAMPS and WRF** in the dashboard's test selector and models-list response. Inspect their grids, 10 m wind speed/direction/gust, temperature and precipitation, units, valid times, and a current run. Separately, test a direct UM request; the list alone does not settle whether that route responds. Confirm use rights for any candidate. A server-side adapter would cache one response per run/spot/field, cap chargeable fetches, normalize to the app's hourly contract, and leave ECMWF for the rest of the 15 days. This is a relatively short path **if** an appropriate model, fields and permission are confirmed. [ICM API][icm-api], [ICM dashboard][icm-dashboard], [ICM usage FAQ][icm-usage]

### B. IMGW GRIB extractor

Audit a current AROME and ALARO run. Confirm public file URLs, lead-time increments, wind `u/v` or speed/direction, gust definition, units, projection, land/sea mask, file sizes and latency. Download only the needed fields or files if the server supports selective access; decode offline into a small per-spot JSON cache that matches the existing server's contract. The app's zero-dependency Node runtime would likely need a separate GRIB decoding process or a new library/service. Test ingestion cost before deciding which model(s) to run continuously. [IMGW datastore][imgw-data], [IMGW products][imgw-products]

### C. Provider-arranged feed

Ask IMGW or MeteoPG for point/batch delivery covering the 13 coordinates, named parameters, 10 m wind, sea-cell selection, update schedule, archive, attribution and a quote. This can avoid our own full-grid processing if terms and price are suitable. [IMGW terms][imgw-terms], [TASK report][meteopg-report]

## Open research questions

1. Which user experience matters most: a **second-opinion model line**, a replacement for the first 48–72 hours, or a **0–8 h “go now”** wind view? This changes which feed deserves the cost.
2. Does a **direct UM request** return a current forecast despite UM's absence from the dashboard test selector **and models list**? Which COAMPS/WRF grids and wind fields are available for all coastal coordinates? What are ICM's written permission and current tariff for this app?
3. Which IMGW GRIB products actually expose 10 m speed/direction or `u/v`, gusts, temperature and precipitation, and at what lead-time interval? Are AROME/ALARO/COSMO runs complete and timely for several days?
4. Will IMGW provide the documented ICON-LAM GRIB2/NetCDF output or a 13-point feed, on what schedule and terms? Does INCA-PL2 offer an ingestible 10 m wind field?
5. What are MeteoPG's source-data terms, delivery options and quote for the 13 points?
6. Which observations can be used for a fair, location-aware wind verification without treating nearby stations as exact spot measurements?

## Sources

- [ICM API pricing, free test point, example and reliability statement][icm-api]
- [ICM authenticated test dashboard][icm-dashboard] (model-selector and models-list response supplied by the registered user on 2026-09-26; direct UM request pending)
- [ICM API payment terms][icm-terms]
- [ICM current model map and parameter categories][icm-maps]
- [ICM published run/horizon schedule][icm-schedule] and [FAQ on publication timing][icm-faq]
- [ICM usage FAQ][icm-usage] and [business delivery offer][icm-business]
- [IMGW model descriptions, schedules, observations and nowcasting][imgw-products]
- [IMGW current short-range model selector][imgw-short] and [model white paper][imgw-white]
- [DWD explanation of ICON-D2 as ICON-LAM][dwd-icon-lam], [DWD ICON-D2 model documentation][dwd-icon-d2] and [Open-Meteo DWD model details][openmeteo-dwd]
- [IMGW public GRIB datastore][imgw-data] and [data-use terms][imgw-terms]
- [IMGW public API guide][imgw-apiinfo], [SYNOP observations][imgw-synop-api] and [meteorological station observations][imgw-meteo-api]
- [IMGW documented product API][imgw-product-api] and [ICON-LAM wind][imgw-iconlam-wind-image] / [gust][imgw-iconlam-gust-image] map examples
- [IMGW AROME/ALARO wind example][imgw-wind], [ALARO meteograms][imgw-meteograms], and [gust case study][imgw-case]
- [IMGW INCA-PL2 wind display][imgw-border]
- [TASK MeteoPG model description][meteopg] and [technical project report][meteopg-report]
- [ICM WAM explanation][icm-wam]

[icm-api]: https://api.meteo.pl/
[icm-dashboard]: https://api.meteo.pl/dashboard/
[icm-terms]: https://api.meteo.pl/s/terms/
[icm-maps]: https://mapy.meteo.pl/
[icm-schedule]: https://bardzotest.meteo.pl/
[icm-faq]: https://www.meteo.pl/faq
[icm-usage]: https://www.meteo.pl/faq-category/zasady-korzystania-z-prognoz
[icm-business]: https://www.meteo.pl/oferta
[imgw-products]: https://cmm.imgw.pl/produkty-cmm/
[imgw-short]: https://cmm.imgw.pl/cmm/?page_id=48626
[imgw-white]: https://cmm.imgw.pl/wp-content/uploads/2023/08/imgw-pib-monografia_biala-ksiega-numerycznych-modeli-pogody.pdf
[dwd-icon-lam]: https://www.dwd.de/EN/ourservices/cosmo_newsletter/pdf_einzelbaende/2021_21.pdf?__blob=publicationFile&v=1
[dwd-icon-d2]: https://www.dwd.de/SharedDocs/downloads/DE/modelldokumentationen/nwv/icon_d2/icon_d2_dbbeschr_aktuell.pdf?nn=344870&view=nasPublication
[openmeteo-dwd]: https://open-meteo.com/en/docs/dwd-api
[imgw-data]: https://danepubliczne.imgw.pl/pl/datastore?product=ALARO_pub
[imgw-apiinfo]: https://danepubliczne.imgw.pl/pl/apiinfo
[imgw-product-api]: https://danepubliczne.imgw.pl/api/data/product
[imgw-cosmo-product]: https://danepubliczne.imgw.pl/api/data/product/id/COSMO_HVD_00_00
[imgw-synop-api]: https://danepubliczne.imgw.pl/api/data/synop
[imgw-hel-synop]: https://danepubliczne.imgw.pl/api/data/synop/id/12135
[imgw-meteo-api]: https://danepubliczne.imgw.pl/api/data/meteo
[imgw-terms]: https://danepubliczne.imgw.pl/regulations
[imgw-iconlam-wind-image]: https://cmm.imgw.pl/wp-content/uploads/production/00/ICONLAM_POLSKA_wind10m_ICON_00z_2026-09-26_00_00_00.jpg
[imgw-iconlam-gust-image]: https://cmm.imgw.pl/wp-content/uploads/production/00/ICONLAM_POLSKA_wgust_ICON_00z_2026-09-26_00_00_00.jpg
[imgw-wind]: https://modele.imgw.pl/cmm/wp-content/uploads/zjawiskaEktremalne/Raport%20ko%C5%84cowy%20ze%20zdarzenia%20z%20dnia%201%20IV%202024%20roku.pdf
[imgw-meteograms]: https://modele.imgw.pl/cmm/?page_id=31687
[imgw-case]: https://www.imgw.pl/sites/default/files/2023-03/mhwm_2022_10_2.pdf
[imgw-border]: https://modele.imgw.pl/?page_id=35717
[meteopg]: https://task.gda.pl/pl/badania-i-rozwoj/projekty/meteopg
[meteopg-report]: https://task.gda.pl/assets/projekty/Raport-techniczny-Final-2025-v.2.6.2.pdf
[icm-wam]: https://www.meteo.pl/nowoczesna-prognoza-falowania-baltyku-jak-model-wam-zmienia-podejscie-do-planowania-aktywnosci-na-morzu
