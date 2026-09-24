import {
  Color,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  Mesh,
  Scene,
  Vector3,
} from 'three';

/** Sky color shared by the scene background, page theme, and manifest. */
export const SKY_COLOR = 0x87ceeb;

/**
 * Half-width of the sun's shadow frustum, in world units. It spans the
 * camera's play window plus room for just-off-screen casters — sharp on the
 * performance-floor device because the frustum travels with the car (FR7)
 * instead of covering the whole town at once.
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

/**
 * One shadow-map cell on the ground, in world units: the frustum's width
 * divided across its 1024-texel map.
 */
export const SUN_SHADOW_TEXEL = (2 * SUN_SHADOW_EXTENT) / 1024;

// The shadow map's own grid runs along the shadow camera's axes rather than
// the town's, so the focus is rounded onto that lattice — which is what keeps
// the shadows nailed down while the car drives (FR7).
const SNAP_LIGHT = new Vector3(
  SUN_POSITION.x,
  SUN_POSITION.y,
  SUN_POSITION.z,
).normalize();
const SNAP_RIGHT = new Vector3(0, 1, 0).cross(SNAP_LIGHT).normalize();
const SNAP_UP = SNAP_LIGHT.clone().cross(SNAP_RIGHT).normalize();
// The map lattice meets the ground in a sheared parallelogram: this is the
// determinant that turns a map-plane rounding into a ground-plane step.
const SNAP_GROUND_DET = SNAP_RIGHT.x * SNAP_UP.z - SNAP_RIGHT.z * SNAP_UP.x;

/**
 * Snaps a ground focus to the shadow map's texel lattice (FR7): idempotent,
 * and blind to sub-cell travel. A creeping car must never slide the map
 * between cells — that sliding is the shimmer. The rounding step is solved
 * back in the ground plane, so the focus stays a real ground point and the
 * lattice survives every round trip exactly.
 */
export function sunShadowSnap(focus: { x: number; z: number }): {
  readonly x: number;
  readonly z: number;
} {
  const u = focus.x * SNAP_RIGHT.x + focus.z * SNAP_RIGHT.z;
  const v = focus.x * SNAP_UP.x + focus.z * SNAP_UP.z;
  const du = Math.round(u / SUN_SHADOW_TEXEL) * SUN_SHADOW_TEXEL - u;
  const dv = Math.round(v / SUN_SHADOW_TEXEL) * SUN_SHADOW_TEXEL - v;
  const stepX = (SNAP_UP.z * du - SNAP_RIGHT.z * dv) / SNAP_GROUND_DET;
  const stepZ = (-SNAP_UP.x * du + SNAP_RIGHT.x * dv) / SNAP_GROUND_DET;
  return { x: focus.x + stepX, z: focus.z + stepZ };
}

/** The empty stage (sky, fog, daylight) that the town is added to. */
export interface GameScene {
  readonly scene: Scene;
  /**
   * Aims the sun's shadow frustum at the car, snapped to the shadow map's
   * texels so the shadows never shimmer (FR7). Both loops keep full shadows
   * because the frustum travels with the car instead of spanning the town.
   */
  followSun(focus: { readonly x: number; readonly z: number }): void;
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
  const { group: lights, sun } = createLights();
  scene.add(lights);

  return {
    scene,

    followSun(focus): void {
      const snapped = sunShadowSnap(focus);
      sun.position.set(
        snapped.x + SUN_POSITION.x,
        SUN_POSITION.y,
        snapped.z + SUN_POSITION.z,
      );
      sun.target.position.set(snapped.x, 0, snapped.z);
      sun.target.updateMatrixWorld();
    },
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
function createLights(): {
  readonly group: Group;
  readonly sun: DirectionalLight;
} {
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
  return { group: lights, sun };
}
