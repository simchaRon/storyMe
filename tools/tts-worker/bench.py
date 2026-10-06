"""How fast is Chatterbox on this computer? Run:  .venv\Scripts\python bench.py <reference.wav> [turbo|standard]

It loads the model, copies the voice of the reference file, makes two sentences, and prints how long
each step took. "Real-time factor" below 1.0 means the audio is made faster than it plays.
"""

import sys
import time

import torch
import torchaudio

reference = sys.argv[1]
which = sys.argv[2] if len(sys.argv) > 2 else "turbo"

SENTENCES = [
    "Once upon a time, a little fox looked up at the big round moon and said good night.",
    "The wind blew softly between the trees, and the stars twinkled one by one in the dark sky, while the fox curled up in his warm den.",
]

print(f"torch {torch.__version__}, threads {torch.get_num_threads()}, cuda {torch.cuda.is_available()}", flush=True)

t = time.time()
if which == "turbo":
    from chatterbox.tts_turbo import ChatterboxTurboTTS as Model
else:
    from chatterbox.tts import ChatterboxTTS as Model
model = Model.from_pretrained(device="cpu")
print(f"[{which}] model loaded in {time.time() - t:.0f}s (sample rate {model.sr})", flush=True)

t = time.time()
model.prepare_conditionals(reference)
print(f"voice prepared in {time.time() - t:.1f}s", flush=True)

for i, text in enumerate(SENTENCES, start=1):
    t = time.time()
    wav = model.generate(text)  # uses the prepared voice
    took = time.time() - t
    seconds = wav.shape[-1] / model.sr
    print(f"sentence {i}: {len(text)} chars -> {seconds:.1f}s of audio in {took:.1f}s  (real-time factor {took / seconds:.1f})", flush=True)
    torchaudio.save(f"bench-{which}-{i}.wav", wav, model.sr)
print("done", flush=True)
