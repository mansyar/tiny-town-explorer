import { defineConfig } from 'vitest/config';

/**
 * Unit-test configuration. Tests target the logic-bearing modules
 * (pathfinding, input resolution, FSM, mission pacing, audio scheduling);
 * rendering/scene/asset code is verified manually per conductor/workflow.md.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/vite-env.d.ts',
        // DOM glue, manual-verified by design (workflow.md exempts scene/DOM
        // glue from the >80% logic rule): the WebGL bootstrap, and the HUD's
        // panel and button chrome. The HUD's pure logic (holdGate, installHint)
        // stays measured.
        'src/main.ts',
        // The dev-only WebGL probe is browser/scene glue; its pure measurement
        // contract remains measured in renderMetrics.test.ts.
        'src/game/renderProbe.ts',
        'src/game/hud/parentPanel.ts',
        'src/game/hud/vehicleHud.ts',
        'src/game/hud/bootOverlay.ts',
      ],
    },
  },
});
