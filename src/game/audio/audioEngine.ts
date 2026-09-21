/**
 * The soundtrack: the car's own voice, the ability one-shots the VehicleSystem
 * asks for, and one master gain under a kid-safe ceiling behind a mute node.
 *
 * Browsers refuse to start audio until a gesture, so nothing here makes a
 * sound until `unlock()` is called from the first tap.
 *
 * The scheduling decisions — the jingle's notes, the siren's warble, the gain
 * ceiling — are exported as pure functions and covered by tests;
 * `conductor/workflow.md` puts audio scheduling in the test-first set and
 * leaves the player graph itself to hand verification.
 */
import type { AbilityEvent } from '../vehicle/vehicleSystem';

/** Ceiling on everything the game can play, as a Web Audio gain. */
export const MASTER_GAIN_CAP = 0.3;

/** Ramp applied when the mute flips, so muting never clicks. */
export const MUTE_RAMP_SECONDS = 0.06;

/**
 * The samples the build ships; see `audioRegistry` for their URLs. `engine` is
 * the one loop — `setEngine` pitches it by the motor's rate — and the rest are
 * one-shots for `play`.
 */
export type SampledSound =
  | 'bonk'
  | 'cheer'
  | 'chime'
  | 'drop'
  | 'engine'
  | 'gulp'
  | 'poof'
  | 'tap';

/** One scheduled note. */
export interface Tone {
  readonly frequency: number;
  readonly at: number;
  readonly seconds: number;
}

/** The ice-cream truck's fanfare: a rising toy jingle in C. */
export const JINGLE_STEPS: readonly {
  readonly frequency: number;
  readonly seconds: number;
}[] = [
  { frequency: 523.25, seconds: 0.14 },
  { frequency: 659.25, seconds: 0.14 },
  { frequency: 783.99, seconds: 0.18 },
  { frequency: 659.25, seconds: 0.12 },
  { frequency: 1046.5, seconds: 0.36 },
];

const SIREN_LOW = 622.25;
const SIREN_HIGH = 830.61;
const SIREN_STEP_SECONDS = 0.22;

/** How loud the engine loop sits under the master gain. */
export const ENGINE_GAIN = 0.5;

const HORN_LOW = 440;
const HORN_HIGH = 554.37;
const HORN_BLARE_SECONDS = 0.14;
const HORN_GAP_SECONDS = 0.06;

/** The toy horn: a cheerful beep-beep for the dead-zone honk. */
export function hornSchedule(startAt: number): readonly Tone[] {
  const blares = [startAt, startAt + HORN_BLARE_SECONDS + HORN_GAP_SECONDS];
  return blares.flatMap((at) => [
    { frequency: HORN_LOW, at, seconds: HORN_BLARE_SECONDS },
    { frequency: HORN_HIGH, at, seconds: HORN_BLARE_SECONDS },
  ]);
}

/** Lays the jingle out from `startAt`, one note after another. */
export function jingleSchedule(startAt: number): readonly Tone[] {
  let at = startAt;
  return JINGLE_STEPS.map((step) => {
    const tone = { frequency: step.frequency, at, seconds: step.seconds };
    at += step.seconds;
    return tone;
  });
}

/** The police car's two-tone boop: `cycles` warble steps from `startAt`. */
export function sirenSchedule(startAt: number, cycles = 4): readonly Tone[] {
  const tones: Tone[] = [];
  let at = startAt;
  for (let index = 0; index < cycles; index += 1) {
    tones.push({
      frequency: index % 2 === 0 ? SIREN_LOW : SIREN_HIGH,
      at,
      seconds: SIREN_STEP_SECONDS,
    });
    at += SIREN_STEP_SECONDS;
  }
  return tones;
}

/** Keeps a requested level inside the kid-safe ceiling. */
export function cappedGain(requested: number): number {
  return Math.min(MASTER_GAIN_CAP, Math.max(0, requested));
}

/** The sample an ability event plays, or none when it is synthesized. */
export function sampledSoundFor(event: AbilityEvent): SampledSound | undefined {
  if (event.kind === 'gulp') {
    return 'gulp';
  }
  if (event.kind === 'cones') {
    return 'drop';
  }
  return undefined;
}

export interface AudioEngine {
  /** Call from the first pointerdown: browsers only start audio from a gesture. */
  unlock(): Promise<boolean>;
  isUnlocked(): boolean;
  setMuted(muted: boolean): void;
  isMuted(): boolean;
  /** The kid-safe ceiling every sound plays under. */
  masterGain(): number;
  /** Fetch and decode a sample. Safe to call before unlocking. */
  load(id: SampledSound, url: string): Promise<void>;
  /** Fire a loaded sample. Silent until unlocked. */
  play(id: SampledSound): void;
  /** Play whatever the ability events call for, sampled or synthesized. */
  playAbility(events: readonly AbilityEvent[]): void;
  /** The dead-zone honk: a two-note toy beep. */
  honk(): void;
  /** Set the engine's note from `VehicleSystem.engineRate`; `0` stops it. */
  setEngine(rate: number): void;
  dispose(): void;
}

export interface AudioEngineOptions {
  /** Injected so a test or headless build can run without Web Audio. */
  readonly createContext?: () => AudioContext;
}

