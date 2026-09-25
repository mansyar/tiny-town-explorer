import { PCFShadowMap, WebGLRenderer } from 'three';
import { createAudioEngine, type SampledSound } from './game/audio/audioEngine';
import { SOUND_MODELS } from './game/audio/audioRegistry';
import { loadSamples } from './game/audio/sampleLoader';
import { createCameraRig } from './game/camera';
import { createGame, type GameHud } from './game/game';
import { createHoldGate } from './game/hud/holdGate';
import {
  createInstallHint,
  HINT_SESSION_KEY,
  platformFrom,
  shouldShowHint,
} from './game/hud/installHint';
import { createParentPanel } from './game/hud/parentPanel';
import { createVehicleHud, type VehicleHud } from './game/hud/vehicleHud';
import { createInputRouter, ndcFromPoint } from './game/input/inputRouter';
import { calmGapOverride } from './game/mission/devCalmGap';
import { startRenderLoop } from './game/renderLoop';
import { installRenderProbe } from './game/renderProbe';
import { createScene } from './game/scene';
import { createTownGrid } from './game/town/townGrid';

/**
 * Creates the single WebGL renderer. Antialiasing, soft shadows, and a pixel
 * ratio capped at 2 keep the iPad-9th-gen frame budget safe on Retina
 * displays.
 */
function createRenderer(container: HTMLElement): WebGLRenderer {
  const renderer = new WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight, false);
  container.append(renderer.domElement);
  return renderer;
}

