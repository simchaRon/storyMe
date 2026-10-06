// No imports on purpose: the tests load this file with plain Node.

/** The longest recording. The server accepts files up to 25 MB, which is more than this. */
export const MAX_RECORDING_SECONDS = 20 * 60;
/** A recording shorter than this is probably a mistake. */
export const MIN_RECORDING_SECONDS = 3;

/** 95.4 -> "1:35". Never negative, never NaN. */
export function formatDuration(totalSeconds: number): string {
  const safe = Number.isFinite(totalSeconds) && totalSeconds > 0 ? Math.floor(totalSeconds) : 0;
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
