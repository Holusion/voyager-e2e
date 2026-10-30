# Voyager end-to-end tests

Browser tests for a built [Voyager](https://github.com/Smithsonian/dpo-voyager) Explorer: Holusion's fork (`master`) as well as upstream (the fork's `upstream` branch).

The suite favors a few strongly validated behaviors over coverage. Tests assert what Voyager documents (the [Explorer API](https://github.com/Smithsonian/dpo-voyager/blob/master/docs/content/explorer/api/_index.md): attributes, methods, events) or what a visitor sees and does. They don't compare screenshots, measure timings or read Voyager's internals.

## Running

```sh
npm ci
npm run install:browsers

# Build the Voyager revision to test into .voyager/<name>/dist
npm run build-voyager -- https://github.com/Holusion/dpo-voyager master .voyager/master
VOYAGER_DIST=.voyager/master/dist npm test

# Upstream: shared behavior only
npm run build-voyager -- https://github.com/Holusion/dpo-voyager upstream .voyager/upstream
VOYAGER_DIST=.voyager/upstream/dist npm run test:core
```

`VOYAGER_DIST` points to any built `dist` directory, for example a local checkout's own `dist/` after `npm run build-dev`. The development bundle (`js/voyager-explorer.dev.js`) is used if present, for its readable errors, otherwise the production one. `npm run test:prod` tests the production bundle (`js/voyager-explorer.min.js`), which `scripts/build-voyager.sh` builds when given `prod` or `both` as its last argument. `VOYAGER_BUNDLE` picks any other bundle of the build.

`scripts/build-voyager.sh <repository> <ref> <directory> [dev|prod|both]` accepts anything `git fetch` does. With a local clone, remote branches work too, e.g. `../dpo-voyager refs/remotes/origin/master`.

Debugging: `npm run test:headed`, `npm run report`, or `npx playwright show-trace` on the trace kept for every failure.

## Suites

| Project | Directory | Runs against |
| --- | --- | --- |
| `core` | `tests/core` | both upstream and the fork |
| `fork` | `tests/fork` | the fork only |

There is deliberately no upstream-only suite. A behavior the fork doesn't support isn't tested, rather than tested only upstream.

A test belongs to `core` when it passes on upstream. Upstream changes it doesn't share yet are not tested until the fork merges them.

## Pending changes

Tests can cover a Voyager change before it is merged. Write them where they will stay, tagged `@pending:<change>`, for instance a whole file:

```js
test.describe('audio narration', { tag: '@pending:audio-durations' }, () => { … });
```

They fail on builds lacking the change. Leave them out with `--grep-invert @pending`, or pick them with `--grep`:

```sh
VOYAGER_DIST=.voyager/master/dist npm test -- --grep-invert @pending
VOYAGER_DIST=.voyager/audio-durations/dist npm test -- --grep @pending:audio-durations
```

`VOYAGER_UNMERGED=<tag>` says the build lacks the change, whose tests are then expected to fail. That proves they detect what the change fixes:

```sh
VOYAGER_DIST=.voyager/upstream/dist VOYAGER_UNMERGED=@pending:audio-durations npm test -- --grep @pending:audio-durations
```

Once the change is merged, remove the tag.

## Continuous integration

`.github/workflows/e2e.yml` builds the fork's `master` (runs `core` and `fork`) and `upstream` (runs `core`) from `Holusion/dpo-voyager`, leaving pending tests out. It runs on every push to `main`, every pull request, on demand, and daily, because Voyager's branches change independently of this repository. Each job's summary records the Voyager commit it tested. Reports and traces are uploaded when a job fails.

Its `pending` job builds each pending change, to run its tests and the others, and the change's base, where its tests must fail. Once the change is merged, they pass on the base too, which fails the job: remove their tag and the change's entries from the job's matrix.

## How it works

Each Playwright worker starts a small HTTP server (`src/server.mjs`) on loopback. It serves:

- the Voyager build under test (`/voyager/`), also used as Explorer's `resourceRoot`. Otherwise Voyager fetches its fonts, images and translations from a CDN's *latest* release.
- a host page embedding nothing but the Explorer bundle.
- one isolated *site* per test, holding the documents and models that test generated (`src/assets.mjs`). Fixtures are built in code: a flat-colored cube and complete scene documents, so each test states what it loads.

A site can *hold* requests to a file until the test releases them. Loading tests use that to put Voyager in a precise intermediate state, e.g. "thumbnail displayed, high quality pending", for as long as needed, without timers.

Chromium renders WebGL with SwiftShader, so results don't depend on a GPU. Its DNS resolves nothing but `127.0.0.1`, so a test can't silently depend on the network.

Every test fails on an uncaught exception in the page. Console output is attached to failed tests for diagnosis, but it isn't part of any contract.

## Writing tests

```js
import { test, expect } from '../../src/fixtures.mjs';
import { cubeGLB, sceneDocument } from '../../src/assets.mjs';

test('example', async ({ site, mount }) => {
  site.set('scene.svx.json', sceneDocument({ models: [{ derivatives: { High: 'cube.glb' } }] }));
  site.set('cube.glb', cubeGLB());
  const explorer = await mount({ document: 'scene.svx.json' }); // <voyager-explorer> attributes

  await explorer.waitForEvents('scene-load');
  await expect(explorer.spinner).toBeHidden();
  expect(await explorer.call('getActiveLanguage')).toBe('EN');
});
```

Guidelines, learned from building this suite:

- Wait on events, request gates or Playwright's auto-retrying assertions, never on fixed delays.
- Check that a new test passes on upstream *and* the fork before putting it in `core`, and that a `fork` test fails on upstream. Otherwise it belongs in `core`.
- Assert what is documented or user-visible. When Voyager and its documentation disagree, assert only what both agree on. `getCameraOrbit()` returns degrees as `[pitch, yaw]` while the docs say radians as `[yaw, pitch]`, so the orbit tests only compare values with each other.
- Keep geometry out of assertions. Annotation labels can land anywhere on screen, so they are activated with the keyboard, which goes through the same code path as a click.
- Before trusting a new test, break the behavior it covers and check that the test fails.
