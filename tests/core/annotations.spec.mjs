// Annotations and tags, driven through the documented API.
import { test, expect } from '../../src/fixtures.mjs';
import { blue, cubeGLB, sceneDocument } from '../../src/assets.mjs';

/**
 * One model with an annotation whose view looks from 30 degrees further and twice as far.
 * The camera starts at offset 10: offset 20 witnesses a completed view transition.
 */
function viewDocument() {
  const document = sceneDocument({ models: [{ derivatives: { High: 'cube.glb' }, annotations: [
    { id: 'viewed', titles: { EN: 'Viewed' }, style: 'Standard', position: [0, 0, 1], direction: [0, 0, 1], viewId: 'view' },
  ] }] });
  const navigation = document.setups[0].navigation;
  navigation.autoZoom = false;
  navigation.orbit = {
    orbit: [0, 0, 0], offset: [0, 0, 10],
    minOrbit: [-90, null, null], maxOrbit: [90, null, null],
    minOffset: [null, null, 0.1], maxOffset: [null, null, 1000],
  };
  document.setups[0].snapshots = {
    features: ['navigation'],
    targets: ['scenes/0/setup/navigation/orbit', 'scenes/0/setup/navigation/offset'],
    states: [{ id: 'view', values: [[0, 30, 0], [0, 0, 20]], duration: 0.25, curve: 'Linear' }],
  };
  return document;
}

/** The orbit getCameraOrbit() reports for the annotation's view, whatever its units and order. */
async function viewOrbit(explorer) {
  const current = await explorer.call('getCameraOrbit');
  await explorer.call('setCameraOrbit', '0', '30');
  const view = await explorer.call('getCameraOrbit');
  await explorer.call('setCameraOrbit', ...current.map(String));
  return view;
}

// Every way of activating an annotation (pointer, keyboard, API) plays its view (#445).
// The fork restarts a view activated twice while it plays, and can stop halfway.
test('setActiveAnnotation plays the annotation view, again when re-activated', { tag: '@fork-pending' }, async ({ site, mount }) => {
  site.set('scene.svx.json', viewDocument()).set('cube.glb', cubeGLB());
  const explorer = await mount({ document: 'scene.svx.json', prompt: 'false' });
  await explorer.waitForEvents('scene-load');
  const view = await viewOrbit(explorer);
  await explorer.call('setAnnotationsEnabled', true);
  // Views of hidden annotations aren't played.
  await expect(explorer.locator('.sv-annotation').filter({ hasText: 'Viewed' })).toBeVisible();

  await explorer.call('setActiveAnnotation', 'viewed');

  // annotation-active isn't checked: Voyager dispatches it for clicks and keys only.
  await expect.poll(() => explorer.call('getCameraOffset')).toEqual([0, 0, 20]);
  expect(await explorer.call('getCameraOrbit')).toEqual(view);

  // Activating the active annotation again brings its view back.
  await explorer.call('setCameraOffset', '0', '0', '10');
  await explorer.call('setCameraOrbit', '0', '0');
  await explorer.call('setActiveAnnotation', 'viewed');
  await expect.poll(() => explorer.call('getCameraOffset')).toEqual([0, 0, 20]);
  expect(await explorer.call('getCameraOrbit')).toEqual(view);
});

test.describe('tags', () => {
  const titles = { orange: 'Orange', blue: 'Blue', untagged: 'Untagged' };

  /**
   * An orange and a blue model, tagged by their color, each with an annotation sharing its tag.
   * Voyager frames what remains when a model hides: models are told apart by color, not position.
   */
  function taggedDocument() {
    const annotation = (id, tags) => ({
      id, titles: { EN: titles[id] }, ...(tags ? { taglist: { EN: tags } } : {}),
      style: 'Standard', position: [0, 0, 1], direction: [0, 0, 1],
    });
    return sceneDocument({ models: [
      { derivatives: { High: 'orange.glb' }, tags: 'orange', annotations: [annotation('orange', ['orange']), annotation('untagged')] },
      { derivatives: { High: 'blue.glb' }, tags: 'blue', annotations: [annotation('blue', ['blue'])] },
    ] });
  }

  test('setActiveTags shows the models and annotations of the active tags', async ({ site, mount }) => {
    site.set('scene.svx.json', taggedDocument()).set('orange.glb', cubeGLB()).set('blue.glb', cubeGLB({ color: blue }));
    const explorer = await mount({ document: 'scene.svx.json', prompt: 'false' });
    await explorer.waitForEvents('scene-load');
    await explorer.call('setAnnotationsEnabled', true);
    const label = id => explorer.locator('.sv-annotation').filter({ hasText: titles[id] });
    const tags = async () => (await explorer.call('getTags')).split(',').map(tag => tag.trim()).sort();

    expect(await tags()).toEqual(['blue', 'orange']);

    await explorer.call('setActiveTags', 'blue');
    await expect(label('blue')).toBeVisible();
    await expect(label('orange')).toBeHidden();
    // An untagged annotation doesn't depend on tags.
    await expect(label('untagged')).toBeVisible();
    // Labels and models follow tags in the same update: the frame that hid the label hid the model.
    expect((await explorer.modelCoverage()).view).toBe(0);

    await explorer.call('setActiveTags', 'orange, blue');
    await expect(label('orange')).toBeVisible();
    await expect(label('blue')).toBeVisible();
    expect((await explorer.modelCoverage()).view).toBeGreaterThan(0);
  });
});
