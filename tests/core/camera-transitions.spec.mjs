// Camera transitions are checked at completed poses, through the documented API.
// A different final offset is a completion witness; no intermediate frame is sampled.
import { test, expect } from '../../src/fixtures.mjs';
import { cubeGLB, sceneDocument } from '../../src/assets.mjs';

function cameraDocument({ start, end, exploration = start, annotation = false }) {
  const document = sceneDocument({ models: [{ derivatives: { High: 'cube.glb' },
    ...(annotation ? { annotations: [{ id: 'view', titles: { EN: 'Saved view' }, style: 'Standard',
      position: [0, 0, 1], direction: [0, 0, 1], viewId: 'end' }] } : {}),
  }] });
  const setup = document.setups[0];
  setup.navigation.autoZoom = false;
  setup.navigation.orbit = {
    orbit: [0, exploration, 0], offset: [0, 0, 10],
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

for (const { start, end, exploration } of [
  { start: 10, end: 730, exploration: 350 },
  { start: -10, end: -730, exploration: -350 },
]) {
  test(`tour entry retains the saved turn, then preserves ${end - start} authored degrees`, async ({ site, mount }) => {
    site.set('scene.svx.json', cameraDocument({ start, end, exploration })).set('cube.glb', cubeGLB());
    const explorer = await mount({ document: 'scene.svx.json', prompt: 'false' });
    await explorer.waitForEvents('scene-load');

    // Sample through the public API without assuming the getter's angle units/order.
    await explorer.call('setCameraOrbit', '0', String(end));
    const expectedEnd = await explorer.call('getCameraOrbit');
    await explorer.call('setCameraOrbit', '0', String(start));
    const expectedStart = await explorer.call('getCameraOrbit');
    await explorer.call('setCameraOrbit', '0', String(exploration));

    // Entry may take a short arc, but must finish on the authored angle's turn.
    // Otherwise the subsequent two-turn transition would lose a complete turn.
    await explorer.call('setTourStep', '0', '0', true);
    await expect.poll(() => explorer.call('getCameraOffset')).toEqual([0, 0, 12]);
    expect(await explorer.call('getCameraOrbit')).toEqual(expectedStart);

    await explorer.call('setTourStep', '0', '1', true);
    // The distinct offset witnesses completion, even when a slow frame skips
    // intermediate poses. No frame count, delay or angular sample is needed.
    await expect.poll(() => explorer.call('getCameraOffset')).toEqual([0, 0, 20]);
    expect(await explorer.call('getCameraOrbit')).toEqual(expectedEnd);
  });
}

// Clicking a label used to take the long way round and end a turn away from the saved view.
test('playing an annotation view preserves its saved orbit for instant tour recall', { tag: '@pending:rotation-moduli' }, async ({ site, mount }) => {
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
  // Animated playback and instant recall end on the same authored turn, without
  // rewriting the saved snapshot shared by the annotation and tour step.
  expect(await explorer.call('getCameraOrbit')).toEqual(saved);

  await explorer.call('setCameraOrbit', '0', '350');
  await explorer.call('setTourStep', '0', '1', false);
  await expect.poll(() => explorer.call('getCameraOrbit')).toEqual(saved);
});
