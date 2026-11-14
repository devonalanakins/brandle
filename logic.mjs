import { VALID_WORDS, ANSWERS } from "./words.mjs";
export { VALID_WORDS, ANSWERS };

export const MAX_ROWS = 6;
export const WORD_LENGTH = 5;
export const START_UTC = Date.UTC(2026, 9, 29) / 86400000;

export function utcKey(value = new Date()) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new RangeError("Invalid date");
  return date.toISOString().slice(0, 10);
}
export function dayNumber(value = new Date()) {
  return Math.floor(Date.parse(utcKey(value) + "T00:00:00.000Z") / 86400000);
}
export function puzzleNumber(value = new Date()) {
  return dayNumber(value) - START_UTC + 1;
}
export function dailyAnswer(value = new Date()) {
  // A full-cycle offset means no daily answers repeat until the entire answer bank is used.
  const day = dayNumber(value);
  const index = ((day * 509 + 89) % ANSWERS.length + ANSWERS.length) % ANSWERS.length;
  return ANSWERS[index];
}
export function validWord(word) {
  return typeof word === "string" && VALID_WORDS.has(word.toUpperCase());
}
export function scoreGuess(guess, answer) {
  const g = String(guess).toUpperCase();
  const a = String(answer).toUpperCase();
  if (!/^[A-Z]{5}$/.test(g) || !/^[A-Z]{5}$/.test(a)) throw new TypeError("Expected two five-letter words");
  const result = Array(5).fill("absent");
  const remaining = Object.create(null);
  for (let i = 0; i < 5; i++) {
    if (g[i] === a[i]) result[i] = "correct";
    else remaining[a[i]] = (remaining[a[i]] ?? 0) + 1;
  }
  for (let i = 0; i < 5; i++) {
    if (result[i] !== "absent") continue;
    const ch = g[i];
    if (remaining[ch] > 0) {
      result[i] = "present";
      remaining[ch]--;
    }
  }
  return result;
}
// Short, non-color-only feedback for the single-screen status line.
export function guessFeedback(guess, answer) {
  const counts = { correct: 0, present: 0, absent: 0 };
  for (const result of scoreGuess(guess, answer)) counts[result]++;
  return counts.correct + " RIGHT · " + counts.present + " ELSEWHERE · " + counts.absent + " OUT";
}
const WEIGHT = { absent: 1, present: 2, correct: 3 };
export function keyboardHints(guesses, answer) {
  const hints = {};
  for (const guess of guesses) {
    const scores = scoreGuess(guess, answer);
    [...guess].forEach((letter, i) => {
      if ((WEIGHT[scores[i]] ?? 0) > (WEIGHT[hints[letter]] ?? 0)) hints[letter] = scores[i];
    });
  }
  return hints;
}
export function freshGame(id, answer) {
  return { id, answer, guesses: [], current: "", finished: false, won: false, recorded: false };
}
export function hydrateGame(raw, id, answer) {
  if (!raw || typeof raw !== "object" || raw.id !== id || raw.answer !== answer || !Array.isArray(raw.guesses)) return null;
  const guesses = raw.guesses.map(v => typeof v === "string" ? v.toUpperCase() : "");
  if (guesses.length > MAX_ROWS || guesses.some(g => !validWord(g))) return null;
  const firstWin = guesses.indexOf(answer);
  if (firstWin >= 0 && firstWin !== guesses.length - 1) return null;
  const finished = firstWin >= 0 || guesses.length === MAX_ROWS;
  const current = !finished && typeof raw.current === "string" && /^[A-Z]{0,5}$/.test(raw.current.toUpperCase())
    ? raw.current.toUpperCase() : "";
  return { id, answer, guesses, current, finished, won: firstWin >= 0, recorded: raw.recorded === true };
}
export function initialStats() {
  return { played: 0, wins: 0, currentStreak: 0, bestStreak: 0, distribution: [0,0,0,0,0,0], lastWonDate: "", lastPlayedDate: "" };
}
export function normalizeStats(raw) {
  const base = initialStats();
  if (!raw || typeof raw !== "object") return base;
  for (const k of ["played", "wins", "currentStreak", "bestStreak"]) {
    if (Number.isSafeInteger(raw[k]) && raw[k] >= 0) base[k] = raw[k];
  }
  if (Array.isArray(raw.distribution) && raw.distribution.length === 6) {
    base.distribution = raw.distribution.map(v => Number.isSafeInteger(v) && v >= 0 ? v : 0);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw.lastWonDate ?? "")) base.lastWonDate = raw.lastWonDate;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw.lastPlayedDate ?? "")) base.lastPlayedDate = raw.lastPlayedDate;
  return base;
}
export function recordResult(rawStats, game, mode, date = new Date()) {
  const stats = normalizeStats(rawStats);
  if (!game.finished) return stats;
  stats.played++;
  const now = utcKey(date);
  if (game.won) {
    stats.wins++;
    stats.distribution[game.guesses.length - 1]++;
    if (mode === "daily") {
      const previous = new Date(now + "T00:00:00Z").getTime() - 86400000;
      stats.currentStreak = stats.lastWonDate === new Date(previous).toISOString().slice(0, 10)
        ? stats.currentStreak + 1 : 1;
      stats.lastWonDate = now;
    } else stats.currentStreak++;
    stats.bestStreak = Math.max(stats.bestStreak, stats.currentStreak);
  } else stats.currentStreak = 0;
  stats.lastPlayedDate = now;
  return stats;
}
export function chooseWildAnswer(recent = [], random = Math.random) {
  const recentSet = new Set(recent);
  const eligible = ANSWERS.filter(a => !recentSet.has(a));
  const pool = eligible.length ? eligible : ANSWERS;
  const n = Number(random());
  return pool[Math.min(pool.length - 1, Math.max(0, Math.floor((Number.isFinite(n) ? n : 0) * pool.length)))];
}
export function shareText(game, mode = "daily", date = new Date(), url = "") {
  const title = mode === "daily" ? "BRANDLE #" + puzzleNumber(date) : "BRANDLE • WILD RUN";
  const tries = game.won ? String(game.guesses.length) : "X";
  const emoji = { correct: "🟩", present: "🟨", absent: "⬛" };
  const grid = game.guesses.map(g => scoreGuess(g, game.answer).map(s => emoji[s]).join("")).join("\n");
  return title + " " + tries + "/6\n" + grid + (url ? "\n" + url : "");
}
