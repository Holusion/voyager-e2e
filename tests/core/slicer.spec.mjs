// The slicer cuts through the scene's models, except those that opt out of it.
import { test, expect } from '../../src/fixtures.mjs';
import { blue, cubeGLB, sceneDocument } from '../../src/assets.mjs';

/** An orange and a blue model, sliced halfway up if `slicer`, the orange one opting out. */
function slicedDocument(slicer) {
  const document = sceneDocument({ models: [
    { derivatives: { High: 'orange.glb' }, slicerEnabled: false },
    { derivatives: { High: 'blue.glb' } },
  ] });
  // A grey slice plane counts as neither model.
  document.setups[0].slicer = { enabled: slicer, axis: 'Y', inverted: false, position: 0.5, color: [0.5, 0.5, 0.5] };
  return document;
}

async function coverage(site, mount, slicer) {
  site.set('scene.svx.json', slicedDocument(slicer));
  const explorer = await mount({ document: 'scene.svx.json', prompt: 'false' });
  await explorer.waitForEvents('scene-load');
  return { orange: (await explorer.modelCoverage()).view, blue: (await explorer.modelCoverage({ color: 'blue' })).view };
}

// Per-model slicerEnabled used to be ignored on load, and models disagreeing on it to compete
// for the renderer's clipping (#503, #508).
test('slices only the models that let it', { tag: '@pending:rc-68' }, async ({ site, mount }) => {
  site.set('orange.glb', cubeGLB()).set('blue.glb', cubeGLB({ color: blue }));

  const whole = await coverage(site, mount, false);
  const sliced = await coverage(site, mount, true);

  expect(whole.orange).toBeGreaterThan(0);
  expect(whole.blue).toBeGreaterThan(0);
  expect(sliced.blue, 'the blue model is sliced').toBeLessThan(whole.blue * 0.8);
  expect(sliced.orange, 'the orange model is whole').toBeCloseTo(whole.orange, 2);
});
