# Vendored sound — Kenney CC0 packs

Every clip here is CC0 1.0 (public domain). Attribution is not required, but the
provenance is recorded so a pack can be re-downloaded, re-cut or audited later,
exactly as `src/assets/kits/README.md` does for the model kits.

| Pack | Version | Downloaded | Source | Role |
| --- | --- | --- | --- | --- |
| Impact Sounds | 1.0 | 2026-09-21 | https://kenney.nl/assets/impact-sounds | the bonk off a prop or a wall |
| Interface Sounds | 1.0 | 2026-09-21 | https://kenney.nl/assets/interface-sounds | taps, the morph poof, the trash gulp, the cone drop, the mission chime and the win |

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

## Cost

Seven clips, 23.5 KiB in total. As with the models, they are referenced through
`?url` imports in `src/game/audio/audioRegistry.ts`, so only the sounds the game
actually asks for are emitted and precached.

| Clip | From | Used for |
| --- | --- | --- |
| `bonk.mp3` | Impact Sounds `impactSoft_medium_000` | the bump off a prop or a building |
| `chime.mp3` | Interface Sounds `bong_001` | the fire alarm that calls a mission |
| `cheer.mp3` | Interface Sounds `confirmation_001` | a mission resolved |
| `drop.mp3` | Interface Sounds `drop_001` | the ice-cream truck's cones |
| `gulp.mp3` | Interface Sounds `drop_002` | the garbage truck's gulp |
| `poof.mp3` | Interface Sounds `switch_003` | the morph between vehicles |
| `tap.mp3` | Interface Sounds `select_002` | a tap that becomes a destination |
