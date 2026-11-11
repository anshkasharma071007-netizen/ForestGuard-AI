# Image credits and licences

All photographs are from Wikimedia Commons under Creative Commons licences that permit reuse
with attribution. Only resizing, JPEG/WebP re-encoding and (for the annotated demonstration
frames) crop/mirror/contrast variant generation plus model-drawn boxes were applied. No image
was generated or altered to misrepresent a real event.

Machine-readable provenance: [`docs/references/image_credits.json`](references/image_credits.json).

## Wildlife reference photographs

| Species | App file | Original | Author | Licence |
| --- | --- | --- | --- | --- |
| Bengal tiger | `frontend/public/images/tiger.jpg` | [Bengal tiger (Panthera tigris tigris) female 3 crop](https://commons.wikimedia.org/wiki/File:Bengal_tiger_(Panthera_tigris_tigris)_female_3_crop.jpg) | Charles J. Sharp | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| Indian leopard | `frontend/public/images/leopard.jpg` | [Indian leopard in Jawai Bandh April 2025](https://commons.wikimedia.org/wiki/File:Indian_leopard_in_Jawai_Bandh_April_2025_by_Tisha_Mukherjee_02.jpg) | Tisha Mukherjee | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| Asian elephant | `frontend/public/images/elephant.jpg` | [Elephas maximus (Bandipur)](https://commons.wikimedia.org/wiki/File:Elephas_maximus_(Bandipur).jpg) | Yathin S Krishnappa | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) |
| Chital (spotted deer) | `frontend/public/images/deer.jpg` | [004 Chital in Keoladeo National Park](https://commons.wikimedia.org/wiki/File:004_Chital_in_Keoladeo_National_Park_Photo_by_Giles_Laurent.jpg) | Giles Laurent | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| Sloth bear | `frontend/public/images/bear.jpg` | [Sri Lankan sloth bear (Melursus ursinus inornatus) male 1](https://commons.wikimedia.org/wiki/File:Sri_Lankan_sloth_bear_(Melursus_ursinus_inornatus)_male_1.jpg) | Charles J. Sharp | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| Wild boar | `frontend/public/images/boar.jpg` | [Wild Boar Habbitat 3](https://commons.wikimedia.org/wiki/File:Wild_Boar_Habbitat_3.jpg) | Richard Bartz, Munich Makro Freak | [CC BY-SA 2.5](https://creativecommons.org/licenses/by-sa/2.5/) |
| Forest cover image | `frontend/public/images/forest.jpg` | [Pench jungle road](https://commons.wikimedia.org/wiki/File:Pench_jungle_road_by_Ananth_T.jpg) | Anantht84 | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| Camera-trap reference | used for context in demo assets | [Camera trap damaged by elephants in Pakke Tiger Reserve](https://commons.wikimedia.org/wiki/File:Camera_trap_damaged_by_elephants_in_Pakke_Tiger_Reserve.JPG) | Nandini Velho | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) |

The sloth bear reference is the Sri Lankan subspecies (*Melursus ursinus inornatus*); the app
labels the class at species level as "Sloth bear" (*Melursus ursinus*). It is a visual reference
for zero-shot classification, not a claim that the subspecies occurs in the study area.

## Derived demonstration evidence

`demo_data/detection_images/*_annotated.jpg` are derived from the reference photographs above:

- variant 1 is the original photograph with bounding boxes and labels drawn by the local AI
  engine;
- variant 2 is a 6 % crop, horizontal mirror, slight contrast increase, then the same model
  annotation.

These images illustrate the *appearance* of a detection in the UI. The detection **events**
they are attached to in the seeded dataset are synthetic; the images are not real camera-trap
occurrences and must not be presented as such.

## Basemap and libraries

- Basemap tiles: © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright),
  available under the Open Database License. Tiles are requested from
  `tile.openstreetmap.org` at runtime; no tiles are redistributed in this repository.
- Map rendering: [Leaflet](https://leafletjs.com/) (BSD-2-Clause) and
  [Leaflet.markercluster](https://github.com/Leaflet/Leaflet.markercluster) (MIT).
- Charts: [Recharts](https://recharts.org/) (MIT).
- Icons: [Lucide](https://lucide.dev/) (ISC).
- Fonts: Fraunces, Inter and JetBrains Mono, served via Google Fonts under the SIL Open Font
  License.
- Models: YOLO-World v2 (Ultralytics, AGPL-3.0) and CLIP ViT-B/32 (OpenAI, MIT for code;
  weights downloaded at runtime). Check licence obligations before redistributing weights.

## If you reuse this repository

Keep this file, the CC BY-SA notices and the OpenStreetMap attribution. CC BY-SA requires
attribution and share-alike for adapted images; if you replace the photographs, update
`docs/references/image_credits.json` and this table together.
