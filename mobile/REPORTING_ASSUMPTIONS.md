# Mobile reporting and public data

- Submit a supported species ID (or `unidentified`), a reporter name, a 12–4,000 character description and either a known village code or valid GPS coordinates. Optional photos must be decodable JPEG, PNG or WebP images within the configured upload limit and 32 megapixels.
- A keyed multipart POST returns the report reference, review status and confirmation. The device stores a retry key and salted draft fingerprint until it can save the receipt. History stores references, statuses and timestamps. Open Reports to recover an interrupted receipt and refresh statuses.
- Review statuses are `pending`, `forwarded`, `verified`, `rejected` and the legacy `closed`. The reference lookup supplies the server creation time. The last check time is local to the device.
- Only verified report incidents can generate public advisories. Home requests field alerts for the selected village. The Alerts tab and its badge use the same feed and refresh every ten seconds. Select “Show all villages” to clear the area filter.
- Development uses the Expo host on port 8000 by default. Set `EXPO_PUBLIC_API_URL` for a deployed API, a physical device on a different network, or custom ports. See [mobile development](MOBILE_DEVELOPMENT.md).
