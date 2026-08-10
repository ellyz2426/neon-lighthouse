import { createSystem } from '@iwsdk/core';

export class AudioSystem extends createSystem({}) {
  private ctx!: AudioContext;
  private masterGain!: GainNode;
  private volumeOn = true;
  private initialized = false;
  private ambientOsc: OscillatorNode | null = null;
  private ambientGain: GainNode | null = null;

  init() {
    const initAudio = () => {
      if (this.initialized) return;
      this.initialized = true;
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.4;
      this.masterGain.connect(this.ctx.destination);
      this.startAmbient();
      document.removeEventListener('click', initAudio);
      document.removeEventListener('pointerdown', initAudio);
    };
    document.addEventListener('click', initAudio);
    document.addEventListener('pointerdown', initAudio);
  }

  private startAmbient() {
    if (!this.ctx) return;
    this.ambientOsc = this.ctx.createOscillator();
    this.ambientOsc.type = 'sine';
    this.ambientOsc.frequency.value = 40;
    this.ambientGain = this.ctx.createGain();
    this.ambientGain.gain.value = 0.05;
    this.ambientOsc.connect(this.ambientGain);
    this.ambientGain.connect(this.masterGain);
    this.ambientOsc.start();
  }

  toggleVolume() {
    this.volumeOn = !this.volumeOn;
    if (this.masterGain) {
      this.masterGain.gain.value = this.volumeOn ? 0.4 : 0;
    }
  }

  isVolumeOn(): boolean {
    return this.volumeOn;
  }

  playFoghorn() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(80, now);
    osc.frequency.linearRampToValueAtTime(60, now + 2);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.15, now + 0.3);
    gain.gain.setValueAtTime(0.15, now + 1.5);
    gain.gain.linearRampToValueAtTime(0, now + 2.5);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 2.5);
  }

  playShipBell() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 800;
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.8);

    const osc2 = this.ctx.createOscillator();
    const gain2 = this.ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.value = 1000;
    gain2.gain.setValueAtTime(0.15, now + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
    osc2.connect(gain2);
    gain2.connect(this.masterGain);
    osc2.start(now + 0.15);
    osc2.stop(now + 0.7);
  }

  playBeamHum() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 120;
    gain.gain.value = 0.03;
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  playDockChime() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const notes = [523, 659, 784];
    for (let i = 0; i < notes.length; i++) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = notes[i];
      const t = now + i * 0.12;
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.6);
    }
  }

  playCrashSound() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const bufferSize = this.ctx.sampleRate * 0.5;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.2));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 600;
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    noise.start(now);
    noise.stop(now + 0.5);

    const osc = this.ctx.createOscillator();
    const boomGain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(100, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.4);
    boomGain.gain.setValueAtTime(0.3, now);
    boomGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    osc.connect(boomGain);
    boomGain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.4);
  }

  playWaveComplete() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const notes = [392, 494, 587, 659, 784];
    for (let i = 0; i < notes.length; i++) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = notes[i];
      const t = now + i * 0.1;
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.5);
    }
  }

  playUIClick() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 600;
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  playGameOver() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const notes = [440, 370, 311, 262];
    for (let i = 0; i < notes.length; i++) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = notes[i];
      const t = now + i * 0.25;
      gain.gain.setValueAtTime(0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.5);
    }
  }

  playStormWind() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.5;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.08, now + 0.5);
    gain.gain.setValueAtTime(0.08, now + 1.5);
    gain.gain.linearRampToValueAtTime(0, now + 2);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 400;
    filter.Q.value = 0.5;
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    noise.start(now);
    noise.stop(now + 2);
  }

  playThunder() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // Low rumbling boom
    const bufferSize = this.ctx.sampleRate * 1.5;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const env = Math.exp(-i / (bufferSize * 0.4));
      data[i] = (Math.random() * 2 - 1) * env;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.25, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 1.5);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 300;
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    noise.start(now);
    noise.stop(now + 1.5);

    // Sub-bass
    const osc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(50, now);
    osc.frequency.exponentialRampToValueAtTime(20, now + 1);
    subGain.gain.setValueAtTime(0.2, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 1);
    osc.connect(subGain);
    subGain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 1);
  }

  update(_delta: number, _time: number) {
    // Nothing per-frame needed
  }
}
