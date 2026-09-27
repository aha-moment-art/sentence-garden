import {
  validSentence,
  isProjectAudioUrl,
  type Sentence,
  type State,
  makeSession,
} from "./engine";
export type CatalogSummary = {
  id: string;
  name: string;
  project: string;
  file: string;
  sentenceCount: number;
  wordCount: number;
  audioCount: number;
  trackCount: number;
};
export type CatalogIndex = {
  version: 1;
  counts: Record<
    string,
    { sentences: number; words: number; tracks: number; uniqueAudio: number }
  >;
  collections: CatalogSummary[];
};
export type CatalogCollection = {
  id: string;
  name: string;
  project: string;
  sourceUrl: string;
  sentences: Sentence[];
  words: Sentence[];
  tracks: { title: string; url: string; sourceUrl: string }[];
};
export async function loadIndex(signal?: AbortSignal): Promise<CatalogIndex> {
  const r = await fetch(new URL("library/index.json", document.baseURI), {
    signal,
  });
  if (!r.ok) throw Error("项目句库暂时无法加载，请重试。");
  const d = await r.json();
  if (d.version !== 1 || !Array.isArray(d.collections))
    throw Error("项目句库目录格式不正确。");
  return d;
}
export async function loadCollection(
  summary: CatalogSummary,
  signal?: AbortSignal,
): Promise<CatalogCollection> {
  if (!/^library\/[a-z0-9-]+\.json$/.test(summary.file))
    throw Error("句库路径无效。");
  const response = await fetch(new URL(summary.file, document.baseURI), {
    signal,
  });
  if (!response.ok) throw Error("这组内容暂时无法加载，请重试。");
  const data = await response.json();
  if (
    data.id !== summary.id ||
    !Array.isArray(data.sentences) ||
    !Array.isArray(data.words) ||
    ![...data.sentences, ...data.words].every(validSentence) ||
    !Array.isArray(data.tracks) ||
    !data.tracks.every((t: { url: string }) => isProjectAudioUrl(t.url))
  )
    throw Error("这组内容的数据校验没有通过。");
  return data;
}
export function startCatalog(
  state: State,
  id: string,
  name: string,
  sentences: Sentence[],
  direct: boolean,
): State {
  const selected = sentences.slice(0, 5);
  if (!selected.length) return state;
  const deckId = `saved:${id}`,
    old = state.decks.find((d) => d.id === deckId);
  const merged = [
    ...new Map(
      [...(old?.sentences ?? []), ...selected].map((s) => [s.id, s]),
    ).values(),
  ];
  const deck = { id: deckId, name, sentences: merged };
  return {
    ...state,
    decks: old
      ? state.decks.map((d) => (d.id === deckId ? deck : d))
      : [...state.decks, deck],
    session: makeSession(name, selected, state.settings.strict, direct),
  };
}
