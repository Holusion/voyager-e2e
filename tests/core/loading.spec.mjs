// Loading contracts, as documented in docs/content/explorer/api ("Events").
// Model requests are held by the test server, so each intermediate state lasts as long as the test needs.
import { test, expect } from '../../src/fixtures.mjs';
import { cubeGLB, sceneDocument, toneWAV } from '../../src/assets.mjs';

const types = events => events.map(event => event.type);

test('shows the loading indicator until the requested quality is on screen', async ({ site, mount }) => {
  site.set('scene.svx.json', sceneDocument({ models: [{ derivatives: { Thumb: 'thumb.glb', High: 'high.glb' } }] }));
  site.set('thumb.glb', cubeGLB()).set('high.glb', cubeGLB());
  const high = site.hold('high.glb');

  // No explicit quality: an explicit one makes Voyager skip the thumbnail.
  const explorer = await mount({ document: 'scene.svx.json', prompt: 'true' });

  // The thumbnail is displayed, but High is still pending: the initial load is not over.
  await explorer.waitForEvents('scene-content-load');
  await expect.poll(() => high.requests, { message: 'High derivative requested' }).toBeGreaterThan(0);
  expect(await explorer.events()).toEqual([
    { type: 'model-load', detail: 'Thumb' },
    { type: 'scene-content-load', detail: null },
  ]);
  await expect(explorer.spinner).toBeVisible();
  await expect(explorer.locator('sv-action-prompt')).toHaveCount(0);

  high.release();
  await explorer.waitForEvents('scene-load');
  expect(await explorer.events()).toEqual([
    { type: 'model-load', detail: 'Thumb' },
    { type: 'scene-content-load', detail: null },
    { type: 'model-load', detail: 'High' },
    { type: 'scene-load', detail: null },
  ]);
  // scene-load is "exactly the point where Voyager stops showing the initial loading
  // indicator [...] and enables the interaction prompt".
  await expect(explorer.spinner).toBeHidden();
  // The prompt is only rendered once enabled. Whether its animation currently shows it is not checked.
  await expect(explorer.locator('sv-action-prompt')).toHaveCount(1);

  // The model is actually drawn: it fills the middle of the view, not all of it.
  const coverage = await explorer.modelCoverage();
  expect(coverage.center).toBeGreaterThan(0.9);
  expect(coverage.view).toBeLessThan(0.8);
});

test('waits for every model before ending the initial load', async ({ site, mount }) => {
  site.set('scene.svx.json', sceneDocument({ models: [{ derivatives: { High: 'a.glb' } }, { derivatives: { High: 'b.glb' } }] }));
  site.set('a.glb', cubeGLB()).set('b.glb', cubeGLB());
  const a = site.hold('a.glb');
  const b = site.hold('b.glb');

  const explorer = await mount({ document: 'scene.svx.json', quality: 'High' });
  await expect.poll(() => a.requests > 0 && b.requests > 0, { message: 'both models requested' }).toBe(true);

  // Release in the reverse order of the document.
  b.release();
  await explorer.waitForEvents('model-load');
  expect(types(await explorer.events())).toEqual(['model-load']);
  await expect(explorer.spinner).toBeVisible();

  a.release();
  await explorer.waitForEvents('scene-load');
  expect(await explorer.events()).toEqual([
    { type: 'model-load', detail: 'High' },
    { type: 'model-load', detail: 'High' },
    { type: 'scene-content-load', detail: null },
    { type: 'scene-load', detail: null },
  ]);
  await expect(explorer.spinner).toBeHidden();
});

test('falls back to the closest available quality', async ({ site, mount }) => {
  site.set('scene.svx.json', sceneDocument({ models: [{ derivatives: { Low: 'low.glb' } }] }));
  site.set('low.glb', cubeGLB());

  const explorer = await mount({ document: 'scene.svx.json', quality: 'High' });

  await explorer.waitForEvents('scene-load');
  expect(await explorer.events()).toEqual([
    { type: 'model-load', detail: 'Low' },
    { type: 'scene-content-load', detail: null },
    { type: 'scene-load', detail: null },
  ]);
  await expect(explorer.spinner).toBeHidden();
});

test('reports a model that fails to load', async ({ site, mount }) => {
  site.set('scene.svx.json', sceneDocument({ models: [{ derivatives: { High: 'missing.glb' } }] }));

  const explorer = await mount({ document: 'scene.svx.json' });

  // A model that will never display anything doesn't hold scene-content-load back.
  await explorer.waitForEvents('scene-content-load');
  const events = await explorer.events();
  expect(types(events)).toEqual(['model-error', 'scene-content-load']);
  expect(events[0].detail).toContain('missing.glb');
  // ...nor does it leave the user in front of an endless spinner.
  await expect(explorer.spinner).toBeHidden();
  await expect(explorer.locator('ff-notification')).toContainText('missing.glb');
});

test('reports a document that fails to load', async ({ mount }) => {
  const explorer = await mount({ document: 'missing.svx.json' });

  await expect(explorer.locator('ff-notification')).toContainText('missing.svx.json');
  await expect(explorer.spinner).toBeHidden();
  expect(await explorer.events()).toEqual([]);
});

// Audio used to be fetched with the document: a missing file left the indicator spinning forever,
// then threw. audio-durations no longer fetches it before it is played.
test('a missing audio file holds no load back', { tag: ['@pending:audio-durations', '@fork-pending'] }, async ({ site, mount }) => {
  site.set('scene.svx.json', sceneDocument({
    models: [{ derivatives: { High: 'cube.glb' } }],
    audio: [{ id: 'narration', uris: { EN: 'missing.wav' } }],
    narration: 'narration',
  }));
  site.set('cube.glb', cubeGLB());

  const explorer = await mount({ document: 'scene.svx.json' });

  await explorer.waitForEvents('scene-load');
  await expect(explorer.spinner).toBeHidden();
});

// The requested language wins, even when its translations arrive after the document set its own.
// What shows while they download is not checked.
test('lang attribute holds while its translations download', async ({ site, mount }) => {
  site.set('scene.svx.json', sceneDocument({ titles: { EN: 'Cube', FR: 'Cube FR' }, language: 'EN', models: [{ derivatives: { High: 'cube.glb' } }] }));
  site.set('cube.glb', cubeGLB());
  const translations = site.hold('voyager/language/string.resources.fr.json');

  const explorer = await mount({ document: 'scene.svx.json', lang: 'FR', resourceRoot: site.resources });
  await explorer.waitForEvents('scene-load');
  await expect.poll(() => translations.requests, { message: 'French translations requested' }).toBeGreaterThan(0);

  translations.release();

  await expect(explorer.locator('#fullscreen-btn')).toHaveAttribute('title', 'Plein écran');
  await expect(explorer.locator('.sv-main-title')).toHaveText('Cube FR');
  expect(await explorer.call('getActiveLanguage')).toBe('FR');
});
