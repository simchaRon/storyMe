// No imports on purpose: the tests load this file with plain Node.
// The free-text description of a story. These rules match the backend (backend/app/textclean.py).
// The server cleans the text again, so this is for counting and for an early "nothing to send" check.
// The same example inputs are tested here and in backend/tests/test_textclean.py. Change both together.

export const MAX_PROMPT_LENGTH = 800;

// Hidden characters: control (Cc), format (Cf: zero-width, direction marks, "tag" characters),
// private use (Co), surrogates (Cs) and unassigned (Cn).
function buildHiddenPattern(): RegExp {
  try {
    return new RegExp('[\\p{Cc}\\p{Cf}\\p{Co}\\p{Cs}\\p{Cn}]', 'gu');
  } catch {
    // Old JavaScript engines may not know \p{...}. This list covers the common ones.
    // eslint-disable-next-line no-control-regex
    return /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g;
  }
}
const HIDDEN = buildHiddenPattern();

/** Fold look-alikes (NFKC, for example full-width brackets become `<`), then remove hidden characters. */
export function stripInvisible(text: string, keep = ''): string {
  const folded = typeof text.normalize === 'function' ? text.normalize('NFKC') : text;
  return folded.replace(HIDDEN, (ch) => (keep.includes(ch) ? ch : ''));
}

/** Make the text safe and tidy: no hidden characters, no `<` or `>`, no long runs of spaces or blank lines. */
export function cleanPrompt(raw: string): string {
  const text = stripInvisible(raw.replace(/\r\n?/g, '\n').replace(/[\u2028\u2029]/g, '\n'), '\n\t');
  return text
    .replace(/[<>]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
