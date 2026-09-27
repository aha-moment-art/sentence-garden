import { it, expect } from "vitest";
import {
  initialState,
  makeSession,
  checkSession,
  nextSession,
  finishState,
  validateState,
  copyCharacters,
  inputCharacters,
  expected,
} from "./engine";
it("keeps typing and dictation as distinct whole-group sessions, including retries and portable mode", () => {
  for (const mode of ["typing", "dictation"] as const) {
    const state = initialState(),
      items = state.decks[0].sentences.slice(0, 2);
    let s = makeSession("test", items, false, false, mode);
    expect(s.tasks.map((t) => t.phase)).toEqual(
      mode === "typing" ? ["copy", "copy"] : ["recall", "recall"],
    );
    s = checkSession({ ...s, input: "wrong" });
    s = nextSession(checkSession({ ...s, input: expected(s.tasks[0]) }));
    s = nextSession(checkSession({ ...s, input: expected(s.tasks[1]) }));
    expect(s.tasks).toHaveLength(3);
    expect(s.tasks[2].phase).toBe(mode === "typing" ? "copy" : "recall");
    s = nextSession(checkSession({ ...s, input: expected(s.tasks[2]) }));
    expect(s.complete).toBe(true);
    const saved = finishState(state, s);
    expect(saved.reviews[items[0].id].step).toBe(0);
    expect(validateState(JSON.parse(JSON.stringify(saved))).session?.mode).toBe(
      mode,
    );
  }
});
it("aligns the next letter across punctuation and repeated spaces while exposing missing spaces and extra letters", () => {
  expect(
    copyCharacters("Hello, world!", "hello   w", false)
      .filter((c) => c.status === "cursor")
      .map((c) => c.char),
  ).toEqual(["o"]);
  expect(
    copyCharacters("Hello world", "Hellow", false).some(
      (c) => c.status === "mistyped",
    ),
  ).toBe(true);
  expect(inputCharacters("Go.", "Gox", false).at(-1)?.status).toBe("mistyped");
  expect(inputCharacters("Hello", "Hxl", false).map((c) => c.status)).toEqual([
    "typed",
    "mistyped",
    "typed",
  ]);
  expect(copyCharacters("Hi.", "Hi", true).at(-1)?.status).toBe("cursor");
});
