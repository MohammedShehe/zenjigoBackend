# ZenjiGO backend — push notification delivery fixes

This archive adds server-side FCM delivery diagnostics and removes expired FCM tokens when Firebase reports `messaging/registration-token-not-registered`.

## Important deployment notes
- This archive intentionally does not include `.env`, `.git`, or `firebase-service-account.json` because those contain secrets or repository history. Do NOT replace your production secrets with example values.
- Preserve your existing production `.env` and service-account JSON on the server. Ensure `FIREBASE_PROJECT_ID=zenjigo-8ac02`, `FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json` (or another valid path), and that the account JSON belongs to the same Firebase project as both Android apps.
- Install dependencies from `package-lock.json` (`npm ci`) and restart/redeploy the backend.
- Both apps must use the real deployed API base URL at build time (`--dart-define=ZENJIGO_API_URL=https://YOUR-DEPLOYED-HOST/api/v1`).
- Push sending requires a registered, authenticated device token and a real notification-producing backend event. Check backend logs for `[notify]` and `[FCM]` lines.

## Validation
This is a source patch, not proof of delivery on a physical device. Test each app signed in on a real Android 13+ device, allow notifications, confirm token registration logs, trigger a backend event, then test both foreground and background delivery.
