import { describe, expect, it } from 'vitest';
import {
  COOLDOWN_SECONDS,
  createHelperHand,
  type HelperHandContext,
  IDLE_SECONDS,
} from './helperHand';

const FIRE = { x: -0.5, z: 0.5 };

const context = (overrides: Partial<HelperHandContext> = {}): HelperHandContext => ({
  missionActive: true,
  destination: FIRE,
  ...overrides,
});

/** Ticks for `seconds` and reports whether the hand handed back a tap. */
function tickFor(
  hand: ReturnType<typeof createHelperHand>,
  seconds: number,
  ctx = context(),
): { tapped: boolean; point: unknown } {
  let point: unknown;
  let tapped = false;
  const frames = Math.round(seconds * 60);
  for (let frame = 0; frame < frames; frame += 1) {
    const result = hand.update(1 / 60, ctx);
    if (result !== undefined) {
      tapped = true;
      point = result;
    }
  }
  return { tapped, point };
}

describe('the ten seconds of patience', () => {
  it('says nothing while the kid is still thinking', () => {
    const hand = createHelperHand();
    const { tapped } = tickFor(hand, IDLE_SECONDS - 0.2);
    expect(tapped).toBe(false);
    expect(hand.secondsIdle()).toBeGreaterThan(0);
  });

  it('offers the tap point once the quiet runs past ten seconds', () => {
    const hand = createHelperHand();
    const { tapped, point } = tickFor(hand, IDLE_SECONDS + 0.2);
    expect(tapped).toBe(true);
    expect(point).toEqual(FIRE);
  });

  it('hands back the point it was given, not one of its own', () => {
    const hand = createHelperHand();
    const { point } = tickFor(
      hand,
      IDLE_SECONDS + 0.1,
      context({ destination: { x: 9, z: -3 } }),
    );
    expect(point).toEqual({ x: 9, z: -3 });
  });

  it('starts counting again after it has helped', () => {
    const hand = createHelperHand();
    tickFor(hand, IDLE_SECONDS + 0.1);
    expect(hand.secondsIdle()).toBeLessThan(1);

    const soon = tickFor(hand, COOLDOWN_SECONDS - 0.5);
    expect(soon.tapped).toBe(false);

    const later = tickFor(hand, 1);
    expect(later.tapped).toBe(true);
  });

  it('never taps twice in the same quiet window', () => {
    const hand = createHelperHand();
    // Far longer than the idle window, but every frame is inside one window
    // until it fires, and then the window restarts.
    const { tapped } = tickFor(hand, IDLE_SECONDS + 0.05);
    expect(tapped).toBe(true);
    expect(hand.secondsIdle()).toBeLessThan(0.1);
  });
});

describe('a kid who is playing', () => {
  it('starts the count over on every touch', () => {
    const hand = createHelperHand();
    tickFor(hand, IDLE_SECONDS - 1);
    hand.noteActivity();
    expect(hand.secondsIdle()).toBe(0);

    const { tapped } = tickFor(hand, IDLE_SECONDS - 0.5);
    expect(tapped).toBe(false);
  });

  it('lets a touch end the cooldown early, so help is re-earned', () => {
    const hand = createHelperHand();
    tickFor(hand, IDLE_SECONDS + 0.1);
    hand.noteActivity();
    const { tapped } = tickFor(hand, IDLE_SECONDS + 0.1);
    expect(tapped).toBe(true);
  });
});

describe('when the hand should stay out of the way', () => {
  it('does nothing outside a mission', () => {
    const hand = createHelperHand();
    const { tapped } = tickFor(hand, IDLE_SECONDS * 3, context({ missionActive: false }));
    expect(tapped).toBe(false);
    expect(hand.secondsIdle()).toBe(0);
  });

  it('does nothing while the parent has switched it off', () => {
    const hand = createHelperHand();
    hand.setEnabled(false);
    expect(hand.isEnabled()).toBe(false);
    expect(tickFor(hand, IDLE_SECONDS * 3).tapped).toBe(false);
  });

  it('comes back when the parent switches it on again', () => {
    const hand = createHelperHand();
    hand.setEnabled(false);
    tickFor(hand, IDLE_SECONDS * 3);
    hand.setEnabled(true);
    expect(hand.isEnabled()).toBe(true);
    expect(tickFor(hand, IDLE_SECONDS + 0.1).tapped).toBe(true);
  });

  it('drops a half-finished count when it is switched off', () => {
    const hand = createHelperHand();
    tickFor(hand, IDLE_SECONDS - 0.5);
    hand.setEnabled(false);
    expect(hand.secondsIdle()).toBe(0);
  });

  it('forgets the last fire when the mission ends', () => {
    const hand = createHelperHand();
    tickFor(hand, IDLE_SECONDS + 0.1);
    tickFor(hand, IDLE_SECONDS, context({ missionActive: false }));
    expect(hand.secondsIdle()).toBe(0);
    // A new mission starts with fresh patience, not with help already queued.
    expect(tickFor(hand, IDLE_SECONDS - 1).tapped).toBe(false);
    expect(tickFor(hand, 1.5).tapped).toBe(true);
  });

  it('treats a negative frame as no time passing', () => {
    const hand = createHelperHand();
    hand.update(-100, context());
    expect(hand.secondsIdle()).toBe(0);
  });
});
