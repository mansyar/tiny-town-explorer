/**
 * The vehicle switcher: four chunky buttons and a mute, drawn in DOM rather
 * than in the 3D scene.
 *
 * DOM because these are the only controls in the game and every other option
 * costs more for less: buttons keep native touch targeting, the browser's own
 * hit-testing and accessible roles for free, while a three.js overlay would
 * have to reimplement all three. Nothing here carries text — each button is an
 * icon a pre-reader can tell apart at a glance, and the vehicle's own colour.
 *
 * Layout and paint live in `index.html` (the project styles DOM by class, never
 * by id); this module only builds the elements and owns their state.
 */
import { VEHICLE_IDS, type VehicleId } from '../vehicle/vehicleSystem';

/** Chunky single-colour glyphs, readable at a glance and at 48px. */
const ICONS: Readonly<Record<VehicleId, string>> = {
  fire: '<path d="M12 2.5c.4 3.4-3.5 4.6-3.5 8.2a4.6 4.6 0 0 0 9.2 0c0-3.6-3.9-4.8-3.5-8.2-1 1.1-1.8 2.3-2.2 3.6z"/>',
  iceCream:
    '<path d="M7.4 10.4h9.2L12 21.4z"/><circle cx="12" cy="6.6" r="4.2"/><circle cx="8.8" cy="9.6" r="2.6"/><circle cx="15.2" cy="9.6" r="2.6"/>',
  garbage:
    '<path d="M6.2 8.6h11.6l-1.3 12.9H7.5z"/><rect x="4.6" y="4.6" width="14.8" height="2.9" rx="1.45"/><rect x="10" y="2.2" width="4" height="2.4" rx="1.2"/>',
  police:
    '<path d="M12 2.2l2.9 6 6.6.9-4.8 4.6 1.2 6.5-5.9-3.1-5.9 3.1 1.2-6.5L2.5 9.1l6.6-.9z"/>',
};

const MUTE_ON =
  '<path d="M3.6 9.2h3.8L12.6 5v14l-5.2-4.2H3.6z"/><path d="M15.4 9.4l6 5.6M21.4 9.4l-6 5.6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2.2"/>';
const MUTE_OFF =
  '<path d="M3.6 9.2h3.8L12.6 5v14l-5.2-4.2H3.6z"/><path d="M16 8.6a5.6 5.6 0 0 1 0 6.8M18.6 6.2a9 9 0 0 1 0 11.6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2.2"/>';

export interface VehicleHudOptions {
  /** A kid picked a vehicle. */
  readonly onSelect: (id: VehicleId) => void;
  /** The mute was toggled; the engine applies it. */
  readonly onMute: (muted: boolean) => void;
}

export interface VehicleHud {
  readonly element: HTMLElement;
  /** Light up the vehicle the kid is driving. */
  setActive(id: VehicleId): void;
  setMuted(muted: boolean): void;
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

export function createVehicleHud(options: VehicleHudOptions): VehicleHud {
  const element = document.createElement('div');
  element.className = 'hud';

  const row = document.createElement('div');
  row.className = 'hud-vehicles';
  element.append(row);

  const buttons = new Map<VehicleId, HTMLButtonElement>();
  for (const id of VEHICLE_IDS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `hud-button hud-button--${id}`;
    // Not visible text: this only names the button for assistive tech, so the
    // game stays textless for the child and reachable for everyone else.
    button.setAttribute('aria-label', `vehicle ${id}`);
    button.append(icon(ICONS[id]));
    button.addEventListener('click', () => options.onSelect(id));
    row.append(button);
    buttons.set(id, button);
  }

  const muteButton = document.createElement('button');
  muteButton.type = 'button';
  muteButton.className = 'hud-button hud-button--mute';
  muteButton.setAttribute('aria-label', 'sound on or off');
  muteButton.append(icon(MUTE_OFF));
  element.append(muteButton);

  let muted = false;
  muteButton.addEventListener('click', () => {
    muted = !muted;
    muteButton.replaceChildren(icon(muted ? MUTE_ON : MUTE_OFF));
    muteButton.classList.toggle('is-muted', muted);
    options.onMute(muted);
  });

  return {
    element,
    setActive(id): void {
      for (const [vehicle, button] of buttons) {
        button.classList.toggle('is-active', vehicle === id);
        button.setAttribute('aria-pressed', String(vehicle === id));
      }
    },
    setMuted(next): void {
      muted = next;
      muteButton.classList.toggle('is-muted', muted);
      muteButton.replaceChildren(icon(muted ? MUTE_ON : MUTE_OFF));
    },
    dispose(): void {
      element.remove();
    },
  };
}
