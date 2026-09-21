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
        // glue from the >80% logic rule): the WebGL bootstrap, and the HUD,
        // which the plan verifies on a real touch screen rather than in jsdom.
        'src/main.ts',
        'src/game/hud/**',
      ],
      // Per-module ≥80% thresholds arrive with the first logic modules
      // (input/pathfinding/FSM/pacing); a global floor now would fail on
      // scaffold code with no logic yet.
    },
  },
});
