/**
 * The one gate both missions share.
 *
 * Each pacer already pauses while *a* mission runs; this helper tells the
 * caller what "a mission" means now that there are two of them. The town is
 * busy unless both the fire mission and the ice-cream mission are `idle`, so
 * `main.ts` can pass one flag to both pacers and refuse both spawns:
 *
 * ```ts
 * const busy = isTownBusy(fire.snapshot(), iceCream.snapshot());
 * const fireHouse = firePacer.update(dt, busy);
 * const orderHouse = iceCreamPacer.update(dt, busy);
 * ```
 *
 * It reads snapshots rather than the managers so it stays a pure predicate the
 * tests can park in any combination of states.
 */

import type { IceCreamSnapshot } from './iceCreamMission';
import type { MissionSnapshot } from './missionManager';

export function isTownBusy(fire: MissionSnapshot, iceCream: IceCreamSnapshot): boolean {
  return fire.state !== 'idle' || iceCream.state !== 'idle';
}
