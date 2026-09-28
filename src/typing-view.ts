import {copyCharacters, inputCharacters} from './engine';

// Paint the exact textarea value: normalization belongs to answer checking,
// never to the editable text or its cursor coordinates.
export function typingView(target: string, value: string, strict: boolean, reveal: boolean) {
  let offset = 0;
  const entered = inputCharacters(target, value, strict).map(c => {
    const start = offset;
    offset += c.char.length;
    return {...c, start, end: offset, entered: true};
  });
  if (!reveal) return entered;
  const reference = copyCharacters(target, value, strict);
  let next = reference.findIndex(c => c.status === 'cursor');
  if (next < 0) next = reference.length;
  // Keep optional punctuation visible until it is typed or passed.
  while (next > 0 && reference[next - 1].status === '') next--;
  return [...entered, ...reference.slice(next).map(c => ({
    char: c.char, status: '', extra: false, start: value.length, end: value.length, entered: false,
  }))];
}
