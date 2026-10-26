// Crossword grid generation engine.

export function selectRandomWords(words, quantity) {

  // Compound words (with a space) don't fit well in the grid, so we drop them.
  const selection = words.filter((w) => w.word.indexOf(" ") === -1);

  // Shuffle (Fisher-Yates).
  for (let i = selection.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [selection[i], selection[j]] = [selection[j], selection[i]];
  }

  const limit = Math.min(quantity, selection.length);
  return selection.slice(0, limit);

}


// Number of layouts tried per crossword; the best one wins.
const ATTEMPTS = 60;

export function generateCrossword(words) {

  // Every attempt builds a different layout (word order is jittered); keep the best one:
  // first the one that places the most words, then the most crossings, then the most compact.
  let best = null;

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const result = buildLayout(words);
    if (!best || result.score > best.score) best = result;
  }

  return { placed: best.placed, discarded: best.discarded };

}


function buildLayout(words) {

  // Longest words first (with a little randomness): the first one anchors the puzzle.
  const pending = words
    .map((w) => ({ w, key: w.word.length + Math.random() * 3 }))
    .sort((a, b) => b.key - a.key)
    .map((x) => x.w);

  const grid = {};
  const placed = [];

  const first = pending.shift();
  placeInGrid(grid, first.word, 0, 0, "H");
  placed.push({ word: first.word, definition: first.definition, row: 0, col: 0, direction: "H" });

  // Each round, look at every pending word in every spot where it fits and take the placement
  // that crosses the most letters already on the grid (ties: keep the grid compact, then random).
  while (pending.length > 0) {
    const bounds = gridBounds(placed);
    let best = null;

    pending.forEach((candidate, index) => {
      for (const position of candidatePositions(grid, candidate.word)) {
        const area = areaAfter(bounds, candidate.word, position);
        const better = !best
          || position.crossings > best.position.crossings
          || (position.crossings === best.position.crossings && area < best.area)
          || (position.crossings === best.position.crossings && area === best.area && Math.random() < 0.5);
        if (better) best = { index, position, area };
      }
    });

    // Nothing left fits (no shared letter, or no free room).
    if (!best) break;

    const [chosen] = pending.splice(best.index, 1);
    const { row, col, direction } = best.position;
    placeInGrid(grid, chosen.word, row, col, direction);
    placed.push({ word: chosen.word, definition: chosen.definition, row, col, direction });
  }

  const crossings = Object.values(grid).filter((cell) => cell.h && cell.v).length;
  const b = gridBounds(placed);
  const area = (b.maxRow - b.minRow + 1) * (b.maxCol - b.minCol + 1);

  return { placed, discarded: pending, score: placed.length * 10000 + crossings * 100 - area };

}


// Every valid position for the word that crosses at least one letter already on the grid,
// with the number of letters it would share with words already there.
function candidatePositions(grid, word) {

  const positions = [];
  const seen = new Set();

  for (const key in grid) {
    const cell = grid[key];
    const parts = key.split("_");
    const cellRow = parseInt(parts[0], 10);
    const cellCol = parseInt(parts[1], 10);

    for (let i = 0; i < word.length; i++) {
      if (word.charAt(i) !== cell.letter) continue;

      // The cell already holds a horizontal word: try crossing it vertically.
      if (!cell.v) tryPosition({ row: cellRow - i, col: cellCol, direction: "V" });
      // The cell already holds a vertical word: try crossing it horizontally.
      if (!cell.h) tryPosition({ row: cellRow, col: cellCol - i, direction: "H" });
    }
  }

  function tryPosition(position) {
    const id = position.row + "_" + position.col + "_" + position.direction;
    if (seen.has(id)) return;
    seen.add(id);

    if (!fitsInGrid(grid, word, position)) return;

    let crossings = 0;
    for (let i = 0; i < word.length; i++) {
      const r = position.direction === "H" ? position.row : position.row + i;
      const c = position.direction === "H" ? position.col + i : position.col;
      if (grid[r + "_" + c]) crossings++;
    }
    positions.push({ ...position, crossings });
  }

  return positions;

}


