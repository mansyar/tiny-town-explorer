import type { BufferGeometry, Material } from 'three';
import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshLambertMaterial,
  PlaneGeometry,
} from 'three';
import type { TownGrid, TownProp } from './townGrid';
import type { Direction, TileCoord } from './townTypes';
import { DIRECTION_STEPS, DIRECTIONS } from './townTypes';

/**
 * Flat decal heights. Each layer sits a hair above the one below so coplanar
 * surfaces never z-fight: ground, then the road surface, then lane markings.
 */
const GROUND_Y = 0;
const ROAD_Y = 0.02;
const MARKING_Y = 0.035;

/** Roof colourways handed out by house index; cheerful primaries per guidelines. */
const ROOF_COLORWAYS = [0xe4572e, 0x3d9be9, 0x7bc043, 0xf3a712, 0xd94f8b] as const;

const COLORS = {
  lotGround: 0x8ed08e,
  parkGround: 0xa9e0a9,
  road: 0x9aa0ab,
  marking: 0xf4f4f6,
  houseWall: 0xf7f2e5,
  door: 0x8a6a4f,
  hydrant: 0xe4572e,
  pole: 0xa08360,
  trunk: 0x8a6a4f,
  foliage: 0x5fae52,
} as const;

/** Angle that turns a mesh's local `+z` front toward the given direction. */
export function yawForDirection(direction: Direction): number {
  switch (direction) {
    case 'north':
      return Math.PI;
    case 'east':
      return Math.PI / 2;
    case 'south':
      return 0;
    case 'west':
      return -Math.PI / 2;
  }
}

/** The built town plus the teardown needed by tests. */
export interface TownBuild {
  readonly group: Group;
  /** Frees every geometry/material created for this town. */
  dispose(): void;
}

/**
 * Builds the town scene graph from authored map data: ground tiles, road
 * surfaces with lane markings, houses on their lots, and crashable props.
 *
 * Geometry is shared across every instance of a kind (one unit box, one unit
 * plane, one unit cylinder, one roof cone) and positioned by transform, which
 * keeps draw-call setup cheap for the iPad budget. These are stand-ins for
 * the Kenney kit models; the tile/prop factories are the seam where the GLB
 * assets slot in.
 */
export function buildTown(grid: TownGrid): TownBuild {
  const resources = createResources();
  const group = new Group();
  group.name = 'town';

  for (let y = 0; y < grid.size; y++) {
    for (let x = 0; x < grid.size; x++) {
      const tile = { x, y };
      const kind = grid.tileAt(tile);
      if (kind === undefined) {
        continue;
      }
      group.add(buildGroundTile(grid, tile, kind === 'park', resources));
      if (kind === 'road') {
        group.add(...buildRoad(grid, tile, resources));
      }
    }
  }

  grid.houses.forEach((house, index) => {
    group.add(buildHouse(grid, house.position, house.facing, house.id, index, resources));
  });

  for (const prop of grid.props) {
    group.add(buildProp(grid, prop, resources));
  }

  return {
    group,
    dispose(): void {
      for (const geometry of resources.geometries) {
        geometry.dispose();
      }
      for (const material of resources.materials) {
        material.dispose();
      }
      group.clear();
    },
  };
}

interface Resources {
  readonly plane: PlaneGeometry;
  readonly box: BoxGeometry;
  readonly cylinder: CylinderGeometry;
  readonly cone: ConeGeometry;
  readonly materials: Material[];
  readonly geometries: BufferGeometry[];
  readonly materialByColor: Map<number, MeshLambertMaterial>;
}

function createResources(): Resources {
  const plane = new PlaneGeometry(1, 1);
  plane.rotateX(-Math.PI / 2);
  const box = new BoxGeometry(1, 1, 1);
  const cylinder = new CylinderGeometry(0.5, 0.5, 1, 12);
  const cone = new ConeGeometry(0.5, 1, 4);

  return {
    plane,
    box,
    cylinder,
    cone,
    materials: [],
    geometries: [plane, box, cylinder, cone],
    materialByColor: new Map(),
  };
}

function materialFor(resources: Resources, color: number): MeshLambertMaterial {
  const existing = resources.materialByColor.get(color);
  if (existing !== undefined) {
    return existing;
  }
  const material = new MeshLambertMaterial({ color });
  resources.materialByColor.set(color, material);
  resources.materials.push(material);
  return material;
}

/** A flat, ground-aligned quad scaled to the given world footprint. */
function decal(
  resources: Resources,
  name: string,
  color: number,
  position: { readonly x: number; readonly z: number },
  width: number,
  depth: number,
  height: number,
): Mesh {
  const mesh = new Mesh(resources.plane, materialFor(resources, color));
  mesh.name = name;
  mesh.position.set(position.x, height, position.z);
  mesh.scale.set(width, 1, depth);
  mesh.receiveShadow = true;
  return mesh;
}

/** A unit-box mesh scaled and placed by its base centre. */
function solid(
  resources: Resources,
  name: string,
  color: number,
  position: { readonly x: number; readonly y: number; readonly z: number },
  size: { readonly x: number; readonly y: number; readonly z: number },
): Mesh {
  const mesh = new Mesh(resources.box, materialFor(resources, color));
  mesh.name = name;
  mesh.scale.set(size.x, size.y, size.z);
  mesh.position.set(position.x, position.y + size.y / 2, position.z);
  mesh.castShadow = true;
  return mesh;
}

