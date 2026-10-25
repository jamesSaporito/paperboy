import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/main.ts"],
  platform: "node",
  format: "esm",
  sourcemap: true,
  deps: {
    // Internal packages ship TypeScript source, so they must be compiled into the bundle.
    alwaysBundle: [/^@paperboy\//],
    // Their own dependencies (Prisma, pg) are bundled too, keeping dist/ self-contained.
    onlyBundle: false,
  },
});
