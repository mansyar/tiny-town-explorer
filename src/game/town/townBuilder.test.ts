import { BufferGeometry, Group, Material, Mesh, MeshLambertMaterial } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildTown, yawForDirection } from './townBuilder';
import type { TownGrid } from './townGrid';
import { createTownGrid } from './townGrid';
import { TOWN_MAP } from './townMap';
import type { Direction } from './townTypes';

const grid = createTownGrid(TOWN_MAP);

function findMesh(root: Group, name: string): Mesh | undefined {
  const object = root.getObjectByName(name);
  return object instanceof Mesh ? object : undefined;
}

function findGroup(root: Group, name: string): Group | undefined {
  const object = root.getObjectByName(name);
  return object instanceof Group ? object : undefined;
}

function roadTiles(source: TownGrid): { readonly x: number; readonly y: number }[] {
  const tiles = [];
  for (let y = 0; y < source.size; y++) {
    for (let x = 0; x < source.size; x++) {
      if (source.isRoad({ x, y })) {
        tiles.push({ x, y });
      }
    }
  }
  return tiles;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('buildTown — ground and roads', () => {
  it('lays one ground tile per map tile with park patches lighter', () => {
    const town = buildTown(grid);

    for (let y = 0; y < grid.size; y++) {
      for (let x = 0; x < grid.size; x++) {
        const ground = findMesh(town.group, `ground-${x}-${y}`);
        expect(ground, `ground tile ${x},${y}`).toBeDefined();
        const centre = grid.tileToWorld({ x, y });
        expect(ground?.position.x).toBeCloseTo(centre.x);
        expect(ground?.position.z).toBeCloseTo(centre.z);
      }
    }

    const parkGround = findMesh(town.group, 'ground-1-1');
    const lotGround = findMesh(town.group, 'ground-2-2');
    expect(getMaterialColor(parkGround)).not.toBe(getMaterialColor(lotGround));

    town.dispose();
  });

  it('draws a road surface for exactly the authored road tiles', () => {
    const town = buildTown(grid);

    for (const tile of roadTiles(grid)) {
      expect(
        findMesh(town.group, `road-${tile.x}-${tile.y}`),
        `road ${tile.x},${tile.y}`,
      ).toBeDefined();
    }
    for (let y = 0; y < grid.size; y++) {
      for (let x = 0; x < grid.size; x++) {
        if (!grid.isRoad({ x, y })) {
          expect(findMesh(town.group, `road-${x}-${y}`)).toBeUndefined();
        }
      }
    }

    town.dispose();
  });

  it('adds one lane marking per road connection, layered above the road', () => {
    const town = buildTown(grid);

    const junction = findMesh(town.group, 'marking-0-0-south');
    const road = findMesh(town.group, 'road-0-0');
    expect(junction).toBeDefined();
    expect(junction?.position.y).toBeGreaterThan(road?.position.y ?? Number.MAX_VALUE);

    // North-west ring corner connects east and south only.
    expect(findMesh(town.group, 'marking-0-0-north')).toBeUndefined();
    expect(findMesh(town.group, 'marking-0-0-west')).toBeUndefined();
    expect(findMesh(town.group, 'marking-0-0-east')).toBeDefined();

    // The cross street meets the top ring road in a three-way junction.
    expect(findMesh(town.group, 'marking-3-0-north')).toBeUndefined();
    for (const direction of ['east', 'south', 'west']) {
      expect(
        findMesh(town.group, `marking-3-0-${direction}`),
        `junction ${direction}`,
      ).toBeDefined();
    }

    // The cross street itself runs straight between lots.
    expect(findMesh(town.group, 'marking-3-2-north')).toBeDefined();
    expect(findMesh(town.group, 'marking-3-2-south')).toBeDefined();
    expect(findMesh(town.group, 'marking-3-2-east')).toBeUndefined();
    expect(findMesh(town.group, 'marking-3-2-west')).toBeUndefined();

    town.dispose();
  });

  it('shares one geometry across every tile of a kind', () => {
    const town = buildTown(grid);

    const roadGeometries = new Set(
      roadTiles(grid).map(
        (tile) => findMesh(town.group, `road-${tile.x}-${tile.y}`)?.geometry,
      ),
    );
    const groundGeometries = new Set(
      ['ground-0-0', 'ground-1-1', 'ground-2-2'].map(
        (name) => findMesh(town.group, name)?.geometry,
      ),
    );

    expect(roadGeometries.size).toBe(1);
    expect(groundGeometries.size).toBe(1);

    town.dispose();
  });
});

describe('buildTown — houses and props', () => {
  it('builds every authored house on its lot, facing its road', () => {
    const town = buildTown(grid);
    expect(grid.houses).toHaveLength(10);

    for (const house of grid.houses) {
      const node = findGroup(town.group, house.id);
      expect(node, house.id).toBeDefined();
      expect(node?.position.x).toBeCloseTo(house.position.x);
      expect(node?.position.z).toBeCloseTo(house.position.z);
      expect(node?.rotation.y, `${house.id} facing ${house.facing}`).toBeCloseTo(
        yawForDirection(house.facing),
      );
      expect(findMesh(node ?? town.group, `${house.id}-body`)).toBeDefined();
      expect(findMesh(node ?? town.group, `${house.id}-roof`)).toBeDefined();
      expect(findMesh(node ?? town.group, `${house.id}-door`)).toBeDefined();
    }

    town.dispose();
  });

  it('turns each facing yaw toward its road', () => {
    const facings: readonly Direction[] = ['north', 'east', 'south', 'west'];
    const yaws = facings.map((facing) => yawForDirection(facing));

    expect(new Set(yaws).size).toBe(facings.length);
    expect(yawForDirection('south')).toBeCloseTo(0);
    expect(yawForDirection('north')).toBeCloseTo(Math.PI);
  });

  it('builds one prop node per authored prop with kind-specific parts', () => {
    const town = buildTown(grid);

    expect(grid.props).toHaveLength(TOWN_MAP.props.length);
    for (const prop of grid.props) {
      const node = findGroup(town.group, prop.id);
      expect(node, prop.id).toBeDefined();
      expect(node?.position.x).toBeCloseTo(prop.position.x);
      expect(node?.position.z).toBeCloseTo(prop.position.z);
      expect(node?.children.length, `${prop.id} parts`).toBeGreaterThan(0);
    }

    expect(findMesh(town.group, 'hydrant-1-barrel')).toBeDefined();
    expect(findMesh(town.group, 'powerPole-1-pole')).toBeDefined();
    expect(findMesh(town.group, 'tree-1-foliage')).toBeDefined();

    town.dispose();
  });

  it('marks solid town objects as shadow casters and ground as receiver', () => {
    const town = buildTown(grid);

    const house = findGroup(town.group, 'house-1');
    expect(findMesh(house ?? town.group, 'house-1-body')?.castShadow).toBe(true);
    expect(findMesh(town.group, 'ground-0-0')?.receiveShadow).toBe(true);
    expect(findMesh(town.group, 'road-0-0')?.receiveShadow).toBe(true);

    town.dispose();
  });
});

describe('buildTown — teardown', () => {
  it('dispose frees every geometry and material, then empties the group', () => {
    const geometrySpy = vi.spyOn(BufferGeometry.prototype, 'dispose');
    const materialSpy = vi.spyOn(Material.prototype, 'dispose');
    const town = buildTown(grid);

    expect(town.group.children.length).toBeGreaterThan(0);
    town.dispose();

    expect(geometrySpy).toHaveBeenCalled();
    expect(materialSpy).toHaveBeenCalled();
    expect(town.group.children).toHaveLength(0);
  });
});

function getMaterialColor(mesh: Mesh | undefined): number | undefined {
  const material = mesh?.material;
  return material instanceof MeshLambertMaterial ? material.color.getHex() : undefined;
}
