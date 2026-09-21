import { describe, expect, it } from 'vitest';
import {
  cappedGain,
  ENGINE_BASE_HZ,
  engineTone,
  JINGLE_STEPS,
  jingleSchedule,
  MASTER_GAIN_CAP,
  sampledSoundFor,
  sirenSchedule,
} from './audioEngine';

describe('the kid-safe ceiling', () => {
  it('leaves a quiet request alone and clips a loud one', () => {
    expect(cappedGain(0.1)).toBe(0.1);
    expect(cappedGain(1)).toBe(MASTER_GAIN_CAP);
    expect(cappedGain(100)).toBe(MASTER_GAIN_CAP);
  });

  it('never lets anything through at full scale', () => {
    expect(MASTER_GAIN_CAP).toBeLessThan(1);
  });

  it('treats a negative request as silence', () => {
    expect(cappedGain(-3)).toBe(0);
  });
});

describe('the jingle', () => {
  it('lays its notes out one after another from the start time', () => {
    const notes = jingleSchedule(10);
    expect(notes).toHaveLength(JINGLE_STEPS.length);
    expect(notes[0]?.at).toBe(10);
    for (let index = 1; index < notes.length; index += 1) {
      const previous = notes[index - 1];
      const note = notes[index];
      expect(note?.at).toBeCloseTo((previous?.at ?? 0) + (previous?.seconds ?? 0));
    }
  });

  it('keeps the melody it declares', () => {
    const notes = jingleSchedule(0);
    expect(notes.map((note) => note.frequency)).toEqual(
      JINGLE_STEPS.map((step) => step.frequency),
    );
    // Rising overall, so the jingle reads as a happy little fanfare.
    expect(notes[0]?.frequency).toBeLessThan(notes[notes.length - 1]?.frequency ?? 0);
  });

  it('runs its own length, so a caller knows when it is over', () => {
    const notes = jingleSchedule(0);
    const total = JINGLE_STEPS.reduce((sum, step) => sum + step.seconds, 0);
    const last = notes[notes.length - 1];
    expect((last?.at ?? 0) + (last?.seconds ?? 0)).toBeCloseTo(total);
  });
});

describe('the siren', () => {
  it('alternates two tones', () => {
    const tones = sirenSchedule(0, 4);
    expect(tones).toHaveLength(4);
    const [first, second] = tones;
    expect(first?.frequency).not.toBe(second?.frequency);
    expect(tones[0]?.frequency).toBe(tones[2]?.frequency);
    expect(tones[1]?.frequency).toBe(tones[3]?.frequency);
  });

  it('steps along in time from the start it was given', () => {
    const tones = sirenSchedule(5, 3);
    expect(tones[0]?.at).toBe(5);
    expect(tones[1]?.at).toBeCloseTo(5 + (tones[0]?.seconds ?? 0));
    expect(tones[2]?.at).toBeCloseTo(5 + 2 * (tones[0]?.seconds ?? 0));
  });

  it('schedules nothing for no cycles', () => {
    expect(sirenSchedule(0, 0)).toEqual([]);
  });
});

describe('the engine note', () => {
  it('sits at its base rate when the motor reports one', () => {
    expect(engineTone(1)).toBe(ENGINE_BASE_HZ);
  });

  it('rises with the rate', () => {
    expect(engineTone(2)).toBe(ENGINE_BASE_HZ * 2);
    expect(engineTone(1.6)).toBeGreaterThan(engineTone(0.85));
  });

  it('never goes negative', () => {
    expect(engineTone(-1)).toBe(0);
  });
});

describe('matching ability events to sound', () => {
  it('reaches for a sample for the gulp and the cones', () => {
    expect(sampledSoundFor({ kind: 'gulp' })).toBe('gulp');
    expect(sampledSoundFor({ kind: 'cones' })).toBe('drop');
  });

  it('leaves the synthesized voices to the oscillator', () => {
    expect(sampledSoundFor({ kind: 'spray', seconds: 1.5 })).toBeUndefined();
    expect(sampledSoundFor({ kind: 'jingle' })).toBeUndefined();
    expect(sampledSoundFor({ kind: 'siren' })).toBeUndefined();
  });
});
