import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cache = process.argv[2];
if (!cache)
  throw Error(
    "Pass the absolute snapshot directory created during source inventory.",
  );
const out = resolve(root, "public/library");
await mkdir(out, { recursive: true });
const load = async (p) => JSON.parse(await readFile(resolve(cache, p), "utf8"));
const revisions = {},
  trees = {};
for (const repo of ["british-ear", "WordLeap", "BritSpeak", "level-up-cards"]) {
  revisions[repo] = await load(`${repo}/revision.json`);
  trees[repo] = new Map(
    (await load(`${repo}/tree.json`)).tree
      .filter((f) => f.type === "blob")
      .map((f) => [f.path, f]),
  );
}
// Parse literal data only. Never evaluate downloaded application code.
function literal(node) {
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(literal);
  if (ts.isObjectLiteralExpression(node))
    return Object.fromEntries(
      node.properties.map((p) => {
        if (!ts.isPropertyAssignment(p))
          throw Error("Unexpected source property");
        return [p.name.text, literal(p.initializer)];
      }),
    );
  if (ts.isCallExpression(node) && node.expression.getText() === "make")
    return literal(node.arguments[0]);
  throw Error(`Unsupported data expression: ${node.kind}`);
}
function expression(text) {
  const f = ts.createSourceFile(
    "data.ts",
    `const data=${text}`,
    ts.ScriptTarget.Latest,
    true,
  );
  return literal(f.statements[0].declarationList.declarations[0].initializer);
}
function variable(text, name) {
  const f = ts.createSourceFile(
    "source.ts",
    text,
    ts.ScriptTarget.Latest,
    true,
  );
  let found;
  function visit(n) {
    if (ts.isVariableDeclaration(n) && n.name.getText(f) === name)
      found = n.initializer;
    else ts.forEachChild(n, visit);
  }
  visit(f);
  if (found) return literal(found);
  throw Error(`Missing literal ${name}`);
}
const audioManifest = new Map(),
  issues = [];
function media(repo, path, label, text) {
  const file = trees[repo].get(path);
  if (!file) {
    issues.push({ repo, path, reason: "missing source audio" });
    return null;
  }
  const url = `https://raw.githubusercontent.com/aha-moment-art/${repo}/${revisions[repo].commit}/${path.split("/").map(encodeURIComponent).join("/")}`;
  audioManifest.set(url, {
    repo,
    path,
    url,
    gitBlob: file.sha,
    bytes: file.size,
  });
  return { label, url, text };
}
const collections = [];
async function save(id, name, repo, sentences, words = [], tracks = []) {
  const file = `${id}.json`;
  const collection = {
    id,
    name,
    project: repo,
    sourceUrl: `https://github.com/aha-moment-art/${repo}/tree/${revisions[repo].commit}`,
    sentences,
    words,
    tracks,
  };
  await writeFile(resolve(out, file), JSON.stringify(collection) + "\n");
  collections.push({
    id,
    name,
    project: repo,
    file: `library/${file}`,
    sentenceCount: sentences.length,
    wordCount: words.length,
    audioCount: [...sentences, ...words].reduce(
      (n, s) => n + (s.recordings?.length ?? 0),
      0,
    ),
    trackCount: tracks.length,
  });
}
const recordings = (...r) => r.filter(Boolean);
// British Ear: retain all original sentence IDs, group by original source.
const arutext = await readFile(
  resolve(cache, "british-ear/sentences.js"),
  "utf8",
);
const yttext = await readFile(
  resolve(cache, "british-ear/youtube-sentences.js"),
  "utf8",
);
const ear = [
  ...expression(
    arutext.slice(arutext.indexOf("["), arutext.lastIndexOf("]") + 1),
  ),
  ...expression(yttext.slice(yttext.indexOf("["), yttext.lastIndexOf("]") + 1)),
];
for (const [source, title, group] of [
  ["ARU", "ARU 真人短句", "aru"],
  ["PMQs · Farewell", "Farewell 逐句原声", "farewell"],
  ["PMQs · Full", "Final PMQs 逐句原声", "pmqs"],
]) {
  const sentences = ear
    .filter((x) => x.source === source)
    .map((x) => ({
      id: `catalog:british-ear:${x.id}`,
      en: x.text,
      zh: "",
      note: `${x.level} · ${x.accent}`,
      recordings: recordings(media("british-ear", x.audio, "真人英音", x.text)),
      credit: {
        label: "British Ear · " + source,
        url: `https://github.com/aha-moment-art/british-ear/tree/${revisions["british-ear"].commit}`,
      },
    }));
  await save(`british-ear-${group}`, title, "british-ear", sentences);
}
// BritSpeak keeps the supplied Chinese translations and six separate clips.
const lessons = variable(
  await readFile(resolve(cache, "BritSpeak/app.js"), "utf8"),
  "lessons",
);
await save(
  "britspeak-speech",
  "英国议会 · 真人跟读",
  "BritSpeak",
  lessons.map(([en, zh, level, path], i) => ({
    id: `catalog:britspeak:${i + 1}`,
    en,
    zh,
    note: level,
    recordings: recordings(media("BritSpeak", path, "真人原声", en)),
  })),
);
// WordLeap: use the same custom-example fallback as the source application.
const custom = await load("WordLeap/public/dicts/custom-examples.json"),
  customByWord = new Map(custom.map((x) => [x.word.toLowerCase(), x]));
