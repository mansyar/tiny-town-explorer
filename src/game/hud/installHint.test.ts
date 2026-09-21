import { describe, expect, it } from 'vitest';
import { HINT_SECONDS, hintFrame, platformFrom, shouldShowHint } from './installHint';

describe('whether to hint at all', () => {
  it('hints when the game is being played in a browser tab', () => {
    expect(shouldShowHint({ installed: false, hintedThisSession: false })).toBe(true);
  });

  it('stays quiet once it has already been played from the home screen', () => {
    expect(shouldShowHint({ installed: true, hintedThisSession: false })).toBe(false);
    expect(shouldShowHint({ installed: true, hintedThisSession: true })).toBe(false);
  });

  it('does not nag twice in one session', () => {
    expect(shouldShowHint({ installed: false, hintedThisSession: true })).toBe(false);
  });
});

describe('the hint over its life', () => {
  it('is invisible until it fades in', () => {
    expect(hintFrame(0).opacity).toBe(0);
    expect(hintFrame(0).finished).toBe(false);
    expect(hintFrame(0.2).opacity).toBeGreaterThan(0);
    expect(hintFrame(0.2).opacity).toBeLessThan(1);
  });

  it('sits fully visible through the middle', () => {
    expect(hintFrame(HINT_SECONDS / 2).opacity).toBe(1);
  });

  it('takes itself away at the end', () => {
    expect(hintFrame(HINT_SECONDS - 0.2).opacity).toBeLessThan(1);
    expect(hintFrame(HINT_SECONDS).finished).toBe(true);
    expect(hintFrame(HINT_SECONDS * 4).finished).toBe(true);
  });

  it('bobs the arrow back and forth rather than pinning it', () => {
    const values = [0, 0.3, 0.6, 0.9, 1.2].map((t) => hintFrame(t).bob);
    expect(Math.max(...values)).toBeGreaterThan(0);
    expect(Math.min(...values)).toBeLessThan(0);
  });

  it('clamps a negative moment to the start', () => {
    expect(hintFrame(-3).opacity).toBe(0);
    expect(hintFrame(-3).finished).toBe(false);
  });
});

describe('which control the hint points at', () => {
  it('knows an iPhone and an iPad', () => {
    expect(platformFrom('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)')).toBe(
      'ios',
    );
    expect(platformFrom('Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)')).toBe('ios');
  });

  it('knows the iPad that claims to be a Mac', () => {
    expect(
      platformFrom(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit Mobile/15E148',
      ),
    ).toBe('ios');
  });

  it('puts Android, Windows and a real Mac in the other corner', () => {
    expect(platformFrom('Mozilla/5.0 (Linux; Android 13; Pixel 7)')).toBe('other');
    expect(platformFrom('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('other');
    // A Mac desktop browser has no touch, so it is not the share sheet.
    expect(platformFrom('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari')).toBe(
      'other',
    );
  });
});
