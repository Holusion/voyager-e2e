// Audio narration, played from the main menu.
import { test, expect } from '../../src/fixtures.mjs';
import { cubeGLB, sceneDocument, toneWAV } from '../../src/assets.mjs';

/** A scene narrated by a ten-second clip, in the given languages. */
function narratedScene(site, uris) {
  site.set('scene.svx.json', sceneDocument({
    models: [{ derivatives: { High: 'cube.glb' } }],
    audio: [{ id: 'narration', uris }],
    narration: 'narration',
  }));
  site.set('cube.glb', cubeGLB());
}

async function playNarration(site, mount) {
  const explorer = await mount({ document: 'scene.svx.json' });
  await explorer.waitForEvents('scene-load');
  await explorer.locator('#audio-btn').click();
  return explorer;
}

// Voyager streams audio from its URL, instead of downloading and decoding
// every clip in every language when the document loads, then playing that download.
test.describe('audio narration', { tag: '@pending:audio-durations' }, () => {
  test('requests no audio until it is played, then only in the active language', async ({ site, mount }) => {
    narratedScene(site, { EN: 'en.wav', FR: 'fr.wav' });
    site.set('en.wav', toneWAV()).set('fr.wav', toneWAV({ frequency: 660 }));

    const explorer = await mount({ document: 'scene.svx.json' });
    await explorer.waitForEvents('scene-load');
    expect(site.requests('en.wav') + site.requests('fr.wav'), 'audio requested before playing').toBe(0);

    await explorer.locator('#audio-btn').click();
    // The player shows the clip's duration once the browser read it.
    await expect(explorer.locator('#global-audio .sv-timer')).toHaveText(/\/00:10$/);
    expect(site.requests('en.wav')).toBeGreaterThan(0);
    expect(site.requests('fr.wav'), 'audio requested in an inactive language').toBe(0);
  });

  test('plays a narration whose file is still downloading', async ({ site, mount }) => {
    narratedScene(site, { EN: 'en.wav' });
    site.set('en.wav', toneWAV());
    const file = site.hold('en.wav');

    const explorer = await playNarration(site, mount);
    await expect.poll(() => file.requests, { message: 'narration requested' }).toBeGreaterThan(0);
    file.release();

    // It plays without being asked again: the elapsed time runs.
    await expect(explorer.locator('#global-audio .sv-timer')).toHaveText(/^00:0[1-9]\/00:10$/);
  });

  for (const [file, body, problem] of [['missing.wav', null, 'is missing'], ['broken.wav', 'not audio', "can't be decoded"]]) {
    test(`names a narration file that ${problem}`, async ({ site, mount }) => {
      narratedScene(site, { EN: file });
      if (body) site.set(file, body, 'audio/wav');

      const explorer = await playNarration(site, mount);

      await expect(explorer.locator('ff-notification')).toContainText(file);
    });
  }
});
