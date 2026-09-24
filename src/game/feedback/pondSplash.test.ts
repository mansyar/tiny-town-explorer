import { describe, expect, it } from 'vitest';
import { createPuppySpots, isClearOfHouses, isScoopable } from '../mission/puppySpots';
import { findPath } from '../path/pathfinder';
import { createTownGrid } from '../town/townGrid';
import { TOWN_MAP } from '../town/townMap';
import { createVehicleMotor } from '../vehicle/vehicleMotor';
import { createPondWatcher } from './pondSplash';

/**
 * The pond splash (FR4): passable ground with a once-per-entry splash.
 *
 * The pond is never solid — only buildings block — so the water is a surface
 * the car may cross mid-route and the puppy may hide beside. The splash is a
 * trigger, not a collision: exactly one per entry, silent while the car stays,
 * armed again the moment it leaves.
 */

const grid = createTownGrid(TOWN_MAP);
const pond = grid.tileToWorld({ x: 7, y: 7 });
const road = grid.tileToWorld({ x: 7, y: 5 });

describe('the pond splash (FR4)', () => {
  it('raises exactly one splash per entry', () => {
    const watcher = createPondWatcher(grid);
    expect(watcher.note(road), 'outside is silent').toBe(false);
    expect(watcher.note(pond), 'entering fires').toBe(true);
    expect(watcher.note(pond), 'staying is silent').toBe(false);
    expect(watcher.note(pond)).toBe(false);
    expect(watcher.note(road), 'leaving is silent').toBe(false);
    expect(watcher.note(pond), 're-entry fires again').toBe(true);
  });

  it('never splashes outside the pond', () => {
    const watcher = createPondWatcher(grid);
    const dry = [
      road,
      grid.tileToWorld({ x: 3, y: 2 }), // a street
      grid.tileToWorld({ x: 1, y: 1 }), // the park
      grid.tileToWorld({ x: 8, y: 8 }), // a garden
    ];
    for (const point of dry) {
      expect(watcher.note(point)).toBe(false);
    }
  });

  it('keeps the water a scoopable, house-clear surface', () => {
    // Only buildings block (FR4): every hiding spot - including the one on the
    // pond's own green - stays clear of houses and scoopable with the water in.
    for (const spot of createPuppySpots({ grid }).spots) {
      expect(isClearOfHouses(grid, spot.position), spot.id).toBe(true);
      expect(isScoopable(grid, spot.position), spot.id).toBe(true);
    }
  });

  it('drives a route onto the water and completes it', () => {
    // Never solid (FR4): a path that ends on the pond runs to the end - no
    // bonk, no abandoned leg.
    const path = findPath(grid, road, pond);
    expect(path?.waypoints.length ?? 0, 'a route onto the water exists').toBeGreaterThan(
      0,
    );
    const motor = createVehicleMotor({ position: road });
    if (path) motor.setPath(path);
    for (let frame = 0; frame < 60 * 20; frame += 1) {
      motor.update(1 / 60);
    }
    expect(motor.isDriving(), 'the leg completed').toBe(false);
    expect(motor.bonkCount(), 'the water never stopped the car').toBe(0);
  });
});
