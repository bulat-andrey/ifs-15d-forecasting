// The 16 Polish Baltic kite spots - single source of truth.
// lat/lon drive the Open-Meteo request.
// dx: display-only side hint for the front-end label placer - its SIGN picks the
//     preferred side (dx<0 = prefer west, e.g. spots near the right edge). The
//     magnitude is no longer used; labels are auto-positioned to avoid overlap.
// place (optional): pins the label to a fixed direction relative to the disc,
//     overriding auto-placement. One of N, S, E, W, NE, NW, SE, SW.
// nudge (optional): [dx, dy] extra pixel offset applied on top of `place`, for
//     fine-tuning (e.g. [-70, 0] shifts the label 70px further left).
// wg = Windguru Pro (Sultan Surfingu) page for the spot; null if not yet known.
// goodFrom = meteorological wind direction ranges (degrees wind comes FROM) that are
//     treated as suitable for the spot: side-shore, cross-onshore, and onshore.
//     Ranges can wrap north, e.g. [240, 100] means WSW through N through E.
// externalLinks = provider pages for cameras/readings; nearby sources name their actual location.
const maritime = 'https://www.umgdy.gov.pl/bezpieczenstwo-morskie/ruch-statkow/hydro-meteo/';

module.exports = [
  { name: 'Łeba',           lat: 54.766774, lon: 17.543355, dx:  12, dy: -40, place: 'W', wg: 'https://www.windguru.cz/3159', goodFrom: [[259, 73]], externalLinks: [
    { type: 'camera', label: 'Fly Resort', location: 'Łeba west beach', url: 'https://flyresort.pl/leba/', proximity: 'direct' },
    { type: 'camera', label: 'WebCamera.pl', location: 'Łeba east beach', url: 'https://leba.webcamera.pl/', proximity: 'direct' }
  ] },
  { name: 'Lubiatowo',      lat: 54.811945, lon: 17.831954, dx:  12, dy:  12, place: 'N', nudge: [-70, 0], wg: 'https://www.windguru.cz/?gn=11102773', goodFrom: [[253, 74]], externalLinks: [
    { type: 'camera', label: 'WebCamera.pl', location: 'Lubiatowo beach entrance', url: 'https://lubiatowo-kamera.webcamera.pl/', proximity: 'direct' }
  ] },
  { name: 'Dębki',          lat: 54.833919, lon: 18.071477, dx:  12, dy: -40, place: 'N', nudge: [-21, 0], wg: 'https://www.windguru.cz/?gn=11102775', goodFrom: [[268, 88]], externalLinks: [
    { type: 'camera', label: 'Nadmorski24', location: 'Dębki beach', url: 'https://nadmorski24.pl/kamery/9-D%C4%99bki---pla%C5%BCa-D%C4%99bki', proximity: 'direct' }
  ] },
  { name: 'Jastrzębia Góra', lat: 54.835108, lon: 18.278059, dx:  12, dy:  12, wg: 'https://www.windguru.cz/1355758', goodFrom: [[270, 90]], externalLinks: [
    { type: 'camera', label: 'Nadmorski24', location: 'Jastrzębia Góra beach', url: 'https://nadmorski24.pl/kamery/22-Jastrz%C4%99bia-G%C3%B3ra---pla%C5%BCa-Jastrz%C4%99bia-G%C3%B3ra', proximity: 'direct' },
    { type: 'camera', label: 'Nadmorski24', location: 'Karwia beach', url: 'https://nadmorski24.pl/kamery/24-karwia-plaza-karwia', proximity: 'nearby' }
  ] },
  { name: 'Puck',           lat: 54.724900, lon: 18.418000, dx: -118, dy: -40, wg: 'https://www.windguru.cz/48009', goodFrom: [[322, 142]], externalLinks: [
    { type: 'camera', label: 'Nadmorski24', location: 'Puck beach and pier', url: 'https://nadmorski24.pl/kamery/27-puck-plaza-przystan-molo-puck', proximity: 'direct' },
    { type: 'camera', label: 'Nadmorski24', location: 'Puck, Bay of Puck', url: 'https://nadmorski24.pl/kamery/54-Puck---Zatoka-Pucka-Puck', proximity: 'direct' }
  ] },
  { name: 'Kuźnica',        lat: 54.733806, lon: 18.579478, dx:  12, dy:  12, wg: 'https://www.windguru.cz/1356177', externalLinks: [
    { type: 'camera', label: 'WebCamera.pl', location: 'Kuźnica, Bay of Puck', url: 'https://kuznica.webcamera.pl/', proximity: 'direct' }
  ] },
  { name: 'Jastarnia',      lat: 54.698500, lon: 18.663300, dx:  12, dy: -40, place: 'E', nudge: [-82, -45], wg: 'https://www.windguru.cz/1355694', goodFrom: [[120, 300]], externalLinks: [
    { type: 'camera', label: 'WebCamera.pl', location: 'Jastarnia pier and Bay of Puck', url: 'https://jastarnia.webcamera.pl/', proximity: 'direct' },
    { type: 'camera', label: 'WebCamera.pl', location: 'Jastarnia molo', url: 'https://jastarnia-molo-kamera.webcamera.pl/', proximity: 'direct' },
    { type: 'camera', label: 'Nadmorski24', location: 'Jastarnia, Maszoperia campsite', url: 'https://nadmorski24.pl/kamery/83-Jastarnia---Kemping-Maszoperia-Jastarnia', proximity: 'direct' },
    { type: 'camera', label: 'Nadmorski24', location: 'Jastarnia beach, Dom Zdrojowy', url: 'https://nadmorski24.pl/kamery/99-jastarnia-plaza-dom-zdrojowy-jastarnia', proximity: 'direct' }
  ] },
  { name: 'Jurata',         lat: 54.685884, lon: 18.721608, dx:  14, dy:   8, wg: 'https://www.windguru.cz/1355692', goodFrom: [[316, 121]], externalLinks: [
    { type: 'camera', label: 'WebCamera.pl', location: 'Jurata molo and Bay of Puck', url: 'https://jurata.webcamera.pl/', proximity: 'direct' },
    { type: 'camera', label: 'WebCamera.pl', location: 'Jurata Baltic beach', url: 'https://jurata-plaza.webcamera.pl/', proximity: 'direct' },
    { type: 'observations', label: 'Maritime Office', location: 'Jastarnia station', url: maritime, proximity: 'nearby' }
  ] },
  { name: 'Hel',            lat: 54.614701, lon: 18.777220, dx:  14, dy:   8, wg: 'https://www.windguru.cz/1355693', goodFrom: [[170, 330]], externalLinks: [
    { type: 'camera', label: 'WebCamera.pl', location: 'Hel port and beach', url: 'https://hel.webcamera.pl/', proximity: 'direct' },
    { type: 'observations', label: 'Maritime Office', location: 'Hel port and lighthouse', url: maritime, proximity: 'direct' }
  ] },
  { name: 'Rewa',           lat: 54.637600, lon: 18.515300, dx: -118, dy:   8, wg: 'https://www.windguru.cz/4165', goodFrom: [[221, 160]], externalLinks: [
    { type: 'camera', label: 'Nadmorski24', location: 'Rewa, Surfstacja', url: 'https://nadmorski24.pl/kamery/106-Rewa---Surfstacja-Rewa', proximity: 'direct' },
    { type: 'camera', label: 'WebCamera.pl', location: 'Rewa, Bay of Puck', url: 'https://rewa.webcamera.pl/', proximity: 'direct' }
  ] },
  { name: 'Orłowo',         lat: 54.479248, lon: 18.564017, dx: -118, dy: -40, wg: 'https://www.windguru.cz/1356441', goodFrom: [[20, 182]] },
  { name: 'Sopot',           lat: 54.433001, lon: 18.588798, dx:   12, dy:  12, wg: 'https://www.windguru.cz/1356442', goodFrom: [[315, 142]] },
  { name: 'Gdańsk Brzeźno', lat: 54.410596, lon: 18.635737, dx: -150, dy: -40, wg: 'https://www.windguru.cz/1355695', goodFrom: [[275, 102]], externalLinks: [
    { type: 'camera', label: 'WebCamera.pl', location: 'Brzeźno pier and beach', url: 'https://gdansk.webcamera.pl/', proximity: 'direct' },
    { type: 'wind', label: 'Autopay', location: 'Sopot marina', url: 'https://autopay.pl/pogoda', proximity: 'nearby' },
    { type: 'wind', label: 'SKŻ Sopot', location: 'Sopot', url: 'https://skz.sopot.pl/pogoda', proximity: 'nearby' }
  ] },
  { name: 'Orle',           lat: 54.348843, lon: 18.876844, dx:  14, dy:  12, place: 'E', nudge: [-80, -45], wg: 'https://www.windguru.cz/1355696', goodFrom: [[275, 100]], externalLinks: [
    { type: 'camera', label: 'TASK', location: 'NCŻ Górki Zachodnie', url: 'https://task.gda.pl/pl/multimedia/kamery/kamera-gdansk-ncz', proximity: 'nearby' },
    { type: 'wind', label: 'Holfuy', location: 'NCŻ Górki Zachodnie', url: 'https://holfuy.com/en/weather/1441', proximity: 'nearby' }
  ] },
  { name: 'Jantar',         lat: 54.345340, lon: 19.038758, dx:  12, dy: -40, wg: null, goodFrom: [[269, 90]], externalLinks: [
    { type: 'camera', label: 'WebCamera.pl', location: 'Jantar west beach', url: 'https://jantar.webcamera.pl/', proximity: 'direct' }
  ] },
  { name: 'Krynica Morska', lat: 54.388914, lon: 19.441715, dx: -150, dy: -40, place: 'SE', wg: 'https://www.windguru.cz/14473', goodFrom: [[0, 359]], externalLinks: [
    { type: 'camera', label: 'Hotel Krynica', location: 'Krynica Morska', url: 'https://krynicahotel.pl/webcamera-3/', proximity: 'direct' },
    { type: 'camera', label: 'WebCamera.pl', location: 'Krynica Morska beach, entrance 26', url: 'https://krynicamorska.webcamera.pl/', proximity: 'direct' },
    { type: 'observations', label: 'Maritime Office', location: 'Krynica Morska lighthouse', url: maritime, proximity: 'direct' }
  ] }
];

// Kuźnica sits near Jastarnia at wider map extents; prefer its label on the west side.
module.exports.find(s => s.lat === 54.733806 && s.lon === 18.579478).dx = -12;
module.exports.find(s => s.lat === 54.835108 && s.lon === 18.278059).place = 'NE';
