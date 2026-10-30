import { test as base, expect } from '@playwright/test';
import { configuration } from './config.mjs';
import { startServer } from './server.mjs';

// Every public event documented in docs/content/explorer/api.
const events = ['model-load', 'model-error', 'scene-content-load', 'scene-load', 'annotation-active'];

/**
 * A `<voyager-explorer>` element embedded in the host page, plus what it dispatched so far.
 */
export class Explorer {
  constructor(page) {
    this.page = page;
    this.element = page.locator('voyager-explorer');
    // Playwright CSS locators pierce open shadow roots.
    this.spinner = this.element.locator('sv-spinner');
  }

  /** Locate something inside the Explorer's UI. */
  locator(selector) { return this.element.locator(selector); }

  /** Events dispatched so far, as `{ type, detail }`, optionally of a single type. */
  events(type) {
    return this.page.evaluate(type => window.voyagerEvents.filter(event => !type || event.type === type), type);
  }

  /** Wait until `count` events of this type were dispatched. Returns them. */
  async waitForEvents(type, count = 1) {
    await expect.poll(async () => (await this.events(type)).length, { message: `waiting for ${count} "${type}" event(s)` })
      .toBeGreaterThanOrEqual(count);
    return this.events(type);
  }

  /** Call a method of the element's public API. */
  call(method, ...args) {
    return this.page.evaluate(([method, args]) => document.querySelector('voyager-explorer')[method](...args), [method, args]);
  }

  /**
   * Share of the view covered by the (orange) fixture model, overall and in the central ninth.
   * Deliberately coarse: it tells whether the model is on screen, not how it is shaded.
   */
  async modelCoverage() {
    const png = (await this.element.screenshot()).toString('base64');
    return this.page.evaluate(async png => {
      const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob());
      const context = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d');
      context.drawImage(bitmap, 0, 0);
      const { data, width, height } = context.getImageData(0, 0, bitmap.width, bitmap.height);
      const coverage = (left, top, right, bottom) => {
        let model = 0, total = 0;
        for (let y = Math.floor(top * height); y < bottom * height; y++) {
          for (let x = Math.floor(left * width); x < right * width; x++, total++) {
            const i = (y * width + x) * 4;
            // Orange, however lit, keeps far more red than blue. Voyager's backgrounds and UI don't.
            if (data[i] - data[i + 2] > 80) model++;
          }
        }
        return model / total;
      };
      return { view: coverage(0, 0, 1, 1), center: coverage(1 / 3, 1 / 3, 2 / 3, 2 / 3) };
    }, png);
  }
}

export const test = base.extend({
  // One server per worker; tests get isolated sites from it.
  voyager: [async ({}, use) => {
    const server = await startServer(configuration());
    await use(server);
    await server.close();
  }, { scope: 'worker' }],

  baseURL: async ({ voyager }, use) => use(voyager.origin),

  // VOYAGER_UNMERGED=<tag>: this build lacks the change tagged so (e.g. @pending:audio-durations),
  // whose tests must then fail. Otherwise they don't test it, or it got merged.
  unmerged: [async ({}, use, testInfo) => {
    const tag = process.env.VOYAGER_UNMERGED;
    testInfo.fail(!!tag && testInfo.tags.includes(tag), `this build lacks ${tag}`);
    await use();
  }, { auto: true }],

  /** Files this test serves to Voyager. Use it as Explorer's `root`. */
  site: async ({ voyager }, use) => {
    const site = voyager.createSite();
    await use(site);
    voyager.removeSite(site);
  },

  // Any uncaught exception in the page fails the test.
  // Console output is kept for diagnosis but is not part of the contract.
  page: async ({ page }, use, testInfo) => {
    const errors = [];
    const logs = [];
    page.on('pageerror', error => errors.push(error));
    page.on('console', message => logs.push(`[${message.type()}] ${message.text()}`));
    page.on('requestfailed', request => logs.push(`[request failed] ${request.url()}: ${request.failure()?.errorText}`));
    await use(page);
    if (testInfo.status !== testInfo.expectedStatus) await testInfo.attach('console', { body: logs.join('\n'), contentType: 'text/plain' });
    expect(errors.map(error => error.stack ?? error.message), 'uncaught exceptions in the page').toEqual([]);
  },

  /**
   * Embed Explorer with the given attributes (see docs/content/explorer/api).
   * `root` defaults to the test's site, and Voyager's own resources to the tested build:
   * otherwise they would come from a CDN's latest release.
   */
  mount: async ({ page, site, voyager }, use) => {
    await use(async (attributes = {}) => {
      await page.goto('/host.html');
      await page.evaluate(async ({ attributes, events }) => {
        await customElements.whenDefined('voyager-explorer');
        window.voyagerEvents = [];
        const element = document.createElement('voyager-explorer');
        for (const type of events) {
          element.addEventListener(type, event => window.voyagerEvents.push({ type, detail: event.detail ?? null }));
        }
        for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
        document.body.appendChild(element);
      }, {
        events,
        attributes: {
          root: site.base,
          resourceRoot: `${voyager.origin}/voyager/`,
          dracoRoot: `${voyager.origin}/voyager/js/draco/`,
          ...attributes,
        },
      });
      return new Explorer(page);
    });
  },
});

export { expect };
