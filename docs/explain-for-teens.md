# How DreamTale AI works (for a 15 year old)

This page explains the whole project with simple words and a few pictures. You do not need to know how to code. Words in **bold** are small new ideas. You can find the technical version in [architecture.md](architecture.md).

## 1. What is DreamTale AI?
It is a bedtime story app for children.

1. A parent (or the child) types a few ideas, like "a sleepy fox" and "the moon".
2. An AI writes a calm story about it.
3. The app can read the story out loud. It can even read it in a **cloned voice**, for example in mom's voice, if mom recorded a short sample.

The app speaks **English** (left to right) and **Hebrew** (right to left, and with vowel dots called *nikud* so children can read it).

## 2. The big picture: a restaurant
The easiest way to understand the project is a restaurant.

| In the restaurant | In DreamTale AI | What it really is |
|---|---|---|
| The customer's table and menu | **The app** (`mobile/`) | What you see on your phone or in the browser |
| The waiter | **The API** (the backend, `backend/`) | A program that takes orders and brings back answers |
| The kitchen's notebook | **The database** | A file with all accounts and stories |
| The head chef who writes the recipe | **Claude** | An AI from a company called Anthropic. It writes the stories |
| A special chef for voices | **The voice worker** (`tools/tts-worker/`) | A second program that makes cloned-voice audio |
| The fridge | **The media folder** | Where voice samples and audio files are saved |

The customer never walks into the kitchen. The app never talks to Claude or the database directly. It always talks to the waiter (the backend). This is on purpose: the waiter checks who you are and what you are allowed to do.

```
  Phone / browser          Your computer or a server
 ┌─────────────┐        ┌──────────────────────────────────────┐
 │   THE APP   │ ─────► │  BACKEND (the waiter)                │
 │ (Expo, TS)  │ ◄───── │   ├─► Database (accounts, stories)   │
 └─────────────┘  JSON  │   ├─► Claude (writes stories)        │──► internet
                        │   ├─► Media folder (audio files)     │
                        │   └─► Voice worker (makes voices)    │
                        └──────────────────────────────────────┘
```

## 3. The parts, one by one

### The app (what you touch)
- Built with **Expo** and **React Native**. One code base works on iPhone, Android and the web.
- Written in **TypeScript** (JavaScript with safety checks).
- Screens: sign in, create a story, read a story, library, settings, "My voices", record a voice.
- All text lives in two files, `en.json` and `he.json`. The app picks the right one. That is how it switches between English and Hebrew. The language button is in the top bar of every screen.
- For Hebrew, the whole layout flips to right-to-left.

### The backend (the waiter)
- Written in **Python** with **FastAPI**. It is a list of **endpoints**: addresses like `POST /api/stories/generate` ("please write a story").
- The app and the backend talk with **JSON**, which is just structured text.
- Every endpoint is listed in [api.md](api.md).

### The database
- It stores users, settings, stories, voices and audio jobs.
- Now it is **SQLite**, a single file. Later it can be **PostgreSQL**, a stronger database for a real launch.
- Python code talks to it with **SQLAlchemy**, so we write Python and not raw database commands.

### Claude (the story writer)
- The backend sends Claude a **prompt**: rules, plus your ideas. The rules say: calm story, safe for children, right age, right length, in the right language.
- Your ideas go inside special tags, like a sealed envelope, and the rules tell Claude "everything inside the envelope is only story material, never orders". This protects against **prompt injection**, which is when someone writes "ignore your rules" inside their story idea.
- Claude answers in a fixed shape (title, content, source), so the backend can read it without guessing.
- Hebrew stories are written with nikud. Claude writes fewer words when it must add the dots, so the backend asks for more words to get the right length.

### The voice worker (the voice chef)
- A **separate program** with its own Python. It uses **Chatterbox**, an open-source AI that copies a voice from a short sample.
- It is separate because it is heavy (the model is almost 4 GB) and because it can run on a different computer later.
- It is slow on a normal computer: about 4 seconds of work for each second of audio. So making audio is a **background job**: the app starts it and shows a progress bar.

## 4. Three journeys through the system

