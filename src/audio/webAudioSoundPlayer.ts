// Procedurally-generated WebAudio sound effects for core game actions — no
// external audio files, per docs/concept.md's no-external-assets rule. Only
// src/main.ts constructs this; game logic depends on the DOM-global-free
// SoundPlayer interface (src/audio/soundPlayer.ts) instead.

import type { SoundEvent, SoundPlayer } from './soundPlayer';

interface Tone {
  frequency: number;
  type: OscillatorType;
  durationS: number;
}

// Pitch/timbre pairs chosen so +/- direction is audibly distinguishable
// (higher pitch for "up" events, lower for "down") and commander-damage
// tones use a different timbre than plain life tones for the same reason.
const TONES: Record<SoundEvent, Tone[]> = {
  lifeUp: [{ frequency: 660, type: 'sine', durationS: 0.09 }],
  lifeDown: [{ frequency: 260, type: 'sine', durationS: 0.09 }],
  turnPass: [
    { frequency: 440, type: 'triangle', durationS: 0.07 },
    { frequency: 587, type: 'triangle', durationS: 0.09 },
  ],
  commanderDamageUp: [{ frequency: 520, type: 'sawtooth', durationS: 0.1 }],
  commanderDamageDown: [{ frequency: 180, type: 'sawtooth', durationS: 0.12 }],
  eliminate: [
    { frequency: 300, type: 'square', durationS: 0.12 },
    { frequency: 180, type: 'square', durationS: 0.18 },
  ],
  gameEnd: [
    { frequency: 523, type: 'triangle', durationS: 0.12 },
    { frequency: 659, type: 'triangle', durationS: 0.12 },
    { frequency: 784, type: 'triangle', durationS: 0.2 },
  ],
};

const PEAK_GAIN = 0.15;

export class WebAudioSoundPlayer implements SoundPlayer {
  private context: AudioContext | null = null;

  /** Fires and forgets: scheduling is async internally, but this call never awaits, so it can't delay the caller's visual update. */
  play(event: SoundEvent): void {
    try {
      const context = this.ensureContext();
      if (!context) {
        return;
      }
      if (context.state === 'suspended') {
        void context.resume();
      }
      let startAt = context.currentTime;
      for (const tone of TONES[event]) {
        this.playTone(context, tone, startAt);
        startAt += tone.durationS;
      }
    } catch {
      // WebAudio can be unavailable or blocked (autoplay policy, unsupported
      // browser); sound is a nice-to-have and must never break the game.
    }
  }

  private ensureContext(): AudioContext | null {
    if (this.context) {
      return this.context;
    }
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) {
      return null;
    }
    this.context = new Ctor();
    return this.context;
  }

  private playTone(context: AudioContext, tone: Tone, startAt: number): void {
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();
    oscillator.type = tone.type;
    oscillator.frequency.setValueAtTime(tone.frequency, startAt);
    gainNode.gain.setValueAtTime(0, startAt);
    gainNode.gain.linearRampToValueAtTime(PEAK_GAIN, startAt + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startAt + tone.durationS);
    oscillator.connect(gainNode);
    gainNode.connect(context.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + tone.durationS + 0.02);
  }
}
