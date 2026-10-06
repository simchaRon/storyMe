// No imports on purpose: the tests load this file with plain Node.

type NarrationLike = { id: number; voice_id: number; status: string; progress_done: number; progress_total: number };

/** Is the audio still being made? */
export function isActive(n: Pick<NarrationLike, 'status'>): boolean {
  return n.status === 'queued' || n.status === 'running';
}

/** The audio made with one voice for the story, if there is one. */
export function narrationFor<T extends NarrationLike>(voiceId: number, list: T[]): T | undefined {
  return list.find((n) => n.voice_id === voiceId);
}

/** 0 to 100. Nothing is known before the first piece starts. */
export function progressPercent(n: Pick<NarrationLike, 'progress_done' | 'progress_total'>): number {
  if (!n.progress_total || n.progress_total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((n.progress_done / n.progress_total) * 100)));
}

/** Should the screen keep asking the server for news? */
export function needsPolling(list: Pick<NarrationLike, 'status'>[]): boolean {
  return list.some(isActive);
}
