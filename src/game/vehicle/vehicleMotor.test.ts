import { describe, expect, it } from 'vitest';
import type { Path } from '../path/pathfinder';
import { yawForDirection } from '../town/townLayout';
import {
  ALIGN_TOLERANCE,
  ARRIVAL_RADIUS,
  createVehicleMotor,
  DRIVE_SPEED,
  facingOf,
  headingFor,
  TURN_RATE,
} from './vehicleMotor';

/** A path that goes straight to one point, with no road tiles to pass through. */
function directTo(destination: { x: number; z: number }): Path {
  return { waypoints: [], destination };
}

/** Runs the motor for `seconds` in fixed steps, as a frame loop would. */
function run(
  motor: ReturnType<typeof createVehicleMotor>,
  seconds: number,
  step = 1 / 60,
): void {
  const frames = Math.round(seconds / step);
  for (let frame = 0; frame < frames; frame++) {
    motor.update(step);
  }
}

describe('heading helpers', () => {
  it('faces south when the heading is zero, like the kit models do', () => {
    const facing = facingOf(0);
    expect(facing.x).toBeCloseTo(0, 10);
    expect(facing.z).toBeCloseTo(1, 10);
  });

  it('faces east a quarter turn clockwise from south', () => {
    const facing = facingOf(Math.PI / 2);
    expect(facing.x).toBeCloseTo(1, 10);
    expect(facing.z).toBeCloseTo(0, 10);
  });

  it('agrees with the town’s own direction convention', () => {
    // The motor's heading is fed straight to `rotation.y`, so it must match the
    // yaws the town already uses for houses and props.
    expect(headingFor({ x: 1, z: 0 })).toBeCloseTo(yawForDirection('east'), 10);
    expect(headingFor({ x: 0, z: 1 })).toBeCloseTo(yawForDirection('south'), 10);
    expect(headingFor({ x: -1, z: 0 })).toBeCloseTo(yawForDirection('west'), 10);
    expect(headingFor({ x: 0, z: -1 })).toBeCloseTo(yawForDirection('north'), 10);
  });

  it('round-trips every quadrant', () => {
    for (const heading of [0, Math.PI / 2, Math.PI, -Math.PI / 2, 2.1]) {
      expect(headingFor(facingOf(heading))).toBeCloseTo(heading, 10);
    }
  });
});

describe('driving a straight leg', () => {
  it('covers speed times time, and reports that speed', () => {
    const motor = createVehicleMotor({ position: { x: 0, z: 0 }, heading: Math.PI / 2 });
    motor.setPath(directTo({ x: 3, z: 0 }));

    run(motor, 1);

    expect(motor.position.x).toBeCloseTo(DRIVE_SPEED, 6);
    expect(motor.position.z).toBeCloseTo(0, 6);
    expect(motor.speed()).toBeCloseTo(DRIVE_SPEED, 10);
    expect(motor.isDriving()).toBe(true);
  });

  it('covers the same ground whatever the frame rate', () => {
    const motor = createVehicleMotor({ position: { x: 0, z: 0 }, heading: Math.PI / 2 });
    motor.setPath(directTo({ x: 3, z: 0 }));

    run(motor, 1, 1 / 30);

    expect(motor.position.x).toBeCloseTo(DRIVE_SPEED, 6);
  });
});

