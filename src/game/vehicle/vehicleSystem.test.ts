import { describe, expect, it } from 'vitest';
import { VEHICLE_MODELS } from '../assets/modelRegistry';
import { DRIVE_SPEED } from './vehicleMotor';
import {
  BURST_MAX_SECONDS,
  BURST_MIN_SECONDS,
  createVehicleSystem,
  ENGINE_IDLE_RATE,
  ENGINE_TOP_RATE,
  VEHICLE_IDS,
} from './vehicleSystem';

describe('the fleet registry', () => {
  it('holds the four service vehicles, each once', () => {
    expect(VEHICLE_IDS).toHaveLength(4);
    expect(new Set(VEHICLE_IDS).size).toBe(4);
  });

  it('gives each vehicle its own model from the registry', () => {
    const system = createVehicleSystem();
    const models = VEHICLE_IDS.map((id) => system.spec(id).model);

    for (const model of models) {
      expect(model).toBeTruthy();
    }
    expect(new Set(models).size).toBe(4);
    expect(system.spec('fire').model).toBe(VEHICLE_MODELS.firetruck);
    expect(system.spec('iceCream').model).toBe(VEHICLE_MODELS.iceCreamTruck);
    expect(system.spec('garbage').model).toBe(VEHICLE_MODELS.garbageTruck);
    expect(system.spec('police').model).toBe(VEHICLE_MODELS.police);
  });
});

describe('switching vehicles', () => {
  it('starts in the fire truck', () => {
    const system = createVehicleSystem();

    expect(system.activeId()).toBe('fire');
    expect(system.isActive('fire')).toBe(true);
    expect(system.isActive('police')).toBe(false);
    expect(system.activeModel()).toBe(VEHICLE_MODELS.firetruck);
  });

  it('morphs to whichever vehicle the kid picked', () => {
    const system = createVehicleSystem();
    system.setActive('police');

    expect(system.activeId()).toBe('police');
    expect(system.activeModel()).toBe(VEHICLE_MODELS.police);
    expect(system.isActive('police')).toBe(true);
    expect(system.isActive('fire')).toBe(false);
  });

  it('honours a starting vehicle', () => {
    expect(createVehicleSystem('garbage').activeId()).toBe('garbage');
  });
});

describe('ability one-shots', () => {
  it('sprays for one to two seconds as the fire truck', () => {
    const events = createVehicleSystem('fire').requestAbility();

    expect(events).toHaveLength(1);
    const spray = events[0];
    if (spray === undefined || spray.kind !== 'spray') {
      throw new Error('expected a spray');
    }
    expect(spray.seconds).toBeGreaterThanOrEqual(BURST_MIN_SECONDS);
    expect(spray.seconds).toBeLessThanOrEqual(BURST_MAX_SECONDS);
  });

  it('jingles and drops cones as the ice-cream truck', () => {
    expect(
      createVehicleSystem('iceCream')
        .requestAbility()
        .map((event) => event.kind),
    ).toEqual(['jingle', 'cones']);
  });

  it('gulps as the garbage truck and wails as the police car', () => {
    expect(
      createVehicleSystem('garbage')
        .requestAbility()
        .map((event) => event.kind),
    ).toEqual(['gulp']);
    expect(
      createVehicleSystem('police')
        .requestAbility()
        .map((event) => event.kind),
    ).toEqual(['siren']);
  });

  it('hands back a fresh batch per press', () => {
    const system = createVehicleSystem('police');

    const first = system.requestAbility();
    expect(first).not.toBe(system.requestAbility());
    expect(first).toHaveLength(1);
  });

  it('refuses a second press while a burst is in flight', () => {
    const system = createVehicleSystem('fire');
    system.requestAbility();

    expect(system.requestAbility()).toEqual([]);
  });
});

describe('engine pitch', () => {
  it('idles above zero and rises to the top rate', () => {
    const system = createVehicleSystem();

    expect(system.engineRate(0)).toBeCloseTo(ENGINE_IDLE_RATE, 6);
    expect(system.engineRate(DRIVE_SPEED)).toBeCloseTo(ENGINE_TOP_RATE, 6);
    expect(system.engineRate(0)).toBeLessThan(system.engineRate(DRIVE_SPEED / 2));
    expect(system.engineRate(DRIVE_SPEED / 2)).toBeLessThan(
      system.engineRate(DRIVE_SPEED),
    );
  });

  it('clamps to the dial at both ends', () => {
    const system = createVehicleSystem();

    expect(system.engineRate(-5)).toBeCloseTo(ENGINE_IDLE_RATE, 6);
    expect(system.engineRate(DRIVE_SPEED * 10)).toBeCloseTo(ENGINE_TOP_RATE, 6);
  });

  it('reads against a custom top speed', () => {
    const system = createVehicleSystem();
    const middle = ENGINE_IDLE_RATE + (ENGINE_TOP_RATE - ENGINE_IDLE_RATE) / 2;

    expect(system.engineRate(2, 4)).toBeCloseTo(middle, 6);
    expect(system.engineRate(4, 4)).toBeCloseTo(ENGINE_TOP_RATE, 6);
  });
});

describe('burst scheduling', () => {
  it('runs for its cast time and stops on its own', () => {
    const system = createVehicleSystem('fire');
    system.requestAbility();

    expect(system.isBursting()).toBe(true);
    expect(system.burstRemaining()).toBeCloseTo(1.5, 6);

    system.update(1);
    expect(system.burstRemaining()).toBeCloseTo(0.5, 6);
    expect(system.isBursting()).toBe(true);

    system.update(0.5);
    expect(system.isBursting()).toBe(false);
    expect(system.burstRemaining()).toBe(0);
  });

  it('is interruptible when the kid drives away', () => {
    const system = createVehicleSystem('fire');
    system.requestAbility();
    system.update(0.4);

    system.interruptBurst();

    expect(system.isBursting()).toBe(false);
    expect(system.burstRemaining()).toBe(0);
    expect(system.requestAbility()).toHaveLength(1);
  });

  it('is abandoned when the kid morphs mid-burst', () => {
    const system = createVehicleSystem('fire');
    system.requestAbility();

    system.setActive('police');

    expect(system.isBursting()).toBe(false);
    expect(system.requestAbility().map((event) => event.kind)).toEqual(['siren']);
  });

  it('never runs past its start', () => {
    const system = createVehicleSystem('fire');
    system.requestAbility();
    system.update(1.5);

    system.update(10);

    expect(system.burstRemaining()).toBe(0);
    expect(system.isBursting()).toBe(false);
  });

  it('leaves an instant one-shot with nothing to interrupt', () => {
    const system = createVehicleSystem('police');
    system.requestAbility();

    expect(system.isBursting()).toBe(false);
  });
});
