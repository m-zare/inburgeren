// Validates content/*.json and reports word-list coverage.
// Usage: node tools/check.js [content/file.json ...]   (default: all files)
//        add --uncovered to print the uncovered words.
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const showUncovered = args.includes("--uncovered");
const files = args.filter((a) => !a.startsWith("--"));
const allFiles = fs.readdirSync("content").filter((f) => f.endsWith(".json")).map((f) => path.join("content", f));
const targets = files.length ? files : allFiles;

const TOPICS = ["werk", "school", "wonen", "winkelen", "gezondheid", "vrije-tijd"];
// Grammar groups, from easiest to hardest. A sentence is tagged with the
// hardest one it uses. Keep in sync with GRAMMAR in tools/build.js.
const GRAMMAR = ["basis", "inversie", "vraag", "modaal", "scheidbaar", "perfectum", "nevenschikkend", "om-te", "bijzin"];

const master = fs
  .readFileSync("words/all-words.tsv", "utf8")
  .trim()
  .split("\n")
  .map((l) => l.split("\t")[0]);

const tokenize = (s) =>
  s
    .toLowerCase()
    .replace(/[.,!?;:"“”]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

const sortedKey = (s) => tokenize(s).sort().join(" ");

// Word entries from ALL files are available for lookups, so a file may rely
// on entries defined elsewhere.
const words = {};
for (const f of allFiles) {
  for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(f, "utf8")).words || {})) words[k] ??= v;
}

const errors = [];
const warn = [];
const covered = new Set();
const ids = new Set();
let count = 0;

for (const f of allFiles) {
  const data = JSON.parse(fs.readFileSync(f, "utf8"));
  const report = targets.includes(f);
  // A file's own entries win for its own sentences (homonyms like "staat").
  const local = { ...words, ...(data.words || {}) };
  for (const ex of data.exercises || []) {
    count++;
    const where = `${path.basename(f)}:${ex.id}`;
    const err = (m) => report && errors.push(`${where}: ${m}`);

    if (ids.has(ex.id)) err("duplicate id");
    ids.add(ex.id);
    if (!TOPICS.includes(ex.topic)) err(`unknown topic "${ex.topic}"`);
    if (!GRAMMAR.includes(ex.grammar)) err(`unknown grammar "${ex.grammar}"`);
    if (![1, 2, 3, 4, 5].includes(ex.level)) err(`level must be 1-5, got ${ex.level}`);
    if (!Array.isArray(ex.parts) || ex.parts.length < 3) err("needs at least 3 parts");
    if (!ex.answer) { err("missing answer"); continue; }

    const key = sortedKey(ex.answer);
    if (sortedKey(ex.parts.join(" ")) !== key) err(`parts don't match answer words`);
    if (tokenize(ex.parts.join(" ")).join(" ") === tokenize(ex.answer).join(" ")) err("parts are already in answer order");
    for (const alt of ex.alternatives || []) {
      if (sortedKey(alt) !== key) err(`alternative uses different words: "${alt}"`);
    }
    if (!ex.hint) err("missing hint");
    const tokens = tokenize(ex.answer);
    if (report && tokens.length > 14) warn.push(`${where}: long sentence (${tokens.length} words)`);

    const lemmas = new Set();
    for (const t of tokens) {
      const e = local[t];
      if (!e) { err(`no word entry for "${t}"`); continue; }
      lemmas.add(t);
      if (e.see) {
        if (!local[e.see]) err(`"${t}" points to missing entry "${e.see}"`);
        lemmas.add(e.see);
      }
    }
    lemmas.forEach((l) => covered.add(l));

    // Phrases ("een paar") and separable verbs ("neem ... mee") via `covers`.
    const text = " " + tokens.join(" ") + " ";
    for (const c of ex.covers || []) {
      if (!master.includes(c)) { err(`covers "${c}" which is not in the word list`); continue; }
      const ok = lemmas.has(c) || text.includes(" " + c + " ") || (local[c] && /separable/.test(local[c].type || ""));
      if (!ok) err(`covers "${c}" but it isn't in the sentence`);
      else covered.add(c);
    }
  }
}

const masterCovered = master.filter((w) => covered.has(w));
const uncovered = master.filter((w) => !covered.has(w));

errors.forEach((e) => console.log("ERROR", e));
warn.forEach((w) => console.log("warn ", w));
console.log(`\n${count} exercises, ${errors.length} errors`);
console.log(`coverage: ${masterCovered.length}/${master.length} = ${((masterCovered.length / master.length) * 100).toFixed(1)}%`);
if (showUncovered) console.log("\nuncovered:\n" + uncovered.join("\n"));
process.exitCode = errors.length ? 1 : 0;
