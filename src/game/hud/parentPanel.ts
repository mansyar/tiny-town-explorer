/**
 * The parent panel, and the hold that guards it.
 *
 * Everything here is for an adult and none of it is for the child, so it is
 * deliberately boring: a small gear in the corner that a kid has no reason to
 * touch, and a three-second hold to open it. The gate's filling ring is drawn
 * from `--hold`, which the caller sets from `HoldGate.progress()`.
 *
 * Icons only, no words. `aria-label` names each control for assistive tech, but
 * a pre-reader sees a speaker, a hand and a cross.
 */

import type { PanelToggleId } from './parentPanelTypes';

export type { PanelToggleId } from './parentPanelTypes';

/** What each control looks like. Nothing here carries a word. */
const TOGGLE_ICONS: Readonly<Record<PanelToggleId, string>> = {
  // A speaker with sound coming off it.
  sfx: '<path d="M4 9.6h3.2L12 5.4v13.2L7.2 14.4H4z"/><path d="M15.4 8.6a4.8 4.8 0 0 1 0 6.8M18.2 6a8.6 8.6 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  // A hand pointing, which is what the helper does.
  helper:
    '<path d="M9.4 11V4.6a1.6 1.6 0 0 1 3.2 0V10h1.2V6.8a1.5 1.5 0 0 1 3 0V11h1V8.6a1.5 1.5 0 0 1 3 0v5.6c0 3.2-2.2 5.4-5.4 5.4h-2.2c-2 0-3-1-4-2.6l-2.6-4.4a1.6 1.6 0 0 1 2.8-1.6z"/>',
};

const GEAR_ICON =
  '<path d="M12 8.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2zm0 5.6a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/><path d="M21.2 13.6v-3.2l-2.6-.4a6.9 6.9 0 0 0-.7-1.7l1.5-2.2-2.3-2.3-2.2 1.5a6.9 6.9 0 0 0-1.7-.7L12.8 2H9.2l-.4 2.6a6.9 6.9 0 0 0-1.7.7L4.9 3.8 2.6 6.1l1.5 2.2a6.9 6.9 0 0 0-.7 1.7L.8 10.4v3.2l2.6.4a6.9 6.9 0 0 0 .7 1.7l-1.5 2.2 2.3 2.3 2.2-1.5a6.9 6.9 0 0 0 1.7.7l.4 2.6h3.6l.4-2.6a6.9 6.9 0 0 0 1.7-.7l2.2 1.5 2.3-2.3-1.5-2.2a6.9 6.9 0 0 0 .7-1.7z"/>';

const CLOSE_ICON =
  '<path d="M6.4 6.4l11.2 11.2M17.6 6.4L6.4 17.6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>';

export interface ParentPanelOptions {
  /** Fires when an adult flips a control; `on` is the new state. */
  readonly onToggle: (id: PanelToggleId, on: boolean) => void;
}

export interface ParentPanel {
  /** The gear, and the thing the hold listens to. */
  readonly element: HTMLElement;
  isOpen(): boolean;
  show(): void;
  hide(): void;
  /** 0 to 1 of the way through the hold; drives the filling ring. */
  setHoldProgress(progress: number): void;
  setToggle(id: PanelToggleId, on: boolean): void;
  dispose(): void;
}

function icon(markup: string): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = markup;
  return svg;
}

export function createParentPanel(options: ParentPanelOptions): ParentPanel {
  const root = document.createElement('div');
  root.className = 'panel-root';

  // The gear. Small, grey, and out of the way of anything a child wants.
  const gear = document.createElement('button');
  gear.type = 'button';
  gear.className = 'panel-gate';
  gear.setAttribute('aria-label', 'settings, hold to open');
  gear.append(icon(GEAR_ICON));
  root.append(gear);

  // The panel itself, hidden until the gate opens.
  const overlay = document.createElement('div');
  overlay.className = 'panel';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'parent settings');

  const card = document.createElement('div');
  card.className = 'panel-card';
  overlay.append(card);
  root.append(overlay);

  const toggles = new Map<PanelToggleId, HTMLButtonElement>();
  for (const id of ['sfx', 'helper'] as const) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `panel-toggle panel-toggle--${id}`;
    button.setAttribute(
      'aria-label',
      id === 'sfx' ? 'sound on or off' : 'helper hand on or off',
    );
    button.append(icon(TOGGLE_ICONS[id]));
    button.addEventListener('click', () => {
      const on = button.classList.contains('is-off');
      setToggle(id, on);
      options.onToggle(id, on);
    });
    toggles.set(id, button);
    card.append(button);
  }

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'panel-close';
  close.setAttribute('aria-label', 'close');
  close.append(icon(CLOSE_ICON));
  close.addEventListener('click', () => hide());
  card.append(close);

  let open = false;

  function setToggle(id: PanelToggleId, on: boolean): void {
    const button = toggles.get(id);
    if (button === undefined) {
      return;
    }
    // "Off" is dimmed and ghosted, so the state reads without a word.
    button.classList.toggle('is-off', !on);
    button.setAttribute('aria-pressed', String(on));
  }

  function hide(): void {
    open = false;
    overlay.classList.remove('is-open');
  }

  return {
    element: root,
    isOpen: () => open,

    show: () => {
      open = true;
      overlay.classList.add('is-open');
    },

    hide,

    setHoldProgress: (progress) => {
      gear.style.setProperty('--hold', String(Math.min(Math.max(progress, 0), 1)));
      gear.classList.toggle('is-holding', progress > 0);
    },

    setToggle,

    dispose: () => {
      root.remove();
    },
  };
}
