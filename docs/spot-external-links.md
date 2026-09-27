# Spot webcams and weather links

Curated provider pages with duplicate views removed. These are links, not proposed embed URLs. The original locally supplied links were checked on 25 September 2026; later camera additions were checked on 27 September 2026 for page identity. Live video playback and long-term availability were not verified. “Nearby” means useful context, not a camera or sensor at the app spot.

## Matches for current app spots

| App spot | URL | Type and location |
| --- | --- | --- |
| Łeba | https://flyresort.pl/leba/ | West beach camera and wind reading on the Fly Resort page. |
| Łeba | https://leba.webcamera.pl/ | Camera overlooking Łeba's east beach. |
| Lubiatowo | https://lubiatowo-kamera.webcamera.pl/ | Camera showing the path and entrance to Lubiatowo beach. |
| Dębki | https://nadmorski24.pl/kamery/9-D%C4%99bki---pla%C5%BCa-D%C4%99bki | Camera at Dębki beach. |
| Jastrzębia Góra | https://nadmorski24.pl/kamery/22-Jastrz%C4%99bia-G%C3%B3ra---pla%C5%BCa-Jastrz%C4%99bia-G%C3%B3ra | Camera at Jastrzębia Góra beach. |
| Puck | https://nadmorski24.pl/kamery/27-puck-plaza-przystan-molo-puck | Camera at Puck beach, marina and pier. |
| Puck | https://nadmorski24.pl/kamery/54-Puck---Zatoka-Pucka-Puck | Camera overlooking the Bay of Puck. |
| Kuźnica | https://kuznica.webcamera.pl/ | Camera overlooking the Bay of Puck at Kuźnica. |
| Jastarnia | https://jastarnia.webcamera.pl/ | Camera overlooking Jastarnia pier, beach and Bay of Puck. |
| Jastarnia | https://jastarnia-molo-kamera.webcamera.pl/ | Camera showing Jastarnia molo and the Bay of Puck. |
| Jastarnia | https://nadmorski24.pl/kamery/83-Jastarnia---Kemping-Maszoperia-Jastarnia | Camera at Maszoperia campsite in Jastarnia. |
| Jastarnia | https://nadmorski24.pl/kamery/99-jastarnia-plaza-dom-zdrojowy-jastarnia | Camera showing Jastarnia's Baltic beach by Dom Zdrojowy. |
| Jurata | https://jurata.webcamera.pl/ | Camera showing Jurata's molo and the Bay of Puck. |
| Jurata | https://jurata-plaza.webcamera.pl/ | Camera showing Jurata's Baltic beach. |
| Hel | https://hel.webcamera.pl/ | Rotating camera at Hel port, bulwar and beach. |
| Rewa | https://nadmorski24.pl/kamery/106-Rewa---Surfstacja-Rewa | Camera at the Rewa Surfstacja. |
| Rewa | https://rewa.webcamera.pl/ | Camera overlooking Rewa and the Bay of Puck. |
| Hel; Jurata (nearby Jastarnia station); Krynica Morska; Gdańsk Brzeźno (regional readings) | https://www.umgdy.gov.pl/bezpieczenstwo-morskie/ruch-statkow/hydro-meteo/ | Maritime office observations, including Hel port and lighthouse, Jastarnia, Krynica lighthouse and Gdańsk stations. These are observations, not a forecast. |
| Rewa | https://www.wiatrkadyny.pl/rewa/mIndex.php | Page titled “Rewa Pogoda Live”; wind and weather readings. **Check before use:** the page displays coordinates near Kadyny (54°18′ N, 19°28′ E), inconsistent with Rewa. |
| Gdańsk Brzeźno | https://gdansk.webcamera.pl/ | Camera showing Brzeźno pier and beach. |
| Jantar | https://jantar.webcamera.pl/ | Camera overlooking Jantar's west beach. |
| Krynica Morska | https://krynicahotel.pl/webcamera-3/ | Hotel Krynica webcam. The page does not state the camera's viewing direction in accessible text. |
| Krynica Morska | https://krynicamorska.webcamera.pl/ | Rotating camera at the Baltic beach, entrance 26. |
| Orle (nearby) | https://task.gda.pl/pl/multimedia/kamery/kamera-gdansk-ncz | Camera at NCŻ Górki Zachodnie, west of Orle. |
| Orle (nearby) | https://holfuy.com/en/weather/1441 | NCŻ Górki Zachodnie wind station. |
| Gdańsk Brzeźno (nearby) | https://autopay.pl/pogoda | Sopot marina live wind readings and camera. |
| Gdańsk Brzeźno (nearby) | https://skz.sopot.pl/pogoda | SKŻ Sopot weather station and webcam link. |
| Jastrzębia Góra (nearby) | https://nadmorski24.pl/kamery/24-karwia-plaza-karwia | Camera at nearby Karwia beach. |

## Relevant cameras outside the current spot list

| Location | URL |
| --- | --- |
| Kąty Rybackie | https://katyrybackie.webcamera.pl/ |
| Gdynia Orłowo | https://nadmorski24.pl/kamery/2-gdynia-orlowo-gdynia# |
| Belgian spot (outside this app) | https://surfingelephant.be/nl/live/ |

The Gdynia Orłowo URL's trailing `#` is unnecessary. The Belgian page could not be fetched during the page-identity check.

## Other weather or forecast resources outside the app area

| Resource | URL |
| --- | --- |
| Snowkite weather in Austria | https://www.kitewetter.at/ |
| Specific Kitewetter page | https://www.kitewetter.at/?p=3882 |

Other services mentioned without direct spot forecast URLs: **ICM**, **Windfinder**, and **Windy**. The app already has Windguru links in `src/spots.js`; those links were not in the supplied source material. A one-off Facebook weather video is omitted because it is not a persistent camera or forecast page.

No direct water or beach camera was verified for Orle. It retains the nearby Górki Zachodnie camera and station. Jastrzębia Góra also retains the nearby Karwia camera, and Jurata retains nearby Jastarnia observations.

The separate Kuźnica Baltic beach view at `kuznica-plaza.webcamera.pl` requires Premium access and is omitted from the app's Live conditions links.
