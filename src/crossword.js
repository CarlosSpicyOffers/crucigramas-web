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


export function generateCrossword(words) {

  // Start with the longest word: it anchors the puzzle and makes it easier for the rest to cross it.
  const pending = words.slice().sort((a, b) => b.word.length - a.word.length);

  const grid = {};
  const placed = [];

  const first = pending.shift();
  placeInGrid(grid, first.word, 0, 0, "H");
  placed.push({ word: first.word, definition: first.definition, row: 0, col: 0, direction: "H" });

  // Try the rest one by one. If a word doesn't fit yet, we retry it later, since it might
  // cross with another word that hasn't been placed yet.
  let attemptsWithoutSuccess = 0;

  while (pending.length > 0 && attemptsWithoutSuccess < pending.length) {
    const candidate = pending.shift();
    const position = findPosition(grid, candidate.word);

    if (position) {
      placeInGrid(grid, candidate.word, position.row, position.col, position.direction);
      placed.push({ word: candidate.word, definition: candidate.definition, row: position.row, col: position.col, direction: position.direction });
      attemptsWithoutSuccess = 0;
    } else {
      pending.push(candidate);
      attemptsWithoutSuccess++;
    }
  }

  return { placed, discarded: pending };

}


function findPosition(grid, word) {

  for (const key in grid) {
    const cell = grid[key];
    const parts = key.split("_");
    const cellRow = parseInt(parts[0], 10);
    const cellCol = parseInt(parts[1], 10);

    for (let i = 0; i < word.length; i++) {
      if (word.charAt(i) !== cell.letter) continue;

      // The cell already holds a horizontal word: try crossing it vertically.
      if (!cell.v) {
        const positionV = { row: cellRow - i, col: cellCol, direction: "V" };
        if (fitsInGrid(grid, word, positionV)) return positionV;
      }
      // The cell already holds a vertical word: try crossing it horizontally.
      if (!cell.h) {
        const positionH = { row: cellRow, col: cellCol - i, direction: "H" };
        if (fitsInGrid(grid, word, positionH)) return positionH;
      }
    }
  }

  return null;

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
