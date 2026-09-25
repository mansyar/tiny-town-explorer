import { describe, expect, it, vi } from 'vitest';
import { createAudioEngine, type SampledSound } from './audioEngine';
import { loadSamples } from './sampleLoader';

type SampleEntry = readonly [SampledSound, string];

const entries: readonly SampleEntry[] = [
  ['tap', 'tap.mp3'],
  ['bark', 'bark.mp3'],
];

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((onValue, onReason) => {
    resolve = onValue;
    reject = onReason;
  });
  return { promise, resolve, reject };
}

function fakeContext(starts: { count: number }): AudioContext {
  const gainNode = () => ({
    gain: {
      value: 0,
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      setTargetAtTime: vi.fn(),
    },
    connect: vi.fn(),
  });
  return {
    state: 'running',
    currentTime: 0,
    sampleRate: 44100,
    destination: {},
    resume: vi.fn(async () => undefined),
    createGain: gainNode,
    createOscillator: () => ({
      type: 'sine',
      frequency: { value: 0 },
      connect: vi.fn(),
      start: () => {
        starts.count += 1;
      },
      stop: vi.fn(),
    }),
  } as unknown as AudioContext;
}

describe('optional sample loading', () => {
  it('settles when one sample rejects', async () => {
    const load = vi.fn(async (id: SampledSound) => {
      if (id === 'tap') {
        throw new Error('decode failed');
      }
    });

    await expect(loadSamples({ load }, entries)).resolves.toBeUndefined();
    expect(load.mock.calls.map(([id]) => id)).toEqual(['tap', 'bark']);
  });

  it('leaves no unhandled rejection when a sample fails', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);
    try {
      void loadSamples(
        {
          load: async (id: SampledSound) => {
            if (id === 'tap') {
              throw new Error('decode failed');
            }
          },
        },
        entries,
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
    expect(unhandled).toEqual([]);
  });

  it('keeps loading the other samples before the aggregate settles', async () => {
    const tap = deferred<void>();
    const bark = deferred<void>();
    const load = vi.fn((id: SampledSound) => (id === 'tap' ? tap.promise : bark.promise));
    let settled = false;
    const aggregate = loadSamples({ load }, entries);
    void aggregate.then(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(load.mock.calls.map(([id]) => id)).toEqual(['tap', 'bark']);
    expect(settled).toBe(false);

    bark.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);

    tap.reject(new Error('decode failed'));
    await aggregate;
    expect(settled).toBe(true);
  });

  it('lets a later load populate a sample that failed', async () => {
    const loaded = new Set<SampledSound>();
    let tapAttempts = 0;
    const load = vi.fn(async (id: SampledSound) => {
      if (id === 'tap') {
        tapAttempts += 1;
        if (tapAttempts === 1) {
          throw new Error('decode failed');
        }
      }
      loaded.add(id);
    });

    await loadSamples({ load }, entries);
    expect(loaded.has('tap')).toBe(false);
    await loadSamples({ load }, entries);
    expect(loaded.has('tap')).toBe(true);
  });

  it('plays a missing sample silently while synthesized voices still sound', async () => {
    const starts = { count: 0 };
    const engine = createAudioEngine({ createContext: () => fakeContext(starts) });
    await engine.unlock();

    engine.play('tap');
    expect(starts.count).toBe(0);

    engine.playAbility([{ kind: 'jingle' }]);
    expect(starts.count).toBeGreaterThan(0);
  });
});
