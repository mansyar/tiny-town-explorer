import { Box3, BoxGeometry, Group, Mesh, MeshLambertMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import type { ModelLibrary } from '../assets/modelLibrary';
import {
  createVehicleActor,
  MODEL_FACING_YAW,
  ROAD_SURFACE_HEIGHT,
} from './vehicleActor';
import { createVehicleMotor } from './vehicleMotor';

/** A car-shaped box standing on its origin, like the kit vehicles. */
function standingModel(): Group {
  const group = new Group();
  group.add(new Mesh(new BoxGeometry(0.5, 0.5, 0.9), new MeshLambertMaterial()));
  return group;
}

/** A model authored a unit below the origin, like the kit's connectable track. */
function hangingModel(): Group {
  const group = new Group();
  const mesh = new Mesh(new BoxGeometry(0.5, 0.5, 0.9), new MeshLambertMaterial());
  mesh.position.y = -1;
  group.add(mesh);
  return group;
}

const library = (make: () => Group): ModelLibrary => ({
  load: async () => make(),
  instantiate: async () => make(),
  dispose: () => undefined,
});

/** Lowest point of an actor's model, in world units. */
function baseHeight(actor: Awaited<ReturnType<typeof createVehicleActor>>): number {
  actor.object.updateMatrixWorld(true);
  return new Box3().setFromObject(actor.object).min.y;
}

describe('createVehicleActor', () => {
  it('seats the model on the asphalt, whatever frame the kit authored it in', async () => {
    const standing = await createVehicleActor(
      library(standingModel),
      'car.glb',
      createVehicleMotor(),
    );
    const hanging = await createVehicleActor(
      library(hangingModel),
      'car.glb',
      createVehicleMotor(),
    );

    expect(baseHeight(standing)).toBeCloseTo(ROAD_SURFACE_HEIGHT, 6);
    // A model hanging 1.25 units below its origin gets lifted, not buried.
    expect(baseHeight(hanging)).toBeCloseTo(ROAD_SURFACE_HEIGHT, 6);
  });

  it('turns the kit’s rear-facing model around to face the car’s nose', async () => {
    const actor = await createVehicleActor(
      library(standingModel),
      'car.glb',
      createVehicleMotor(),
    );

    expect(actor.object.children[0]?.rotation.y).toBeCloseTo(MODEL_FACING_YAW, 10);
  });

  it('starts where the car already is', async () => {
    const motor = createVehicleMotor({ position: { x: 2, z: -1 }, heading: Math.PI / 2 });
    const actor = await createVehicleActor(library(standingModel), 'car.glb', motor);

    expect(actor.object.position.x).toBeCloseTo(2, 10);
    expect(actor.object.position.z).toBeCloseTo(-1, 10);
    expect(actor.object.rotation.y).toBeCloseTo(Math.PI / 2, 10);
  });

  it('follows the car as it drives', async () => {
    const motor = createVehicleMotor({ position: { x: 0, z: 0 }, heading: Math.PI / 2 });
    const actor = await createVehicleActor(library(standingModel), 'car.glb', motor);
    motor.setPath({ waypoints: [], destination: { x: 2, z: 0 } });

    for (const _frame of Array.from({ length: 30 })) {
      motor.update(1 / 60);
    }
    actor.sync();

    expect(actor.object.position.x).toBeCloseTo(motor.position.x, 10);
    expect(actor.object.position.z).toBeCloseTo(motor.position.z, 10);
    expect(actor.object.rotation.y).toBeCloseTo(motor.heading(), 10);
    expect(actor.object.position.x).toBeGreaterThan(0);
  });
});
