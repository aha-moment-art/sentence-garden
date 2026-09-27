export type Phase = "copy" | "cloze" | "recall";
export type Recording = { label: string; url: string; text: string };
export type Sentence = {
  id: string;
  en: string;
  zh: string;
  note?: string;
  recordings?: Recording[];
  credit?: { label: string; url: string };
};
export type Deck = { id: string; name: string; sentences: Sentence[] };
export type Review = {
  step: number;
  due: string;
  needsReview: boolean;
  lastPracticed: string;
};
export type Result = {
  help: boolean;
  error: boolean;
  independent: boolean;
  lastClean: boolean;
  recalled: boolean;
};
export type Task = { sentence: Sentence; phase: Phase; retry: boolean };
export type Session = {
  id: string;
  name: string;
  tasks: Task[];
  index: number;
  input: string;
  hint: number;
  checked: boolean | null;
  currentError: boolean;
  currentHelp: boolean;
  results: Record<string, Result>;
  retryAdded: boolean;
  complete: boolean;
  started: number;
  finished?: number;
  strict: boolean;
};
export type State = {
  version: 1;
  decks: Deck[];
  reviews: Record<string, Review>;
  settings: { strict: boolean; sound: boolean; rate: number; soundVersion?: 1 };
  session: Session | null;
  history: { id: string; date: string; count: number; independent: number }[];
};
export const uid = () => crypto.randomUUID();
export const words = (s: string) =>
  s.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? [];
