import { resolve } from "node:path";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

const here = import.meta.dirname;

export default defineConfig({
  publicDir: false,
  plugins: [
    dts({
      include: ["src/keyboard"],
      rollupTypes: true,
      tsconfigPath: resolve(here, "tsconfig.lib.json"),
    }),
  ],
  build: {
    lib: {
      entry: resolve(here, "src/keyboard/index.ts"),
      formats: ["es"],
      fileName: "virtual-keyboard",
    },
    rollupOptions: {
      external: [],
    },
    emptyOutDir: true,
    outDir: resolve(here, "dist"),
  },
});
