# Ride flow changes

No database migration is needed. State is derived from `ride_events` and `payment_transactions`.

Lifecycle: searching -> accepted -> arriving -> arrived -> (rider PIN) started -> destination reached -> payment -> completed

New / changed endpoints
- PATCH /driver/rides/:id/status  { status, otp? }  `started` requires the rider's 4-digit trip PIN (`otp`).
  `completed` is refused until payment is confirmed. `arrived` is allowed from `accepted` or `arriving`.
- GET   /driver/rides/:id                     full live ride for the driver (trip_pin is never returned to drivers)
- POST  /driver/rides/:id/reached-destination driver reached drop-off; rider is asked to pay
- POST  /driver/rides/:id/collect-cash        driver confirms cash received; ends the ride
- POST  /rider/rides/:id/pay  { method: cash|wallet|momo|card|bank, phone? }
    wallet -> debited, ride completes automatically
    cash   -> rider announces cash; driver confirms with collect-cash
    momo/card/bank -> Snippe mobile-money charge; ride completes when the webhook confirms it
- Ride payload (GET /rider/rides/:id, /driver/rides/:id) now includes: driver{...,lat,lng}, payment_status,
  reached_destination, amount_due, and driver_earnings / platform_commission once completed.
- GET /rider/rides/:id/track also returns driverLat, driverLng, heading, speed.
- Chat: list titles show the other person's name; PATCH /chat/:id/messages/:messageId edits own messages;
  POST /chat/ride/:rideId returns { conversationId, id }.
- Webhook: payments with metadata.channel = ride_payment complete the ride and are never credited to the wallet.
