// No imports on purpose: the tests load this file with plain Node.
// These rules match the backend (backend/app/schemas.py). The server checks them again.

export const MAX_KEYWORDS = 10;
export const MAX_KEYWORD_LENGTH = 40;

// Hidden characters (zero-width, direction marks, "tag" characters ...) are removed. Same rule as the server
// (backend/app/textclean.py) and as src/storyText.ts. Look-alike brackets are folded to `<` and `>` first.
function buildHiddenPattern(): RegExp {
  try {
    return new RegExp('[\\p{Cc}\\p{Cf}\\p{Co}\\p{Cs}\\p{Cn}]', 'gu');
  } catch {
    // eslint-disable-next-line no-control-regex
    return /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g;
  }
}
const HIDDEN = buildHiddenPattern();

function stripInvisible(text: string): string {
  const folded = typeof text.normalize === 'function' ? text.normalize('NFKC') : text;
  return folded.replace(HIDDEN, '');
}

/** Length in characters (not UTF-16 units), like Python's len(). An emoji counts as 1. */
export function charLength(text: string): number {
  return [...text].length;
}

/** Clean one keyword. Returns null if it cannot be used. */
export function cleanKeyword(raw: string): string | null {
  // Control characters (new lines, tabs, bells) are rejected, like on the server.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(raw.replace(/\s+/g, ' '))) return null;
  // Spaces, tabs and new lines become one space first. Then hidden characters are removed.
  const word = stripInvisible(raw.replace(/\s+/g, ' ')).replace(/\s+/g, ' ').trim();
  const length = charLength(word);
  if (length < 1 || length > MAX_KEYWORD_LENGTH) return null;
  if (/[<>]/.test(word)) return null;
  return word;
}

export type AddResult =
  | { ok: true; list: string[] }
  | { ok: false; reason: 'invalid' | 'full' | 'empty' };

/** Add a keyword to the list. Duplicates are ignored (not an error). */
export function addKeyword(list: string[], raw: string): AddResult {
  if (stripInvisible(raw).trim() === '') return { ok: false, reason: 'empty' };
  const word = cleanKeyword(raw);
  if (word === null) return { ok: false, reason: 'invalid' };
  if (list.some((k) => k.toLowerCase() === word.toLowerCase())) return { ok: true, list };
  if (list.length >= MAX_KEYWORDS) return { ok: false, reason: 'full' };
  return { ok: true, list: [...list, word] };
}

/** Split text that has commas (English, Hebrew or Arabic comma) or new lines into pieces. */
export function splitKeywords(text: string): string[] {
  return text.split(/[,،\n]/);
}

export type AddManyResult = {
  list: string[];
  /** Pieces that could not be added, joined with ", ". Put them back in the text box. */
  rest: string;
  problem: 'invalid' | 'full' | null;
};

/** Add every piece of a typed or pasted text. Nothing is lost: failed pieces come back in `rest`. */
export function addMany(list: string[], raw: string): AddManyResult {
  let current = list;
  const failed: string[] = [];
  let problem: 'invalid' | 'full' | null = null;
  for (const piece of splitKeywords(raw)) {
    const result = addKeyword(current, piece);
    if (result.ok) current = result.list;
    else if (result.reason !== 'empty') {
      failed.push(piece.trim());
      problem = problem ?? result.reason;
    }
  }
  return { list: current, rest: failed.join(', '), problem };
}
