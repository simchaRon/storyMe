# Flow: Hebrew voice test (free services first)

## What
A family listening test to find out if any **free** service can make a good Hebrew voice, and a good clone of a family member's voice. The family judges. No money is spent.

Why a test: many voice services are weak in Hebrew, and we found no recent independent proof (see [next-session-plan.md](next-session-plan.md)). Hebrew quality is a must-have for DreamTale AI.

## What you need
- 2 or more native Hebrew speakers to rate (the family).
- 2 or 3 voices to clone: for example Dad, Mom, Grandma. Adults first. A child's voice only with a parent's clear OK.
- A phone voice recorder and a quiet room.
- A computer with a browser (Edge or Chrome).
- Free accounts only. No credit card. If a site asks for a card, stop and tell the developer.

## Step 1: record the voices (about 2 minutes each)
Each person reads this text calmly, like a bedtime story, in a quiet room with no music. Hold the phone 20 cm from the mouth. Save as WAV, M4A or MP3. Name the files `dad.m4a`, `mom.m4a` and so on.

```
בקצה היער גר ארנב קטן ושמו נועם. בכל ערב, לפני השינה, הוא היה מביט בירח הגדול ומאחל לו לילה טוב.

"שלום, ירח," לחש נועם. "מה שלומך הערב?"
הירח חייך ואמר: "אני עייף, אבל אני שמח שבאת. עכשיו הולכים לישון, בסדר?"

הרוח נשבה בעדינות בין העצים, והכוכבים הבהבו אחד אחד בשמיים הכהים. נועם התכרבל בשמיכה הרכה שלו, עצם את העיניים, ושמע את הצרצרים שרים לו שיר ערש. לאט לאט, הוא נרדם.

היום יום שלישי, והשעה שמונה בערב. הגיע הזמן להתכרבל במיטה! מי רוצה לשמוע סיפור על דרקון קטן ועל שלוש עוגיות?
```

## Step 2: make the test clips
The same 5 passages go to every service. They have no vowel marks (nikud), like the real stories. Passage 2 has hard words on purpose: `ספר` (book or told), `שמן` (oil or fat), `קרא` (read or called).

```
p1: בקצה היער גר ארנב קטן ושמו נועם. בכל ערב, לפני השינה, הוא היה מביט בירח הגדול ומאחל לו לילה טוב.
p2: אבא קרא ספר גדול על דרקון ביישן. הדרקון אפה עוגיות עם שמן וקמח, ואז חילק אותן לכל החברים שלו.
p3: "שלום, ירח," לחש נועם. "מה שלומך הערב?" הירח חייך ואמר: "אני עייף, אבל אני שמח שבאת. עכשיו הולכים לישון, בסדר?"
p4: הרוח נשבה בעדינות בין העצים, והכוכבים הבהבו אחד אחד בשמיים הכהים. נועם התכרבל בשמיכה הרכה שלו, עצם את העיניים, ושמע את הצרצרים שרים לו שיר ערש. לאט לאט, הוא נרדם.
p5: נח בנה תיבה גדולה, והמבול בא על הארץ. אחרי ארבעים יום, היונה חזרה עם עלה של זית.
```

Free candidates (status on 2026-10-06; most are **claims from the vendors, not tested by us**):

