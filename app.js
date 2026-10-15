const STORAGE_KEY = "inburgering-woordvolgorde-v1";

const progress = load();
const TOPIC_KEY = STORAGE_KEY + "-topic";
let currentTopic = localStorage.getItem(TOPIC_KEY);
if (!TOPICS.some((t) => t.id === currentTopic)) currentTopic = TOPICS[0].id;

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

// ---- Speech ----
// Prefer the generated audio files (audio/index.js, voice Ronnie); fall back
// to the browser's Dutch voice for texts without a file.

const AUDIO_FILES = typeof AUDIO === "undefined" ? {} : AUDIO;
const hasAudioFiles = Object.keys(AUDIO_FILES).length > 0;
let dutchVoice = null;

function pickVoice() {
  const voices = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().replace("_", "-").startsWith("nl"));
  dutchVoice = voices.find((v) => /nl-nl/i.test(v.lang.replace("_", "-"))) || voices[0] || null;
  document.body.classList.toggle("no-voice", !dutchVoice && !hasAudioFiles);
}

if ("speechSynthesis" in window) {
  pickVoice();
  speechSynthesis.addEventListener("voiceschanged", pickVoice);
} else {
  document.body.classList.toggle("no-voice", !hasAudioFiles);
}

let currentAudio = null;
let speakRun = 0;

function playFile(text) {
  return new Promise((resolve, reject) => {
    currentAudio = new Audio(`audio/${AUDIO_FILES[text]}.mp3`);
    currentAudio.addEventListener("ended", resolve);
    currentAudio.addEventListener("error", reject);
    currentAudio.play().catch(reject);
  });
}

function playVoice(text) {
  return new Promise((resolve) => {
    if (!dutchVoice) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    u.voice = dutchVoice;
    u.lang = dutchVoice.lang;
    u.rate = 0.85; // a bit slower than normal for learners
    u.addEventListener("end", resolve);
    u.addEventListener("error", resolve);
    speechSynthesis.speak(u);
  });
}

function stopSpeaking() {
  speakRun++;
  currentAudio?.pause();
  currentAudio = null;
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}

// Speak one or more texts in a row. A new call stops the previous one.
async function speak(...texts) {
  stopSpeaking();
  const run = speakRun;
  for (const text of texts) {
    if (run !== speakRun) return;
    if (AUDIO_FILES[text]) {
      try {
        await playFile(text);
        continue;
      } catch {
        if (run !== speakRun) return;
      }
    }
    await playVoice(text);
  }
}