describe('rotate-then-drive', () => {
  it('turns in place while the destination is off to the side', () => {
    // Facing south, asked to drive due east: a quarter turn first.
    const motor = createVehicleMotor({ position: { x: 0, z: 0 }, heading: 0 });
    motor.setPath(directTo({ x: 2, z: 0 }));

    motor.update(0.05);

    expect(motor.position.x).toBeCloseTo(0, 10);
    expect(motor.position.z).toBeCloseTo(0, 10);
    expect(motor.heading()).toBeCloseTo(TURN_RATE * 0.05, 6);
    expect(motor.speed()).toBe(0);
  });

  it('holds still until it is aligned, then drives off', () => {
    const motor = createVehicleMotor({ position: { x: 0, z: 0 }, heading: 0 });
    motor.setPath(directTo({ x: 2, z: 0 }));

    // Two frames of turning is 0.45 rad, still short of the quarter turn.
    run(motor, 0.1, 0.05);
    expect(motor.position.x).toBeCloseTo(0, 10);

    // Once aligned it moves, and only toward where it faces.
    run(motor, 0.5, 0.05);
    expect(motor.position.x).toBeGreaterThan(0);
    expect(motor.position.z).toBeCloseTo(0, 6);
    expect(motor.speed()).toBeCloseTo(DRIVE_SPEED, 10);
  });

  it('never turns past the destination heading', () => {
    const motor = createVehicleMotor({ position: { x: 0, z: 0 }, heading: 0 });
    motor.setPath(directTo({ x: 2, z: 0 }));

    for (let frame = 0; frame < 40; frame++) {
      motor.update(0.05);
      expect(motor.heading()).toBeLessThanOrEqual(Math.PI / 2 + 1e-9);
    }
    expect(motor.heading()).toBeCloseTo(Math.PI / 2, 9);
  });

  it('turns the short way round, not the long way', () => {
    // Facing north, asked to drive due west: the short turn is clockwise.
    const motor = createVehicleMotor({ position: { x: 0, z: 0 }, heading: Math.PI });
    motor.setPath(directTo({ x: -2, z: 0 }));

    motor.update(0.05);

    expect(motor.heading()).toBeGreaterThan(Math.PI);
  });
});

describe('rotation easing determinism', () => {
  it('reaches the same heading whether the time comes in one frame or many', () => {
    // 0.2s of turning at 4.5 rad/s is 0.9 rad, well short of the 2 rad turn, so
    // the whole window is rotation: nothing drives and nothing is clamped.
    const inSteps = createVehicleMotor({ position: { x: 0, z: 0 }, heading: 0 });
    inSteps.setPath(directTo(facingOf(2)));
    for (let frame = 0; frame < 4; frame++) {
      inSteps.update(0.05);
    }

    const inOneFrame = createVehicleMotor({ position: { x: 0, z: 0 }, heading: 0 });
    inOneFrame.setPath(directTo(facingOf(2)));
    inOneFrame.update(0.2);

    expect(inSteps.heading()).toBeCloseTo(0.9, 6);
    expect(inOneFrame.heading()).toBeCloseTo(inSteps.heading(), 6);
    expect(inOneFrame.position).toEqual(inSteps.position);
  });

  it('limits the turn rate rather than the angle left over', () => {
    const turnOf = (deltaSeconds: number): number => {
      const motor = createVehicleMotor({ position: { x: 0, z: 0 }, heading: 0 });
      motor.setPath(directTo(facingOf(1.2)));
      motor.update(deltaSeconds);
      return motor.heading();
    };

    // A tenth of a second cannot turn more than the rate allows...
    expect(turnOf(0.1)).toBeCloseTo(TURN_RATE * 0.1, 6);
    // ...but a long frame is capped by the angle still to turn.
    expect(turnOf(1)).toBeCloseTo(1.2, 6);
  });

  it('is exactly reproducible for the same frames', () => {
    const path = directTo({ x: 1, z: 1.4 });
    const first = createVehicleMotor({ position: { x: 0, z: 0 }, heading: 0 });
    const second = createVehicleMotor({ position: { x: 0, z: 0 }, heading: 0 });
    first.setPath(path);
    second.setPath(path);

    run(first, 0.9);
    run(second, 0.9);

    expect(first.position).toEqual(second.position);
    expect(first.heading()).toBe(second.heading());
  });
});

