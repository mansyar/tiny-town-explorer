import { OrthographicCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createCameraRig } from '../camera';
import { createTownGrid } from '../town/townGrid';
import type { TownMapSpec, Vec2 } from '../town/townTypes';
import {
  createInputRouter,
  DEAD_ZONE_RADIUS,
  type InputRouter,
  ndcFromPoint,
  PROP_SNAP_RADIUS,
  type TapCommand,
} from './inputRouter';

/**
 * A flat test town whose props sit at known world positions, so the snapping
 * assertions read as distances rather than as grid arithmetic. A 5 x 5 map puts
 * tile (2,2) at the world origin.
 */
const TEST_MAP: TownMapSpec = {
  tileSize: 1,
  rows: ['.....', '.....', '.....', '.....', '.....'],
  houses: [],
  props: [
    { kind: 'cone', tile: { x: 2, y: 2 }, offset: { x: 0.3, y: 0 } },
    { kind: 'cone', tile: { x: 2, y: 2 }, offset: { x: -0.3, y: 0 } },
    { kind: 'tree', tile: { x: 2, y: 3 } },
  ],
  spawnPoints: [{ x: 2, y: 2 }],
};

const grid = createTownGrid(TEST_MAP);
const CAR_AWAY: Vec2 = { x: 5, z: 5 };

interface Harness {
  readonly router: InputRouter;
  readonly camera: OrthographicCamera;
  /** Sets where the car is before the next tap. */
  moveCarTo(point: Vec2): void;
  /** Taps the ground at a world point, screen position derived from the camera. */
  tapWorld(point: Vec2): TapCommand;
}

/**
 * One router whose camera frames `focus`, with a car that can be parked
 * anywhere. Taps arrive as world points and are projected to screen coordinates
 * through the same camera, so the assertions can talk in distances.
 */
function harness(focus: Vec2 = { x: 0, z: 0 }): Harness {
  const rig = createCameraRig(1);
  rig.snapTo(focus);
  // The rig places the camera but leaves the matrices to the render loop; sync
  // them here so both the projection below and the router see the same pose.
  rig.camera.updateMatrixWorld(true);
  let car: Vec2 = CAR_AWAY;
  const router = createInputRouter({
    camera: rig.camera,
    grid,
    getCarPosition: () => car,
  });
  return {
    camera: rig.camera,
    router,
    moveCarTo(point: Vec2): void {
      car = point;
    },
    tapWorld(point: Vec2): TapCommand {
      const ndc = new Vector3(point.x, 0, point.z).project(rig.camera);
      return router.tapAt({ x: ndc.x, y: ndc.y });
    },
  };
}

describe('ndcFromPoint', () => {
  const rect = { left: 0, top: 0, width: 100, height: 100 };

  it('maps the middle of a rect to the origin of NDC', () => {
    expect(ndcFromPoint(50, 50, rect)).toEqual({ x: 0, y: 0 });
  });

  it('flips the vertical axis, because NDC measures y upwards', () => {
    expect(ndcFromPoint(0, 0, rect)).toEqual({ x: -1, y: 1 });
    expect(ndcFromPoint(100, 100, rect)).toEqual({ x: 1, y: -1 });
  });

  it('respects a rect that does not start at the viewport origin', () => {
    const offset = { left: 10, top: 20, width: 200, height: 100 };
    expect(ndcFromPoint(10, 20, offset)).toEqual({ x: -1, y: 1 });
    expect(ndcFromPoint(210, 120, offset)).toEqual({ x: 1, y: -1 });
  });
});