async function main(): Promise<void> {
  const container = document.querySelector<HTMLElement>('#app');
  if (container === null) {
    throw new Error('Bootstrap failed: #app container missing from index.html');
  }

  const renderer = createRenderer(container);
  const { scene, followSun } = createScene();
  const grid = createTownGrid();

  // The car starts on the street and the camera opens on it, so the sky is on
  // screen while the models stream in.
  const spawn = grid.spawnPoints[0] ?? { x: 0, z: 0 };
  const rig = createCameraRig(container.clientWidth / container.clientHeight);
  rig.snapTo(spawn);

  // A dev-only probe makes the real post-render counters addressable from a
  // browser session. It has no production branch, no UI, and no per-frame work
  // when `import.meta.env.DEV` is false.
  const renderProbe = import.meta.env.DEV
    ? installRenderProbe({
        renderer,
        scene,
        camera: rig.camera,
        focus: rig.focus,
        target: window,
      })
    : undefined;

  // ResizeObserver covers window resizes and orientation changes alike,
  // including the initial layout pass.
  const observer = new ResizeObserver(() => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height, false);
    rig.resize(width / height);
  });
  observer.observe(container);

  // Sound waits for a gesture. The context and its samples are prepared up
  // front so the very first tap has something to play; only `unlock` (below,
  // on the first pointerdown) makes any of it audible.
  const audio = createAudioEngine();
  void loadSamples(
    audio,
    // Object.entries widens every key to `string`; SOUND_MODELS keys are the
    // closed SampledSound union, so the assertion restores what the record knows.
    Object.entries(SOUND_MODELS) as [SampledSound, string][],
  );

  // The vehicle HUD only exists once the models are in, but the controller's
  // port has to be there from the first frame. These closures are that seam:
  // until the real buttons arrive they are no-ops, exactly as the `hud?.`
  // guards were.
  let hud: VehicleHud | undefined;
  const hudPort: GameHud = {
    setActive: (id) => hud?.setActive(id),
    setAbility: (id) => hud?.setAbility(id),
    setAbilityBusy: (busy) => hud?.setAbilityBusy(busy),
    setAbilityVisible: (visible) => hud?.setAbilityVisible(visible),
    setPolicePulse: (pulsing) => hud?.setPolicePulse(pulsing),
  };

  // Dev-only, and dropped from production builds: `?calmGap=2` shortens the
  // gap so a manual walkthrough can see all four missions back to back
  // instead of waiting the shipped 60-90s between each. The controller reads
  // it as data, so `window` and `import.meta` never reach its tests.
  const calmGap = import.meta.env.DEV
    ? calmGapOverride(window.location.search)
    : undefined;

  // The controller owns the world; everything below is the edge that wires it
  // to the page.
  const game = createGame({
    audio,
    hud: hudPort,
    scene,
    camera: {
      facing: rig.camera,
      setTarget: (point) => rig.setTarget(point),
      followSun: (focus) => followSun(focus),
    },
    grid,
    calmGap,
  });

  // The parent settings, and the only way in: a three-second hold on the gear.
  const gate = createHoldGate();
  const panel = createParentPanel({
    onToggle: (id, on) => {
      if (id === 'sfx') {
        audio.setMuted(!on);
        hud?.setMuted(!on);
        return;
      }
      game.setHelperEnabled(on);
    },
  });
  document.body.append(panel.element);
  panel.element.addEventListener('pointerdown', (event) => {
    event.stopPropagation();
    gate.press();
  });
  // Any way the press can end counts as letting go: lifting, the system
  // cancelling it, or the finger sliding off the gear.
  for (const ending of ['pointerup', 'pointercancel', 'pointerleave'] as const) {
    panel.element.addEventListener(ending, () => {
      gate.release();
      panel.setHoldProgress(0);
    });
  }

  // The one-time nudge to put the game on the home screen: session-scoped, and
  // never shown to someone already playing from the home screen.
  const installHint = createInstallHint(platformFrom(navigator.userAgent));
  let hinted = false;
  try {
    hinted = window.sessionStorage.getItem(HINT_SESSION_KEY) !== null;
  } catch {
    // Safari in private mode refuses sessionStorage. A hint is not worth a throw.
    hinted = false;
  }
  const installed =
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari exposes `navigator.standalone`; lib.dom does not type it, so
    // the assertion is the only way to read the flag the platform sets.
    (navigator as { readonly standalone?: boolean }).standalone === true;
  if (shouldShowHint({ installed, hintedThisSession: hinted })) {
    try {
      window.sessionStorage.setItem(HINT_SESSION_KEY, 'yes');
    } catch {
      // As above: the hint has still been shown.
    }
    document.body.append(installHint.element);
    installHint.show();
  }

  // The loop starts as soon as the controller returns, so the sky is on screen
  // while the models stream in.
  startRenderLoop(
    renderer,
    scene,
    rig.camera,
    ({ delta }) => advance(delta),
    renderProbe?.afterRender,
  );

  // The car and its motor arrive only once the town has been measured, because
  // the hitboxes *are* the mounted art. Until then the loop just holds the sky.
  await game.driven;
  rig.snapTo(spawn);

  // Every tap is answered: a destination becomes a route the car drives, and a
  // tap under the car is a honk (its squish and sound join the feedback pass).
  // Taps that arrive while a route is running simply replace it.
  const router = createInputRouter({
    camera: rig.camera,
    grid,
    getCarPosition: () => game.carPosition(),
  });
  renderer.domElement.addEventListener('pointerdown', (event) => {
    // The first gesture is the only thing that lets the browser start audio.
    void audio.unlock();
    // Any touch at all is a kid playing, so the hand restarts its patience.
    game.noteActivity();
    const rect = renderer.domElement.getBoundingClientRect();
    const command = router.tapAt(ndcFromPoint(event.clientX, event.clientY, rect));
    if (command.kind === 'honk') {
      game.honk(command.at);
      return;
    }
    if (!router.isCurrent(command)) {
      return;
    }
    void game.tapAt(command.target, command.landed);
  });

  await game.ready;

  const hudControls = createVehicleHud({
    onSelect: (id) => {
      void game.selectVehicle(id);
    },
    onAbility: () => game.pressAbility(),
    onMute: (muted) => audio.setMuted(muted),
  });
  hud = hudControls;
  document.body.append(hudControls.element);
  hudControls.setActive(game.activeVehicle());
  hudControls.setAbility(game.activeVehicle());

  /**
   * One frame of the whole game, in the order the pieces depend on it. Named
   * rather than inlined so the loop and any verification drive the same code.
   */
  function advance(delta: number): void {
    // The game frame: the world, the car, and the town's own story.
    game.advance(delta);
    // The gear fills its ring while it is held, and the settings open on the
    // frame the hold completes - once, however long the finger stays down.
    if (gate.isHolding()) {
      panel.setHoldProgress(gate.progress());
    }
    if (gate.update(delta)) {
      gate.release();
      panel.setHoldProgress(0);
      panel.show();
    }
    installHint.update(delta);
    // The rig eases last, after the game frame, so the camera never lags.
    rig.update(delta);
  }
}

await main();
