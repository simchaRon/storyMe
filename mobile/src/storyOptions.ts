// No imports on purpose: the tests load this file with plain Node.
// The server accepts any age from 1 to 14 and any length from 1 to 10 minutes. The app offers these choices.

export const AGES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
export const LENGTHS = [1, 3, 5, 10] as const; // minutes to tell the story aloud

export const DEFAULT_AGE = 6;
export const DEFAULT_LENGTH = 3;

/** Use a saved value only if it is one of the choices. Otherwise use the default. */
export function pickAge(value: unknown): number {
  const n = Number(value);
  return (AGES as readonly number[]).includes(n) ? n : DEFAULT_AGE;
}

export function pickLength(value: unknown): number {
  const n = Number(value);
  return (LENGTHS as readonly number[]).includes(n) ? n : DEFAULT_LENGTH;
}