describe('ground-plane projection', () => {
  it('resolves the middle of the screen to the point the camera looks at', () => {
    const rig = harness({ x: 0.5, z: -0.5 });
    const command = rig.tapWorld({ x: 0.5, z: -0.5 });

    expect(command.kind).toBe('drive');
    expect(command.kind === 'drive' && command.target.x).toBeCloseTo(0.5, 3);
    expect(command.kind === 'drive' && command.target.z).toBeCloseTo(-0.5, 3);
  });

  it('carries a screen tap off to the camera-relative side, not the mirror', () => {
    const rig = harness();
    const right = new Vector3().setFromMatrixColumn(rig.camera.matrixWorld, 0);
    const car = { x: 5, z: 5 };

    const toTheRight = rig.tapWorld({ x: 1.2, z: 0 });
    const toTheLeft = rig.tapWorld({ x: -1.2, z: 0 });
    expect(toTheRight.kind).toBe('drive');
    expect(toTheLeft.kind).toBe('drive');

    const offsetOf = (command: typeof toTheRight): number => {
      const target = command.kind === 'drive' ? command.target : car;
      return (target.x - 0) * right.x + (target.z - 0) * right.z;
    };
    expect(offsetOf(toTheRight)).toBeGreaterThan(0);
    expect(offsetOf(toTheLeft)).toBeLessThan(0);
    // Symmetric taps land symmetric distances either side of the centre.
    expect(offsetOf(toTheRight)).toBeCloseTo(-offsetOf(toTheLeft), 3);
  });

  it('keeps resolving the ground for taps beyond the frustum', () => {
    const rig = harness();
    const command = rig.router.tapAt({ x: 8, y: 8 });

    expect(command.kind).toBe('drive');
    const target = command.kind === 'drive' ? command.target : undefined;
    expect(Number.isFinite(target?.x)).toBe(true);
    expect(Number.isFinite(target?.z)).toBe(true);
  });

  it('answers a camera that cannot see the ground with feedback, not a crash', () => {
    // A camera aimed along the horizon: its rays are parallel to the ground
    // plane, so there is no destination to resolve.
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.set(0, 5, 0);
    camera.lookAt(0, 5, -1);
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();
    const router = createInputRouter({ camera, grid, getCarPosition: () => CAR_AWAY });

    const command = router.tapAt({ x: 0, y: 0 });

    expect(command.kind).toBe('honk');
    expect(router.latest()).toBeUndefined();
  });
});

describe('the town is the whole world', () => {
  it('lands a tap outside the town on its edge, instead of driving into the void', () => {
    // TEST_MAP is 5x5, so the town reaches ±2.5 while the tap resolves to
    // (6, -6) — well out over the empty ground beyond it.
    const rig = harness();

    const command = rig.tapWorld({ x: 6, z: -6 });

    expect(command.kind).toBe('drive');
    expect(command.kind === 'drive' && command.target).toEqual({ x: 2.5, z: -2.5 });
  });

  it('leaves a tap inside the town exactly where it landed', () => {
    const rig = harness();

    const command = rig.tapWorld({ x: 1.75, z: 0.5 });

    expect(command.kind).toBe('drive');
    expect(command.kind === 'drive' && command.target.x).toBeCloseTo(1.75, 3);
    expect(command.kind === 'drive' && command.target.z).toBeCloseTo(0.5, 3);
  });
});

describe('dead-zone honk', () => {
  it('honks instead of driving when the tap lands under the car', () => {
    const rig = harness({ x: 0, z: 2 });
    rig.moveCarTo({ x: 0, z: 2 });

    const command = rig.tapWorld({ x: 0, z: 2 + DEAD_ZONE_RADIUS - 0.1 });

    expect(command.kind).toBe('honk');
    // Nothing to drive to: the feedback ring draws where the car already is.
    expect(command.kind === 'honk' && command.at).toEqual({ x: 0, z: 2 });
    expect(rig.router.latest()).toBeUndefined();
    // No path was emitted, so nothing is current either.
    expect(rig.router.isCurrent({ kind: 'drive', id: 1, target: { x: 0, z: 2 } })).toBe(
      false,
    );
  });

  it('drives when the tap clears the dead zone', () => {
    // Sideways, because the car sits 0.5 from the town's own southern edge.
    const rig = harness({ x: 0, z: 2 });
    rig.moveCarTo({ x: 0, z: 2 });

    const command = rig.tapWorld({ x: DEAD_ZONE_RADIUS + 0.1, z: 2 });

    expect(command.kind).toBe('drive');
    expect(rig.router.latest()?.target.x).toBeCloseTo(0.6, 2);
    expect(rig.router.latest()?.target.z).toBeCloseTo(2, 3);
  });

  it('judges the dead zone on the snapped target, so tapping a prop under the car honks', () => {
    // cone-2 sits at (-0.3, 0); the car idles just beside it.
    const rig = harness({ x: -0.3, z: 0.3 });
    rig.moveCarTo({ x: -0.3, z: 0.3 });

    const command = rig.tapWorld({ x: -0.3, z: 0 });

    expect(command.kind).toBe('honk');
    expect(rig.router.latest()).toBeUndefined();
  });
});

