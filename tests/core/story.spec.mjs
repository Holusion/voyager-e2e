// Story's menus and pickers, checked through what Story saves.
import { test, expect } from '../../src/fixtures.mjs';
import { cubeGLB, sceneDocument } from '../../src/assets.mjs';

// Story's panels need more room than Explorer alone.
test.use({ viewport: { width: 1280, height: 800 } });

const path = 'scene.svx.json';

/** Serve a one-model document, after `edit(document)`. Its lights are "Key" (directional) and "Environment". */
function serveScene(site, edit = () => {}) {
  const document = sceneDocument({ models: [{ derivatives: { High: 'cube.glb' } }] });
  edit(document);
  site.set(path, document).set('cube.glb', cubeGLB());
}

/** The document as Story last saved it. */
function savedDocument(site) {
  const writes = site.writes(path);
  expect(writes, `documents saved to ${path}`).toHaveLength(1);
  return JSON.parse(writes[0]);
}

/** Saved lights by node name, with their type. */
function savedLights(document) {
  return Object.fromEntries(document.nodes.filter(node => node.light !== undefined)
    .map(node => [node.name, document.lights[node.light].type]));
}

test.describe('lights', () => {
  test('are created from the navigator, unless cancelled', async ({ site, page, mountStory }) => {
    serveScene(site);
    const story = await mountStory({ document: path });
    const create = story.locator('sv-node-tree').getByRole('button', { name: 'Create Light', exact: true });
    const menu = story.locator('.sv-light-menu');

    await create.click();
    await expect(menu.getByRole('combobox')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);

    await create.click();
    await menu.getByRole('button', { name: 'Cancel' }).click();
    await expect(menu).toHaveCount(0);

    await create.click();
    await menu.getByRole('combobox').selectOption('point');
    // The name follows the type until edited.
    await expect(menu.getByRole('textbox')).toHaveValue('Point');
    await menu.getByRole('textbox').fill('Test light');
    await menu.getByRole('button', { name: 'Create' }).click();
    await expect(menu).toHaveCount(0);
    await expect(story.locator('sv-node-tree').getByText('Test light', { exact: true })).toBeVisible();

    await story.save();
    expect(savedLights(savedDocument(site))).toEqual({ Key: 'directional', Environment: 'environment', 'Test light': 'point' });
  });

  test('are deleted from the navigator once confirmed', async ({ site, page, mountStory }) => {
    serveScene(site);
    const story = await mountStory({ document: path });
    const remove = story.locator('sv-node-tree').getByRole('button', { name: 'Delete Light' });
    const menu = story.locator('.sv-light-menu');
    const key = story.locator('sv-node-tree').getByText('Key', { exact: true });

    await remove.click();
    await expect(menu).toContainText("Delete light 'Key'?");
    // Cancelling is the default.
    await expect(menu.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);

    await remove.click();
    await menu.getByRole('button', { name: 'Cancel' }).click();
    await expect(menu).toHaveCount(0);
    await expect(key).toBeVisible();

    await remove.click();
    await menu.getByRole('button', { name: 'Delete' }).click();
    await expect(menu).toHaveCount(0);
    await expect(key).toHaveCount(0);

    await story.save();
    expect(savedLights(savedDocument(site))).toEqual({ Environment: 'environment' });
  });
});

// Closing an edited article asks whether to save it. The question needs an answer:
// dismissing it can't silently discard the changes.
test('closing an edited article asks to save it, and Escape does not answer', async ({ site, page, mountStory }) => {
  serveScene(site, document => {
    document.metas = [{ articles: [{ id: 'article', uri: 'article.html', titles: { EN: 'The article' }, uris: { EN: 'article.html' } }] }];
    document.scenes[0].meta = 0;
  });
  site.set('article.html', '<p>Text</p>');
  const story = await mountStory({ document: path });
  await story.selectNode('VScene');
  await story.openTask('Articles');
  // Double-clicking an article edits it. Its row shows its title in the default and the active language.
  await story.locator('sv-article-list').getByText('The article').first().dblclick();
  const editor = page.frameLocator('.tox-edit-area__iframe').locator('body');
  await expect(editor).toContainText('Text');

  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(' edited');
  await story.locator('.tox-tinymce').getByRole('button', { name: 'Close' }).click();

  const question = page.getByText('Would you like save your changes?');
  await expect(question).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(question).toBeVisible();
  expect(site.writes('article.html')).toEqual([]);

  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  await expect(question).toHaveCount(0);
  await expect.poll(() => site.writes('article.html').length).toBe(1);
  expect(site.writes('article.html')[0]).toContain('Text edited');
});

