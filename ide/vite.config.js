import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  base: command === "build" ? "/edupage-sync/compiler/" : "/",
  build: { outDir: "../docs/compiler", emptyOutDir: true, chunkSizeWarningLimit: 4000, rollupOptions: { output: { manualChunks: id => id.includes("monaco-editor") ? "monaco" : id.includes("@xterm") ? "xterm" : undefined } } },
  server: { port: 5173 },
}));