for (const bank of [
  "IELTS",
  "TOEFL",
  "CET-4",
  "CET-6",
  "TEM-4",
  "TEM-8",
  "PTE",
]) {
  const rows = await load(`WordLeap/public/dicts/${bank}.json`),
    sentences = [],
    wordEntries = [];
  for (const [i, x] of rows.entries()) {
    const fallback = customByWord.get(x.word.toLowerCase());
    const en = x.example || fallback?.example;
    const aid = x.exampleSourceId
      ? String(x.exampleSourceId)
      : fallback?.audioId;
    const note = `${x.word} ${x.phonetic || ""} · ${x.meaning.replaceAll("\\n", "；")}`;
    const credit = x.exampleSourceId
      ? {
          label: `Tatoeba #${x.exampleSourceId} · ${x.exampleSourceUser || "原作者"} · CC BY 2.0 FR`,
          url: `https://tatoeba.org/en/sentences/show/${x.exampleSourceId}`,
        }
      : {
          label: "WordLeap 自定义例句",
          url: `https://github.com/aha-moment-art/WordLeap/tree/${revisions.WordLeap.commit}`,
        };
    if (en)
      sentences.push({
        id: `catalog:wordleap:${bank}:s${i + 1}`,
        en,
        zh: "",
        note,
        credit,
        recordings: aid
          ? recordings(
              media(
                "WordLeap",
                `public/audio/sentences/${aid}.mp3`,
                "例句英音",
                en,
              ),
            )
          : [],
      });
    else
      issues.push({
        repo: "WordLeap",
        bank,
        word: x.word,
        reason: "no original example",
      });
    wordEntries.push({
      id: `catalog:wordleap:${bank}:w${i + 1}`,
      en: x.word,
      zh: x.meaning.replaceAll("\\n", "；"),
      note: x.phonetic || "",
      recordings: recordings(
        media(
          "WordLeap",
          `public/audio/words/${x.word.toLowerCase()}.mp3`,
          "词条英音",
          x.word,
        ),
      ),
    });
  }
  await save(
    `wordleap-${bank.toLowerCase()}`,
    bank + " 词库",
    "WordLeap",
    sentences,
    wordEntries,
  );
}
await save(
  "wordleap-custom",
  "自定义例句",
  "WordLeap",
  custom.map((x, i) => ({
    id: `catalog:wordleap:custom:${i + 1}`,
    en: x.example,
    zh: "",
    note: `关键词：${x.word}`,
    recordings: recordings(
      media(
        "WordLeap",
        `public/audio/sentences/${x.audioId}.mp3`,
        "例句英音",
        x.example,
      ),
    ),
  })),
);
// Preserve the small built-in example banks too; source has no full-sentence recording for these.
const seedBanks = variable(
  await readFile(resolve(cache, "WordLeap/app/word-bank.ts"), "utf8"),
  "wordBanks",
);
const seeds = Object.entries(seedBanks).flatMap(([bank, rows]) =>
  rows.map(([word, phonetic, meaning, en], i) => ({
    id: `catalog:wordleap:seed:${bank}:${i + 1}`,
    en,
    zh: "",
    note: `${bank} · ${word} ${phonetic} · ${meaning}`,
    recordings: [],
  })),
);
await save("wordleap-seeds", "内置示例句", "WordLeap", seeds);
// Level Up: sentence examples, UK/US word pronunciation and daily full listening are distinct.
const html = await readFile(
  resolve(cache, "level-up-cards/calendar.html"),
  "utf8",
);
const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(
  (m) => m[1],
);
const script = scripts.find((s) => s.includes("const data="));
const data = variable(script, "data"),
  audioFiles = variable(script, "audioFiles");
