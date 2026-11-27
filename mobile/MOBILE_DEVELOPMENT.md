# Running the mobile app

Initialize or update PostgreSQL as its owner using [the database setup](../docs/database.md#initialize-or-upgrade-a-local-database). The API connects as the restricted runtime role. In Terminal 1, from the ForestGuard-AI root, with the project's Python environment already installed:

```sh
source .venv/bin/activate
APP_ENV=development CITIZEN_DEV_OTP_ENABLED=true AI_MODE=auto \
  python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

Both backend flags are required for local OTP `1234`. Development citizen sessions require those flags while in use. Citizen registration and sign-in take ten ASCII digits starting with 6, 7, 8 or 9. The API rejects numbers classified as landlines and saves accepted numbers with the `+91` prefix.

Use the same Wi-Fi network for the computer and phone. Find the computer’s Wi-Fi IP on macOS with `ipconfig getifaddr en0`, or read the active interface’s IP in Network settings. From the phone, open `http://<computer-ip>:8000/api/health`. A response confirms the connection before you start Expo. If it fails, check the host firewall, IP and Wi-Fi client isolation. Use AI_MODE=demo to exercise the failed-analysis and retry states. Restart with AI_MODE=auto to run the installed model.

In Terminal 2, from the same root:

```sh
cd mobile
npm ci
export EXPO_PUBLIC_API_URL="http://$(ipconfig getifaddr en0):8000"
npm run dev -- --host lan --clear
```

If Wi-Fi uses another interface or you are on another OS, substitute the IP from the connectivity check. Equivalently, set `EXPO_PUBLIC_API_URL` in `mobile/.env` using [the example](.env.example) and omit the export command. A physical phone’s `localhost` points at the phone. Changing the Expo public variable requires reloading the app with the updated bundle. This variable goes into client code, so it should contain an origin and no credentials.

Scan the Expo QR code with an Expo Go version compatible with the project's installed SDK, or open it in your development build. Allow local network access if the OS prompts. If the native runtime disallows HTTP, use a trusted HTTPS backend origin. The production app should also use HTTPS. Expo’s Metro tunnel only transports the bundle. The phone still needs separate reachability to FastAPI.

For browser development, the API defaults to Metro's hostname on port 8000. Visit `http://localhost:8081` or use the same hostname for both services. A web export can set `EXPO_PUBLIC_WEB_API_URL` when the API runs on another same-site origin. If the origins differ, include the exact web origin in `CORS_ORIGINS`. Web sessions use a same-site HttpOnly cookie. Native sessions use Expo SecureStore. A native development build must include the SecureStore module. Sign-out immediately hides private data. If a browser cannot confirm server sign-out, it keeps the sign-out pending across reloads and offers a retry. Native sign-out clears the local credential and reports an unconfirmed server sign-out if the server is unreachable.

The manual location picker reads the database village list. If the local database has no villages, use GPS. Seed data is optional and intended for an empty demo database.

## Citizen API

| Endpoint | Mobile use |
| --- | --- |
| `POST /api/citizen/validate-phone` | Check the national mobile number before showing the OTP prompt. |
| `POST /api/citizen/verify` | Verify the development OTP, create or retrieve an account, and start a session. |
| `GET /api/citizen/profile`, `PUT /api/citizen/profile` | Restore or edit the current profile and location. |
| `POST /api/citizen/sign-out` | Revoke the current session. |
| `GET /api/citizen/reports`, `POST /api/citizen/reports` | List owned reports and submit a report with an optional image. |
| `GET /api/citizen/reports/{reference}` and `…/{reference}/evidence` | Read an owned report and its private photo. |
| `POST /api/citizen/report-receipt` | Recover an owned receipt after an interrupted submission. |
| `GET /api/community/alerts?field_only=true&verified_only=true` | Read active, verified field alerts using a rounded submitted village center or a coarse GPS grid center. |
| `GET /api/community/villages` and `/api/community/guidelines` | Load supported villages, species, and safety guidance. |

See [reporting and public data](REPORTING_ASSUMPTIONS.md) for status mapping and alert sorting.

## Font assets

Inter and Fraunces were sourced from the Google Fonts repository's `ofl/inter` and `ofl/fraunces` directories and exported as static weights for consistent native rendering. The original SIL Open Font License notices are included beside the local font files. The leaf mark and app icons use the existing website artwork.

## Phase 2 lifecycle

My Reports and report details refresh every 10 seconds while active. They display the API's persisted lifecycle as Pending, Under Work, Rejected or Resolved. A rejection reason and an authority-confirmed species appear separately from original report fields. Nearby Alerts refreshes every 15 seconds while active and uses the existing distance check for both GPS and village profiles.

For Mac and phone startup, follow the [existing checkout instructions](../docs/setup.md#existing-macos-checkout-and-physical-phone-testing). Native acceptance still covers SecureStore after a full restart, expired sessions, failed sign-out, photo isolation during account switching, GPS, camera and gallery.
