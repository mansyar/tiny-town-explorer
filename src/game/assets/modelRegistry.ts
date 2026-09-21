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
import roadTile from '../../assets/kits/toy-car-kit/track-road-narrow.glb?url';
import roadCornerSmall from '../../assets/kits/toy-car-kit/track-road-narrow-corner-small.glb?url';
import roadCurve from '../../assets/kits/toy-car-kit/track-road-narrow-curve.glb?url';
import roadStraight from '../../assets/kits/toy-car-kit/track-road-narrow-straight.glb?url';
import pine from '../../assets/kits/toy-car-kit/tree-pine.glb?url';

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

/** Road grid pieces from the Toy Car Kit's track system. */
export const ROAD_MODELS = {
  /** Plain road pad covering one tile; the whole grid is paved with these. */
  tile: roadTile,
  straight: roadStraight,
  curve: roadCurve,
  cornerSmall: roadCornerSmall,
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

/** Every model the v1 town mounts, for warming the loader. */
export const TOWN_MODELS: readonly string[] = [
  ...Object.values(ROAD_MODELS),
  ...BUILDING_MODELS,
  ...Object.values(NATURE_MODELS),
];
