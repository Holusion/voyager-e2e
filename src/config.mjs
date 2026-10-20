import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Production bundle first: it is what gets deployed.
const bundles = ['js/voyager-explorer.min.js', 'js/voyager-explorer.dev.js'];

export function configuration(env = process.env) {
  if (!env.VOYAGER_DIST) {
    throw new Error('VOYAGER_DIST is required: path to a built Voyager "dist" directory (see scripts/build-voyager.sh)');
  }
  const dist = resolve(env.VOYAGER_DIST);
  const candidates = env.VOYAGER_BUNDLE ? [env.VOYAGER_BUNDLE] : bundles;
  const bundle = candidates.find(path => existsSync(join(dist, path)));
  if (!bundle) throw new Error(`No Explorer bundle in ${dist} (looked for ${candidates.join(', ')})`);
  return { dist, bundle };
}
