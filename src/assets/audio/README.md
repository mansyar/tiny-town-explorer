# Vendored sound — Kenney CC0 packs

Every clip here is CC0 1.0 (public domain). Attribution is not required, but the
provenance is recorded so a pack can be re-downloaded, re-cut or audited later,
exactly as `src/assets/kits/README.md` does for the model kits.

| Pack | Version | Downloaded | Source | Role |
| --- | --- | --- | --- | --- |
| Impact Sounds | 1.0 | 2026-09-21 | https://kenney.nl/assets/impact-sounds | the bonk off a prop or a wall |
| Interface Sounds | 1.0 | 2026-09-21 | https://kenney.nl/assets/interface-sounds | taps, the morph poof, the trash gulp, the cone drop, the mission chime and the win |
| Some sounds | 2024-08-22 | 2026-09-21 | https://opengameart.org/content/some-sounds-0 | the car's engine loop |

Each pack's `LICENSE.txt` is the copy shipped inside its archive, kept beside the
clips as `LICENSE-impact-sounds.txt` and `LICENSE-interface-sounds.txt`.

## Why the clips are MP3, not the Ogg the packs ship

Both packs ship Ogg Vorbis, and iOS Safari does not decode Ogg Vorbis — on the
performance-floor device the audio would simply never play. Each clip the game
uses was therefore transcoded from the pack's original to mono 44.1 kHz MP3,
with loudness normalisation so a bonk and a chime land at the same perceived
level (`ffmpeg -i <clip>.ogg -ac 1 -ar 44100 -af loudnorm=I=-19:TP=-2:LRA=8
-c:a libmp3lame -b:a 96k <name>.mp3`). The packs themselves are untouched; the
MP3s are the only files committed, and the clips are the only files committed —
the remaining ~220 sounds in the two packs are not vendored.

`engine-loop.wav` is the exception to the transcode: it is a loop, and MP3
encoder padding would leave a gap (and an audible click) at the loop point, so
it stays uncompressed PCM. It is the one file here that is not from a Kenney
pack: `motorseamless01.wav` from **Some sounds** by
[Ziph](https://opengameart.org/content/some-sounds-0), released CC0. The pack
describes its car engine as *"slightly cartoonish"* and *synthesized*, meant to
be pitch-bent by rpm — which is exactly how this engine is driven.
`motorseamless01` is the darkest of the pack's thirteen pitch variants, which
leaves the engine room to rise rather than start bright. It was mixed to mono
44.1 kHz and peak-normalised to −6 dBFS, with no compression or dynamics so the
loop point stays clean.

## Cost

Eight clips, 368 KiB in total — nearly all of it the engine loop, which is the
one sound that plays continuously. As with the models, they are referenced through
`?url` imports in `src/game/audio/audioRegistry.ts`, so only the sounds the game
actually asks for are emitted and precached.

| Clip | From | Used for |
| --- | --- | --- |
| `bonk.mp3` | Impact Sounds `impactSoft_medium_000` | the bump off a prop or a building |
| `chime.mp3` | Interface Sounds `bong_001` | the fire alarm that calls a mission |
| `cheer.mp3` | Interface Sounds `confirmation_001` | a mission resolved |
| `drop.mp3` | Interface Sounds `drop_001` | the ice-cream truck's cones |
| `engine-loop.wav` | OpenGameArt *Some sounds* `motorseamless01` | the engine, pitched by the car's speed |
| `gulp.mp3` | Interface Sounds `drop_002` | the garbage truck's gulp |
| `poof.mp3` | Interface Sounds `switch_003` | the morph between vehicles |
| `tap.mp3` | Interface Sounds `select_002` | a tap that becomes a destination |
