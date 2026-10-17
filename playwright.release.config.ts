import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// Test the built frontend on a dedicated port without disturbing a dev session.
export default defineConfig({
  ...base,
  use: { ...base.use, baseURL: "http://127.0.0.1:1430" },
  webServer: {
    command: `"${process.execPath}" node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 1430 --strictPort`,
    url: "http://127.0.0.1:1430",
    reuseExistingServer: false,
    timeout: 30_000
  }
});
