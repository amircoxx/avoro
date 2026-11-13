import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const backendProxyTarget = env.VITE_BACKEND_PROXY_TARGET ?? "http://localhost:3001";

  return {
    plugins: [react()],
    resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
    server: {
      host: "0.0.0.0",
      port: 3000,
      strictPort: true,
      proxy: {
        "/api": backendProxyTarget,
        "/socket.io": { target: backendProxyTarget, ws: true }
      }
    }
  };
});
