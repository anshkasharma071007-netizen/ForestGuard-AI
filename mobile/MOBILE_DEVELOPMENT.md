# Running the mobile app

In Terminal 1, from the ForestGuard-AI root, with the project's Python environment already installed:

```sh
source .venv/bin/activate
python -m alembic upgrade head
AI_MODE=auto python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

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

For browser development on the computer, the browser additionally needs permission from the backend’s existing `CORS_ORIGINS` environment setting. For example, start the backend with `CORS_ORIGINS=http://localhost:8081,http://127.0.0.1:8081` if Metro serves from port 8081. Use the exact scheme, host and port shown in your browser. Native requests do not use browser CORS.

## Public API compatibility

| Endpoint | Mobile use |
| --- | --- |
| `GET /api/health` | Settings checks actual service reachability and distinguishes a degraded response. It does not expose database diagnostics. |
| `GET /api/community/villages` | Home and incident village selection use server codes and labels. The client uses code, name and district only. |
| `GET /api/community/alerts?limit=50&field_only=true` | Alerts and Home show only entries explicitly marked as non-simulated. Home requests the selected village by code before the server limits the feed. The preview is limited to two matching items. |
| `GET /api/community/guidelines` | Supplies the species catalog and source-qualified general guidance. The app retains bundled fallback content. The backend describes its guidance as a summary for a demonstration region. The offline wording also makes no claim of official review. |
| `POST /api/community/reports` | Existing multipart submission, using canonical category and species IDs with optional image and either coordinates or village code. |
| `GET /api/community/reports/{reference_code}` | Reference lookup and saved-list refresh use the backend timestamps and canonical statuses. Only reference, status and timestamps persist. |

The public summary mixes field and simulated counts. Its village risk labels are derived from detections without a simulation filter or per-village provenance. The app therefore presents a truthful risk-unavailable state and uses the advisory feed independently. The existing public API does not supply a verified public map zone product. The app uses no official GIS endpoints, camera locations, patrol positions or precise wildlife locations.

The backend has no public list-by-user endpoint, and report POST does not return a submission timestamp. A reference is marked saved until status lookup supplies `created_at`. The Other species flow continues to use the supported Unknown ID and explicitly includes the custom name in the existing description field. The app saves a retry key before submission. Retrying the same draft retrieves its original reference. The Reports tab can recover the receipt after an interrupted response.

The type system and network client distinguish missing configuration or unsupported functionality, unreachable service, timeout, invalid input, not-found responses, server failure and invalid responses. Successful empty lists render as empty states.

## Font assets

Inter and Fraunces were sourced from the Google Fonts repository's `ofl/inter` and `ofl/fraunces` directories and exported as static weights for consistent native rendering. The original SIL Open Font License notices are included beside the local font files. The leaf mark and app icons use the existing website artwork.
