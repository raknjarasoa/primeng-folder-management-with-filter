/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import angular from '@analogjs/vite-plugin-angular';

export default defineConfig({
  plugins: [
    angular({
      tsconfig: 'projects/layout-folder-management/tsconfig.spec.json',
    }),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['projects/**/*.spec.ts'],
    setupFiles: ['projects/layout-folder-management/src/test-setup.ts'],
  },
});
