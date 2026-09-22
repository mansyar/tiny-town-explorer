/**
 * Red-first contract tests for the shared celebration module (FR3) and the
 * unified completion sparkle trigger (FR4, AC6).
 *
 * The recipes pin today's per-mission feedback exactly: fire/park/puppy run
 * the confetti + sun + cheer trio (main.ts `celebrate`), ice cream adds its
 * cones burst and drop (tickOrderMission's served branch). Linger durations
 * must equal each mission's current COMPLETE_LINGER_SECONDS (all 2.5 today)
 * so the shared module can feed the generic FSM without changing pacing.
 *
 * The sparkle is a per-completion bonus: exactly one sparkle per armed
 * celebration, never in free play (no completion => no fire => no sparkle),
 * never on mission start (rearm does not fire), and immune to tap spam or
 * interruption during the linger window (repeated `fire` calls collapse into
 * the one already-latched completion). Spec FR4: it pops at the mission's own
 * completion site (revised from "town hall" - the town has none) and is
 * always paired with celebration audio (never sound-only: every recipe ends
 * in `cheer`).
 */

import { describe, expect, it, vi } from 'vitest';
import type { Vec2 } from '../town/townTypes';
import { COMPLETE_LINGER_SECONDS as ORDER_LINGER } from './iceCreamMission';
import {
  CELEBRATIONS,
  type CelebrationFx,
  createCelebration,
  type MissionCelebrationDeps,
} from './missionCelebration';
import { COMPLETE_LINGER_SECONDS as FIRE_LINGER } from './missionManager';
import type { MissionId } from './missionRegistry';
import { COMPLETE_LINGER_SECONDS as PARK_LINGER } from './parkMission';
import { COMPLETE_LINGER_SECONDS as PUPPY_LINGER } from './puppyMission';

type Call = { kind: 'fx' | 'sparkle'; what: string; at: Vec2 };

function makeDeps(): { deps: MissionCelebrationDeps; calls: Call[] } {
  const calls: Call[] = [];
  const deps: MissionCelebrationDeps = {
    play: (what, at) => {
      calls.push({ kind: 'fx', what, at });
    },
    sparkle: (at) => {
      calls.push({ kind: 'sparkle', what: 'sparkle', at });
    },
  };
  return { deps, calls };
}

const WHERE: Vec2 = { x: 2, z: 3 };

describe('celebration recipes as data (FR3)', () => {
  it('pins the exact per-mission feedback order from main.ts', () => {
    expect(CELEBRATIONS.fire.fx).toEqual<CelebrationFx[]>(['confetti', 'sun', 'cheer']);
    expect(CELEBRATIONS.iceCream.fx).toEqual<CelebrationFx[]>([
      'confetti',
      'cones',
      'sun',
      'drop',
      'cheer',
    ]);
    expect(CELEBRATIONS.park.fx).toEqual<CelebrationFx[]>(['confetti', 'sun', 'cheer']);
    expect(CELEBRATIONS.puppy.fx).toEqual<CelebrationFx[]>(['confetti', 'sun', 'cheer']);
  });

  it('preserves each mission linger duration', () => {
    expect(CELEBRATIONS.fire.lingerSeconds).toBe(FIRE_LINGER);
    expect(CELEBRATIONS.iceCream.lingerSeconds).toBe(ORDER_LINGER);
    expect(CELEBRATIONS.park.lingerSeconds).toBe(PARK_LINGER);
    expect(CELEBRATIONS.puppy.lingerSeconds).toBe(PUPPY_LINGER);
  });

  it('never lets the sparkle be sound-only (every recipe ends in audio)', () => {
    for (const id of Object.keys(CELEBRATIONS) as MissionId[]) {
      expect(CELEBRATIONS[id].fx.at(-1), id).toBe('cheer');
    }
  });
});

describe('createCelebration arms once per completion (FR3, AC6)', () => {
  it('plays the recipe and one sparkle at the completion site', () => {
    const { deps, calls } = makeDeps();
    const celebration = createCelebration('fire', deps);
    celebration.fire(WHERE);
    expect(calls).toEqual([
      { kind: 'fx', what: 'confetti', at: WHERE },
      { kind: 'fx', what: 'sun', at: WHERE },
      { kind: 'fx', what: 'cheer', at: WHERE },
      { kind: 'sparkle', what: 'sparkle', at: WHERE },
    ]);
  });

  it('collapses tap spam during linger into exactly one celebration', () => {
    const { deps, calls } = makeDeps();
    const celebration = createCelebration('park', deps);
    celebration.fire(WHERE);
    for (let i = 0; i < 20; i += 1) celebration.fire(WHERE);
    expect(calls.filter((call) => call.kind === 'sparkle')).toHaveLength(1);
    expect(calls).toHaveLength(4);
  });

  it('is silent in free play: never fired means nothing plays', () => {
    const { deps, calls } = makeDeps();
    createCelebration('puppy', deps);
    expect(calls).toEqual([]);
  });

  it('rearm (mission start) does not fire - no sparkle on spawn', () => {
    const { deps, calls } = makeDeps();
    const celebration = createCelebration('iceCream', deps);
    celebration.rearm();
    celebration.rearm();
    expect(calls).toEqual([]);
  });

  it('survives interruption: a stale fire after rearm waits for the next completion', () => {
    const { deps, calls } = makeDeps();
    const celebration = createCelebration('fire', deps);
    celebration.fire(WHERE);
    celebration.rearm(); // aborted/completed-and-restarted mid-linger
    expect(calls).toHaveLength(4);
    // No second sparkle until a fresh completion fires.
    celebration.rearm();
    expect(calls.filter((call) => call.kind === 'sparkle')).toHaveLength(1);
  });

  it('allows one celebration per cycle after rearm', () => {
    const { deps, calls } = makeDeps();
    const celebration = createCelebration('park', deps);
    celebration.fire(WHERE);
    celebration.rearm();
    celebration.fire(WHERE);
    expect(calls.filter((call) => call.kind === 'sparkle')).toHaveLength(2);
    expect(calls.filter((call) => call.kind === 'fx')).toHaveLength(6);
  });

  it('reports its mission id and current armed state for wiring', () => {
    const { deps } = makeDeps();
    const celebration = createCelebration('puppy', deps);
    expect(celebration.id).toBe('puppy');
    expect(celebration.isArmed()).toBe(true);
    celebration.fire(WHERE);
    expect(celebration.isArmed()).toBe(false);
    celebration.rearm();
    expect(celebration.isArmed()).toBe(true);
  });
});

describe('deps are not spied into false passes', () => {
  it('keeps play and sparkle as separate injected channels', () => {
    const play = vi.fn();
    const sparkle = vi.fn();
    const celebration = createCelebration('fire', { play, sparkle });
    celebration.fire(WHERE);
    expect(play).toHaveBeenCalledTimes(3);
    expect(sparkle).toHaveBeenCalledTimes(1);
    expect(sparkle).toHaveBeenCalledWith(WHERE);
  });
});
