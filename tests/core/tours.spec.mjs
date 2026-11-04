// Tours, driven as a visitor does (tour menu, tour bar) or through the documented API.
// Each check follows a `tour-step` event, which Voyager sends once a step's state is applied:
// poses are compared right away, without polling, and so are steps that don't move the camera.
import { test, expect } from '../../src/fixtures.mjs';
import { cubeGLB, sceneDocument } from '../../src/assets.mjs';

// Poses as a document authored in Story holds them: decimals, which a transition must land on exactly.
const poses = {
  before: { orbit: [11.3, 42.1, 0], offset: [0, 0, 10] },
  start: { orbit: [-5.2, -8.4, 0], offset: [0, 0, 12.3] },
  end: { orbit: [20.7, 63.7, 0], offset: [0, 0, 20.9] },
};

/**
 * One model, its annotation and an article, with two tours:
 * - "Camera views" moves the camera from `start` to `end`;
 * - "Notes" leaves the camera where it is, but shows annotations and opens the article.
 */
function tourDocument({ duration = 0.25 } = {}) {
  const document = sceneDocument({
    articles: [{ id: 'article', titles: { EN: 'Article' }, uris: { EN: 'article.html' } }],
    models: [{ derivatives: { High: 'cube.glb' }, annotations: [
      { id: 'note', titles: { EN: 'Note' }, style: 'Standard', position: [0, 0, 1], direction: [0, 0, 1] },
    ] }],
  });
  const setup = document.setups[0];
  setup.navigation.autoZoom = false;
  setup.navigation.orbit = {
    ...poses.before,
    minOrbit: [-90, null, null], maxOrbit: [90, null, null],
    minOffset: [null, null, 0.1], maxOffset: [null, null, 1000],
  };
  setup.tours = [
    { titles: { EN: 'Camera views' }, steps: [{ id: 'start', titles: { EN: 'Start' } }, { id: 'end', titles: { EN: 'End' } }] },
    { titles: { EN: 'Notes' }, steps: [{ id: 'notes', titles: { EN: 'Notes' } }] },
  ];
  setup.snapshots = {
    features: ['navigation', 'viewer', 'reader'],
    targets: [
      'scenes/0/setup/navigation/orbit', 'scenes/0/setup/navigation/offset',
      'scenes/0/setup/viewer/annotationsVisible', 'scenes/0/setup/reader/enabled', 'scenes/0/setup/reader/articleId',
    ],
    states: [
      { id: 'start', values: [poses.start.orbit, poses.start.offset, false, false, ''], duration, curve: 'Linear' },
      { id: 'end', values: [poses.end.orbit, poses.end.offset, false, false, ''], duration, curve: 'Linear' },
      // The camera stays where the scene starts.
      { id: 'notes', values: [poses.before.orbit, poses.before.offset, true, true, 'article'], duration, curve: 'Linear' },
    ],
  };
  return document;
}

async function load(site, mount, options) {
  site.set('scene.svx.json', tourDocument(options)).set('cube.glb', cubeGLB()).set('article.html', '<p>Text</p>');
  const explorer = await mount({ document: 'scene.svx.json', prompt: 'false' });
  await explorer.waitForEvents('scene-load');
  return explorer;
}

/** The camera pose, as the API reports it. */
async function pose(explorer) {
  return { orbit: await explorer.call('getCameraOrbit'), offset: await explorer.call('getCameraOffset') };
}

/**
 * The authored poses as `pose()` reports them, whatever the getter's angle units and order.
 * Sampled through setCameraOrbit(), then the camera is put back.
 */
async function expectedPoses(explorer) {
  const current = await explorer.call('getCameraOrbit');
  const expected = {};
  for (const [name, { orbit, offset }] of Object.entries(poses)) {
    await explorer.call('setCameraOrbit', String(orbit[0]), String(orbit[1]));
    expected[name] = { orbit: await explorer.call('getCameraOrbit'), offset };
  }
  await explorer.call('setCameraOrbit', ...current.map(String));
  return expected;
}

