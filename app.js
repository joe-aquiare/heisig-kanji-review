"use strict";

const CSV_PATH = "heisig-kanjis.csv";
const STORAGE_KEY = "heisig-review-state-v1";
const DIRECTIONS = ["Keyword → Kanji", "Kanji → Keyword"];

const state = {
  allCards: [],
  pool: [],
  deck: [],
  directions: [],
  index: 0,
  showingAnswer: false,
  settings: {
    range: "1-2200",
    count: "",
    direction: "Keyword → Kanji",
  },
  scratchpadVisible: false,
  drawing: false,
  lastPoint: null,
  strokes: [],
};

const els = {
  settingsDialog: document.querySelector("#settings-dialog"),
  settingsForm: document.querySelector("#settings-form"),
  settingsButton: document.querySelector("#settings-button"),
  closeSettings: document.querySelector("#close-settings"),
  newSessionButton: document.querySelector("#new-session-button"),
  shuffleButton: document.querySelector("#shuffle-button"),
  previousButton: document.querySelector("#previous-button"),
  actionButton: document.querySelector("#action-button"),
  progressLabel: document.querySelector("#progress-label"),
  frameLabel: document.querySelector("#frame-label"),
  jlptLabel: document.querySelector("#jlpt-label"),
  mainDisplay: document.querySelector("#main-display"),
  secondaryDisplay: document.querySelector("#secondary-display"),
  rangeInput: document.querySelector("#range-input"),
  countInput: document.querySelector("#count-input"),
  settingsError: document.querySelector("#settings-error"),
  resetProgress: document.querySelector("#reset-progress"),
  scratchpadToggle: document.querySelector("#scratchpad-toggle"),
  scratchpadWrap: document.querySelector("#scratchpad-wrap"),
  clearScratchpad: document.querySelector("#clear-scratchpad"),
  canvas: document.querySelector("#scratchpad"),
  toast: document.querySelector("#toast"),
};

const canvasContext = els.canvas.getContext("2d");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  const headers = rows.shift().map((header) => header.trim());
  return rows.map((values) => Object.fromEntries(
    headers.map((header, index) => [header, values[index] ?? ""]),
  )).map((card) => ({
    ...card,
    frame: Number(card.frame),
    stroke_count: Number(card.stroke_count),
  }));
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function randomDirection() {
  return DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
}

function makeDeck(pool, count) {
  const targetCount = count ? Math.max(1, Number(count)) : null;
  let deck = shuffle(pool);

  if (!targetCount) return deck;
  if (targetCount <= deck.length) return deck.slice(0, targetCount);

  const extended = [...deck];
  while (extended.length < targetCount) {
    extended.push(...shuffle(pool));
  }
  return extended.slice(0, targetCount);
}

function validateSettings(formData) {
  const range = formData.get("range").trim();
  const count = formData.get("count").trim();
  const direction = formData.get("direction");
  const match = range.match(/^(\d+)\s*-\s*(\d+)$/);

  if (!match) {
    return { error: "Enter a frame range like 100-1000." };
  }

  const start = Number(match[1]);
  const end = Number(match[2]);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
    return { error: "Frame range must start at 1 or higher and end after it." };
  }

  if (count && (!Number.isInteger(Number(count)) || Number(count) < 1)) {
    return { error: "Review count must be a whole number." };
  }

  return {
    settings: {
      range: `${start}-${end}`,
      count,
      direction,
    },
  };
}

function startSession(settings, preserveIndex = false) {
  const [start, end] = settings.range.split("-").map(Number);
  const pool = state.allCards.filter((card) => card.frame >= start && card.frame <= end);

  if (!pool.length) {
    showToast("No frames found in that range.");
    return false;
  }

  state.settings = { ...settings };
  state.pool = pool;
  state.deck = makeDeck(pool, settings.count);
  state.directions = state.settings.direction === "Random"
    ? state.deck.map(() => randomDirection())
    : [];
  state.index = preserveIndex ? Math.min(state.index, state.deck.length - 1) : 0;
  state.showingAnswer = false;
  clearScratchpad();
  updateDisplay();
  saveState();
  return true;
}

function currentCard() {
  return state.deck[state.index];
}

function currentDirection() {
  if (state.settings.direction === "Random") return state.directions[state.index];
  return state.settings.direction;
}

