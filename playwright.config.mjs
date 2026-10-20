import { defineConfig } from '@playwright/test';
import { configuration } from './src/config.mjs';

// Fail early, before any browser starts, if no build was given.
configuration();

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [...(process.env.CI ? [['github']] : []), ['list'], ['html', { open: 'never' }]],
  use: {
    viewport: { width: 960, height: 720 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      args: [
        // Software WebGL, identical with or without a GPU.
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        // Nothing may come from the network: everything is served from loopback.
        '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
      ],
    },
  },
  projects: [
    // Behavior shared by upstream Voyager and Holusion's fork.
    { name: 'core', testDir: './tests/core', use: { browserName: 'chromium' } },
    // Behavior only Holusion's fork has. Skip it with `--project core` when testing upstream.
    { name: 'fork', testDir: './tests/fork', use: { browserName: 'chromium' } },
  ],
});
