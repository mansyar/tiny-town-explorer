import { BoxGeometry, Group, Mesh, MeshLambertMaterial } from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { ModelLibrary } from '../assets/modelLibrary';
import { createTownGrid } from './townGrid';
import type { TownPlan } from './townLayout';
import { planTown } from './townLayout';
import { TOWN_MAP } from './townMap';
import { mountTown } from './townRenderer';

const grid = createTownGrid(TOWN_MAP);

/** A 2 x 1 x 2 box standing on its origin, like a kit building. */
function boxModel(name: string): Group {
  const group = new Group();
  group.name = name;
  group.add(
    new Mesh(new BoxGeometry(2, 1, 2), new MeshLambertMaterial({ name: `${name}-mat` })),
  );
  return group;
}

/** A model hanging below the origin, like the Toy Car Kit's track pieces. */
function hangingModel(name: string): Group {
  const group = new Group();
  group.name = name;
  const mesh = new Mesh(new BoxGeometry(1, 0.5, 1), new MeshLambertMaterial());
  mesh.position.y = -1;
  group.add(mesh);
  return group;
}

/** A model already narrower than a one-tile lot, so no fitting is needed. */
function smallModel(name: string): Group {
  const group = new Group();
  group.name = name;
  group.add(new Mesh(new BoxGeometry(0.5, 1, 0.5), new MeshLambertMaterial()));
  return group;
}

/** A model with no footprint at all — a degenerate export. */
function flatModel(name: string): Group {
  const group = new Group();
  group.name = name;
  group.add(new Mesh(new BoxGeometry(0, 2, 0), new MeshLambertMaterial()));
  return group;
}

interface StubLibrary {
  readonly library: ModelLibrary;
  readonly urls: string[];
}

function stubLibrary(make: (url: string) => Group = boxModel): StubLibrary {
  const urls: string[] = [];
  return {
    urls,
    library: {
      load: async (url: string) => make(url),
      instantiate: async (url: string) => {
        urls.push(url);
        return make(url).clone(true);
      },
      dispose: () => undefined,
    },
  };
}

describe('mountTown', () => {
  it('mounts a node per placement, named after the plan', async () => {
    const stub = stubLibrary();
    const plan = planTown(grid);
    const town = await mountTown(grid, stub.library);

    expect(town.group.children).toHaveLength(plan.placements.length);
    for (const name of ['ground-0-0', 'road-0-0', 'house-1', 'cone-1']) {
      expect(town.group.getObjectByName(name), name).toBeDefined();
    }
    expect(stub.urls).toHaveLength(
      plan.placements.filter((placement) => placement.kind === 'model').length,
    );

    town.dispose();
  });

  it('lays ground quads flat and receiving shadow', async () => {
    const town = await mountTown(grid, stubLibrary().library);
    const ground = town.group.getObjectByName('ground-0-0');

    expect(ground).toBeInstanceOf(Mesh);
    expect(ground?.rotation.x).toBeCloseTo(-Math.PI / 2);
    const centre = grid.tileToWorld({ x: 0, y: 0 });
    expect(ground?.position.x).toBeCloseTo(centre.x);
    expect(ground?.position.z).toBeCloseTo(centre.z);
    expect((ground as Mesh).receiveShadow).toBe(true);
    // One plane geometry shared by every ground tile keeps setup cost flat.
    const first = town.group.getObjectByName('ground-0-0') as Mesh;
    const second = town.group.getObjectByName('ground-1-1') as Mesh;
    expect(first.geometry).toBe(second.geometry);

    town.dispose();
  });

  it('applies each road tile’s planned position and rotation', async () => {
    const town = await mountTown(grid, stubLibrary().library);
    const ring = town.group.getObjectByName('road-1-0');
    const cross = town.group.getObjectByName('road-3-2');

    expect(ring?.rotation.y).toBeCloseTo(0);
    expect(cross?.rotation.y).toBeCloseTo(Math.PI / 2);
    const centre = grid.tileToWorld({ x: 3, y: 2 });
    expect(cross?.position.x).toBeCloseTo(centre.x);
    expect(cross?.position.z).toBeCloseTo(centre.z);

    town.dispose();
  });

  it('scales an oversized house down to its lot, and leaves kit-sized models alone', async () => {
    const town = await mountTown(grid, stubLibrary().library);
    const house = town.group.getObjectByName('house-1');
    const road = town.group.getObjectByName('road-0-0');

    // A 2-unit-wide building capped at 0.86 units of lot.
    expect(house?.scale.x).toBeCloseTo(0.43);
    expect(house?.scale.x).toBe(house?.scale.z);
    expect(road?.scale.x).toBe(1);

    town.dispose();
  });

  it('leaves a model that already fits its lot at the kit’s own scale', async () => {
    const plan: TownPlan = {
      placements: [
        {
          kind: 'model',
          name: 'house-1',
          url: 'house.glb',
          position: { x: 0, z: 0 },
          yaw: 0,
          fitWithin: 1,
        },
      ],
    };
    const town = await mountTown(grid, stubLibrary(smallModel).library, plan);

    expect(town.group.getObjectByName('house-1')?.scale.x).toBe(1);

    town.dispose();
  });

  it('never divides by a degenerate footprint', async () => {
    const plan: TownPlan = {
      placements: [
        {
          kind: 'model',
          name: 'house-1',
          url: 'house.glb',
          position: { x: 0, z: 0 },
          yaw: 0,
          fitWithin: 1,
        },
      ],
    };
    const town = await mountTown(grid, stubLibrary(flatModel).library, plan);
    const node = town.group.getObjectByName('house-1');

    // No horizontal extent to fit: mount it as authored rather than collapsing
    // it to zero or scaling it to infinity.
    expect(node?.scale.x).toBe(1);
    // Its 2-tall body is centred on the origin, so seating lifts it by 1.
    expect(node?.position.y).toBeCloseTo(1);

    town.dispose();
  });

  it('seats models on the ground whatever frame the kit authored them in', async () => {
    const town = await mountTown(grid, stubLibrary(hangingModel).library);
    const node = town.group.getObjectByName('road-0-0');

    // The 0.5-tall body is centred a unit below the origin, so its lowest point
    // sits 1.25 under: seating lifts it by exactly that, whatever the kit's own
    // origin convention was.
    expect(node?.position.y).toBeCloseTo(1.25);

    town.dispose();
  });

  it('dispose frees ground resources and empties the group', async () => {
    const geometrySpy = vi.spyOn(BoxGeometry.prototype, 'dispose');
    const materialSpy = vi.spyOn(MeshLambertMaterial.prototype, 'dispose');
    const town = await mountTown(grid, stubLibrary().library);

    expect(town.group.children.length).toBeGreaterThan(0);
    town.dispose();

    expect(geometrySpy).not.toHaveBeenCalled();
    expect(materialSpy).toHaveBeenCalled();
    expect(town.group.children).toHaveLength(0);
    vi.restoreAllMocks();
  });
});
