/**
 * A minimal Chrome DevTools Protocol driver.
 *
 * WHY THIS EXISTS RATHER THAN PLAYWRIGHT. Everything the project has verified
 * so far was verified over HTTP: status codes, headers, and the HTML that comes
 * back. None of that can answer the questions Phase 11 has to answer — does the
 * mobile drawer actually open, does Escape actually close it, does focus
 * actually return to the trigger, does anything overflow at 320px. Those need a
 * real browser driving real events.
 *
 * Playwright would do it, and it is a ~300 MB dependency plus its own browser
 * downloads, added to a project whose standing rule is that a dependency needs
 * a concrete justification. Chrome is already installed (Lighthouse uses it in
 * Phase 9 and 10), Node 24 ships a WebSocket client, and CDP is the same
 * protocol Playwright speaks underneath. This file is the ~150 lines of it we
 * actually need.
 *
 * NOT A GENERAL-PURPOSE LIBRARY. It does what the QA suites need and no more.
 */

import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';

/** Browsers we look for, in the order we prefer them. */
export const BROWSERS = {
  chrome: [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ],
  edge: [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/microsoft-edge',
  ],
};

export function findBrowser(kind) {
  for (const candidate of BROWSERS[kind] ?? []) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** Launch a headless browser and return a handle with a `page()` factory. */
export async function launch(kind = 'chrome', { port } = {}) {
  const binary = findBrowser(kind);
  if (!binary) throw new Error(`${kind} is not installed on this machine`);

  const debugPort = port ?? 9500 + Math.floor(Math.random() * 400);
  const profile = path.join(tmpdir(), `ci-qa-${kind}-${randomBytes(4).toString('hex')}`);

  const proc = spawn(
    binary,
    [
      `--remote-debugging-port=${debugPort}`,
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      // Keep the run deterministic and offline-ish: no background network
      // chatter competing with the measurements.
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-extensions',
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  // Poll rather than sleep: startup time varies wildly on a loaded machine.
  let version = null;
  for (let i = 0; i < 300 && !version; i += 1) {
    try {
      version = await (await fetch(`http://127.0.0.1:${debugPort}/json/version`)).json();
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  if (!version) {
    proc.kill();
    throw new Error(`${kind} did not expose a debugging port`);
  }

  return {
    kind,
    version: version.Browser,
    debugPort,
    async page() {
      return openPage(debugPort);
    },
    async close() {
      try {
        proc.kill();
      } catch {
        /* already gone */
      }
      await rm(profile, { recursive: true, force: true }).catch(() => {});
    },
  };
}

async function openPage(debugPort) {
  const target = await (
    await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' })
  ).json();

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  let nextId = 0;
  const pending = new Map();
  /** Everything the page logged, and everything it threw. */
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);

    if (message.id !== undefined) {
      const waiter = pending.get(message.id);
      if (waiter) {
        pending.delete(message.id);
        if (message.error) waiter.reject(new Error(message.error.message));
        else waiter.resolve(message.result);
      }
      return;
    }

    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      consoleErrors.push(
        message.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 400),
      );
    }
    if (message.method === 'Runtime.exceptionThrown') {
      const d = message.params.exceptionDetails;
      pageErrors.push((d.exception?.description ?? d.text ?? '').slice(0, 400));
    }
    if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
      consoleErrors.push(String(message.params.entry.text).slice(0, 400));
    }
    if (message.method === 'Network.loadingFailed') {
      failedRequests.push(`${message.params.type}: ${message.params.errorText}`);
    }
  });

  function send(method, params = {}) {
    const id = (nextId += 1);
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, 30_000);
    });
  }

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Log.enable');
  await send('Network.enable');

  const page = {
    consoleErrors,
    pageErrors,
    failedRequests,

    clearErrors() {
      consoleErrors.length = 0;
      pageErrors.length = 0;
      failedRequests.length = 0;
    },

    /** Emulate a device. `mobile` also switches on touch and a phone UA hint. */
    async viewport(width, height, { mobile = false, scale = 1 } = {}) {
      await send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: scale,
        mobile,
        screenWidth: width,
        screenHeight: height,
      });
      // CDP rejects maxTouchPoints: 0 outright ("must be between 1 and 16"),
      // so the count is only sent when touch is actually being enabled.
      await send('Emulation.setTouchEmulationEnabled',
        mobile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
    },

    /** Lighthouse's mobile preset: slow 4G and a 4x CPU slowdown. */
    async throttle({ cpu = 4, downKbps = 1638, upKbps = 675, latencyMs = 150 } = {}) {
      await send('Emulation.setCPUThrottlingRate', { rate: cpu });
      await send('Network.emulateNetworkConditions', {
        offline: false,
        latency: latencyMs,
        downloadThroughput: (downKbps * 1024) / 8,
        uploadThroughput: (upKbps * 1024) / 8,
      });
    },

    async unthrottle() {
      await send('Emulation.setCPUThrottlingRate', { rate: 1 });
      await send('Network.emulateNetworkConditions', {
        offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1,
      });
    },

    /** Refuse requests matching a pattern, to isolate what a resource costs. */
    async block(patterns) {
      await send('Network.setBlockedURLs', { urls: patterns });
    },

    async emulateColorScheme(scheme) {
      await send('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-color-scheme', value: scheme }],
      });
    },

    /** Navigate and wait for the load event AND for React to settle. */
    async goto(url, { waitFor = 'load' } = {}) {
      const loaded = new Promise((resolve) => {
        const onMessage = (event) => {
          const m = JSON.parse(event.data);
          if (m.method === 'Page.loadEventFired') {
            socket.removeEventListener('message', onMessage);
            resolve();
          }
        };
        socket.addEventListener('message', onMessage);
        setTimeout(resolve, 20_000);
      });
      const result = await send('Page.navigate', { url });
      if (waitFor === 'load') await loaded;
      // One animation frame plus a beat: hydration is scheduled, not synchronous.
      await page.eval('new Promise((r) => requestAnimationFrame(() => setTimeout(r, 250)))', true);
      return result;
    },

    /** Evaluate an expression in the page and return its value. */
    async eval(expression, awaitPromise = false) {
      const { result, exceptionDetails } = await send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise,
      });
      if (exceptionDetails) {
        throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
      }
      return result.value;
    },

    /** Press a key by its CDP identifiers. */
    async key(keyName, { code, keyCode, modifiers = 0 } = {}) {
      const base = { key: keyName, code: code ?? keyName, windowsVirtualKeyCode: keyCode, modifiers };
      await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
      await page.eval('new Promise((r) => requestAnimationFrame(() => setTimeout(r, 80)))', true);
    },

    tab: () => page.key('Tab', { code: 'Tab', keyCode: 9 }),
    escape: () => page.key('Escape', { code: 'Escape', keyCode: 27 }),
    enter: () => page.key('Enter', { code: 'Enter', keyCode: 13 }),

    /** A real pointer click at document coordinates. */
    async clickAt(x, y) {
      const common = { x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 };
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...common });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...common });
      await page.eval('new Promise((r) => requestAnimationFrame(() => setTimeout(r, 200)))', true);
    },

    /** Click the first element matching a selector, by its real box. */
    async click(selector) {
      const box = await page.eval(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
      })()`);
      if (!box || box.w === 0) return false;
      await page.clickAt(box.x, box.y);
      return true;
    },

    /**
     * Set a form field the way a person would, not the way a script would.
     *
     * React tracks the DOM value node internally, so assigning `.value`
     * directly is silently ignored on a controlled input. Going through the
     * native setter and then dispatching `input` is what makes React see it.
     */
    async type(selector, value) {
      return page.eval(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return false;
        const proto = el instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : el instanceof HTMLSelectElement
            ? HTMLSelectElement.prototype
            : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
        setter.call(el, ${JSON.stringify(String(value))});
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })()`);
    },

    /** Tick or untick a checkbox, firing the events React listens for. */
    async check(selector, checked = true) {
      return page.eval(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return false;
        if (el.checked !== ${checked ? 'true' : 'false'}) el.click();
        return el.checked === ${checked ? 'true' : 'false'};
      })()`);
    },

    /** Submit the form containing a given field, and wait for the round trip. */
    async submitForm(markerSelector, settleMs = 2500) {
      const ok = await page.eval(`(() => {
        const el = document.querySelector(${JSON.stringify(markerSelector)});
        const form = el && el.closest('form');
        if (!form) return false;
        const button = form.querySelector('button[type=submit], button:not([type])');
        if (button) button.click(); else form.requestSubmit();
        return true;
      })()`);
      if (ok) await page.eval(`new Promise((r) => setTimeout(r, ${settleMs}))`, true);
      return ok;
    },

    async cookie(name, value, domain = 'localhost') {
      await send('Network.setCookie', { name, value, domain, path: '/' });
    },

    async close() {
      try {
        socket.close();
      } catch {
        /* already closed */
      }
      await fetch(`http://127.0.0.1:${debugPort}/json/close/${target.id}`).catch(() => {});
    },
  };

  return page;
}
