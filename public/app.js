import { generate, PEERS, ROW, COL, BOX, DIFFICULTIES } from './sudoku.js';

const STORAGE_KEY = 'sudoku-state-v1';
const $ = (sel) => document.querySelector(sel);

const boardEl = $('#board');
const padEl = $('#pad');
const timerEl = $('#timer');
const mistakesEl = $('#mistakes');
const diffEl = $('#difficulty-label');
const notesBtn = $('#notes');
const notesStateEl = $('#notes-state');
const pausedOverlay = $('#paused-overlay');
const newDialog = $('#new-dialog');
const winDialog = $('#win-dialog');
const toastEl = $('#toast');

let state = null;
let selected = -1;
let notesMode = false;
let paused = false;

const cells = [];
const padButtons = [];

// ---------- Persistence ----------

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* storage unavailable */ }
}

// Ask the browser not to evict our storage (e.g. under disk pressure, or
// Safari's 7-day limit). Installed PWAs are usually granted this silently.
async function requestPersistentStorage() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch { /* unsupported */ }
}

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (s && Array.isArray(s.puzzle) && s.puzzle.length === 81) return s;
  } catch { /* ignore */ }
  return null;
}

// ---------- Game lifecycle ----------

function newGame(difficulty) {
  toast('Generating puzzle…');
  // Let the toast paint before the (synchronous) generator runs.
  setTimeout(() => {
    const { puzzle, solution } = generate(difficulty);
    state = {
      difficulty,
      puzzle,
      solution,
      values: puzzle.slice(),
      notes: new Array(81).fill(0),
      mistakes: 0,
      hints: 0,
      elapsed: 0,
      history: [],
      solved: false,
    };
    selected = -1;
    setPaused(false);
    save();
    render();
    hideToast();
  }, 30);
}

function restart() {
  if (!state) return;
  Object.assign(state, {
    values: state.puzzle.slice(),
    notes: new Array(81).fill(0),
    mistakes: 0,
    hints: 0,
    elapsed: 0,
    history: [],
    solved: false,
  });
  selected = -1;
  setPaused(false);
  save();
  render();
}

function pushHistory() {
  state.history.push({ values: state.values.slice(), notes: state.notes.slice() });
  if (state.history.length > 200) state.history.shift();
}

function undo() {
  if (!state || state.solved || paused) return;
  const prev = state.history.pop();
  if (!prev) return;
  state.values = prev.values;
  state.notes = prev.notes;
  save();
  render();
}

function isEditable(i) {
  return i >= 0 && state && !state.solved && !paused && state.puzzle[i] === 0;
}

function input(digit) {
  if (!isEditable(selected)) return;
  const i = selected;

  if (notesMode) {
    if (state.values[i]) return;
    pushHistory();
    state.notes[i] ^= 1 << digit;
  } else {
    if (state.values[i] === digit) return;
    pushHistory();
    state.values[i] = digit;
    state.notes[i] = 0;
    if (digit !== state.solution[i]) {
      state.mistakes++;
      vibrate(60);
    } else {
      // Clear this digit from peers' notes.
      for (const p of PEERS[i]) state.notes[p] &= ~(1 << digit);
    }
  }
  save();
  render();
  checkWin();
}

function erase() {
  if (!isEditable(selected)) return;
  const i = selected;
  if (!state.values[i] && !state.notes[i]) return;
  pushHistory();
  state.values[i] = 0;
  state.notes[i] = 0;
  save();
  render();
}

function hint() {
  if (!state || state.solved || paused) return;
  let i = selected;
  if (!isEditable(i) || state.values[i] === state.solution[i]) {
    // Pick a random cell that's empty or wrong.
    const candidates = [];
    for (let k = 0; k < 81; k++) if (state.values[k] !== state.solution[k]) candidates.push(k);
    if (!candidates.length) return;
    i = candidates[Math.floor(Math.random() * candidates.length)];
  }
  pushHistory();
  const d = state.solution[i];
  state.values[i] = d;
  state.notes[i] = 0;
  for (const p of PEERS[i]) state.notes[p] &= ~(1 << d);
  state.hints++;
  selected = i;
  save();
  render();
  cells[i].classList.remove('hinted');
  void cells[i].offsetWidth;
  cells[i].classList.add('hinted');
  checkWin();
}