export const normalized = (s: string) =>
  words(s)
    .map((w) => w.toLowerCase().replace(/’/g, "'").replace(/'/g, ""))
    .join(" ");
export const matches = (expected: string, actual: string, strict: boolean) =>
  strict ? expected === actual : normalized(expected) === normalized(actual);
export function maskIndices(en: string): number[] {
  const ws = words(en);
  const common = new Set([
    "a",
    "an",
    "the",
    "is",
    "are",
    "am",
    "to",
    "of",
    "in",
    "on",
    "and",
    "i",
    "it",
    "my",
    "we",
    "be",
  ]);
  const ordered = ws
    .map((w, i) => ({
      i,
      weight: (common.has(w.toLowerCase()) ? 0 : 100) + w.length,
    }))
    .sort((a, b) => b.weight - a.weight || a.i - b.i);
  return ordered
    .slice(0, Math.max(1, Math.round(ws.length / 3)))
    .map((x) => x.i)
    .sort((a, b) => a - b);
}
export function expected(task: Task) {
  return task.phase === "cloze"
    ? maskIndices(task.sentence.en)
        .map((i) => words(task.sentence.en)[i])
        .join(" ")
    : task.sentence.en;
}
export function makeSession(
  name: string,
  sentences: Sentence[],
  strict: boolean,
  direct = false,
): Session {
  const phases: Phase[] = direct ? ["recall"] : ["copy", "cloze", "recall"];
  return {
    id: uid(),
    name,
    tasks: phases.flatMap((phase) =>
      sentences.map((sentence) => ({
        sentence: { ...sentence },
        phase,
        retry: false,
      })),
    ),
    index: 0,
    input: "",
    hint: 0,
    checked: null,
    currentError: false,
    currentHelp: false,
    results: {},
    retryAdded: false,
    complete: false,
    started: Date.now(),
    strict,
  };
}
export function checkSession(s: Session): Session {
  const task = s.tasks[s.index];
  const ok = matches(expected(task), s.input, s.strict);
  return { ...s, checked: ok, currentError: s.currentError || !ok };
}
export function nextSession(s: Session): Session {
  if (!s.checked || s.complete) return s;
  const task = s.tasks[s.index];
  const previous = s.results[task.sentence.id] ?? {
    help: false,
    error: false,
    independent: false,
    lastClean: false,
    recalled: false,
  };
  const clean = !s.currentError && !s.currentHelp;
  const result: Result = {
    ...previous,
    help: previous.help || s.currentHelp,
    error: previous.error || s.currentError,
    ...(task.phase === "recall"
      ? {
          recalled: true,
          lastClean: clean,
          ...(!task.retry ? { independent: clean } : {}),
        }
      : {}),
  };
  const results = { ...s.results, [task.sentence.id]: result };
  let tasks = s.tasks;
  let retryAdded = s.retryAdded;
  if (s.index + 1 === tasks.length && !retryAdded) {
    const sentences = [
      ...new Map(tasks.map((t) => [t.sentence.id, t.sentence])).values(),
    ];
    const retries: Task[] = sentences
      .filter((t) => results[t.id]?.help || results[t.id]?.error)
      .map((sentence) => ({ sentence, phase: "recall", retry: true }));
    tasks = [...tasks, ...retries];
    retryAdded = true;
  }
  const complete = s.index + 1 === tasks.length;
  return {
    ...s,
    tasks,
    results,
    retryAdded,
    index: complete ? s.index : s.index + 1,
    input: "",
    hint: 0,
    checked: null,
    currentError: false,
    currentHelp: false,
    complete,
    ...(complete ? { finished: Date.now() } : {}),
  };
}
export function scheduleReview(
  old: Review | undefined,
  clean: boolean,
  reset: boolean,
  now = new Date(),
): Review {
  const step = clean ? (reset ? 0 : Math.min((old?.step ?? -1) + 1, 2)) : -1;
  const due = new Date(now);
  if (clean) due.setDate(due.getDate() + [1, 3, 7][step]);
  return {
    step,
    due: due.toISOString(),
    needsReview: !clean,
    lastPracticed: now.toISOString(),
  };
}
export function finishState(state: State, s: Session): State {
  if (!s.complete || state.history.some((h) => h.id === s.id))
    return { ...state, session: s };
  const reviews = { ...state.reviews };
  for (const [id, r] of Object.entries(s.results))
    reviews[id] = scheduleReview(reviews[id], r.lastClean, r.help || r.error);
  return {
    ...state,
    session: s,
    reviews,
    history: [
      ...state.history,
      {
        id: s.id,
        date: new Date().toISOString(),
        count: Object.keys(s.results).length,
        independent: Object.values(s.results).filter((r) => r.independent)
          .length,
      },
    ],
  };
}
export type Diff = {
  kind: "correct" | "missing" | "extra" | "wrong";
  expected?: string;
  actual?: string;
};
export function diffWords(
  target: string,
  actual: string,
  strict = false,
): Diff[] {
  const a = strict ? target.split(/\s+/) : words(target),
    b = strict ? actual.split(/\s+/).filter(Boolean) : words(actual);
  const same = (x: string, y: string) =>
    strict ? x === y : normalized(x) === normalized(y);
  const dp = Array.from({ length: a.length + 1 }, () =>
    Array<number>(b.length + 1).fill(0),
  );
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = same(a[i - 1], b[j - 1])
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  const out: Diff[] = [];
  let i = a.length,
    j = b.length;
  while (i || j) {
    if (i && j && same(a[i - 1], b[j - 1])) {
      out.unshift({ kind: "correct", expected: a[--i], actual: b[--j] });
    } else if (i && j && dp[i][j] === dp[i - 1][j - 1] + 1) {
      out.unshift({ kind: "wrong", expected: a[--i], actual: b[--j] });
    } else if (i && dp[i][j] === dp[i - 1][j] + 1) {
      out.unshift({ kind: "missing", expected: a[--i] });
    } else {
      out.unshift({ kind: "extra", actual: b[--j] });
    }
  }
  return out;
}
export function firstUnfinishedWord(target: string, input: string) {
  const a = words(target),
    b = words(input);
  return (
    a.find((w, i) => normalized(w) !== normalized(b[i] ?? "")) ??
    a[a.length - 1] ??
    ""
  );
}
export function copyCharacters(
  target: string,
  actual: string,
  strict: boolean,
) {
  const canonical = (c: string) =>
    strict ? c : c.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  const typed = Array.from(actual).map(canonical).join("");
  let index = 0;
  return Array.from(target).map((char) => {
    const c = canonical(char);
    if (!c) return { char, status: "" };
    const pos = index;
    index += c.length;
    return {
      char,
      status:
        pos < typed.length
          ? typed.slice(pos, pos + c.length) === c
            ? "typed"
            : "mistyped"
          : pos === typed.length
            ? "cursor"
            : "",
    };
  });
}
export function initialState(): State {
  return {
    version: 1,
    decks: [
      {
        id: "starter",
        name: "从这五句开始",
        sentences: [
          {
            id: "sample-1",
            en: "Small steps lead to meaningful progress.",
            zh: "小小的步伐，也能带来有意义的进步。",
          },
          {
            id: "sample-2",
            en: "I am learning to express my ideas clearly.",
            zh: "我正在学习清晰地表达自己的想法。",
          },
          {
            id: "sample-3",
            en: "Every mistake is a chance to learn.",
            zh: "每一次错误，都是一次学习的机会。",
          },
          {
            id: "sample-4",
            en: "Practice makes a little more possible each day.",
            zh: "练习让每一天多一点可能。",
          },
          {
            id: "sample-5",
            en: "Take your time and enjoy the process.",
            zh: "慢慢来，享受这个过程。",
          },
        ],
      },
    ],
    reviews: {},
    settings: { strict: false, sound: true, rate: 0.85, soundVersion: 1 },
    session: null,
    history: [],
  };
}
const obj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max = 2000): v is string =>
  typeof v === "string" && v.length <= max;
const bool = (v: unknown) => typeof v === "boolean";
export function isProjectAudioUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      u.hostname === "raw.githubusercontent.com" &&
      !u.username &&
      !u.password &&
      !u.search &&
      !u.hash &&
      /^\/aha-moment-art\/(british-ear|WordLeap|BritSpeak|level-up-cards)\/[a-f0-9]{40}\/.+\.mp3$/.test(
        u.pathname,
      )
    );
  } catch {
    return false;
  }
}
export function validSentence(v: unknown): v is Sentence {
  return (
    obj(v) &&
    str(v.id, 100) &&
    !!v.id &&
    str(v.en, 600) &&
    words(v.en).length > 0 &&
    str(v.zh, 1000) &&
    (v.note === undefined || str(v.note, 2000)) &&
    (v.recordings === undefined ||
      (Array.isArray(v.recordings) &&
        v.recordings.length <= 3 &&
        v.recordings.every(
          (r) =>
            obj(r) &&
            str(r.label, 80) &&
            str(r.text, 600) &&
            isProjectAudioUrl(r.url),
        ))) &&
    (v.credit === undefined ||
      (obj(v.credit) &&
        str(v.credit.label, 250) &&
        str(v.credit.url, 500) &&
        /^https:\/\/(github\.com\/aha-moment-art\/|tatoeba\.org\/en\/sentences\/show\/)/.test(
          v.credit.url,
        )))
  );
}
export function validateState(value: unknown): State {
  if (
    !obj(value) ||
    value.version !== 1 ||
    !Array.isArray(value.decks) ||
    value.decks.length > 1000 ||
    !obj(value.reviews) ||
    !obj(value.settings) ||
    !Array.isArray(value.history)
  )
    throw Error("文件格式不正确，或来自不支持的版本。");
  const ids = new Set<string>(),
    deckIds = new Set<string>();
  let count = 0;
  for (const d of value.decks) {
    if (
      !obj(d) ||
      !str(d.id, 100) ||
      !d.id ||
      deckIds.has(d.id) ||
      !str(d.name, 80) ||
      !d.name.trim() ||
      !Array.isArray(d.sentences)
    )
      throw Error("句组数据不完整。");
    deckIds.add(d.id);
    for (const s of d.sentences) {
      if (!validSentence(s) || ids.has(s.id))
        throw Error("句子数据无效或存在重复编号。");
      ids.add(s.id);
      count++;
    }
  }
  if (count > 100000) throw Error("一次最多导入 100,000 条练习内容。");
  for (const [id, r] of Object.entries(value.reviews))
    if (
      !ids.has(id) ||
      !obj(r) ||
      !Number.isInteger(r.step) ||
      Number(r.step) < -1 ||
      Number(r.step) > 2 ||
      !str(r.due) ||
      !Number.isFinite(Date.parse(r.due)) ||
      !str(r.lastPracticed) ||
      !Number.isFinite(Date.parse(r.lastPracticed)) ||
      !bool(r.needsReview)
    )
      throw Error("复习记录无效。");
  const st = value.settings;
  if (
    !bool(st.strict) ||
    !bool(st.sound) ||
    typeof st.rate !== "number" ||
    st.rate < 0.5 ||
    st.rate > 1.5
  )
    throw Error("设置数据无效。");
  if (
    value.history.length > 100000 ||
    value.history.some(
      (h) =>
        !obj(h) ||
        !str(h.id, 100) ||
        !str(h.date) ||
        !Number.isFinite(Date.parse(h.date)) ||
        !Number.isInteger(h.count) ||
        Number(h.count) < 0 ||
        !Number.isInteger(h.independent) ||
        Number(h.independent) < 0 ||
        Number(h.independent) > Number(h.count),
    )
  )
    throw Error("练习历史无效。");
  if (value.session !== null) {
    const s = value.session;
    if (
      !obj(s) ||
      !str(s.id, 100) ||
      !str(s.name, 80) ||
      !Array.isArray(s.tasks) ||
      !s.tasks.length ||
      s.tasks.length > 100 ||
      !Number.isInteger(s.index) ||
      Number(s.index) < 0 ||
      Number(s.index) >= s.tasks.length ||
      !str(s.input, 5000) ||
      !Number.isInteger(s.hint) ||
      Number(s.hint) < 0 ||
      Number(s.hint) > 3 ||
      !(s.checked === null || bool(s.checked)) ||
      !bool(s.currentError) ||
      !bool(s.currentHelp) ||
      !bool(s.retryAdded) ||
      !bool(s.complete) ||
      !bool(s.strict) ||
      typeof s.started !== "number" ||
      !Number.isFinite(s.started) ||
      !obj(s.results)
    )
      throw Error("练习位置无效。");
    for (const t of s.tasks)
      if (
        !obj(t) ||
        !validSentence(t.sentence) ||
        !ids.has(t.sentence.id) ||
        !["copy", "cloze", "recall"].includes(String(t.phase)) ||
        !bool(t.retry)
      )
        throw Error("练习内容无效。");
    for (const [id, r] of Object.entries(s.results))
      if (
        !ids.has(id) ||
        !obj(r) ||
        !["help", "error", "independent", "lastClean", "recalled"].every((k) =>
          bool(r[k]),
        )
      )
        throw Error("练习结果无效。");
  }
  // Copy only known fields to keep imported data inert.
  const v = value as unknown as State;
  return {
    version: 1,
    decks: v.decks.map((d) => ({
      id: d.id,
      name: d.name,
      sentences: d.sentences.map((s) => ({
        id: s.id,
        en: s.en,
        zh: s.zh,
        ...(s.note !== undefined ? { note: s.note } : {}),
        ...(s.recordings
          ? {
              recordings: s.recordings.map((r) => ({
                label: r.label,
                url: r.url,
                text: r.text,
              })),
            }
          : {}),
        ...(s.credit
          ? { credit: { label: s.credit.label, url: s.credit.url } }
          : {}),
      })),
    })),
    reviews: Object.fromEntries(
      Object.entries(v.reviews).map(([id, r]) => [
        id,
        {
          step: r.step,
          due: r.due,
          needsReview: r.needsReview,
          lastPracticed: r.lastPracticed,
        },
      ]),
    ),
    settings: {
      strict: v.settings.strict,
      sound: v.settings.soundVersion === 1 ? v.settings.sound : true,
      soundVersion: 1,
      rate: v.settings.rate,
    },
    session: v.session,
    history: v.history.map((h) => ({
      id: h.id,
      date: h.date,
      count: h.count,
      independent: h.independent,
    })),
  };
}
