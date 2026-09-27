import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  Download,
  FilePlus2,
  Headphones,
  Keyboard,
  Leaf,
  Lightbulb,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  Upload,
  Volume2,
  X,
} from "lucide-react";
import {
  checkSession,
  copyCharacters,
  diffWords,
  expected,
  finishState,
  firstUnfinishedWord,
  makeSession,
  maskIndices,
  nextSession,
  uid,
  validateState,
  words,
  type Deck,
  type Phase,
  type Sentence,
  type Session,
  type State,
} from "./engine";
import { readState, writeState, readAudio, replaceAudio, restoreAll } from "./storage";
import { audioSource, validateAudio, mergeAudio, type AudioClip, type AudioPack } from "./audio";

const phaseInfo: Record<
  Phase,
  { name: string; en: string; desc: string; icon: typeof Keyboard }
> = {
  copy: {
    name: "看句跟打",
    en: "FOLLOW",
    desc: "先让指尖熟悉这句话。",
    icon: Keyboard,
  },
  cloze: {
    name: "关键词填空",
    en: "COMPLETE",
    desc: "少一点提示，多一点回忆。",
    icon: Sparkles,
  },
  recall: {
    name: "整句默写",
    en: "RECALL",
    desc: "把记住的表达，写出来。",
    icon: Target,
  },
};
function Modal({
  title,
  children,
  close,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    d.showModal();
    return () => d.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? "modal wide" : "modal"}
      onCancel={close}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button className="icon-button" aria-label="关闭弹窗" onClick={close}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function SentenceImporter({
  close,
  save,
}: {
  close: () => void;
  save: (deck: Deck) => void;
}) {
  const [name, setName] = useState("我的句子"),
    [raw, setRaw] = useState(""),
    [preview, setPreview] = useState(false),
    [error, setError] = useState("");
  const rows = raw
    .split(/\r?\n/)
    .filter((x) => x.trim())
    .map((line) => {
      const [en, ...zh] = line.split("\t");
      return { en: en.trim(), zh: zh.join(" ").trim() };
    });
  const validate = () => {
    if (!name.trim()) return setError("给这一组句子起个名字吧。");
    if (!rows.length) return setError("先粘贴至少一句英文。");
    if (rows.length > 1000)
      return setError("每次最多导入 1,000 句，可以分批导入。");
    if (
      rows.some(
        (r) => !words(r.en).length || r.en.length > 600 || r.zh.length > 1000,
      )
    )
      return setError("每句英文请保持在 600 字符以内，中文在 1,000 字符以内。");
    setError("");
    setPreview(true);
  };
  return (
    <Modal
      title={preview ? "确认你的句子" : "把想记住的句子放进来"}
      close={close}
      wide
    >
      <p className="muted">
        每行一句英文。中文可稍后添加，也可以用 Tab 与英文分隔。
      </p>
      <label className="field">
        句组名称
        <input
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      {!preview ? (
        <label className="field">
          英语句子
          <textarea
            autoFocus
            rows={8}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder={
              "Small steps lead to meaningful progress.\nEvery mistake is a chance to learn."
            }
          />
        </label>
      ) : (
        <div className="import-preview">
          {rows.map((r, i) => (
            <div className="preview-row" key={i}>
              <span className="number">{String(i + 1).padStart(2, "0")}</span>
              <div>
                <p lang="en">{r.en}</p>
                {r.zh && <small>{r.zh}</small>}
              </div>
            </div>
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <span className="muted">{rows.length} 句 · 自动分成每组 5 句练习</span>
        {preview ? (
          <>
            <button
              className="button secondary"
              onClick={() => setPreview(false)}
            >
              返回修改
            </button>
            <button
              className="button primary"
              onClick={() =>
                save({
                  id: uid(),
                  name: name.trim(),
                  sentences: rows.map((r) => ({ ...r, id: uid() })),
                })
              }
            >
              确认导入 <Check size={17} />
            </button>
          </>
        ) : (
          <button className="button primary" onClick={validate}>
            预览句子 <ArrowRight size={17} />
          </button>
        )}
      </div>
    </Modal>
  );
}
function SentenceEditor({
  sentence,
  save,
  close,
}: {
  sentence: Sentence;
  save: (s: Sentence) => void;
  close: () => void;
}) {
  const [en, setEn] = useState(sentence.en),
    [zh, setZh] = useState(sentence.zh);
  return (
    <Modal title="编辑句子" close={close}>
      <label className="field">
        英文
        <textarea
          rows={4}
          maxLength={600}
          value={en}
          onChange={(e) => setEn(e.target.value)}
        />
      </label>
      <label className="field">
        中文提示（可选）
        <textarea
          rows={3}
          maxLength={1000}
          value={zh}
          onChange={(e) => setZh(e.target.value)}
        />
      </label>
      <p className="muted">修改后，这一句的复习进度会重新开始。</p>
      <button
        className="button primary full"
        disabled={!words(en).length}
        onClick={() => save({ ...sentence, en: en.trim(), zh: zh.trim() })}
      >
        保存句子
      </button>
    </Modal>
  );
}
function ChooseSession({
  decks,
  initialDeckId,
  start,
  close,
}: {
  decks: Deck[];
  initialDeckId: string;
  start: (deck: Deck, start: number, direct: boolean) => void;
  close: () => void;
}) {
  const [deckId, setDeckId] = useState(
      decks.find((d) => d.id === initialDeckId)?.id ?? decks[0]?.id ?? "",
    ),
    [part, setPart] = useState(0),
    [direct, setDirect] = useState(false);
  const deck = decks.find((d) => d.id === deckId);
  return (
    <Modal title="选一组，慢慢记住" close={close}>
      <label className="field">
        句库
        <select
          value={deckId}
          onChange={(e) => {
            setDeckId(e.target.value);
            setPart(0);
          }}
        >
          {decks.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} · {d.sentences.length} 句
            </option>
          ))}
        </select>
      </label>
      {deck && (
        <div className="part-grid">
          {Array.from(
            { length: Math.ceil(deck.sentences.length / 5) },
            (_, i) => (
              <button
                className={part === i ? "part selected" : "part"}
                key={i}
                onClick={() => setPart(i)}
              >
                第 {i + 1} 组{" "}
                <small>
                  {i * 5 + 1}–{Math.min((i + 1) * 5, deck.sentences.length)} 句
                </small>
              </button>
            ),
          )}
        </div>
      )}
      <label className="check-row">
        <input
          type="checkbox"
          checked={direct}
          onChange={(e) => setDirect(e.target.checked)}
        />
        <span>
          直接挑战默写<small>已经熟悉的句子，可以跳过跟打和填空。</small>
        </span>
      </label>
      <p className="muted">
        开始新组会替换当前未完成的练习，已完成的复习记录会保留。
      </p>
      <button
        className="button primary full"
        disabled={!deck?.sentences.length}
        onClick={() => deck && start(deck, part * 5, direct)}
      >
        开始这一组 <ArrowRight size={18} />
      </button>
    </Modal>
  );
}
export default function App() {
  const [state, setState] = useState<State | null>(null),
    [bootError, setBootError] = useState(""),
    [storageError, setStorageError] = useState(""),
    [saved, setSaved] = useState(true);
  const [page, setPage] = useState<"practice" | "library" | "review">(
      "practice",
    ),
    [modal, setModal] = useState<"import" | "choose" | "settings" | null>(null),
    [editing, setEditing] = useState<Sentence | null>(null),
    [selectedDeck, setSelectedDeck] = useState("");
  const [incoming, setIncoming] = useState<State | null>(null),
    [notice, setNotice] = useState(""),
    [confirm, setConfirm] = useState<{
      title: string;
      message: string;
      action: () => void;
    } | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]),
    [speaking, setSpeaking] = useState(false),
    [clock, setClock] = useState(Date.now());
  const [audioClips,setAudioClips]=useState<AudioClip[]>([]),[incomingAudio,setIncomingAudio]=useState<AudioClip[]>([]),[audioPack,setAudioPack]=useState<AudioPack|null>(null),[audioBusy,setAudioBusy]=useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null),
    nextRef = useRef<HTMLButtonElement>(null),
    fileRef = useRef<HTMLInputElement>(null),
    audioRef = useRef<AudioContext | null>(null),
    narrationRef = useRef<HTMLAudioElement|null>(null),
    saveId = useRef(0);
  const speechSupported =
    typeof window !== "undefined" &&
    typeof window.speechSynthesis !== "undefined" &&
    typeof window.SpeechSynthesisUtterance !== "undefined";
  useEffect(() => {
    let active = true;
    Promise.all([readState(),readAudio()])
      .then(([s,clips]) => {
        if (active) {
          if (!s.session && s.decks[0]?.sentences.length)
            s.session = makeSession(
              s.decks[0].name,
              s.decks[0].sentences.slice(0, 5),
              s.settings.strict,
            );
          setState(s);
          setAudioClips(clips);
          setSelectedDeck(s.decks[0]?.id ?? "");
        }
      })
      .catch(
        () =>
          active &&
          setBootError(
            "暂时无法读取本地记录。请允许浏览器使用网站储存，然后重试。原有数据没有被覆盖。",
          ),
      );
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!state) return;
    const id = ++saveId.current;
    setSaved(false);
    writeState(state)
      .then(() => {
        if (id === saveId.current) {
          setSaved(true);
          setStorageError("");
        }
      })
      .catch(() =>
        setStorageError("本地保存失败，请导出记录，避免关闭页面后丢失。"),
      );
  }, [state]);
  useEffect(() => {
    if (!speechSupported) return;
    const update = () =>
      setVoices(
        window.speechSynthesis
          .getVoices()
          .filter((v) => /^en[-_]/i.test(v.lang)),
      );
    update();
    window.speechSynthesis.addEventListener("voiceschanged", update);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", update);
      window.speechSynthesis.cancel();
    };
  }, [speechSupported]);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(t);
  }, [notice]);
  const session = state?.session,
    task = session && !session.complete ? session.tasks[session.index] : null;
  const currentAudio=task?audioSource(task.sentence.en,audioClips):null;
  useEffect(() => {
    if (page === "practice" && !modal && !incoming && !confirm && !editing) {
      if (session?.checked) nextRef.current?.focus();
      else inputRef.current?.focus();
    }
  }, [
    session?.index,
    session?.id,
    session?.checked,
    page,
    modal,
    incoming,
    confirm,
    editing,
  ]);
  useEffect(() => {
    narrationRef.current?.pause();
    narrationRef.current=null;
    setSpeaking(false);
    if (speechSupported) {
      window.speechSynthesis.cancel();
    }
    return ()=>{narrationRef.current?.pause();};
  }, [session?.index, session?.id, page, speechSupported]);
  useEffect(() => {
    const f = (e: BeforeUnloadEvent) => {
      if (!saved || storageError || audioBusy) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", f);
    return () => window.removeEventListener("beforeunload", f);
  }, [saved, storageError, audioBusy]);
  if (!state)
    return (
      <div className="loading">
        <span className="brand-symbol">“</span>
        <h1>句间</h1>
        <p>{bootError || "正在打开你的练习台…"}</p>
        {bootError && (
          <button className="button primary" onClick={() => location.reload()}>
            重新读取
          </button>
        )}
      </div>
    );
  const allSentences = state.decks.flatMap((d) => d.sentences),
    total = allSentences.length;
  const due = allSentences.filter(
    (s) => state.reviews[s.id] && Date.parse(state.reviews[s.id].due) <= clock,
  );
  const scheduled = allSentences
    .filter((s) => state.reviews[s.id])
    .sort(
      (a, b) =>
        Date.parse(state.reviews[a.id].due) -
        Date.parse(state.reviews[b.id].due),
    );
  const activeDeck =
    state.decks.find((d) => d.id === selectedDeck) ?? state.decks[0];
  const phase = task ? phaseInfo[task.phase] : phaseInfo.copy;
  const sessionUnique = session
    ? [
        ...new Map(
          session.tasks.map((t) => [t.sentence.id, t.sentence]),
        ).values(),
      ]
    : [];
  const setSession = (s: Session) =>
    setState((prev) => (prev ? finishState(prev, s) : prev));
  const start = (deck: Deck, offset: number, direct: boolean) => {
    setSession(
      makeSession(
        deck.name,
        deck.sentences.slice(offset, offset + 5),
        state.settings.strict,
        direct,
      ),
    );
    setPage("practice");
    setModal(null);
  };
  const startReview = (sentences: Sentence[]) => {
    const go = () => {
      setSession(
        makeSession(
          "到期复习",
          sentences.slice(0, 5),
          state.settings.strict,
          true,
        ),
      );
      setPage("practice");
      setConfirm(null);
    };
    if (session && !session.complete)
      setConfirm({
        title: "开始复习？",
        message: "当前未完成的练习会被替换，已完成的记录会保留。",
        action: go,
      });
    else go();
  };
  const tick = () => {
    if (!state.settings.sound) return;
    try {
      audioRef.current ??= new AudioContext();
      const ctx = audioRef.current;
      void ctx.resume();
      const o = ctx.createOscillator(),
        g = ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(460, ctx.currentTime);
      g.gain.setValueAtTime(0.025, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.035);
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.04);
    } catch {
      /* Sound is optional. */
    }
  };
  const updateInput = (value: string) => {
    if (!session || !task) return;
    const hasError =
      task.phase === "copy" &&
      copyCharacters(task.sentence.en, value, session.strict).some(
        (c) => c.status === "mistyped",
      );
    setSession({
      ...session,
      input: value,
      checked: null,
      currentError: session.currentError || hasError,
    });
  };
  const hint = () => {
    if (!session) return;
    setSession({
      ...session,
      hint: Math.min(3, session.hint + 1),
      currentHelp: true,
    });
  };
  const check = () => {
    if (!session || !session.input.trim()) return;
    setSession(checkSession(session));
  };
  const advance = () => {
    if (!session) return;
    const n = nextSession(session);
    if (!n.complete && n.tasks[n.index].phase !== task?.phase)
      setNotice(
        `完成${phase.name}，进入${phaseInfo[n.tasks[n.index].phase].name}。`,
      );
    setSession(n);
  };
  const play = () => {
    if (!task || !session) return;
    if (speaking) {
      if(speechSupported)window.speechSynthesis.cancel();
      narrationRef.current?.pause();
      setSpeaking(false);
      return;
    }
    if(currentAudio){
      const audio=new Audio(currentAudio);narrationRef.current=audio;
      audio.playbackRate=state.settings.rate;
      audio.onended=()=>setSpeaking(false);
      audio.onerror=()=>{setSpeaking(false);setNotice('音频暂时无法播放，请重新导入音频包或检查网络。');};
      setSpeaking(true);
      if(task.phase==='recall')setSession({...session,currentHelp:true});
      void audio.play().catch(()=>{setSpeaking(false);setNotice('播放未能启动，请再点一次朗读。');});
      return;
    }
    if(!speechSupported)return;
    if (!voices.length) {
      setNotice("设备暂无可用的英语语音，仍可继续文字练习。");
      return;
    }
    const u = new SpeechSynthesisUtterance(task.sentence.en);
    u.voice = voices.find((v) => /^en[-_]GB$/i.test(v.lang)) ?? voices[0];
    u.lang = u.voice.lang;
    u.rate = state.settings.rate;
    u.onend = () => setSpeaking(false);
    u.onerror = () => {
      setSpeaking(false);
      setNotice("这次朗读未能播放，请检查设备语音设置。");
    };
    if (task.phase === "recall") setSession({ ...session, currentHelp: true });
    setSpeaking(true);
    window.speechSynthesis.speak(u);
  };
  const exportData = () => {
    const blob = new Blob([JSON.stringify({...state,audioClips:audioClips.filter(c=>allSentences.some(s=>s.en===c.text))}, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `句间记录-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };
  const importFile = async (file: File) => {
    try {
      if (file.size > 100 * 1024 * 1024)
        throw Error("文件超过 100 MB，请分批导入。");
      const value=JSON.parse(await file.text());
      if(value?.format==='sentence-garden-audio'){
        if(value.version!==1||typeof value.voice!=='string'||value.voice.length>120)throw Error('音频包版本或声音信息无效。');
        const clips=validateAudio(value.clips);
        if(!clips.length)throw Error('音频包里还没有音频。');
        setAudioPack({format:'sentence-garden-audio',version:1,voice:value.voice,clips});
      }else{
        const data=validateState(value),clips=validateAudio(value.audioClips);
        setIncoming(data);setIncomingAudio(clips);
      }
    } catch (e) {
      setNotice(
        e instanceof SyntaxError
          ? "这不是有效的 JSON 文件。"
          : e instanceof Error
            ? e.message
            : "无法读取文件。",
      );
    }
  };
  const removeSentence = (s: Sentence) =>
    setConfirm({
      title: "删除这句话？",
      message: "该句的复习记录会同时删除；当前练习将结束。",
      action: () => {
        setState((p) => {
          if (!p) return p;
          const reviews = { ...p.reviews };
          delete reviews[s.id];
          return {
            ...p,
            session: null,
            reviews,
            decks: p.decks.map((d) => ({
              ...d,
              sentences: d.sentences.filter((x) => x.id !== s.id),
            })),
          };
        });
        setConfirm(null);
      },
    });
  const saveSentence = (s: Sentence) => {
    setState((p) => {
      if (!p) return p;
      const reviews = { ...p.reviews };
      delete reviews[s.id];
      return {
        ...p,
        reviews,
        session: null,
        decks: p.decks.map((d) => ({
          ...d,
          sentences: d.sentences.map((x) => (x.id === s.id ? s : x)),
        })),
      };
    });
    setEditing(null);
    setNotice("句子已保存，可以开始新的练习。");
  };
  const today = new Date().toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  });
  const practiced = state.history
    .filter(
      (h) => new Date(h.date).toDateString() === new Date().toDateString(),
    )
    .reduce((sum, h) => sum + h.count, 0);
  return (
    <div className="app-shell">
      <header className="header">
        <button
          className="brand"
          onClick={() => setPage("practice")}
          aria-label="句间首页"
        >
          <span className="brand-symbol">“</span>
          <span>
            句间<small>SENTENCE GARDEN</small>
          </span>
        </button>
        <nav aria-label="主要导航">
          <button
            className={page === "practice" ? "nav-link active" : "nav-link"}
            onClick={() => setPage("practice")}
          >
            <Keyboard size={18} />
            开始练习
          </button>
          <button
            className={page === "library" ? "nav-link active" : "nav-link"}
            onClick={() => setPage("library")}
          >
            <BookOpen size={18} />
            我的句库
          </button>
          <button
            className={page === "review" ? "nav-link active" : "nav-link"}
            onClick={() => setPage("review")}
          >
            <RotateCcw size={18} />
            待复习
            {due.length > 0 && <span className="badge">{due.length}</span>}
          </button>
        </nav>
        <button
          className="icon-button settings-button"
          aria-label="练习设置"
          onClick={() => setModal("settings")}
        >
          <Settings2 size={20} />
        </button>
      </header>
      <main>
        <div className="page-heading">
          <div>
            <div className="eyebrow">
              YOUR DAILY PRACTICE <span>·</span> {today}
            </div>
            <h1>
              {page === "practice"
                ? "让每一句，慢慢成为你的。"
                : page === "library"
                  ? "收藏表达，也练习表达。"
                  : "再见一面，记得更久。"}
            </h1>
          </div>
          <button
            className="button secondary import-button"
            onClick={() => setModal("import")}
          >
            <Plus size={18} />
            导入我的句子
          </button>
        </div>
        {storageError && (
          <div role="alert" className="storage-alert">
            {storageError}
            <button onClick={exportData}>导出记录</button>
            <button onClick={() => setState({ ...state })}>重试保存</button>
          </div>
        )}
        {page === "practice" && (
          <div className="practice-layout">
            <section className="practice-column">
              {session?.complete ? (
                <section className="practice-card result-card">
                  <span className="completion-mark">
                    <Check size={32} />
                  </span>
                  <div className="eyebrow">SESSION COMPLETE</div>
                  <h2>这一组，离你更近了。</h2>
                  <p className="muted">本轮通过。记住一句话，值得再见几次。</p>
                  <div className="result-stats">
                    <div>
                      <strong>
                        {
                          Object.values(session.results).filter(
                            (r) => r.independent,
                          ).length
                        }
                        <small>/{sessionUnique.length}</small>
                      </strong>
                      <span>首次独立默写</span>
                    </div>
                    <div>
                      <strong>
                        {
                          Object.values(session.results).filter((r) => r.help)
                            .length
                        }
                      </strong>
                      <span>使用过提示</span>
                    </div>
                    <div>
                      <strong>
                        {
                          sessionUnique.filter(
                            (s) => state.reviews[s.id]?.needsReview,
                          ).length
                        }
                      </strong>
                      <span>还需练习</span>
                    </div>
                  </div>
                  <div className="result-list">
                    {sessionUnique.map((s) => (
                      <div key={s.id}>
                        <span
                          className={
                            state.reviews[s.id]?.needsReview
                              ? "result-dot pending"
                              : "result-dot"
                          }
                        >
                          <Check size={13} />
                        </span>
                        <p lang="en">{s.en}</p>
                        <small>
                          {state.reviews[s.id]?.needsReview
                            ? "待复习"
                            : `下次 ${new Date(state.reviews[s.id]?.due ?? Date.now()).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}`}
                        </small>
                      </div>
                    ))}
                  </div>
                  <div className="result-actions">
                    <button
                      className="button secondary"
                      onClick={() => setPage("review")}
                    >
                      看看复习安排
                    </button>
                    <button
                      className="button primary"
                      onClick={() => setModal("choose")}
                    >
                      再练一组 <ArrowRight size={18} />
                    </button>
                  </div>
                </section>
              ) : task && session ? (
                <section className="practice-card" aria-label="句子练习台">
                  <div className="card-top">
                    <div className="pill">
                      <span className="tiny-dot" />
                      {task.retry ? "错句再试" : phase.name}
                    </div>
                    <span className="sentence-count">
                      句子{" "}
                      <strong>
                        {sessionUnique.findIndex(
                          (s) => s.id === task.sentence.id,
                        ) + 1}
                      </strong>{" "}
                      / {sessionUnique.length}
                    </span>
                  </div>
                  <div className="sentence-zone">
                    <div className="sentence-label">
                      {task.phase === "copy"
                        ? "READ & TYPE"
                        : task.phase === "cloze"
                          ? "FILL THE GAPS"
                          : "MAKE IT YOURS"}
                      <span>
                        {task.retry ? "再回忆一次，就很好。" : phase.desc}
                      </span>
                    </div>
                    {task.phase === "copy" ? (
                      <p
                        className="target-sentence"
                        lang="en"
                        aria-label={`原句：${task.sentence.en}`}
                      >
                        {copyCharacters(
                          task.sentence.en,
                          session.input,
                          session.strict,
                        ).map((c, i) => (
                          <span className={c.status} key={i}>
                            {c.char}
                          </span>
                        ))}
                      </p>
                    ) : task.phase === "cloze" ? (
                      <p className="target-sentence cloze-sentence" lang="en">
                        {(() => {
                          let wordIndex = -1;
                          const masked = maskIndices(task.sentence.en);
                          return task.sentence.en
                            .split(/([\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*)/gu)
                            .map((part, i) => {
                              if (i % 2 === 0)
                                return <span key={i}>{part}</span>;
                              wordIndex++;
                              return masked.includes(wordIndex) ? (
                                <span
                                  className={
                                    session.checked ? "blank revealed" : "blank"
                                  }
                                  key={i}
                                >
                                  {session.checked ? (
                                    part
                                  ) : (
                                    <span aria-label="待填单词">
                                      {"_".repeat(Math.min(part.length, 10))}
                                    </span>
                                  )}
                                </span>
                              ) : (
                                <span key={i}>{part}</span>
                              );
                            });
                        })()}
                      </p>
                    ) : (
                      <div className="recall-prompt">
                        <span className="recall-icon">
                          <Target size={26} />
                        </span>
                        <p>
                          {task.sentence.zh ||
                            `试着回忆本组第 ${sessionUnique.findIndex((s) => s.id === task.sentence.id) + 1} 句`}
                        </p>
                        <small>
                          {task.sentence.zh
                            ? "根据意思，写出刚才练过的英文原句。"
                            : "想不起来也没关系，可以逐步查看提示。"}
                        </small>
                      </div>
                    )}
                    {task.phase !== "recall" && task.sentence.zh && (
                      <p className="translation">{task.sentence.zh}</p>
                    )}
                  </div>
                  <div className="typing-zone">
                    <div className="input-heading">
                      <label htmlFor="typing-input">
                        {task.phase === "cloze"
                          ? "按顺序输入缺失的单词，用空格分隔"
                          : "在这里写下你的句子"}
                      </label>
                      <span>
                        {session.strict ? "严格核对" : "忽略大小写与标点"}
                      </span>
                    </div>
                    <textarea
                      id="typing-input"
                      ref={inputRef}
                      className={
                        session.checked === false
                          ? "typing-input has-error"
                          : session.checked
                            ? "typing-input is-correct"
                            : "typing-input"
                      }
                      lang="en"
                      autoCapitalize="off"
                      autoCorrect="off"
                      spellCheck={false}
                      maxLength={1200}
                      value={session.input}
                      disabled={session.checked === true}
                      placeholder={
                        task.phase === "cloze"
                          ? "Type the missing words…"
                          : "Start typing here…"
                      }
                      onChange={(e) => updateInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.nativeEvent.isComposing) return;
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          check();
                        } else if (e.key.length === 1) tick();
                      }}
                    />
                    {session.hint > 0 && (
                      <div className="hint-box">
                        <Lightbulb size={17} />
                        <div>
                          {session.hint === 1 ? (
                            <>
                              下一个词的首字母：
                              <strong>
                                {firstUnfinishedWord(
                                  expected(task),
                                  session.input,
                                ).slice(0, 1)}
                              </strong>
                            </>
                          ) : session.hint === 2 ? (
                            <>
                              下一个词：
                              <strong lang="en">
                                {firstUnfinishedWord(
                                  expected(task),
                                  session.input,
                                )}
                              </strong>
                            </>
                          ) : (
                            <span lang="en">{task.sentence.en}</span>
                          )}
                        </div>
                      </div>
                    )}
                    <div aria-live="polite">
                      {session.checked === false && (
                        <div className="feedback error-feedback">
                          <p>
                            还差一点，修改后再核对。
                            <small>漏词 / 错词 / 多余词已标出</small>
                          </p>
                          <div className="diff-words">
                            {diffWords(
                              expected(task),
                              session.input,
                              session.strict,
                            ).map((d, i) => (
                              <span key={i} className={`diff ${d.kind}`}>
                                {d.kind === "correct" ? (
                                  d.expected
                                ) : d.kind === "missing" ? (
                                  `漏：${d.expected}`
                                ) : d.kind === "extra" ? (
                                  `多：${d.actual}`
                                ) : (
                                  <>
                                    <del>{d.actual}</del> → {d.expected}
                                  </>
                                )}
                              </span>
                            ))}
                          </div>
                          {session.strict && (
                            <small>严格模式也核对大小写、空格和标点。</small>
                          )}
                        </div>
                      )}
                      {session.checked === true && (
                        <div className="feedback success-feedback">
                          <CheckCircle2 size={19} />
                          <span>
                            {session.currentHelp || session.currentError
                              ? "修正完成，很好。稍后再回忆一次。"
                              : task.phase === "recall"
                                ? "独立想起来了，本轮通过！"
                                : "这一句完成，继续保持。"}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="typing-actions">
                      <div className="assist-actions">
                        <button
                          className="button quiet"
                          onClick={play}
                          disabled={!currentAudio&&(!speechSupported || !voices.length)}
                          title={
                            currentAudio ? 'ElevenLabs 音频 · 播放不消耗生成额度' : !voices.length ? "导入音频包后即可朗读" : "这句话尚未导入音频，使用设备语音"
                          }
                        >
                          {speaking ? (
                            <Pause size={17} />
                          ) : (
                            <Volume2 size={18} />
                          )}
                          <span>{speaking ? "停止" : currentAudio?'朗读':'设备朗读'}</span>
                        </button>
                        <button
                          className="button quiet"
                          disabled={
                            session.hint >= 3 || session.checked === true
                          }
                          onClick={hint}
                        >
                          <Lightbulb size={18} />
                          <span>
                            {session.hint === 0
                              ? "给我一点提示"
                              : session.hint === 1
                                ? "提示完整词"
                                : session.hint === 2
                                  ? "查看原句"
                                  : "已显示原句"}
                          </span>
                        </button>
                      </div>
                      {session.checked ? (
                        <button
                          ref={nextRef}
                          className="button primary"
                          onClick={advance}
                        >
                          {session.index === session.tasks.length - 1
                            ? session.retryAdded
                              ? "查看结果"
                              : "完成此阶段"
                            : "下一句"}
                          <ArrowRight size={18} />
                        </button>
                      ) : (
                        <button
                          className="button primary"
                          disabled={!session.input.trim()}
                          onClick={check}
                        >
                          核对 <span className="keycap">↵</span>
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="card-bottom">
                    <span>
                      <ShieldCheck size={14} />
                      {saved ? "练习位置已保存" : "正在保存…"}
                    </span>
                    <span>不用抢时间，记住更重要。</span>
                  </div>
                </section>
              ) : (
                <section className="practice-card empty">
                  <BookOpen size={36} />
                  <h2>从想记住的一句话开始。</h2>
                  <p>导入自己的英语句子，或者从句库选一组。</p>
                  <button
                    className="button primary"
                    onClick={() => setModal(total ? "choose" : "import")}
                  >
                    {total ? "选择句组" : "导入句子"}
                    <ArrowRight size={18} />
                  </button>
                </section>
              )}
              <div className="practice-note">
                <span className="note-icon">
                  <Leaf size={18} />
                </span>
                <div>
                  <strong>每一次回忆，都在靠近熟悉。</strong>
                  <p>忘记很正常。需要时给自己一点提示，再试一次就好。</p>
                </div>
                <span className="note-lines" aria-hidden="true">
                  〰
                </span>
              </div>
            </section>
            <aside className="practice-sidebar">
              <div className="side-card">
                <div className="side-heading">
                  <span>当前练习</span>
                  <button
                    className="icon-button"
                    aria-label="更换句组"
                    onClick={() => setModal("choose")}
                  >
                    <MoreHorizontal size={20} />
                  </button>
                </div>
                <h3>{session?.name ?? "还没有开始"}</h3>
                <p className="muted small">
                  {sessionUnique.length} 句 · 一小步，也算数
                </p>
                <div className="mini-progress">
                  <span
                    style={{
                      width: `${session ? (session.complete ? 100 : (session.index / session.tasks.length) * 100) : 0}%`,
                    }}
                  />
                </div>
                <div className="stage-list">
                  {(["copy", "cloze", "recall"] as Phase[]).map((p, i) => {
                    const Icon = phaseInfo[p].icon;
                    const active = task?.phase === p;
                    const done =
                      !!session &&
                      (session.complete ||
                        (["copy", "cloze", "recall"].indexOf(
                          task?.phase ?? "copy",
                        ) > i &&
                          !session.tasks.every((t) => t.phase === "recall")));
                    return (
                      <div
                        className={
                          active
                            ? "stage active"
                            : done
                              ? "stage done"
                              : "stage"
                        }
                        key={p}
                      >
                        <span className="stage-icon">
                          {done ? <Check size={17} /> : <Icon size={17} />}
                        </span>
                        <div>
                          <strong>{phaseInfo[p].name}</strong>
                          <small>
                            {i === 0
                              ? "熟悉表达"
                              : i === 1
                                ? "找回关键词"
                                : "试着独立回忆"}
                          </small>
                        </div>
                        {active && (
                          <span className="stage-current">进行中</span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <button
                  className="button secondary full"
                  onClick={() => setModal("choose")}
                >
                  换一组句子 <ChevronRight size={16} />
                </button>
              </div>
              <div className="side-card today-card">
                <div className="side-heading">
                  <span>今天的小进步</span>
                  <Sparkles size={16} />
                </div>
                <div className="today-stat">
                  <strong>{practiced}</strong>
                  <span>句已完成练习</span>
                </div>
                <div className="side-divider" />
                <button
                  className="review-shortcut"
                  onClick={() => setPage("review")}
                >
                  <span>
                    <RotateCcw size={15} />
                    {due.length
                      ? `${due.length} 句等你再见一面`
                      : "暂时没有到期复习"}
                  </span>
                  <ChevronRight size={16} />
                </button>
              </div>
              <p className="side-footnote">
                <Keyboard size={15} /> Enter 核对 · 通过后 Enter 继续
              </p>
            </aside>
          </div>
        )}
        {page === "library" && (
          <section className="library-layout">
            <aside className="side-card deck-sidebar">
              <div className="side-heading">
                <span>我的句库</span>
                <span className="badge neutral">{state.decks.length}</span>
              </div>
              {state.decks.map((d) => (
                <button
                  key={d.id}
                  className={
                    activeDeck?.id === d.id ? "deck-item selected" : "deck-item"
                  }
                  onClick={() => setSelectedDeck(d.id)}
                >
                  <BookOpen size={17} />
                  <span>
                    {d.name}
                    <small>{d.sentences.length} 句</small>
                  </span>
                </button>
              ))}
              <button
                className="button quiet full"
                onClick={() => setModal("import")}
              >
                <Plus size={17} />
                新建句组
              </button>
              <div className="side-divider" />
              <button className="button quiet full" onClick={exportData}>
                <Download size={16} />
                导出全部记录
              </button>
              <button
                className="button quiet full"
                onClick={() => fileRef.current?.click()}
              >
                <Upload size={16} />
                从记录文件恢复
              </button>
              <button className="button quiet full" onClick={()=>fileRef.current?.click()}><Headphones size={16}/>导入音频包</button>
            </aside>
            <div className="library-card">
              <div className="library-heading">
                <div>
                  <div className="eyebrow">YOUR COLLECTION</div>
                  <h2>{activeDeck?.name ?? "你的句库还是空的"}</h2>
                  <p className="muted">
                    {activeDeck?.sentences.length ?? 0} 句 · 每 5
                    句，练习一个小关卡
                  </p>
                </div>
                {!!activeDeck?.sentences.length && (
                  <button
                    className="button primary"
                    onClick={() => setModal("choose")}
                  >
                    <Play size={16} />
                    开始练习
                  </button>
                )}
              </div>
              {activeDeck?.sentences.map((s, i) => (
                <div className="sentence-row" key={s.id}>
                  <span className="number">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <button
                    className="sentence-edit"
                    onClick={() => {
                      if (session && !session.complete)
                        setConfirm({
                          title: "编辑这句话？",
                          message:
                            "保存修改会结束当前练习并重置这句话的复习记录。",
                          action: () => {
                            setConfirm(null);
                            setEditing(s);
                          },
                        });
                      else setEditing(s);
                    }}
                  >
                    <span lang="en">{s.en}</span>
                    <small>{s.zh || "点击添加中文提示或编辑句子"}</small>
                  </button>
                  <button
                    className="icon-button delete-button"
                    aria-label={`删除第 ${i + 1} 句`}
                    onClick={() => removeSentence(s)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              {!activeDeck?.sentences.length && (
                <div className="empty">
                  <FilePlus2 size={36} />
                  <h3>把喜欢的表达留在这里。</h3>
                  <button
                    className="button primary"
                    onClick={() => setModal("import")}
                  >
                    导入英语句子
                  </button>
                </div>
              )}
              {activeDeck && (
                <div className="library-bottom">
                  <span>点击句子可以编辑英文与中文提示。</span>
                  <button
                    className="text-button danger"
                    onClick={() =>
                      setConfirm({
                        title: `删除「${activeDeck.name}」？`,
                        message:
                          "这一句组及其复习记录会被删除，当前练习将结束。",
                        action: () => {
                          setState((p) => {
                            if (!p) return p;
                            const reviews = { ...p.reviews };
                            activeDeck.sentences.forEach(
                              (s) => delete reviews[s.id],
                            );
                            return {
                              ...p,
                              session: null,
                              reviews,
                              decks: p.decks.filter(
                                (d) => d.id !== activeDeck.id,
                              ),
                            };
                          });
                          setConfirm(null);
                        },
                      })
                    }
                  >
                    删除句组
                  </button>
                </div>
              )}
            </div>
          </section>
        )}
        {page === "review" && (
          <section className="review-page">
            <div className="review-banner">
              <div>
                <div className="eyebrow">A LITTLE REVISIT</div>
                <h2>
                  {due.length
                    ? `${due.length} 句，到了再见的时候。`
                    : "今天的回忆，可以慢慢来。"}
                </h2>
                <p>
                  独立答对后，按 1 天、3 天、7
                  天的间隔再见；遇到困难，就重新熟悉。
                </p>
              </div>
              <button
                className="button primary"
                disabled={!due.length}
                onClick={() => startReview(due)}
              >
                <RotateCcw size={17} />
                开始复习{due.length > 5 ? "（前 5 句）" : ""}
              </button>
            </div>
            <div className="library-card">
              <div className="library-heading">
                <h3>复习安排</h3>
                <span className="muted">{scheduled.length} 句已有记录</span>
              </div>
              {scheduled.map((s) => (
                <div className="sentence-row" key={s.id}>
                  <span
                    className={
                      Date.parse(state.reviews[s.id].due) <= clock
                        ? "review-status due"
                        : "review-status"
                    }
                  >
                    {Date.parse(state.reviews[s.id].due) <= clock
                      ? "已到期"
                      : new Date(state.reviews[s.id].due).toLocaleDateString(
                          "zh-CN",
                          { month: "numeric", day: "numeric" },
                        )}
                  </span>
                  <div className="review-text">
                    <p lang="en">{s.en}</p>
                    <small>
                      {state.reviews[s.id].needsReview
                        ? "上次还需要提示或修正"
                        : `本轮通过 · ${[1, 3, 7][state.reviews[s.id].step] ?? 1} 天后再见`}
                    </small>
                  </div>
                  <button
                    className="button quiet"
                    onClick={() => startReview([s])}
                  >
                    练这句 <ArrowRight size={15} />
                  </button>
                </div>
              ))}
              {!scheduled.length && (
                <div className="empty">
                  <Leaf size={36} />
                  <h3>这里会收好你的复习安排。</h3>
                  <p>先完成一组练习，句子就会出现在这里。</p>
                  <button
                    className="button secondary"
                    onClick={() => setPage("practice")}
                  >
                    回到练习台
                  </button>
                </div>
              )}
            </div>
          </section>
        )}
        <footer>
          <span>
            <ShieldCheck size={14} />
            {storageError ? "保存遇到问题" : "记录保存在此浏览器"}
            <span className="footer-separator">·</span>
            清除网站数据可能丢失记录，换设备请导出再导入。
          </span>
          <button className="text-button" onClick={exportData}>
            导出记录 <Download size={14} />
          </button>
        </footer>
      </main>
      {modal === "import" && (
        <SentenceImporter
          close={() => setModal(null)}
          save={(d) => {
            if (
              total + d.sentences.length > 10000 ||
              state.decks.length >= 500
            ) {
              setNotice("句库最多支持 500 组、10,000 句，请先整理现有句库。");
              return;
            }
            setState((p) => (p ? { ...p, decks: [...p.decks, d] } : p));
            setSelectedDeck(d.id);
            setModal(null);
            setPage("library");
            setNotice(`已导入 ${d.sentences.length} 句。`);
          }}
        />
      )}
      {modal === "choose" && (
        <ChooseSession
          decks={state.decks}
          initialDeckId={selectedDeck}
          start={start}
          close={() => setModal(null)}
        />
      )}
      {modal === "settings" && (
        <Modal title="让练习适合你" close={() => setModal(null)}>
          <label className="check-row">
            <input
              type="checkbox"
              checked={state.settings.strict}
              onChange={(e) =>
                setState({
                  ...state,
                  settings: { ...state.settings, strict: e.target.checked },
                })
              }
            />
            <span>
              严格核对<small>区分大小写、标点和空格，从下一组练习生效。</small>
            </span>
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={state.settings.sound}
              onChange={(e) =>
                setState({
                  ...state,
                  settings: { ...state.settings, sound: e.target.checked },
                })
              }
            />
            <span>
              轻柔击键音<small>给每次输入一点反馈，随时可以关闭。</small>
            </span>
          </label>
          <label className="field range-label">
            朗读速度 <strong>{state.settings.rate.toFixed(2)}×</strong>
            <input
              aria-label="朗读速度"
              type="range"
              min="0.5"
              max="1.5"
              step="0.05"
              value={state.settings.rate}
              onChange={(e) =>
                setState({
                  ...state,
                  settings: { ...state.settings, rate: Number(e.target.value) },
                })
              }
            />
          </label>
          <p className="muted voice-note">
            <Headphones size={18} />
            优先播放 ElevenLabs 英音，已内置示例句音频。自己的句子可导入音频包，播放不消耗生成额度。
          </p>
          <p className="muted small">已导入 {audioClips.length} 条音频。没有对应音频时，按钮会显示“设备朗读”，使用本机可用语音；没有设备语音也能继续打字。</p>
          <button className="button secondary full" onClick={()=>{setModal(null);fileRef.current?.click();}}><Headphones size={17}/>导入 ElevenLabs 音频包</button>
          <div className="settings-data">
            <h3>你的数据，由你保管</h3>
            <p>
              导出包含句库、音频、复习安排和练习位置。浏览器清理、换设备或更换网址前，记得导出。
            </p>
            <div className="result-actions">
              <button className="button secondary" onClick={exportData}>
                <Download size={16} />
                导出记录
              </button>
              <button
                className="button secondary"
                onClick={() => {
                  setModal(null);
                  fileRef.current?.click();
                }}
              >
                <Upload size={16} />
                恢复记录
              </button>
            </div>
          </div>
        </Modal>
      )}
      {editing && (
        <SentenceEditor
          sentence={editing}
          save={saveSentence}
          close={() => setEditing(null)}
        />
      )}
      {incoming && (
        <Modal title="恢复之前的练习记录" close={() => setIncoming(null)}>
          <div className="restore-stats">
            <strong>{incoming.decks.length}</strong> 个句组{" "}
            <strong>
              {incoming.decks.reduce((n, d) => n + d.sentences.length, 0)}
            </strong>{" "}
            句话
          </div>
          <p>
            文件包含 {Object.keys(incoming.reviews).length} 条复习安排
            {incoming.session ? "，以及上次练习位置" : ""}，{incomingAudio.length} 条音频。
          </p>
          <p className="warning">
            确认后将替换当前浏览器里的全部记录。如需保留当前数据，请先导出。
          </p>
          <div className="result-actions">
            <button className="button secondary" onClick={exportData}>
              先导出当前记录
            </button>
            <button
              className="button primary"
              disabled={audioBusy}
              onClick={async () => {
                setAudioBusy(true);
                try{
                  await restoreAll(incoming,incomingAudio);
                  setState(incoming);setAudioClips(incomingAudio);
                  setSelectedDeck(incoming.decks[0]?.id ?? "");
                  setIncoming(null);setPage("practice");setNotice("记录已恢复。");
                }catch{setNotice('恢复未能保存，请检查浏览器可用空间后重试。');}
                finally{setAudioBusy(false);}
              }}
            >
              确认替换并恢复
            </button>
          </div>
        </Modal>
      )}
      {audioPack&&<Modal title="导入句子音频" close={()=>{if(!audioBusy)setAudioPack(null);}}>
        <p>声音：{audioPack.voice}</p>
        <div className="restore-stats"><strong>{audioPack.clips.filter(c=>allSentences.some(s=>s.en===c.text)).length}</strong> 条匹配你的句库，共 {audioPack.clips.length} 条音频</div>
        <p className="muted">按完整英文句子自动匹配，标点也需要一致。只导入匹配的音频；已有音频将被替换，练习进度保持不变。</p>
        <div className="modal-actions"><button className="button secondary" disabled={audioBusy} onClick={()=>setAudioPack(null)}>取消</button><button className="button primary" disabled={audioBusy||!audioPack.clips.some(c=>allSentences.some(s=>s.en===c.text))} onClick={async()=>{
          setAudioBusy(true);
          try{const matched=audioPack.clips.filter(c=>allSentences.some(s=>s.en===c.text));const merged=mergeAudio(audioClips,matched);await replaceAudio(merged);setAudioClips(merged);setAudioPack(null);setNotice(`已导入 ${matched.length} 条音频。`);}
          catch(e){setNotice(e instanceof Error?e.message:'音频未能保存，请检查浏览器可用空间。');}
          finally{setAudioBusy(false);}
        }}>{audioBusy?'正在保存…':'确认导入音频'}</button></div>
      </Modal>}
      {confirm && (
        <Modal title={confirm.title} close={() => setConfirm(null)}>
          <p className="confirm-message">{confirm.message}</p>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setConfirm(null)}
            >
              取消
            </button>
            <button className="button primary" onClick={confirm.action}>
              确认
            </button>
          </div>
        </Modal>
      )}
      <input
        type="file"
        ref={fileRef}
        hidden
        accept=".json,application/json"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void importFile(file);
          e.target.value = "";
        }}
      />
      {notice && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {notice}
          <button aria-label="关闭提示" onClick={() => setNotice("")}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
