# /// script
# requires-python = ">=3.10"
# dependencies = ["numpy<2.3", "scipy==1.15.3", "soundfile==0.13.1"]
# ///
"""The livelier music bed: the same pad and voice-friendly mix as compose.py, with a beat under it.

96 bars at 112 BPM (about 206 s), Bm - G - D - A, one bar per chord. Soft kick on the quarters, a dark
clap on two and four, closed hats on the off-beats, a pulsing eighth-note bass and a sixteenth-note
arpeggio, with the pad ducking under the kick. The shape follows the film: the pad alone under the title,
a four-bar build, the beat through the chapters with a breakdown in the middle, and a settle on D at the end.

Usage: uv run music/drive.py   (writes public/audio/music.mp3, like compose.py)
"""

import numpy as np
from scipy.signal import butter, fftconvolve, sosfilt

from compose import RATE, hz, lowpass, pad_note, place, pluck, reverb, write

BPM = 112
BEAT = 60 / BPM
BAR = BEAT * 4
BARS = 96
rng = np.random.default_rng(11)

# Pad voicings (MIDI) and bass roots, one bar each.
CHORDS = [
    ([54, 57, 61, 62, 66], 47),  # Bm9
    ([55, 59, 62, 66, 69], 43),  # Gmaj9
    ([57, 61, 64, 66, 69], 50),  # Dmaj9
    ([57, 62, 64, 69, 71], 45),  # Asus4(add9)
]
HOME = ([57, 61, 64, 66, 69], 50)
ARP = [0, 2, 4, 2, 1, 3, 4, 3, 0, 2, 4, 2, 1, 3, 2, 1]  # chord-tone order for the sixteenths

INTRO, BUILD = 4, 8  # pad alone until bar 4, arpeggio and hats join until bar 8
BREAK = range(44, 52)  # no kick or bass: a breather halfway through
OUTRO = BARS - 6  # the beat stops; the home chord rings out


def band(x: np.ndarray, lo: float, hi: float) -> np.ndarray:
    return sosfilt(butter(2, [lo, hi], "bandpass", fs=RATE, output="sos"), x)


def kick() -> np.ndarray:
    t = np.arange(int(0.45 * RATE)) / RATE
    f = 46 + 74 * np.exp(-t / 0.035)
    return np.sin(2 * np.pi * np.cumsum(f) / RATE) * np.exp(-t / 0.2) * np.minimum(1, t / 0.002)


def clap() -> np.ndarray:
    n = int(0.35 * RATE)
    t = np.arange(n) / RATE
    noise = band(rng.standard_normal(n), 800, 2600)
    env = np.exp(-t / 0.08)
    for d in (0.0, 0.011, 0.022):  # the three hands of a clap
        env += 0.6 * np.exp(-np.maximum(0, t - d) / 0.006) * (t >= d)
    return noise * env / 3


def hat(decay: float) -> np.ndarray:
    n = int(0.2 * RATE)
    t = np.arange(n) / RATE
    noise = sosfilt(butter(2, 7500, "highpass", fs=RATE, output="sos"), rng.standard_normal(n))
    return noise * np.exp(-t / decay) * np.minimum(1, t / 0.001)


def synth_bass(midi: int, seconds: float) -> np.ndarray:
    n = int(seconds * RATE)
    t = np.arange(n) / RATE
    f = hz(midi)
    tone = np.sin(2 * np.pi * f * t) + 0.45 * np.sin(4 * np.pi * f * t) + 0.2 * np.sin(6 * np.pi * f * t)
    return lowpass(tone * np.exp(-t / 0.16) * np.minimum(1, t / 0.004), 600)


def pump(n: int, beats: list[float]) -> np.ndarray:
    """Gain that dips on every kick and recovers within the beat: the pad breathes with the groove."""
    g = np.ones(n)
    t = np.arange(int(BEAT * RATE)) / RATE
    dip = 1 - 0.45 * np.exp(-t / 0.11)
    for b in beats:
        i = int(b * RATE)
        j = min(n, i + len(dip))
        g[i:j] = np.minimum(g[i:j], dip[: j - i])
    return g


def main() -> None:
    n = int((BARS * BAR + 6.0) * RATE)
    pad, bass, arp, drums, room = (np.zeros(n) for _ in range(5))
    k, c, hc = kick(), clap(), hat(0.022)
    kicks: list[float] = []

    for bar in range(BARS):
        start = bar * BAR
        last = bar >= OUTRO
        notes, root = HOME if last else CHORDS[bar % len(CHORDS)]
        if bar <= OUTRO:
            hold = (BARS - bar) * BAR + 4 if last else BAR + 1.4
            for m in notes:
                place(pad, pad_note(m, hold), start)
        groove = BUILD <= bar < OUTRO and bar not in BREAK
        if bar >= INTRO and bar < OUTRO:
            for s in range(16):
                if bar < BUILD and s % 2:
                    continue
                v = 0.24 * (0.85 + 0.15 * rng.random()) * (1.0 if s % 4 == 0 else 0.7)
                place(arp, pluck(notes[ARP[s]] + 12, v)[: int(0.5 * RATE)], start + s * BEAT / 4)
            for e in range(8):  # closed hats on the off-beat eighths, softer in the build
                if e % 2:
                    place(drums, hc * (0.28 if groove else 0.16), start + e * BEAT / 2)
        if groove:
            for b in range(4):
                place(drums, k * 1.15, start + b * BEAT)
                kicks.append(start + b * BEAT)
                if b % 2:
                    place(drums, c * 0.5, start + b * BEAT)
                    place(room, c * 0.5, start + b * BEAT)
            for e in range(8):
                place(bass, synth_bass(root - 12 if e % 2 == 0 else root, BEAT / 2 + 0.1), start + e * BEAT / 2)
        if bar == BREAK.stop - 1:  # a small fill into the return of the beat
            for s in (12, 13, 14, 15):
                place(drums, hc * 0.22, start + s * BEAT / 4)

    pad *= pump(n, kicks)
    arp = lowpass(arp, 3400)
    delay = int(BEAT * 3 / 4 * RATE)  # dotted-eighth echo, alternating sides
    left, right = arp.copy(), arp.copy()
    right[delay:] += arp[:-delay] * 0.3
    left[2 * delay :] += arp[: -2 * delay] * 0.15

    pad_l = pad * 0.9 + np.roll(pad, int(0.011 * RATE)) * 0.1
    pad_r = pad * 0.9 + np.roll(pad, int(0.017 * RATE)) * 0.1
    common = 0.42 * bass + 0.55 * drums
    dry = np.stack([0.45 * pad_l + common + 0.5 * left, 0.45 * pad_r + common + 0.5 * right])
    send = np.stack([0.08 * pad_l + 0.4 * left + 0.5 * room, 0.08 * pad_r + 0.4 * right + 0.5 * room])
    wet = np.stack([fftconvolve(send[ch], reverb(2.6, ch))[:n] for ch in range(2)])
    write(0.82 * dry + 0.45 * wet)
    print(f"music.mp3 (drive): {n / RATE:.1f}s")


if __name__ == "__main__":
    main()
