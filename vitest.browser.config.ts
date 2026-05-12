/// <reference types="vitest" />
import angular from '@analogjs/vite-plugin-angular';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    angular({
      tsconfig: 'projects/layout-folder-management/tsconfig.spec.json',
    }),
  ],
  test: {
    globals: true,
    browser: {
      provider: playwright(),
      enabled: true,
      headless: false,
      instances: [{ browser: 'chromium' }],
    },
    include: ['projects/**/*.browser.spec.ts'],
    setupFiles: ['projects/layout-folder-management/src/test-setup.ts'],
  },
});
