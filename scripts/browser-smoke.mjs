import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const url =
  process.env.MIRROR_DOCK_URL ||
  "http://localhost:5222/index.html?date=2026-06-02&v=browser-smoke";
const chromePath =
  process.env.CHROME_BIN ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const port = Number(process.env.CDP_PORT || await findFreePort());
const userDataDir = await mkdtemp(join(tmpdir(), "mirror-dock-chrome-"));

const chrome = spawn(chromePath, [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  "--remote-debugging-address=127.0.0.1",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${userDataDir}`,
  "about:blank"
], {
  stdio: "ignore"
});

try {
  await waitForChrome(port);
  const desktop = await runViewport({ width: 1280, height: 860, mobile: false });
  const mobile = await runViewport({ width: 390, height: 844, mobile: true });
  console.log(
    `browser smoke passed: desktop ${desktop.solved}/5 docks score ${desktop.score}, ` +
      `mobile overflow ${mobile.scrollWidth}/${mobile.clientWidth}`
  );
} finally {
  chrome.kill("SIGTERM");
  await waitForExit(chrome);
  await rm(userDataDir, { force: true, recursive: true, maxRetries: 5, retryDelay: 120 });
}

async function runViewport(viewport) {
  const target = await createTarget("about:blank");
  const cdp = await connectCdp(target.webSocketDebuggerUrl);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: viewport.mobile ? 2 : 1,
    mobile: viewport.mobile
  });
  await cdp.send("Page.navigate", { url });
  await cdp.waitFor("Page.loadEventFired", 10000);

  const loaded = await evaluate(cdp, `(() => {
    return {
      title: document.title,
      h1: document.querySelector('h1')?.textContent,
      boardCells: document.querySelectorAll('.cell').length,
      startEnabled: !document.querySelector('#start-button')?.disabled,
      fireDisabled: document.querySelector('#fire-button')?.disabled,
      challengeDate: document.querySelector('#challenge-date')?.value,
      linkButtonEnabled: !document.querySelector('#copy-link-button')?.disabled,
      challengeLink: window.MirrorDock.getChallengeLink(),
      profile: document.querySelector('#route-profile')?.textContent,
      visibleBoard: visible('#board')
    };

    function visible(selector) {
      const element = document.querySelector(selector);
      if (!element) return false;
      const box = element.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && box.top < window.innerHeight;
    }
  })()`);

  if (
    loaded.title !== "Mirror Dock" ||
    loaded.h1 !== "Mirror Dock" ||
    loaded.boardCells !== 36 ||
    !loaded.startEnabled ||
    !loaded.fireDisabled ||
    loaded.challengeDate !== "2026-06-02" ||
    !loaded.linkButtonEnabled ||
    !loaded.challengeLink.includes("date=2026-06-02") ||
    !["Tidy", "Twisty", "Wild"].includes(loaded.profile) ||
    !loaded.visibleBoard
  ) {
    throw new Error(`unexpected load state: ${JSON.stringify(loaded)}`);
  }

  const challenge = await evaluate(cdp, `(() => {
    window.MirrorDock.loadDate("2026-06-03");
    return {
      dateKey: window.MirrorDock.getState().dateKey,
      input: document.querySelector('#challenge-date').value,
      chip: document.querySelector('#date-chip').textContent,
      url: location.href,
      link: window.MirrorDock.getChallengeLink(),
      running: window.MirrorDock.getState().running,
      boardCells: document.querySelectorAll('.cell').length
    };
  })()`);

  if (
    challenge.dateKey !== "2026-06-03" ||
    challenge.input !== "2026-06-03" ||
    challenge.chip !== "2026-06-03" ||
    !challenge.url.includes("date=2026-06-03") ||
    !challenge.link.includes("date=2026-06-03") ||
    challenge.running ||
    challenge.boardCells !== 36
  ) {
    throw new Error(`challenge date switch failed: ${JSON.stringify(challenge)}`);
  }

  await evaluate(cdp, `window.MirrorDock.loadDate("2026-06-02")`);
  await evaluate(cdp, `window.MirrorDock.start()`);
  await evaluate(cdp, `document.querySelector('[data-mirror="true"]').click()`);

  for (let index = 0; index < 5; index += 1) {
    await evaluate(cdp, `window.MirrorDock.solveCurrent()`);
    await evaluate(cdp, `window.MirrorDock.fire()`);
    const state = await evaluate(cdp, `window.MirrorDock.getState()`);
    if (index < 4) {
      if (!state.awaitingNext) throw new Error(`dock ${index + 1} did not wait for next: ${JSON.stringify(state)}`);
      await evaluate(cdp, `window.MirrorDock.next()`);
    }
  }

  const state = await evaluate(cdp, `(() => {
    const appState = window.MirrorDock.getState();
    const root = document.documentElement;
    return {
      ...appState,
      boardCells: document.querySelectorAll('.cell').length,
      beamCells: document.querySelectorAll('.beam').length,
      copyDisabled: document.querySelector('#copy-button').disabled,
      resultOpen: !document.querySelector('#result-panel').hidden,
      fireDisabled: document.querySelector('#fire-button').disabled,
      shareText: window.MirrorDock.getShareText(),
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
      boardBox: rect('#board'),
      controlsBox: rect('.controls')
    };

    function rect(selector) {
      const box = document.querySelector(selector).getBoundingClientRect();
      return { width: Math.round(box.width), height: Math.round(box.height), top: Math.round(box.top) };
    }

    function visible(selector) {
      const element = document.querySelector(selector);
      if (!element) return false;
      const box = element.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && box.top < window.innerHeight;
    }
  })()`);

  if (!state.finished || state.solved !== 5 || state.score < 3000) {
    throw new Error(`perfect run did not finish: ${JSON.stringify(state)}`);
  }
  if (state.copyDisabled || !state.resultOpen || !state.fireDisabled) {
    throw new Error(`finished controls are wrong: ${JSON.stringify(state)}`);
  }
  if (state.boardCells !== 36 || state.beamCells < 4) {
    throw new Error(`board did not render a beam path: ${JSON.stringify(state)}`);
  }
  if (
    !state.shareText.includes("Mirror Dock 2026-06-02") ||
    !state.shareText.includes("5/5 docks") ||
    !state.shareText.includes(`${state.profile} route`)
  ) {
    throw new Error(`share text is missing result context: ${JSON.stringify(state)}`);
  }
  if (state.scrollWidth > state.clientWidth) {
    throw new Error(`horizontal overflow: ${JSON.stringify(state)}`);
  }
  if (state.boardBox.width < 260 || state.controlsBox.height < 40) {
    throw new Error(`main UI is not visible enough: ${JSON.stringify(state)}`);
  }

  await evaluate(cdp, `document.querySelector('#copy-button').focus()`);
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: " ",
    code: "Space",
    windowsVirtualKeyCode: 32,
    nativeVirtualKeyCode: 32
  });
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: " ",
    code: "Space",
    windowsVirtualKeyCode: 32,
    nativeVirtualKeyCode: 32
  });

  const afterCopy = await evaluate(cdp, `window.MirrorDock.getState()`);
  if (!afterCopy.finished || afterCopy.solved !== 5) {
    throw new Error(`copy interaction disturbed finished state: ${JSON.stringify(afterCopy)}`);
  }

  await cdp.close();
  return state;
}

async function waitForChrome(debugPort) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      await fetchJson(`http://127.0.0.1:${debugPort}/json/version`);
      return;
    } catch {
      await delay(100);
    }
  }
  throw new Error("Chrome remote debugging port did not become ready");
}

