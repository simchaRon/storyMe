// No imports on purpose: the tests load this file with plain Node.

/**
 * The version of the consent text for a voice sample (the text of `clone.consent` and `clone.consentHint`).
 * The server stores it with the voice, and refuses a different version. When you change the text in
 * en.json or he.json, change this version AND CONSENT_TEXT_VERSION in backend/app/routers/cloning.py.
 */
export const CLONE_CONSENT_VERSION = '2026-10-clone-v1';
