"""Species taxonomy used by detection, risk scoring, and the dashboard.

Only the species supported by the demonstration pipeline are listed. The
classifier can return "unidentified" when confidence is low. The pipeline has
not been benchmarked on a labelled field dataset; see docs/ai-limitations.md.
"""
from __future__ import annotations

SPECIES: dict[str, dict] = {
    "tiger": {
        "name": "Bengal tiger",
        "scientific": "Panthera tigris tigris",
        "risk_weight": 1.0,
        "color": "#C2410C",
        "accent": "#FB923C",
        "image": "tiger.jpg",
        "prompt": "Bengal tiger",
        "threat": "Large carnivore · high conflict potential",
        "description": "Apex predator. Camera detections near habitation trigger the highest "
        "priority review because of livestock and human-safety risk.",
        "advice": "Do not approach or chase the animal. Move indoors in groups, illuminate "
        "paths, and inform the forest helpline immediately.",
    },
    "leopard": {
        "name": "Indian leopard",
        "scientific": "Panthera pardus fusca",
        "risk_weight": 0.86,
        "color": "#B45309",
        "accent": "#FCD34D",
        "image": "leopard.jpg",
        "prompt": "Indian leopard",
        "threat": "Large carnivore · edge specialist",
        "description": "Leopards frequently use forest edges and agricultural land, making "
        "buffer-zone detections especially relevant for village safety.",
        "advice": "Keep children and livestock supervised after dusk. Never corner an animal; "
        "report sightings rather than intervening.",
    },
    "elephant": {
        "name": "Asian elephant",
        "scientific": "Elephas maximus",
        "risk_weight": 0.9,
        "color": "#475569",
        "accent": "#94A3B8",
        "image": "elephant.jpg",
        "prompt": "Asian elephant",
        "threat": "Megaherbivore · crop and infrastructure conflict",
        "description": "Elephant movements can cross crop fields and roads. Early warning "
        "helps villages secure grain, avoid night travel, and prevent retaliation.",
        "advice": "Stay clear of the herd and do not use firecrackers or flashlights. Avoid "
        "blocking known movement corridors.",
    },
    "deer": {
        "name": "Chital (spotted deer)",
        "scientific": "Axis axis",
        "risk_weight": 0.18,
        "color": "#15803D",
        "accent": "#4ADE80",
        "image": "deer.jpg",
        "prompt": "chital spotted deer",
        "threat": "Prey species · low direct conflict risk",
        "description": "Abundant prey. Chital activity is a useful indicator of predator "
        "presence and overall habitat use, but is not itself a safety threat.",
        "advice": "No special action required. Report unusual aggregations or distress calls.",
    },
    "wild_boar": {
        "name": "Wild boar",
        "scientific": "Sus scrofa",
        "risk_weight": 0.52,
        "color": "#7C2D12",
        "accent": "#FDBA74",
        "image": "boar.jpg",
        "prompt": "wild boar",
        "threat": "Omnivore · crop damage",
        "description": "Frequently raids crops at forest edges. Detections close to fields "
        "inform crop-protection advisories rather than emergency alerts.",
        "advice": "Do not corner or feed the animal. Secure compost and crop storage; travel "
        "in groups after dark.",
    },
    "sloth_bear": {
        "name": "Sloth bear",
        "scientific": "Melursus ursinus",
        "risk_weight": 0.8,
        "color": "#3F3F46",
        "accent": "#A1A1AA",
        "image": "bear.jpg",
        "prompt": "sloth bear",
        "threat": "Large omnivore · defensive encounters",
        "description": "Mostly insectivorous but can react aggressively when surprised. "
        "Detections near trails and villages are flagged for precautionary review.",
        "advice": "Make noise while walking, never run, and back away slowly if encountered. "
        "Keep distance from fruiting trees at night.",
    },
    "unidentified": {
        "name": "Unidentified animal",
        "scientific": "—",
        "risk_weight": 0.35,
        "color": "#64748B",
        "accent": "#CBD5E1",
        "image": "forest.jpg",
        "prompt": "",
        "threat": "Species not confidently classified",
        "description": "The detector localised an animal but the classifier confidence was "
        "below the review threshold. Manual verification is required.",
        "advice": "Treat with general wildlife caution until the record is verified.",
    },
}

SPECIES_ORDER = ["tiger", "leopard", "elephant", "sloth_bear", "wild_boar", "deer"]

# Prompt aliases improve zero-shot retrieval without over-claiming classes.
SPECIES_PROMPTS = {
    "tiger": ["Bengal tiger", "tiger walking in an Indian forest", "Panthera tigris"],
    "leopard": ["Indian leopard", "leopard resting in a rocky landscape", "Panthera pardus"],
    "elephant": ["Asian elephant", "Indian elephant walking in a forest", "Elephas maximus"],
    "deer": ["chital spotted deer", "spotted deer in an Indian forest", "Axis axis"],
    "wild_boar": ["wild boar", "wild pig in a forest understory", "Sus scrofa"],
    "sloth_bear": ["sloth bear", "Indian sloth bear with shaggy fur", "Melursus ursinus"],
}

NEGATIVE_PROMPTS = [
    "an empty forest scene with no animal",
    "a landscape with trees and grass only",
]


def species_meta(key: str) -> dict:
    return SPECIES.get(key, SPECIES["unidentified"])
