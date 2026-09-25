/**
 * The child-visible boot overlay: what a three-year-old sees between tapping
 * the icon and getting the town.
 *
 * Two pictures, never a word. While the world mounts it is a soft bouncing toy
 * car; if that mount fails it becomes one big round arrow, because the only
 * thing left to offer is another go. `zero text` is a product pillar, so the
 * retry button carries an `aria-label` for a screen reader and nothing a child
 * could read on the glass.
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

export interface BootOverlayOptions {
  /** A grown-up asked to try the whole page again. */
  readonly onRetry: () => void;
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
  toy.append(icon(LOADING_ICON));

  const retry = document.createElement('button');
  retry.className = 'boot__retry';
  // Read aloud to a grown-up, invisible to a child: the pillar is no text.
  retry.type = 'button';
  retry.setAttribute('aria-label', 'Try again');
  retry.append(icon(RETRY_ICON));
  retry.style.display = 'none';

  const onPointerDown = (): void => {
    options.onRetry();
  };
  retry.addEventListener('pointerdown', onPointerDown);

  element.append(toy, retry);

  return {
    element,

    setPhase: (phase) => {
      const failed = phase === 'failed' || phase === 'retrying';
      toy.style.display = failed ? 'none' : '';
      retry.style.display = failed ? '' : 'none';
    },

    dispose: () => {
      retry.removeEventListener('pointerdown', onPointerDown);
      element.remove();
    },
  };
}
