# ZenjiGO Super Admin Web Frontend

Responsive Super Admin frontend derived from the ZenjiGO Rider and Driver applications.

## Run
Open `index.html` in a browser, or serve this folder with any static server:

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`.

## Demo authentication
- Email: any valid email (pre-filled with `admin@zenjigo.com`)
- Password: any non-empty password (demo pre-filled)
- OTP: any 6 digits
- Forgot password: email → recovery OTP → new password

## Complete frontend workflows
The frontend now includes working UI flows rather than placeholder buttons/toasts for:

- Dashboard operations and downloadable CSV reports
- Global search across rides, drivers, riders, parcels, tours and withdrawals
- Live operations and tracking navigation
- Ride details, flags and lifecycle visibility
- Driver profiles, creation, application approval/rejection, suspension and support messaging
- Rider creation, account restriction, ride history, saved locations, payment methods and wallet ledger
- Parcel booking and live tracking navigation
- Tour package creation/editing and tracking navigation
- Finance exports, commission configuration and local persistence
- Driver withdrawal approval/rejection and payout exports
- Promotion creation/editing, referral rules and driver incentives
- Interactive support conversations, attachments, calls and escalation
- Safety incident creation, escalation and resolution
- Notification composition and queueing
- Ride pricing editors, service configuration and zone/geofence settings
- Admin invitations, access management and profile/settings navigation
- Audit log exports
- Platform settings persistence
- Theme, responsive sidebar, authentication, OTP, reset-password flow, filters and toasts

Changes in this demo are maintained in frontend state and `localStorage` where appropriate. Replace mock data/actions with backend API calls when endpoints are available.

## Tech
HTML5, CSS3, Vanilla JavaScript, Bootstrap 5, Bootstrap Icons, Chart.js and Leaflet.
