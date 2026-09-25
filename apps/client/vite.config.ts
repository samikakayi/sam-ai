import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  plugins: [react()],
  envDir: rootDir,
  server: {
    port: 5173,
    host: "127.0.0.1",
    proxy: {
      "/preview": "http://127.0.0.1:8797",
      "/sites": "http://127.0.0.1:8797",
    },
    fs: {
      allow: [rootDir],
    },
  },
});
