import {
  ConeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  OctahedronGeometry,
  RingGeometry,
  SphereGeometry,
  Vector3,
} from 'three';
import type { Vec2 } from '../town/townTypes';

/**
 * The bits that give an ability a body: a fan of water from the hose, cones
 * dropped behind the ice-cream truck, a puff where the car morphed, and the
 * red-blue wash of a police siren.
 *
 * Nothing here is simulation: each burst is a handful of small meshes thrown
 * out along fixed velocities and faded over a fraction of a second, which is
 * what the product guidelines ask for — big, brief, joyful — and cheap enough
 * to never threaten the frame budget. The launch maths and the fade are pure
 * functions so their shape can be pinned by tests; the meshes are a pool that
 * is built once per kind and reused.
 */

/** Kinds of burst this module can throw. */
export type BurstKind = 'cones' | 'gulp' | 'poof' | 'spray';

/** How long a burst of bits lives. Long enough to read, short enough to not linger. */
export const BURST_SECONDS = 0.7;

/** Downward pull on a bit, in world units per second squared. */
export const BURST_GRAVITY = 5.2;

/** Size of a bit at the moment it is thrown, in world units. */
export const BIT_START_SCALE = 0.16;

/** How long the siren's wash lasts, and how wide it gets. */
export const FLASH_SECONDS = 0.55;
export const FLASH_RADIUS = 1.1;

/** The two halves of a police flash, alternating as it fades. */
export const SIREN_COLORS = [0xff5f5f, 0x5f8cff] as const;

/** Where a bit starts, in world units. About the height of a car's roof. */
export const BIT_START_HEIGHT = 0.34;

export interface BurstPlan {
  readonly count: number;
  readonly shape: 'cone' | 'drop' | 'star';
  readonly color: number;
  /** Outward speed of a bit, in world units per second. */
  readonly speed: number;
  /** Upward launch speed, so a burst arcs rather than skids. */
  readonly lift: number;
  /** Width of the fan, in radians; a full turn sprays in every direction. */
  readonly fan: number;
  /** How far ahead of the car's centre the burst starts. */
  readonly forward: number;
  /** Size multiplier on `BIT_START_SCALE`, so a chunky cone reads like a cone. */
  readonly size: number;
}

/**
 * What each burst is made of.
 *
 * The hose is the widest and quickest — it has to read as water leaving the
 * truck, in the direction the truck already faces — while the morph puff is
 * radial, because the car changed rather than *did* something.
 */
export const BURST_PLANS: Readonly<Record<BurstKind, BurstPlan>> = {
  spray: {
    count: 20,
    shape: 'drop',
    color: 0x9fdcff,
    speed: 3.1,
    lift: 1.9,
    fan: 0.95,
    forward: 0.45,
    size: 1,
  },
  cones: {
    count: 6,
    shape: 'cone',
    color: 0xdba33d,
    speed: 1.5,
    lift: 1.7,
    fan: 2.2,
    forward: 0.1,
    size: 1.7,
  },
  gulp: {
    count: 7,
    shape: 'star',
    color: 0x8fd08e,
    speed: 1.1,
    lift: 1.1,
    fan: Math.PI * 2,
    forward: 0,
    size: 1.3,
  },
  poof: {
    count: 12,
    shape: 'star',
    color: 0xfff1c9,
    speed: 1.5,
    lift: 1.3,
    fan: Math.PI * 2,
    forward: 0,
    size: 1.5,
  },
};

/** One instant of a burst. */
export interface BurstFrame {
  /** Bit size in world units. */
  readonly scale: number;
  /** Material opacity: 1 at the throw, 0 when the burst is over. */
  readonly opacity: number;
  /** Whether the burst is over and its bits should be hidden. */
  readonly finished: boolean;
}

/**
 * The burst at a given moment: bits shrink and fade linearly, so the whole
 * burst disappears together instead of trailing one straggler.
 *
 * @param elapsedSeconds Time since the throw; negative and over-long clamp.
 * @param size Multiplier on the bit's starting size, from the burst's plan.
 */