function checkWin() {
  if (state.values.every((v, i) => v === state.solution[i])) {
    state.solved = true;
    selected = -1;
    save();
    render();
    const extras = [];
    if (state.mistakes) extras.push(`${state.mistakes} mistake${state.mistakes === 1 ? '' : 's'}`);
    if (state.hints) extras.push(`${state.hints} hint${state.hints === 1 ? '' : 's'}`);
    $('#win-text').textContent =
      `${DIFFICULTIES[state.difficulty].label} puzzle in ${formatTime(state.elapsed)}` +
      (extras.length ? ` with ${extras.join(' and ')}.` : ' — flawless!');
    vibrate([40, 60, 40]);
    setTimeout(() => winDialog.showModal(), 300);
  }
}

// ---------- Timer & pause ----------

function tick() {
  if (state && !state.solved && !paused && document.visibilityState === 'visible') {
    state.elapsed++;
    timerEl.textContent = formatTime(state.elapsed);
    if (state.elapsed % 5 === 0) save();
  }
}

function setPaused(p) {
  paused = p && state && !state.solved;
  pausedOverlay.hidden = !paused;
  $('#pause').textContent = paused ? '▶' : '⏸';
  $('#pause').setAttribute('aria-label', paused ? 'Resume' : 'Pause');
}

function formatTime(sec) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

// ---------- Rendering ----------

function buildBoard() {
  for (let i = 0; i < 81; i++) {
    const c = document.createElement('button');
    c.className = 'cell';
    c.type = 'button';
    c.setAttribute('role', 'gridcell');
    c.addEventListener('click', () => select(i));
    boardEl.appendChild(c);
    cells.push(c);
  }
  for (let d = 1; d <= 9; d++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = `${d}<span class="left"></span>`;
    b.setAttribute('aria-label', `Enter ${d}`);
    b.addEventListener('click', () => input(d));
    padEl.appendChild(b);
    padButtons.push(b);
  }
}

function select(i) {
  if (paused) return;
  selected = i;
  render();
}

function render() {
  if (!state) return;
  const { values, notes, puzzle, solution } = state;
  const selVal = selected >= 0 ? values[selected] : 0;

  // Find cells that clash with a peer holding the same value.
  const conflict = new Array(81).fill(false);
  for (let i = 0; i < 81; i++) {
    if (!values[i]) continue;
    for (const p of PEERS[i]) if (values[p] === values[i]) { conflict[i] = true; break; }
  }

  for (let i = 0; i < 81; i++) {
    const c = cells[i];
    const v = values[i];
    const given = puzzle[i] !== 0;

    c.classList.toggle('given', given);
    c.classList.toggle('selected', i === selected);
    c.classList.toggle('peer', selected >= 0 && i !== selected &&
      (ROW[i] === ROW[selected] || COL[i] === COL[selected] || BOX[i] === BOX[selected]));
    c.classList.toggle('same', !!selVal && i !== selected && v === selVal);
    c.classList.toggle('error', !given && !!v && v !== solution[i]);
    c.classList.toggle('conflict', conflict[i] && !given);

    if (v) {
      c.textContent = v;
      c.setAttribute('aria-label', `Row ${ROW[i] + 1} column ${COL[i] + 1}: ${v}`);
    } else if (notes[i]) {
      let html = '<div class="notes">';
      for (let d = 1; d <= 9; d++) {
        const on = notes[i] & (1 << d);
        html += `<span class="${on && d === selVal ? 'hl' : ''}">${on ? d : ''}</span>`;
      }
      c.innerHTML = html + '</div>';
      c.setAttribute('aria-label', `Row ${ROW[i] + 1} column ${COL[i] + 1}: notes`);
    } else {
      c.textContent = '';
      c.setAttribute('aria-label', `Row ${ROW[i] + 1} column ${COL[i] + 1}: empty`);
    }
  }

  // Remaining count per digit (only correct placements count).
  const placed = new Array(10).fill(0);
  for (let i = 0; i < 81; i++) if (values[i] && values[i] === solution[i]) placed[values[i]]++;
  padButtons.forEach((b, k) => {
    const left = 9 - placed[k + 1];
    b.querySelector('.left').textContent = left;
    b.classList.toggle('done', left === 0);
  });

  timerEl.textContent = formatTime(state.elapsed);
  mistakesEl.textContent = `✗ ${state.mistakes}`;
  diffEl.textContent = DIFFICULTIES[state.difficulty]?.label ?? '';
  notesBtn.setAttribute('aria-pressed', String(notesMode));
  notesStateEl.textContent = notesMode ? 'on' : 'off';
  $('#undo').disabled = !state.history.length;
}

