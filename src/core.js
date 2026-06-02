export const BOARD_SIZE = 6;
export const DAILY_DOCKS = 5;
export const PULSE_LIMIT = 12;

export const VECTORS = {
  N: { dx: 0, dy: -1 },
  E: { dx: 1, dy: 0 },
  S: { dx: 0, dy: 1 },
  W: { dx: -1, dy: 0 }
};

const LEFT = { N: "W", W: "S", S: "E", E: "N" };
const RIGHT = { N: "E", E: "S", S: "W", W: "N" };
const OPPOSITE = { N: "S", E: "W", S: "N", W: "E" };
const MIRROR_REFLECTIONS = {
  "/": { N: "E", E: "N", S: "W", W: "S" },
  "\\": { N: "W", W: "N", S: "E", E: "S" }
};

const FLAVOR_WORDS = [
  "Flashpoint",
  "Sidewinder",
  "Relay",
  "Afterglow",
  "Crosswind",
  "Needle",
  "Skylatch",
  "Turntable",
  "Beacon",
  "Pulsebox"
];

export function createDailyDock(dateKey = shanghaiDateKey(new Date())) {
  const seed = seedFromString(`mirror-dock:${dateKey}`);
  const rootRng = mulberry32(seed);
  const puzzles = Array.from({ length: DAILY_DOCKS }, (_, index) => {
    const puzzleSeed = Math.floor(rootRng() * 0xffffffff);
    return createPuzzle({ dateKey, levelIndex: index, seed: puzzleSeed });
  });
  const totalTurns = puzzles.reduce((total, puzzle) => total + puzzle.turnCount, 0);
  const profile = totalTurns >= 20 ? "Wild" : totalTurns >= 16 ? "Twisty" : "Tidy";

  return {
    dateKey,
    boardSize: BOARD_SIZE,
    pulseLimit: PULSE_LIMIT,
    profile,
    puzzles,
    possibleScore: totalPossibleScore({ puzzles, pulseLimit: PULSE_LIMIT })
  };
}

