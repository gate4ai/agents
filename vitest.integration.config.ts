import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "."),
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    globals: true,
    environment: "node", // Важно, что среда node, а не nuxt
    setupFiles: ["./test/unit-setup.ts"], // Используем тот же setup, что и для unit-тестов
    include: ["test/integration/**/*.{spec,test}.ts"],
  },
});
