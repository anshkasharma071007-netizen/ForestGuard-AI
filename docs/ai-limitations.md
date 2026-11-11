# AI design, evaluation and limitations

## What the engine is

Two off-the-shelf models run locally on CPU, with no cloud inference and no fine-tuning:

| Stage | Model | Role |
| --- | --- | --- |
| 1 · Localisation | Ultralytics **YOLO-World v2** (`yolov8s-worldv2.pt`) | Open-vocabulary detection with the single class `animal` |
| 2 · Classification | OpenAI **CLIP ViT-B/32** | Zero-shot species scoring of each crop against text prompts |

Six regional species are supported: Bengal tiger, Indian leopard, Asian elephant, sloth bear,
wild boar and chital (spotted deer), plus an explicit **unidentified** outcome.

### Prompts

Each species has three text prompts (e.g. *"Bengal tiger"*, *"tiger walking in an Indian
forest"*, *"Panthera tigris"*) to improve zero-shot retrieval without over-claiming classes.
Negative prompts describe empty forest, vehicles and people. Similarity to all prompts is
softmaxed together; per-species scores are the mean of their prompt probabilities, renormalised
across species. If the negative mass exceeds 85 % of the species mass, the crop is vetoed to
`unidentified` rather than assigning the least-bad species.

### Decision floors

| Rule | Default | Effect |
| --- | --- | --- |
| Detector confidence | 0.15 | Boxes below this are dropped |
| Minimum box area | 0.8 % of frame | Rejects tiny spurious boxes |
| Box cap | 6 per frame | Highest-confidence boxes after IoU > 0.55 de-duplication |
| Species floor | 0.45 | Crop is stored as `unidentified` rather than forced into a class |
| Combined floor | 0.50 | `0.55 × species + 0.45 × detector`; below it a low-detector box is dropped, a strong one becomes `unidentified` |
| Full-frame path | 0.62 | Used when a crop fills most of the frame, where CLIP crops are less reliable |

A low-confidence result is a **feature**, not a failure: the UI records "unidentified" and asks
for human verification. The system never silently upgrades a weak crop to a dangerous species.

### Video

Short videos are sampled at up to five frames and each frame is analysed independently. This is
**not** temporal tracking, re-identification or a continuous feed.

### Runtime

- Models load lazily on the first upload and stay resident (one process-wide engine behind a
  lock, so concurrent uploads serialise rather than double-loading).
- Recorded load time on the development CPU: **5.16 s**; six images analysed in **1.8 s** total.
- Uploads are capped at 25 MB and accepted types are JPEG/PNG/WebP and MP4/MOV/AVI/WebM.
- If torch/ultralytics/clip are missing, or `AI_MODE=demo`, uploads return HTTP **503** with an
  explanatory message. No fake detection is returned.

## What was actually measured

`tools/evaluate_species.py` ran the production engine over the six licenced reference photos in
`demo_data/wildlife_images/` — one image per species:

| Image | Expected | Predicted | Detector | Species | Overall |
| --- | --- | --- | --- | --- | --- |
| `tiger.jpg` | tiger | tiger | 0.41 | 0.97 | 0.71 |
| `leopard.jpg` | leopard | leopard | 0.45 | 1.00 | 0.75 |
| `elephant.jpg` | elephant | elephant | 0.66 | 1.00 | 0.85 |
| `bear.jpg` | sloth bear | sloth bear | 0.80 | 0.99 | 0.90 |
| `boar.jpg` | wild boar | wild boar | 0.59 | 1.00 | 0.81 |
| `deer.jpg` | deer | deer | 0.62 | 1.00 | 0.83 |

Overall confidence is the engine's combined score; detector and species columns are the two
stages. Note the tiger frame: the detector was only 0.41 confident but the species stage was
0.97 — a reminder that the two stages fail differently.

Result: **6/6 top-1**, 1.8 s for six images. Raw output:
[`docs/references/ai_smoke_evaluation.json`](references/ai_smoke_evaluation.json).

### Why this is not an accuracy claim

- **One image per class.** There is no test set, no train/test split and no stratification.
- **Curated, well-lit photographs.** They are high-resolution Wikimedia images of an obvious
  subject — far easier than IR night frames, motion blur, partial occlusion or distant animals.
- **The same six images are used as demo assets.** The pipeline was built against them; this is
  a regression smoke check ("does the plumbing work end-to-end"), not held-out evaluation.
- The JSON summary is labelled accordingly and the UI/demo script avoid quoting a percentage.

Do not cite "100 % accuracy" from this. The honest statement is: *the pipeline localises and
classifies six reference species correctly, and its behaviour on real camera-trap imagery is
untested.*

## Known failure modes

| Failure | Why | Mitigation in this build |
| --- | --- | --- |
| Leopard ↔ tiger confusion | Similar coats, low light | Both are high risk; species confidence is shown; low-confidence → unidentified |
| Missed small/distant animals | Detector floor and box-area filter | 0.15 floor is already permissive; further lowering increases false positives |
| Empty-frame false positives | Open-vocabulary detector accepts generic "animal" | Negative prompts, full-frame floor, human verification |
| Night/IR imagery | Models trained mostly on RGB | Not claimed; would need thermal/IR fine-tuning |
| Multiple animals in frame | Classifier scores each crop; tracks are not individual identities | Each box is a separate detection; no re-identification |
| Species not in the six | Zero-shot vocabulary is limited | Recorded as unidentified, not as the closest match |
| Video motion | Five sampled frames, no tracker | No continuous tracking claim |

## Dataset evaluation plan (not yet done)

A defensible evaluation would need:

1. a **licenced open camera-trap dataset** with regional species — e.g. LILA BC / Snapshot
   Serengeti-style collections, or an Indian camera-trap archive with permission;
2. species-level **train/val/test splits by camera location**, not by image, to avoid leakage;
3. stratified reporting for day/night, IR, occlusion and distance;
4. precision/recall per species at a fixed operating threshold, plus a confusion matrix;
5. calibration analysis, because CLIP softmax is not a calibrated probability.

Only after that should any accuracy figure appear in a deck or report. The harness in
`tools/evaluate_species.py` accepts an `--images` folder with filename-based labels, so it can be
pointed at such a dataset once one is available and licence-compatible.

## Model and data provenance

- YOLO-World v2 weights: Ultralytics, AGPL-3.0 (check licence obligations before redistribution).
- CLIP ViT-B/32: OpenAI CLIP, MIT licence for the code; weights downloaded at runtime.
- Reference photographs: CC BY-SA / CC BY-SA-compatible, attributed per image in
  [image-credits.md](image-credits.md).
- No private datasets, API keys or restricted surveillance data are included.

## What the AI is *not* doing

- It is not a real-time camera network; there are no connected feeds.
- It is not identifying individual animals.
- It is not predicting where an animal will go next. Risk scores prioritise verification.
- It is not a validated field system, and it is not a substitute for forest department judgment.
