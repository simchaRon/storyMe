"""Cleaning of text from users before it goes into a Claude prompt.

The app has the same rules in mobile/src/storyText.ts and mobile/src/keywords.ts. Keep them in sync.
The tests use the same example inputs on both sides.
"""

import re
import unicodedata

# Characters that cannot be seen but can carry hidden text or change how text is shown:
# control (Cc), format (Cf: zero-width, direction marks, "tag" characters), private use (Co),
# surrogates (Cs) and unassigned (Cn).
_HIDDEN = {"Cc", "Cf", "Co", "Cs", "Cn"}


def strip_invisible(text: str, keep: str = "") -> str:
    """Fold look-alike characters (NFKC: for example full-width brackets become `<`), then remove
    every hidden character except those in `keep`."""
    text = unicodedata.normalize("NFKC", text)
    return "".join(c for c in text if c in keep or unicodedata.category(c) not in _HIDDEN)


def clean_free_text(value: str) -> str:
    """Make free text harmless and tidy.

    Hidden characters are removed, `<` and `>` become spaces (so the text cannot close the tag it
    sits in), and long runs of spaces or blank lines are shortened. New lines and tabs are kept.
    The order matters: fold look-alikes first, then replace the brackets.
    """
    text = value.replace("\r\n", "\n").replace("\r", "\n").replace("\u2028", "\n").replace("\u2029", "\n")
    text = strip_invisible(text, keep="\n\t")
    text = text.replace("<", " ").replace(">", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r" ?\n ?", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()
