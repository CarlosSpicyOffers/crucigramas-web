import "./style.css";
import wordsData from "./data/words.json";
import {
  selectRandomWords,
  generateCrossword,
  gridBounds,
  assignNumbers,
  letterAt,
  wordsAtCell,
} from "./crossword.js";

const DEFAULT_WORD_COUNT = 12;
const MIN_WORD_COUNT = 8;
const MAX_WORD_COUNT = 20;

const availableWordCount = wordsData.filter((w) => w.word.indexOf(" ") === -1).length;
const minCount = Math.min(MIN_WORD_COUNT, availableWordCount);
const maxCount = Math.min(MAX_WORD_COUNT, availableWordCount);

const categories = getCategories(wordsData);

const app = document.querySelector("#app");

app.innerHTML = `
  <div class="page">
    <h1>Crossword</h1>
    <div class="toolbar">
      <button id="btn-new">New crossword</button>
      <button id="btn-check">Check answers</button>
      <span id="result" class="result"></span>
    </div>
    <div class="board">
      <div id="grid" class="grid"></div>
      <ul id="clues" class="clues"></ul>
    </div>
  </div>

  <div id="modal-overlay" class="modal-overlay">
    <div class="modal">
      <h3>New crossword</h3>

      <label for="word-count">Number of words</label>
      <select id="word-count"></select>

      <h4>Books &amp; Topics</h4>
      <div class="topic-buttons">
        <button type="button" id="btn-select-all-topics">Select all topics</button>
        <button type="button" id="btn-deselect-all-topics">Deselect all topics</button>
      </div>
      <div id="books-container" class="books-container"></div>
      <p id="modal-warning" class="modal-warning"></p>

      <div class="modal-actions">
        <button id="btn-cancel" type="button">Cancel</button>
        <button id="btn-generate" type="button">Generate</button>
      </div>
    </div>
  </div>
`;

const gridEl = document.querySelector("#grid");
const cluesEl = document.querySelector("#clues");
const resultEl = document.querySelector("#result");
const modalOverlay = document.querySelector("#modal-overlay");
const wordCountSelect = document.querySelector("#word-count");
const booksContainer = document.querySelector("#books-container");
const modalWarning = document.querySelector("#modal-warning");

let currentPuzzle = null;
let currentBounds = null;
let activeDirection = "H";

populateWordCountOptions();
renderCategoryCheckboxes();

function getCategories(words) {
  const books = [];
  const seenBooks = {};
  const topics = [];
  const seenTopics = {};

  words.forEach((w) => {
    if (!seenBooks[w.book]) {
      seenBooks[w.book] = true;
      books.push(w.book);
    }
    const topicKey = w.book + "||" + w.topic;
    if (!seenTopics[topicKey]) {
      seenTopics[topicKey] = true;
      topics.push({ book: w.book, topic: w.topic });
    }
  });

  return { books, topics };
}

function populateWordCountOptions() {
  wordCountSelect.innerHTML = "";
  for (let n = minCount; n <= maxCount; n++) {
    const option = document.createElement("option");
    option.value = n;
    option.textContent = n;
    if (n === DEFAULT_WORD_COUNT) option.selected = true;
    wordCountSelect.appendChild(option);
  }
}

function renderCategoryCheckboxes() {
  booksContainer.innerHTML = "";

  categories.books.forEach((book) => {
    const group = document.createElement("div");
    group.className = "book-group";

    const bookLabel = document.createElement("label");
    bookLabel.className = "book-label";
    const bookCheckbox = document.createElement("input");
    bookCheckbox.type = "checkbox";
    bookCheckbox.className = "book-checkbox";
    bookCheckbox.dataset.book = book;
    bookCheckbox.checked = true;
    bookCheckbox.addEventListener("change", () => {
      booksContainer.querySelectorAll(`.topic-checkbox[data-book="${cssEscape(book)}"]`).forEach((cb) => {
        cb.checked = bookCheckbox.checked;
      });
    });
    bookLabel.appendChild(bookCheckbox);
    bookLabel.appendChild(document.createTextNode(" " + book));
    group.appendChild(bookLabel);

    const topicsContainer = document.createElement("div");
    topicsContainer.className = "topics-nested";

    categories.topics
      .filter((t) => t.book === book)
      .forEach((t) => {
        const row = document.createElement("div");
        row.className = "topic-row";

        const topicLabel = document.createElement("label");
        const topicCheckbox = document.createElement("input");
        topicCheckbox.type = "checkbox";
        topicCheckbox.className = "topic-checkbox";
        topicCheckbox.dataset.book = book;
        topicCheckbox.dataset.topic = t.topic;
        topicCheckbox.checked = true;
        topicCheckbox.addEventListener("change", () => {
          const topicCheckboxes = booksContainer.querySelectorAll(`.topic-checkbox[data-book="${cssEscape(book)}"]`);
          const anyChecked = Array.from(topicCheckboxes).some((cb) => cb.checked);
          bookCheckbox.checked = anyChecked;
        });

        topicLabel.appendChild(topicCheckbox);
        topicLabel.appendChild(document.createTextNode(" " + t.topic));
        row.appendChild(topicLabel);
        topicsContainer.appendChild(row);
      });

    group.appendChild(topicsContainer);
    booksContainer.appendChild(group);
  });
}

