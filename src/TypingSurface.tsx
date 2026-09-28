import {useRef, useState, type RefObject} from 'react';
import {copyCharacters, matches} from './engine';
import {typingView} from './typing-view';

export default function TypingSurface({target, value, strict, reveal, checked, inputRef,
  onInput, onCheck, onSound, onReplay, onActivate}: {
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
  const [isComposing, setComposing] = useState(false);
  const [selection, setSelection] = useState({value, start: value.length, end: value.length, direction: 'none'});
  const start = selection.value === value ? selection.start : value.length;
  const end = selection.value === value ? selection.end : value.length;
  const rememberSelection = (el: HTMLTextAreaElement) => {
    // Snapshot now: a queued React updater must not read a later DOM value.
    const next = {value: el.value, start: el.selectionStart, end: el.selectionEnd, direction: el.selectionDirection};
    setSelection(previous => previous.value === next.value && previous.start === next.start &&
      previous.end === next.end && previous.direction === next.direction ? previous : next);
  };
  const characters = typingView(target, value, strict, reveal);
  const entered = characters.filter(c => c.entered);
  const overflow = entered.filter(c => c.extra).map(c => c.char).join('');
  const wrong = isComposing ? [] : entered.filter(c => c.status === 'mistyped');
  const firstWrong = reveal ? copyCharacters(target, value, strict).find(c => c.status === 'mistyped') : undefined;
  const displayChar = (char: string) => /\s/.test(char) ? '空格' : char;

  return (
    <div className={'typing-surface' + (checked ? ' complete' : '') +
      (wrong.length || (!isComposing && overflow) ? ' has-mistakes' : '')}>
      <div className="typing-editor">
        <p className={(reveal ? 'target-sentence' : 'typed-sentence') + ' inline-sentence'} lang="en" aria-hidden="true">
          {characters.map((c, i) => (
            <span key={i} data-position={i} data-input-offset={c.entered ? c.start : undefined}
              data-entered={c.entered && c.status === 'mistyped' ? c.char : undefined}
              className={'letter ' + (isComposing ? '' : c.status) +
                (c.extra ? ' extra-input' : '') +
                (/\s/.test(c.char) ? ' space' : '') +
                (start !== end && c.entered && c.start >= start && c.end <= end ? ' selected-letter' : '')}>
              {c.char}
            </span>
          ))}
          {!reveal && !value && <span className="surface-placeholder">直接开始输入…</span>}
          {value.endsWith('\n') && <span aria-hidden="true">{'\u200b'}</span>}
        </p>
        <textarea id="typing-input" ref={inputRef} className="inline-input"
          aria-label={reveal ? `跟打原句：${target}` : '听写或默写输入'} lang="en"
          autoCapitalize="off" autoCorrect="off" spellCheck={false} maxLength={1200}
          value={value} disabled={checked === true}
          onFocus={e => {
            e.currentTarget.setSelectionRange(value.length, value.length);
            rememberSelection(e.currentTarget);
          }}
          onPointerDown={onActivate}
          onSelect={e => rememberSelection(e.currentTarget)}
          onChange={e => {
            rememberSelection(e.currentTarget);
            onInput(e.currentTarget.value, composing.current);
            onSound();
          }}
          onCompositionStart={() => {composing.current = true; setComposing(true);}}
          onCompositionEnd={e => {
            composing.current = false;
            setComposing(false);
            rememberSelection(e.currentTarget);
            onInput(e.currentTarget.value, false);
          }}
          onKeyDown={e => {
            onActivate();
            if (e.nativeEvent.isComposing) return;
            if (e.altKey && (e.code === 'KeyR' || e.key.toLowerCase() === 'r')) {
              e.preventDefault();
              onReplay();
            } else if ((e.key === 'Home' || e.key === 'End') && !e.metaKey && !e.ctrlKey && !e.altKey) {
              e.preventDefault();
              const el = e.currentTarget, position = e.key === 'Home' ? 0 : el.value.length;
              const anchor = e.shiftKey ? el.selectionDirection === 'backward' ? el.selectionEnd : el.selectionStart : position;
              el.setSelectionRange(Math.min(anchor, position), Math.max(anchor, position), position < anchor ? 'backward' : 'forward');
              rememberSelection(el);
            } else if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onSound();
              onCheck();
            }
          }}
        />
      </div>
      {(value || isComposing) && <div className="keystroke-feedback" aria-live="polite" aria-atomic="true">
        {isComposing ? <span>输入法输入中…</span> : wrong.length || overflow ? (
          <span className="key-error">{firstWrong?.actual !== undefined
            ? `输入了「${displayChar(firstWrong.actual)}」，这里应为「${displayChar(firstWrong.char)}」`
            : overflow ? `多输入了「${overflow}」` : `有 ${wrong.length} 个字符需要修正`}</span>
        ) : value ? <span className="key-correct">✓ {checked || matches(target, value, strict) ? '这一句输入正确' : '已输入的字符正确'}</span> : null}
      </div>}
    </div>
  );
}
