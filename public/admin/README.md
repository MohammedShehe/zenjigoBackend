# ZenjiGO Super Admin Web Frontend

Fully API-integrated Super Admin frontend for the ZenjiGO platform.

## Features (all backed by live MySQL API)

- Dashboard metrics
- Rides list
- Drivers: list, add, edit, approve/activate, suspend, deactivate
- Riders: list, add, edit, restrict/activate, deactivate
- Sub-admins: list, add, edit, deactivate
- Parcels list
- Tour packages: list, add, edit, deactivate
- Finance: payments (complete pending), commission ledger
- Withdrawals / payouts: approve, reject, mark paid
- Promotions: create, edit, deactivate
- Notifications: list + send to user
- Support conversations list
- Audit log
- Commission & settlement settings
- Platform settings view + API base URL config

## Run

### Option A — served by the backend (recommended)

```bash
cd backend
npm install
npm run migrate
npm run seed
npm run dev
```

Open: `http://localhost:5000/admin`

### Option B — static server

```bash
cd frontend
python -m http.server 8080
```

Open `http://localhost:8080` and ensure the API is running on port 5000.

## Auth

Admin login uses email + password + OTP (Twilio Verify in production).

Seed credentials come from backend `.env`:

- `SEED_ADMIN_EMAIL`
- `SEED_ADMIN_PASSWORD`

## Tech

HTML5, CSS3, Vanilla JS, Bootstrap 5, Bootstrap Icons, Chart.js, Leaflet.
