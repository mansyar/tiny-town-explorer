# Tiny Town Explorers — Product Guidelines

## Brand Personality
A beloved toy, not a game: warm, chunky, calm, and endlessly patient.
Tiny Town Explorers should feel like a wooden toy box — pleasant to touch,
impossible to break, fun the hundredth time as the first.

## Visual Identity
- **Aesthetic:** Clean, vibrant low-poly 3D built from Kenney CC0 assets;
  soft daylight, gentle shadows, saturated pastels against a #87CEEB sky.
- **Palette:** Cheerful primaries for vehicles and mission objects (red,
  pink, green, blue); soft greens and creams for the town; high contrast
  between interactive elements and background.
- **UI elements:** Chunky, rounded, toy-like buttons; minimum 72×72px touch
  targets; generous spacing; large iconography readable by pre-readers.
- **Feedback visuals:** Expanding rings for taps, poof clouds for morphs,
  confetti for wins — feedback should be big, brief, and joyful.

## Iconography Rules
- Every concept in the game must be expressible as an icon or 3D visual cue
  — if it can't be, redesign the concept.
- Icons are drawn, not photographic; shapes must be recognizable at 48px.
- Sound is never the only channel: every audio cue has a simultaneous
  visual counterpart, so muted play communicates fully.

## Sound Personality
- Every interaction gets a sound; sounds are musical, soft-edged, and
  warm — never harsh, buzzy, or startling.
- Vehicle voices are characters: diesel rumble, chime jingle, gulp, siren
  boop. Repeated sounds stay pleasant (kids will hear them hundreds of
  times).
- Volume capped kid-safe; master mute always one tap away.

## Motion & Animation
- Squash-and-stretch toy physics: cars squish on bonks, bounce on honks,
  poof when morphing. Exaggerated and comedic, never rigid.
- Easing is bouncy and springy; nothing snaps or teleports except camera
  pans, which are smooth and short.
- No screen shake, no flashes, no horror-adjacent effects.

## UX Principles
- **Forgiving input:** generous hitboxes, infinite ground-plane raycast,
  newest tap wins, 0.5-unit dead-zone honk. A mistimed or grazing touch
  still produces something delightful.
- **No dead ends:** the kid can always act, always see their car, and
  always reach the next thing. The helper hand appears after 10s and
  demonstrates exactly one tap, then backs off.
- **Instant response:** every touch produces visible feedback within
  ~100ms, even if the full action takes longer.
- **No interruptions:** no modals, no lock screens, no dialogs that block
  play. Settings live behind the hold-3s parent gate.
- **Zero text:** no written words anywhere in-game, including the parent
  panel (icons only). Attribution text lives in the repo, not the UI.

## Emotional Safety
- Nothing can be lost, broken, or missed. Fires wait patiently; NPCs wait
  happily; litter never despawns with judgment.
- Failure states do not exist; "wrong" actions resolve as gentle comedy
  (the bonk) rather than errors.