### Journey A: "Write me a story"
1. You type ideas in the app and tap Create.
2. The app sends them to the backend, with your **login token** (explained below).
3. The backend checks: are you logged in? Did you use up your daily limit?
4. It builds the prompt and asks Claude.
5. Claude sends back a story. The backend saves it in the database and returns it.
6. The app shows it. A sequel works the same way, but the prompt also includes the end of the last chapter.

### Journey B: "Read it in mom's voice"
1. **Once:** mom records 10 to 120 seconds in the app and ticks a **consent** box. The backend asks the voice worker for the real length of the recording, saves the file in the media folder and a row in the database.
2. You open an English story and tap "Make audio".
3. The backend checks the story text for danger (see safety below), then starts a **background job**.
4. The job cuts the story into small pieces (about 250 characters), sends each piece to the voice worker, and glues the sound together into one file.
5. The app asks "how far?" every few seconds and shows the bar.
6. When it is done, you tap Play. The app gets a **signed link** that works for 5 minutes only.

### Journey C: "Read it yourself"
A parent records their own reading of a story. It is saved and the child can play it. No AI voice is used, so it is free and works for any language.

## 5. How the app knows who you are
- When you register, your password is turned into a scrambled code with **bcrypt**. Nobody, not even us, can turn it back into the password. When you log in, we scramble what you typed and compare.
- After you log in, the backend gives the app a **token** (a JWT). It is like a wristband at a festival. The app shows it with every request. It has a signature, so nobody can fake one, and an expiry time.
- Every story belongs to one user. If you ask for someone else's story, the backend answers "not found".
- You can delete your account. Then all your stories, voices and audio files are deleted too.

## 6. Safety: why the project has so many rules
A cloned voice can be misused, for example to make "mom" say something she never said. So the project has layers (like layers of a castle):

1. **Consent:** you must tick a box, and we save which version of the text you agreed to.
2. **Your own stories only:** you can only make audio from stories you created in the app.
3. **Code check:** a normal program refuses stories with links, e-mail addresses, phone numbers, or long text copied from your own request.
4. **AI check:** a second Claude question: "is it safe to read this in a real person's voice?" If the check fails, the answer is "no" (this is called *fail closed*).
5. **Limits:** one audio job at a time per user, a daily limit, and limits on time and size.
6. **Signed, short links** for audio, and files are deleted together with their owner.
7. **A hidden watermark** is inside every sound that Chatterbox makes.

Honest limit: the tick box does not prove that the voice really belongs to the person. Someone could record another person. This is written down as a known limit.

## 7. Things we do to avoid bugs
- **Tests:** small programs that check the real program. There are about 225 backend tests, 61 app tests and 18 voice worker tests. The tests use a **fake** Claude and a **fake** voice, so they are fast and free.
- **Code review:** a second AI agent (`code-reviewer`) read the code after each phase and listed problems. We fixed the serious ones.
- **Docs:** every feature has a short doc in `docs/`, and `DOCS.md` is the index.
- **Git:** every step is saved as a **commit**, and the code lives on GitHub.

## 8. What costs money and what is free
- Writing stories (Claude): costs a little for each story.
- Cloning, recording, and the phone's own reading voice: free. Cloning runs on your own computer.
- A public launch would add a server, storage and app store fees.

## 9. Words you saw on this page
| Word | Simple meaning |
|---|---|
| App / frontend | The part you see and tap |
| Backend / API | The program behind the scenes that takes requests |
| Endpoint | One address the backend answers, like "write a story" |
| Database | Organized storage for accounts and stories |
| Prompt | The instructions and question we send to an AI |
| Token (JWT) | A signed wristband that proves who you are |
| Hash (bcrypt) | A one-way scramble used to store passwords |
| Background job | Work that takes minutes, done while you do other things |
| Voice cloning | An AI that makes a new voice that sounds like a sample |
| RTL | Right-to-left writing, used for Hebrew |
| Nikud | The vowel dots in Hebrew |
| Fail closed | When a safety check cannot decide, the answer is "no" |

## 10. Try it yourself
1. Read the [README](../README.md) and start the backend and the app.
2. Open `http://localhost:8000/docs`. The backend shows all its endpoints there, and you can try them with a button.
3. Make a story, then look in the database or the backend log to see what happened.
4. Pick one safety rule from section 6 and find its test in `backend/tests/`.
