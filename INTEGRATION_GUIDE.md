# Frontend integration guide

The existing Flutter projects in the supplied frontend are largely demo/state-driven. This backend provides the real API and replaces those local demo actions once HTTP/socket calls are connected.

## Base URL
Development:
```text
http://10.0.2.2:5000/api/v1
```
for Android emulator. For iOS simulator or desktop, use:
```text
http://localhost:5000/api/v1
```
For a physical phone, use the computer's LAN IP.

## HTTP headers
Authenticated:
```text
Authorization: Bearer ACCESS_TOKEN
Content-Type: application/json
```

Multipart uploads use `multipart/form-data`.

## Rider flow
1. Send OTP.
2. Verify OTP and store access/refresh tokens securely.
3. `GET /rider/me`.
4. `POST /rider/rides/quote`.
5. `POST /rider/rides`.
6. Connect Socket.IO and join the ride room.
7. Read live location from `ride:location`.
8. `POST /rider/rides/:id/cancel` if required.
9. After completion, `POST /rider/rides/:id/rating`.
10. Wallet/history use `/rider/wallet`.

## Driver flow
1. Register using multipart fields and documents.
2. Admin approves application.
3. Send/verify driver OTP.
4. Toggle `/driver/online`.
5. Poll or socket-listen for ride requests.
6. Accept one request.
7. Update status: `arriving -> arrived -> started -> completed`.
8. Emit live location using Socket.IO.
9. Use `/driver/earnings` and `/driver/payout`.

## Admin
The backend exposes admin APIs even though the supplied frontend archive did not contain a complete Admin UI source project. Any web admin client can consume `/admin/*`.

## FCM
After login, call:
`POST /rider/notifications/token` or `/driver/notifications/token`

Body:
```json
{
  "token": "FCM_DEVICE_TOKEN",
  "platform": "android"
}
```

The backend automatically sends notifications for ride assignment/status and chat messages.

## Cloudinary
For generic uploads:
`POST /upload` with form field `file`.

Driver registration accepts:
- `license`
- `nationalId`
- `insurance`
- `vehiclePhotos` (up to 5)
- `driverPhoto`

## Important
Never put Twilio auth tokens, Cloudinary API secrets, Firebase private keys, JWT secrets or MySQL credentials inside the Flutter app. They belong only on the server.
