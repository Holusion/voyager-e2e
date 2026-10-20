// Behavior specific to Holusion's fork.
import { test, expect } from '../../src/fixtures.mjs';

test('reports a missing default document', async ({ mount }) => {
  // Without a document attribute, Explorer looks for scene.svx.json in its root.
  const explorer = await mount();

  await expect(explorer.locator('ff-notification')).toContainText('scene.svx.json');
  await expect(explorer.spinner).toBeHidden();
});
