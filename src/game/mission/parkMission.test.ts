import { describe, expect, it } from 'vitest';
import type { ParkState } from './parkMission';
import {
  COLLECT_RANGE,
  COMPLETE_LINGER_SECONDS,
  createParkMission,
  resolveParkTap,
} from './parkMission';

const stateOf = (mission: ReturnType<typeof createParkMission>): ParkState =>
  mission.snapshot().state;

describe('parkMission', () => {
  describe('the clean-up errand (FR2, FR5)', () => {
    it('walks spawned → responding → collecting → complete → idle', () => {
      const mission = createParkMission();
      expect(stateOf(mission)).toBe('idle');
      expect(mission.spawn()).toBe(true);
      expect(stateOf(mission)).toBe('spawned');
      expect(mission.respond()).toBe(true);
      expect(stateOf(mission)).toBe('responding');
      mission.update(1 / 60, COLLECT_RANGE);
      expect(stateOf(mission)).toBe('collecting');
      expect(mission.finish()).toBe(true);
      expect(stateOf(mission)).toBe('complete');
      mission.update(COMPLETE_LINGER_SECONDS, COLLECT_RANGE);
      expect(stateOf(mission)).toBe('idle');
    });

    it('ignores a spawn while a clean-up is already running', () => {
      const mission = createParkMission();
      expect(mission.spawn()).toBe(true);
      expect(mission.spawn()).toBe(false);
      mission.respond();
      expect(mission.spawn()).toBe(false);
    });

    it('waits in spawned until the kid answers — distance never jumps the gun', () => {
      const mission = createParkMission();
      mission.spawn();
      mission.update(10, 0);
      expect(stateOf(mission)).toBe('spawned');
    });
  });

  describe('the respond tap (FR2)', () => {
    it('answers only a tap that lands on a piece, and only once', () => {
      const mission = createParkMission();
      mission.spawn();
      expect(resolveParkTap({ state: stateOf(mission), onPiece: true })).toBe('respond');
      expect(mission.respond()).toBe(true);
      expect(stateOf(mission)).toBe('responding');
      // A second tap never re-fires the morph or the drive.
      expect(resolveParkTap({ state: stateOf(mission), onPiece: true })).toBe('ignore');
      expect(mission.respond()).toBe(false);
      expect(stateOf(mission)).toBe('responding');
    });

    it('ignores a tap that misses the litter, and a tap on a quiet town', () => {
      const mission = createParkMission();
      mission.spawn();
      // A miss resolves to 'ignore', so the FSM is never asked to respond.
      expect(resolveParkTap({ state: stateOf(mission), onPiece: false })).toBe('ignore');
      expect(stateOf(mission)).toBe('spawned');
      const quiet = createParkMission();
      expect(resolveParkTap({ state: stateOf(quiet), onPiece: true })).toBe('ignore');
    });
  });

  describe('driving away never cancels (NFR1)', () => {
    it('disarms collecting back to responding, then re-arms on the way back', () => {
      const mission = createParkMission();
      mission.spawn();
      mission.respond();
      mission.update(1 / 60, COLLECT_RANGE);
      expect(stateOf(mission)).toBe('collecting');
      mission.update(1 / 60, COLLECT_RANGE + 0.1);
      expect(stateOf(mission)).toBe('responding');
      mission.update(1 / 60, COLLECT_RANGE);
      expect(stateOf(mission)).toBe('collecting');
      // Still the kid's errand throughout: no spawn, no return to spawned.
      expect(mission.spawn()).toBe(false);
      expect(stateOf(mission)).toBe('collecting');
    });
  });

  describe('the completion linger (FR5)', () => {
    it('holds ~2.5 s of celebration before the town goes quiet', () => {
      const mission = createParkMission();
      mission.spawn();
      mission.respond();
      mission.update(1 / 60, COLLECT_RANGE);
      mission.finish();
      mission.update(COMPLETE_LINGER_SECONDS - 0.1, COLLECT_RANGE);
      expect(stateOf(mission)).toBe('complete');
      mission.update(0.1, COLLECT_RANGE);
      expect(stateOf(mission)).toBe('idle');
    });

    it('ignores a negative frame during the celebration', () => {
      const mission = createParkMission();
      mission.spawn();
      mission.respond();
      mission.update(1 / 60, COLLECT_RANGE);
      mission.finish();
      mission.update(-5, COLLECT_RANGE);
      expect(stateOf(mission)).toBe('complete');
    });

    it('finishes only once the kid has answered, and only once', () => {
      const quiet = createParkMission();
      quiet.spawn();
      expect(quiet.finish()).toBe(false);
      expect(stateOf(quiet)).toBe('spawned');

      const running = createParkMission();
      running.spawn();
      expect(running.finish()).toBe(false);
      running.respond();
      running.update(1 / 60, COLLECT_RANGE);
      expect(running.finish()).toBe(true);
      expect(running.finish()).toBe(false);
      expect(stateOf(running)).toBe('complete');
    });
  });
});
