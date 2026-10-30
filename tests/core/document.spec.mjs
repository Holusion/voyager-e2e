// Embedding pages swap scenes by changing the `document` attribute.
import { test, expect } from '../../src/fixtures.mjs';
import { blue, cubeGLB, sceneDocument } from '../../src/assets.mjs';

test.beforeEach(({ site }) => {
  site.set('blue.svx.json', sceneDocument({ titles: { EN: 'Blue' }, models: [{ derivatives: { High: 'blue.glb' } }] }));
  site.set('blue.glb', cubeGLB({ color: blue })).set('orange.glb', cubeGLB());
});

async function swap(explorer, document) {
  await explorer.element.evaluate((element, document) => element.setAttribute('document', document), document);
}

test('replaces the scene when the document attribute changes', async ({ site, mount }) => {
  site.set('orange.svx.json', sceneDocument({ titles: { EN: 'Orange' }, models: [{ derivatives: { High: 'orange.glb' } }] }));
  const explorer = await mount({ document: 'orange.svx.json', prompt: 'false' });
  await explorer.waitForEvents('scene-load');
  const title = explorer.locator('.sv-main-title');
  await expect(title).toHaveText('Orange');

  await swap(explorer, 'blue.svx.json');

  await expect(title).toHaveText('Blue');
  // "Fires again if the scene later gains a model".
  await explorer.waitForEvents('scene-content-load', 2);
  // The new document has an initial load of its own.
  await explorer.waitForEvents('scene-load', 2);
  await expect(explorer.spinner).toBeHidden();
  // The orange model went away with its document, rather than being merged with the new one.
  expect((await explorer.modelCoverage()).view).toBe(0);
});

// A document without camera or lights gets Voyager's own, not the previous document's leftovers.
test('shows a document without camera or lights after a complete one', async ({ site, mount }) => {
  site.set('bare.svx.json', sceneDocument({ bare: true, titles: { EN: 'Bare' }, models: [{ derivatives: { High: 'orange.glb' } }] }));
  const explorer = await mount({ document: 'blue.svx.json', prompt: 'false' });
  await explorer.waitForEvents('scene-load');

  await swap(explorer, 'bare.svx.json');

  await expect(explorer.locator('.sv-main-title')).toHaveText('Bare');
  await explorer.waitForEvents('scene-load', 2);
  // Lit and framed: the orange model fills the middle of the view.
  expect((await explorer.modelCoverage()).center).toBeGreaterThan(0.9);
});
