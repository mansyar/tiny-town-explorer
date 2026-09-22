import { describe, expect, it } from 'vitest';
import { PICKUP_RADIUS } from './parkPickup';
import {
  COMPLETE_LINGER_SECONDS,
  createPuppyMission,
  DELIVERY_RANGE,
  type PuppyState,
  resolvePuppyTap,
} from './puppyMission';

const stateOf = (mission: ReturnType<typeof createPuppyMission>): PuppyState =>
  mission.snapshot().state;

describe('puppyMission', () => {
  describe('the search and homecoming (FR7–FR10)', () => {
    it('walks idle → searching → carrying → complete → idle', () => {
      const mission = createPuppyMission();
      expect(stateOf(mission)).toBe('idle');
      expect(mission.siren()).toBe(true);
      expect(stateOf(mission)).toBe('searching');
      mission.update(1 / 60, PICKUP_RADIUS, 99);
      expect(stateOf(mission)).toBe('carrying');
      mission.update(1 / 60, 99, DELIVERY_RANGE - 0.1);
      expect(mission.isDeliverReady()).toBe(true);
      expect(mission.deliver()).toBe(true);
      expect(stateOf(mission)).toBe('complete');
      mission.update(COMPLETE_LINGER_SECONDS, 99, 99);
      expect(stateOf(mission)).toBe('idle');
    });

    it('ignores the siren while the pup is already out', () => {
      const mission = createPuppyMission();
      mission.siren();
      expect(mission.siren()).toBe(false);
      mission.update(1 / 60, 0, 99);
      expect(stateOf(mission)).toBe('carrying');
      expect(mission.siren()).toBe(false);
      expect(stateOf(mission)).toBe('carrying');
    });

    it('picks the pup up only within the drive-over radius', () => {
      const mission = createPuppyMission();
      mission.siren();
      mission.update(1 / 60, PICKUP_RADIUS + 0.01, 99);
      expect(stateOf(mission)).toBe('searching');
      mission.update(1 / 60, PICKUP_RADIUS, 99);
      expect(stateOf(mission)).toBe('carrying');
    });

    it('arms delivery only near the owner house, and disarms when driving away', () => {
      const mission = createPuppyMission();
      mission.siren();
      mission.update(1 / 60, 0, 99);
      expect(stateOf(mission)).toBe('carrying');
      mission.update(1 / 60, 99, DELIVERY_RANGE + 0.1);
      expect(mission.isDeliverReady()).toBe(false);
      mission.update(1 / 60, 99, DELIVERY_RANGE);
      expect(mission.isDeliverReady()).toBe(true);
      mission.update(1 / 60, 99, DELIVERY_RANGE + 0.1);
      expect(mission.isDeliverReady()).toBe(false);
    });
  });

  describe('the delivery tap (FR10)', () => {
    it('resolves to deliver only when carrying, on the house, and in range', () => {
      expect(
        resolvePuppyTap({ state: 'carrying', onOwnerHouse: true, armed: true }),
      ).toBe('deliver');
      expect(
        resolvePuppyTap({ state: 'carrying', onOwnerHouse: false, armed: true }),
      ).toBe('ignore');
      expect(
        resolvePuppyTap({ state: 'carrying', onOwnerHouse: true, armed: false }),
      ).toBe('ignore');
      expect(
        resolvePuppyTap({ state: 'searching', onOwnerHouse: true, armed: true }),
      ).toBe('ignore');
      expect(resolvePuppyTap({ state: 'idle', onOwnerHouse: true, armed: true })).toBe(
        'ignore',
      );
    });

    it('never delivers from searching, and delivers exactly once', () => {
      const mission = createPuppyMission();
      mission.siren();
      expect(mission.deliver()).toBe(false);
      mission.update(1 / 60, 0, 99);
      mission.update(1 / 60, 99, 1.5);
      expect(mission.deliver()).toBe(true);
      expect(mission.deliver()).toBe(false);
      expect(stateOf(mission)).toBe('complete');
    });
  });

  describe('the completion linger (FR10)', () => {
    it('holds complete until 2.5 s, then idles', () => {
      const mission = createPuppyMission();
      mission.siren();
      mission.update(1 / 60, 0, 99);
      mission.update(1 / 60, 99, 1.5);
      mission.deliver();
      mission.update(COMPLETE_LINGER_SECONDS - 0.1, 99, 99);
      expect(stateOf(mission)).toBe('complete');
      mission.update(0.1, 99, 99);
      expect(stateOf(mission)).toBe('idle');
    });

    it('ignores a negative frame while complete', () => {
      const mission = createPuppyMission();
      mission.siren();
      mission.update(1 / 60, 0, 99);
      mission.update(1 / 60, 99, 1.5);
      mission.deliver();
      mission.update(-5, 99, 99);
      expect(stateOf(mission)).toBe('complete');
    });
  });
});
