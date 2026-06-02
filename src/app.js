import {
  DAILY_DOCKS,
  createDailyDock,
  flipMirror,
  formatShareResult,
  gradeFor,
  initialOrientations,
  mirrorKey,
  scoreDock,
  shanghaiDateKey,
  solutionOrientations,
  traceBeam,
  wrongPathMirrors
} from "./core.js";

const params = new URLSearchParams(window.location.search);
const requestedDate = params.get("date");
const dateKey = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate || "")
  ? requestedDate
  : shanghaiDateKey(new Date());

const elements = {
  board: document.querySelector("#board"),
  dateChip: document.querySelector("#date-chip"),
  dockCount: document.querySelector("#dock-count"),
  pulseCount: document.querySelector("#pulse-count"),
  scoreCount: document.querySelector("#score-count"),
  routeProfile: document.querySelector("#route-profile"),
  dockName: document.querySelector("#dock-name"),
  dockStatus: document.querySelector("#dock-status"),
  shotCount: document.querySelector("#shot-count"),
  bestCount: document.querySelector("#best-count"),
  gradeCount: document.querySelector("#grade-count"),
  resultPanel: document.querySelector("#result-panel"),
  resultTitle: document.querySelector("#result-title"),
  shareText: document.querySelector("#share-text"),
  startButton: document.querySelector("#start-button"),
  fireButton: document.querySelector("#fire-button"),
  nudgeButton: document.querySelector("#nudge-button"),
  nextButton: document.querySelector("#next-button"),
  copyButton: document.querySelector("#copy-button")
};

const state = {
  deck: createDailyDock(dateKey),
  puzzle: null,
  levelIndex: 0,
  orientations: {},
  running: false,
  finished: false,
  awaitingNext: false,
  score: 0,
  pulses: 0,
  shots: 0,
  dockShots: 0,
  totalNudges: 0,
  dockNudges: 0,
  solved: 0,
  lastTrace: null,
  message: "",
  best: 0
};

resetRun(false);
wireEvents();
render();

window.MirrorDock = {
  get deck() {
    return state.deck;
  },
  getShareText,
  getState() {
    return {
      dateKey: state.deck.dateKey,
      levelIndex: state.levelIndex,
      score: state.score,
      pulses: state.pulses,
      shots: state.shots,
      solved: state.solved,
      running: state.running,
      finished: state.finished,
      awaitingNext: state.awaitingNext,
      profile: state.deck.profile,
      possibleScore: state.deck.possibleScore
    };
  },
  solveCurrent() {
    if (!state.puzzle) return;
    state.orientations = solutionOrientations(state.puzzle);
    state.lastTrace = null;
    state.message = "Dock route aligned.";
    render();
  },
  start: startRun,
  fire: fireBeam,
  next: nextDock,
  nudge: nudgeMirror
};

function wireEvents() {
  elements.startButton.addEventListener("click", startRun);
  elements.fireButton.addEventListener("click", fireBeam);
  elements.nudgeButton.addEventListener("click", nudgeMirror);
  elements.nextButton.addEventListener("click", nextDock);
  elements.copyButton.addEventListener("click", copyScore);
  elements.board.addEventListener("click", (event) => {
    const cell = event.target.closest(".cell");
    if (!cell || cell.disabled || !cell.dataset.key) return;
    rotateMirror(cell.dataset.key);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Enter") fireBeam();
    if (event.key.toLowerCase() === "n") nudgeMirror();
    if (event.key.toLowerCase() === "r") startRun();
  });
}

function resetRun(active) {
  state.deck = createDailyDock(dateKey);
  state.levelIndex = 0;
  state.running = active;
  state.finished = false;
  state.awaitingNext = false;
  state.score = 0;
  state.pulses = state.deck.pulseLimit;
  state.shots = 0;
  state.dockShots = 0;
  state.totalNudges = 0;
  state.dockNudges = 0;
  state.solved = 0;
  state.lastTrace = null;
  state.best = loadBest();
  setupLevel(0);
  state.message = active
    ? "Beam online. Rotate mirrors, then fire."
    : "Start the run, rotate the mirrors, then fire the beam.";
}

