/**
 * Where each sampled sound comes from.
 *
 * The clips are referenced through `?url` imports for the same reason the kits
 * are: only the sounds the game actually asks for are emitted and precached, so
 * the ~220 others in the two packs cost nothing.
 */
import bonkUrl from '../../assets/audio/bonk.mp3?url';
import cheerUrl from '../../assets/audio/cheer.mp3?url';
import chimeUrl from '../../assets/audio/chime.mp3?url';
import dropUrl from '../../assets/audio/drop.mp3?url';
import gulpUrl from '../../assets/audio/gulp.mp3?url';
import poofUrl from '../../assets/audio/poof.mp3?url';
import tapUrl from '../../assets/audio/tap.mp3?url';
import type { SampledSound } from './audioEngine';

/** Every sample the build ships, keyed by the sound the game asks for. */
export const SOUND_MODELS: Readonly<Record<SampledSound, string>> = {
  bonk: bonkUrl,
  cheer: cheerUrl,
  chime: chimeUrl,
  drop: dropUrl,
  gulp: gulpUrl,
  poof: poofUrl,
  tap: tapUrl,
};
