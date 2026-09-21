import { Mesh, MeshBasicMaterial, RingGeometry } from 'three';
import type { Vec2 } from '../town/townTypes';

/**
 * The ring that blooms where a tap landed.
 *
 * Two jobs, one shape: it answers a touch within a frame (the product
 * guideline's 100ms budget) and it says *where* the car was sent — the
 * destination is otherwise invisible, since the only other thing that moves is
 * the car itself.
 *
 * The timing is a pure function of elapsed seconds, so the feel can be pinned
 * by tests rather than judged from a video; the mesh is a unit ring that gets
 * scaled, so a pulse allocates nothing.
 */

/** How long one pulse lasts. Long enough to read, short enough to not linger. */
export const RING_DURATION = 0.45;

/** Radius at the moment of the tap, in world units. */
export const RING_START_RADIUS = 0.12;

/** Radius the pulse reaches as it fades out. */
export const RING_END_RADIUS = 0.55;

/**
 * Height above the ground plane, in world units. Above the road surface at
 * +0.02 so the ring never z-fights with the asphalt it sits on.
 */
export const RING_SURFACE_HEIGHT = 0.03;

/** Colour of the ring: a warm white that reads on both asphalt and grass. */
export const RING_COLOR = 0xfff1c9;

/** One instant of a pulse. */
export interface RingFrame {
  /** Ring radius in world units. */
  readonly radius: number;
  /** Material opacity: 1 at the tap, 0 when the pulse is over. */
  readonly opacity: number;
  /** Whether the pulse is over and the ring should be hidden. */
  readonly finished: boolean;
}

/**
 * The pulse at a given moment.
 *
 * Growth is eased out — most of the expansion lands in the first fraction of the
 * pulse, so a tap reads as an instant answer that then settles — while the fade
 * stays linear, which keeps the ring visible for as long as it is useful.
 *
 * @param elapsedSeconds Time since the tap; negative and over-long values clamp.
 */
export function ringFrame(elapsedSeconds: number): RingFrame {
  const progress = Math.min(Math.max(elapsedSeconds / RING_DURATION, 0), 1);
  const eased = 1 - (1 - progress) ** 3;
  return {
    radius: RING_START_RADIUS + (RING_END_RADIUS - RING_START_RADIUS) * eased,
    opacity: 1 - progress,
    finished: progress >= 1,
  };
}

export interface TargetRing {
  /** The ring to add to the scene; its scale and opacity follow the pulse. */
  readonly object: Mesh<RingGeometry, MeshBasicMaterial>;
  /** Starts a pulse centred on a world point. A newer tap replaces the pulse. */
  show(point: Vec2): void;
  /** Advances the pulse by one frame, hiding the ring once it has finished. */
  update(deltaSeconds: number): void;
}

/**
 * Builds the ring.
 *
 * Deliberately a single ring rather than a pool: the newest tap is the only
 * destination that matters, so a mash should *replace* the pulse rather than
 * litter the street with old ones.
 */
export function createTargetRing(): TargetRing {
  const geometry = new RingGeometry(0.86, 1, 48);
  const material = new MeshBasicMaterial({
    color: RING_COLOR,
    transparent: true,
    // The ring is a decal on the ground: it must not occlude the car driving
    // over it, nor write depth into the shadow pass.
    depthWrite: false,
  });
  const object = new Mesh(geometry, material);
  object.name = 'targetRing';
  object.rotation.x = -Math.PI / 2;
  object.visible = false;

  let elapsed = 0;
  let pulsing = false;

  const apply = (): void => {
    const frame = ringFrame(elapsed);
    object.scale.set(frame.radius, frame.radius, 1);
    material.opacity = frame.opacity;
    object.visible = pulsing && !frame.finished;
  };

  return {
    object,

    show(point: Vec2): void {
      object.position.set(point.x, RING_SURFACE_HEIGHT, point.z);
      elapsed = 0;
      pulsing = true;
      apply();
    },

    update(deltaSeconds: number): void {
      if (!pulsing) {
        return;
      }
      elapsed += Math.max(deltaSeconds, 0);
      apply();
      if (ringFrame(elapsed).finished) {
        pulsing = false;
      }
    },
  };
}
