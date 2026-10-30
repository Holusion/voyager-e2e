// The article reader, opened through the documented API.
import { test, expect } from '../../src/fixtures.mjs';
import { cubeGLB, sceneDocument } from '../../src/assets.mjs';

const articles = [
  { id: 'first', titles: { EN: 'First article', FR: 'Premier article' }, uris: { EN: 'first.en.html', FR: 'first.fr.html' } },
  { id: 'second', titles: { EN: 'Second article', FR: 'Second article FR' }, uris: { EN: 'second.en.html', FR: 'second.fr.html' } },
];

function articleScene(site, { name = 'scene.svx.json', language = 'FR', reader = false, list = articles } = {}) {
  const document = sceneDocument({ language, articles: list, titles: { EN: 'Cube', FR: 'Cube' }, models: [{ derivatives: { High: 'cube.glb' } }] });
  document.setups[0].reader.enabled = reader;
  site.set(name, document).set('cube.glb', cubeGLB());
  site.set('first.en.html', '<p>Hello</p>').set('first.fr.html', '<p>Bonjour</p>');
  site.set('second.en.html', '<p>Goodbye</p>').set('second.fr.html', '<p>Au revoir</p>');
}

test('lists and shows articles in the active language', async ({ site, mount }) => {
  articleScene(site);
  const explorer = await mount({ document: 'scene.svx.json', prompt: 'false' });
  await explorer.waitForEvents('scene-load');
  const reader = explorer.locator('sv-reader-view');

  await explorer.call('setReaderEnabled', true);
  await expect(reader.locator('.sv-entry')).toHaveText([/Premier article/, /Second article FR/]);

  await explorer.call('setActiveArticle', 'first');
  await expect(reader.locator('.sv-container')).toContainText('Bonjour');

  await explorer.call('setLanguage', 'EN');
  await expect(reader.locator('.sv-container')).toContainText('Hello');
  expect(site.requests('second.en.html') + site.requests('second.fr.html'), 'articles requested before being opened').toBe(0);
});

test('names an article that is missing', async ({ site, mount }) => {
  articleScene(site, { list: [{ id: 'lost', titles: { FR: 'Perdu' }, uris: { FR: 'lost.html' } }] });
  const explorer = await mount({ document: 'scene.svx.json', prompt: 'false' });
  await explorer.waitForEvents('scene-load');

  await explorer.call('setActiveArticle', 'lost');

  await expect(explorer.locator('sv-reader-view .sv-container')).toContainText('lost.html');
});

// The language doesn't change when a document replaces another in that same language:
// articles must still be shown in it.
test('shows articles in the scene language after the document changes', async ({ site, mount }) => {
  articleScene(site, { name: 'first.svx.json' });
  articleScene(site, { name: 'second.svx.json' });
  const explorer = await mount({ document: 'first.svx.json', prompt: 'false' });
  await explorer.waitForEvents('scene-load');

  await explorer.element.evaluate(element => element.setAttribute('document', 'second.svx.json'));
  await explorer.waitForEvents('scene-load', 2);
  await explorer.call('setReaderEnabled', true);

  const reader = explorer.locator('sv-reader-view');
  await expect(reader.locator('.sv-entry')).toHaveText([/Premier article/, /Second article FR/]);
  await explorer.call('setActiveArticle', 'second');
  await expect(reader.locator('.sv-container')).toContainText('Au revoir');
});

// The interaction prompt would cover the reader: it isn't shown, nor does it break rendering.
test('opens with the reader shown and no interaction prompt', async ({ site, mount }) => {
  articleScene(site, { reader: true });
  const explorer = await mount({ document: 'scene.svx.json', prompt: 'true' });
  await explorer.waitForEvents('scene-load');

  await expect(explorer.locator('sv-reader-view .sv-entry')).toHaveCount(2);
  await expect(explorer.spinner).toBeHidden();
  await expect(explorer.locator('sv-action-prompt')).toHaveCount(0);

  // The reader is what kept it hidden.
  await explorer.call('setReaderEnabled', false);
  await expect(explorer.locator('sv-action-prompt')).toHaveCount(1);
});