for (const day of data.days) {
  const entries = data.words.filter(
    (w) => w.id >= day.first && w.id <= day.last,
  );
  const sentences = entries.map((w) => ({
    id: `catalog:level-up:${day.date}:s${w.id}`,
    en: w.example,
    zh: w.translation || "",
    note: `${w.word} · ${w.meaning} · ${w.collocation || ""}`,
    recordings: [],
  }));
  const wordEntries = entries.map((w) => ({
    id: `catalog:level-up:${day.date}:w${w.id}`,
    en: w.word,
    zh: w.meaning,
    note: `英 /${w.ukphone}/ · 美 /${w.usphone}/`,
    recordings: recordings(
      ...["uk", "us"].map((accent) =>
        media(
          "level-up-cards",
          "word-audio/" +
            audioFiles[String(w.id).padStart(4, "0") + "-" + accent],
          accent === "uk" ? "词条英音" : "词条美音",
          w.word,
        ),
      ),
    ),
  }));
  const tracks = day.episodes.map((ep) => ({
    title: ep.title,
    url: media("level-up-cards", ep.audio, "每日听力", "")?.url,
    sourceUrl: ep.source,
  }));
  await save(
    `level-up-${day.date}`,
    day.date + " 每日卡片",
    "level-up-cards",
    sentences,
    wordEntries,
    tracks,
  );
}
await mkdir(resolve(out, "licenses"), { recursive: true });
for (const name of ["ECDICT-LICENSE", "QWERTY-LEARNER-GPL-3.0"])
  await copyFile(
    resolve(cache, "WordLeap/THIRD_PARTY_LICENSES", name),
    resolve(out, "licenses", name + ".txt"),
  );
const counts = Object.fromEntries(
  ["british-ear", "WordLeap", "BritSpeak", "level-up-cards"].map((p) => {
    const cs = collections.filter((c) => c.project === p);
    return [
      p,
      {
        collections: cs.length,
        sentences: cs.reduce((n, c) => n + c.sentenceCount, 0),
        words: cs.reduce((n, c) => n + c.wordCount, 0),
        tracks: cs.reduce((n, c) => n + c.trackCount, 0),
        uniqueAudio: [...audioManifest.values()].filter((a) => a.repo === p)
          .length,
      },
    ];
  }),
);
await writeFile(
  resolve(out, "index.json"),
  JSON.stringify({ version: 1, revisions, counts, collections }) + "\n",
);
await writeFile(
  resolve(cache, "migration-audit.json"),
  JSON.stringify(
    { counts, issues, audio: [...audioManifest.values()] },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify(
    {
      counts,
      issues: issues.slice(0, 15),
      issueCount: issues.length,
      audioFiles: audioManifest.size,
    },
    null,
    2,
  ),
);
if (issues.length)
  throw Error(
    "Source references are incomplete; inspect migration-audit.json before publishing.",
  );
