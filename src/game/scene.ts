import {
  Color,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  Mesh,
  MeshLambertMaterial,
  PlaneGeometry,
  Scene,
} from 'three';

/** Sky color shared by the scene background, page theme, and manifest. */
export const SKY_COLOR = 0x87ceeb;

/** Soft green of the empty town ground (town data replaces this in Phase 2). */
const GROUND_COLOR = 0x7cc47c;

/**
 * Ground plate side length in world units. Sized to sit inside the smoke-test
 * camera frame so the sky, fog, and horizon stay visible; the Phase 2 town
 * data replaces it with the authored map extent.
 */
const GROUND_SIZE = 24;

/** A built town scene plus the teardown needed by tests. */
export interface TownScene {
  readonly scene: Scene;
  /** Frees every geometry/material and empties the scene graph. */
  dispose(): void;
}

/**
 * Builds the plain empty-town scene: sky, fog, ground, and daylight.
 *
 * Shadows stay off until the town content exists, so the Phase 2 render pass
 * can measure a real frame budget before paying for shadow maps.
 */
export function createTownScene(): TownScene {
  const scene = new Scene();
  scene.background = new Color(SKY_COLOR);
  // Fog fades the far edge of the ground into the sky for calm depth.
  scene.fog = new Fog(SKY_COLOR, 80, 190);
  scene.add(createGround(), createLights());

  return {
    scene,
    dispose(): void {
      scene.traverse((object) => {
        if (!(object instanceof Mesh)) {
          return;
        }
        object.geometry.dispose();
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        for (const material of materials) {
          material.dispose();
        }
      });
      scene.clear();
    },
  };
}

function createGround(): Mesh {
  const ground = new Mesh(
    new PlaneGeometry(GROUND_SIZE, GROUND_SIZE),
    new MeshLambertMaterial({ color: GROUND_COLOR }),
  );
  ground.name = 'ground';
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  return ground;
}

/** Soft daylight: sky/ground bounce plus one warm sun for readable volume. */
function createLights(): Group {
  const lights = new Group();
  lights.name = 'lights';

  const ambient = new HemisphereLight(0xcfe8ff, 0x9fd39f, 1.4);
  ambient.name = 'hemisphereLight';

  const sun = new DirectionalLight(0xfff2d8, 2.2);
  sun.name = 'sunLight';
  sun.position.set(24, 34, 18);

  lights.add(ambient, sun, sun.target);
  return lights;
}