function buildGroundTile(
  grid: TownGrid,
  tile: TileCoord,
  isPark: boolean,
  resources: Resources,
): Mesh {
  const center = grid.tileToWorld(tile);
  return decal(
    resources,
    `ground-${tile.x}-${tile.y}`,
    isPark ? COLORS.parkGround : COLORS.lotGround,
    center,
    grid.tileSize,
    grid.tileSize,
    GROUND_Y,
  );
}

/**
 * Road surface plus one lane mark per connected neighbour, which makes the
 * derived track-piece shape legible before the Kenney tiles arrive.
 */
function buildRoad(grid: TownGrid, tile: TileCoord, resources: Resources): Mesh[] {
  const center = grid.tileToWorld(tile);
  const size = grid.tileSize;
  const meshes: Mesh[] = [
    decal(resources, `road-${tile.x}-${tile.y}`, COLORS.road, center, size, size, ROAD_Y),
  ];

  const connections = grid.roadConnections(tile);
  for (const direction of DIRECTIONS) {
    if (!connections[direction]) {
      continue;
    }
    const step = DIRECTION_STEPS[direction];
    const alongX = step.x !== 0;
    meshes.push(
      decal(
        resources,
        `marking-${tile.x}-${tile.y}-${direction}`,
        COLORS.marking,
        {
          x: center.x + step.x * size * 0.25,
          z: center.z + step.y * size * 0.25,
        },
        alongX ? size * 0.5 : size * 0.08,
        alongX ? size * 0.08 : size * 0.5,
        MARKING_Y,
      ),
    );
  }
  return meshes;
}

function buildHouse(
  grid: TownGrid,
  position: { readonly x: number; readonly z: number },
  facing: Direction,
  id: string,
  index: number,
  resources: Resources,
): Group {
  const size = grid.tileSize;
  const house = new Group();
  house.name = id;
  house.position.set(position.x, GROUND_Y, position.z);
  house.rotation.y = yawForDirection(facing);

  const bodySize = { x: size * 0.62, y: size * 0.42, z: size * 0.56 };
  const body = solid(
    resources,
    `${id}-body`,
    COLORS.houseWall,
    { x: 0, y: 0, z: 0 },
    bodySize,
  );

  const roof = new Mesh(
    resources.cone,
    materialFor(
      resources,
      ROOF_COLORWAYS[index % ROOF_COLORWAYS.length] ?? COLORS.houseWall,
    ),
  );
  roof.name = `${id}-roof`;
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(size * 0.86, size * 0.34, size * 0.86);
  roof.position.y = bodySize.y + size * 0.17;
  roof.castShadow = true;

  // Door on the local +z wall, so the authored facing is visible (and testable).
  const door = solid(
    resources,
    `${id}-door`,
    COLORS.door,
    { x: 0, y: 0, z: bodySize.z / 2 },
    { x: size * 0.16, y: size * 0.22, z: size * 0.03 },
  );

  house.add(body, roof, door);
  return house;
}

function buildProp(grid: TownGrid, prop: TownProp, resources: Resources): Group {
  const size = grid.tileSize;
  const node = new Group();
  node.name = prop.id;
  node.position.set(prop.position.x, GROUND_Y, prop.position.z);

  switch (prop.kind) {
    case 'hydrant':
      node.add(
        cylinderBody(
          resources,
          `${prop.id}-barrel`,
          COLORS.hydrant,
          size * 0.07,
          size * 0.2,
        ),
        solid(
          resources,
          `${prop.id}-cap`,
          COLORS.hydrant,
          { x: 0, y: size * 0.2, z: 0 },
          { x: size * 0.12, y: size * 0.06, z: size * 0.12 },
        ),
      );
      break;
    case 'powerPole':
      node.add(
        cylinderBody(
          resources,
          `${prop.id}-pole`,
          COLORS.pole,
          size * 0.035,
          size * 0.85,
        ),
        solid(
          resources,
          `${prop.id}-crossbar`,
          COLORS.pole,
          { x: 0, y: size * 0.66, z: 0 },
          { x: size * 0.34, y: size * 0.04, z: size * 0.05 },
        ),
      );
      break;
    case 'tree':
      node.add(
        cylinderBody(
          resources,
          `${prop.id}-trunk`,
          COLORS.trunk,
          size * 0.05,
          size * 0.22,
        ),
        coneBody(
          resources,
          `${prop.id}-foliage`,
          COLORS.foliage,
          size * 0.3,
          size * 0.5,
          size * 0.22,
        ),
      );
      break;
  }

  return node;
}

function cylinderBody(
  resources: Resources,
  name: string,
  color: number,
  radius: number,
  height: number,
): Mesh {
  const mesh = new Mesh(resources.cylinder, materialFor(resources, color));
  mesh.name = name;
  mesh.scale.set(radius * 2, height, radius * 2);
  mesh.position.y = height / 2;
  mesh.castShadow = true;
  return mesh;
}

function coneBody(
  resources: Resources,
  name: string,
  color: number,
  radius: number,
  height: number,
  baseY: number,
): Mesh {
  const mesh = new Mesh(resources.cone, materialFor(resources, color));
  mesh.name = name;
  mesh.scale.set(radius * 2, height, radius * 2);
  mesh.position.y = baseY + height / 2;
  mesh.castShadow = true;
  return mesh;
}
