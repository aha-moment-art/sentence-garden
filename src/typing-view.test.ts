import {it, expect} from 'vitest';
import {typingView} from './typing-view';

it('never removes or substitutes characters from the editable prefix', () => {
  for (const strict of [false, true]) {
    for (const value of ['Hello,   w', "I don't", 'Smax', '😀 ab', 'a\nb', 'The birch looked stark white and lonesomebir']) {
      const view = typingView('Hello, world!', value, strict, true);
      expect(view.filter(c => c.entered).map(c => c.char).join('')).toBe(value);
      for (const cell of view.filter(c => c.entered)) expect(value.slice(cell.start, cell.end)).toBe(cell.char);
    }
  }
});
it('shows optional punctuation until it is typed, without jumping the caret over it', () => {
  expect(typingView('Hello, world!', 'Hello', false, true).map(c => c.char).join('')).toBe('Hello, world!');
  expect(typingView('Hello, world!', 'Hello,', false, true).map(c => c.char).join('')).toBe('Hello, world!');
  expect(typingView("I don't know.", 'I don', false, true).map(c => c.char).join('')).toBe("I don't know.");
});
