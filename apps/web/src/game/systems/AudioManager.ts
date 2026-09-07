import {
  VOLUME_MASTER,
  VOLUME_SFX,
  VOLUME_AMBIENT,
  GUNSHOT_VOLUME,
  IMPACT_VOLUME,
  HIT_VOLUME,
  DAMAGE_VOLUME,
  DEATH_VOLUME,
  FOOTSTEP_VOLUME,
  RELOAD_VOLUME,
} from "@deashot/game-config";

export type SoundName =
  | "gunshot"
  | "impact"
  | "hit"
  | "headshot"
  | "damage"
  | "death"
  | "footstep"
  | "reload";

export interface PlayOptions {
  /** 0..1 gain multiplier on top of the sound's default volume. */
  volume?: number;
  /** Playback rate (buffer-based sounds). */
  rate?: number;
  /** Stereo pan -1 (left) .. 1 (right). */
  pan?: number;
  /** Seconds to wait before starting (e.g. the second reload click). */
  delay?: number;
}

/**
 * Procedural audio for the game (Web Audio API only — no external assets).
 *
 * The AudioContext is created lazily on the first user gesture (pointer-lock
 * click) to satisfy browser autoplay policies. All sounds are synthesized
 * short envelopes: filtered noise bursts + pitched oscillator blips.
 */
export class AudioManager {
  private static instance: AudioManager | null = null;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private ambientBus: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private masterVolume = VOLUME_MASTER;
  private muted = false;
  private ambientStarted = false;

  private constructor() {}

  static getInstance(): AudioManager {
    if (!AudioManager.instance) AudioManager.instance = new AudioManager();
    return AudioManager.instance;
  }

