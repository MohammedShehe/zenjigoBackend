# ZenjiGO Admin Console

Professional operations console for ZenjiGO. Plain HTML/CSS/JS — no build step, no mock data, no third-party scripts (Leaflet loads only on the Live operations page).

## Pages
Dashboard · Live operations · Rides · Drivers (profile, documents, finance, reviews) · Document review · Driver requests · Riders · Parcels · Tours · Finance · Driver payouts · Promotions · Support inbox · Safety reports · Notifications · Pricing & policy · Admins & access · Audit log · Archive · My account

## Run
- **Served by the backend (recommended):** copy this folder to `backend/public/admin`, start the backend, open `https://<api-host>/admin`. No configuration needed.
- **Hosted separately (GitHub Pages / CNAME):** set `apiBase` in `assets/js/config.js` and add this site's origin to `CORS_ORIGINS` in the backend `.env`.

## Sign-in
Email + password, then a 6-digit code emailed to the admin. Choose "Keep me signed in" to persist the session on a trusted device; otherwise it ends when the tab closes.

## Requires backend update
This console uses new admin endpoints (change requests, document queue, settlements, tour bookings, rider detail, account/password). Deploy the updated backend and run `npm run migrate` (migration `010_admin_review_tools.sql`).
