# Voice worker (English voice cloning)

A small separate program that says text in a cloned voice. The backend sends it a voice sample and one piece of text at a time. It uses [Chatterbox](https://github.com/resemble-ai/chatterbox) (open source, MIT licence). It runs on your own computer, so the voice samples never go to another company.

Read [docs/flow-cloning.md](../../docs/flow-cloning.md) first. It explains the whole feature and its safety rules.

## Set up (once)
You need Windows, about 6 GB of free disk space, and an internet connection for the first start (the model is 3.9 GB).

In PowerShell, in this folder (`tools\tts-worker`):

```
python -m venv .bootstrap
.bootstrap\Scripts\python -m pip install uv
.bootstrap\Scripts\uv venv --python 3.11 .venv
.bootstrap\Scripts\uv pip install --python .venv\Scripts\python.exe chatterbox-tts fastapi "uvicorn[standard]" python-multipart av pytest httpx
```

Why Python 3.11 and `uv`: Chatterbox is built and tested on Python 3.11. `uv` downloads it into this folder and does not change your computer. The folders `.bootstrap` and `.venv` are ignored by git.

## Run
```
.venv\Scripts\python -m uvicorn server:app --host 127.0.0.1 --port 9000
```
The first request downloads the model (3.9 GB) into `C:\Users\<you>\.cache\huggingface`. To load it when the server starts, set `PRELOAD=1` first:
```
$env:PRELOAD = "1"
```

Then tell the backend where the worker is. In `backend\.env`:
```
TTS_URL=http://127.0.0.1:9000
```
Restart the backend. The app now shows "Read in a cloned voice" on English stories.

## Settings (environment variables)
| Name | Default | What it does |
|---|---|---|
| `TTS_MODEL` | `turbo` | `turbo` is smaller and faster. `standard` is slower and has more controls. `fake` makes a beep and needs no model (for tests). |
| `TTS_API_KEY` | empty | If set, every request must send it in the `X-Api-Key` header. Set the same value as `TTS_API_KEY` in `backend\.env`. **Required if the worker is on another computer.** |
| `TTS_DEVICE` | `cpu` | `cuda` if the computer has an NVIDIA graphics card. |
| `PRELOAD` | not set | `1` loads the model when the server starts. |

Keep `--host 127.0.0.1` unless the worker must be reached from another computer. Then also set a key, and put the worker behind HTTPS.

## What it can do
- `GET /health`: is it running, and is the model loaded?
- `POST /inspect`: how many seconds of sound does a recording have?
- `POST /synthesize`: say a piece of text (up to 600 characters) in the voice of a sample. English only. The first call for a voice sends the sample. The next calls send only its fingerprint, and the worker keeps the voice ready.

Every sample is opened by its real file type (wav, m4a, mp3, webm, ogg), never by its name. At most two files are opened at once, a file that takes more than 20 seconds to read is stopped, and only the first 30 seconds are used. Everything Chatterbox makes carries an inaudible watermark (Resemble's "Perth").

## Test
```
.venv\Scripts\python -m pytest test_server.py
```
18 tests. They use the fake model, so nothing is downloaded. They cover the formats phones and browsers record (m4a, webm).

To check that the backend and a running worker understand each other:
```
..\..\backend\.venv\Scripts\python check_connection.py http://127.0.0.1:9000
```
(Use the backend's Python, not this folder's.)

To measure the speed on your computer, with the real model:
```
.venv\Scripts\python bench.py some-voice-sample.wav turbo
```
It prints how many seconds it takes to make a second of audio.

## If something goes wrong
- **The first request takes very long.** It is downloading or loading the model. Look at the worker window.
- **"the voice sample is too short".** The model needs more than 5 seconds of speech. The app asks for 10 to 120 seconds.
- **The app does not show the cloning card.** The backend needs `TTS_URL` in `.env`, a restart, and the story must be in English.
- **Everything is slow.** This computer has no graphics card, so the voice is made on the processor. See [docs/flow-cloning.md](../../docs/flow-cloning.md) for the measured speed and ideas (a smaller model, a free cloud GPU, a short story).
