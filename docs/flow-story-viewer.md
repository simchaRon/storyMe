# Flow: Story viewer

Server side: [flow-stories.md](flow-stories.md) and [flow-sequel.md](flow-sequel.md).

## What
The screen at `/story/<id>`. It shows one story in large, calm text. The user can listen to it and create the next chapter.

## Steps
1. The screen loads `GET /api/stories/{id}`. If that fails, it shows the error and a "try again" button.
2. It shows the chapter number, "For age N · about M min", the title, the source (Torah stories only), and the story in paragraphs. The text is 22 px with wide line spacing.
3. "Read aloud" reads the title and then each paragraph with the device voice. The language is the story's language. The button then becomes "Stop".
4. "Create the next chapter" calls `POST /api/stories/sequel`. The calm loading animation shows. Then the new chapter opens.

## Rules
- The automatic reader reads one sentence at a time (`speechPlan` in `mobile/src/speechText.ts`) and waits after each one: 0.45 s after a full stop, 0.4 s after ? or !, 0.9 s at the end of a paragraph and 1.2 s after the title. Commas and colons stay inside the sentence, because the voice already pauses there. The Hebrew text is sent with its nikud (vowel points) unchanged. **Whether the voice uses the vowels depends on the phone's Hebrew voice.** Many voices ignore them and guess the vowels. The app cannot force it. Not checked on a real phone yet. If the phone's voice is not good enough, the next step is a server voice for Hebrew (not built).
- Every story (English and Hebrew): the device voice is the **automatic reader**. It is the first row of the recordings card, right above the recordings made by people, with its own Play / Stop button. The user can also record the story in their own voice (no cloning) in the same card. The old separate "Read aloud" button is gone, and the "Read stories aloud" switch in Settings no longer hides the reader. The reader stops when a recording or a cloned voice starts, and the other way round.
- Reading stops when the user leaves the screen, opens another story, or creates the next chapter.
- Reading goes one short piece at a time (the title, then each paragraph; long paragraphs are cut at sentence ends). The next piece starts when the last one is done. Old reading can never change the screen after Stop or after a new start.
- Before reading, the app checks that the device has a voice for the story language. If not, it shows "This device has no voice for this language."
- The text direction follows the language of the story, not the language of the app. A Hebrew story is right-to-left even if the app is in English.
- The story number in the address must be a whole number. Anything else, or a missing story, shows "This story was not found."
- Each story opens in a fresh screen, so an old story does not flash while the next chapter loads.
- Back from a new chapter goes to Home, not to the previous chapter (the new chapter replaces the old screen). The library (Phase 5) lists all chapters.
- Under the story there is a "Voices" card: recordings of people reading this story aloud, with Play, Delete and "Record your voice". See [flow-recording.md](flow-recording.md). Playing a recording stops the device voice, and the other way round.
- "Read aloud" uses the device voice, not a person's voice. Voice cloning comes later. See [flow-voice.md](flow-voice.md).
- If the device has no voice for the language, a message shows.
- A sequel keeps the level, language and Torah mode of the first story.
- Errors: daily limit (429), story deleted meanwhile (409), busy server, no connection.
- Opening a story that belongs to someone else shows an error (the server returns 404).

## Files
- `mobile/app/story/[id].tsx`
- `mobile/src/ui/BedtimeLoader.tsx`
- `mobile/src/api/client.ts` (`getStory`, `createSequel`)

## Test
By hand: make a story, tap Read aloud, tap Stop, tap Read aloud and leave the screen (the voice must stop). Make a sequel and check the chapter number goes to 2. Turn "Read stories aloud" off in Settings and check the button is gone. Test in English and Hebrew.
