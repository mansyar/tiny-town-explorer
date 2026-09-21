/**
 * The one-time nudge to put the game on the home screen.
 *
 * Shown once per session, and only when the game is not already installed. It
 * has to point at chrome the game does not own - Safari's share control, or
 * Chrome's menu - so it is a gesture rather than a button: an arrow that bobs
 * toward the right corner, and a tap anywhere on it to get rid of it.
 *
 * The decisions (may we show it at all, where is the arrow now) are pure and
 * tested; the element is a thin layer over them.
 */

/** How long the hint stays before it takes itself away. */
export const HINT_SECONDS = 6;

export const HINT_FADE_IN = 0.4;

export const HINT_FADE_OUT = 0.6;

/** Session-scoped so a reload does not nag, but tomorrow does. */
export const HINT_SESSION_KEY = 'tte.installHintShown';

export interface InstallHintState {
  /** Already running from the home screen: nothing to suggest. */
  readonly installed: boolean;
  readonly hintedThisSession: boolean;
}

export function shouldShowHint(state: InstallHintState): boolean {
  return !state.installed && !state.hintedThisSession;
}

export interface HintFrame {
  readonly opacity: number;
  /** -1 to 1, a slow bob so the arrow reads as pointing somewhere. */
  readonly bob: number;
  readonly finished: boolean;
}

export function hintFrame(elapsedSeconds: number): HintFrame {
  const elapsed = Math.max(elapsedSeconds, 0);
  const fadeIn = Math.min(elapsed / HINT_FADE_IN, 1);
  const fadeOut = Math.min(Math.max(HINT_SECONDS - elapsed, 0) / HINT_FADE_OUT, 1);

  return {
    opacity: Math.min(fadeIn, fadeOut),
    bob: Math.sin(elapsed * 3.2),
    finished: elapsed >= HINT_SECONDS,
  };
}

export type HintPlatform = 'ios' | 'other';

/**
 * iOS is the one that hides its install control in a share sheet, so the hint
 * has to point somewhere different. iPadOS reports itself as a Macintosh, which
 * is why the touch check is here.
 */
export function platformFrom(userAgent: string): HintPlatform {
  if (/iPad|iPhone|iPod/.test(userAgent)) {
    return 'ios';
  }
  if (/Macintosh/.test(userAgent) && /Mobile/.test(userAgent)) {
    return 'ios';
  }
  return 'other';
}

/** The icons the hint points at, never words. */
const HINT_ICONS: Readonly<Record<HintPlatform, string>> = {
  // The share sheet: a box with an arrow coming out of the top.
  ios: '<path d="M12 2.6l4.2 4.2-1.6 1.6-1.4-1.4v8.6h-2.4V7l-1.4 1.4-1.6-1.6z"/><path d="M6 11.4h2.4V19h7.2v-7.6H18v8.4a1.6 1.6 0 0 1-1.6 1.6H7.6A1.6 1.6 0 0 1 6 19.8z"/>',
  // Everything else: the browser's own add/menu glyph.
  other:
    '<path d="M11 5.4h2v4.2h4.2v2H13v4.2h-2V11.6H6.8v-2H11z"/><path d="M5 19.6h14v2H5z"/>',
};

export interface InstallHint {
  readonly element: HTMLElement;
  /** Begins the hint's life and shows it. */
  show(): void;
  isShowing(): boolean;
  dismiss(): void;
  update(deltaSeconds: number): void;
}

export function createInstallHint(platform: HintPlatform): InstallHint {
  const element = document.createElement('div');
  element.className = 'install-hint';
  element.setAttribute('role', 'presentation');

  const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  arrow.setAttribute('viewBox', '0 0 24 24');
  arrow.setAttribute('fill', 'currentColor');
  arrow.setAttribute('aria-hidden', 'true');
  // An arrow that leans toward the corner the browser's control lives in.
  arrow.innerHTML =
    '<path d="M12 2.8l5.6 5.6-1.8 1.8-2.5-2.5v8.7h-2.6V7.7l-2.5 2.5-1.8-1.8z" opacity="0.85"/>';
  arrow.classList.add('install-hint__arrow');

  const glyph = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  glyph.setAttribute('viewBox', '0 0 24 24');
  glyph.setAttribute('fill', 'currentColor');
  glyph.setAttribute('aria-hidden', 'true');
  glyph.innerHTML = HINT_ICONS[platform];

  element.append(glyph, arrow);
  element.style.opacity = '0';
  element.style.display = 'none';

  let elapsed = 0;
  let showing = false;

  const hide = (): void => {
    showing = false;
    element.style.display = 'none';
  };

  element.addEventListener('pointerdown', hide);

  return {
    element,
    isShowing: () => showing,
    dismiss: hide,

    show: () => {
      elapsed = 0;
      showing = true;
      element.style.display = 'flex';
      element.style.opacity = '0';
    },

    update: (deltaSeconds) => {
      if (!showing) {
        return;
      }

      elapsed += Math.max(deltaSeconds, 0);
      const frame = hintFrame(elapsed);
      element.style.opacity = String(frame.opacity);
      element.style.setProperty('--bob', String(frame.bob));

      if (frame.finished) {
        hide();
      }
    },
  };
}