// Bounding-box area of the grid if the word were placed at the given position.
function areaAfter(bounds, word, position) {

  const endRow = position.direction === "V" ? position.row + word.length - 1 : position.row;
  const endCol = position.direction === "H" ? position.col + word.length - 1 : position.col;

  const rows = Math.max(bounds.maxRow, endRow) - Math.min(bounds.minRow, position.row) + 1;
  const cols = Math.max(bounds.maxCol, endCol) - Math.min(bounds.minCol, position.col) + 1;

  return rows * cols;

}


function fitsInGrid(grid, word, position) {

  const direction = position.direction;

  // The cell right before and right after the word must be empty, so it doesn't end up
  // glued to another word on the same line without a real crossing.
  const before = direction === "H" ? (position.row + "_" + (position.col - 1)) : ((position.row - 1) + "_" + position.col);
  const after = direction === "H" ? (position.row + "_" + (position.col + word.length)) : ((position.row + word.length) + "_" + position.col);
  if (grid[before] || grid[after]) return false;

  for (let i = 0; i < word.length; i++) {
    const r = direction === "H" ? position.row : position.row + i;
    const c = direction === "H" ? position.col + i : position.col;
    const key = r + "_" + c;
    const cell = grid[key];

    if (cell) {
      // Cell already occupied: must be the same letter and not already used in this same direction.
      if (cell.letter !== word.charAt(i)) return false;
      if (direction === "H" && cell.h) return false;
      if (direction === "V" && cell.v) return false;
    } else {
      // Empty cell: the perpendicular neighbours must be free too, so it doesn't touch
      // another word without a real crossing.
      const side1 = direction === "H" ? ((r - 1) + "_" + c) : (r + "_" + (c - 1));
      const side2 = direction === "H" ? ((r + 1) + "_" + c) : (r + "_" + (c + 1));
      if (grid[side1] || grid[side2]) return false;
    }
  }

  return true;

}


function placeInGrid(grid, word, row, col, direction) {

  for (let i = 0; i < word.length; i++) {
    const r = direction === "H" ? row : row + i;
    const c = direction === "H" ? col + i : col;
    const key = r + "_" + c;
    const cell = grid[key] || { letter: "", h: false, v: false };

    cell.letter = word.charAt(i);
    if (direction === "H") cell.h = true; else cell.v = true;

    grid[key] = cell;
  }

}


export function gridBounds(placed) {

  let minRow = 0, maxRow = 0, minCol = 0, maxCol = 0;

  for (const p of placed) {
    const endRow = p.direction === "V" ? p.row + p.word.length - 1 : p.row;
    const endCol = p.direction === "H" ? p.col + p.word.length - 1 : p.col;
    minRow = Math.min(minRow, p.row);
    maxRow = Math.max(maxRow, endRow);
    minCol = Math.min(minCol, p.col);
    maxCol = Math.max(maxCol, endCol);
  }

  return { minRow, maxRow, minCol, maxCol };

}


export function assignNumbers(placed) {

  // Number the cells where a word starts, in reading order (top to bottom, left to right),
  // just like in a real crossword.
  const positions = [];
  const seen = {};

  placed.forEach((p) => {
    const key = p.row + "_" + p.col;
    if (!seen[key]) {
      seen[key] = true;
      positions.push({ row: p.row, col: p.col });
    }
  });

  positions.sort((a, b) => a.row - b.row || a.col - b.col);

  const numbers = {};
  positions.forEach((pos, index) => {
    numbers[pos.row + "_" + pos.col] = index + 1;
  });

  return numbers;

}


export function letterAt(placed, r, c) {

  for (const p of placed) {
    if (p.direction === "H" && r === p.row && c >= p.col && c < p.col + p.word.length) {
      return p.word.charAt(c - p.col);
    }
    if (p.direction === "V" && c === p.col && r >= p.row && r < p.row + p.word.length) {
      return p.word.charAt(r - p.row);
    }
  }

  return null;

}


// Returns the horizontal and/or vertical word passing through a cell, along with the
// letter index within that word. Used to auto-advance focus while typing.
export function wordsAtCell(placed, r, c) {

  const result = { H: null, V: null };

  for (const p of placed) {
    if (p.direction === "H" && r === p.row && c >= p.col && c < p.col + p.word.length) {
      result.H = { ...p, index: c - p.col };
    }
    if (p.direction === "V" && c === p.col && r >= p.row && r < p.row + p.word.length) {
      result.V = { ...p, index: r - p.row };
    }
  }

  return result;

}
