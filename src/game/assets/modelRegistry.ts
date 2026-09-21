import carKitFiretruck from '../../assets/kits/car-kit/firetruck.glb?url';
import carKitGarbageTruck from '../../assets/kits/car-kit/garbage-truck.glb?url';
import carKitIceCreamTruck from '../../assets/kits/car-kit/ice-cream-truck.glb?url';
import carKitPolice from '../../assets/kits/car-kit/police.glb?url';
import electricityPole from '../../assets/kits/city-kit-roads/electricity-pole.glb?url';
import roadBend from '../../assets/kits/city-kit-roads/road-bend-square.glb?url';
import roadCrossroad from '../../assets/kits/city-kit-roads/road-crossroad.glb?url';
import roadEnd from '../../assets/kits/city-kit-roads/road-end.glb?url';
import roadIntersection from '../../assets/kits/city-kit-roads/road-intersection.glb?url';
import roadStraight from '../../assets/kits/city-kit-roads/road-straight.glb?url';
import buildingTypeA from '../../assets/kits/city-kit-suburban/building-type-a.glb?url';
import buildingTypeB from '../../assets/kits/city-kit-suburban/building-type-b.glb?url';
import buildingTypeC from '../../assets/kits/city-kit-suburban/building-type-c.glb?url';
import buildingTypeD from '../../assets/kits/city-kit-suburban/building-type-d.glb?url';
import buildingTypeF from '../../assets/kits/city-kit-suburban/building-type-f.glb?url';
import buildingTypeH from '../../assets/kits/city-kit-suburban/building-type-h.glb?url';
import buildingTypeQ from '../../assets/kits/city-kit-suburban/building-type-q.glb?url';
import buildingTypeR from '../../assets/kits/city-kit-suburban/building-type-r.glb?url';
import planter from '../../assets/kits/city-kit-suburban/planter.glb?url';
import treeLarge from '../../assets/kits/city-kit-suburban/tree-large.glb?url';
import treeSmall from '../../assets/kits/city-kit-suburban/tree-small.glb?url';
import cone from '../../assets/kits/toy-car-kit/item-cone.glb?url';
import pine from '../../assets/kits/toy-car-kit/tree-pine.glb?url';
import vehicleTruck from '../../assets/kits/toy-car-kit/vehicle-truck.glb?url';

/**
 * The kit models the town mounts, named by the role they play.
 *
 * Importing with `?url` is what keeps the build lean: only models named here
 * are emitted (and then precached) — the other ~180 committed kit models cost
 * nothing until a registry entry references them.
 *
 * These are plain URL strings rather than a spec/manifest the app parses at
 * runtime, so a typo is a build error instead of a 404 on a tablet.
 */

/**
 * Road grid pieces from City Kit (Roads): flat 1.00 x 1.00 x 0.02 tiles whose
 * base sits on the ground and whose surface is 0.02 above it, so mounting needs
 * no lift and `tileSize: 1` needs no rescaling.
 *
 * Orientations below were measured from the kit's own vertices (`road-straight`'s
 * asphalt band runs along model x; `road-bend-square` turns from west to south;
 * `road-intersection` runs east-west with its stem toward south) and are applied
 * as yaw when the town is planned.
 */
export const ROAD_MODELS = {
  straight: roadStraight,
  bend: roadBend,
  /** Three-way. Turns the east-west pair into a tee with a south, or north, stem. */
  intersection: roadIntersection,
  crossroad: roadCrossroad,
  end: roadEnd,
} as const;

/** House models, one per lot (chosen in this order by house index). */
export const BUILDING_MODELS: readonly string[] = [
  buildingTypeA,
  buildingTypeB,
  buildingTypeC,
  buildingTypeD,
  buildingTypeF,
  buildingTypeH,
  buildingTypeQ,
  buildingTypeR,
];

/** Park and verge greenery: suburban street trees plus a toy pine. */
export const NATURE_MODELS = {
  treeLarge,
  treeSmall,
  pine,
  planter,
} as const;

/** Crashable props: the toy cone reads at play distance where the tiny city
 * cone does not, the pole and street tree come from the city kits. */
export const PROP_MODELS = {
  cone,
  powerPole: electricityPole,
  tree: treeLarge,
} as const;

/**
 * The v1 fleet's models.
 *
 * The Toy Car Kit ships racers, an SUV and trucks but no service vehicles, so
 * the three that do have Kenney art come from the Car Kit. No kit ships an
 * ice-cream truck, so that one is authored in Blender
 * (`scripts/blender-ice-cream-truck.py`) to the Car Kit's palette and scale.
 *
 * `truck` is the Toy Car Kit box truck the slice has driven so far; the vehicle
 * system puts the four service vehicles in the HUD instead.
 */
export const VEHICLE_MODELS = {
  firetruck: carKitFiretruck,
  garbageTruck: carKitGarbageTruck,
  iceCreamTruck: carKitIceCreamTruck,
  police: carKitPolice,
  truck: vehicleTruck,
} as const;

/**
 * Every model the v1 town mounts, for warming the loader.
 *
 * Deduplicated: a model can hold two roles at once (the street tree is both park
 * greenery and a prop), and the loader should fetch each URL once.
 */
export const TOWN_MODELS: readonly string[] = [
  ...new Set([
    ...Object.values(ROAD_MODELS),
    ...BUILDING_MODELS,
    ...Object.values(NATURE_MODELS),
    ...Object.values(PROP_MODELS),
    ...Object.values(VEHICLE_MODELS),
  ]),
];
