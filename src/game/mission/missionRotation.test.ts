import { describe, expect, it } from 'vitest';
import type { MissionId } from './missionRegistry';
import { createMissionRotation } from './missionRotation';

const fixedRandom =
  (value = 0) =>
  () =>
    value;

/** A random source that walks a scripted list, then holds its last value. */
const seqRandom = (...values: number[]) => {
  let index = 0;
  return () => {
    const value = values[Math.min(index, values.length - 1)] ?? 0;
    index += 1;
    return value;
  };
};

/** The shipped four-mission pool (spec FR11 after the off-by-one amendment). */
const POOL: readonly MissionId[] = ['fire', 'iceCream', 'park', 'puppy'];

/** The factory under its shipped numbers, overridable per case. */
const rotation = (overrides: Partial<Parameters<typeof createMissionRotation>[0]> = {}) =>
  createMissionRotation({ missions: POOL, random: fixedRandom(0), ...overrides });

/** Ticks until a mission comes back, or gives up after `limit` seconds. */
function untilDue(unit: ReturnType<typeof rotation>, limit = 300) {
  let elapsed = 0;
  while (elapsed < limit) {
    const mission = unit.update(1 / 60, false);
    elapsed += 1 / 60;
    if (mission !== undefined) {
      return { mission, elapsed };
    }
  }
  return { mission: undefined as MissionId | undefined, elapsed };
}

describe('the shared calm gap', () => {
  it('opens inside the shipped 60–90s window at both ends', () => {
    expect(rotation({ random: fixedRandom(0) }).secondsUntilDue()).toBe(60);
    expect(rotation({ random: fixedRandom(1) }).secondsUntilDue()).toBe(90);
  });

  it('re-rolls inside the same window after every draw', () => {
    const low = rotation({ random: fixedRandom(0) });
    untilDue(low);
    expect(low.secondsUntilDue()).toBe(60);

    const high = rotation({ random: fixedRandom(1) });
    untilDue(high);
    expect(high.secondsUntilDue()).toBe(90);
  });

  it('holds the whole gap back while any mission is running', () => {
    const unit = rotation();
    for (let frame = 0; frame < 600; frame += 1) {
      expect(unit.update(1 / 60, true)).toBeUndefined();
    }
    expect(unit.secondsUntilDue()).toBe(60);
    expect(untilDue(unit, 0.001).mission).toBeUndefined();
    expect(untilDue(unit).mission).toBe('fire');
  });

  it('never counts a negative frame as time passing', () => {
    const unit = rotation();
    unit.update(-100, false);
    expect(unit.secondsUntilDue()).toBe(60);
  });
});

describe('never the same mission twice in a row', () => {
  it('excludes the mission that just ran from the next draw', () => {
    // Both draws roll index 0: with `fire` spent, the first candidate is
    // `iceCream`, not `fire` again.
    const unit = rotation({ random: seqRandom(0, 0, 0, 0) });
    expect(untilDue(unit).mission).toBe('fire');
    expect(untilDue(unit).mission).toBe('iceCream');
  });

  it('stays off the previous mission across a long pinned session', () => {
    const unit = rotation({ random: seqRandom(...Array(200).fill(0)) });
    let previous = untilDue(unit).mission;
    expect(previous).toBeDefined();
    for (let draw = 0; draw < 40; draw += 1) {
      const next = untilDue(unit).mission;
      expect(next).toBeDefined();
      expect(next).not.toBe(previous);
      previous = next;
    }
  });

  it('remembers the mission that took the turn, and starts with a clean slate', () => {
    const unit = rotation();
    expect(unit.lastMissionId()).toBeUndefined();
    const { mission } = untilDue(unit);
    expect(unit.lastMissionId()).toBe(mission);
  });
});

describe('the draw is uniform across the other three', () => {
  // One scripted unit per third: first draw pins `fire` (index 0 of four),
  // the second draw's script value picks inside the remaining three.
  const secondDrawAfterFire = (pickRandom: number) => {
    const unit = rotation({ random: seqRandom(0, 0, 0, pickRandom) });
    expect(untilDue(unit).mission).toBe('fire');
    return untilDue(unit).mission;
  };

  it('lands on the first of the remaining three on a low roll', () => {
    expect(secondDrawAfterFire(0)).toBe('iceCream');
    expect(secondDrawAfterFire(0.33)).toBe('iceCream');
  });

  it('lands on the second on a middle roll', () => {
    expect(secondDrawAfterFire(0.34)).toBe('park');
    expect(secondDrawAfterFire(0.66)).toBe('park');
  });

  it('lands on the third on a high roll', () => {
    expect(secondDrawAfterFire(0.67)).toBe('puppy');
    expect(secondDrawAfterFire(0.99)).toBe('puppy');
  });
});

describe('the dev calm-gap override', () => {
  it('opens inside a caller-supplied window instead of the shipped 60–90s', () => {
    const unit = rotation({ minSeconds: 2, maxSeconds: 2 });
    expect(unit.secondsUntilDue()).toBe(2);
    const { mission, elapsed } = untilDue(unit);
    expect(mission).toBe('fire');
    // Due after the override, not after a minute of waiting.
    expect(elapsed).toBeGreaterThanOrEqual(2);
    expect(elapsed).toBeLessThan(2.1);
    // And the re-roll stays inside the override, so every mission is quick.
    expect(unit.secondsUntilDue()).toBe(2);
  });

  it('still pauses the shortened gap while a mission is running', () => {
    const unit = rotation({ minSeconds: 2, maxSeconds: 2 });
    for (let frame = 0; frame < 600; frame += 1) {
      expect(unit.update(1 / 60, true)).toBeUndefined();
    }
    expect(unit.secondsUntilDue()).toBe(2);
  });
});

describe('pools at the edges', () => {
  it('takes no turn at all in a town with no missions', () => {
    const unit = createMissionRotation({ missions: [], random: fixedRandom(0) });
    expect(untilDue(unit, 400).mission).toBeUndefined();
    expect(unit.lastMissionId()).toBeUndefined();
  });

  it('keeps one lone mission playing rather than going quiet forever', () => {
    const unit = createMissionRotation({ missions: ['fire'], random: fixedRandom(0) });
    expect(untilDue(unit).mission).toBe('fire');
    expect(untilDue(unit).mission).toBe('fire');
  });
});