export function shanghaiDateKey(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

export function cellKey(x, y) {
  return `${x},${y}`;
}

export function mirrorKey(mirror) {
  return cellKey(mirror.x, mirror.y);
}

export function flipMirror(orientation) {
  return orientation === "/" ? "\\" : "/";
}

export function solutionOrientations(puzzle) {
  return Object.fromEntries(
    puzzle.mirrors.map((mirror) => [
      mirrorKey(mirror),
      mirror.pathMirror ? mirror.solution : mirror.initial
    ])
  );
}

export function initialOrientations(puzzle) {
  return Object.fromEntries(puzzle.mirrors.map((mirror) => [mirrorKey(mirror), mirror.initial]));
}

export function wrongPathMirrors(puzzle, orientations = initialOrientations(puzzle)) {
  return puzzle.mirrors.filter((mirror) => {
    return mirror.pathMirror && orientations[mirrorKey(mirror)] !== mirror.solution;
  });
}

export function traceBeam(puzzle, orientations = initialOrientations(puzzle)) {
  let { x, y, dir } = puzzle.start;
  const visited = new Set();
  const path = [];

  for (let step = 0; step < BOARD_SIZE * BOARD_SIZE * 4 + 8; step += 1) {
    if (!inBounds(x, y)) {
      return exitResult(puzzle, { x, y, dir }, path);
    }

    const stateKey = `${x},${y},${dir}`;
    if (visited.has(stateKey)) {
      return {
        success: false,
        outcome: "loop",
        exit: null,
        path
      };
    }
    visited.add(stateKey);

    const key = cellKey(x, y);
    const mirror = orientations[key];
    const dirIn = dir;
    if (mirror) dir = MIRROR_REFLECTIONS[mirror][dir];
    path.push({ x, y, dirIn, dirOut: dir, mirror: mirror || null });

    x += VECTORS[dir].dx;
    y += VECTORS[dir].dy;
  }

  return {
    success: false,
    outcome: "loop",
    exit: null,
    path
  };
}

export function scoreDock(puzzle, { pulsesRemaining, shotsForDock, nudgesUsed }) {
  const base = 420 + puzzle.level * 45;
  const complexity = puzzle.turnCount * 28 + puzzle.pathLength * 5;
  const pulseBonus = pulsesRemaining * 11;
  const efficiency = Math.max(0, 170 - Math.max(0, shotsForDock - 1) * 35);
  const penalty = nudgesUsed * 80;
  return Math.max(70, base + complexity + pulseBonus + efficiency - penalty);
}

export function totalPossibleScore(deck) {
  return deck.puzzles.reduce((total, puzzle) => {
    return total + scoreDock(puzzle, {
      pulsesRemaining: deck.pulseLimit,
      shotsForDock: 1,
      nudgesUsed: 0
    });
  }, 0);
}

export function gradeFor(score, possibleScore) {
  const ratio = possibleScore > 0 ? score / possibleScore : 0;
  if (ratio >= 0.92) return "S";
  if (ratio >= 0.78) return "A";
  if (ratio >= 0.62) return "B";
  if (ratio >= 0.42) return "C";
  return "D";
}

export function formatShareResult({ dateKey, score, possibleScore, solved, shots, pulses, grade, profile }) {
  return [
    `Mirror Dock ${dateKey}`,
    `${grade} grade`,
    `${score}/${possibleScore} pts`,
    `${solved}/${DAILY_DOCKS} docks`,
    `${shots} shots`,
    `${pulses} pulses left`,
    `${profile} route`
  ].join(" - ");
}

function createPuzzle({ dateKey, levelIndex, seed }) {
  const rng = mulberry32(seed);
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const candidate = generatePath(rng, levelIndex);
    if (!candidate) continue;
    const mirrors = buildMirrors(candidate, rng, levelIndex);
    const puzzle = {
      id: `${dateKey}-${levelIndex + 1}`,
      level: levelIndex + 1,
      name: `${FLAVOR_WORDS[(levelIndex + Math.floor(rng() * FLAVOR_WORDS.length)) % FLAVOR_WORDS.length]} Dock`,
      boardSize: BOARD_SIZE,
      start: candidate.start,
      targetExit: candidate.targetExit,
      targetCell: candidate.targetCell,
      pathLength: candidate.path.length,
      turnCount: candidate.turnCount,
      par: Math.max(2, candidate.turnCount),
      mirrors
    };
    const solvedTrace = traceBeam(puzzle, solutionOrientations(puzzle));
    const initialTrace = traceBeam(puzzle, initialOrientations(puzzle));
    if (solvedTrace.success && !initialTrace.success && wrongPathMirrors(puzzle).length >= 1) {
      return puzzle;
    }
  }

  throw new Error(`could not generate puzzle ${levelIndex + 1}`);
}

function generatePath(rng, levelIndex) {
  const start = randomStart(rng);
  const minSteps = 7 + Math.min(3, levelIndex);
  const maxSteps = 13 + levelIndex;
  const minTurns = 3 + Math.floor(levelIndex / 2);
  let x = start.x;
  let y = start.y;
  let dir = start.dir;
  let turnCount = 0;
  const path = [];
  const visitedCells = new Set();

  for (let step = 0; step < maxSteps; step += 1) {
    visitedCells.add(cellKey(x, y));
    const choices = shuffled([dir, LEFT[dir], RIGHT[dir]], rng)
      .map((outDir) => {
        const nx = x + VECTORS[outDir].dx;
        const ny = y + VECTORS[outDir].dy;
        const exits = !inBounds(nx, ny);
        const turns = outDir === dir ? 0 : 1;
        if (exits) {
          if (path.length + 1 < minSteps) return null;
          return {
            outDir,
            nx,
            ny,
            exits,
            weight: turnCount + turns >= minTurns ? 9 : 1
          };
        }
        if (visitedCells.has(cellKey(nx, ny))) return null;
        return {
          outDir,
          nx,
          ny,
          exits,
          weight: outDir === dir ? 3 : 4
        };
      })
      .filter(Boolean);

    if (choices.length === 0) return null;
    const choice = weightedPick(choices, rng);
    path.push({ x, y, inDir: dir, outDir: choice.outDir });
    if (choice.outDir !== dir) turnCount += 1;

    if (choice.exits) {
      if (turnCount < minTurns) return null;
      return {
        start,
        targetExit: { x: choice.nx, y: choice.ny, dir: choice.outDir },
        targetCell: { x, y },
        path,
        turnCount
      };
    }

    x = choice.nx;
    y = choice.ny;
    dir = choice.outDir;
  }

  return null;
}