export function burstFrame(elapsedSeconds: number, size = 1): BurstFrame {
  const progress = Math.min(Math.max(elapsedSeconds / BURST_SECONDS, 0), 1);
  return {
    scale: BIT_START_SCALE * size * (1 - 0.7 * progress),
    opacity: 1 - progress,
    finished: progress >= 1,
  };
}

/** A deterministic 0..1 sequence, so a burst is repeatable. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

/**
 * Launch velocities for one burst, spread around the car's heading.
 *
 * Deterministic for a given seed, and never straight down: every bit is lifted,
 * which is what makes a burst read as celebratory rather than as debris.
 *
 * @param kind Which burst to throw.
 * @param heading The car's heading in radians (`facingOf`'s convention).
 * @param seed Any integer; the same seed always gives the same burst.
 */
export function burstBits(
  kind: BurstKind,
  heading: number,
  seed = 1,
): readonly { readonly x: number; readonly y: number; readonly z: number }[] {
  const plan = BURST_PLANS[kind];
  const random = seededRandom(seed);
  return Array.from({ length: plan.count }, () => {
    const offset = (random() - 0.5) * plan.fan;
    const direction = heading + offset;
    const speed = plan.speed * (0.7 + 0.6 * random());
    return {
      x: Math.sin(direction) * speed,
      y: plan.lift * (0.7 + 0.6 * random()),
      z: Math.cos(direction) * speed,
    };
  });
}

/** One instant of the siren wash. */
export interface FlashFrame {
  readonly radius: number;
  readonly color: number;
  readonly opacity: number;
  readonly finished: boolean;
}

/**
 * The siren wash at a given moment: it blooms outward and alternates red and
 * blue twice on the way out, so it reads as a police light rather than a stain.
 *
 * @param elapsedSeconds Time since the flash; negative and over-long clamp.
 */
export function flashFrame(elapsedSeconds: number): FlashFrame {
  const progress = Math.min(Math.max(elapsedSeconds / FLASH_SECONDS, 0), 1);
  const half = SIREN_COLORS[Math.floor(progress * 4) % 2] ?? SIREN_COLORS[0];
  return {
    radius: FLASH_RADIUS * (0.35 + 0.65 * (1 - (1 - progress) ** 2)),
    color: half,
    opacity: 1 - progress,
    finished: progress >= 1,
  };
}

export interface AbilityFx {
  /** Add to the scene; every bit lives under it. */
  readonly object: Object3D;
  /** Throws one burst from a world point, along a heading. */
  burst(kind: BurstKind, point: Vec2, heading: number): void;
  /** Washes the car in police light. */
  flash(point: Vec2): void;
  /** Advances every live burst by one frame. */
  update(deltaSeconds: number): void;
}

interface Bit {
  readonly mesh: Mesh;
  readonly velocity: Vector3;
}

interface ActiveBurst {
  readonly kind: BurstKind;
  elapsed: number;
}

/**
 * Builds the pool.
 *
 * Meshes are created per kind the first time that kind is thrown, so a game
 * that never fires the hose never carries its droplets — and each bit keeps a
 * settled transform afterwards rather than being re-created on the next throw.
 */
