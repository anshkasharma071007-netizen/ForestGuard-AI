# Reporting assumptions

- Demonstration villages are Turia (`PEN-TUR`), Khamarpani (`PEN-KHA`), and Sillari (`PEN-SIL`). These values are placeholders until the FastAPI service provides the official village list.
- Demonstration species are Tiger, Leopard, Elephant, Sloth bear, Wild boar, and Unknown. The selected label is sent as the `species` value.
- The report service returns JSON with `reference_code`, `status`, and `message`. Supported statuses are `pending`, `forwarded`, and `closed`.
- Latitude and longitude are included only when both are captured from the device. The selected village code is always included.
- Local history stores only reference code, status, and submission date. Personal details and report descriptions are not persisted locally.
