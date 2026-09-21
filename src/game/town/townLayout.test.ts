import { describe, expect, it } from 'vitest';
import { ROAD_MODELS } from '../assets/modelRegistry';
import { createTownGrid } from './townGrid';
import type { ModelPlacement } from './townLayout';
import { planTown, roadPlacementFor, yawForDirection } from './townLayout';
import { TOWN_MAP } from './townMap';
import type { RoadConnections } from './townTypes';

const grid = createTownGrid(TOWN_MAP);
const plan = planTown(grid);

function models(name: string): ModelPlacement | undefined {
  return plan.placements.find(
    (placement): placement is ModelPlacement =>
      placement.kind === 'model' && placement.name === name,
  );
}

const NO_CONNECTIONS: RoadConnections = {
  north: false,
  east: false,
  south: false,
  west: false,
};

describe('planTown — ground', () => {
  it('lays a ground quad on every map tile, at the tile centre', () => {
    for (let y = 0; y < grid.size; y++) {
      for (let x = 0; x < grid.size; x++) {
        const placement = plan.placements.find(
          (entry) => entry.name === `ground-${x}-${y}`,
        );
        expect(placement, `ground ${x},${y}`).toBeDefined();
        expect(placement?.kind).toBe('ground');
        expect(placement?.position).toEqual(grid.tileToWorld({ x, y }));
      }
    }
  });

  it('gives park tiles a different lawn colour from lots', () => {
    const park = plan.placements.find((entry) => entry.name === 'ground-1-1');
    const lot = plan.placements.find((entry) => entry.name === 'ground-2-2');
    expect(park?.kind === 'ground' && park.color).not.toBe(
      lot?.kind === 'ground' && lot.color,
    );
  });
});

describe('planTown — roads', () => {
  it('places a road model on exactly the authored road tiles', () => {
    const roadNames = plan.placements
      .filter((entry) => entry.kind === 'model' && entry.name.startsWith('road-'))
      .map((entry) => entry.name);
    const expected: string[] = [];
    for (let y = 0; y < grid.size; y++) {
      for (let x = 0; x < grid.size; x++) {
        if (grid.isRoad({ x, y })) {
          expected.push(`road-${x}-${y}`);
        }
      }
    }
    expect(roadNames.sort()).toEqual(expected.sort());
  });

  it('runs ring-road straights across their tiles and cross-street ones down', () => {
    // Top row between the corners: the ring road runs east-west.
    expect(models('road-1-0')?.url).toBe(ROAD_MODELS.straight);
    expect(models('road-1-0')?.yaw).toBeCloseTo(0);
    // The cross street at x3 runs north-south.
    expect(models('road-3-2')?.url).toBe(ROAD_MODELS.straight);
    expect(models('road-3-2')?.yaw).toBeCloseTo(Math.PI / 2);
  });

  it('uses the kit bend for every ring corner, rotated to its own elbow', () => {
    // The authored bend covers the west and south edges, so yaw 0 is the (5,0)
    // corner; yaw counts counterclockwise, so the rest follow a quarter turn apart:
    // (0,0) connects east and south; (5,0) south and west; (5,5) west and north;
    // (0,5) north and east.
    const corners = [
      { tile: 'road-0-0', yaw: Math.PI / 2 },
      { tile: 'road-5-0', yaw: 0 },
      { tile: 'road-5-5', yaw: (Math.PI / 2) * 3 },
      { tile: 'road-0-5', yaw: Math.PI },
    ] as const;
    for (const { tile, yaw } of corners) {
      expect(models(tile)?.url, tile).toBe(ROAD_MODELS.bend);
      expect(models(tile)?.yaw, tile).toBeCloseTo(yaw);
    }
  });

  it('uses the kit three-way tile for both tees, one of them turned about', () => {
    // (3,0): east, south and west connected — the south-stemmed tee as authored.
    expect(models('road-3-0')?.url).toBe(ROAD_MODELS.intersection);
    expect(models('road-3-0')?.yaw).toBeCloseTo(0);
    // (3,5): east, north and west — the same tile turned 180 degrees.
    expect(models('road-3-5')?.url).toBe(ROAD_MODELS.intersection);
    expect(models('road-3-5')?.yaw).toBeCloseTo(Math.PI);
  });

  it('maps every track shape the grid can derive to a kit model', () => {
    expect(
      roadPlacementFor('straight', { ...NO_CONNECTIONS, east: true, west: true }).url,
    ).toBe(ROAD_MODELS.straight);
    expect(
      roadPlacementFor('cross', {
        ...NO_CONNECTIONS,
        east: true,
        west: true,
        north: true,
        south: true,
      }).url,
    ).toBe(ROAD_MODELS.crossroad);
    expect(roadPlacementFor('end', { ...NO_CONNECTIONS, north: true }).url).toBe(
      ROAD_MODELS.end,
    );
    expect(roadPlacementFor('isolated', NO_CONNECTIONS).url).toBe(ROAD_MODELS.end);
    // Nothing to aim at, so the stub keeps the kit's authored orientation.
    expect(roadPlacementFor('isolated', NO_CONNECTIONS).yaw).toBe(0);
  });

  it('opens a dead-end tile toward the neighbour it still connects to', () => {
    // The kit's dead-end opens east as authored, so east is yaw 0 and the rest
    // go round counterclockwise from there.
    expect(roadPlacementFor('end', { ...NO_CONNECTIONS, east: true }).yaw).toBeCloseTo(0);
    expect(roadPlacementFor('end', { ...NO_CONNECTIONS, south: true }).yaw).toBeCloseTo(
      -Math.PI / 2,
    );
    expect(roadPlacementFor('end', { ...NO_CONNECTIONS, west: true }).yaw).toBeCloseTo(
      Math.PI,
    );
    expect(roadPlacementFor('end', { ...NO_CONNECTIONS, north: true }).yaw).toBeCloseTo(
      Math.PI / 2,
    );
  });
});

