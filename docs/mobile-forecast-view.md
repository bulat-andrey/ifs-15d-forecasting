# Mobile Forecast View

Branch: `feature/mobile-forecast-view`

## Goal

Make the phone experience a fast forecast overview instead of a compressed map. Desktop keeps the existing map workflow.

## Progress

- [x] Create a dedicated feature branch.
- [x] Add a mobile overview with a time rail and spot list.
- [x] Compact spots into a two-column grid with combined wind/gust values.
- [x] Mark kiteable hours green in the vertical day timeline.
- [x] Open the selected spot in the existing detail panel.
- [x] Render one forecast day per table block for easier vertical browsing.
- [x] Add mobile touch sizing and full-screen detail layout.
- [ ] Test at 320, 375, 390, and 430px widths.
- [ ] Test on a real phone over the local Wi-Fi address.
- [ ] Review desktop regression and merge after acceptance.

## Local phone test

Start the server on all interfaces, then open the laptop's LAN address on the phone:

```sh
HOST=0.0.0.0 PORT=8788 node src/server.js
```

Find the laptop address with `hostname -I` and open `http://<laptop-ip>:8788/` on the phone. Both devices must be on the same Wi-Fi network.

## Acceptance notes

- The map remains the desktop default.
- Mobile overview shows every spot for the selected forecast hour.
- Spot detail opens with the table view and scrolls vertically by day.
- Wind barbs/arrows, threshold, direction suitability, and exact degrees remain consistent with desktop.
