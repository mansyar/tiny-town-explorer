// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { VEHICLE_IDS, type VehicleId } from '../vehicle/vehicleSystem';
import { createVehicleHud } from './vehicleHud';

/**
 * The vehicle switcher's answer to a tap.
 *
 * This file exists because of a review finding. The pending answer's ability
 * button used to be *pushed* — raised on the tap, never rewound — and two
 * reachable states left it naming a truck nobody was driving: a failed switch,
 * and a superseding commit. Both are invisible from `game.test.ts`, because the
 * controller calling `hud.setAbility('fire')` when fire commits is correct; the
 * bug was entirely in how this module interpreted the pair. `vehicleHud.ts` had
 * no test at all, so nothing could have caught it.
 */
describe('the pending answer to a switch tap', () => {
  /** A HUD with no-op wiring; these tests are about painted state, not clicks. */
  function hud() {
    return createVehicleHud({
      onSelect: vi.fn(),
      onAbility: vi.fn(),
      onMute: vi.fn(),
    });
  }

  /** The vehicle whose colour and icon the ability button is currently wearing. */
  function abilityShows(view: ReturnType<typeof hud>): VehicleId | undefined {
    return VEHICLE_IDS.find((id) =>
      view.element
        .querySelector('.hud-button--ability')
        ?.classList.contains(`hud-button--${id}`),
    );
  }

  /** The button currently wearing the pending ring, if any. */
  function pendingButton(view: ReturnType<typeof hud>): VehicleId | undefined {
    return VEHICLE_IDS.find((id) =>
      view.element.querySelector(`.hud-button--${id}`)?.classList.contains('is-pending'),
    );
  }

  it('rings the tapped button and points the ability at it', () => {
    const view = hud();
    view.setActive('fire');
    view.setPending('police');

    expect(pendingButton(view)).toBe('police');
    expect(abilityShows(view)).toBe('police');
  });

  it('leaves the active ring where the committed vehicle put it', () => {
    const view = hud();
    view.setActive('fire');
    view.setPending('police');

    // "Asked for" and "driving" stay two readable things, which is the whole
    // reason the ring is drawn outside the active one.
    const fire = view.element.querySelector('.hud-button--fire');
    expect(fire?.classList.contains('is-active')).toBe(true);
    expect(fire?.classList.contains('is-pending')).toBe(false);
  });

  it('returns the ability to the driving truck when a switch fails', () => {
    const view = hud();
    view.setActive('fire');
    view.setPending('police');
    // The commit that would normally follow never happens, so the withdrawal
    // is the only thing that can put the button back.
    view.setPending(undefined);

    expect(pendingButton(view)).toBeUndefined();
    expect(abilityShows(view)).toBe('fire');
  });

  it('keeps the newest tap on the ability button when an older one commits', () => {
    const view = hud();
    view.setPending('police');
    // A superseded request commits and publishes its own trick...
    view.setActive('fire');

    // ...but the newest tap still owns the ring, so it must still own the
    // ability button, or the HUD names two different trucks at once.
    expect(pendingButton(view)).toBe('police');
    expect(abilityShows(view)).toBe('police');
  });

  it('settles on the newest vehicle once the switch lands', () => {
    const view = hud();
    view.setActive('fire');
    view.setPending('police');
    view.setActive('police');
    view.setPending(undefined);

    expect(pendingButton(view)).toBeUndefined();
    expect(abilityShows(view)).toBe('police');
  });

  it('marks the answer for assistive tech without adding visible text', () => {
    const view = hud();
    view.setPending('garbage');

    const garbage = view.element.querySelector('.hud-button--garbage');
    const fire = view.element.querySelector('.hud-button--fire');
    expect(garbage?.getAttribute('aria-busy')).toBe('true');
    expect(fire?.getAttribute('aria-busy')).toBe('false');

    view.setPending(undefined);
    expect(garbage?.getAttribute('aria-busy')).toBe('false');
    // The zero-text pillar: the answer is a class and an attribute, never a
    // string the child could have to read.
    expect(view.element.textContent?.trim()).toBe('');
  });

  it('keeps the committed vehicle owning the ability when nothing is pending', () => {
    const view = hud();
    view.setActive('garbage');

    expect(abilityShows(view)).toBe('garbage');
    expect(pendingButton(view)).toBeUndefined();
  });
});

