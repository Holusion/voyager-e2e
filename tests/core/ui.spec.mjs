// Panels an embedding page opens and closes through the documented API.
import { test, expect } from '../../src/fixtures.mjs';
import { cubeGLB, sceneDocument } from '../../src/assets.mjs';

test.beforeEach(({ site }) => {
  const document = sceneDocument({
    articles: [{ id: 'article', titles: { EN: 'Article' }, uris: { EN: 'article.html' } }],
    models: [{ derivatives: { High: 'cube.glb' }, annotations: [
      { id: 'note', titles: { EN: 'Note' }, style: 'Standard', position: [0, 0, 1], direction: [0, 0, 1] },
    ] }],
  });
  document.setups[0].tours = [{ titles: { EN: 'The tour' }, steps: [{ id: 'step', titles: { EN: 'Step' } }] }];
  site.set('scene.svx.json', document).set('cube.glb', cubeGLB()).set('article.html', '<p>Text</p>');
});

async function load(mount) {
  const explorer = await mount({ document: 'scene.svx.json', prompt: 'false' });
  await explorer.waitForEvents('scene-load');
  return explorer;
}

// set*Enabled(true) sets a state where toggle*() would flip it.
test('tools and annotations replace each other', async ({ mount }) => {
  const explorer = await load(mount);
  const tools = explorer.locator('sv-tool-bar');
  const note = explorer.locator('.sv-annotation').filter({ hasText: 'Note' });

  await explorer.call('setToolsEnabled', true);
  await explorer.call('setToolsEnabled', true);
  await expect(tools).toHaveCount(1);

  await explorer.call('setAnnotationsEnabled', true);
  await explorer.call('setAnnotationsEnabled', true);
  await expect(note).toBeVisible();
  await expect(tools).toHaveCount(0);

  await explorer.call('setToolsEnabled', true);
  await expect(tools).toHaveCount(1);
  await expect(note).toBeHidden();

  await explorer.call('setToolsEnabled', false);
  await expect(tools).toHaveCount(0);
});

test('the tour menu replaces the reader', async ({ mount }) => {
  const explorer = await load(mount);
  const reader = explorer.locator('sv-reader-view');
  const tours = explorer.locator('sv-tour-menu');

  await explorer.call('setReaderEnabled', true);
  await explorer.call('setReaderEnabled', true);
  // A single article opens directly.
  await expect(reader).toContainText('Text');

  await explorer.call('setToursEnabled', true);
  await expect(tours).toContainText('The tour');
  await expect(reader).toHaveCount(0);

  await explorer.call('setToursEnabled', false);
  await expect(tours).toHaveCount(0);
});

test('resetViewer returns the camera to the scene view', async ({ mount }) => {
  const explorer = await load(mount);
  const orbit = await explorer.call('getCameraOrbit');
  const offset = await explorer.call('getCameraOffset');

  await explorer.call('setCameraOrbit', '40', '-20');
  await explorer.call('setCameraOffset', '1', '2', '30');
  expect(await explorer.call('getCameraOrbit')).not.toEqual(orbit);

  await explorer.call('resetViewer');

  await expect.poll(() => explorer.call('getCameraOffset')).toEqual(offset);
  expect(await explorer.call('getCameraOrbit')).toEqual(orbit);
});
