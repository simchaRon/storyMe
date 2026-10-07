// No imports on purpose: the tests load this file with plain Node.

const MAX_PIECE = 350; // characters. Long texts can be cut off by the device voice, so keep pieces short.

/** Cut a long paragraph into sentences, and group them into pieces of at most MAX_PIECE characters. */
export function splitLong(paragraph: string): string[] {
  const text = paragraph.trim();
  if (text.length <= MAX_PIECE) return text ? [text] : [];
  // A sentence ends with . ! ? (or the Hebrew/Arabic question mark) and then a space or the end.
  const sentences = text.match(/[^.!?؟]+(?:[.!?؟]+|$)\s*/g) ?? [text];
  const pieces: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    if (current && current.length + sentence.length > MAX_PIECE) {
      pieces.push(current.trim());
      current = '';
    }
    current += sentence;
  }
  if (current.trim()) pieces.push(current.trim());
  // A single sentence with no punctuation can still be too long: cut it at spaces.
  return pieces.flatMap((p) => (p.length <= MAX_PIECE * 2 ? [p] : cutAtSpaces(p)));
}

function cutAtSpaces(text: string): string[] {
  const out: string[] = [];
  let current = '';
  for (const word of text.split(' ')) {
    if (current && current.length + word.length + 1 > MAX_PIECE) {
      out.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) out.push(current);
  return out;
}

/** The title, then every paragraph, as short pieces to be read one after the other. */
export function speechParts(title: string, content: string): string[] {
  const paragraphs = content.split(/\n{2,}/);
  return [title.trim(), ...paragraphs.flatMap(splitLong)].filter(Boolean);
}

export type SpeechPiece = { text: string; pauseAfterMs: number };

const PAUSE_SENTENCE_MS = 450; // after . … and in the middle of a paragraph
const PAUSE_QUESTION_MS = 400; // after ? and !
const PAUSE_PARAGRAPH_MS = 900; // after the last sentence of a paragraph
const PAUSE_TITLE_MS = 1200;

/** The pause that follows a piece of text, by its last punctuation mark. */
function pauseFor(text: string): number {
  const last = text.trim().replace(/["'”’»)\]]+$/u, '').slice(-1);
  return '?!؟'.includes(last) ? PAUSE_QUESTION_MS : PAUSE_SENTENCE_MS;
}

/**
 * The story as a list of pieces for the device voice, each with the pause to wait after it:
 * the title, then every sentence. A sentence is a piece, so the pause after . ? ! is real and not left to the voice.
 * Commas and colons stay inside the piece: the voice already pauses at them. The vowel marks (nikud) are kept as they are.
 */
export function speechPlan(title: string, content: string): SpeechPiece[] {
  const plan: SpeechPiece[] = [];
  const cleanTitle = title.trim();
  if (cleanTitle) plan.push({ text: cleanTitle, pauseAfterMs: PAUSE_TITLE_MS });

  for (const paragraph of content.split(/\n{2,}/)) {
    const text = paragraph.trim();
    if (!text) continue;
    const sentences = (text.match(/[^.!?؟…]+(?:[.!?؟…]+["'”’»)\]]*|$)\s*/gu) ?? [text]).map((s) => s.trim()).filter(Boolean);
    const first = plan.length;
    for (const sentence of sentences) {
      for (const piece of splitLong(sentence)) plan.push({ text: piece, pauseAfterMs: pauseFor(piece) });
    }
    if (plan.length > first) plan[plan.length - 1].pauseAfterMs = PAUSE_PARAGRAPH_MS;
  }
  return plan;
}
