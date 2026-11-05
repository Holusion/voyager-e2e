# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Playwright end-to-end tests for built [Voyager](https://github.com/Smithsonian/dpo-voyager) Explorer bundles: Holusion's fork (`master`) and upstream (the fork's `upstream` branch). Voyager's source isn't here; tests run against a build given by `VOYAGER_DIST`. `README.md` has the full reference for the tagging workflow and CI.

## Commands

There is no lint, build or unit test step. Every Playwright command needs `VOYAGER_DIST`, even `--list`: `playwright.config.mjs` throws without it.

```sh
npm ci && npm run install:browsers

# Build a Voyager revision (gitignored). Last argument: dev (default), prod or both
npm run build-voyager -- https://github.com/Holusion/dpo-voyager master .voyager/master

# What CI runs against each branch
VOYAGER_DIST=.voyager/master/dist npm test -- --grep-invert "@pending|@fork-pending"
VOYAGER_DIST=.voyager/upstream/dist npm run test:core -- --grep-invert @pending

# A single file or test
VOYAGER_DIST=.voyager/master/dist npx playwright test tests/core/loading.spec.mjs -g "swaps the document"

# Debugging
VOYAGER_DIST=.voyager/master/dist npm test -- --ui
npm run report
npx playwright show-trace test-results/<test>/trace.zip
```

A bare `npm test` includes pending tests, which fail on builds lacking their change, and the `fork` project, which fails on upstream.

`VOYAGER_DIST` can also be a sibling checkout's `dist/`. The dev bundle is preferred when present; `npm run test:prod` or `VOYAGER_BUNDLE` selects another.

## Architecture

- `src/server.mjs`: one loopback HTTP server per Playwright worker. It serves the build (`/voyager/`), a bare host page (`/host.html`) and one isolated `Site` per test (`/sites/<n>/`). A `Site` holds in-memory files, counts requests and aborts, and can `hold(path)` requests behind a gate until the test releases them. That is how loading tests pin Voyager in an intermediate state without timers.
- `src/fixtures.mjs`: the `test` and `expect` every spec imports. `mount(attributes)` embeds `<voyager-explorer>` and records its documented events, returning an `Explorer` helper (`waitForEvents`, `call`, `locator`, `spinner`, `modelCoverage`). `mount` points `resourceRoot` at the tested build, because Voyager would otherwise fetch resources from a CDN's latest release. To hold or count those requests, pass `resourceRoot: site.resources`.
- `src/assets.mjs`: fixtures generated in code (`cubeGLB`, `sceneDocument`, `toneWAV`), never checked-in binaries, so each test states what it loads.
- `playwright.config.mjs`: forces SwiftShader WebGL and a host resolver that only reaches `127.0.0.1`, so results don't depend on a GPU or the network.
- Every test fails on an uncaught page exception. Console output is only attached to failures for diagnosis.

## Where a test goes

- `tests/core`: passes on upstream. `tests/fork`: Holusion's fork only, and must fail on upstream (otherwise it belongs in `core`). There is no upstream-only project.
- `@pending:<change>`: covers a Voyager change not merged yet. Regular CI leaves it out, so remove the tag once merged. `VOYAGER_UNMERGED=@pending:<change>` marks those tests as expected failures on a build lacking the change, which proves they detect it. `.github/workflows/pending.yml` checks a change on demand, in the `core` project only.
- `@fork-pending`: upstream behavior the fork hasn't merged yet. It runs on upstream only. Remove the tag after the fork merges and the test passes there.

## Writing tests

- Assert only what the [Explorer API docs](https://github.com/Smithsonian/dpo-voyager/blob/master/docs/content/explorer/api/_index.md) state or what a visitor sees and does. No screenshot comparisons, timing measurements or reads of Voyager's internals. Where code and docs disagree, assert only what both agree on: `getCameraOrbit()` returns degrees as `[pitch, yaw]` while the docs say radians as `[yaw, pitch]`, so orbit tests only compare values with each other.
- Wait on events, request gates or auto-retrying assertions, never fixed delays.
- Don't poll `modelCoverage()`: a screenshot under load can outlast the poll's timeout. Wait for a witness (an event, a label shown or hidden in the same update), then measure once. Tell models apart by color, not position, because Voyager reframes the camera when one hides.
- Keep geometry out of assertions. Annotation labels can land anywhere, so activate them with the keyboard, which goes through the same code path as a click.
- Before trusting a new test, break the behavior it covers and check that it fails.
