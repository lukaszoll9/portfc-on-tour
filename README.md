# Port FC on Tour

Fan project for Port FC Bangkok. QR stickers from Khlong Toei get stuck up around the world; whoever finds one uploads a photo, pins the spot on the map and gets reposted on [@portfc_tour](https://instagram.com/portfc_tour).

Live: https://portfc-on-tour.com · Admin: https://portfc-on-tour.com/admin

## Concept: "Harbour Manifest"
Port FC is the harbour club (Port Authority of Thailand, Khlong Toei). Each sticker find is treated as a **shipment from the home port**:
- the globe shows routes from PAT Stadium to every find, with the distance in km
- every find gets a cargo tag with an ISO 6346 container number (`PFCU 000013 3`, check digit included)
- the stats board works like a departures board: spots, countries, farthest find, total distance

## Structure
```
index.html                 page markup (EN/DE/TH via data-i18n)
admin.html                 admin: move pins, fix place names, hide spots
assets/css/site.css        design system + all components
assets/js/i18n.js          all texts in EN / DE / TH
assets/js/geo.js           distances, routes, countries, geocoding, map style (shared)
assets/js/app.js           main page: globe, feed, ranks, report flow, story image
assets/js/admin.js         admin logic
assets/fonts/              self-hosted fonts (Big Shoulders Stencil, IBM Plex Sans/Mono/Thai)
netlify/functions/
  get-spots.js             public list (Airtable → JSON, CDN-cached 60 s)
  submit-spot.js           saves a new spot
  admin-spots.mjs          /api/admin/spots (list + edit), needs ADMIN_PASSWORD
```

## Services
| What | Service |
|---|---|
| Hosting + functions | Netlify |
| Data | Airtable, table `Sightings` (Name, City, Instagram, Photo URL, Latitude, Longitude, Submitted At, Hidden) |
| Photos | Cloudinary (unsigned preset `portfc_sightings`; resizing + HEIC conversion on the fly) |
| Admin e-mail | Formspree |
| Map | MapLibre GL (jsDelivr) + OpenFreeMap vector tiles + Natural Earth borders |
| Place search | Photon (komoot), Nominatim as fallback |

## Netlify environment variables
- `AIRTABLE_TOKEN`, `AIRTABLE_BASE_ID` (already set)
- `ADMIN_PASSWORD`: new, needed for /admin

## Location flow
1. GPS from the photo's EXIF data, if present
2. "My location" button (browser GPS, only on tap)
3. Search for a place
4. Fine-tune by moving the map under the fixed pin

A find can't be submitted without a location, so no more spots without a pin.

## Instagram
Posts load only after a click (2-click solution for GDPR). Change the post links in `assets/js/app.js` → `CONFIG.igPosts`.

*Unofficial fan project. Not affiliated with Port FC or the Port Authority of Thailand.*
