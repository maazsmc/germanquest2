// Lightweight retro RPG Web Audio Synthesizer
// Synthesizes charming nostalgic sound effects directly in the browser with ZERO asset requirements!

let sfxEnabled = localStorage.getItem("gq_sfx_enabled") !== "false";

export function isSFXEnabled(): boolean {
  return sfxEnabled;
}

export function toggleSFX(): boolean {
  sfxEnabled = !sfxEnabled;
  localStorage.setItem("gq_sfx_enabled", sfxEnabled ? "true" : "false");
  return sfxEnabled;
}

function getAudioContext(): AudioContext | null {
  if (!sfxEnabled) return null;
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return null;
  return new AudioContextClass();
}

export class AudioSFX {
  // Charming retro coin collection chime
  static playCoin() {
    const ctx = getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc1.type = "sine";
      osc2.type = "triangle";

      // Classic coin sound: 2 quick ascending distinct pitches
      osc1.frequency.setValueAtTime(987.77, now); // B5
      osc1.frequency.setValueAtTime(1318.51, now + 0.08); // E6

      osc2.frequency.setValueAtTime(987.77 * 1.5, now);
      osc2.frequency.setValueAtTime(1318.51 * 1.5, now + 0.08);

      gainNode.gain.setValueAtTime(0.08, now);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.4);
      osc2.stop(now + 0.4);
    } catch (e) {
      console.warn("AudioContext failed:", e);
    }
  }

  // Sparkling magical sweep for correct answers
  static playCorrect() {
    const ctx = getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc.type = "triangle";
      
      // Sweet sweeping sound
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.exponentialRampToValueAtTime(1046.50, now + 0.2); // C6

      gainNode.gain.setValueAtTime(0.1, now);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

      osc.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.3);
    } catch (e) {
      console.warn("AudioContext failed:", e);
    }
  }

  // Deep retro buzz for errors
  static playError() {
    const ctx = getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc.type = "sawtooth";
      
      // Pitch drop representing failed spell
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.linearRampToValueAtTime(110, now + 0.25);

      gainNode.gain.setValueAtTime(0.06, now);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.26);

      osc.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.27);
    } catch (e) {
      console.warn("AudioContext failed:", e);
    }
  }

  // Epic level-up fanfare (Ascending major chords sweep!)
  static playLevelUp() {
    const ctx = getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50]; // C Major scale notes
      
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();

        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);

        gainNode.gain.setValueAtTime(0.08, now + idx * 0.08);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.4);

        osc.connect(gainNode);
        gainNode.connect(ctx.destination);

        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.42);
      });
    } catch (e) {
      console.warn("AudioContext failed:", e);
    }
  }

  // Boss Damage retro crunchy noise explosion
  static playBossHit() {
    const ctx = getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.exponentialRampToValueAtTime(50, now + 0.35);

      gainNode.gain.setValueAtTime(0.12, now);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.36);
    } catch (e) {
      console.warn("AudioContext failed:", e);
    }
  }

  // Dramatic triumph tune
  static playVictory() {
    const ctx = getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const fanfares = [
        { freq: 440.00, time: 0 },   // A4
        { freq: 554.37, time: 0.15 }, // C#5
        { freq: 659.25, time: 0.3 },  // E5
        { freq: 880.00, time: 0.45 }  // A5 (long)
      ];

      fanfares.forEach((fan, idx) => {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(fan.freq, now + fan.time);

        const duration = idx === 3 ? 0.6 : 0.14;

        gainNode.gain.setValueAtTime(0.09, now + fan.time);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + fan.time + duration);

        osc.connect(gainNode);
        gainNode.connect(ctx.destination);

        osc.start(now + fan.time);
        osc.stop(now + fan.time + duration + 0.02);
      });
    } catch (e) {
      console.warn("AudioContext failed:", e);
    }
  }
}
