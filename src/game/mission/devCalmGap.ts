/**
 * The dev-only calm-gap override: `?calmGap=<seconds>` on the dev URL.
 *
 * The town is wired to roll its 60-90s calm gap, which is right for a child
 * and wrong for a human checking that all four missions still behave: a
 * four-mission walkthrough would spend minutes waiting between them. This
 * module reads one number off the query string so a developer can shorten that
 * gap — `?calmGap=2` — and watch the rotation hand out mission after mission
 * back to back, each mission's own pacing and separation rules untouched.
 *
 * Two rules keep it an affordance rather than a second pacing rule:
 *
 * - **Shorten only.** The override is capped at the town's own longest gap, so
 *   a typo cannot put the town further from its spec'd window than it already
 *   is.
 * - **Dev only.** `main.ts` reads it behind `import.meta.env.DEV`, so a
 *   production build never consults it — and Vite drops the branch with it.
 *
 * It is a URL parameter rather than a control on screen because the game ships
 * zero text and has no modals to put a debug control in, and a parameter is
 * not part of the child's play space at all.
 */

import { CALM_MAX_SECONDS } from './calmGapPacer';

/** The calm-gap window an override asks the town to use instead. */
export interface CalmGapOverride {
  readonly minSeconds: number;
  readonly maxSeconds: number;
}

/**
 * Parses `?calmGap=<seconds>` out of a query string, or `undefined` when the
 * flag is absent or unusable — not a number, or not positive. A gap longer
 * than the shipped maximum is clamped to it.
 */
export function calmGapOverride(search: string): CalmGapOverride | undefined {
  const raw = new URLSearchParams(search).get('calmGap');
  if (raw === null) {
    return undefined;
  }
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return undefined;
  }
  const capped = Math.min(seconds, CALM_MAX_SECONDS);
  return { minSeconds: capped, maxSeconds: capped };
}