async function fetchJson(requestUrl) {
  const response = await fetch(requestUrl);
  if (!response.ok) throw new Error(`${requestUrl} returned ${response.status}`);
  return response.json();
}

async function createTarget(targetUrl) {
  const requestUrl = `http://127.0.0.1:${port}/json/new?${encodeURIComponent(targetUrl)}`;
  const response = await fetch(requestUrl, { method: "PUT" });
  if (!response.ok) throw new Error(`${requestUrl} returned ${response.status}`);
  return response.json();
}

async function connectCdp(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  const pending = new Map();
  const listeners = new Map();
  let nextId = 1;

  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result || {});
      return;
    }

    const waiting = listeners.get(message.method);
    if (waiting) {
      listeners.delete(message.method);
      waiting.resolve(message.params || {});
    }
  });

  return {
    send(method, params = {}) {
      const id = nextId;
      nextId += 1;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        setTimeout(() => {
          if (pending.delete(id)) reject(new Error(`${method} timed out`));
        }, 10000);
      });
    },
    waitFor(method, timeoutMs) {
      return new Promise((resolve, reject) => {
        listeners.set(method, { resolve, reject });
        setTimeout(() => {
          if (listeners.delete(method)) reject(new Error(`${method} timed out`));
        }, timeoutMs);
      });
    },
    close() {
      socket.close();
    }
  };
}

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || "Runtime.evaluate failed");
  }
  return result.result.value;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const selectedPort = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(selectedPort));
    });
  });
}

function waitForExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, 1500);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
