import { describe, it, expect, vi, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import {
  initialState,
  validateState,
  validSentence,
  isProjectAudioUrl,
  type Sentence,
} from "./engine";
import { startCatalog, type CatalogCollection } from "./catalog";
import { audioSource } from "./audio";
vi.stubGlobal('document', {baseURI:'https://example.test/sentence-garden/'});
afterAll(()=>vi.unstubAllGlobals());
const index = JSON.parse(
  readFileSync(
    new URL("../public/library/index.json", import.meta.url),
    "utf8",
  ),
);
const collections: CatalogCollection[] = index.collections.map(
  (c: { file: string }) =>
    JSON.parse(
      readFileSync(new URL("../public/" + c.file, import.meta.url), "utf8"),
    ),
);
describe("complete project catalog", () => {
  it("preserves all four source inventories, valid metadata and globally unique entry IDs", () => {
    expect(collections).toHaveLength(59);
    const counts: Record<string, number[]> = {};
    const ids = new Set<string>();
    const urls = new Map<string, Set<string>>();
    for (const c of collections) {
      const summary = index.collections.find(
        (s: { id: string }) => s.id === c.id,
      );
      expect(c.sentences.length).toBe(summary.sentenceCount);
      expect(c.words.length).toBe(summary.wordCount);
      expect(c.tracks.length).toBe(summary.trackCount);
      counts[c.project] ??= [0, 0, 0];
      counts[c.project][0] += c.sentences.length;
      counts[c.project][1] += c.words.length;
      counts[c.project][2] += c.tracks.length;
      if (!urls.has(c.project)) urls.set(c.project, new Set());
      for (const s of [...c.sentences, ...c.words]) {
        expect(validSentence(s), s.id).toBe(true);
        expect(ids.has(s.id), s.id).toBe(false);
        ids.add(s.id);
        for (const r of s.recordings ?? []) {
          expect(r.text).toBe(s.en);
          expect(r.url).toContain(
            "/" + index.revisions[c.project].commit + "/",
          );
          urls.get(c.project)!.add(r.url);
        }
      }
      for (const t of c.tracks) {
        expect(isProjectAudioUrl(t.url)).toBe(true);
        expect(t.sourceUrl).toMatch(/^https:\/\//);
        urls.get(c.project)!.add(t.url);
      }
    }
    expect(counts).toEqual({
      "british-ear": [676, 0, 0],
      WordLeap: [35478, 33783, 0],
      BritSpeak: [6, 0, 0],
      "level-up-cards": [2300, 2300, 92],
    });
    for (const [p, files] of urls)
      expect(files.size).toBe(index.counts[p].uniqueAudio);
  });
  it("keeps Level Up word voices separate from examples and daily full recordings", () => {
    for (const c of collections.filter((c) => c.project === "level-up-cards")) {
      expect(c.sentences.every((s) => !s.recordings?.length && !!s.zh)).toBe(
        true,
      );
      expect(
        c.words.every(
          (s) =>
            s.recordings?.length === 2 &&
            s.recordings[0].label === "词条英音" &&
            s.recordings[1].label === "词条美音",
        ),
      ).toBe(true);
      expect(c.tracks).toHaveLength(2);
    }
  });
  it("can export and restore the complete optional catalog within state limits", () => {
    const state = initialState();
    for (const c of collections) {
      for (const mode of ["sentences", "words"] as const) {
        if (c[mode].length)
          state.decks.push({
            id: c.id + mode,
            name: c.name,
            sentences: c[mode],
          });
      }
    }
    const restored = validateState(JSON.parse(JSON.stringify(state)));
    expect(restored.decks.reduce((n, d) => n + d.sentences.length, 0)).toBe(
      74548,
    );
  });
});
describe("catalog practice and audio integrity", () => {
  const c = collections.find((c) => c.project === "BritSpeak")!;
  it("keeps a short final group intact, preserves personal records and avoids duplicates on replay", () => {
    const before = initialState();
    before.reviews["sample-1"] = {
      step: 1,
      due: "2026-10-01T00:00:00Z",
      lastPracticed: "2026-09-28T00:00:00Z",
      needsReview: false,
    };
    const first = startCatalog(before, c.id, c.name, c.sentences, false);
    expect(first.decks[0]).toEqual(before.decks[0]);
    expect(first.reviews).toEqual(before.reviews);
    expect(first.settings).toEqual(before.settings);
    expect(first.decks.at(-1)?.sentences).toHaveLength(6);
    expect(first.session?.tasks).toHaveLength(6);
    expect(first.session?.mode).toBe('typing');
    const repeated = startCatalog(first, c.id, c.name, c.sentences, true);
    expect(repeated.decks).toHaveLength(2);
    expect(repeated.session?.tasks.every((t) => t.phase === "recall")).toBe(
      true,
    );
    expect(validateState(JSON.parse(JSON.stringify(repeated)))).toEqual(
      repeated,
    );
  });
  it("prefers generated ElevenLabs audio over originals and overrides, never mismatched or untrusted audio", () => {
    const s = c.sentences[0];
    const generatedSource = audioSource(s.en, [], s);
    expect(generatedSource).toMatch(/^https:\/\/example\.test\/sentence-garden\/audio\/generated\/[a-f0-9]+\.mp3$/);
    expect(audioSource("Changed English.", [], s)).toBeNull();
    expect(
      audioSource(
        s.en,
        [{ text: s.en, audio: "data:audio/mpeg;base64,AAAA" }],
        s,
      ),
    ).toBe(generatedSource);
    for (const url of [
      "https://evil.example/audio.mp3",
      "javascript:alert(1)",
      "https://raw.githubusercontent.com/aha-moment-art/BritSpeak/main/audio.mp3",
    ]) {
      expect(
        validSentence({
          ...s,
          recordings: [{ label: "Audio", text: s.en, url }],
        } as Sentence),
      ).toBe(false);
    }
  });
});
