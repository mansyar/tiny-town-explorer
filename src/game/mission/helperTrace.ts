/**
 * The helper hand's trace: a dotted line along the route the car would take,
 * with a pointer that runs it and pokes the destination.
 *
 * Pure geometry and timing (dots along a polyline, the pointer's eased
 * progress) with a thin mesh layer, so the *timing* the plan says to verify by
 * hand still has a deterministic shape underneath it.
 */

import {
  Group,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  RingGeometry,
  SphereGeometry,
} from 'three';
import type { Vec2 } from '../town/townTypes';

/** Distance between dots along the route. */
export const TRACE_SPACING = 0.4;

export const TRACE_DOT_RADIUS = 0.055;

export const TRACE_COLOR = 0xfff1c9;

/** How long the pointer takes to travel the route and poke the target. */
export const TRACE_SECONDS = 1.8;

/** Above the road's asphalt so the dots read as paint on it. */
export const TRACE_SURFACE_HEIGHT = 0.05;

/**
 * Dots spaced evenly along a route, always ending exactly on the destination
 * so the last dot is the thing the pointer pokes. A route with nothing to walk
 * yields nothing to draw.
 */
export function routeDots(
  route: readonly Vec2[],
  spacing = TRACE_SPACING,
): readonly Vec2[] {
  if (route.length < 2 || spacing <= 0) {
    return [];
  }

  const dots: Vec2[] = [];
  let carry = 0;

  for (let index = 1; index < route.length; index += 1) {
    const from = route[index - 1];
    const to = route[index];
    if (from === undefined || to === undefined) {
      continue;
    }

    const span = Math.hypot(to.x - from.x, to.z - from.z);
    if (span <= 0) {
      continue;
    }

    let walked = carry;
    while (walked <= span) {
      const share = walked / span;
      dots.push({
        x: from.x + (to.x - from.x) * share,
        z: from.z + (to.z - from.z) * share,
      });
      walked += spacing;
    }
    carry = walked - span;
  }

  const last = route[route.length - 1];
  if (last !== undefined) {
    const tail = dots[dots.length - 1];
    if (tail === undefined || tail.x !== last.x || tail.z !== last.z) {
      dots.push({ x: last.x, z: last.z });
    }
  }

  return dots;
}

/** How far along the trace the pointer has travelled, 0 to 1, eased. */
export function traceProgress(elapsedSeconds: number): number {
  const linear = Math.min(Math.max(elapsedSeconds / TRACE_SECONDS, 0), 1);
  return 1 - (1 - linear) ** 3;
}

export interface HelperTrace {
  readonly object: Object3D;
  show(route: readonly Vec2[]): void;
  hide(): void;
  isDone(): boolean;
  update(deltaSeconds: number): void;
}

export function createHelperTrace(): HelperTrace {
  const object = new Group();
  object.name = 'helperTrace';

  const dotGeometry = new SphereGeometry(TRACE_DOT_RADIUS, 6, 4);
  const dotMaterial = new MeshBasicMaterial({
    color: TRACE_COLOR,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
  });
  const dots: Mesh[] = [];

  const pointerGeometry = new RingGeometry(0.7, 1, 32);
  const pointerMaterial = new MeshBasicMaterial({
    color: TRACE_COLOR,
    transparent: true,
    depthWrite: false,
  });
  const pointer = new Mesh(pointerGeometry, pointerMaterial);
  pointer.name = 'helperPointer';
  pointer.rotation.x = -Math.PI / 2;
  pointer.visible = false;
  object.add(pointer);

  let route: readonly Vec2[] = [];
  let elapsed = 0;
  let showing = false;

  const hideDots = (): void => {
    for (const dot of dots) {
      dot.visible = false;
    }
  };

  return {
    object,

    show: (nextRoute) => {
      route = nextRoute;
      elapsed = 0;
      showing = route.length >= 2;
      object.visible = showing;
      pointer.visible = showing;

      const points = routeDots(route);
      for (const [index, point] of points.entries()) {
        let dot = dots[index];
        if (dot === undefined) {
          dot = new Mesh(dotGeometry, dotMaterial);
          dot.name = `helperDot-${index}`;
          dot.rotation.x = -Math.PI / 2;
          dots.push(dot);
          object.add(dot);
        }
        dot.visible = true;
        dot.position.set(point.x, TRACE_SURFACE_HEIGHT, point.z);
      }
      for (let index = points.length; index < dots.length; index += 1) {
        const dot = dots[index];
        if (dot !== undefined) {
          dot.visible = false;
        }
      }
    },

    hide: () => {
      showing = false;
      object.visible = false;
      pointer.visible = false;
      hideDots();
      route = [];
    },

    isDone: () => showing && traceProgress(elapsed) >= 1,

    update: (deltaSeconds) => {
      if (!showing || route.length < 2) {
        return;
      }

      elapsed += Math.max(deltaSeconds, 0);
      const progress = traceProgress(elapsed);
      const last = route[route.length - 1];
      if (last === undefined) {
        return;
      }

      // Walk the polyline by arc length so the pointer keeps an even pace.
      const points = routeDots(route, 0.05);
      const target = Math.max(1, Math.round(progress * (points.length - 1)));
      const at = points[Math.min(target, points.length - 1)] ?? last;
      pointer.position.set(at.x, TRACE_SURFACE_HEIGHT + 0.01, at.z);
      const poke = progress >= 1 ? 0.32 : 0.22;
      pointer.scale.set(poke, poke, 1);
      pointerMaterial.opacity = progress >= 1 ? 0.95 : 0.7;
    },
  };
}
