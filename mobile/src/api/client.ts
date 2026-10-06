import { Platform } from 'react-native';

import { getSecret, setSecret } from '../storage';
import { detailText } from './errors';

// On the Android emulator use http://10.0.2.2:8000. On a real phone use your computer's LAN address.
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

const TOKEN_KEY = 'dreamtale.token';
const TIMEOUT_MS = 15000;
// Writing a story takes 5 to 60 seconds on the server (a 10-minute story takes the longest).
// The server stops waiting for Claude after at most 145 seconds. Wait a little longer than that.
const STORY_TIMEOUT_MS = 160000;
let token: string | null = null;
let onUnauthorized: (() => void) | null = null;

export class ApiError extends Error {
  constructor(
    /** HTTP status. 0 = cannot reach the server. 408 = the app gave up waiting. -1 = cancelled by the user. */
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export type Lang = 'en' | 'he';

export type User = {
  id: number;
  email: string;
  preferred_language: Lang;
  created_at: string;
};

export type UserSettings = {
  theme: 'dark' | 'light';
  default_educational_level: number;
  voice_enabled: boolean;
  preferred_language: Lang;
};

export type Story = {
  id: number;
  title: string;
  content: string;
  keywords: string[];
  educational_level: number;
  child_age: number;
  length_minutes: number;
  language: Lang;
  is_torah_story: boolean;
  source_reference: string | null;
  prompt: string | null;
  is_favorite: boolean;
  parent_story_id: number | null;
  root_story_id: number | null;
  chapter_number: number;
  created_at: string;
};

export type StorySummary = Omit<Story, 'content' | 'source_reference'>;

export type Recording = {
  id: number;
  story_id: number;
  name: string;
  duration_seconds: number;
  size_bytes: number;
  created_at: string;
};

export type GenerateInput = {
  keywords: string[];
  /** The story idea in the user's own words. At least one of keywords or prompt is needed. */
  prompt?: string;
  educational_level?: number;
  child_age?: number;
  length_minutes?: number;
  language?: Lang;
  is_torah_story: boolean;
};

export async function loadToken(): Promise<string | null> {
  token = await getSecret(TOKEN_KEY);
  return token;
}

export async function setToken(value: string | null): Promise<void> {
  token = value;
  await setSecret(TOKEN_KEY, value);
}

/** The auth provider registers a function that runs when the server says the token is no good. */
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

async function request<T>(
  path: string,
  opts: { method?: string; body?: unknown; auth?: boolean; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<T> {
  const { method = 'GET', body, auth = true, timeoutMs = TIMEOUT_MS, signal } = opts;
  const sentToken = auth ? token : null;
  const headers: Record<string, string> = { Accept: 'application/json' };
  // A file upload (FormData) sets its own Content-Type with the right boundary. Do not set it here.
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
  if (sentToken) headers.Authorization = `Bearer ${sentToken}`;

  // Stop waiting after a while (15 s, or longer for stories), so the app never hangs on a bad network.
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onCancel = () => controller.abort();
  signal?.addEventListener('abort', onCancel);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    if (signal?.aborted) throw new ApiError(-1, 'Cancelled by the user');
    if (timedOut) throw new ApiError(408, 'The server took too long');
    throw new ApiError(0, 'Cannot reach the server');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onCancel);
  }

  if (res.status === 204 || res.status === 205) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // Sign out only if the token that failed is still the current one. An old request with an
    // old token must not log out a user who just signed in again.
    if (res.status === 401 && sentToken && sentToken === token) onUnauthorized?.();
    throw new ApiError(res.status, detailText(data));
  }
  return data as T;
}

export const api = {
  register: (email: string, password: string, preferred_language: Lang) =>
    request<{ access_token: string }>('/api/auth/register', {
      method: 'POST',
      body: { email, password, preferred_language },
      auth: false,
    }),
  login: (email: string, password: string) =>
    request<{ access_token: string }>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
      auth: false,
    }),
  me: () => request<User>('/api/auth/me'),
  deleteAccount: () => request<void>('/api/auth/me', { method: 'DELETE' }),
  getSettings: () => request<UserSettings>('/api/settings'),
  updateSettings: (changes: Partial<UserSettings>) =>
    request<UserSettings>('/api/settings', { method: 'PUT', body: changes }),
  generateStory: (input: GenerateInput, signal?: AbortSignal) =>
    request<Story>('/api/stories/generate', { method: 'POST', body: input, timeoutMs: STORY_TIMEOUT_MS, signal }),
  createSequel: (parentStoryId: number, signal?: AbortSignal) =>
    request<Story>('/api/stories/sequel', {
      method: 'POST',
      body: { parent_story_id: parentStoryId },
      timeoutMs: STORY_TIMEOUT_MS,
      signal,
    }),
  getStory: (id: number, signal?: AbortSignal) => request<Story>(`/api/stories/${id}`, { signal }),
  listStories: (opts: { favorites?: boolean; limit?: number; offset?: number; signal?: AbortSignal } = {}) => {
    const { favorites = false, limit = 20, offset = 0, signal } = opts;
    return request<StorySummary[]>(`/api/stories${favorites ? '/favorites' : ''}?limit=${limit}&offset=${offset}`, {
      signal,
    });
  },
  setFavorite: (id: number, is_favorite: boolean) =>
    request<StorySummary>(`/api/stories/${id}/favorite`, { method: 'PATCH', body: { is_favorite } }),
  deleteStory: (id: number) => request<void>(`/api/stories/${id}`, { method: 'DELETE' }),
  listRecordings: (storyId: number, signal?: AbortSignal) =>
    request<Recording[]>(`/api/stories/${storyId}/recordings`, { signal }),
  /** Send a recording. `uri` is the file from the recorder (a file on phones, a blob address on web). */
  uploadRecording: async (
    storyId: number,
    input: { uri: string; name: string; durationSeconds: number; consent: boolean },
  ) => {
    const form = new FormData();
    if (Platform.OS === 'web') {
      const blob = await (await fetch(input.uri)).blob();
      form.append('file', blob, 'recording.webm');
    } else {
      // React Native reads the file from the phone when the form is sent.
      form.append('file', { uri: input.uri, name: 'recording.m4a', type: 'audio/mp4' } as unknown as Blob);
    }
    form.append('name', input.name);
    form.append('duration_seconds', String(input.durationSeconds));
    form.append('consent', input.consent ? 'true' : 'false');
    return request<Recording>(`/api/stories/${storyId}/recordings`, { method: 'POST', body: form, timeoutMs: 120000 });
  },
  /** A short-lived address a player can use without a login header. */
  recordingUrl: async (recordingId: number) => {
    const data = await request<{ url: string; expires_in: number }>(`/api/recordings/${recordingId}/url`);
    return `${API_URL}${data.url}`;
  },
  deleteRecording: (recordingId: number) => request<void>(`/api/recordings/${recordingId}`, { method: 'DELETE' }),
};