function renderText(container, text, options = {}) {
  container.replaceChildren();
  if (!text) return;

  if (options.kanji) {
    const pair = document.createElement("span");
    pair.className = "kanji-pair";
    const sans = document.createElement("span");
    sans.className = `kanji sans${options.answer ? " answer" : ""}`;
    sans.textContent = text;
    const serif = document.createElement("span");
    serif.className = `kanji serif${options.answer ? " answer" : ""}`;
    serif.textContent = text;
    pair.append(sans, serif);
    container.append(pair);
    return;
  }

  const keyword = document.createElement("span");
  keyword.className = `keyword${options.answer ? " answer" : ""}`;
  keyword.textContent = text;
  container.append(keyword);
}

function updateDisplay() {
  const card = currentCard();

  if (!card) {
    els.progressLabel.textContent = "0/0";
    els.frameLabel.textContent = "";
    els.jlptLabel.textContent = "";
    renderText(els.mainDisplay, "Open settings to start", { kanji: false });
    renderText(els.secondaryDisplay, "");
    els.previousButton.disabled = true;
    els.actionButton.disabled = true;
    return;
  }

  els.progressLabel.textContent = `${state.index + 1}/${state.deck.length}`;
  els.frameLabel.textContent = `Frame ${card.frame}`;
  els.jlptLabel.textContent = card.jlpt ? `JLPT ${card.jlpt}` : "";
  els.previousButton.disabled = state.index === 0;

  const direction = currentDirection();
  if (!state.showingAnswer) {
    if (direction === "Keyword → Kanji") {
      renderText(els.mainDisplay, card["key word"]);
    } else {
      renderText(els.mainDisplay, card.kanji, { kanji: true });
    }
    renderText(els.secondaryDisplay, "");
    els.actionButton.textContent = "Answer";
    els.actionButton.disabled = false;
  } else {
    if (direction === "Keyword → Kanji") {
      renderText(els.mainDisplay, card.kanji, { kanji: true, answer: true });
      renderText(els.secondaryDisplay, card["key word"]);
    } else {
      renderText(els.mainDisplay, card["key word"], { answer: true });
      renderText(els.secondaryDisplay, card.kanji, { kanji: true });
    }
    els.actionButton.textContent = "Next";
    els.actionButton.disabled = state.index === state.deck.length - 1;
  }

  drawGuide();
}

function showAnswerOrNext() {
  if (!state.deck.length) return;
  if (!state.showingAnswer) {
    state.showingAnswer = true;
  } else if (state.index < state.deck.length - 1) {
    state.index += 1;
    state.showingAnswer = false;
    clearScratchpad();
  }
  updateDisplay();
  saveState();
}

function previousCard() {
  if (state.index <= 0) return;
  state.index -= 1;
  state.showingAnswer = false;
  clearScratchpad();
  updateDisplay();
  saveState();
}

function shuffleSession() {
  if (!state.pool.length) return;
  startSession(state.settings);
  showToast("Session shuffled.");
}

function drawGuide() {
  renderScratchpad();
}

function renderScratchpad() {
  const card = currentCard();
  const shouldShowGuide = card && state.showingAnswer && currentDirection() === "Keyword → Kanji";
  canvasContext.clearRect(0, 0, els.canvas.width, els.canvas.height);

  if (state.scratchpadVisible && shouldShowGuide) {
    canvasContext.save();
    canvasContext.fillStyle = "#e6e1dc";
    canvasContext.font = "390px 'Yu Mincho', 'Hiragino Mincho ProN', serif";
    canvasContext.textAlign = "center";
    canvasContext.textBaseline = "middle";
    canvasContext.fillText(card.kanji, els.canvas.width / 2, els.canvas.height / 2 + 10);
    canvasContext.restore();
  }

  for (const stroke of state.strokes) {
    drawStrokeSegment(stroke.from, stroke.to);
  }
}

function clearScratchpad() {
  state.strokes = [];
  renderScratchpad();
}

function canvasPoint(event) {
  const rect = els.canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * els.canvas.width,
    y: ((event.clientY - rect.top) / rect.height) * els.canvas.height,
  };
}

function startDrawing(event) {
  event.preventDefault();
  state.drawing = true;
  state.lastPoint = canvasPoint(event);
  document.body.classList.add("is-drawing");
  els.canvas.setPointerCapture(event.pointerId);
}

function draw(event) {
  if (!state.drawing || !state.lastPoint) return;
  event.preventDefault();
  const point = canvasPoint(event);
  state.strokes.push({ from: state.lastPoint, to: point });
  drawStrokeSegment(state.lastPoint, point);
  state.lastPoint = point;
}