function buildMirrors(candidate, rng, levelIndex) {
  const pathCells = new Set(candidate.path.map((step) => cellKey(step.x, step.y)));
  const pathMirrors = candidate.path
    .map((step) => {
      const solution = mirrorForTurn(step.inDir, step.outDir);
      if (!solution) return null;
      return {
        x: step.x,
        y: step.y,
        initial: rng() < 0.35 ? solution : flipMirror(solution),
        solution,
        pathMirror: true
      };
    })
    .filter(Boolean);

  let wrongCount = pathMirrors.filter((mirror) => mirror.initial !== mirror.solution).length;
  for (const mirror of pathMirrors) {
    if (wrongCount >= Math.min(3, pathMirrors.length)) break;
    if (mirror.initial === mirror.solution) {
      mirror.initial = flipMirror(mirror.solution);
      wrongCount += 1;
    }
  }

  const decoys = [];
  const decoyTarget = 4 + levelIndex;
  const used = new Set([...pathCells]);
  while (decoys.length < decoyTarget && used.size < BOARD_SIZE * BOARD_SIZE) {
    const x = Math.floor(rng() * BOARD_SIZE);
    const y = Math.floor(rng() * BOARD_SIZE);
    const key = cellKey(x, y);
    if (used.has(key)) continue;
    used.add(key);
    const initial = rng() < 0.5 ? "/" : "\\";
    decoys.push({
      x,
      y,
      initial,
      solution: initial,
      pathMirror: false
    });
  }

  return shuffled([...pathMirrors, ...decoys], rng).map((mirror, index) => ({
    ...mirror,
    id: `m${index + 1}`
  }));
}

function exitResult(puzzle, exit, path) {
  const success =
    exit.x === puzzle.targetExit.x &&
    exit.y === puzzle.targetExit.y &&
    exit.dir === puzzle.targetExit.dir;
  return {
    success,
    outcome: success ? "dock" : "spill",
    exit,
    path
  };
}

function mirrorForTurn(inDir, outDir) {
  if (inDir === outDir) return null;
  if (OPPOSITE[inDir] === outDir) {
    throw new Error(`invalid mirror turn ${inDir} to ${outDir}`);
  }
  if (MIRROR_REFLECTIONS["/"][inDir] === outDir) return "/";
  if (MIRROR_REFLECTIONS["\\"][inDir] === outDir) return "\\";
  throw new Error(`unknown mirror turn ${inDir} to ${outDir}`);
}

function randomStart(rng) {
  const edge = Math.floor(rng() * 4);
  if (edge === 0) return { x: Math.floor(rng() * BOARD_SIZE), y: 0, dir: "S", edge: "top" };
  if (edge === 1) return { x: BOARD_SIZE - 1, y: Math.floor(rng() * BOARD_SIZE), dir: "W", edge: "right" };
  if (edge === 2) return { x: Math.floor(rng() * BOARD_SIZE), y: BOARD_SIZE - 1, dir: "N", edge: "bottom" };
  return { x: 0, y: Math.floor(rng() * BOARD_SIZE), dir: "E", edge: "left" };
}

function inBounds(x, y) {
  return x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE;
}

function seedFromString(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  return function nextRandom() {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(items, rng) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

function weightedPick(items, rng) {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let roll = rng() * total;
  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}
