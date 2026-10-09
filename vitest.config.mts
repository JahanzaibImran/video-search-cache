import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    restoreMocks: true,
    unstubEnvs: true,
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["src/{lib,app,test}/**/*.test.ts"],
          setupFiles: ["src/test/setup.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "dom",
          environment: "jsdom",
          include: ["src/{components,hooks}/**/*.test.{ts,tsx}"],
          setupFiles: ["src/test/setup.ts", "src/test/setup-dom.ts"],
        },
      },
    ],
  },
});
