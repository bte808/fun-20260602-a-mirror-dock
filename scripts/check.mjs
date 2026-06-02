import { readFile } from "node:fs/promises";
import {
  DAILY_DOCKS,
  createDailyDock,
  formatShareResult,
  gradeFor,
  initialOrientations,
  scoreDock,
  solutionOrientations,
  traceBeam,
  wrongPathMirrors
} from "../src/core.js";

const requiredFiles = [
  "index.html",
  "src/styles.css",
  "src/app.js",
  "src/core.js",
  "README.md",
  "LICENSE",
  "docs/preview.svg"
];

for (const file of requiredFiles) {
  const text = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
  if (!text.trim()) throw new Error(`${file} is empty`);
}

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");

if (!html.includes('id="board"')) throw new Error("index.html must expose the puzzle board");
if (!html.includes("Mirror Dock")) throw new Error("index.html must name the game");
if (!html.includes('id="challenge-date"')) throw new Error("index.html must expose a challenge date picker");
if (!html.includes('id="copy-link-button"')) throw new Error("index.html must expose a challenge link button");
if (!app.includes("window.MirrorDock")) throw new Error("app.js must expose a browser smoke hook");
if (!app.includes("solveCurrent")) throw new Error("app.js must expose a deterministic solve hook");
if (!app.includes("loadDate: loadChallengeDate")) throw new Error("app.js must expose challenge date loading");
if (!app.includes("getChallengeLink")) throw new Error("app.js must expose challenge link generation");
if (!css.includes(".challenge-strip")) throw new Error("styles.css must style the challenge date controls");
if (!css.includes("@media (max-width: 430px)")) throw new Error("styles.css must include narrow mobile layout");
if (!readme.includes("Why it may be worth starring")) {
  throw new Error("README must include star-oriented positioning");
}
if (!readme.includes("Challenge date")) throw new Error("README must document the date challenge flow");
if (!readme.includes("Inspiration sources")) throw new Error("README must cite public inspiration sources");

const deck = createDailyDock("2026-06-02");
if (deck.puzzles.length !== DAILY_DOCKS) throw new Error("daily dock should have five puzzles");
if (!["Tidy", "Twisty", "Wild"].includes(deck.profile)) throw new Error("unexpected route profile");
if (deck.possibleScore < 3000) throw new Error(`possible score is too low: ${deck.possibleScore}`);

let totalTurns = 0;
for (const puzzle of deck.puzzles) {
  const solved = traceBeam(puzzle, solutionOrientations(puzzle));
  const initial = traceBeam(puzzle, initialOrientations(puzzle));
  const wrong = wrongPathMirrors(puzzle);
  totalTurns += puzzle.turnCount;

  if (!solved.success) throw new Error(`solution failed for ${puzzle.id}`);
  if (initial.success) throw new Error(`initial board should not be solved for ${puzzle.id}`);
  if (wrong.length < 1) throw new Error(`initial board needs at least one wrong path mirror for ${puzzle.id}`);
  if (puzzle.mirrors.length < puzzle.turnCount + 3) {
    throw new Error(`puzzle needs decoy mirrors for ${puzzle.id}`);
  }
  if (puzzle.pathLength < 7 || puzzle.turnCount < 3) {
    throw new Error(`puzzle is too shallow: ${JSON.stringify({
      id: puzzle.id,
      pathLength: puzzle.pathLength,
      turnCount: puzzle.turnCount
    })}`);
  }

  const points = scoreDock(puzzle, {
    pulsesRemaining: deck.pulseLimit,
    shotsForDock: 1,
    nudgesUsed: 0
  });
  if (points < 500) throw new Error(`dock score too low for ${puzzle.id}: ${points}`);
}

if (totalTurns < 16) throw new Error(`daily route needs more turns: ${totalTurns}`);
if (gradeFor(deck.possibleScore, deck.possibleScore) !== "S") {
  throw new Error("perfect possible score should grade S");
}
if (gradeFor(Math.floor(deck.possibleScore * 0.7), deck.possibleScore) !== "B") {
  throw new Error("grade thresholds should produce B around 70 percent");
}

const share = formatShareResult({
  dateKey: deck.dateKey,
  score: 2400,
  possibleScore: deck.possibleScore,
  solved: 4,
  shots: 9,
  pulses: 8,
  grade: "A",
  profile: deck.profile
});

for (const phrase of ["Mirror Dock 2026-06-02", "A grade", "4/5 docks", "9 shots", `${deck.profile} route`]) {
  if (!share.includes(phrase)) throw new Error(`share result missing ${phrase}: ${share}`);
}

console.log(
  `check passed: ${deck.puzzles.length} docks, ${totalTurns} turns, ${deck.profile} route, ${deck.possibleScore} possible`
);