function setupLevel(index) {
  state.puzzle = state.deck.puzzles[index];
  state.orientations = initialOrientations(state.puzzle);
  state.lastTrace = null;
  state.dockShots = 0;
  state.dockNudges = 0;
  state.awaitingNext = false;
}

function startRun() {
  resetRun(true);
  render();
}

function rotateMirror(key) {
  if (!state.running || state.finished || state.awaitingNext) return;
  state.orientations[key] = flipMirror(state.orientations[key]);
  state.lastTrace = null;
  state.message = "Mirror rotated.";
  render();
}

function fireBeam() {
  if (!state.running || state.finished || state.awaitingNext) return;
  state.shots += 1;
  state.dockShots += 1;
  state.lastTrace = traceBeam(state.puzzle, state.orientations);

  if (state.lastTrace.success) {
    const points = scoreDock(state.puzzle, {
      pulsesRemaining: state.pulses,
      shotsForDock: state.dockShots,
      nudgesUsed: state.dockNudges
    });
    state.score += points;
    state.solved += 1;

    if (state.levelIndex === DAILY_DOCKS - 1) {
      finishRun(`Final dock landed. +${points} points.`);
      return;
    }

    state.awaitingNext = true;
    state.message = `Dock landed. +${points} points.`;
    render();
    return;
  }

  state.pulses = Math.max(0, state.pulses - 1);
  state.message =
    state.lastTrace.outcome === "loop"
      ? "The beam looped inside the dockyard."
      : "The beam spilled out of the wrong edge.";

  if (state.pulses <= 0) {
    finishRun("Pulse bank emptied before every dock landed.");
    return;
  }

  render();
}

function nudgeMirror() {
  if (!state.running || state.finished || state.awaitingNext) return;
  const wrong = wrongPathMirrors(state.puzzle, state.orientations);
  if (wrong.length === 0) {
    state.message = "This dock is already aligned.";
    render();
    return;
  }
  const mirror = wrong[0];
  state.orientations[mirrorKey(mirror)] = mirror.solution;
  state.dockNudges += 1;
  state.totalNudges += 1;
  state.lastTrace = null;
  state.message = "One mirror snapped into phase.";
  render();
}

function nextDock() {
  if (!state.awaitingNext || state.finished) return;
  state.levelIndex += 1;
  setupLevel(state.levelIndex);
  state.message = "Next dock armed.";
  render();
}

function finishRun(message) {
  state.running = false;
  state.finished = true;
  state.awaitingNext = false;
  state.message = message;
  if (state.score > state.best) {
    state.best = state.score;
    saveBest(state.score);
  }
  render();
}

function render() {
  const grade = gradeFor(state.score, state.deck.possibleScore);
  elements.dateChip.textContent = state.deck.dateKey;
  elements.dockCount.textContent = `${Math.min(state.levelIndex + 1, DAILY_DOCKS)}/${DAILY_DOCKS}`;
  elements.pulseCount.textContent = String(state.pulses);
  elements.scoreCount.textContent = String(state.score);
  elements.routeProfile.textContent = state.deck.profile;
  elements.dockName.textContent = state.puzzle.name;
  elements.dockStatus.textContent = state.message;
  elements.shotCount.textContent = String(state.shots);
  elements.bestCount.textContent = String(state.best);
  elements.gradeCount.textContent = grade;
  elements.startButton.textContent = state.running ? "Restart run" : state.finished ? "Play again" : "Start run";
  elements.fireButton.disabled = !state.running || state.finished || state.awaitingNext;
  elements.nudgeButton.disabled =
    !state.running ||
    state.finished ||
    state.awaitingNext ||
    wrongPathMirrors(state.puzzle, state.orientations).length === 0;
  elements.nextButton.hidden = !state.awaitingNext;
  elements.copyButton.disabled = !state.finished;
  renderResult();
  renderBoard();
}