export function createAbilityFx(): AbilityFx {
  const object = new Group();
  object.name = 'abilityFx';

  const geometries = {
    cone: new ConeGeometry(1, 1.6, 6),
    drop: new SphereGeometry(0.5, 5, 4),
    star: new OctahedronGeometry(0.9, 0),
  };
  const pools = new Map<BurstKind, Bit[]>();
  const active: ActiveBurst[] = [];

  const poolFor = (kind: BurstKind): Bit[] => {
    const existing = pools.get(kind);
    if (existing !== undefined) {
      return existing;
    }
    const plan = BURST_PLANS[kind];
    const material = new MeshBasicMaterial({
      color: plan.color,
      transparent: true,
      // Bits are see-through at the end of their life, so keep them out of the
      // depth pass rather than letting them clip the town behind them.
      depthWrite: false,
    });
    const bits = Array.from({ length: plan.count }, () => {
      const mesh = new Mesh(geometries[plan.shape], material);
      mesh.visible = false;
      object.add(mesh);
      return { mesh, velocity: new Vector3() };
    });
    pools.set(kind, bits);
    return bits;
  };

  const flashGeometry = new RingGeometry(0.72, 1, 40);
  const flashMaterial = new MeshBasicMaterial({
    color: SIREN_COLORS[0],
    transparent: true,
    depthWrite: false,
  });
  const flashMesh = new Mesh(flashGeometry, flashMaterial);
  flashMesh.name = 'sirenFlash';
  flashMesh.rotation.x = -Math.PI / 2;
  flashMesh.visible = false;
  object.add(flashMesh);
  let flashElapsed = 0;
  let flashing = false;

  const applyFlash = (): void => {
    const frame = flashFrame(flashElapsed);
    flashMesh.scale.set(frame.radius, frame.radius, 1);
    flashMaterial.color.setHex(frame.color);
    flashMaterial.opacity = frame.opacity;
    flashMesh.visible = flashing && !frame.finished;
  };

  const stepBits = (bits: Bit[], delta: number, frame: BurstFrame): void => {
    for (const bit of bits) {
      bit.mesh.position.x += bit.velocity.x * delta;
      bit.mesh.position.y += bit.velocity.y * delta;
      bit.mesh.position.z += bit.velocity.z * delta;
      bit.velocity.y -= BURST_GRAVITY * delta;
      bit.mesh.scale.setScalar(frame.scale);
      (bit.mesh.material as MeshBasicMaterial).opacity = frame.opacity;
      bit.mesh.visible = !frame.finished;
    }
  };

  return {
    object,

    burst(kind, point, heading): void {
      const plan = BURST_PLANS[kind];
      const bits = poolFor(kind);
      const velocities = burstBits(kind, heading);
      const noseX = Math.sin(heading) * plan.forward;
      const noseZ = Math.cos(heading) * plan.forward;
      bits.forEach((bit, index) => {
        const velocity = velocities[index];
        if (velocity === undefined) {
          return;
        }
        bit.mesh.position.set(
          point.x + noseX,
          BIT_START_HEIGHT + (index % 3) * 0.05,
          point.z + noseZ,
        );
        bit.mesh.rotation.set(index * 0.7, index * 1.1, index * 0.5);
        bit.mesh.visible = true;
        bit.velocity.set(velocity.x, velocity.y, velocity.z);
      });
      const running = active.find((entry) => entry.kind === kind);
      if (running === undefined) {
        active.push({ kind, elapsed: 0 });
      } else {
        running.elapsed = 0;
      }
      const frame = burstFrame(0, plan.size);
      for (const bit of bits) {
        bit.mesh.scale.setScalar(frame.scale);
        (bit.mesh.material as MeshBasicMaterial).opacity = frame.opacity;
      }
    },

    flash(point): void {
      flashMesh.position.set(point.x, 0.04, point.z);
      flashElapsed = 0;
      flashing = true;
      applyFlash();
    },

    update(deltaSeconds): void {
      const delta = Math.max(deltaSeconds, 0);
      for (let i = active.length - 1; i >= 0; i -= 1) {
        const entry = active[i];
        if (entry === undefined) {
          continue;
        }
        entry.elapsed += delta;
        const frame = burstFrame(entry.elapsed, BURST_PLANS[entry.kind].size);
        stepBits(poolFor(entry.kind), delta, frame);
        if (frame.finished) {
          active.splice(i, 1);
        }
      }
      if (flashing) {
        flashElapsed += delta;
        applyFlash();
        if (flashFrame(flashElapsed).finished) {
          flashing = false;
        }
      }
    },
  };
}
