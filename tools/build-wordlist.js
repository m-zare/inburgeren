// Builds words/all-words.tsv (word \t english \t sources) from the original
// flashcard exports (alternating Dutch / English lines).
// Usage: node tools/build-wordlist.js <dir-with-original-pairs>
const fs = require("fs");
const path = require("path");

const dir = process.argv[2];
const out = new Map(); // word -> {en:Set, src:Set}

for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".txt"))) {
  const src = file.replace("-flash-cards.txt", "");
  const lines = fs.readFileSync(path.join(dir, file), "utf8").split("\n").map((l) => l.trim());
  for (let i = 0; i + 1 < lines.length; i += 2) {
    let nl = lines[i].replace(/,\s*(de|het)$/i, "");
    let en = lines[i + 1];
    let nlWords, enWords;
    if (src === "adjectives-opposites") {
      nlWords = nl.split(/\s*,\s*/);
      enWords = en.split(/\s*,\s*/);
    } else {
      nlWords = nl.split(/\s*[\/,]\s*/);
      enWords = nlWords.map(() => en);
    }
    nlWords.forEach((w, j) => {
      w = w.toLowerCase().trim();
      if (!w) return;
      if (!out.has(w)) out.set(w, { en: new Set(), src: new Set() });
      out.get(w).en.add((enWords[j] || en).trim());
      out.get(w).src.add(src);
    });
  }
}

// Words from the official A2 writing practice exams (one word per line).
for (const w of fs.readFileSync("words/exam-writing.txt", "utf8").split("\n").map((l) => l.trim()).filter(Boolean)) {
  if (!out.has(w)) out.set(w, { en: new Set(), src: new Set() });
  out.get(w).src.add("exam-writing");
}

const rows = [...out.entries()]
  .sort(([a], [b]) => a.localeCompare(b, "nl"))
  .map(([w, { en, src }]) => `${w}\t${[...en].join("; ")}\t${[...src].join(",")}`);
fs.writeFileSync("words/all-words.tsv", rows.join("\n") + "\n");
console.log(rows.length, "words");
