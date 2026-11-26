# Photo identification for mobile reports

## Current integration

Forest Guard Web and mobile use the same public report POST, status lookup and canonical species IDs. The mobile selector loads `GET /api/community/guidelines` (the same source as the web community portal), with a checked-in fallback matching its current six species. The report endpoint also accepts `unidentified` but rejects arbitrary names. The Other option explicitly asks the reporter to submit as Unknown and append a labeled species name to the existing description. The original description must still meet the 12-character minimum and the combined text must fit within the 4,000-character server limit. There is no extra multipart field.

The prior preview used React Native Image’s default cover behavior in a 190-point-high frame. The picker did not set editing or an aspect ratio. The new picker explicitly disables editing and preserves the returned photo for upload. iOS requests the current asset representation where possible, and the picker or OS may still transcode some formats. The inline preview and full-screen viewer use contain. Any future annotated image URI lives in the analysis result and never replaces the original attachment in report submission.

The app follows the website’s leaf mark and forest, lime and neutral colors. Its headings, body and reference codes follow the website’s serif, sans-serif and monospace roles using local fallbacks on devices without Fraunces, Inter or JetBrains Mono.

## Existing inference pipeline

- The official guard-only upload route in `backend/api/routes_core.py` accepts multipart `file` plus optional `camera_code` and notes. It validates/stores media and calls `ai_engine/detector.py`. If the camera is absent or unresolved it selects an existing camera. Each accepted model output becomes a detection linked to that camera and its coordinates. The route rebuilds tracks, recalculates risk and synchronizes alerts after writing detections. It is unsuitable for anonymous mobile uploads.
- YOLO-World v2 localizes animals. The engine filters small and overlapping boxes and runs CLIP ViT-B/32 zero-shot classification on padded crops using regional species and negative prompts. Weak classifications can yield unidentified animals. A high-scoring full-frame classification can survive when no localized result does. It is flagged classification-only even though the existing result supplies a whole-frame rectangle. There can also be no accepted result. These are model scores, not field verification or calibrated probabilities. Demo mode disables live inference.
- Results include original-pixel `bbox` in xyxy order, canonical `species`, combined `confidence`, component model scores, top alternatives, and localization/certainty flags. The official response supplies original and annotated media URLs and saved records separately. The drawing helper can resize the raster and add boxes, labels and a footer. That annotated raster is a derivative, not the coordinate space for client overlays.
- The model call can be separated from official writes. The engine’s `analyze_image` supports `save_annotated=False` and has no database dependency. A separate service can run that method on temporary media, strip out the official upload route entirely, and translate the result for mobile. Camera position can never be inferred from a public upload.

## Proposed next-phase public API

**Proposed only.** `POST /api/community/photo-identifications`, multipart `image` (one image). No camera, name, report reference or coordinates are required. The user explicitly opts in to sending the photo for analysis. The response returns no official record IDs and does not create a report. Disabling or failing analysis must leave manual reporting available.

| Response field | Contract |
|---|---|
| `outcome` | `detected` if there is at least one accepted supported suggestion, `uncertain` when animal evidence exists but none is confidently supported, or `no_detection` when there is no usable result. |
| `image` | Width and height of the decoded upright source raster after EXIF orientation normalization. The inference and display must use the same upright orientation. |
| `animals[]` | Stable per-response ID, `species_id` (canonical ID or null), certainty (`detected`, `uncertain`, `unsupported`), `bbox` (upright source pixels, xyxy, or null for classification-only), optional `score` (finite [0,1] model score), and ranked `alternatives` (canonical IDs and optional scores). Return an empty array for no detection. |
| `annotated_image_url` | Optional short-lived, access-controlled derivative. Overlays can instead render locally and this field can be omitted. |
| Errors | Stable client-safe error code and message. Use 413 for excessive image size, 415 for unsupported encoding, 422 for invalid image, 429 for throttling, and 503 when inference is unavailable. |

The mobile interface provides idle, analyzing, detected, uncertain, no-detection and error render states. It draws real localized boxes using the contain scale and letterbox offsets, clips boxes to the image, and pairs them with numbered animal results. With multiple animals, choosing a result updates the focused box and ranks relevant catalog suggestions and alternatives. Users explicitly select or override the species for the report; the current report takes just one canonical species. Unknown or Other handles unsupported wildlife. Full-frame classifications can supply suggestions without a box. Nothing is analyzed or displayed as an AI result today.

The current closed-set classifier cannot reliably name out-of-catalog wildlife. Map weak or negative predictions to uncertain; return unsupported only when there is evidence for that classification. Treat a no-detection result as inconclusive, not as evidence that the location is safe. Reject stale responses when the user removes or replaces a photo.

## Required backend work

Create a separate public analysis handler with no camera lookup or writes to official detection, incident, alert, tracking or risk data. Reuse the loaded scorer in bounded workers with queue/concurrency, request limits and timeouts. Rate-limit anonymous use with short-lived request/session tokens or another abuse control. Accept only validated decodable image formats, bound bytes and decoded pixels, normalize orientation before scoring, and remove metadata from any derivative. Clean up temporary originals and outputs on success and failure, avoid public report-media URLs for analysis, and disclose upload retention. Convert the existing flags and scores to the proposed outcome schema, test the coordinate convention on rotated and letterboxed images and evaluate model thresholds before public use. The report POST remains a separate, user-confirmed operation.
