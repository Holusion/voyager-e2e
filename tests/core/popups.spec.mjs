// Popups a visitor opens from Explorer's own buttons: help, introduction.
import { test, expect } from '../../src/fixtures.mjs';
import { cubeGLB, sceneDocument } from '../../src/assets.mjs';

test.beforeEach(({ site }) => {
  site.set('scene.svx.json', sceneDocument({ titles: { EN: 'Cube' }, models: [{ derivatives: { High: 'cube.glb' } }] }));
  site.set('cube.glb', cubeGLB());
});

async function load(mount) {
  const explorer = await mount({ document: 'scene.svx.json', prompt: 'false' });
  await explorer.waitForEvents('scene-load');
  return explorer;
}

/** Click the middle of `locator` with the mouse, wherever it is and whatever covers it. */
async function clickAt(page, locator) {
  const box = await locator.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

test('help opens on its first section, and closes with Escape or its close button', async ({ page, mount }) => {
  const explorer = await load(mount);
  const help = explorer.locator('.sv-main-help');
  const open = explorer.locator('#main-help');

  await open.click();
  await expect(help.getByRole('button', { name: 'Navigation' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(help).toHaveCount(0);

  await open.click();
  await help.getByRole('button', { name: 'Close' }).click();
  await expect(help).toHaveCount(0);
});

test('the introduction shows when the scene opens, until dismissed', async ({ site, page, mount }) => {
  const document = sceneDocument({ titles: { EN: 'Cube' }, models: [{ derivatives: { High: 'cube.glb' } }] });
  document.metas[0].collection.intros = { EN: '<p>Welcome to the cube</p>' };
  site.set('intro.svx.json', document);
  const explorer = await mount({ document: 'intro.svx.json', prompt: 'false' });
  const intro = explorer.locator('.sv-splash');

  await expect(intro).toContainText('Welcome to the cube');
  await page.keyboard.press('Escape');
  await expect(intro).toHaveCount(0);
});

// Clicking the dimmed area around a popup closes it, without reaching what's underneath.
test('clicking around the help closes it, and only that', { tag: '@pending:modal-element' }, async ({ page, mount }) => {
  const explorer = await load(mount);
  const help = explorer.locator('.sv-main-help');
  await explorer.locator('#main-help').click();
  await expect(help).toBeVisible();

  await clickAt(page, explorer.locator('#share-btn'));

  await expect(help).toHaveCount(0);
  await expect(explorer.locator('.sv-share-menu')).toHaveCount(0);
});

// Embedded inline (no iframe), a popup only concerns the viewer: the rest of the page stays usable.
// Before, the dimmed layer covered the whole page.
test('the embedding page stays usable while a popup is open', { tag: '@pending:modal-element' }, async ({ page, mount }) => {
  const explorer = await load(mount);
  await page.evaluate(() => {
    // Sized like the API examples of the docs embed it, with room left on the page.
    const viewer = document.querySelector('voyager-explorer');
    Object.assign(viewer.style, { display: 'block', position: 'relative', width: '480px', height: '360px', margin: '40px' });
    window.clicks = 0;
    const button = document.createElement('button');
    button.textContent = 'Page button';
    button.onclick = () => window.clicks++;
    document.body.appendChild(button);
  });
  const help = explorer.locator('.sv-main-help');
  await explorer.locator('#main-help').click();
  await expect(help).toBeVisible();

  await clickAt(page, page.getByRole('button', { name: 'Page button' }));

  expect(await page.evaluate(() => window.clicks)).toBe(1);
  await expect(help).toBeVisible();
});
