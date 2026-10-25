import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // OpenAI calls cost money: this cuts tests off from the network entirely.
    setupFiles: ["./src/test/no-network.ts"],
  },
});
