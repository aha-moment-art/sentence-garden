import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Headphones,
  Search,
  Volume2,
} from "lucide-react";
import {
  loadIndex,
  loadCollection,
  type CatalogIndex,
  type CatalogCollection,
  type CatalogSummary,
} from "./catalog";
import type { Sentence, Recording } from "./engine";
import { audioSource, audioLabel } from "./audio";
const names: Record<string, string> = {
  "british-ear": "British Ear",
  WordLeap: "WordLeap",
  BritSpeak: "BritSpeak",
  "level-up-cards": "Level Up",
};
const descriptions: Record<string, string> = {
  "british-ear": "真人英式英语 · ARU 与视频逐句原声",
  WordLeap: "IELTS / TOEFL / 四六级 / 专四专八 / PTE",
  BritSpeak: "英国议会现场 · 中英对照跟读",
  "level-up-cards": "每日例句 · 词条英美音 · 整段听力",
};
export default function CatalogLibrary({
  back,
  start,
  initialMode,
}: {
  back: () => void;
  start: (id: string, name: string, items: Sentence[], direct: boolean) => void;
  initialMode: "typing" | "dictation";
}) {
  const [index, setIndex] = useState<CatalogIndex | null>(null),
    [collection, setCollection] = useState<CatalogCollection | null>(null),
    [selected, setSelected] = useState<CatalogSummary | null>(null),
    [project, setProject] = useState(""),
    [mode, setMode] = useState<"sentences" | "words">("sentences"),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(0),
    [group, setGroup] = useState(1),
    [direct, setDirect] = useState(initialMode === "dictation"),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0),
    [listening, setListening] = useState("");
  const player = useRef<HTMLAudioElement | null>(null),
    region = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    setError("");
    loadIndex(abort.signal)
      .then(setIndex)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => abort.abort();
  }, [retry]);
  useEffect(() => {
    if (!selected) return;
    const abort = new AbortController();
    setCollection(null);
    setError("");
    setPage(0);
    setGroup(1);
    setQuery("");
    loadCollection(selected, abort.signal)
      .then(setCollection)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => abort.abort();
  }, [selected, retry]);
  useEffect(() => {
    player.current?.pause();
    setListening("");
    return () => {
      player.current?.pause();
    };
  }, [selected, mode, page, project]);
  const choose = (s: CatalogSummary) => {
    if (s.id !== selected?.id) setCollection(null);
    setSelected(s);
    setMode("sentences");
  };
  const changeProject = (p: string) => {
    setProject(p);
    const first = index?.collections.find((c) => c.project === p);
    if (first) choose(first);
  };
  const play = (r: Recording) => {
    player.current?.pause();
    const a = new Audio(r.url);
    player.current = a;
    setListening(r.label);
    a.onended = () => setListening("");
    a.onerror = () => {
      setListening("");
      setError("原音频暂时无法播放，请检查网络后重试。");
    };
    void a.play().catch(() => {
      setListening("");
      setError("播放未能启动，请再试一次。");
    });
  };
  const rows = (collection?.[mode] ?? []).filter(
    (s) =>
      !query ||
      `${s.en} ${s.zh} ${s.note ?? ""}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const maxPage = Math.max(1, Math.ceil(rows.length / 20)),
    maxGroup = Math.max(1, Math.ceil(rows.length / 5));
  const launch = (offset: number) => {
    if (!collection || collection.id !== selected?.id) return;
    start(
      `${collection.id}:${mode}`,
      `${names[collection.project]} · ${collection.name}${mode === "words" ? " · 词汇" : ""}`,
      rows.slice(offset, offset + 5),
      direct,
    );
  };
  return (
    <section className="catalog-library">
      <div className="catalog-heading">
        <div>
          <div className="eyebrow">FROM YOUR PROJECTS</div>
          <h2>熟悉的素材，新的练习方式。</h2>
          <p>
            保留原项目的分类与声音。每次选 5
            条开始，练过的内容会自动留在“我的句库”。
          </p>
        </div>
        <button className="button secondary" onClick={back}>
          <ArrowLeft size={16} />
          我的句库
        </button>
      </div>
      {error && (
        <div className="storage-alert" role="alert">
          {error}
          <button onClick={() => setRetry(retry + 1)}>重试</button>
        </div>
      )}
      {!index && !error && (
        <p className="catalog-loading" role="status">
          正在打开项目句库…
        </p>
      )}
      {index && (
        <>
          <div className="project-grid">
            {Object.entries(index.counts).map(([key, count]) => (
              <button
                className={
                  project === key ? "project-card selected" : "project-card"
                }
                key={key}
                onClick={() => changeProject(key)}
              >
                <BookOpen size={23} />
                <h3>{names[key]}</h3>
                <p>{descriptions[key]}</p>
                <span>
                  {count.sentences.toLocaleString()} 例句
                  {count.words ? ` · ${count.words.toLocaleString()} 词条` : ""}
                </span>
              </button>
            ))}
          </div>
          <p className="catalog-count-note">
            数量按原项目分类计数，跨词库、跨日期的重复内容保留。音频使用固定版本的原文件，点播时才加载。
          </p>
          {!selected && (
            <div className="catalog-welcome">
              <Headphones size={30} />
              <p>先选一个项目，再选想练的内容。</p>
            </div>
          )}
          {selected && (
            <>
              <div className="catalog-controls">
                <label>
                  选择分类
                  <select
                    aria-label="项目分类"
                    value={selected.id}
                    onChange={(e) => {
                      const s = index.collections.find(
                        (c) => c.id === e.target.value,
                      );
                      if (s) choose(s);
                    }}
                  >
                    {index.collections
                      .filter((c) => c.project === project)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} · {c.sentenceCount} 例句
                        </option>
                      ))}
                  </select>
                </label>
                <div className="catalog-modes" aria-label="练习内容">
                  <button
                    className={mode === "sentences" ? "selected" : ""}
                    onClick={() => {
                      setMode("sentences");
                      setPage(0);
                      setGroup(1);
                    }}
                  >
                    句子练习
                  </button>
                  <button
                    disabled={!selected.wordCount}
                    className={mode === "words" ? "selected" : ""}
                    onClick={() => {
                      setMode("words");
                      setPage(0);
                      setGroup(1);
                    }}
                  >
                    词汇练习
                  </button>
                </div>
                <label className="catalog-search">
                  <Search size={17} />
                  <input
                    aria-label="搜索项目内容"
                    placeholder="搜索句子、单词或中文"
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setPage(0);
                      setGroup(1);
                    }}
                  />
                </label>
              </div>
              {!collection && !error && (
                <p className="catalog-loading" role="status">
                  正在加载这组内容…
                </p>
              )}
              {collection && (
                <>
                  <div className="catalog-start">
                    <div>
                      <strong>{collection.name}</strong>
                      <p>
                        {rows.length.toLocaleString()} 条
                        {query ? "搜索结果" : ""} ·{" "}
                        {mode === "sentences" ? "句子" : "词汇"}练习
                      </p>
                    </div>
                    <label>
                      第{" "}
                      <input
                        type="number"
                        aria-label="练习组编号"
                        value={group}
                        min={1}
                        max={maxGroup}
                        onChange={(e) =>
                          setGroup(
                            Math.min(
                              maxGroup,
                              Math.max(1, Number(e.target.value) || 1),
                            ),
                          )
                        }
                      />{" "}
                      / {maxGroup} 组
                    </label>
                    <label className="catalog-direct">
                      <input
                        type="checkbox"
                        checked={direct}
                        onChange={(e) => setDirect(e.target.checked)}
                      />
                      听写模式
                    </label>
                    <button
                      className="button primary"
                      disabled={!rows.length}
                      onClick={() => launch((group - 1) * 5)}
                    >
                      练这 5 条 <ArrowRight size={17} />
                    </button>
                  </div>
                  {project === "level-up-cards" && mode === "sentences" && (
                    <p className="catalog-info">
                      例句新增 ElevenLabs 四种英音，按句固定分配；原有单词英美音仍在“词汇练习”里播放。
                    </p>
                  )}
                  <div className="library-card catalog-rows" ref={region}>
                    {rows.slice(page * 20, (page + 1) * 20).map((s, i) => (
                      <article className="catalog-row" key={s.id}>
                        <span className="number">{page * 20 + i + 1}</span>
                        <div className="catalog-row-body">
                          <p lang="en">{s.en}</p>
                          {s.zh && (
                            <p className="catalog-translation">{s.zh}</p>
                          )}
                          {s.note && <small>{s.note}</small>}
                          {s.credit && (
                            <a
                              className="catalog-credit"
                              href={s.credit.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {s.credit.label}
                            </a>
                          )}
                          <div className="catalog-row-actions">
                            {s.recordings?.map((r) => (
                              <button
                                key={r.label}
                                className="button quiet"
                                onClick={() => play(r)}
                              >
                                <Volume2 size={15} />
                                {r.label}
                              </button>
                            ))}
                            {!s.recordings?.length && audioSource(s.en, [], s) && (
                              <button className="button quiet" onClick={() => play({
                                label: audioLabel(s.en, [], s),
                                text: s.en,
                                url: audioSource(s.en, [], s)!,
                              })}>
                                <Volume2 size={15} />{audioLabel(s.en, [], s)}
                              </button>
                            )}
                            {!s.recordings?.length && !audioSource(s.en, [], s) && (
                              <span className="no-source-audio">
                                暂无独立配音 · 练习时使用设备朗读
                              </span>
                            )}
                            <button
                              className="text-button"
                              onClick={() => launch(page * 20 + i)}
                            >
                              从这里练习 <ArrowRight size={14} />
                            </button>
                          </div>
                        </div>
                      </article>
                    ))}
                    {!rows.length && (
                      <p className="empty">没有匹配的内容，换个关键词试试。</p>
                    )}
                  </div>
                  <div className="catalog-pagination">
                    <button
                      className="button secondary"
                      disabled={!page}
                      onClick={() => {
                        setPage(page - 1);
                        region.current?.scrollIntoView({ block: "start" });
                      }}
                    >
                      上一页
                    </button>
                    <span>
                      第 {page + 1} / {maxPage} 页 · 每页 20 条
                    </span>
                    <button
                      className="button secondary"
                      disabled={page + 1 >= maxPage}
                      onClick={() => {
                        setPage(page + 1);
                        region.current?.scrollIntoView({ block: "start" });
                      }}
                    >
                      下一页
                    </button>
                  </div>
                  {!!collection.tracks.length && (
                    <div className="catalog-tracks">
                      <h3>本日整段听力</h3>
                      <p>来自原日历的完整录音，与上面的单句练习分开播放。</p>
                      {collection.tracks.map((t) => (
                        <div className="catalog-track" key={t.url}>
                          <a
                            href={t.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {t.title}
                          </a>
                          <audio
                            controls
                            preload="none"
                            src={t.url}
                            aria-label={t.title}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}
          {listening && (
            <div className="catalog-player" role="status">
              <Volume2 size={16} />
              正在播放：{listening}
              <button
                onClick={() => {
                  player.current?.pause();
                  setListening("");
                }}
              >
                停止播放
              </button>
            </div>
          )}
          <p className="catalog-license">
            <a href="./library/NOTICE.txt" target="_blank" rel="noreferrer">
              素材来源与许可
            </a>{" "}
            · 练习记录保存在当前浏览器，原项目不受影响。
          </p>
        </>
      )}
    </section>
  );
}
