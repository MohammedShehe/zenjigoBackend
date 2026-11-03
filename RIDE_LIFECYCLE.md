# Ride lifecycle guarantees

No ride can stay stuck, and nobody can be locked out of the app by a ride nobody is working on.

| Situation | What happens |
|---|---|
| Rider books while a ride is active | API answers `409` with `details.code = ACTIVE_RIDE_EXISTS` + `rideId`; apps open that ride. Apps also restore it on startup via `GET /rider/rides/active` (`/driver/rides/active` for drivers). |
| Double-tap / two devices book at once | Serialised per rider: exactly one ride is created. |
| Nobody accepts within `RIDE_SEARCH_WINDOW_SECONDS` | Cancelled ("No drivers available"). |
| Driver cancels before the trip starts | Ride returns to *searching* for a new driver (that driver is excluded). After `RIDE_MAX_REDISPATCH` hand-backs it is cancelled. |
| Driver offline/silent after accepting, or never arrives | Re-dispatched automatically. |
| Rider doesn't show up | After `RIDE_NOSHOW_MINUTES`: normal late-cancel fee. If the driver left too: cancelled, no fee. |
| Trip started, driver's phone goes silent | Rider gets an **End this trip** button (no fee). After `RIDE_TRIP_STALE_MINUTES` the ride is auto-closed and flagged for admin. |
| Destination reached, cash, driver never confirms | Auto-completed after `RIDE_CASH_AUTOCONFIRM_MINUTES` (earning + commission recorded). |
| Destination reached, unpaid for `RIDE_PAYMENT_OVERDUE_MINUTES` | Flagged for admin, rider reminded. |
| Mobile-money prompt never approved | Expires after `RIDE_PAYMENT_TTL_MINUTES`; rider can retry or switch method. |
| Driver tries to go offline mid-ride | Refused with a clear message (`DRIVER_ON_RIDE`). |
| Admin suspends / archives a rider or driver with live rides | Rides are released (driver rides re-dispatched, rider rides cancelled). |
| Anything else | Admin → Rides → *Needs attention*: cancel, mark completed, return to search, or dismiss. |

The engine runs every minute (`ride.lifecycle.service.js`) and on every booking / active-ride request.
Columns are created automatically on boot (`ensureLifecycleSchema`); `012_ride_lifecycle.sql` documents them.

Test: `DB_NAME=<throwaway test db> node scripts/test-ride-lifecycle.js` (refuses to run unless the DB name contains "test").
