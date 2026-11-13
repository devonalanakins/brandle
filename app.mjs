import { ANSWERS, MAX_ROWS, WORD_LENGTH, utcKey, puzzleNumber, dailyAnswer, validWord, scoreGuess, keyboardHints, freshGame, hydrateGame, initialStats, normalizeStats, recordResult, chooseWildAnswer, shareText } from "./logic.mjs";

const $ = (selector) => document.querySelector(selector);
const dateKey = utcKey();
const STORAGE = "brandle-v1:";
const KEYS = { mode: "mode", wild: "wild", recent: "recent", settings: "settings", seen: "seen", dailyStats: "stats-daily", wildStats: "stats-wild" };
const read = (name, fallback = null) => {
  try {
    const raw = localStorage.getItem(STORAGE + name);
    return raw === null ? fallback : JSON.parse(raw);
  } catch { return fallback; }
};
const write = (name, value) => {
  try { localStorage.setItem(STORAGE + name, JSON.stringify(value)); } catch { /* private browsing / full storage */ }
};
const dailyState = (day) => {
  const answer = dailyAnswer(new Date(day + "T00:00:00Z"));
  const id = "daily:" + day;
  return hydrateGame(read(id), id, answer) ?? freshGame(id, answer);
};
const wildState = () => {
  const last = read(KEYS.wild);
  if (last && typeof last.id === "string" && last.id.startsWith("wild:") && ANSWERS.includes(last.answer)) {
    const saved = hydrateGame(last, last.id, last.answer);
    if (saved) return saved;
  }
  return newWild();
};
const newWild = () => {
  const old = read(KEYS.recent, []);
  const recent = Array.isArray(old) ? old.filter(v => ANSWERS.includes(v)).slice(-35) : [];
  const answer = chooseWildAnswer(recent);
  write(KEYS.recent, [...recent, answer].slice(-35));
  return freshGame("wild:" + (crypto.randomUUID?.() ?? String(Date.now()) + Math.random()), answer);
};
const savedSettings = read(KEYS.settings, {});
const settings = {
  sound: savedSettings?.sound !== false,
  haptics: savedSettings?.haptics !== false,
  intensity: savedSettings?.intensity === "calm" ? "calm" : "spectacular",
  contrast: savedSettings?.contrast === true
};
const state = {
  mode: read(KEYS.mode, "daily") === "wild" ? "wild" : "daily",
  date: dateKey, daily: dailyState(dateKey), wild: wildState(),
  revealing: false, revealRow: -1, revealStep: -1, modal: null, toastTimer: null, lastFocus: null
};
const getGame = () => state[state.mode];
const getStats = () => normalizeStats(read(state.mode === "daily" ? KEYS.dailyStats : KEYS.wildStats, initialStats()));
const saveGame = () => write(getGame().id.startsWith("daily:") ? getGame().id : KEYS.wild, getGame());
let audioCtx = null;
const sound = (kind = "tap") => {
  if (!settings.sound) return;
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    audioCtx ??= new Audio();
    if (audioCtx.state === "suspended") void audioCtx.resume();
    const t = audioCtx.currentTime;
    const notes = kind === "win" ? [523.25, 659.25, 783.99, 1046.5, 1318.5] :
      kind === "success" ? [392, 523.25, 659.25] :
      kind === "error" ? [164.81, 146.83] :
      kind === "flip" ? [440] : [340 + Math.random() * 70];
    notes.forEach((frequency, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = kind === "error" ? "triangle" : "sine";
      osc.frequency.setValueAtTime(frequency, t + i * .068);
      const start = t + i * .068;
      gain.gain.setValueAtTime(.00001, start);
      gain.gain.exponentialRampToValueAtTime(kind === "tap" ? .022 : .048, start + .008);
      gain.gain.exponentialRampToValueAtTime(.00001, start + .16);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(start); osc.stop(start + .17);
    });
  } catch { /* audio is optional */ }
};
const hapticSupported = typeof navigator.vibrate === "function";
function haptic(pattern = 7) {
  if (settings.haptics && hapticSupported) {
    try { navigator.vibrate(pattern); } catch { /* browser restricted */ }
  }
}
const icon = (name, size = 20) => {
  const paths = {
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9a2.5 2.5 0 0 1 4.8 1c0 1.5-2.4 2-2.4 3.5"/><circle cx="12" cy="17" r=".6" fill="currentColor" stroke="none"/>',
    settings: '<path d="M12 2.5l1.6 1.1 2-.3.8 1.9 1.9.8-.3 2 1.1 1.6-1.1 1.6.3 2-1.9.8-.8 1.9-2-.3-1.6 1.1-1.6-1.1-2 .3-.8-1.9-1.9-.8.3-2L4.9 9.6 6 8l-.3-2 1.9-.8.8-1.9 2 .3L12 2.5Z" transform="translate(0 2)"/><circle cx="12" cy="12" r="3"/>',
    stats: '<path d="M5 20V11M10 20V5M15 20v-8M20 20V8" stroke-width="3" stroke-linecap="round"/>',
    close: '<path d="M5 5l14 14M19 5 5 19"/>',
    back: '<path d="M20 5H9L3 12l6 7h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2ZM12 10l6 5m0-5-6 5"/>',
    enter: '<path d="m6 12 4 4 8-8"/>',
    share: '<path d="M12 16V3m0 0 4 4m-4-4L8 7M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
    reload: '<path d="M20 7a9 9 0 1 0 1 8M20 3v5h-5"/>'
  };
  return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths[name] + '</svg>';
};
function applySettings() {
  document.documentElement.classList.toggle("calm", settings.intensity === "calm");
  document.documentElement.classList.toggle("high-contrast", settings.contrast);
}
applySettings();
function updateHeader() {
  $("#puzzle-label").textContent = state.mode === "daily" ? "#" + puzzleNumber(new Date(state.date + "T00:00:00Z")) + " · " + new Date(state.date + "T12:00:00Z").toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" }) : "THE WILD RUN";
  $("#mode-daily").setAttribute("aria-pressed", String(state.mode === "daily"));
  $("#mode-wild").setAttribute("aria-pressed", String(state.mode === "wild"));
  $("#mode-daily").classList.toggle("selected", state.mode === "daily");
  $("#mode-wild").classList.toggle("selected", state.mode === "wild");
  $("#mode-sub").textContent = state.mode === "daily" ? "One shared word. A fresh bloom every day." : "No limits. No repeats. Chase your next spark.";
  $("#next-button").hidden = !(state.mode === "wild" && getGame().finished);
  $("#clock-strip").hidden = state.mode !== "daily";
  $("#board-title").textContent = state.mode === "daily" ? "THE DAILY BLOOM" : "THE WILD RUN";
  $("#footer-text").textContent = "Made for Brandi · " + (state.mode === "daily" ? "Daily Grove" : "Wild Run");
  updateCountdown();
}
function updateCountdown() {
  const target = Date.parse(state.date + "T00:00:00Z") + 86400000;
  let seconds = Math.max(0, Math.floor((target - Date.now()) / 1000));
  const hours = String(Math.floor(seconds / 3600)).padStart(2, "0");
  seconds %= 3600;
  const mins = String(Math.floor(seconds / 60)).padStart(2, "0");
  const secs = String(seconds % 60).padStart(2, "0");
  $("#next-countdown").textContent = hours + ":" + mins + ":" + secs;
}
function renderBoard() {
  const game = getGame();
  const board = $("#board");
  board.replaceChildren();
  for (let r = 0; r < MAX_ROWS; r++) {
    const row = document.createElement("div");
    row.className = "tile-row";
    row.setAttribute("role", "row");
    row.dataset.row = String(r);
    if (r === game.guesses.length && !game.finished) row.classList.add("row-active");
    if (state.revealing && r === state.revealRow) row.classList.add("row-revealing");
    const word = game.guesses[r] ?? (r === game.guesses.length ? game.current : "");
    const statuses = r < game.guesses.length ? scoreGuess(game.guesses[r], game.answer) : [];
    for (let c = 0; c < WORD_LENGTH; c++) {
      const tile = document.createElement("div");
      tile.className = "tile";
      tile.setAttribute("role", "gridcell");
      const letter = word[c] ?? "";
      tile.textContent = letter;
      const shown = r < game.guesses.length && (!state.revealing || r !== state.revealRow || c <= state.revealStep);
      if (shown) {
        tile.classList.add("tile-" + statuses[c], "tile-revealed");
        tile.setAttribute("aria-label", letter + ", " + statuses[c]);
        if (state.revealing && r === state.revealRow && c === state.revealStep) tile.classList.add("tile-flipping");
      } else {
        if (letter) tile.classList.add("tile-filled");
        tile.setAttribute("aria-label", letter ? letter + ", not evaluated" : "empty");
      }
      row.append(tile);
    }
    board.append(row);
  }
  board.setAttribute("aria-label", "Word grid, " + game.guesses.length + " of 6 guesses submitted");
  $("#progress-indicator").textContent = game.finished ? (game.won ? "SOLVED" : "ENDED") : String(game.guesses.length + 1).padStart(2, "0") + " / 06";
  $("#status-line").textContent = game.finished ? (game.won ? "THE GROVE IS GLOWING ✦" : "THE GROVE RESTS TONIGHT") : "THE GROVE AWAITS YOUR WORD";
  $("#status-line").classList.toggle("won", game.finished && game.won);
}
const KEY_ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];
function renderKeyboard() {
  const keyboard = $("#keyboard");
  const game = getGame();
  const guesses = state.revealing ? game.guesses.slice(0, state.revealRow) : game.guesses;
  const hints = keyboardHints(guesses, game.answer);
  keyboard.replaceChildren();
  KEY_ROWS.forEach((line, i) => {
    const row = document.createElement("div");
    row.className = "keyboard-row";
    if (i === 2) row.classList.add("keyboard-row-last");
    const keys = i === 2 ? ["ENTER", ...line, "BACK"] : [...line];
    for (const key of keys) {
      const b = document.createElement("button");
      b.className = "key" + (key.length > 1 ? " key-action" : "") + (hints[key] ? " key-" + hints[key] : "");
      b.type = "button";
      b.dataset.key = key;
      b.setAttribute("aria-label", key === "BACK" ? "Backspace" : key === "ENTER" ? "Submit guess" : key);
      b.innerHTML = key === "BACK" ? icon("back", 19) : key === "ENTER" ? '<span>ENTER</span>' : key;
      b.disabled = game.finished || state.revealing;
      b.addEventListener("click", () => onKey(key, true));
      row.append(b);
    }
    keyboard.append(row);
  });
}
function render() {
  updateHeader();
  renderBoard();
  renderKeyboard();
  $("#result-button").hidden = !getGame().finished;
}
function toast(message, type = "info") {
  const node = $("#toast");
  node.textContent = message;
  node.dataset.kind = type;
  node.classList.add("toast-visible");
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => node.classList.remove("toast-visible"), 2600);
}
function shake() {
  const row = document.querySelector(".row-active");
  if (row) {
    row.classList.remove("row-shake");
    void row.offsetWidth;
    row.classList.add("row-shake");
  }
  haptic([30, 25, 30]);
  sound("error");
}
function onKey(key, directInteraction = false) {
  if (state.modal || state.revealing) return;
  const game = getGame();
  if (game.finished) return;
  if (directInteraction) haptic(7);
  if (key === "BACK") {
    if (!game.current.length) return;
    game.current = game.current.slice(0, -1);
    sound("tap");
    saveGame(); renderBoard();
    return;
  }
  if (key === "ENTER") { submit(); return; }
  if (!/^[A-Z]$/.test(key) || game.current.length >= WORD_LENGTH) return;
  game.current += key;
  sound("tap");
  saveGame(); renderBoard();
}
function submit() {
  const game = getGame();
  const word = game.current;
  if (word.length < WORD_LENGTH) {
    toast("Just " + (WORD_LENGTH - word.length) + " more letter" + (WORD_LENGTH - word.length === 1 ? "" : "s") + " ✦", "error");
    shake(); return;
  }
  if (!validWord(word)) {
    toast("That word isn't in the grove.", "error");
    shake(); return;
  }
  state.revealing = true;
  state.revealRow = game.guesses.length;
  state.revealStep = -1;
  game.guesses.push(word);
  game.current = "";
  game.won = word === game.answer;
  game.finished = game.won || game.guesses.length >= MAX_ROWS;
  saveGame();
  render();
  let step = 0;
  const reveal = () => {
    if (!state.revealing) return;
    state.revealStep = step++;
    sound("flip");
    renderBoard();
    if (step < 5) {
      window.setTimeout(reveal, settings.intensity === "calm" ? 95 : 215);
    } else {
      window.setTimeout(() => {
        state.revealing = false;
        state.revealRow = -1;
        state.revealStep = -1;
        if (game.finished && !game.recorded) {
          const key = state.mode === "daily" ? KEYS.dailyStats : KEYS.wildStats;
          write(key, recordResult(getStats(), game, state.mode, new Date(state.date + "T00:00:00Z")));
          game.recorded = true;
          saveGame();
        }
        render();
        if (game.finished) {
          if (game.won) { sound("win"); celebrate(); }
          else sound("error");
          window.setTimeout(() => openModal("result"), game.won && settings.intensity === "spectacular" ? 1600 : 460);
        } else if (word === game.answer) {
          toast("Pure magic.", "success");
        }
      }, settings.intensity === "calm" ? 140 : 440);
    }
  };
  window.setTimeout(reveal, 170);
}
function celebrate() {
  if (settings.intensity === "calm" || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const container = $("#confetti");
  container.replaceChildren();
  const colors = ["#00bdb2", "#f08a45", "#c2f0c6", "#ffc377", "#72d8e4", "#faf3df"];
  for (let i = 0; i < 95; i++) {
    const el = document.createElement("i");
    el.className = "confetti-bit";
    el.style.setProperty("--x", Math.floor(Math.random() * 100) + "vw");
    el.style.setProperty("--dx", Math.floor(Math.random() * 240 - 120) + "px");
    el.style.setProperty("--rot", Math.floor(Math.random() * 980) - 490 + "deg");
    el.style.setProperty("--duration", (2.3 + Math.random() * 2.5).toFixed(2) + "s");
    el.style.setProperty("--delay", (Math.random() * .7).toFixed(2) + "s");
    el.style.backgroundColor = colors[i % colors.length];
    container.append(el);
  }
  window.setTimeout(() => container.replaceChildren(), 5700);
}
function modeChange(mode) {
  if (state.revealing || state.mode === mode) return;
  state.mode = mode;
  write(KEYS.mode, mode);
  haptic(10); sound("success");
  render();
  if (getGame().finished) toast("Tap the results icon to revisit your bloom.");
}
const modal = $("#modal");
$("#modal-close").addEventListener("click", () => modal.close());
modal.addEventListener("close", () => { state.modal = null; state.lastFocus?.focus?.(); });
modal.addEventListener("click", event => {
  const rect = modal.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) modal.close();
});
const miniTile = (letter, status) => '<span class="example-tile tile-' + status + '">' + letter + "</span>";
function openModal(kind) {
  if (state.revealing) return;
  state.lastFocus = document.activeElement;
  state.modal = kind;
  const game = getGame();
  const stats = getStats();
  const body = $("#modal-body");
  if (kind === "help") {
    body.innerHTML = '<div class="modal-eyebrow">THE FIELD GUIDE</div><h2>How to bloom.</h2><p>Find the secret five-letter word in six tries. Each guess must be a real word. The grove reveals what each color means.</p>' +
      '<div class="example">' + miniTile("B","correct") + miniTile("R","absent") + miniTile("A","absent") + miniTile("V","absent") + miniTile("E","absent") + '</div><p><b>Forest green</b> means the letter belongs exactly there.</p>' +
      '<div class="example">' + miniTile("G","absent") + miniTile("L","present") + miniTile("O","absent") + miniTile("W","absent") + miniTile("Y","absent") + '</div><p><b>Glowing teal</b> means the letter exists, just somewhere else.</p>' +
      '<div class="example">' + miniTile("S","absent") + miniTile("T","absent") + miniTile("O","absent") + miniTile("N","absent") + miniTile("E","absent") + '</div><p><b>Slate</b> means that letter isn’t in the answer (or its copies are already accounted for).</p>' +
      '<div class="modal-note">Daily Grove changes at midnight UTC. Wild Run never has a limit. Your progress stays in this browser.</div>';
  } else if (kind === "result") {
    const win = game.won;
    const intro = win ? "BRILLIANTLY DONE" : "THE GROVE WILL BLOOM AGAIN";
    const title = win ? "You’re absolute magic, Brandi." : "Tomorrow holds another spark.";
    const lead = win ? "You found <strong>" + game.answer + "</strong> in <strong>" + game.guesses.length + "</strong> " + (game.guesses.length === 1 ? "guess" : "guesses") + "." :
      "The word was <strong>" + game.answer + "</strong>. Every ending is a new beginning.";
    body.innerHTML = '<div class="result-emblem" aria-hidden="true">' + (win ? "✺" : "✧") + '</div><div class="modal-eyebrow">' + intro + '</div><h2 class="result-title">' + title + '</h2><p>' + lead + '</p>' +
      '<div class="result-stat-row"><span>ROUND</span><strong>' + (state.mode === "daily" ? "#" + puzzleNumber(new Date(state.date + "T00:00:00Z")) : "WILD RUN") + '</strong><span>RESULT</span><strong>' + (win ? game.guesses.length + "/6" : "X/6") + '</strong></div>' +
      (state.mode === "daily" ? '<p class="countdown-text">Next bloom in <strong id="dialog-countdown">' + $("#next-countdown").textContent + '</strong></p>' : "") +
      '<div class="modal-actions"><button class="primary-button" id="modal-share" type="button">' + icon("share",19) + ' Share the glow</button>' +
      (state.mode === "wild" ? '<button class="ghost-button" id="modal-next" type="button">' + icon("reload",18) + ' Next bloom</button>' : "") + '</div>';
  } else if (kind === "stats") {
    const p = stats.played ? Math.round(stats.wins * 100 / stats.played) : 0;
    const max = Math.max(1, ...stats.distribution);
    body.innerHTML = '<div class="modal-eyebrow">GROVE CHRONICLES · ' + (state.mode === "daily" ? "DAILY" : "WILD RUN") + '</div><h2>The numbers bloom.</h2><p>Every tiny victory counts.</p>' +
      '<div class="stat-grid"><div><strong>' + stats.played + '</strong><span>PLAYED</span></div><div><strong>' + p + '%</strong><span>WIN RATE</span></div><div><strong>' + stats.currentStreak + '</strong><span>STREAK</span></div><div><strong>' + stats.bestStreak + '</strong><span>BEST</span></div></div>' +
      '<h3>Guess distribution</h3><div class="distribution">' +
      stats.distribution.map((value,i) => '<div class="dist-row"><span>' + (i+1) + '</span><div class="dist-track"><div class="dist-fill" style="width:' + (value ? Math.max(11,100*value/max) : 0) + '%">' + value + '</div></div></div>').join("") + '</div>' +
      '<p class="modal-note">Daily Grove and Wild Run maintain separate records on this device.</p>';
  } else if (kind === "settings") {
    body.innerHTML = '<div class="modal-eyebrow">MAKE IT YOURS</div><h2>Tune the magic.</h2><p>A little more sparkle? Or a quieter grove?</p>' +
      '<div class="setting-row"><div><strong>Arcade sound</strong><small>Warm synthesized notes, never autoplay</small></div><input id="setting-sound" type="checkbox" role="switch"' + (settings.sound ? " checked" : "") + '></div>' +
      '<div class="setting-row"><div><strong>Haptic taps</strong><small>' + (hapticSupported ? "Available on this browser" : "This browser does not provide vibration") + '</small></div><input id="setting-haptics" type="checkbox" role="switch"' + (settings.haptics && hapticSupported ? " checked" : "") + (hapticSupported ? "" : " disabled") + '></div>' +
      '<div class="setting-row"><div><strong>Spectacular effects</strong><small>Fireflies, confetti, animated reveals</small></div><input id="setting-spectacular" type="checkbox" role="switch"' + (settings.intensity === "spectacular" ? " checked" : "") + '></div>' +
      '<div class="setting-row"><div><strong>High contrast</strong><small>More distinctive tile and key colors</small></div><input id="setting-contrast" type="checkbox" role="switch"' + (settings.contrast ? " checked" : "") + '></div>' +
      '<p class="modal-note">Reduced Motion device settings are respected automatically. On iPhone browsers, web vibration is unavailable; sound and animation provide tactile-style feedback.</p>';
  }
  $("#modal-close").innerHTML = icon("close");
  $("#modal-close").setAttribute("aria-label", "Close dialog");
  if (!modal.open) modal.showModal();
  $("#modal-close").focus();
  if (kind === "result") {
    $("#modal-share")?.addEventListener("click", share);
    $("#modal-next")?.addEventListener("click", () => { modal.close(); nextWild(); });
  }
  if (kind === "settings") {
    const mapping = { "setting-sound": () => {settings.sound = $("#setting-sound").checked; if(settings.sound) sound("success");},
      "setting-haptics": () => {settings.haptics = $("#setting-haptics").checked; haptic(18);},
      "setting-spectacular": () => {settings.intensity = $("#setting-spectacular").checked ? "spectacular" : "calm";},
      "setting-contrast": () => {settings.contrast = $("#setting-contrast").checked;} };
    Object.entries(mapping).forEach(([id, fn]) => $("#" + id).addEventListener("change", () => { fn(); write(KEYS.settings, settings); applySettings(); }));
  }
}
async function share() {
  const game = getGame();
  if (!game.finished) return;
  const message = shareText(game, state.mode, new Date(state.date + "T00:00:00Z"), window.location.origin + window.location.pathname);
  try {
    if (navigator.share) {
      await navigator.share({ text: message });
      return;
    }
  } catch (error) {
    if (error?.name === "AbortError") return;
  }
  try {
    await navigator.clipboard.writeText(message);
    toast("Your glow is copied to clipboard.", "success");
    if (modal.open) modal.close();
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = message;
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    toast(copied ? "Copied to clipboard." : "Couldn't copy — try sharing from your browser.");
  }
}
function nextWild() {
  if (state.mode !== "wild" || !state.wild.finished) return;
  state.wild = newWild();
  saveGame(); render();
  toast("A new bloom has begun.", "success");
  haptic(12); sound("success");
}
function syncDay() {
  const today = utcKey();
  if (today !== state.date) {
    state.date = today;
    state.daily = dailyState(today);
    render();
    toast("A new daily bloom has arrived.", "success");
  } else updateCountdown();
  if (state.modal === "result" && $("#dialog-countdown")) $("#dialog-countdown").textContent = $("#next-countdown").textContent;
}
document.addEventListener("keydown", event => {
  if (state.modal) return;
  if (event.ctrlKey || event.altKey || event.metaKey || event.repeat || event.isComposing) return;
  const target = event.target;
  if (target instanceof HTMLElement && (target.isContentEditable || ["INPUT","TEXTAREA","SELECT"].includes(target.tagName))) return;
  // Enter activates the focused button natively. Avoid submitting a guess twice.
  if (event.key === "Enter" && target instanceof HTMLElement &&
      target.closest('button, a[href], summary, [role="button"], [role="link"], [role="switch"]')) return;
  const key = event.key === "Backspace" ? "BACK" : event.key === "Enter" ? "ENTER" : event.key.toUpperCase();
  if (key === "BACK" || key === "ENTER" || /^[A-Z]$/.test(key)) {
    if (key === "BACK") event.preventDefault();
    onKey(key, true);
  }
});
$("#mode-daily").addEventListener("click", () => modeChange("daily"));
$("#mode-wild").addEventListener("click", () => modeChange("wild"));
$("#help-button").addEventListener("click", () => openModal("help"));
$("#stats-button").addEventListener("click", () => openModal("stats"));
$("#settings-button").addEventListener("click", () => openModal("settings"));
$("#next-button").addEventListener("click", nextWild);
$("#result-button").addEventListener("click", () => openModal("result"));
const fireflyHost = $("#fireflies");
for (let i = 0; i < 24; i++) {
  const fly = document.createElement("i");
  fly.className = "firefly";
  fly.style.setProperty("--left", (3 + Math.random() * 94) + "%");
  fly.style.setProperty("--top", (3 + Math.random() * 94) + "%");
  fly.style.setProperty("--lag", (Math.random() * -12) + "s");
  fly.style.setProperty("--speed", (6 + Math.random() * 12) + "s");
  fly.style.setProperty("--glow", i % 3 === 0 ? "#dc834a" : "#24b8a7");
  fireflyHost.append(fly);
}
const settleCompletedRound = mode => {
  const game = state[mode];
  if (!game.finished || game.recorded) return;
  const statsKey = mode === "daily" ? KEYS.dailyStats : KEYS.wildStats;
  write(statsKey, recordResult(normalizeStats(read(statsKey, initialStats())), game, mode, new Date(state.date + "T00:00:00Z")));
  game.recorded = true;
  write(mode === "daily" ? game.id : KEYS.wild, game);
};
settleCompletedRound("daily");
settleCompletedRound("wild");
render();
window.setInterval(syncDay, 1000);
if (!read(KEYS.seen, false)) {
  write(KEYS.seen, true);
  window.setTimeout(() => openModal("help"), 440);
}
if ("serviceWorker" in navigator && location.protocol === "https:") {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}