export function createAudioEngine(options: AudioEngineOptions = {}): AudioEngine {
  const makeContext = options.createContext ?? (() => new AudioContext());
  const buffers = new Map<SampledSound, AudioBuffer>();
  let context: AudioContext | undefined;
  let master: GainNode | undefined;
  let mute: GainNode | undefined;
  let engine:
    | { readonly source: AudioBufferSourceNode; readonly gain: GainNode }
    | undefined;
  let noise: AudioBuffer | undefined;
  let muted = false;

  /** Builds the graph on first use: sound -> master (capped) -> mute -> out. */
  const graph = (): { context: AudioContext; master: GainNode } => {
    if (context === undefined || master === undefined || mute === undefined) {
      const created = makeContext();
      const cap = created.createGain();
      cap.gain.value = MASTER_GAIN_CAP;
      const gate = created.createGain();
      gate.gain.value = muted ? 0 : 1;
      cap.connect(gate);
      gate.connect(created.destination);
      context = created;
      master = cap;
      mute = gate;
    }
    return { context, master };
  };

  /** A note with a soft attack and release, so nothing starts with a click. */
  const scheduleTone = (tone: Tone, type: OscillatorType): void => {
    const { context: ctx, master: out } = graph();
    const oscillator = ctx.createOscillator();
    const envelope = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.value = tone.frequency;
    envelope.gain.setValueAtTime(0, tone.at);
    envelope.gain.linearRampToValueAtTime(0.5, tone.at + 0.02);
    envelope.gain.setValueAtTime(0.5, tone.at + tone.seconds - 0.05);
    envelope.gain.linearRampToValueAtTime(0, tone.at + tone.seconds);
    oscillator.connect(envelope);
    envelope.connect(out);
    oscillator.start(tone.at);
    oscillator.stop(tone.at + tone.seconds + 0.01);
  };

  /** Two seconds of white noise, reused by every spray. */
  const noiseBuffer = (ctx: AudioContext): AudioBuffer => {
    if (noise === undefined) {
      const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 2), ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let index = 0; index < data.length; index += 1) {
        data[index] = Math.random() * 2 - 1;
      }
      noise = buffer;
    }
    return noise;
  };

  /** The hose: noise through a band that falls away as the water lands. */
  const spray = (seconds: number): void => {
    const { context: ctx, master: out } = graph();
    const now = ctx.currentTime;
    const source = ctx.createBufferSource();
    const band = ctx.createBiquadFilter();
    const envelope = ctx.createGain();
    source.buffer = noiseBuffer(ctx);
    band.type = 'bandpass';
    band.Q.value = 0.8;
    band.frequency.setValueAtTime(2400, now);
    band.frequency.linearRampToValueAtTime(700, now + seconds);
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(0.45, now + 0.08);
    envelope.gain.linearRampToValueAtTime(0, now + seconds);
    source.connect(band);
    band.connect(envelope);
    envelope.connect(out);
    source.start(now);
    source.stop(now + seconds + 0.02);
  };

  /** Fires a decoded sample through the capped master. */
  const playSample = (id: SampledSound): void => {
    const buffer = buffers.get(id);
    if (context === undefined || master === undefined || buffer === undefined) {
      return;
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(master);
    source.start();
  };

  /** Plays a batch of scheduled notes in one voice. */
  const scheduleTones = (tones: readonly Tone[], type: OscillatorType): void => {
    for (const tone of tones) {
      scheduleTone(tone, type);
    }
  };

  /** Everything a single ability event sounds like. */
  const playOne = (event: AbilityEvent): void => {
    const sampled = sampledSoundFor(event);
    if (sampled !== undefined) {
      playSample(sampled);
      return;
    }
    if (event.kind === 'spray') {
      spray(event.seconds);
      return;
    }
    const { context: ctx } = graph();
    const startAt = ctx.currentTime + 0.02;
    if (event.kind === 'jingle') {
      scheduleTones(jingleSchedule(startAt), 'triangle');
    } else if (event.kind === 'siren') {
      scheduleTones(sirenSchedule(startAt), 'square');
    }
  };

  return {
    isUnlocked: () => context !== undefined && context.state === 'running',

    unlock: async () => {
      const { context: ctx } = graph();
      if (ctx.state !== 'running') {
        await ctx.resume();
      }
      return ctx.state === 'running';
    },

    setMuted: (next) => {
      muted = next;
      if (context !== undefined && mute !== undefined) {
        mute.gain.setTargetAtTime(muted ? 0 : 1, context.currentTime, MUTE_RAMP_SECONDS);
      }
    },

    isMuted: () => muted,

    masterGain: () => MASTER_GAIN_CAP,

    load: async (id, url) => {
      const { context: ctx } = graph();
      const bytes = await (await fetch(url)).arrayBuffer();
      buffers.set(id, await ctx.decodeAudioData(bytes));
    },

    play: playSample,

    playAbility: (events) => {
      for (const event of events) {
        playOne(event);
      }
    },

    setEngine: (rate) => {
      const { context: ctx, master: out } = graph();
      // The loop starts once its sample has decoded, and stays silent until then.
      if (engine === undefined) {
        const loop = buffers.get('engine');
        if (loop !== undefined) {
          const source = ctx.createBufferSource();
          const gain = ctx.createGain();
          source.buffer = loop;
          source.loop = true;
          source.connect(gain);
          gain.connect(out);
          gain.gain.value = 0;
          engine = { source, gain };
          source.start();
        }
      }
      if (engine === undefined) {
        return;
      }
      // Parked is silent; under way the note rises with the motor's own rate.
      const audible = rate > 0;
      engine.gain.gain.setTargetAtTime(audible ? ENGINE_GAIN : 0, ctx.currentTime, 0.05);
      engine.source.playbackRate.setTargetAtTime(
        audible ? rate : 1,
        ctx.currentTime,
        0.05,
      );
    },

    honk: () => {
      const { context: ctx } = graph();
      scheduleTones(hornSchedule(ctx.currentTime + 0.02), 'square');
    },

    dispose: () => {
      engine?.source.stop();
      engine = undefined;
      buffers.clear();
      noise = undefined;
      void context?.close();
      context = undefined;
      master = undefined;
      mute = undefined;
    },
  };
}
