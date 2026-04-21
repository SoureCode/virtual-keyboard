import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

const here = import.meta.dirname;

const proxyUri = process.env["VSCODE_PROXY_URI"];
const proxyUrl = proxyUri?.replace("{{port}}", "5173").replace(/\/$/, "");
const parsed = proxyUrl ? new URL(proxyUrl) : undefined;

const reinstateBase = (base: string): Plugin => ({
  name: "reinstate-stripped-base",
  apply: "serve",
  configureServer(server) {
    if (base === "/") return;
    server.middlewares.use((req, _res, next) => {
      if (req.url && !req.url.startsWith(base)) {
        req.url = base + req.url.replace(/^\//, "");
      }
      next();
    });
  },
});

const common = {
  root: resolve(here, "src"),
  publicDir: resolve(here, "public"),
} as const;

export default defineConfig(({ command }) => {
  if (command === "build") {
    return {
      ...common,
      base: (process.env["BASE_PATH"] ?? "/").replace(/\/?$/, "/"),
      build: {
        outDir: resolve(here, "dist"),
        emptyOutDir: true,
        rollupOptions: {
          input: {
            main: resolve(here, "src/index.html"),
            linux: resolve(here, "src/linux.html"),
          },
        },
      },
    };
  }

  const base = parsed ? parsed.pathname.replace(/\/?$/, "/") : "/";
  return {
    ...common,
    base,
    plugins: [reinstateBase(base)],
    server: {
      host: true,
      port: 5173,
      strictPort: true,
      allowedHosts: true,
      ...(parsed
        ? {
            hmr: {
              host: parsed.hostname,
              clientPort: 443,
              protocol: "wss",
              path: base,
            },
          }
        : {}),
    },
  };
});
