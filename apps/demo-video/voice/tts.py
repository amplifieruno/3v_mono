# /// script
# requires-python = ">=3.10"
# dependencies = ["kokoro-onnx==0.4.9", "soundfile==0.13.1", "numpy<2.3"]
# ///
"""Synthesizes the narration (src/narration.json) with Kokoro-82M, one WAV per line.

Writes public/voice/<id>.wav and public/voice/manifest.json:
{ "<id>": { "duration": s, "sentences": [{ "text", "start", "end" }] } }.
Each sentence is synthesized on its own so subtitles know exactly when it plays.

Usage: uv run voice/tts.py [id ...]   (all lines by default; others keep their files)
"""

import json
import re
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / ".cache" / "kokoro"
OUT = ROOT / "public" / "voice"
GAP = 0.28  # silence between sentences of one line, seconds
TARGET_RMS = 10 ** (-20 / 20)  # every line at the same loudness, about -20 dBFS RMS
PEAK = 10 ** (-1.5 / 20)  # and never above -1.5 dBFS


def sentences(text: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]


def trim(audio: np.ndarray, rate: int) -> np.ndarray:
    """Cuts leading and trailing silence, keeping 40 ms on each side."""
    loud = np.flatnonzero(np.abs(audio) > 0.01)
    if loud.size == 0:
        return audio
    pad = int(0.04 * rate)
    return audio[max(0, loud[0] - pad) : loud[-1] + pad]


def level(audio: np.ndarray) -> np.ndarray:
    """Scales a line to the shared loudness, capped so its peaks stay clear of clipping."""
    voiced = audio[np.abs(audio) > 0.01]
    rms = float(np.sqrt(np.mean(voiced**2))) if voiced.size else 0.0
    if rms == 0.0:
        return audio
    gain = min(TARGET_RMS / rms, PEAK / float(np.max(np.abs(audio))))
    return (audio * gain).astype(np.float32)


def main() -> None:
    spec = json.loads((ROOT / "src" / "narration.json").read_text())
    wanted = set(sys.argv[1:])
    OUT.mkdir(parents=True, exist_ok=True)
    manifest_path = OUT / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    kokoro = Kokoro(str(CACHE / "kokoro-v1.0.onnx"), str(CACHE / "voices-v1.0.bin"))
    for line_id, text in spec["lines"].items():
        if wanted and line_id not in wanted:
            continue
        parts, timing, t = [], [], 0.0
        for s in sentences(text):
            spoken = s
            for word, say in spec.get("pronounce", {}).items():
                spoken = re.sub(rf"\b{re.escape(word)}\b", say, spoken)
            audio, rate = kokoro.create(spoken, voice=spec["voice"], speed=spec["speed"], lang="en-us")
            audio = trim(audio, rate)
            if parts:
                parts.append(np.zeros(int(GAP * rate), dtype=audio.dtype))
                t += GAP
            parts.append(audio)
            dur = len(audio) / rate
            timing.append({"text": s, "start": round(t, 3), "end": round(t + dur, 3)})
            t += dur
        sf.write(OUT / f"{line_id}.wav", level(np.concatenate(parts)), rate)
        manifest[line_id] = {"duration": round(t, 3), "sentences": timing}
        print(f"{line_id}: {t:.2f}s")
    manifest = {k: manifest[k] for k in spec["lines"] if k in manifest}
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()