test.describe('inspector', () => {
  /** Open Story's expert layout on the "Key" light, with shadows enabled so their settings get saved. */
  async function openKeyLight(site, mountStory) {
    serveScene(site, document => { document.lights[0].shadowEnabled = true; });
    const story = await mountStory({ document: path, mode: 'expert' });
    await story.selectNode('Key');
    return story;
  }

  /** The inspector's field for a property, e.g. "Shadow.Resolution", as its tooltip names it. */
  const field = (story, property) => story.locator(`sv-inspector-panel ff-property-field[title^="${property} "]`);

  test('picks an option from the list a field opens', async ({ site, page, mountStory }) => {
    const story = await openKeyLight(site, mountStory);
    const resolution = field(story, 'Shadow.Resolution');
    const options = page.locator('ff-popup-options');
    await expect(resolution).toHaveText('Medium');

    await resolution.click();
    // The list opens on the current value.
    await expect(options.getByRole('button', { name: 'Medium' })).toBeFocused();
    await options.getByRole('button', { name: 'High' }).click();
    await expect(options).toHaveCount(0);
    await expect(resolution).toHaveText('High');

    await story.save();
    expect(savedDocument(site).lights[0]).toMatchObject({ type: 'directional', shadowResolution: 'High' });
  });

  test('closes the option list on Escape, keeping the value', { tag: '@pending:modal-element' }, async ({ site, page, mountStory }) => {
    const story = await openKeyLight(site, mountStory);
    const resolution = field(story, 'Shadow.Resolution');
    const options = page.locator('ff-popup-options');

    await resolution.click();
    await expect(options).toBeVisible();
    await page.keyboard.press('Escape');

    await expect(options).toHaveCount(0);
    await expect(resolution).toHaveText('Medium');
  });

  /** The light's color pickers: in the inspector, and in the Settings task. */
  async function colorPickers(story) {
    await story.openTask('Settings');
    const inspector = story.locator('sv-inspector-panel .ff-color-button').first();
    const settings = story.locator('sv-settings-task-view sv-property-color');
    return {
      inspector: { button: inspector, editor: inspector.locator('ff-color-edit') },
      settings: { button: settings.getByRole('button', { name: 'Color Color Picker' }), editor: settings.locator('ff-color-edit') },
    };
  }

  test('color pickers close on a click outside or Escape', async ({ site, page, mountStory }) => {
    const story = await openKeyLight(site, mountStory);
    const pickers = await colorPickers(story);
    // Somewhere neutral to click: the navigator's "Nodes" header.
    const outside = story.locator('sv-node-tree').locator('xpath=..').getByText('Nodes', { exact: true });

    for (const [name, { button, editor }] of Object.entries(pickers)) {
      await test.step(name, async () => {
        await button.click();
        await expect(editor).toBeVisible();
        await outside.click();
        await expect(editor).toBeHidden();

        await button.click();
        await expect(editor).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(editor).toBeHidden();
      });
    }
  });

  // A color picker opens next to its button, flipping above it when there's no room below,
  // rather than over it: the button stays there to close it again.
  // (The inspector's button is at the bottom of the window, where its picker has no room below.)
  test('a color picker leaves its button usable to close it', { tag: '@pending:modal-element' }, async ({ site, mountStory }) => {
    const story = await openKeyLight(site, mountStory);
    const pickers = await colorPickers(story);

    for (const [name, { button, editor }] of Object.entries(pickers)) {
      await test.step(name, async () => {
        await button.click();
        await expect(editor).toBeVisible();
        await button.click();
        await expect(editor).toBeHidden();
      });
    }
  });
});
