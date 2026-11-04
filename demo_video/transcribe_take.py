"""Transcribes a voice take with word timestamps (faster-whisper, runs locally) -> build/take_words.json."""
import json
import subprocess
import sys

import numpy as np
from faster_whisper import WhisperModel

model = WhisperModel("small.en", device="cpu", compute_type="int8")
prompt = " ".join(l["text"] for l in json.load(open("narration.json")))  # biases spelling of MuJoCo, UR5e, Nimbotics
raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", sys.argv[1], "-f", "f32le", "-ac", "1", "-ar", "16000", "-"],
                     check=True, capture_output=True).stdout
audio = np.frombuffer(raw, dtype=np.float32)
segments, _ = model.transcribe(audio, word_timestamps=True, initial_prompt=prompt[:800], vad_filter=False)
words = [{"w": w.word.strip(), "s": round(w.start, 3), "e": round(w.end, 3), "p": round(w.probability, 3)}
         for seg in segments for w in seg.words]
json.dump(words, open("build/take_words.json", "w"), indent=0)
print(len(words), "words")
print(" ".join(w["w"] for w in words))