/**
 * The rest of the switcher's job, pinned for the same reason: lifting this file
 * out of the coverage exclusion means its behaviour is now measured, and a mute
 * button that silently stopped working is precisely the regression that
 * measurement is for.
 */
describe('the vehicle switcher controls', () => {
  function hud() {
    return createVehicleHud({
      onSelect: vi.fn(),
      onAbility: vi.fn(),
      onMute: vi.fn(),
    });
  }

  /** Clicks through the DOM, the way a child's finger does. */
  function click(view: ReturnType<typeof hud>, selector: string): void {
    const button = view.element.querySelector(selector);
    if (button === null) {
      throw new Error(`no control matched ${selector}`);
    }
    button.dispatchEvent(new Event('click'));
  }

  it('reports the vehicle a tap chose', () => {
    const onSelect = vi.fn();
    const view = createVehicleHud({ onSelect, onAbility: vi.fn(), onMute: vi.fn() });

    click(view, '.hud-button--iceCream');
    click(view, '.hud-button--police');

    expect(onSelect).toHaveBeenNthCalledWith(1, 'iceCream');
    expect(onSelect).toHaveBeenNthCalledWith(2, 'police');
  });

  it('reports the ability press and the mute press', () => {
    const onAbility = vi.fn();
    const onMute = vi.fn();
    const view = createVehicleHud({ onSelect: vi.fn(), onAbility, onMute });

    click(view, '.hud-button--ability');
    expect(onAbility).toHaveBeenCalledOnce();

    const mute = view.element.querySelector('.hud-button--mute');
    click(view, '.hud-button--mute');
    expect(onMute).toHaveBeenNthCalledWith(1, true);
    expect(mute?.classList.contains('is-muted')).toBe(true);
    click(view, '.hud-button--mute');
    expect(onMute).toHaveBeenNthCalledWith(2, false);
    expect(mute?.classList.contains('is-muted')).toBe(false);
  });

  it('dims the ability button while a burst is playing', () => {
    const view = hud();
    const ability = view.element.querySelector('.hud-button--ability');

    view.setAbilityBusy(true);
    expect(ability?.classList.contains('is-busy')).toBe(true);
    view.setAbilityBusy(false);
    expect(ability?.classList.contains('is-busy')).toBe(false);
  });

  it('hides the ability button out of range, and brings it back', () => {
    const view = hud();
    const ability = view.element.querySelector('.hud-button--ability');

    view.setAbilityVisible(false);
    expect(ability?.classList.contains('is-hidden')).toBe(true);
    view.setAbilityVisible(true);
    expect(ability?.classList.contains('is-hidden')).toBe(false);
  });

  it('pulses the police button while the town waits for the siren', () => {
    const view = hud();
    const police = view.element.querySelector('.hud-button--police');

    view.setPolicePulse(true);
    expect(police?.classList.contains('is-pulsing')).toBe(true);
    view.setPolicePulse(false);
    expect(police?.classList.contains('is-pulsing')).toBe(false);
  });

  it('mutes from the edge as well as from its own button', () => {
    const view = hud();
    const mute = view.element.querySelector('.hud-button--mute');

    // The parent panel's toggle arrives here, and it must reach the same state
    // the button's own click would have produced.
    view.setMuted(true);
    expect(mute?.classList.contains('is-muted')).toBe(true);
    view.setMuted(false);
    expect(mute?.classList.contains('is-muted')).toBe(false);
  });

  it('takes its controls out of the page when disposed', () => {
    const view = hud();
    view.element.remove();
    expect(view.element.parentNode).toBeNull();

    view.dispose();
    expect(view.element.parentNode).toBeNull();
  });
});
