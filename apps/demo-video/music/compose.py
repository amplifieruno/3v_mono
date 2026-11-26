# /// script
# requires-python = ">=3.10"
# dependencies = ["numpy<2.3", "scipy==1.15.3", "soundfile==0.13.1"]
# ///
"""Composes the music bed (public/audio/music.mp3): a calm ambient pad written in code, so it is ours to use.

72 bars at 84 BPM (about 206 s, the length of the film), in D major: I - vi - IV - Vsus, two bars per chord.
Bars 1-8 are the pad alone (title), the arpeggio and bass carry the middle, and the last bars settle on
the home chord. Everything sits low and soft, under the narration.

Usage: uv run music/compose.py
"""

import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import butter, fftconvolve, sawtooth, sosfilt

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "audio"
RATE = 44100
BPM = 84
BAR = 60 / BPM * 4
BARS = 72
rng = np.random.default_rng(7)

# Pad voicings (MIDI), bass roots, two bars each.
CHORDS = [
    ([57, 61, 64, 66, 69], 38),  # Dmaj9
    ([54, 57, 61, 62, 66], 35),  # Bm9
    ([55, 59, 62, 66, 69], 31),  # Gmaj9
    ([57, 62, 64, 69, 71], 33),  # Asus4(add9)
]
ARP = [0, 2, 1, 3, 2, 4, 3, 1]  # chord-tone order for the eighth notes


def hz(midi: float) -> float:
    return 440.0 * 2 ** ((midi - 69) / 12)


def lowpass(x: np.ndarray, cutoff: float, order: int = 2) -> np.ndarray:
    return sosfilt(butter(order, cutoff, fs=RATE, output="sos"), x)


def envelope(n: int, attack: float, release: float) -> np.ndarray:
    """Linear-in-dB-ish swell: smooth attack, sustain, smooth release, all in samples of one note."""
    env = np.ones(n)
    a, r = int(attack * RATE), int(release * RATE)
    env[:a] = np.sin(np.linspace(0, np.pi / 2, a)) ** 2
    env[n - r :] *= np.cos(np.linspace(0, np.pi / 2, r)) ** 2
    return env


def pad_note(midi: int, seconds: float) -> np.ndarray:
    n = int(seconds * RATE)
    t = np.arange(n) / RATE
    voice = np.zeros(n)
    for cents in (-7, 0, 7):
        f = hz(midi + cents / 100)
        voice += sawtooth(2 * np.pi * f * t + rng.uniform(0, 2 * np.pi))
    voice = lowpass(lowpass(voice, 1100), 1800)
    voice *= 1 + 0.08 * np.sin(2 * np.pi * 0.15 * t + rng.uniform(0, 6))  # slow breathing
    return voice * envelope(n, 1.8, 2.6) / 3


def bass_note(midi: int, seconds: float) -> np.ndarray:
    n = int(seconds * RATE)
    t = np.arange(n) / RATE
    f = hz(midi)
    tone = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(4 * np.pi * f * t) + 0.12 * np.sin(6 * np.pi * f * t)
    return tone * envelope(n, 0.6, 1.6)


def pluck(midi: int, velocity: float) -> np.ndarray:
    n = int(1.4 * RATE)
    t = np.arange(n) / RATE
    f = hz(midi)
    tone = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(4 * np.pi * f * t) + 0.08 * np.sin(6 * np.pi * f * t)
    env = np.exp(-t / 0.35) * np.minimum(1, t / 0.006)
    return tone * env * velocity


def place(track: np.ndarray, sound: np.ndarray, at: float) -> None:
    i = int(at * RATE)
    j = min(len(track), i + len(sound))
    track[i:j] += sound[: j - i]


def reverb(seconds: float, channel: int) -> np.ndarray:
    """A soft hall: decaying, darkened noise, different per channel for width."""
    n = int(seconds * RATE)
    t = np.arange(n) / RATE
    ir = np.random.default_rng(100 + channel).standard_normal(n) * np.exp(-t / (seconds / 6.5))
    ir = lowpass(ir, 3500)
    return ir / np.sqrt(np.sum(ir**2))


def stems() -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """The pad, bass and arpeggio, each mono, over the whole piece."""
    total = BARS * BAR + 6.0
    n = int(total * RATE)
    pad, bass, arp = np.zeros(n), np.zeros(n), np.zeros(n)

    for bar in range(0, BARS, 2):
        notes, root = CHORDS[(bar // 2) % len(CHORDS)]
        last = bar >= BARS - 4
        if last:  # the ending: the home chord, held into the fade
            notes, root = CHORDS[0]
        start = bar * BAR
        hold = (BARS - bar) * BAR + 4 if last else 2 * BAR + 2.6
        for m in notes:
            place(pad, pad_note(m, hold), start)
        if 8 <= bar < BARS - 2:
            place(bass, bass_note(root, 2 * BAR + 1.6), start)
        if 8 <= bar < BARS - 6:
            thin = 32 <= bar < 40  # a lighter passage halfway through
            for k in range(16):
                if thin and k % 2:
                    continue
                v = 0.32 * (0.8 + 0.2 * rng.random()) * (1.0 if k % 4 == 0 else 0.75)
                place(arp, pluck(notes[ARP[k % 8]] + 12, v), start + k * BAR / 8)
        if last:
            break
    return pad, bass, arp


def main() -> None:
    pad, bass, arp = stems()
    n = len(pad)
    total = n / RATE
    # Arpeggio in a gentle dotted-eighth ping-pong, the pad wide, the bass in the middle.
    arp = lowpass(arp, 3200)
    delay = int(BAR * 3 / 16 * RATE)
    left, right = arp.copy(), arp.copy()
    echo = np.zeros(n)
    echo[delay:] = arp[:-delay] * 0.35
    right += echo
    echo2 = np.zeros(n)
    echo2[2 * delay :] = arp[: -2 * delay] * 0.18
    left += echo2

    pad_l = pad * 0.9 + np.roll(pad, int(0.011 * RATE)) * 0.1
    pad_r = pad * 0.9 + np.roll(pad, int(0.017 * RATE)) * 0.1
    dry = np.stack([0.55 * pad_l + 0.42 * bass + 0.5 * left, 0.55 * pad_r + 0.42 * bass + 0.5 * right])
    # The hall takes mostly the arpeggio: on held pad chords a noise reverb colours each channel differently.
    send = np.stack([0.1 * pad_l + 0.5 * left, 0.1 * pad_r + 0.5 * right])
    wet = np.stack([fftconvolve(send[c], reverb(4.0, c))[:n] for c in range(2)])
    mix = 0.8 * dry + 0.5 * wet

    # Clear the lowest rumble, fade the tail, and keep peaks well clear of clipping.
    mix = np.stack([sosfilt(butter(2, 35, "highpass", fs=RATE, output="sos"), c) for c in mix])
    mix[:, -int(5 * RATE) :] *= np.cos(np.linspace(0, np.pi / 2, int(5 * RATE))) ** 2
    mix /= np.max(np.abs(mix)) / 0.89

    OUT.mkdir(parents=True, exist_ok=True)
    wav = OUT / "music.wav"
    sf.write(wav, mix.T.astype(np.float32), RATE)
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-i", str(wav), "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
         "-ar", str(RATE), "-c:a", "libmp3lame", "-b:a", "256k", str(OUT / "music.mp3")],
        check=True,
    )
    wav.unlink()
    print(f"music.mp3: {total:.1f}s")


if __name__ == "__main__":
    main()