describe('planTown — houses and props', () => {
  it('mounts one model per authored house, at its lot, facing its road', () => {
    expect(grid.houses).toHaveLength(10);
    for (const house of grid.houses) {
      const placement = models(house.id);
      expect(placement, house.id).toBeDefined();
      expect(placement?.position).toEqual(house.position);
      expect(placement?.yaw, house.id).toBeCloseTo(yawForDirection(house.facing));
    }
  });

  it('caps house footprints to their lot and varies the models', () => {
    const houses = grid.houses.map((house) => models(house.id));
    for (const house of houses) {
      expect(house?.fitWithin).toBeCloseTo(grid.tileSize * 0.86);
    }
    expect(new Set(houses.map((house) => house?.url)).size).toBeGreaterThan(3);
  });

  it('mounts one model per authored prop, keyed to its kind', () => {
    expect(grid.props).toHaveLength(TOWN_MAP.props.length);
    for (const prop of grid.props) {
      const placement = models(prop.id);
      expect(placement, prop.id).toBeDefined();
      expect(placement?.position).toEqual(prop.position);
      expect(placement?.fitWithin).toBeUndefined();
    }
  });

  it('turns trees a quarter at a time so a park row is not one model stamped', () => {
    const yaws = grid.props
      .filter((prop) => prop.kind === 'tree')
      .map((prop) => models(prop.id)?.yaw);
    expect(new Set(yaws).size).toBeGreaterThan(1);
  });

  it('is deterministic: the same grid yields the same plan twice', () => {
    expect(planTown(createTownGrid(TOWN_MAP))).toEqual(
      planTown(createTownGrid(TOWN_MAP)),
    );
  });
});

describe('yawForDirection', () => {
  it('aims a model every way round, with south as the authored default', () => {
    expect(yawForDirection('south')).toBeCloseTo(0);
    expect(yawForDirection('north')).toBeCloseTo(Math.PI);
    expect(
      new Set(['north', 'east', 'south', 'west'].map((d) => yawForDirection(d as never)))
        .size,
    ).toBe(4);
  });
});
