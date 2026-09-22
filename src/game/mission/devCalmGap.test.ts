/**
 * Red-first tests for the dev-only calm-gap override (see `devCalmGap.ts`).
 *
 * The parser exists so a manual walkthrough can see all four missions back to
 * back instead of waiting the shipped 60-90s between each. What matters is
 * that it can only ever *shorten* the gap: a mistyped developer flag must not
 * be able to turn the town into a slot machine or slow it down past the rule
 * the spec asked for.
 */

import { describe, expect, it } from 'vitest';
import { CALM_MAX_SECONDS } from './calmGapPacer';
import { calmGapOverride } from './devCalmGap';

describe('the dev calm-gap override', () => {
  it('reads a whole-second override', () => {
    expect(calmGapOverride('?calmGap=2')).toEqual({ minSeconds: 2, maxSeconds: 2 });
  });

  it('finds the flag among other parameters', () => {
    expect(calmGapOverride('?foo=1&calmGap=5&bar=2')).toEqual({
      minSeconds: 5,
      maxSeconds: 5,
    });
  });

  it('accepts a fractional gap', () => {
    expect(calmGapOverride('?calmGap=0.5')).toEqual({ minSeconds: 0.5, maxSeconds: 0.5 });
  });

  it('has no opinion when the flag is absent', () => {
    expect(calmGapOverride('')).toBeUndefined();
    expect(calmGapOverride('?other=3')).toBeUndefined();
  });

  it('refuses a gap that is not a positive number', () => {
    expect(calmGapOverride('?calmGap=0')).toBeUndefined();
    expect(calmGapOverride('?calmGap=-5')).toBeUndefined();
    expect(calmGapOverride('?calmGap=abc')).toBeUndefined();
    expect(calmGapOverride('?calmGap=')).toBeUndefined();
    expect(calmGapOverride('?calmGap=Infinity')).toBeUndefined();
    expect(calmGapOverride('?calmGap=NaN')).toBeUndefined();
  });

  it('can only shorten the gap, never lengthen it', () => {
    expect(calmGapOverride(`?calmGap=${CALM_MAX_SECONDS + 600}`)).toEqual({
      minSeconds: CALM_MAX_SECONDS,
      maxSeconds: CALM_MAX_SECONDS,
    });
  });
});
