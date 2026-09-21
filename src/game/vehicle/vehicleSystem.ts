/**
 * The fleet's rules, kept apart from the scene and the sound.
 *
 * Which of the four service vehicles is driving, what its ability button fires,
 * how fast its engine loop plays and how long a burst lasts are all plain state
 * transitions, so they are testable without a renderer or an AudioContext
 * (conductor/workflow.md: game rules test-first, scene and audio wiring manual).
 * The AudioEngine consumes the `AbilityEvent`s this module emits.
 */
import { VEHICLE_MODELS } from '../assets/modelRegistry';
import { CAR_HALF_LENGTH, DRIVE_SPEED } from './vehicleMotor';

/** The v1 fleet, in HUD order. */
export const VEHICLE_IDS = ['fire', 'iceCream', 'garbage', 'police'] as const;

export type VehicleId = (typeof VEHICLE_IDS)[number];

/** A hose burst lasts one to two seconds (spec FR6). */
export const BURST_MIN_SECONDS = 1;
export const BURST_MAX_SECONDS = 2;

/** Engine loop rate: a slow chug at rest, a flat-out buzz at top speed. */
export const ENGINE_IDLE_RATE = 0.85;
export const ENGINE_TOP_RATE = 1.6;

/** One sound-and-visual beat the active vehicle's ability asks for. */
export type AbilityEvent =
  | { readonly kind: 'spray'; readonly seconds: number }
  | { readonly kind: 'jingle' }
  | { readonly kind: 'cones' }
  | { readonly kind: 'gulp' }
  | { readonly kind: 'siren' };

/**
 * A press of the ability button: what to show and hear, and how long it ties the
 * vehicle up. `seconds` of 0 is an instant one-shot, not a burst.
 */
export interface AbilityCast {
  readonly events: readonly AbilityEvent[];
  readonly seconds: number;
}

/**
 * The car's own length. Every fleet model is fitted to it, so the art can never
 * overhang the collision capsule that stops it (see `vehicleActor`).
 */
export const FLEET_LENGTH = CAR_HALF_LENGTH * 2;

/** Every Car Kit vehicle — and the authored ice-cream truck — faces +z. */
export const FLEET_FACING_YAW = 0;

export interface VehicleSpec {
  readonly id: VehicleId;
  readonly model: string;
  /** How far to turn the kit's model onto the car's nose (see `vehicleActor`). */
  readonly facingYaw: number;
  /** Longest extent the model may occupy, inside the car's collision capsule. */
  readonly fitLength: number;
  /** A fresh cast per press, never a shared array a caller could mutate. */
  readonly cast: () => AbilityCast;
}

export interface VehicleSystem {
  readonly ids: readonly VehicleId[];
  spec(id: VehicleId): VehicleSpec;
  activeId(): VehicleId;
  activeModel(): string;
  isActive(id: VehicleId): boolean;
  /** Morphs to another vehicle; a burst in flight is abandoned. */
  setActive(id: VehicleId): void;
  /** The active vehicle's ability, or nothing while a burst is in flight. */
  requestAbility(): readonly AbilityEvent[];
  engineRate(speed: number, topSpeed?: number): number;
  isBursting(): boolean;
  burstRemaining(): number;
  /** The kid drove off mid-burst: the ability stops where it is. */
  interruptBurst(): void;
  update(deltaSeconds: number): void;
}

const SPECS: Record<VehicleId, VehicleSpec> = {
  fire: {
    id: 'fire',
    model: VEHICLE_MODELS.firetruck,
    facingYaw: FLEET_FACING_YAW,
    fitLength: FLEET_LENGTH,
    cast: () => ({ events: [{ kind: 'spray', seconds: 1.5 }], seconds: 1.5 }),
  },
  iceCream: {
    id: 'iceCream',
    model: VEHICLE_MODELS.iceCreamTruck,
    facingYaw: FLEET_FACING_YAW,
    fitLength: FLEET_LENGTH,
    cast: () => ({
      events: [{ kind: 'jingle' }, { kind: 'cones' }],
      seconds: 0,
    }),
  },
  garbage: {
    id: 'garbage',
    model: VEHICLE_MODELS.garbageTruck,
    facingYaw: FLEET_FACING_YAW,
    fitLength: FLEET_LENGTH,
    cast: () => ({ events: [{ kind: 'gulp' }], seconds: 0 }),
  },
  police: {
    id: 'police',
    model: VEHICLE_MODELS.police,
    facingYaw: FLEET_FACING_YAW,
    fitLength: FLEET_LENGTH,
    cast: () => ({ events: [{ kind: 'siren' }], seconds: 0 }),
  },
};

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

export function createVehicleSystem(initial: VehicleId = 'fire'): VehicleSystem {
  let active = initial;
  let burst = 0;

  return {
    ids: VEHICLE_IDS,
    spec: (id) => SPECS[id],
    activeId: () => active,
    activeModel: () => SPECS[active].model,
    isActive: (id) => id === active,
    setActive: (id) => {
      active = id;
      burst = 0;
    },
    requestAbility: () => {
      if (burst > 0) {
        return [];
      }
      const cast = SPECS[active].cast();
      if (cast.seconds > 0) {
        burst = clamp(cast.seconds, BURST_MIN_SECONDS, BURST_MAX_SECONDS);
      }
      return cast.events;
    },
    engineRate: (speed, topSpeed = DRIVE_SPEED) => {
      const share = topSpeed > 0 ? clamp(speed / topSpeed, 0, 1) : 0;
      return ENGINE_IDLE_RATE + (ENGINE_TOP_RATE - ENGINE_IDLE_RATE) * share;
    },
    isBursting: () => burst > 0,
    burstRemaining: () => burst,
    interruptBurst: () => {
      burst = 0;
    },
    update: (deltaSeconds) => {
      if (burst > 0) {
        burst = Math.max(0, burst - deltaSeconds);
      }
    },
  };
}