/**
 * Waits for the tour-step events sent from now on, one at a time: `await next()` returns the next one's detail.
 * Events sent before the call are left out.
 */
async function tourSteps(explorer) {
  const before = (await explorer.events('tour-step')).length;
  let seen = before;
  const next = async () => (await explorer.waitForEvents('tour-step', ++seen))[seen - 1].detail;
  /** Every event sent since, as details. */
  next.all = async () => (await explorer.events('tour-step')).slice(before).map(event => event.detail);
  return next;
}

test.describe('tours', { tag: '@pending:fix/tween-final-frame' }, () => {
  test('loading a document announces no tour step', async ({ site, mount }) => {
    const explorer = await load(site, mount);
    // The scene is loaded and nothing was asked of tours: there is no step to announce, nor a tour to leave.
    expect(await explorer.events('tour-step')).toEqual([]);
  });

  test('a tour reaches each step exactly, then returns to the view it started from', async ({ site, mount }) => {
    const explorer = await load(site, mount);
    const expected = await expectedPoses(explorer);
    expect(await pose(explorer)).toEqual(expected.before);
    const navigator = explorer.locator('sv-tour-navigator');
    const next = await tourSteps(explorer);

    await explorer.call('setToursEnabled', true);
    expect(await explorer.call('getActiveTourStep'), 'on the tour menu').toBeNull();
    await explorer.locator('sv-tour-menu .sv-entry').filter({ hasText: 'Camera views' }).press('Enter');
    expect(await next()).toEqual({ tour: 0, step: 0 });
    expect(await pose(explorer)).toEqual(expected.start);
    expect(await explorer.call('getActiveTourStep')).toEqual({ tour: 0, step: 0 });
    await expect(navigator).toContainText('Step 1 of 2');

    await navigator.getByTitle('Go Forward').click();
    expect(await next()).toEqual({ tour: 0, step: 1 });
    expect(await pose(explorer)).toEqual(expected.end);
    expect(await explorer.call('getActiveTourStep')).toEqual({ tour: 0, step: 1 });
    await expect(navigator).toContainText('Step 2 of 2');

    await navigator.getByTitle('Exit Tour').click();
    expect(await next()).toEqual({ tour: -1, step: -1 });
    expect(await pose(explorer)).toEqual(expected.before);
    expect(await explorer.call('getActiveTourStep')).toBeNull();
    await expect(navigator).toHaveCount(0);

    // One event per step reached, none for the tour menu: it would have come before leaving.
    expect(await next.all()).toEqual([{ tour: 0, step: 0 }, { tour: 0, step: 1 }, { tour: -1, step: -1 }]);
  });

  test('a step that keeps the camera still is announced once its state is applied', async ({ site, mount }) => {
    const explorer = await load(site, mount);
    const expected = await expectedPoses(explorer);
    const note = explorer.locator('.sv-annotation').filter({ hasText: 'Note' });
    const reader = explorer.locator('sv-reader-view');
    const next = await tourSteps(explorer);

    await explorer.call('setToursEnabled', true);
    await explorer.call('setTourStep', '1', '0');
    expect(await next()).toEqual({ tour: 1, step: 0 });
    // Nothing moved, so only the event says the step is done.
    expect(await pose(explorer)).toEqual(expected.before);
    await expect(note).toBeVisible();
    await expect(reader).toContainText('Text');

    await explorer.call('setToursEnabled', false);
    expect(await next()).toEqual({ tour: -1, step: -1 });
    expect(await pose(explorer)).toEqual(expected.before);
    await expect(note).toBeHidden();
    await expect(reader).toHaveCount(0);
  });

  test('an instant jump is announced at once, on the step asked for', async ({ site, mount }) => {
    const explorer = await load(site, mount, { duration: 60 });
    const expected = await expectedPoses(explorer);
    const next = await tourSteps(explorer);

    await explorer.call('setToursEnabled', true);
    await explorer.call('setTourStep', '0', '1', false);
    // Well before its 60-second transition could end.
    expect(await next()).toEqual({ tour: 0, step: 1 });
    expect(await pose(explorer)).toEqual(expected.end);
  });
});
