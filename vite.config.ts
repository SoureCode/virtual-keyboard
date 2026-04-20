import { defineConfig, type Plugin } from "vite";

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

export default defineConfig(({ command }) => {
  if (command === "build") {
    return {
      base: process.env["BASE_PATH"] ?? "/",
    };
  }

  const base = parsed ? `${parsed.pathname}/` : "/";
  return {
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
