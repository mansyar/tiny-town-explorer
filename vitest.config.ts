import { defineConfig } from 'vitest/config';

/**
 * Unit-test configuration. Tests target the logic-bearing modules
 * (pathfinding, input resolution, FSM, mission pacing, audio scheduling);
 * rendering/scene/asset code is verified manually per conductor/workflow.md.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/vite-env.d.ts',
        // The DOM/WebGL bootstrap is manual-verified, not covered.
        'src/main.ts',
      ],
      // Per-module ≥80% thresholds arrive with the first logic modules
      // (input/pathfinding/FSM/pacing); a global floor now would fail on
      // scaffold code with no logic yet.
    },
  },
});
