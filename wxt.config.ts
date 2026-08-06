import { defineConfig } from 'wxt';

// WXT auto-generates the MV3 manifest from the entrypoints in `entrypoints/`.
// The side panel entrypoint adds `side_panel` + the `sidePanel` permission
// automatically; here we only declare what WXT cannot infer.
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: '.',
  manifest: {
    name: 'Context Distiller',
    // Keep in sync with package.json; WXT reads the version from package.json.
    // NB: Chrome Web Store caps manifest `description` at 132 characters.
    description:
      'Pick, group and compile ChatGPT snippets into one plain-text prompt. Local-only: no server, no tracking, never auto-sends.',
    // storage: only for the user's own long-term modules / custom requirements
    // (config), never conversation data.
    permissions: ['sidePanel', 'scripting', 'storage'],
    host_permissions: ['*://chatgpt.com/*', '*://chat.openai.com/*'],
    action: {
      default_title: 'Open Context Distiller',
    },
    // The main-world bridge is injected from the content script, so it must be
    // reachable as a web-accessible resource on the ChatGPT origins.
    web_accessible_resources: [
      {
        resources: ['chatgpt-main-world.js'],
        matches: ['*://chatgpt.com/*', '*://chat.openai.com/*'],
      },
    ],
  },
});