function speakButton(title, onClick) {
  const b = document.createElement("button");
  b.className = "speak";
  b.type = "button";
  b.title = title;
  b.setAttribute("aria-label", title);
  b.textContent = "🔊";
  b.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

function normalize(s) {
  return s
    .toLowerCase()
    .replace(/[.,!?;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Returns "ok" (preferred order), "alt" (also correct), or "bad".
function grade(ex, input) {
  const n = normalize(input);
  if (n === normalize(ex.answer)) return "ok";
  if (ex.alternatives.some((a) => normalize(a) === n)) return "alt";
  return "bad";
}

// Wrap each word of a text in a clickable span. `senses` maps a word to the
// WORDS key for its meaning in this sentence (for homonyms).
function wordSpans(text, senses = {}) {
  const frag = document.createDocumentFragment();
  text.split(" ").forEach((word, i) => {
    if (i > 0) frag.append(" ");
    const span = document.createElement("span");
    span.className = "w";
    span.textContent = word;
    const key = word.toLowerCase().replace(/[.,!?;:"“”]/g, "");
    span.dataset.word = senses[key] || key;
    frag.append(span);
  });
  return frag;
}

function render() {
  const main = document.getElementById("exercises");
  main.innerHTML = "";
  // Exercises are pre-sorted by grammar group; add a heading per group.
  let group = null;
  EXERCISES.filter((ex) => ex.topic === currentTopic).forEach((ex) => {
    if (ex.grammar !== group) {
      group = ex.grammar;
      const g = GRAMMAR.find((g) => g.id === group);
      if (g) {
        const h = document.createElement("div");
        h.className = "group";
        h.append(textEl("h2", "", g.name), textEl("p", "", g.info));
        main.append(h);
      }
    }
    main.append(renderExercise(ex));
  });
  renderTopics();
  updateScore();
}

function renderTopics() {
  const nav = document.getElementById("topics");
  nav.innerHTML = "";
  TOPICS.forEach((t) => {
    const list = EXERCISES.filter((ex) => ex.topic === t.id);
    if (!list.length) return;
    const solved = list.filter((ex) => progress[ex.id]?.solved).length;
    const b = document.createElement("button");
    b.className = "topic" + (t.id === currentTopic ? " current" : "");
    b.innerHTML = `<span></span><small>${solved}/${list.length}</small>`;
    b.firstChild.textContent = t.name;
    b.addEventListener("click", () => {
      currentTopic = t.id;
      localStorage.setItem(TOPIC_KEY, t.id);
      closeInfo();
      render();
      window.scrollTo(0, 0);
    });
    nav.append(b);
  });
}

function renderExercise(ex) {
  const state = progress[ex.id] || {};
  const el = document.createElement("section");
  el.className = "exercise";

  const parts = document.createElement("div");
  parts.className = "parts";
  ex.parts.forEach((p, i) => {
    if (i > 0) {
      const sep = document.createElement("span");
      sep.className = "sep";
      sep.textContent = "–";
      parts.append(sep);
    }
    const chip = document.createElement("span");
    chip.className = "part";
    chip.append(wordSpans(p, ex.senses));
    parts.append(chip);
  });

  const row = document.createElement("div");
  row.className = "row";
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Type the sentence, then press Enter or Check";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.value = state.input || "";
  const mark = document.createElement("span");
  mark.className = "mark";
  // Hearing the sentence gives away the order, so it unlocks only after
  // the student solved it or chose "Show answer".
  const listen = speakButton("Listen to the sentence", () => speak(ex.answer));
  const updateListen = () => {
    const unlocked = Boolean(state.solved || state.revealed);
    listen.disabled = !unlocked;
    listen.title = unlocked ? "Listen to the sentence" : "Answer first (or Show answer) to hear the sentence";
  };
  const checkBtn = document.createElement("button");
  checkBtn.type = "button";
  checkBtn.className = "check";
  checkBtn.textContent = "Check";
  row.append(input, checkBtn, mark, listen);

  const feedback = document.createElement("div");
  feedback.className = "feedback";

  el.append(parts, row, feedback);

  // The hint is always available; once opened it stays open.
  let hintShown = false;
  const hintEl = () => {
    if (hintShown) return textEl("span", "hint", ex.hint);
    return button("Hint", () => {
      hintShown = true;
      showResult(state.result, state.revealed);
    });
  };

  const showResult = (result, revealed) => {
    updateListen();
    mark.className = "mark";
    mark.textContent = "";
    feedback.innerHTML = "";
    const tools = document.createElement("div");
    tools.className = "tools";
    tools.append(hintEl());

    if (result === "ok" || result === "alt") {
      mark.classList.add("ok");
      mark.textContent = "✔";
      if (result === "alt") {
        feedback.append("Correct! The standard order is: ");
        feedback.append(answerEl(ex.answer, ex.senses));
      }
    } else if (result === "bad") {
      mark.classList.add("bad");
      mark.textContent = "✘";
      if (revealed) {
        feedback.append("Correct answer: ");
        feedback.append(answerEl(ex.answer, ex.senses));
      } else {
        feedback.append("Not quite. Try again.");
        tools.append(
          button("Show answer", () => {
            state.revealed = true;
            progress[ex.id] = state;
            save();
            showResult(result, true);
          })
        );
      }
    }
    feedback.append(tools);
  };

  input.addEventListener("input", () => {
    state.input = input.value;
    progress[ex.id] = state;
    save();
  });

  const check = () => {
    if (!input.value.trim()) return input.focus();
    const result = grade(ex, input.value);
    state.input = input.value;
    state.result = result;
    state.attempts = (state.attempts || 0) + 1;
    if (result !== "bad") state.solved = true;
    progress[ex.id] = state;
    save();
    showResult(result, state.revealed);
    renderTopics();
    updateScore();
    input.focus();
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") check();
  });
  checkBtn.addEventListener("click", check);

  showResult(state.result, state.revealed);
  return el;
}

function answerEl(text, senses) {
  const span = document.createElement("span");
  span.className = "answer";
  span.append(wordSpans(text, senses));
  return span;
}

function button(label, onClick) {
  const b = document.createElement("button");
  b.className = "link";
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}

function updateScore() {
  const solved = EXERCISES.filter((ex) => progress[ex.id]?.solved).length;
  document.getElementById("score").textContent = `${solved} / ${EXERCISES.length} correct (all topics)`;
  document.getElementById("bar-fill").style.width = `${(solved / EXERCISES.length) * 100}%`;
}

// ---- Word info panel ----

const info = document.getElementById("info");
const infoBody = document.getElementById("info-body");
let activeWord = null;

function showWord(span) {
  // Keys may carry a sense suffix ("staat@40"); show the plain word.
  const plain = (key) => key.split("@")[0];
  let entry = WORDS[span.dataset.word];
  const word = plain(span.dataset.word);
  let form = null;
  let lemma = word;
  if (entry?.see) {
    form = entry.form;
    lemma = plain(entry.see);
    entry = WORDS[entry.see];
  }

  activeWord?.classList.remove("active");
  activeWord = span;
  span.classList.add("active");

  infoBody.innerHTML = "";
  const h = document.createElement("h2");
  const title = entry?.article ? `${entry.article} ${lemma}` : lemma;
  h.textContent = title;
  // Say the clicked form first, then the base word if it's different.
  h.append(" ", speakButton("Listen", () => (word === lemma ? speak(title) : speak(word, title))));
  infoBody.append(h);

  if (!entry) {
    infoBody.append(textEl("div", "en", "No info for this word yet."));
    openInfo(span);
    return;
  }

  infoBody.append(textEl("div", "type", entry.type + (form ? ` · “${word}” = ${form}` : "")));

  if (entry.article) {
    const tag = textEl("span", `tag ${entry.article}`, `${entry.article}-woord`);
    infoBody.append(tag);
  }
  infoBody.append(textEl("div", "en", entry.en));

  if (entry.plural) infoBody.append(metaEl("Plural", entry.plural));

  if (entry.forms) {
    const table = document.createElement("table");
    Object.entries(entry.forms).forEach(([who, f]) => {
      const tr = document.createElement("tr");
      tr.append(textEl("td", "", who), textEl("td", "", f));
      table.append(tr);
    });
    infoBody.append(table);
    if (entry.past) infoBody.append(metaEl("Past", entry.past));
    if (entry.perfect) infoBody.append(metaEl("Perfect", entry.perfect));
  }

  if (entry.notes?.length) {
    const ul = document.createElement("ul");
    entry.notes.forEach((n) => ul.append(textEl("li", "", n)));
    infoBody.append(ul);
  }

  openInfo(span);
}

// Show the panel right below the clicked word (or above it if there's no
// room below). On small screens it stays a bottom sheet (see styles.css).
function openInfo(span) {
  info.hidden = false;
  if (window.matchMedia("(max-width: 600px)").matches) {
    info.style.top = info.style.left = "";
    return;
  }
  const gap = 8;
  const margin = 10;
  const r = span.getBoundingClientRect();
  const w = info.offsetWidth;
  const h = info.offsetHeight;
  const fitsBelow = r.bottom + gap + h <= window.innerHeight - margin;
  const fitsAbove = r.top - gap - h >= margin;
  const top = !fitsBelow && fitsAbove ? r.top - gap - h : r.bottom + gap;
  const left = Math.min(Math.max(r.left, margin), window.innerWidth - w - margin);
  info.style.top = `${top + window.scrollY}px`;
  info.style.left = `${left + window.scrollX}px`;
}

function textEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  el.textContent = text;
  return el;
}

function metaEl(label, value) {
  const el = textEl("div", "meta", "");
  const b = document.createElement("b");
  b.textContent = `${label}: `;
  el.append(b, value);
  return el;
}

function closeInfo() {
  info.hidden = true;
  activeWord?.classList.remove("active");
  activeWord = null;
}

document.addEventListener("click", (e) => {
  const span = e.target.closest(".w");
  if (span) return showWord(span);
  if (!info.contains(e.target)) closeInfo();
});
document.getElementById("info-close").addEventListener("click", closeInfo);
window.addEventListener("resize", closeInfo);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeInfo();
});

document.getElementById("reset").addEventListener("click", () => {
  if (!confirm("Reset all progress?")) return;
  Object.keys(progress).forEach((k) => delete progress[k]);
  save();
  closeInfo();
  render();
});

render();