function drawStrokeSegment(from, to) {
  const d = 12 / Math.sqrt(2);

  canvasContext.save();
  canvasContext.fillStyle = "#111111";
  canvasContext.beginPath();
  canvasContext.moveTo(from.x - d, from.y - d);
  canvasContext.lineTo(from.x + d, from.y + d);
  canvasContext.lineTo(to.x + d, to.y + d);
  canvasContext.lineTo(to.x - d, to.y - d);
  canvasContext.closePath();
  canvasContext.fill();
  canvasContext.restore();
}

function stopDrawing(event) {
  event?.preventDefault();
  state.drawing = false;
  state.lastPoint = null;
  document.body.classList.remove("is-drawing");
}

function toggleScratchpad() {
  state.scratchpadVisible = !state.scratchpadVisible;
  els.scratchpadWrap.hidden = !state.scratchpadVisible;
  els.scratchpadToggle.setAttribute("aria-expanded", String(state.scratchpadVisible));
  els.scratchpadToggle.textContent = state.scratchpadVisible ? "Hide Scratchpad" : "Show Scratchpad";
  clearScratchpad();
}

function saveState() {
  const payload = {
    settings: state.settings,
    index: state.index,
    showingAnswer: state.showingAnswer,
    deckFrames: state.deck.map((card) => card.frame),
    directions: state.directions,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function restoreState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved?.settings?.range) return false;

    state.settings = saved.settings;
    const [start, end] = saved.settings.range.split("-").map(Number);
    state.pool = state.allCards.filter((card) => card.frame >= start && card.frame <= end);
    const byFrame = new Map(state.allCards.map((card) => [card.frame, card]));
    state.deck = saved.deckFrames?.map((frame) => byFrame.get(frame)).filter(Boolean) ?? [];

    if (!state.deck.length) {
      state.deck = makeDeck(state.pool, saved.settings.count);
    }

    state.directions = saved.directions ?? [];
    state.index = Math.min(saved.index ?? 0, Math.max(0, state.deck.length - 1));
    state.showingAnswer = Boolean(saved.showingAnswer);
    updateSettingsForm();
    updateDisplay();
    return true;
  } catch {
    return false;
  }
}

function updateSettingsForm() {
  els.rangeInput.value = state.settings.range;
  els.countInput.value = state.settings.count;
  const direction = document.querySelector(`input[name="direction"][value="${state.settings.direction}"]`);
  if (direction) direction.checked = true;
}

function openSettings() {
  updateSettingsForm();
  els.settingsError.textContent = "";
  els.settingsDialog.showModal();
  els.rangeInput.focus();
  els.rangeInput.select();
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("is-visible");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => {
    els.toast.classList.remove("is-visible");
  }, 1900);
}

function bindEvents() {
  els.settingsButton.addEventListener("click", openSettings);
  els.newSessionButton.addEventListener("click", openSettings);
  els.closeSettings.addEventListener("click", () => els.settingsDialog.close());
  els.shuffleButton.addEventListener("click", shuffleSession);
  els.previousButton.addEventListener("click", previousCard);
  els.actionButton.addEventListener("click", showAnswerOrNext);
  els.scratchpadToggle.addEventListener("click", toggleScratchpad);
  els.clearScratchpad.addEventListener("click", clearScratchpad);

  els.settingsForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const result = validateSettings(new FormData(els.settingsForm));
    if (result.error) {
      els.settingsError.textContent = result.error;
      return;
    }
    if (startSession(result.settings)) {
      els.settingsDialog.close();
    }
  });

  els.resetProgress.addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY);
    showToast("Saved state reset.");
  });

  els.scratchpadWrap.addEventListener("selectstart", (event) => event.preventDefault());
  els.scratchpadWrap.addEventListener("dragstart", (event) => event.preventDefault());
  els.canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  els.canvas.addEventListener("pointerdown", startDrawing, { passive: false });
  els.canvas.addEventListener("pointermove", draw, { passive: false });
  els.canvas.addEventListener("pointerup", stopDrawing, { passive: false });
  els.canvas.addEventListener("pointercancel", stopDrawing, { passive: false });
  els.canvas.addEventListener("pointerleave", stopDrawing, { passive: false });

  window.addEventListener("keydown", (event) => {
    if (els.settingsDialog.open) return;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      showAnswerOrNext();
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      previousCard();
    }
  });
}

async function init() {
  bindEvents();
  updateDisplay();

  try {
    const response = await fetch(CSV_PATH);
    if (!response.ok) throw new Error(`CSV load failed: ${response.status}`);
    state.allCards = parseCsv(await response.text()).filter((card) => Number.isFinite(card.frame));
  } catch (error) {
    renderText(els.mainDisplay, "Could not load heisig-kanjis.csv");
    showToast(error.message);
    return;
  }

  if (!restoreState()) {
    openSettings();
  }
}

init();
