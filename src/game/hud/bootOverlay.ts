/**
 * The child-visible boot overlay: what a three-year-old sees between tapping
 * the icon and getting the town.
 *
 * Three pictures, never a word. While the world mounts it is a soft bouncing
 * toy car; a tap on it squashes that toy so a loading screen still answers;
 * and if the mount fails it becomes one big round arrow, because the only thing
 * left to offer is another go. `zero text` is a product pillar, so the retry
 * button carries an `aria-label` for a screen reader and nothing a child could
 * read on the glass.
 *
 * The overlay covers the page, which is deliberate and load-bearing: it is the
 * first thing on screen, so it takes the tap that unlocks audio, and it keeps
 * that same tap from reaching the world before there is a world to drive. The
 * lifecycle decision behind it is `bootStatus.ts`, which is pure and tested;
 * this module is the thin DOM layer over it, like the rest of the HUD.
 */
import type { BootPhase } from './bootStatus';

/** The toy that bounces while the town is still arriving. */
const LOADING_ICON =
  '<path d="M5.4 9.4h13.2l1.6 5.4H3.8z"/><path d="M7.6 9.4 9 5.4h6l1.4 4z"/><circle cx="7.4" cy="17.4" r="2.4"/><circle cx="16.6" cy="17.4" r="2.4"/>';

/** A single round arrow: try that again. */
const RETRY_ICON =
  '<path d="M12 4.2a7.8 7.8 0 1 1-7.5 10" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2.6"/><path d="M11.6 1.2 15 4.2l-3.4 3z"/>';

/**
 * How long the toy stays squashed after a tap. Long enough to read as an
 * answer, short enough that a child tapping again never waits on the last one.
 */
const TOUCH_SQUASH_MS = 220;

/** The squash itself: a soft wooden-toy press, never a flash or a shake. */
const TOUCH_SQUASH_KEYFRAMES: Keyframe[] = [
  { transform: 'scale(1, 1)' },
  { transform: 'scale(1.14, 0.86)', offset: 0.4 },
  { transform: 'scale(1, 1)' },
];

export interface BootOverlayOptions {
  /** A grown-up asked to try the whole page again. */
  readonly onRetry: () => void;
  /**
   * A touch landed on the overlay. Returns true when the lifecycle still owes
   * the child an answer, which is the cue to squash the toy.
   */
  readonly onTouch?: () => boolean;
}

export interface BootOverlay {
  readonly element: HTMLElement;
  /** Paint the current lifecycle phase. */
  setPhase(phase: BootPhase): void;
  dispose(): void;
}

function icon(markup: string): SVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = markup;
  return svg;
}

export function createBootOverlay(options: BootOverlayOptions): BootOverlay {
  const element = document.createElement('div');
  element.className = 'boot';
  // The overlay answers touches itself, so the world underneath never sees
  // them; `role` stays presentational because it is scenery, not a control.
  element.setAttribute('role', 'presentation');

  const toy = document.createElement('div');
  toy.className = 'boot__toy';

  const retry = document.createElement('button');
  retry.className = 'boot__retry';
  // Read aloud to a grown-up, invisible to a child: the pillar is no text.
  retry.type = 'button';
  retry.setAttribute('aria-label', 'Try again');
  retry.append(icon(RETRY_ICON));
  retry.style.display = 'none';

  const onRetryClick = (): void => {
    options.onRetry();
  };
  // `click`, not `pointerdown`: a button that carries an `aria-label` is
  // advertised to assistive technology, and Enter, Space, and screen-reader
  // activation all fire `click`. `pointerdown` alone leaves the control
  // focusable, announced, and completely inert for those users. `bootStatus`
  // already refuses a second retry, so a rapid double tap still reloads once.
  retry.addEventListener('click', onRetryClick);

  // A three-year-old taps to see whether the world heard them. The overlay takes
  // that tap so it never becomes a queued route, and answers it here with a
  // squash, so a loading screen is never a dead one.
  //
  // The squash lands on an inner element rather than the toy itself, so it
  // composes with the CSS bounce instead of replacing its transform wholesale.
  // Animating the toy directly would snap the bounce's current vertical offset
  // to zero the instant the animation starts.
  const face = document.createElement('div');
  face.className = 'boot__toy-face';
  face.append(icon(LOADING_ICON));
  toy.append(face);

  let squash: Animation | undefined;
  const onOverlayPointerDown = (): void => {
    if (options.onTouch?.() !== true) {
      return;
    }
    // Restart rather than queue, so rapid taps each land as their own answer.
    squash?.cancel();
    squash = face.animate(TOUCH_SQUASH_KEYFRAMES, {
      duration: TOUCH_SQUASH_MS,
      easing: 'ease-out',
    });
  };
  element.addEventListener('pointerdown', onOverlayPointerDown);

  element.append(toy, retry);

  return {
    element,

    setPhase: (phase) => {
      const failed = phase === 'failed' || phase === 'retrying';
      toy.style.display = failed ? 'none' : '';
      retry.style.display = failed ? '' : 'none';
    },

    dispose: () => {
      squash?.cancel();
      element.removeEventListener('pointerdown', onOverlayPointerDown);
      retry.removeEventListener('click', onRetryClick);
      element.remove();
    },
  };
}