// ---------- UI helpers ----------

let toastTimer = null;
function toast(msg, ms = 0) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  if (ms) toastTimer = setTimeout(hideToast, ms);
}
function hideToast() { toastEl.classList.remove('show'); }

function vibrate(pattern) {
  if (navigator.vibrate) try { navigator.vibrate(pattern); } catch { /* ignore */ }
}

function toggleNotes() {
  notesMode = !notesMode;
  render();
}

// ---------- Events ----------

function bindEvents() {
  $('#undo').addEventListener('click', undo);
  $('#erase').addEventListener('click', erase);
  $('#hint').addEventListener('click', hint);
  notesBtn.addEventListener('click', toggleNotes);
  $('#pause').addEventListener('click', () => setPaused(!paused));
  $('#resume').addEventListener('click', () => setPaused(false));
  $('#restart').addEventListener('click', restart);
  $('#new-game').addEventListener('click', () => newDialog.showModal());

  newDialog.addEventListener('close', () => {
    const v = newDialog.returnValue;
    if (DIFFICULTIES[v]) newGame(v);
  });
  winDialog.addEventListener('close', () => {
    if (winDialog.returnValue === 'new') newDialog.showModal();
  });

  document.addEventListener('keydown', (e) => {
    if (newDialog.open || winDialog.open) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (/^[1-9]$/.test(e.key)) { input(Number(e.key)); return; }
    switch (e.key) {
      case 'Backspace': case 'Delete': case '0': erase(); break;
      case 'n': case 'N': toggleNotes(); break;
      case 'h': case 'H': hint(); break;
      case 'p': case 'P': case ' ': e.preventDefault(); setPaused(!paused); break;
      case 'ArrowUp': case 'ArrowDown': case 'ArrowLeft': case 'ArrowRight': {
        e.preventDefault();
        if (paused) return;
        if (selected < 0) { select(40); return; }
        let r = ROW[selected], c = COL[selected];
        if (e.key === 'ArrowUp') r = (r + 8) % 9;
        if (e.key === 'ArrowDown') r = (r + 1) % 9;
        if (e.key === 'ArrowLeft') c = (c + 8) % 9;
        if (e.key === 'ArrowRight') c = (c + 1) % 9;
        select(r * 9 + c);
        break;
      }
      case 'Escape': selected = -1; render(); break;
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && state) save();
  });

  // Install prompt (Chromium browsers).
  let deferredPrompt = null;
  const installBtn = $('#install');
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn.hidden = false;
  });
  installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    installBtn.hidden = true;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
  });
  window.addEventListener('appinstalled', () => { installBtn.hidden = true; });
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            toast('Update available — reload to apply', 4000);
          }
        });
      });
    }).catch((err) => console.warn('Service worker registration failed:', err));
  });
}

// ---------- Boot ----------

buildBoard();
bindEvents();
registerServiceWorker();
requestPersistentStorage();

state = load();
if (state) {
  render();
} else {
  newGame('easy');
}
setInterval(tick, 1000);
