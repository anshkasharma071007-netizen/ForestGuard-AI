# Mobile reporting and public data

- Citizens submit a title, category, and either a supported village or a GPS location. Description and photo are optional. Unknown maps to the existing `unidentified` species ID. The server derives identity from the citizen session. Photos must be decodable JPEG, PNG, or WebP within the configured upload limit and 32 megapixels.
- The device stores a per-account retry key and salted draft fingerprint for interrupted submissions. Home recovers outstanding receipts and reads report history from the backend. Older anonymous references remain available through Home. They have no citizen owner.
- Pending and forwarded display as Pending. Verified displays as Under work. Rejected displays as Rejected. Closed or a verified report with a resolved incident displays as Resolved. The authority workflow keeps its existing states.
- Home refreshes reports and field alerts while active. A selected village uses the backend's affected-village filter. GPS uses a 25 km radius around the saved location. Distance estimates use rounded affected-village coordinates. Alerts without comparable coordinates have no distance estimate.
- The public feed uses the existing eligibility rules for generating verified alerts. It publishes coarse affected area data and no report titles, reporter details, private evidence, or incident coordinates.
