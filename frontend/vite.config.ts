import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The SPA talks to the FastAPI service under /api. In development that is
// proxied to the uvicorn process; in Docker nginx does the same job, so the
// client never needs a hard-coded backend origin.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    // Listen on IPv4 as well as IPv6. Without this Vite can bind to ::1 only,
    // and http://127.0.0.1:5173 (or a browser that resolves "localhost" to
    // IPv4 first) then refuses the connection.
    host: true,
    proxy: {
      "/api": {
        target: process.env.VITE_DEV_API_TARGET ?? "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
