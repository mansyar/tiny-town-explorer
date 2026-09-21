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

/** What the ability button does for each vehicle, in the same icon language. */
const ABILITY_ICONS: Readonly<Record<VehicleId, string>> = {
  fire: '<path d="M12 2.4c3.6 4.6 5.6 7.4 5.6 10.2a5.6 5.6 0 0 1-11.2 0c0-2.8 2-5.6 5.6-10.2z"/>',
  iceCream:
    '<path d="M7.4 10.4h9.2L12 21.4z"/><circle cx="12" cy="6.6" r="4.2"/><circle cx="8.8" cy="9.6" r="2.6"/><circle cx="15.2" cy="9.6" r="2.6"/>',
  garbage:
    '<path d="M10.6 2.6h2.8v9.2h3.4L12 18.2 7.2 11.8h3.4z"/><rect x="6" y="19.4" width="12" height="2.4" rx="1.2"/>',
  police:
    '<path d="M8.4 4.6h7.2l1.3 2.8H20v2.4h-2.1l-.4 1a6 6 0 0 1 .9 3.2v4.6H5.6v-4.6c0-1.2.4-2.3 1-3.2l-.5-1H4V6.8h3.2z"/><path d="M1.6 7.4a7 7 0 0 0 0 10.4M22.4 7.4a7 7 0 0 1 0 10.4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2.2"/>',
};

const MUTE_ON =
  '<path d="M3.6 9.2h3.8L12.6 5v14l-5.2-4.2H3.6z"/><path d="M15.4 9.4l6 5.6M21.4 9.4l-6 5.6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2.2"/>';
const MUTE_OFF =
  '<path d="M3.6 9.2h3.8L12.6 5v14l-5.2-4.2H3.6z"/><path d="M16 8.6a5.6 5.6 0 0 1 0 6.8M18.6 6.2a9 9 0 0 1 0 11.6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2.2"/>';

export interface VehicleHudOptions {
  /** A kid picked a vehicle. */
  readonly onSelect: (id: VehicleId) => void;
  /** A kid pressed the ability button. */
  readonly onAbility: () => void;
  /** The mute was toggled; the engine applies it. */
  readonly onMute: (muted: boolean) => void;
}

export interface VehicleHud {
  readonly element: HTMLElement;
  /** Light up the vehicle the kid is driving. */
  setActive(id: VehicleId): void;
  /** Point the ability button at the active vehicle's trick. */
  setAbility(id: VehicleId): void;
  /** Dim the ability button while its one-shot is running. */
  setAbilityBusy(busy: boolean): void;
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

  // The ability is the only button that *does* something rather than choosing
  // something, so it is the biggest and it wears the active vehicle's colour.
  const abilityButton = document.createElement('button');
  abilityButton.type = 'button';
  abilityButton.className = 'hud-button hud-button--ability';
  abilityButton.setAttribute('aria-label', 'the vehicle does its thing');
  abilityButton.append(icon(ABILITY_ICONS[VEHICLE_IDS[0]]));
  abilityButton.addEventListener('click', () => options.onAbility());
  element.append(abilityButton);

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
    setAbility(id): void {
      for (const vehicle of VEHICLE_IDS) {
        abilityButton.classList.toggle(`hud-button--${vehicle}`, vehicle === id);
      }
      abilityButton.replaceChildren(icon(ABILITY_ICONS[id]));
    },
    setAbilityBusy(busy): void {
      abilityButton.classList.toggle('is-busy', busy);
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
