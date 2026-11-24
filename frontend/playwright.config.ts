import { defineConfig, devices } from '@playwright/test'

const externalUrl = process.env.E2E_BASE_URL
const baseURL = externalUrl ?? 'http://127.0.0.1:4173'

export default defineConfig({
  testDir: './tests',
  use: {
    baseURL,
    browserName: 'chromium',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
  projects: [
    { name: 'escritorio', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'movil', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: externalUrl ? undefined : [
    {
      command: 'uv run --locked uvicorn app.main:app --host 127.0.0.1 --port 8011',
      cwd: '../backend',
      url: 'http://127.0.0.1:8011/api/health',
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 4173',
      env: { API_PROXY_TARGET: 'http://127.0.0.1:8011' },
      url: baseURL,
    },
  ],
})
