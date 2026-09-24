// The 13 Polish Baltic kite spots — single source of truth.
// lat/lon drive the Open-Meteo request.
// dx: display-only side hint for the front-end label placer — its SIGN picks the
//     preferred side (dx<0 = prefer west, e.g. spots near the right edge). The
//     magnitude is no longer used; labels are auto-positioned to avoid overlap.
// place (optional): pins the label to a fixed direction relative to the disc,
//     overriding auto-placement. One of N, S, E, W, NE, NW, SE, SW.
// nudge (optional): [dx, dy] extra pixel offset applied on top of `place`, for
//     fine-tuning (e.g. [-70, 0] shifts the label 70px further left).
// wg = Windguru Pro (Sultan Surfingu) page for the spot; null if not yet known.
module.exports = [
  { name: 'Łeba',           lat: 54.766774, lon: 17.543355, dx:  12, dy: -40, place: 'W', wg: 'https://www.windguru.cz/3159' },
  { name: 'Lubiatowo',      lat: 54.811945, lon: 17.831954, dx:  12, dy:  12, place: 'N', nudge: [-70, 0], wg: 'https://www.windguru.cz/?gn=11102773' },
  { name: 'Dębki',          lat: 54.833919, lon: 18.071477, dx:  12, dy: -40, place: 'N', nudge: [-21, 0], wg: 'https://www.windguru.cz/?gn=11102775' },
  { name: 'Jastrzębia Góra', lat: 54.835108, lon: 18.278059, dx:  12, dy:  12, wg: 'https://www.windguru.cz/1355758' },
  { name: 'Puck',           lat: 54.724900, lon: 18.418000, dx: -118, dy: -40, wg: 'https://www.windguru.cz/48009' },
  { name: 'Jastarnia',      lat: 54.698500, lon: 18.663300, dx:  12, dy: -40, place: 'E', nudge: [-82, -45], wg: 'https://www.windguru.cz/1355694' },
  { name: 'Jurata',         lat: 54.685884, lon: 18.721608, dx:  14, dy:   8, wg: 'https://www.windguru.cz/1355692' },
  { name: 'Hel',            lat: 54.614701, lon: 18.777220, dx:  14, dy:   8, wg: 'https://www.windguru.cz/1355693' },
  { name: 'Rewa',           lat: 54.637600, lon: 18.515300, dx: -118, dy:   8, wg: 'https://www.windguru.cz/4165' },
  { name: 'Gdańsk Brzeźno', lat: 54.410596, lon: 18.635737, dx: -150, dy: -40, wg: 'https://www.windguru.cz/1355695' },
  { name: 'Orle',           lat: 54.348843, lon: 18.876844, dx:  14, dy:  12, place: 'E', nudge: [-80, -45], wg: 'https://www.windguru.cz/1355696' },
  { name: 'Jantar',         lat: 54.345340, lon: 19.038758, dx:  12, dy: -40, wg: null },
  { name: 'Krynica Morska', lat: 54.388914, lon: 19.441715, dx: -150, dy: -40, place: 'SE', wg: 'https://www.windguru.cz/14473' }
];