  /** Create/resume the AudioContext. Must run from a user gesture. */
  ensureContext() {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();

      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.masterVolume;
      this.master.connect(this.ctx.destination);

      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = VOLUME_SFX;
      this.sfxBus.connect(this.master);

      this.ambientBus = this.ctx.createGain();
      this.ambientBus.gain.value = VOLUME_AMBIENT;
      this.ambientBus.connect(this.master);

      this.noiseBuffer = this.makeNoiseBuffer(this.ctx);
      this.startAmbient();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  setMasterVolume(v: number) {
    this.masterVolume = v;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(
        this.muted ? 0 : v,
        this.ctx.currentTime,
        0.02
      );
    }
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(
        muted ? 0 : this.masterVolume,
        this.ctx.currentTime,
        0.02
      );
    }
  }

  play(name: SoundName, opts: PlayOptions = {}) {
    if (!this.ctx) return;
    switch (name) {
      case "gunshot":
        this.gunshot(opts);
        break;
      case "impact":
        this.impact(opts);
        break;
      case "hit":
        this.hit(opts, false);
        break;
      case "headshot":
        this.hit(opts, true);
        break;
      case "damage":
        this.damage(opts);
        break;
      case "death":
        this.death(opts);
        break;
      case "footstep":
        this.footstep(opts);
        break;
      case "reload":
        this.reload(opts);
        break;
    }
  }

  dispose() {
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
      this.master = null;
      this.sfxBus = null;
      this.ambientBus = null;
      this.noiseBuffer = null;
      this.ambientStarted = false;
    }
  }

  // --- private synthesis -------------------------------------------------

  private makeNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const length = Math.floor(ctx.sampleRate);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  private outlet(peak: number, opts: PlayOptions): AudioNode {
    const ctx = this.ctx!;
    const gain = ctx.createGain();
    gain.gain.value = peak * (opts.volume ?? 1);
    gain.connect(this.sfxBus!);
    if (opts.pan === undefined) return gain;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, opts.pan));
    pan.connect(gain);
    return pan;
  }

  private startAmbient() {
    if (!this.ctx || this.ambientStarted) return;
    this.ambientStarted = true;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = 220;
    const gain = ctx.createGain();
    gain.gain.value = 0.5;
    src.connect(filt);
    filt.connect(gain);
    gain.connect(this.ambientBus!);
    src.start();
  }

  private gunshot(opts: PlayOptions) {
    const ctx = this.ctx!;
    const out = this.outlet(GUNSHOT_VOLUME, opts);
    const t0 = ctx.currentTime + (opts.delay ?? 0);

    // Loud crack: bandpassed noise with a fast decay.
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    noise.playbackRate.value = opts.rate ?? 1;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 1400;
    band.Q.value = 0.7;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.9, t0);
    ng.gain.exponentialRampToValueAtTime(0.001, t0 + 0.12);
    noise.connect(band);
    band.connect(ng);
    ng.connect(out);
    noise.start(t0);
    noise.stop(t0 + 0.15);

    // Low thump from the gun body.
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(150, t0);
    osc.frequency.exponentialRampToValueAtTime(45, t0 + 0.12);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.7, t0);
    og.gain.exponentialRampToValueAtTime(0.001, t0 + 0.14);
    osc.connect(og);
    og.connect(out);
    osc.start(t0);
    osc.stop(t0 + 0.15);
  }

  private impact(opts: PlayOptions) {
    const ctx = this.ctx!;
    const out = this.outlet(IMPACT_VOLUME, opts);
    const t0 = ctx.currentTime + (opts.delay ?? 0);

    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    noise.playbackRate.value = opts.rate ?? 1.1;
    const low = ctx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = 600;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.55, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.08);
    noise.connect(low);
    low.connect(g);
    g.connect(out);
    noise.start(t0);
    noise.stop(t0 + 0.1);
  }

  private hit(opts: PlayOptions, headshot: boolean) {
    const ctx = this.ctx!;
    const out = this.outlet(HIT_VOLUME, opts);
    const t0 = ctx.currentTime + (opts.delay ?? 0);
    const base = headshot ? 2600 : 1500;

    // Sharp tick: highpassed noise.
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const high = ctx.createBiquadFilter();
    high.type = "highpass";
    high.frequency.value = 3200;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.5, t0);
    ng.gain.exponentialRampToValueAtTime(0.001, t0 + 0.05);
    noise.connect(high);
    high.connect(ng);
    ng.connect(out);
    noise.start(t0);
    noise.stop(t0 + 0.06);

    // Confirmation blip.
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.setValueAtTime(base, t0);
    osc.frequency.exponentialRampToValueAtTime(base * 0.45, t0 + 0.07);
    const og = ctx.createGain();
    og.gain.setValueAtTime(headshot ? 0.28 : 0.2, t0);
    og.gain.exponentialRampToValueAtTime(0.001, t0 + 0.08);
    osc.connect(og);
    og.connect(out);
    osc.start(t0);
    osc.stop(t0 + 0.09);
  }

  private damage(opts: PlayOptions) {
    const ctx = this.ctx!;
    const out = this.outlet(DAMAGE_VOLUME, opts);
    const t0 = ctx.currentTime + (opts.delay ?? 0);

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(140, t0);
    osc.frequency.exponentialRampToValueAtTime(55, t0 + 0.16);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.6, t0);
    og.gain.exponentialRampToValueAtTime(0.001, t0 + 0.2);
    osc.connect(og);
    og.connect(out);
    osc.start(t0);
    osc.stop(t0 + 0.22);

    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const low = ctx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = 350;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.35, t0);
    ng.gain.exponentialRampToValueAtTime(0.001, t0 + 0.1);
    noise.connect(low);
    low.connect(ng);
    ng.connect(out);
    noise.start(t0);
    noise.stop(t0 + 0.12);
  }

  private death(opts: PlayOptions) {
    const ctx = this.ctx!;
    const out = this.outlet(DEATH_VOLUME, opts);
    const t0 = ctx.currentTime + (opts.delay ?? 0);

    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(380, t0);
    osc.frequency.exponentialRampToValueAtTime(55, t0 + 0.45);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.3, t0);
    og.gain.exponentialRampToValueAtTime(0.001, t0 + 0.5);
    const low = ctx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = 900;
    osc.connect(low);
    low.connect(og);
    og.connect(out);
    osc.start(t0);
    osc.stop(t0 + 0.52);
  }

  private footstep(opts: PlayOptions) {
    const ctx = this.ctx!;
    const out = this.outlet(FOOTSTEP_VOLUME, opts);
    const t0 = ctx.currentTime + (opts.delay ?? 0);

    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    noise.playbackRate.value = 0.85 + Math.random() * 0.3;
    const low = ctx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = 480;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.05);
    noise.connect(low);
    low.connect(g);
    g.connect(out);
    noise.start(t0);
    noise.stop(t0 + 0.06);
  }

  private reload(opts: PlayOptions) {
    const ctx = this.ctx!;
    const first = this.outlet(RELOAD_VOLUME, opts);
    const second = this.outlet(RELOAD_VOLUME, { ...opts });
    const t0 = ctx.currentTime + (opts.delay ?? 0);

    const tick = (destination: AudioNode, time: number) => {
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      noise.playbackRate.value = 0.9;
      const band = ctx.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = 1800;
      band.Q.value = 2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.45, time);
      g.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
      noise.connect(band);
      band.connect(g);
      g.connect(destination);
      noise.start(time);
      noise.stop(time + 0.05);
    };

    tick(first, t0);
    tick(second, t0 + 0.14);
  }
}