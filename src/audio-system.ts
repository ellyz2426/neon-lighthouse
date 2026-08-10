import { createSystem } from '@iwsdk/core';

export class AudioSystem extends createSystem({}) {
  private ctx!: AudioContext;
  private masterGain!: GainNode;
  private volumeOn = true;
  private initialized = false;
  private ambientOsc: OscillatorNode | null = null;
  private ambientGain: GainNode | null = null;

  // Ambient timers
  private seagullTimer = 5;
  private waveCrashTimer = 3;

  // Ambient drone state
  private droneOsc1: OscillatorNode | null = null;
  private droneOsc2: OscillatorNode | null = null;
  private droneGain: GainNode | null = null;
  private droneFilter: BiquadFilterNode | null = null;
  private targetDroneTone = 0; // 0=calm, 1=stormy

  init() {
    const initAudio = () => {
      if (this.initialized) return;
      this.initialized = true;
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.4;
      this.masterGain.connect(this.ctx.destination);
      this.startAmbient();
      this.startDrone();
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

  private startDrone() {
    if (!this.ctx) return;

    // Two detuned oscillators for rich drone
    this.droneOsc1 = this.ctx.createOscillator();
    this.droneOsc2 = this.ctx.createOscillator();
    this.droneOsc1.type = 'sine';
    this.droneOsc2.type = 'sine';
    this.droneOsc1.frequency.value = 55; // A1
    this.droneOsc2.frequency.value = 55.5; // slightly detuned for chorus

    this.droneFilter = this.ctx.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.value = 200;
    this.droneFilter.Q.value = 1;

    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.value = 0.025;

    this.droneOsc1.connect(this.droneFilter);
    this.droneOsc2.connect(this.droneFilter);
    this.droneFilter.connect(this.droneGain);
    this.droneGain.connect(this.masterGain);

    this.droneOsc1.start();
    this.droneOsc2.start();
  }

  setDroneTone(storminess: number) {
    this.targetDroneTone = Math.max(0, Math.min(1, storminess));
  }

  private updateDrone() {
    if (!this.ctx || !this.droneOsc1 || !this.droneOsc2 || !this.droneFilter || !this.droneGain) return;
    const now = this.ctx.currentTime;
    const s = this.targetDroneTone;
    // Calm: A1 (55Hz), warm low-pass
    // Stormy: D2 (73Hz) + detuned, brighter filter, more volume
    const baseFreq = 55 + s * 18;
    this.droneOsc1.frequency.linearRampToValueAtTime(baseFreq, now + 3);
    this.droneOsc2.frequency.linearRampToValueAtTime(baseFreq + 0.5 + s * 2, now + 3);
    this.droneFilter.frequency.linearRampToValueAtTime(200 + s * 300, now + 3);
    this.droneGain.gain.linearRampToValueAtTime(0.025 + s * 0.03, now + 3);
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

  playDistressHorn() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (let rep = 0; rep < 3; rep++) {
      const t = now + rep * 0.4;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, t);
      osc.frequency.linearRampToValueAtTime(280, t + 0.15);
      gain.gain.setValueAtTime(0.15, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.3);
    }
  }

  playTreasureChime() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const notes = [523, 659, 784, 1047, 1319];
    for (let i = 0; i < notes.length; i++) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = notes[i];
      const t = now + i * 0.08;
      gain.gain.setValueAtTime(0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.4);
    }
  }

  playFlareSound() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(2000, now + 0.4);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.linearRampToValueAtTime(0.15, now + 0.2);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.5);

    const pop = this.ctx.createOscillator();
    const popGain = this.ctx.createGain();
    pop.type = 'square';
    pop.frequency.value = 1500;
    popGain.gain.setValueAtTime(0.1, now + 0.35);
    popGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    pop.connect(popGain);
    popGain.connect(this.masterGain);
    pop.start(now + 0.35);
    pop.stop(now + 0.5);
  }

  playSeagull() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.linearRampToValueAtTime(1600, now + 0.15);
    osc.frequency.linearRampToValueAtTime(1100, now + 0.4);
    osc.frequency.linearRampToValueAtTime(1400, now + 0.55);
    osc.frequency.linearRampToValueAtTime(900, now + 0.8);
    gain.gain.setValueAtTime(0.02, now);
    gain.gain.linearRampToValueAtTime(0.05, now + 0.1);
    gain.gain.linearRampToValueAtTime(0.03, now + 0.4);
    gain.gain.linearRampToValueAtTime(0.04, now + 0.55);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.8);
  }

  playWaveCrash() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const bufferSize = Math.floor(this.ctx.sampleRate * 1.5);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const env = Math.sin((i / bufferSize) * Math.PI);
      data[i] = (Math.random() * 2 - 1) * env * 0.3;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.04, now + 0.3);
    gain.gain.linearRampToValueAtTime(0.06, now + 0.8);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 800;
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    noise.start(now);
    noise.stop(now + 1.5);
  }

  playUpgradeSound() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(900, now + 0.3);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.4);

    const chime = this.ctx.createOscillator();
    const chimeGain = this.ctx.createGain();
    chime.type = 'sine';
    chime.frequency.value = 880;
    chimeGain.gain.setValueAtTime(0.12, now + 0.25);
    chimeGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    chime.connect(chimeGain);
    chimeGain.connect(this.masterGain);
    chime.start(now + 0.25);
    chime.stop(now + 0.6);
  }

  // New: deep ship horn for large vessels
  playShipHorn() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // Two detuned sawtooth oscillators for rich resonant horn
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc1.type = 'sawtooth';
    osc2.type = 'sawtooth';
    osc1.frequency.setValueAtTime(110, now);
    osc1.frequency.linearRampToValueAtTime(95, now + 1.8);
    osc2.frequency.setValueAtTime(112, now);
    osc2.frequency.linearRampToValueAtTime(96, now + 1.8);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.1, now + 0.4);
    gain.gain.setValueAtTime(0.1, now + 1.2);
    gain.gain.linearRampToValueAtTime(0, now + 2.2);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 280;
    filter.Q.value = 2;
    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 2.2);
    osc2.stop(now + 2.2);
  }

  playTidalWave() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // Deep rumbling sub-bass
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(30, now);
    osc.frequency.linearRampToValueAtTime(50, now + 1);
    osc.frequency.linearRampToValueAtTime(25, now + 3);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.5);
    gain.gain.setValueAtTime(0.2, now + 2);
    gain.gain.linearRampToValueAtTime(0, now + 3.5);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 3.5);
    // Wave surge noise
    const bufferSize = Math.floor(this.ctx.sampleRate * 3);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.sin((i / bufferSize) * Math.PI) * 0.3;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const nGain = this.ctx.createGain();
    nGain.gain.setValueAtTime(0, now);
    nGain.gain.linearRampToValueAtTime(0.08, now + 0.5);
    nGain.gain.setValueAtTime(0.08, now + 2);
    nGain.gain.linearRampToValueAtTime(0, now + 3.5);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;
    noise.connect(filter);
    filter.connect(nGain);
    nGain.connect(this.masterGain);
    noise.start(now);
    noise.stop(now + 3.5);
  }

  // New: sonar ping for fog mechanic
  // Combo chime — rising pitch with combo count
  playComboChime(comboCount: number) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const baseNote = 523 + Math.min(comboCount - 2, 8) * 60; // C5 rising
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseNote, now);
    osc.frequency.linearRampToValueAtTime(baseNote * 1.5, now + 0.15);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.3);

    // Second harmonic for richness
    const osc2 = this.ctx.createOscillator();
    const gain2 = this.ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.value = baseNote * 1.5;
    gain2.gain.setValueAtTime(0.06, now + 0.05);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc2.connect(gain2);
    gain2.connect(this.masterGain);
    osc2.start(now + 0.05);
    osc2.stop(now + 0.25);
  }

  // New: sonar ping for fog mechanic
  playSonarPing() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // Classic sonar ping
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.exponentialRampToValueAtTime(600, now + 1.0);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 1.2);
  }

  update(delta: number, _time: number) {
    if (!this.initialized) return;

    // Ambient seagull calls
    this.seagullTimer -= delta;
    if (this.seagullTimer <= 0) {
      this.playSeagull();
      this.seagullTimer = 8 + Math.random() * 15;
    }

    // Ambient wave crashes
    this.waveCrashTimer -= delta;
    if (this.waveCrashTimer <= 0) {
      this.playWaveCrash();
      this.waveCrashTimer = 5 + Math.random() * 10;
    }

    // Update drone tonality
    this.updateDrone();
  }

  // Whale song — eerie deep call
  playWhaleCall() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(80, now);
    osc.frequency.linearRampToValueAtTime(120, now + 0.8);
    osc.frequency.linearRampToValueAtTime(70, now + 2.0);
    osc.frequency.linearRampToValueAtTime(100, now + 3.0);
    osc.frequency.linearRampToValueAtTime(60, now + 4.5);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.06, now + 0.3);
    gain.gain.setValueAtTime(0.06, now + 1.5);
    gain.gain.linearRampToValueAtTime(0.08, now + 2.5);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 5.0);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 250;
    filter.Q.value = 3;
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 5.0);

    // Overtone for eerie quality
    const osc2 = this.ctx.createOscillator();
    const gain2 = this.ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(160, now + 0.5);
    osc2.frequency.linearRampToValueAtTime(200, now + 1.5);
    osc2.frequency.linearRampToValueAtTime(140, now + 3.5);
    gain2.gain.setValueAtTime(0, now + 0.5);
    gain2.gain.linearRampToValueAtTime(0.02, now + 1.0);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 4.0);
    osc2.connect(filter);
    filter.connect(gain2);
    gain2.connect(this.masterGain);
    osc2.start(now + 0.5);
    osc2.stop(now + 4.0);
  }
}
