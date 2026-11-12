// Story saves the fork's model properties (CastShadow, ReceiveShadow), which upstream doesn't have.
import { test, expect } from '../../src/fixtures.mjs';
import { cubeGLB, sceneDocument } from '../../src/assets.mjs';

// Story's panels need more room than Explorer alone.
test.use({ viewport: { width: 1280, height: 800 } });

const path = 'scene.svx.json';

/** Serve a one-model document whose model has these shadow properties (left out when undefined). */
function serveScene(site, shadows = {}) {
  site.set('cube.glb', cubeGLB());
  site.set(path, sceneDocument({ models: [{ derivatives: { High: 'cube.glb' }, ...shadows }] }));
}

/** Open Story on the test's document, at the settings of its model. */
async function openModelSettings(mountStory) {
  const story = await mountStory({ document: path });
  await story.selectNode('Model 0');
  await story.openTask('Settings');
  return story;
}

/** The model as Story last saved it. */
function savedModel(site) {
  const writes = site.writes(path);
  expect(writes, `documents saved to ${path}`).toHaveLength(1);
  return JSON.parse(writes[0]).models[0];
}

test('saves shadow properties changed from their defaults', async ({ site, mountStory }) => {
  serveScene(site);
  let story = await openModelSettings(mountStory);
  await expect(story.switch('CastShadow')).toHaveAttribute('aria-checked', 'true');
  await expect(story.switch('ReceiveShadow')).toHaveAttribute('aria-checked', 'false');

  await story.switch('CastShadow').click();
  await story.switch('ReceiveShadow').click();
  await expect(story.switch('CastShadow')).toHaveAttribute('aria-checked', 'false');
  await expect(story.switch('ReceiveShadow')).toHaveAttribute('aria-checked', 'true');
  await story.save();

  expect(savedModel(site)).toMatchObject({ castShadow: false, receiveShadow: true });

  // Reopened from what it saved, Story shows the changed values.
  story = await openModelSettings(mountStory);
  await expect(story.switch('CastShadow')).toHaveAttribute('aria-checked', 'false');
  await expect(story.switch('ReceiveShadow')).toHaveAttribute('aria-checked', 'true');
});

test('saves shadow properties switched back to their defaults', async ({ site, mountStory }) => {
  serveScene(site, { castShadow: false, receiveShadow: true });
  let story = await openModelSettings(mountStory);
  await expect(story.switch('CastShadow')).toHaveAttribute('aria-checked', 'false');
  await expect(story.switch('ReceiveShadow')).toHaveAttribute('aria-checked', 'true');

  await story.switch('CastShadow').click();
  await story.switch('ReceiveShadow').click();
  await expect(story.switch('CastShadow')).toHaveAttribute('aria-checked', 'true');
  await expect(story.switch('ReceiveShadow')).toHaveAttribute('aria-checked', 'false');
  await story.save();

  // Defaults may be written or left out, but none of the previous values may remain.
  const model = savedModel(site);
  expect(model.castShadow ?? true, 'saved castShadow').toBe(true);
  expect(model.receiveShadow ?? false, 'saved receiveShadow').toBe(false);

  story = await openModelSettings(mountStory);
  await expect(story.switch('CastShadow')).toHaveAttribute('aria-checked', 'true');
  await expect(story.switch('ReceiveShadow')).toHaveAttribute('aria-checked', 'false');
});

// The fork has these properties, upstream's rc-68 makes Explorer's reset button restore models as loaded.
test('the reset button restores shadow properties as loaded', { tag: '@pending:rc-68' }, async ({ site, mountStory }) => {
  // Not their defaults, so that a reset to defaults can't pass for a reset to the loaded values.
  serveScene(site, { castShadow: false, receiveShadow: true });
  const story = await openModelSettings(mountStory);

  await story.switch('CastShadow').click();
  await story.switch('ReceiveShadow').click();
  await expect(story.switch('CastShadow')).toHaveAttribute('aria-checked', 'true');
  await expect(story.switch('ReceiveShadow')).toHaveAttribute('aria-checked', 'false');

  await story.locator('#main-reset').click();
  await expect(story.switch('CastShadow')).toHaveAttribute('aria-checked', 'false');
  await expect(story.switch('ReceiveShadow')).toHaveAttribute('aria-checked', 'true');

  // What the reset restored is what gets saved.
  await story.save();
  expect(savedModel(site)).toMatchObject({ castShadow: false, receiveShadow: true });
});
