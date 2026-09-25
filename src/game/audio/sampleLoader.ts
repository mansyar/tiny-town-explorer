import type { AudioEngine, SampledSound } from './audioEngine';

export type SampleEntry = readonly [SampledSound, string];

/**
 * Optional samples never gate the game. One failed fetch or decode leaves that
 * sound silent; every other sample still loads and a later call can retry.
 */
export async function loadSamples(
  engine: Pick<AudioEngine, 'load'>,
  samples: readonly SampleEntry[],
): Promise<void> {
  await Promise.allSettled(samples.map(([id, url]) => engine.load(id, url)));
}
