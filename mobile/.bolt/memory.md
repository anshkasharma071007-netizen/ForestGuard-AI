# Project memory

## Product intent & audience

- Forest Guard AI mobile app: public-facing companion to an existing wildlife conservation web dashboard for forest officials.
- Target users: citizens living near forest areas.
- Core purposes: view nearby wildlife risks, receive official safety advisories, report sightings/conflicts, track submitted reports.
- Prioritize Android while maintaining iOS compatibility.

## Brand personality & voice

- Earthy, editorial, restrained, professional.
- Public safety utility tone — not marketing.
- No motivational slogans, oversized welcome text, fake statistics, or decorative excess.

## Visual design & UX direction

- Themes: light/dark/system with centralized tokens.
  - Light: bg `#F4F1E8`, cards `#FBFAF5`, inputs `#FFFFFF`, primary text `#17211B`, secondary `#374038`, muted `#656B64`, borders `#E4DFD1`, primary action `#0C2418`.
  - Dark: bg `#171F1B`, cards `#1F2A24`, inputs `#27342D`, primary text `#E1E8DF`, secondary `#C2CDC2`, muted `#AAB8AD`, borders `#3B4B41`, primary action `#3B5848`.
  - Brand: Forest `#0C2418`, Deep forest `#081A12`, Lime `#C4E87A`, Moss `#7FA36B`, Clay `#B85C38`, Amber `#D9A441`.
- Typography: Fraunces (headings/branding), Inter (body/controls), JetBrains Mono (codes/coordinates). Body 15–16, headings 24–28, supporting 12–14.
- Components: screen margins 16, card radius 16, button/input radius 12, 4-point spacing scale, min touch targets 48×48, Lucide icons, restrained shadows + thin borders.
- Bottom nav: deep forest with lime active indicators.
- Splash: brief branded screen → Home directly (no login/onboarding).
- Tabs: Home, Risk Map, Alerts, Settings.
- Prefer compact, accessible, functional layouts. Avoid gradients, glassmorphism, stock photos, excessive cards/badges/pills, unnecessary animations, repeated content, generic AI patterns.

## Decisions, constraints & rationale

- Expo + React Native + TypeScript; Expo Router for navigation. Not a web app or WebView.
- Minimal Expo-compatible dependencies only.
- Centralized API service prepared with `EXPO_PUBLIC_API_URL`; FastAPI backend connected later — no backend/database/auth/Firebase/Supabase created now.
- Initial scope: app scaffold, branding/design system, complete Home screen, working bottom nav, light/dark themes, basic scaffolds for Risk Map, Alerts, Settings, Report Submission, Report History, Safety Guidelines.
- Deferred: map integrations, camera, backend requests, push notifications, report submission logic.
- Demonstration data used centrally until backend is connected.
- Project passes TypeScript checks and exports for web preview.

## Open questions & assumptions

- Exact Home "nearby wildlife advisory" content structure may need refinement once backend schema is known.
- Report submission fields/form flow unspecified for next stage.
- Map provider/library choice pending for Risk Map implementation.
- Push notification strategy and advisory delivery mechanism TBD.
- Offline support requirements unspecified.