# Citizen authentication, location and push setup

## Backend settings

Set these values in the ignored environment profile used by FastAPI. Keep the same OTP secret across API workers and restarts.

```sh
.venv/bin/python -c 'import secrets; print(secrets.token_urlsafe(32))'
```

Copy the generated value into `CITIZEN_OTP_SECRET`. Set `BREVO_API_KEY`, `BREVO_SENDER_EMAIL` and `BREVO_SENDER_NAME` using a verified Brevo sender. Set `GEOAPIFY_API_KEY` in the same profile. Set `CITIZEN_DEV_OTP_ENABLED=false` for regular development and deployment. After provisioning Expo credentials and installing a test build, set `EXPO_PUSH_ENABLED=true`. If the EAS project enforces push access-token authentication, also set `EXPO_PUSH_ACCESS_TOKEN` in the backend profile. [Brevo transactional email](https://developers.brevo.com/reference/send-transac-email) · [Geoapify geocoding](https://apidocs.geoapify.com/docs/geocoding/) · [Expo push security](https://docs.expo.dev/push-notifications/sending-notifications/#additional-security)

For an existing citizen, independently verify their ownership of the legacy account and reserve their sign-in address before they sign up:

```sh
FOREST_GUARD_DB_MODE=cloud .venv/bin/python -m tools.link_citizen_email <citizen-id> --identity-verified
```

The tool prompts privately for the address. The citizen then verifies that address in the app. An address already used by another account requires manual review. The command retains the original citizen ID and owned reports, rejects conflicting addresses, and leaves the historical contact email as historical metadata. Omit `FOREST_GUARD_DB_MODE=cloud` for local PostgreSQL.

## Migration and runtime grants

For local PostgreSQL, run the initializer as the database owner.

```sh
.venv/bin/python -m tools.init_database --admin-user "$(id -un)"
```

For Supabase, apply Alembic as the owner through the existing private passfile.

```sh
env -u PGPASSWORD FOREST_GUARD_DB_MODE=cloud \
  FOREST_GUARD_MIGRATION_USER='postgres.<project-ref>' \
  FOREST_GUARD_MIGRATION_PASSFILE="$PWD/.forest-guard-local/supabase-owner.pgpass" \
  .venv/bin/alembic -x owner=1 upgrade 0010
```

Run the following SQL as the owner. Revision `0010` withdraws default Data API access to the four new tables. Existing table-level grants cover the new columns on the existing tables. The session lookup uses a row lock during device registration and preference updates.

```sql
BEGIN;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.citizen_otps, public.citizen_otp_limits,
  public.citizen_push_devices, public.citizen_push_deliveries
TO forest_guard_app;
GRANT UPDATE (auth_method) ON public.citizen_sessions TO forest_guard_app;
COMMIT;
```

If the runtime role has column-level grants, give it access to the new application columns.

```sql
GRANT SELECT (login_email, email_verified_at, contact_phone, location_label, alert_location_label, push_reports, push_nearby),
      INSERT (login_email, email_verified_at, contact_phone),
      UPDATE (login_email, email_verified_at, contact_phone, location_label, alert_location_label, push_reports, push_nearby)
ON public.citizens TO forest_guard_app;
GRANT SELECT (location_label), INSERT (location_label) ON public.sighting_reports TO forest_guard_app;
GRANT SELECT (auth_method), INSERT (auth_method) ON public.citizen_sessions TO forest_guard_app;
```

Run `FOREST_GUARD_DB_MODE=cloud .venv/bin/alembic current` and check that it reports `0010`. Restart FastAPI and check `/api/health` for `"database": "ok"`. For SQLite development, revision `0010` uses SQLite 3.53 or later to alter the phone constraint in place. Use a backup for rollback after creating email-only accounts. [SQLite ALTER TABLE](https://www.sqlite.org/lang_altertable.html#altertabaltercol)

## Android EAS and FCM

The Firebase Android client file is `mobile/google-services.json`. It matches Firebase project `forest-guard-ai-8bb71` and Android package `com.forestguardai.app`. Link the app to your EAS project and upload the Android client file as an EAS file variable.

```sh
cd mobile
npm ci
npx eas-cli@latest login
npx eas-cli@latest init
npx eas-cli@latest env:set --scope project --name GOOGLE_SERVICES_JSON \
  --type file --value ./google-services.json --visibility secret \
  --environment development --environment preview
```

If EAS asks you to edit the dynamic config manually, write the EAS project UUID to `expo.extra.eas.projectId` in `mobile/app.json`. Use the Expo project UUID from EAS.

In `mobile/.env`, set `EXPO_PUBLIC_API_URL` to the isolated development API origin reachable from the Android phone. Set the same variable in the EAS preview environment when preparing a standalone APK. Use its reachable HTTPS API origin.

```sh
npx eas-cli@latest env:set --scope project --name EXPO_PUBLIC_API_URL \
  --value 'https://<reachable-test-api-origin>' --visibility plaintext --environment preview
```

If the EAS project needs a dedicated FCM v1 service account, run these commands from a shell authenticated to Google Cloud with permission to create it. Keep the private key in a private directory outside the application and repository. The key is only for the EAS credentials upload.

```sh
gcloud auth login
gcloud services enable fcm.googleapis.com --project=forest-guard-ai-8bb71
gcloud iam service-accounts create expo-fcm \
  --display-name='Forest Guard AI Expo push' --project=forest-guard-ai-8bb71
gcloud projects add-iam-policy-binding forest-guard-ai-8bb71 \
  --member='serviceAccount:expo-fcm@forest-guard-ai-8bb71.iam.gserviceaccount.com' \
  --role='roles/firebasecloudmessaging.admin'
install -d -m 700 "$HOME/.forest-guard-credentials"
(umask 077
gcloud iam service-accounts keys create "$HOME/.forest-guard-credentials/expo-fcm.json" \
  --iam-account='expo-fcm@forest-guard-ai-8bb71.iam.gserviceaccount.com' \
  --project=forest-guard-ai-8bb71)
npx eas-cli@latest credentials --platform android
```

Select the `development` build profile and **Google Service Account** → **Manage your Google Service Account Key for Push Notifications (FCM V1)** → **Set up a Google Service Account Key for Push Notifications (FCM V1)** → **Upload a new service account key**. Provide the path outside the repo. Select the existing upload if the package already has a working FCM v1 key in EAS. [Expo FCM v1 credentials](https://docs.expo.dev/push-notifications/fcm-credentials/) · [EAS environment variables](https://docs.expo.dev/eas/environment-variables/manage/) · [Google Cloud FCM IAM roles](https://docs.cloud.google.com/iam/docs/roles-permissions/firebasecloudmessaging)

For the physical-device test, start a development build when ready, install the resulting APK, and launch Metro.

```sh
npx eas-cli@latest build --platform android --profile development
npx expo start --dev-client --lan
```

When ready for the standalone internal APK, use `npx eas-cli@latest build --platform android --profile preview`.

## Physical-device verification

1. Sign in with a real email code. Restart the installed app and confirm SecureStore restores the session. Sign in on a second device and verify both sessions see the same profile and owned reports.
2. Test first-time GPS permission, a declined prompt, permanent denial and **Open Settings**, and Android's location-services prompt. Search for an Indian landmark, adjust the pin on the map, confirm the label, and submit a report. Check the authority review and jurisdiction. Exercise camera, gallery and reference copy while using this build.
3. In **Profile**, enable report and nearby push preferences, allow Android notifications, and use a saved monitoring location and radius. Trigger approval, rejection and resolution. Receive and tap notifications with the app backgrounded and closed. Confirm report taps open the owned report and nearby taps open the risk map.
4. Use a second account outside the chosen radius. Confirm it receives no nearby notification. Sign out, switch accounts on the same phone, and check that old taps and report photos remain inaccessible. Test sign-out while disconnected and retry after reconnecting.
