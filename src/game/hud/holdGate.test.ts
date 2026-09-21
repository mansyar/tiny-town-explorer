import { describe, expect, it } from 'vitest';
import { createHoldGate, HOLD_SECONDS } from './holdGate';

/** Holds for `seconds` and reports how many times the gate opened. */
function holdFor(gate: ReturnType<typeof createHoldGate>, seconds: number): number {
  let opens = 0;
  const frames = Math.round(seconds * 60);
  for (let frame = 0; frame < frames; frame += 1) {
    if (gate.update(1 / 60)) {
      opens += 1;
    }
  }
  return opens;
}

describe('the three-second hold', () => {
  it('says nothing while the finger is merely down', () => {
    const gate = createHoldGate();
    gate.press();
    expect(holdFor(gate, HOLD_SECONDS - 0.2)).toBe(0);
    expect(gate.progress()).toBeGreaterThan(0.9);
    expect(gate.isHolding()).toBe(true);
  });

  it('opens on the frame the hold completes', () => {
    const gate = createHoldGate();
    gate.press();
    expect(holdFor(gate, HOLD_SECONDS + 0.05)).toBe(1);
    expect(gate.progress()).toBe(1);
  });

  it('opens once, however long the finger stays down', () => {
    const gate = createHoldGate();
    gate.press();
    expect(holdFor(gate, HOLD_SECONDS + 0.05)).toBe(1);
    expect(holdFor(gate, HOLD_SECONDS * 3)).toBe(0);
  });

  it('starts a fresh hold after the finger comes up', () => {
    const gate = createHoldGate();
    gate.press();
    holdFor(gate, HOLD_SECONDS);
    gate.release();

    gate.press();
    expect(holdFor(gate, HOLD_SECONDS + 0.05)).toBe(1);
  });
});

describe('letting go too soon', () => {
  it('cancels the hold and clears the ring', () => {
    const gate = createHoldGate();
    gate.press();
    holdFor(gate, HOLD_SECONDS - 0.5);
    gate.release();

    expect(gate.progress()).toBe(0);
    expect(gate.isHolding()).toBe(false);
    expect(holdFor(gate, HOLD_SECONDS * 2)).toBe(0);
  });

  it('needs the whole three seconds again on the next try', () => {
    const gate = createHoldGate();
    gate.press();
    holdFor(gate, HOLD_SECONDS - 0.1);
    gate.release();

    gate.press();
    expect(holdFor(gate, HOLD_SECONDS - 0.5)).toBe(0);
    expect(holdFor(gate, 0.6)).toBe(1);
  });

  it('ignores a release that never had a press', () => {
    const gate = createHoldGate();
    gate.release();
    expect(holdFor(gate, HOLD_SECONDS + 0.2)).toBe(0);
    expect(gate.isHolding()).toBe(false);
  });
});

describe('the filling ring', () => {
  it('sits at nothing until the finger goes down', () => {
    const gate = createHoldGate();
    expect(gate.progress()).toBe(0);
    holdFor(gate, 1);
    expect(gate.progress()).toBe(0);
  });

  it('fills steadily rather than jumping at the end', () => {
    const gate = createHoldGate();
    gate.press();
    holdFor(gate, HOLD_SECONDS / 4);
    const quarter = gate.progress();
    holdFor(gate, HOLD_SECONDS / 4);
    const half = gate.progress();
    const secondHalf = half - quarter;

    expect(quarter).toBeCloseTo(0.25, 1);
    expect(half).toBeCloseTo(0.5, 1);
    // Even steps, since the adult is watching this to know it is working.
    expect(Math.abs(secondHalf - quarter)).toBeLessThan(0.05);
  });

  it('does not go backwards on a negative frame', () => {
    const gate = createHoldGate();
    gate.press();
    holdFor(gate, 1);
    const before = gate.progress();
    gate.update(-5);
    expect(gate.progress()).toBe(before);
  });
});

describe('a second finger', () => {
  it('does not restart the count that is already running', () => {
    const gate = createHoldGate();
    gate.press();
    holdFor(gate, HOLD_SECONDS - 0.5);
    // A kid slaps the screen with another finger; the adult's hold must hold.
    gate.press();
    expect(holdFor(gate, 0.6)).toBe(1);
  });

  it('does not open the gate on its own', () => {
    const gate = createHoldGate();
    gate.press();
    gate.press();
    expect(holdFor(gate, HOLD_SECONDS - 0.2)).toBe(0);
    gate.release();
    // One release ends the hold: the gate is not counting fingers.
    expect(gate.isHolding()).toBe(false);
  });
});
