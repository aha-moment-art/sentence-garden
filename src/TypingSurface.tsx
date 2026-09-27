import { useRef, type RefObject } from "react";
import { copyCharacters, inputCharacters, matches, normalized } from "./engine";
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
  const characters = reveal
    ? copyCharacters(target, value, strict)
    : inputCharacters(target, value, strict);
  const overflow = (strict ? value : normalized(value)).slice(
    (strict ? target : normalized(target)).length,
  );
  return (
    <div className={"typing-surface" + (checked ? " complete" : "")}>
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
          <span key={i} className={"letter " + c.status}>
            {c.char}
          </span>
        ))}
        {!reveal && !checked && <span className="inline-caret" />}
        {!reveal && !value && (
          <span className="surface-placeholder">直接开始输入…</span>
        )}
        {reveal && overflow.length > 0 && !matches(target, value, strict) && (
          <span className="mistyped extra-input">{overflow}</span>
        )}
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
        onPointerDown={onActivate}
        onChange={(e) => {
          onSound();
          onInput(e.target.value, composing.current);
        }}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={(e) => {
          composing.current = false;
          onInput(e.currentTarget.value, false);
        }}
        onKeyDown={(e) => {
          onActivate();
          if (e.nativeEvent.isComposing) return;
          if (e.altKey && (e.code === "KeyR" || e.key.toLowerCase() === "r")) {
            e.preventDefault();
            onReplay();
          } else if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSound();
            onCheck();
          }
        }}
      />
      <div className="surface-focus-hint" aria-hidden="true">
        点击句子开始输入
      </div>
    </div>
  );
}
