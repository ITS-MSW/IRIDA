import assert from 'node:assert/strict';

const output = new URL('../.output/chrome-mv3/', import.meta.url);
const manifest = await Bun.file(new URL('manifest.json', output)).json();
assert.equal(manifest.manifest_version, 3);
assert.deepEqual([...manifest.permissions].sort(), ['activeTab', 'scripting']);
assert.ok(!manifest.host_permissions?.length, 'No persistent site access');
assert.ok(!manifest.content_scripts?.length, 'Injection must be on demand');
assert.ok(!manifest.action.default_popup, 'The toolbar must activate the picker');
assert.ok(!manifest.web_accessible_resources?.length, 'Assets and shadow styles are bundled inline');
assert.equal(manifest.background.service_worker, 'background.js');
assert.ok(await Bun.file(new URL('content-scripts/picker.js', output)).exists());
await Bun.write(new URL('THIRD_PARTY_NOTICES.md', output), Bun.file(new URL('../THIRD_PARTY_NOTICES.md', import.meta.url)));
console.info('Production manifest verified: MV3, on-demand picker, activeTab + scripting only.');
