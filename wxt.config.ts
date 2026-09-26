import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'IRIDA — UI Showcase Grab',
    description: 'Grab a visible UI element and save a finished showcase PNG.',
    permissions: ['activeTab', 'scripting'],
    minimum_chrome_version: '120',
    action: { default_title: 'IRIDA — Grab UI' },
  },
});
