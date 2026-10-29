// Camera transitions are checked at completed poses, through the documented API.
// A different final offset is a completion witness; no intermediate frame is sampled.
import { test, expect } from '../../src/fixtures.mjs';
import { cubeGLB, sceneDocument } from '../../src/assets.mjs';

function cameraDocument({ start, end, annotation = false }) {
  const document = sceneDocument({ models: [{ derivatives: { High: 'cube.glb' },
    ...(annotation ? { annotations: [{ id: 'view', titles: { EN: 'Saved view' }, style: 'Standard',
      position: [0, 0, 1], direction: [0, 0, 1], viewId: 'end' }] } : {}),
  }] });
  const setup = document.setups[0];
  setup.navigation.autoZoom = false;
  setup.navigation.orbit = {
    orbit: [0, start, 0], offset: [0, 0, 10],
    minOrbit: [-90, null, null], maxOrbit: [90, null, null],
    minOffset: [null, null, 0.1], maxOffset: [null, null, 1000],
  };
  setup.tours = [{ titles: { EN: 'Camera views' }, steps: [
    { id: 'start', titles: { EN: 'Start' } }, { id: 'end', titles: { EN: 'End' } },
  ] }];
  setup.snapshots = {
    features: ['navigation'],
    targets: ['scenes/0/setup/navigation/orbit', 'scenes/0/setup/navigation/offset'],
    states: [
      { id: 'start', values: [[0, start, 0], [0, 0, 12]], duration: 0.25, curve: 'Linear' },
      { id: 'end', values: [[0, end, 0], [0, 0, 20]], duration: 0.25, curve: 'Linear' },
    ],
  };
  return document;
}

for (const { start, end, nearest } of [
  { start: 170, end: -170, nearest: 190 },
  { start: -170, end: 170, nearest: -190 },
]) {
  test(`successive tour steps keep the short orbit across ${start} to ${end} degrees`, async ({ site, mount }) => {
    site.set('scene.svx.json', cameraDocument({ start, end })).set('cube.glb', cubeGLB());
    const explorer = await mount({ document: 'scene.svx.json', prompt: 'false' });
    await explorer.waitForEvents('scene-load');

    // Sample the expected pose using the same public API, without assuming the
    // getter's angle units/order (which differ between Voyager's code and docs).
    await explorer.call('setCameraOrbit', '0', String(nearest));
    const expected = await explorer.call('getCameraOrbit');
    await explorer.call('setCameraOrbit', '0', String(start));
    await explorer.call('setTourStep', '0', '0', false);
    await expect.poll(() => explorer.call('getCameraOffset')).toEqual([0, 0, 12]);

    await explorer.call('setTourStep', '0', '1', true);
    // Offset 20 is only reached at the destination. Once reached, the unwrapped
    // orbit records which arc was taken, even when a slow frame skips the animation.
    await expect.poll(() => explorer.call('getCameraOffset')).toEqual([0, 0, 20]);
    expect(await explorer.call('getCameraOrbit')).toEqual(expected);
  });
}

test('playing an annotation view preserves its saved orbit for instant tour recall', async ({ site, mount }) => {
  site.set('scene.svx.json', cameraDocument({ start: 350, end: 10, annotation: true })).set('cube.glb', cubeGLB());
  const explorer = await mount({ document: 'scene.svx.json', prompt: 'false' });
  await explorer.waitForEvents('scene-load');

  await explorer.call('setCameraOrbit', '0', '10');
  const saved = await explorer.call('getCameraOrbit');
  await explorer.call('setCameraOrbit', '0', '350');
  await explorer.call('setAnnotationsEnabled', true);
  const label = explorer.locator('.sv-annotation').filter({ hasText: 'Saved view' });
  await expect(label).toBeVisible();
  await label.getByText('Saved view').press('Enter');
  await explorer.waitForEvents('annotation-active');
  await expect.poll(() => explorer.call('getCameraOffset')).toEqual([0, 0, 20]);
  // The animated pose may use an equivalent angle one full turn away. That must
  // not rewrite the saved snapshot, also referenced by this tour step.
  expect(await explorer.call('getCameraOrbit')).not.toEqual(saved);

  await explorer.call('setTourStep', '0', '1', false);
  await expect.poll(() => explorer.call('getCameraOrbit')).toEqual(saved);
});