function renderBoard() {
  const puzzle = state.puzzle;
  const mirrorMap = new Map(puzzle.mirrors.map((mirror) => [mirrorKey(mirror), mirror]));
  const beamMap = new Map((state.lastTrace?.path || []).map((step) => [cellKey(step.x, step.y), step]));
  elements.board.style.setProperty("--board-size", puzzle.boardSize);
  elements.board.replaceChildren();

  for (let y = 0; y < puzzle.boardSize; y += 1) {
    for (let x = 0; x < puzzle.boardSize; x += 1) {
      const key = cellKey(x, y);
      const mirror = mirrorMap.get(key);
      const beam = beamMap.get(key);
      const cell = document.createElement("button");
      cell.className = "cell";
      cell.type = "button";
      cell.setAttribute("role", "gridcell");
      cell.dataset.x = String(x);
      cell.dataset.y = String(y);
      cell.disabled = !state.running || state.finished || state.awaitingNext || !mirror;

      if (mirror) {
        const orientation = state.orientations[key];
        cell.classList.add("mirror");
        cell.dataset.key = key;
        cell.dataset.mirror = "true";
        cell.dataset.orientation = orientation === "/" ? "slash" : "backslash";
        cell.textContent = orientation;
        cell.setAttribute(
          "aria-label",
          `Mirror at column ${x + 1}, row ${y + 1}, currently ${orientationName(orientation)}`
        );
      } else {
        cell.textContent = isSource(puzzle, x, y) ? arrowFor(puzzle.start.dir) : "";
        cell.setAttribute("aria-label", `Empty cell column ${x + 1}, row ${y + 1}`);
      }

      if (isSource(puzzle, x, y)) cell.classList.add("source");
      if (isTarget(puzzle, x, y)) cell.classList.add("target");
      if (beam) {
        cell.classList.add("beam");
        if (state.lastTrace.success) cell.classList.add("beam-success");
        if (!state.lastTrace.success && state.lastTrace.path[state.lastTrace.path.length - 1] === beam) {
          cell.classList.add("beam-fail");
        }
      }
      elements.board.append(cell);
    }
  }
}

function renderResult() {
  const show = state.finished;
  elements.resultPanel.hidden = !show;
  if (!show) {
    elements.shareText.textContent = "";
    return;
  }
  const grade = gradeFor(state.score, state.deck.possibleScore);
  elements.resultTitle.textContent = state.solved === DAILY_DOCKS ? "All docks landed" : "Run ended";
  elements.shareText.textContent = getShareText(grade);
}

function getShareText(knownGrade) {
  const grade = knownGrade || gradeFor(state.score, state.deck.possibleScore);
  return formatShareResult({
    dateKey: state.deck.dateKey,
    score: state.score,
    possibleScore: state.deck.possibleScore,
    solved: state.solved,
    shots: state.shots,
    pulses: state.pulses,
    grade,
    profile: state.deck.profile
  });
}

async function copyScore() {
  const text = getShareText();
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-999px";
    document.body.append(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
  state.message = "Score copied.";
  render();
}

function loadBest() {
  return Number(localStorage.getItem(bestKey()) || 0);
}

function saveBest(score) {
  localStorage.setItem(bestKey(), String(score));
}

function bestKey() {
  return `mirrorDockBest:${state.deck.dateKey}`;
}

function isSource(puzzle, x, y) {
  return puzzle.start.x === x && puzzle.start.y === y;
}

function isTarget(puzzle, x, y) {
  return puzzle.targetCell.x === x && puzzle.targetCell.y === y;
}

function arrowFor(dir) {
  return { N: "^", E: ">", S: "v", W: "<" }[dir];
}

function orientationName(orientation) {
  return orientation === "/" ? "slash" : "backslash";
}

function cellKey(x, y) {
  return `${x},${y}`;
}
