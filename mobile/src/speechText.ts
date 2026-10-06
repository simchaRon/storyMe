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
