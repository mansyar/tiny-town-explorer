import { OrthographicCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { Obstacle } from '../collision/collision';
import { createInputRouter } from '../input/inputRouter';
import { createTownGrid } from '../town/townGrid';
import { TOWN_MAP } from '../town/townMap';
import { createTrafficSystem } from './trafficSystem';

const grid = createTownGrid(TOWN_MAP);

/** Where the first mover stands before it has moved a step. */
function firstMover(obstacles: readonly Obstacle[]): { x: number; z: number } {
  const [box] = obstacles;
  const shape = box?.shape;
  if (shape?.kind !== 'box') {
    throw new Error('expected a box footprint');
  }
  return { x: shape.centre.x, z: shape.centre.z };
}

describe('movers are not town props (FR6)', () => {
  it('publishes no prop identity, so the 0.45 tap-snap can never select one', () => {
    const traffic = createTrafficSystem({ grid, seed: 7 });
    for (const obstacle of traffic.footprints()) {
      // The router snaps only to `snappable` town props (PROP_SNAP_RADIUS 0.45,
      // inputRouter): a footprint carries no prop identity at all, so it can
      // never become one however it is wired.
      expect(Object.keys(obstacle).sort()).toEqual(['id', 'shape', 'solid']);
      expect('snappable' in obstacle).toBe(false);
      expect(obstacle.id).toMatch(/^traffic-\d$/);
    }
  });

  it('a tap that lands on a mover resolves to the finger’s ground point', () => {
    // The mover stands in the street and swallows none of the tap: the router
    // never hears of it, so the command aims at the ground beneath the finger.
    const traffic = createTrafficSystem({ grid, seed: 7 });
    const mover = firstMover(traffic.footprints());
    const camera = new OrthographicCamera(-5, 5, 5, -5, 0.1, 30);
    camera.position.set(0, 8, 8);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    // The honk dead-zone measures from the car; the town's centre is a tile
    // corner, at least 0.7 from any tile centre a mover may stand on.
    const router = createInputRouter({
      camera,
      grid,
      getCarPosition: () => ({ x: 0, z: 0 }),
    });

    const ndc = new Vector3(mover.x, 0, mover.z).project(camera);
    const command = router.tapAt({ x: ndc.x, y: ndc.y });

    expect(command.kind).toBe('drive');
    if (command.kind !== 'drive') {
      throw new Error('expected a drive command');
    }
    expect(command.propId).toBeUndefined();
    expect(command.target.x).toBeCloseTo(mover.x, 3);
    expect(command.target.z).toBeCloseTo(mover.z, 3);
    expect(command.landed.x).toBeCloseTo(mover.x, 3);
    expect(command.landed.z).toBeCloseTo(mover.z, 3);
  });

  it('movers can never become mission targets', () => {
    // `answerMissions` matches taps against the closed MissionId list and
    // `missionFocus` answers with a mission's own point or the car: a
    // footprint's identity is neither, so traffic stays out of both inputs.
    const traffic = createTrafficSystem({ grid, seed: 7 });
    for (const obstacle of traffic.footprints()) {
      expect(['fire', 'iceCream', 'park', 'puppy']).not.toContain(obstacle.id);
    }
  });
});
