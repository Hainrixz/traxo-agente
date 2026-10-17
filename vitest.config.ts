import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts", "apps/*/test/**/*.test.ts", "scripts/*.test.ts"],
    testTimeout: 30000,
    // Las pruebas ejercitan el flujo completo con la tienda simulada.
    env: { TRAXO_DEMO: "1" },
  },
});
