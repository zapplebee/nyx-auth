import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 5173,
    // Allow any hostname (needed for Vela CI where the container is accessed
    // by service name e.g. http://test-app:5173)
    allowedHosts: true,
  },
  preview: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: true,
  },
});