function cssEscape(value) {
  return value.replace(/"/g, '\\"');
}

function setAllTopics(value) {
  booksContainer.querySelectorAll(".topic-checkbox").forEach((cb) => { cb.checked = value; });
  booksContainer.querySelectorAll(".book-checkbox").forEach((cb) => { cb.checked = value; });
}

function openNewCrosswordModal() {
  modalWarning.textContent = "";
  modalOverlay.classList.add("modal-visible");
}

function closeNewCrosswordModal() {
  modalOverlay.classList.remove("modal-visible");
}

function generateNewPuzzle(wordCount, sourceWords) {
  resultEl.textContent = "";

  const selection = selectRandomWords(sourceWords, wordCount);
  const { placed, discarded } = generateCrossword(selection);

  currentPuzzle = placed;
  currentBounds = gridBounds(placed);
  activeDirection = "H";

  if (discarded.length > 0) {
    console.warn("Words that didn't fit in the grid:", discarded.map((w) => w.word));
  }

  renderGrid(placed, currentBounds);
  renderClues(placed);
}

function applyGridCellSize(columns) {
  const available = gridEl.parentElement.clientWidth || window.innerWidth - 32;
  const cellSize = Math.max(18, Math.min(32, Math.floor(available / columns)));
  gridEl.style.setProperty("--cell-size", `${cellSize}px`);
  gridEl.style.gridTemplateColumns = `repeat(${columns}, var(--cell-size))`;
}

function renderGrid(placed, bounds) {
  const numbers = assignNumbers(placed);
  const columns = bounds.maxCol - bounds.minCol + 1;

  applyGridCellSize(columns);
  gridEl.innerHTML = "";

  for (let r = bounds.minRow; r <= bounds.maxRow; r++) {
    for (let c = bounds.minCol; c <= bounds.maxCol; c++) {
      const letter = letterAt(placed, r, c);
      const cell = document.createElement("div");

      if (!letter) {
        cell.className = "cell cell-empty";
        gridEl.appendChild(cell);
        continue;
      }

      cell.className = "cell cell-active";

      const number = numbers[r + "_" + c];
      if (number) {
        const numberEl = document.createElement("span");
        numberEl.className = "cell-number";
        numberEl.textContent = number;
        cell.appendChild(numberEl);
      }

      const input = document.createElement("input");
      input.maxLength = 1;
      input.dataset.row = r;
      input.dataset.col = c;
      input.autocomplete = "off";

      input.addEventListener("focus", () => {
        const words = wordsAtCell(currentPuzzle, r, c);

        // A cell where both an across and a down word start defaults to across.
        const startsBoth = words.H && words.V && words.H.index === 0 && words.V.index === 0;
        if (startsBoth) {
          activeDirection = "H";
        } else if (!words[activeDirection]) {
          activeDirection = words.H ? "H" : "V";
        }
      });

      input.addEventListener("keydown", (e) => {
        if (e.key !== "Backspace") return;
        e.preventDefault();

        // Cell has a letter: clear it and stay here.
        if (input.value) {
          input.value = "";
          cell.classList.remove("cell-correct", "cell-incorrect");
          return;
        }

        // Cell is already empty: clear the previous cell instead, unless this is the first letter.
        const words = wordsAtCell(currentPuzzle, r, c);
        const word = words[activeDirection];
        if (!word || word.index === 0) return;

        const prevRow = activeDirection === "H" ? r : r - 1;
        const prevCol = activeDirection === "H" ? c - 1 : c;
        const prevInput = gridEl.querySelector(`input[data-row="${prevRow}"][data-col="${prevCol}"]`);
        if (prevInput) {
          prevInput.value = "";
          prevInput.closest(".cell").classList.remove("cell-correct", "cell-incorrect");
          prevInput.focus();
        }
      });

      input.addEventListener("input", (e) => {
        e.target.value = e.target.value.slice(-1).toUpperCase();
        cell.classList.remove("cell-correct", "cell-incorrect");

        if (!e.target.value) return;

        const words = wordsAtCell(currentPuzzle, r, c);
        const word = words[activeDirection];
        if (!word) return;

        // Last letter of the word: stay on this cell instead of jumping past the end.
        if (word.index >= word.word.length - 1) return;

        const nextRow = activeDirection === "H" ? r : r + 1;
        const nextCol = activeDirection === "H" ? c + 1 : c;
        const nextInput = gridEl.querySelector(`input[data-row="${nextRow}"][data-col="${nextCol}"]`);
        if (nextInput) nextInput.focus();
      });

      cell.appendChild(input);
      gridEl.appendChild(cell);
    }
  }
}

function renderClues(placed) {
  const numbers = assignNumbers(placed);

  const list = placed
    .map((p) => ({
      number: numbers[p.row + "_" + p.col],
      direction: p.direction === "H" ? "Across" : "Down",
      definition: p.definition,
    }))
    .sort((a, b) => a.number - b.number || (a.direction === "Across" ? -1 : 1));

  cluesEl.innerHTML = list
    .map((item) => `<li><strong>${item.number} (${item.direction}).</strong> ${item.definition}</li>`)
    .join("");
}

function checkAnswers() {
  if (!currentPuzzle) return;

  let correct = 0;
  let incorrect = 0;
  let incomplete = 0;

  currentPuzzle.forEach((p) => {
    const cells = [];
    let written = "";
    let complete = true;

    for (let i = 0; i < p.word.length; i++) {
      const r = p.direction === "H" ? p.row : p.row + i;
      const c = p.direction === "H" ? p.col + i : p.col;
      const input = gridEl.querySelector(`input[data-row="${r}"][data-col="${c}"]`);
      const value = input.value.trim().toUpperCase();

      if (!value) complete = false;
      written += value;
      cells.push(input.closest(".cell"));
    }

    if (!complete) {
      incomplete++;
      cells.forEach((cell) => cell.classList.remove("cell-correct", "cell-incorrect"));
      return;
    }

    const isCorrect = written === p.word.toUpperCase();
    if (isCorrect) correct++; else incorrect++;

    cells.forEach((cell) => {
      cell.classList.toggle("cell-correct", isCorrect);
      cell.classList.toggle("cell-incorrect", !isCorrect);
    });
  });

  resultEl.textContent = `Correct: ${correct} · Incorrect: ${incorrect} · Incomplete: ${incomplete}`;
}

document.querySelector("#btn-new").addEventListener("click", openNewCrosswordModal);
document.querySelector("#btn-check").addEventListener("click", checkAnswers);
document.querySelector("#btn-cancel").addEventListener("click", closeNewCrosswordModal);
document.querySelector("#btn-select-all-topics").addEventListener("click", () => setAllTopics(true));
document.querySelector("#btn-deselect-all-topics").addEventListener("click", () => setAllTopics(false));

document.querySelector("#btn-generate").addEventListener("click", () => {
  const selectedPairs = new Set(
    Array.from(booksContainer.querySelectorAll(".topic-checkbox:checked")).map((cb) => cb.dataset.book + "||" + cb.dataset.topic)
  );

  if (selectedPairs.size === 0) {
    modalWarning.textContent = "Select at least one topic.";
    return;
  }

  const filtered = wordsData.filter((w) => selectedPairs.has(w.book + "||" + w.topic));
  if (filtered.length === 0) {
    modalWarning.textContent = "No words match the selected books/topics.";
    return;
  }

  const wordCount = parseInt(wordCountSelect.value, 10);
  closeNewCrosswordModal();
  generateNewPuzzle(wordCount, filtered);
});

window.addEventListener("resize", () => {
  if (!currentBounds) return;
  applyGridCellSize(currentBounds.maxCol - currentBounds.minCol + 1);
});

generateNewPuzzle(DEFAULT_WORD_COUNT, wordsData);
