// Sudoku engine: puzzle generation and solving.
// Grids are flat arrays of 81 numbers, 0 = empty.

const ALL = 0x3fe; // bits 1..9

const ROW = [], COL = [], BOX = [], PEERS = [];
for (let i = 0; i < 81; i++) {
  ROW[i] = Math.floor(i / 9);
  COL[i] = i % 9;
  BOX[i] = Math.floor(ROW[i] / 3) * 3 + Math.floor(COL[i] / 3);
}
for (let i = 0; i < 81; i++) {
  const p = [];
  for (let j = 0; j < 81; j++) {
    if (j !== i && (ROW[i] === ROW[j] || COL[i] === COL[j] || BOX[i] === BOX[j])) p.push(j);
  }
  PEERS[i] = p;
}
export { ROW, COL, BOX, PEERS };

function popcount(n) {
  let c = 0;
  while (n) { n &= n - 1; c++; }
  return c;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Counts solutions up to `limit`. If `out` is given, the first solution is written to it.
export function countSolutions(grid, limit = 2, out = null, randomize = false) {
  const g = grid.slice();
  const rows = new Array(9).fill(0), cols = new Array(9).fill(0), boxes = new Array(9).fill(0);
  for (let i = 0; i < 81; i++) {
    const v = g[i];
    if (!v) continue;
    const b = 1 << v;
    if ((rows[ROW[i]] | cols[COL[i]] | boxes[BOX[i]]) & b) return 0; // invalid grid
    rows[ROW[i]] |= b; cols[COL[i]] |= b; boxes[BOX[i]] |= b;
  }
  let count = 0;

  function search() {
    // Pick the empty cell with the fewest candidates.
    let best = -1, bestMask = 0, bestCount = 10;
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      const mask = ALL & ~(rows[ROW[i]] | cols[COL[i]] | boxes[BOX[i]]);
      const c = popcount(mask);
      if (c < bestCount) {
        best = i; bestMask = mask; bestCount = c;
        if (c <= 1) break;
      }
    }
    if (best === -1) {
      if (count === 0 && out) for (let i = 0; i < 81; i++) out[i] = g[i];
      count++;
      return count >= limit;
    }
    if (bestCount === 0) return false;
    let digits = [];
    for (let d = 1; d <= 9; d++) if (bestMask & (1 << d)) digits.push(d);
    if (randomize) shuffle(digits);
    const r = ROW[best], c = COL[best], bx = BOX[best];
    for (const d of digits) {
      const b = 1 << d;
      g[best] = d; rows[r] |= b; cols[c] |= b; boxes[bx] |= b;
      if (search()) return true;
      g[best] = 0; rows[r] &= ~b; cols[c] &= ~b; boxes[bx] &= ~b;
    }
    return false;
  }

  search();
  return count;
}

export function solve(grid) {
  const out = new Array(81).fill(0);
  return countSolutions(grid, 1, out) ? out : null;
}

function randomSolvedGrid() {
  const out = new Array(81).fill(0);
  countSolutions(new Array(81).fill(0), 1, out, true);
  return out;
}

export const DIFFICULTIES = {
  easy:   { label: 'Easy',   clues: 40 },
  medium: { label: 'Medium', clues: 32 },
  hard:   { label: 'Hard',   clues: 27 },
  expert: { label: 'Expert', clues: 23 },
};

// Generates a puzzle with a unique solution. Returns { puzzle, solution }.
export function generate(difficulty = 'medium') {
  const target = (DIFFICULTIES[difficulty] || DIFFICULTIES.medium).clues;
  let best = null;
  // A few attempts for the harder levels, keeping the one closest to the target.
  for (let attempt = 0; attempt < 20; attempt++) {
    const solution = randomSolvedGrid();
    const puzzle = solution.slice();
    let clues = 81;
    // Remove cells in symmetric pairs where possible.
    for (const i of shuffle([...Array(41).keys()])) {
      if (clues <= target) break;
      const j = 80 - i;
      const pair = i === j ? [i] : [i, j];
      const saved = pair.map(k => puzzle[k]);
      pair.forEach(k => { puzzle[k] = 0; });
      if (countSolutions(puzzle, 2) !== 1) {
        pair.forEach((k, n) => { puzzle[k] = saved[n]; });
      } else {
        clues -= pair.length;
      }
    }
    // Then try single cells to get closer to the target.
    for (const i of shuffle([...Array(81).keys()])) {
      if (clues <= target) break;
      if (!puzzle[i]) continue;
      const saved = puzzle[i];
      puzzle[i] = 0;
      if (countSolutions(puzzle, 2) !== 1) puzzle[i] = saved;
      else clues--;
    }
    if (!best || clues < best.clues) best = { puzzle, solution, clues };
    if (clues <= target) break;
  }
  return { puzzle: best.puzzle, solution: best.solution };
}