describe('tap-to-prop snapping', () => {
  it('snaps a near tap onto the prop it means', () => {
    const rig = harness();
    rig.moveCarTo(CAR_AWAY);

    // cone-1 sits at (0.3, 0); tap just short of it.
    const command = rig.tapWorld({ x: 0.3 + PROP_SNAP_RADIUS - 0.1, z: 0 });

    expect(command.kind).toBe('drive');
    expect(command.kind === 'drive' && command.propId).toBe('cone-1');
    expect(command.kind === 'drive' && command.target).toEqual({ x: 0.3, z: 0 });
  });

  it('takes the nearest prop when a tap could mean either', () => {
    const rig = harness();

    // Inside both cones' snap radius, but closer to the second.
    const command = rig.tapWorld({ x: -0.1, z: 0 });

    expect(command.kind === 'drive' && command.propId).toBe('cone-2');
    expect(command.kind === 'drive' && command.target).toEqual({ x: -0.3, z: 0 });
  });

  it('leaves a tap that lands clear of every prop where it landed', () => {
    const rig = harness();

    // Clear of both cones and the tree (the nearest is 0.85 away).
    const point = { x: 0.9, z: 0.6 };
    const command = rig.tapWorld(point);

    expect(command.kind === 'drive' && command.propId).toBeUndefined();
    expect(command.kind === 'drive' && command.target.x).toBeCloseTo(point.x, 2);
    expect(command.kind === 'drive' && command.target.z).toBeCloseTo(point.z, 2);
  });
});

describe('newest tap wins', () => {
  it('supersedes the previous destination with the newest one', () => {
    const rig = harness();
    const first = rig.tapWorld({ x: -1, z: -1 });
    const second = rig.tapWorld({ x: 1, z: 1 });

    expect(first.kind).toBe('drive');
    expect(second.kind).toBe('drive');
    expect(
      first.kind === 'drive' && second.kind === 'drive' && second.id,
    ).toBeGreaterThan(first.kind === 'drive' ? first.id : 0);
    expect(first.kind === 'drive' && rig.router.isCurrent(first)).toBe(false);
    expect(second.kind === 'drive' && rig.router.isCurrent(second)).toBe(true);
    expect(rig.router.latest()).toBe(second);
  });

  it('survives a mash: only the last of many taps stays current', () => {
    const rig = harness();
    const taps = [
      { x: -1.2, z: -0.8 },
      { x: 1.1, z: 0.9 },
      { x: -0.9, z: 1.2 },
      { x: 0.8, z: -1.1 },
      { x: 1.3, z: 0.4 },
    ];
    const commands = taps.map((point) => rig.tapWorld(point));

    const current = commands.filter(
      (command) => command.kind === 'drive' && rig.router.isCurrent(command),
    );
    expect(current).toHaveLength(1);
    expect(rig.router.latest()).toBe(current[0]);
    expect(rig.router.latest()?.target.x).toBeCloseTo(1.3, 2);
  });

  it('lets a honk keep its sequence number without stealing the destination', () => {
    const rig = harness({ x: 0, z: 2 });
    rig.moveCarTo({ x: 0, z: 2 });
    const destination = rig.tapWorld({ x: 1, z: 2 });

    const honk = rig.tapWorld({ x: 0, z: 2.2 });

    expect(honk.kind).toBe('honk');
    expect(destination.kind === 'drive' && rig.router.isCurrent(destination)).toBe(true);
    expect(rig.router.latest()).toBe(destination);
    expect(destination.kind === 'drive' && honk.id).toBeGreaterThan(destination.id);
  });
});