| Candidate | Free? | Clones a voice? | Notes |
|---|---|---|---|
| `device` (the app's "Read aloud") | Yes | No | Baseline. Works now. Capture it with the phone's screen recorder, or just judge it live in the app. |
| `phonikud` (Hugging Face Space "Phonikud/phonikud-tts") | Yes | No (stock voice only) | A good free Hebrew baseline with phonetic control. The Space may be slow or asleep. |
| `elevenlabs` | Free plan: 10,000 characters a month, **no commercial use** | Unclear on the free plan. Sources disagree. Try "Add voice" and see. | Needs the newer model (v3) with the language set to Hebrew. The older model gave unreadable Hebrew in a 2025 test. |
| `maestra` | Vendor says free, no card | Vendor says yes | Unverified. |
| `heygen`, `resemble` | Vendor says free trial | Vendor says yes, from a short sample | Low priority. In a March 2025 test Resemble needed vowel marks for readable Hebrew. |
| `qwen-he` (open source, Apache-2.0) | Free to use | Yes | Needs a GPU and the Hebrew text turned into pronunciation symbols first. This computer has no GPU. It could run on a free Google Colab GPU later. Not set up yet. |
| `minimax` (via Replicate) | **Not free** (pay per run) | Yes | Best Hebrew clones in the March 2025 test. Only if the free ones fail and the budget allows. |

For each candidate that can clone: upload the family recordings, make the 5 passages, download the audio, and save each clip as `candidate__voice__passage.mp3`:

```
elevenlabs__dad__p1.mp3      (a clone of Dad's voice)
elevenlabs__stock__p1.mp3    (the service's own voice, not a clone)
phonikud__stock__p4.wav
```

Put all clips in one folder. Candidate and voice names have no spaces.

## Step 3: rate the clips (blind)
1. Open the page. It is not a program to "run". It is a web page file on your computer:
   - In Windows File Explorer, go to `C:\Users\Lenovo\Projects\claude-code\storyMe\tools\voice-test`.
   - Double-click **`rate.html`**. It opens in your browser (Edge or Chrome). If it opens in another program, right-click it, choose "Open with", and pick Edge or Chrome.
   - In VS Code you can right-click the file and choose "Reveal in File Explorer".
   - **Practice first:** the folder `tools/voice-test/practice-clips` has 3 sample sound files (made with the built-in English Windows voice, only to try the page). Click "Choose files", select all 3, rate them, save the CSV, and click "Reveal names".
2. Type your name. Choose all the clips. The page mixes them and hides which service made each one.
3. Listen to each clip and give 1 to 5 for: clear words, correct pronunciation and stress, natural rhythm for listening, and (for clones) "sounds like the real person". Write any word that sounded wrong.
4. Click "Save the ratings (CSV)". Each rater saves their own file.
5. Put all the CSV files in one folder and send them to the developer.
6. "Show summary" shows your own averages. "Reveal names" shows which service made each clip, so do it last.

## Step 4: decide
- **Pass mark:** a candidate passes if clear words, pronunciation and rhythm each average **4 or more**, and "sounds like the real person" is about 3.5 or more. Check that nobody found words that are really wrong in several clips.
- **If a free candidate passes:** read its licence. Free tiers often forbid commercial use. The app needs a licence that allows it. Then plan voice cloning for the app (plan in [next-session-plan.md](next-session-plan.md)).
- **If none passes:** do not ship Hebrew cloning yet. Build the free alternative instead: **"Read it yourself"**. A parent records their own reading of a story inside the app. The child hears the real voice, in perfect Hebrew, with no cloning and no provider. The device voice stays for stories nobody recorded.

## Privacy rules for the test
- Each person agrees (say it out loud on the recording if you like) before their voice is used.
- Free services may keep uploaded voices and may use them to train. Read each service's terms first. Use adult voices first.
- Delete the recordings and the clips from the services and from the computer when the test is over. Keep only the CSV ratings.
- Never upload a voice of someone who has not agreed.

## Files
- `tools/voice-test/rate.html`: the blind rating page. Works offline. Nothing is sent anywhere. Ratings are also kept in the browser, so a reload does not lose them.
- `tools/voice-test/logic.js`: file name reading, shuffle, CSV and averages.
- `tools/voice-test/logic.test.mjs`: tests for the logic.

## Test
- `node --test tools/voice-test/logic.test.mjs` (6 tests).
- By hand: make 3 short audio files named like `a__dad__p1.mp3`, `a__stock__p1.mp3` and `b__mom__p2.mp3`. Open the page, choose them, rate them, save the CSV, open it in Excel and check the Hebrew shows right. Click "Reveal names" and check they match the file names.
- The page was checked only in a headless browser (it draws correctly in Hebrew, right-to-left). Loading real audio into it has not been tried yet.
