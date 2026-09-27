import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  outputDir: '../../work/test-results',
  timeout: 45000,
  fullyParallel: true,
  use: { baseURL: process.env.TEST_BASE_URL || 'http://127.0.0.1:5173', channel: 'chrome', viewport: {width:1440,height:1050}, trace: 'retain-on-failure' },
  webServer: process.env.TEST_BASE_URL ? undefined : {command:'npm run dev -- --port 5173',url:'http://127.0.0.1:5173',reuseExistingServer:true}
});
