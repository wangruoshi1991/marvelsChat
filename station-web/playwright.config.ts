import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5176",
    locale: "zh-CN",
    colorScheme: "light",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "iphone-se", use: { viewport: { width: 320, height: 568 } } },
    { name: "iphone-pro-max", use: { viewport: { width: 430, height: 932 } } },
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:5176/legal/privacy",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
