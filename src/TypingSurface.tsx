import { useRef, useState, type RefObject } from "react";
import { copyCharacters, inputCharacters, matches } from "./engine";
export default function TypingSurface({
  target,
  value,
  strict,
  reveal,
  checked,
  inputRef,
  onInput,
  onCheck,
  onSound,
  onReplay,
  onActivate,
}: {
  target: string;
  value: string;
  strict: boolean;
  reveal: boolean;
  checked: boolean | null;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onInput: (value: string, composing: boolean) => void;
  onCheck: () => void;
  onSound: () => void;
  onReplay: () => void;
  onActivate: () => void;
}) {
  const composing = useRef(false);
  const [selection, setSelection] = useState({value, start:value.length, end:value.length});
  const [isComposing, setComposing] = useState(false);
  const start = selection.value === value ? selection.start : value.length;
  const end = selection.value === value ? selection.end : value.length;
  const rememberSelection = (el: HTMLTextAreaElement) => setSelection(previous =>
    previous.value === el.value && previous.start === el.selectionStart && previous.end === el.selectionEnd
      ? previous : {value:el.value, start:el.selectionStart, end:el.selectionEnd});
  const characters = reveal
    ? copyCharacters(target, value, strict)
    : inputCharacters(target, value, strict);
  const entered = inputCharacters(target, value, strict);
  const overflow = entered.filter(c=>c.extra).map(c=>c.char).join('');
  const caretAt = reveal ? copyCharacters(target, value.slice(0,start),strict).findIndex(c=>c.status==='cursor') : Array.from(value.slice(0,start)).length;
  const selectionEnd = reveal ? copyCharacters(target,value.slice(0,end),strict).findIndex(c=>c.status==='cursor') : Array.from(value.slice(0,end)).length;
  const wrong = !isComposing ? characters.filter(c=>c.status==='mistyped') : [];
  const firstWrong = reveal ? copyCharacters(target,value,strict).find(c=>c.status==='mistyped') : undefined;
  const displayChar = (char: string) => /\s/.test(char) ? '空格' : char;
  return (
    <div className={"typing-surface" + (checked ? " complete" : "") + (wrong.length || (!isComposing && overflow) ? " has-mistakes" : "")}>
      <p
        className={
          reveal
            ? "target-sentence inline-sentence"
            : "typed-sentence inline-sentence"
        }
        lang="en"
        aria-hidden="true"
      >
        {characters.map((c, i) => (
          <span key={i}
            className={"letter " + (isComposing ? "" : c.status === 'cursor' ? '' : c.status) +
              (i === caretAt && !checked ? ' cursor' : '') + (/\s/.test(c.char) ? ' space' : '') +
              (start !== end && i >= caretAt && (selectionEnd < 0 || i < selectionEnd) ? ' selected-letter' : '')}
            data-entered={reveal && 'actual' in c && c.status === 'mistyped' ? (c.actual === ' ' ? '␣' : c.actual) : undefined}
          >
            {c.char}
          </span>
        ))}
        {!reveal && !value && (
          <span className="surface-placeholder">直接开始输入…</span>
        )}
        {reveal && !isComposing && overflow.length > 0 && !matches(target, value, strict) && (
          <span className="mistyped extra-input">{overflow}</span>
        )}
        {!checked && ((!reveal && caretAt === characters.length) || (reveal && caretAt < 0)) && <span className="inline-caret" />}
      </p>
      <textarea
        id="typing-input"
        ref={inputRef}
        className="inline-input"
        aria-label={reveal ? `跟打原句：${target}` : "听写或默写输入"}
        lang="en"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        maxLength={1200}
        value={value}
        disabled={checked === true}
        onFocus={e=>{
          e.currentTarget.setSelectionRange(value.length,value.length);
          rememberSelection(e.currentTarget);
        }}
        onPointerDown={(e) => {
          e.preventDefault();
          onActivate();
          e.currentTarget.focus({preventScroll:true});
          e.currentTarget.setSelectionRange(value.length,value.length);
          rememberSelection(e.currentTarget);
        }}
        onSelect={e=>rememberSelection(e.currentTarget)}
        onChange={(e) => {
          rememberSelection(e.currentTarget);
          onInput(e.target.value, composing.current);
          onSound();
        }}
        onCompositionStart={() => {
          composing.current = true;
          setComposing(true);
        }}
        onCompositionEnd={(e) => {
          composing.current = false;
          setComposing(false);
          onInput(e.currentTarget.value, false);
        }}
        onKeyDown={(e) => {
          onActivate();
          if (e.nativeEvent.isComposing) return;
          if (e.altKey && (e.code === "KeyR" || e.key.toLowerCase() === "r")) {
            e.preventDefault();
            onReplay();
          } else if ((e.key === 'Home' || e.key === 'End') && !e.metaKey && !e.ctrlKey && !e.altKey) {
            e.preventDefault();
            const el=e.currentTarget, position=e.key==='Home'?0:el.value.length;
            el.setSelectionRange(e.shiftKey ? Math.min(el.selectionStart,position) : position,
              e.shiftKey ? Math.max(el.selectionEnd,position) : position);
            rememberSelection(el);
          } else if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSound();
            onCheck();
          }
        }}
      />
      {(value || isComposing) && <div className="keystroke-feedback" aria-live="polite" aria-atomic="true">
        {isComposing ? <span>输入法输入中…</span> : wrong.length || overflow ? (
          <span className="key-error">{firstWrong?.actual !== undefined
            ? `输入了「${displayChar(firstWrong.actual)}」，这里应为「${displayChar(firstWrong.char)}」`
            : overflow ? `多输入了「${overflow}」` : `有 ${wrong.length} 个字符需要修正`}</span>
        ) : value ? <span className="key-correct">✓ {checked || matches(target,value,strict) ? '这一句输入正确' : '已输入的字符正确'}</span>
          : null}
      </div>}
    </div>
  );
}
