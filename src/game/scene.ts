import { Color, DirectionalLight, Fog, Group, HemisphereLight, Mesh, Scene } from 'three';

/** Sky color shared by the scene background, page theme, and manifest. */
export const SKY_COLOR = 0x87ceeb;

/**
 * Half-width of the sun's shadow frustum, in world units. It spans the whole
 * 6x6 town plus a margin for the camera's neighbours, which is what keeps a
 * single 1024 shadow map sharp enough on the performance-floor device.
 */
const SUN_SHADOW_EXTENT = 8;

/**
 * Where the sun stands, in world units. Shared rather than private because it
 * is not only the light's business: a flat blob shadow has to land where the
 * sun would actually throw it, so anything that fakes a shadow reads the
 * direction from here instead of hard-coding it and drifting from the light.
 */
export const SUN_POSITION = { x: 12, y: 10, z: 9 } as const;

/**
 * Where the sun throws the shadow of a point `height` above the ground, in
 * world x/z.
 *
 * The light travels along `-SUN_POSITION`, so a point at height `h` lands at
 * `-(x, z) / y * h` — for this sun, 1.2 and 0.9 units of shadow per unit of
 * height, toward **negative** x and z. The sign is the whole point: a shadow
 * falls away from the light, so an offset the other way makes a fake shadow
 * point into the sun and contradict every real one beside it.
 */
export function sunGroundOffset(height: number): {
  readonly x: number;
  readonly z: number;
} {
  return {
    x: (-SUN_POSITION.x / SUN_POSITION.y) * height,
    z: (-SUN_POSITION.z / SUN_POSITION.y) * height,
  };
}

/** The empty stage (sky, fog, daylight) that the town is added to. */
export interface GameScene {
  readonly scene: Scene;
  /** Frees every geometry/material in the graph and empties it. */
  dispose(): void;
}

/**
 * Builds the scene shell: background, distance fog, and soft daylight.
 *
 * Geometry belongs to whoever built it (the town builder owns its own
 * teardown); this scene is the stage they are mounted on.
 */
export function createScene(): GameScene {
  const scene = new Scene();
  scene.background = new Color(SKY_COLOR);
  // Fog fades the far edge of the town into the sky for calm depth. Ranges
  // are set just beyond the camera-to-town distance so the near lots stay
  // crisp; the camera rig retunes these for its own framing.
  scene.fog = new Fog(SKY_COLOR, 16, 40);
  scene.add(createLights());

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

/** Soft daylight: sky/ground bounce plus one warm sun for readable volume. */
function createLights(): Group {
  const lights = new Group();
  lights.name = 'lights';

  // Fill kept deliberately lower than the sun so cast shadows stay readable
  // against the pastel ground without turning into hard black shapes.
  const ambient = new HemisphereLight(0xcfe8ff, 0x9fd39f, 1.1);
  ambient.name = 'hemisphereLight';

  const sun = new DirectionalLight(0xfff2d8, 2.6);
  sun.name = 'sunLight';
  sun.position.set(SUN_POSITION.x, SUN_POSITION.y, SUN_POSITION.z);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -SUN_SHADOW_EXTENT;
  sun.shadow.camera.right = SUN_SHADOW_EXTENT;
  sun.shadow.camera.top = SUN_SHADOW_EXTENT;
  sun.shadow.camera.bottom = -SUN_SHADOW_EXTENT;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 60;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  // The shadow camera is built from its bounds at construction, so widened
  // bounds need an explicit projection refresh or shadows clip at +-5 units.
  sun.shadow.camera.updateProjectionMatrix();

  lights.add(ambient, sun, sun.target);
  return lights;
}
