// What a visitor (or an embedding page, through the documented API) does once the scene is loaded.
import { test, expect } from '../../src/fixtures.mjs';
import { cubeGLB, sceneDocument } from '../../src/assets.mjs';

const titles = { EN: 'Cube Scene', FR: 'Scène du cube' };

test.describe('language', () => {
  test.beforeEach(({ site }) => {
    site.set('scene.svx.json', sceneDocument({ titles, language: 'FR', models: [{ derivatives: { High: 'cube.glb' } }] }));
    site.set('cube.glb', cubeGLB());
  });

  test('starts in the setup language and switches on request', async ({ mount }) => {
    const explorer = await mount({ document: 'scene.svx.json' });
    const title = explorer.locator('.sv-main-title');

    await expect(title).toHaveText(titles.FR);
    expect(await explorer.call('getActiveLanguage')).toBe('FR');
    expect((await explorer.call('getLanguages')).sort()).toEqual(['EN', 'FR']);

    await explorer.call('setLanguage', 'EN');
    await expect(title).toHaveText(titles.EN);
    expect(await explorer.call('getActiveLanguage')).toBe('EN');
  });

  test('lang attribute overrides the setup language', async ({ mount }) => {
    const explorer = await mount({ document: 'scene.svx.json', lang: 'EN' });

    await expect(explorer.locator('.sv-main-title')).toHaveText(titles.EN);
    expect(await explorer.call('getActiveLanguage')).toBe('EN');
  });
});

test('annotations are shown on request, localized, and activated on click', async ({ site, mount }) => {
  const annotation = { id: 'a1', titles: { EN: 'Front', FR: 'Devant' }, style: 'Standard', position: [0, 0, 1], direction: [0, 0, 1] };
  site.set('scene.svx.json', sceneDocument({ titles, language: 'FR', models: [{ derivatives: { High: 'cube.glb' }, annotations: [annotation] }] }));
  site.set('cube.glb', cubeGLB());
  const explorer = await mount({ document: 'scene.svx.json', prompt: 'false' });
  await explorer.waitForEvents('scene-load');
  // The document's setup has annotations hidden.
  const label = explorer.locator('.sv-annotation').filter({ hasText: 'Devant' });
  await expect(label).toBeHidden();

  await explorer.call('setAnnotationsEnabled', true);
  await expect(label).toBeVisible();

  // Keyboard activation goes through the same path as a click, without depending on where the label lands.
  await label.getByText('Devant').press('Enter');
  await expect.poll(async () => (await explorer.events('annotation-active')).at(-1)?.detail).toBe('a1');

  await explorer.call('setLanguage', 'EN');
  await expect(explorer.locator('.sv-annotation').filter({ hasText: 'Front' })).toBeVisible();
});

test('dragging the view orbits the camera', async ({ page, site, mount }) => {
  site.set('scene.svx.json', sceneDocument({ models: [{ derivatives: { High: 'cube.glb' } }] }));
  site.set('cube.glb', cubeGLB());
  const explorer = await mount({ document: 'scene.svx.json', prompt: 'false' });
  await explorer.waitForEvents('scene-load');
  const before = await explorer.call('getCameraOrbit');

  const box = await explorer.element.boundingBox();
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 200, y, { steps: 10 });
  await page.mouse.up();

  await expect.poll(() => explorer.call('getCameraOrbit')).not.toEqual(before);
});

test('camera orbit can be driven by the embedding page', async ({ site, mount }) => {
  site.set('scene.svx.json', sceneDocument({ models: [{ derivatives: { High: 'cube.glb' } }] }));
  site.set('cube.glb', cubeGLB());
  const explorer = await mount({ document: 'scene.svx.json', prompt: 'false' });
  await explorer.waitForEvents('scene-load');

  await explorer.call('setCameraOrbit', '30', '-10');
  // Whatever the order or unit getCameraOrbit() uses, it reflects what was set.
  const orbit = await explorer.call('getCameraOrbit');
  await explorer.call('setCameraOrbit', '0', '0');
  expect(await explorer.call('getCameraOrbit')).not.toEqual(orbit);
  await explorer.call('setCameraOrbit', '30', '-10');
  expect(await explorer.call('getCameraOrbit')).toEqual(orbit);
});