describe('arrival', () => {
  it('stops within the arrival radius of the destination instead of overshooting', () => {
    const motor = createVehicleMotor({ position: { x: 0, z: 0 }, heading: Math.PI / 2 });
    motor.setPath(directTo({ x: 2, z: 0 }));

    run(motor, 5);

    expect(motor.isDriving()).toBe(false);
    expect(motor.speed()).toBe(0);
    expect(motor.position.x).toBeGreaterThanOrEqual(2 - ARRIVAL_RADIUS);
    expect(motor.position.x).toBeLessThanOrEqual(2);
  });

  it('passes through intermediate waypoints instead of stopping at them', () => {
    const motor = createVehicleMotor({ position: { x: 0, z: 0 }, heading: Math.PI / 2 });
    motor.setPath({
      waypoints: [
        { x: 1, z: 0 },
        { x: 2, z: 0 },
      ],
      destination: { x: 3, z: 0 },
    });

    run(motor, 6);

    expect(motor.isDriving()).toBe(false);
    // Parked on the destination, i.e. within the arrival radius past the two
    // waypoints it drove through.
    expect(Math.abs(motor.position.x - 3)).toBeLessThanOrEqual(ARRIVAL_RADIUS);
  });

  it('skips a waypoint it is standing on, so a route never stalls at its first step', () => {
    // The pathfinder always starts a route at the car's own tile centre.
    const motor = createVehicleMotor({ position: { x: 0, z: 0 }, heading: Math.PI / 2 });
    motor.setPath({
      waypoints: [{ x: 0, z: 0 }],
      destination: { x: 2, z: 0 },
    });

    run(motor, 1);

    expect(motor.position.x).toBeGreaterThan(0.5);
  });

  it('drives nothing when there is no path', () => {
    const motor = createVehicleMotor({ position: { x: 0, z: 0 }, heading: Math.PI / 2 });

    run(motor, 1);

    expect(motor.isDriving()).toBe(false);
    expect(motor.speed()).toBe(0);
    expect(motor.position).toEqual({ x: 0, z: 0 });
    expect(motor.heading()).toBe(Math.PI / 2);
  });

  it('treats a zero or negative frame as no time at all', () => {
    const motor = createVehicleMotor({ position: { x: 0, z: 0 }, heading: 0 });
    motor.setPath(directTo({ x: 2, z: 0 }));

    motor.update(0);
    motor.update(-1);

    expect(motor.position).toEqual({ x: 0, z: 0 });
    expect(motor.heading()).toBe(0);
    expect(motor.speed()).toBe(0);
  });
});

describe('starting state', () => {
  it('parks at the origin facing south when given no pose', () => {
    const motor = createVehicleMotor();

    expect(motor.position).toEqual({ x: 0, z: 0 });
    expect(motor.heading()).toBe(0);
    expect(motor.speed()).toBe(0);
    expect(motor.isDriving()).toBe(false);
  });
});

describe('placement', () => {
  it('can be placed anywhere with any heading, leaving the route alone', () => {
    const motor = createVehicleMotor({ position: { x: 0, z: 0 }, heading: 0 });
    motor.setPath(directTo({ x: 4, z: 1 }));

    motor.snapTo({ x: 1, z: 1 }, Math.PI / 2);

    expect(motor.position).toEqual({ x: 1, z: 1 });
    expect(motor.heading()).toBeCloseTo(Math.PI / 2, 10);
    expect(motor.isDriving()).toBe(true);
    // Facing east already, so the first frame drives rather than turns.
    motor.update(0.1);
    expect(motor.position.x).toBeGreaterThan(1);
  });

  it('keeps its heading when placed without one', () => {
    const motor = createVehicleMotor({ position: { x: 0, z: 0 }, heading: 1.1 });

    motor.snapTo({ x: -2, z: 3 });

    expect(motor.position).toEqual({ x: -2, z: 3 });
    expect(motor.heading()).toBeCloseTo(1.1, 10);
  });
});

describe('the alignment tolerance', () => {
  it('is small enough that a car driving a straight road barely turns', () => {
    expect(ALIGN_TOLERANCE).toBeGreaterThan(0);
    expect(ALIGN_TOLERANCE).toBeLessThan(Math.PI / 4);
  });
});
