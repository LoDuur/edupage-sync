const MAX_VOICES = 32;
const MAX_HRTF = 5;
const HRTF_RANGE = 28;
const HEARING_RANGE = 75;
const REVERB_RANGE = 30;
const curveCache = new Map();
const MAG_PITCH = { pistol: 2400, smg: 2200, ar: 1800, aa12: 1400, sniper: 1600, rocket: 800 };

function noiseBuffer(ctx, seconds, color = "white") {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    if (color === "brown") {
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    } else data[i] = white;
  }
  return buffer;
}

function impulseResponse(ctx, seconds, decay) {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) {
      const t = i / length;
      const early = i < ctx.sampleRate * 0.03 && Math.random() < 0.004 ? 2 : 0;
      data[i] = ((Math.random() * 2 - 1) + early) * (1 - t) ** decay;
    }
  }
  return buffer;
}

function distortionCurve(amount) {
  const cached = curveCache.get(amount);
  if (cached) return cached;
  const n = 512, curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((3 + amount) * x * 20 * (Math.PI / 180)) / (Math.PI + amount * Math.abs(x));
  }
  curveCache.set(amount, curve);
  return curve;
}

export function createAudio() {
  let ctx = null, master = null, reverb = null, reverbSend = null, voices = 0, hrtfVoices = 0, buffers = null, slideVoice = null, volume = 0.8;
  const listener = { x: 0, y: 0, z: 0 };

  function ensure() {
    if (ctx) {
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      return true;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return false;
    ctx = new AudioCtx({ latencyHint: "interactive" });
    master = ctx.createGain();
    master.gain.value = volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.attack.value = 0.002;
    comp.release.value = 0.15;
    master.connect(comp).connect(ctx.destination);
    reverb = ctx.createConvolver();
    reverb.buffer = impulseResponse(ctx, 1.1, 3.2);
    reverbSend = ctx.createGain();
    reverbSend.gain.value = 0.26;
    reverbSend.connect(reverb).connect(master);
    buffers = { white: noiseBuffer(ctx, 1.5), brown: noiseBuffer(ctx, 2, "brown") };
    return true;
  }

  function output(pos, isLocal, seconds) {
    const gain = ctx.createGain();
    if (isLocal || !pos) {
      gain.connect(master);
      gain.connect(reverbSend);
      return gain;
    }
    const distance = Math.hypot(pos.x - listener.x, pos.y - listener.y, pos.z - listener.z);
    if (distance > HEARING_RANGE) return null;
    const isHrtf = distance < HRTF_RANGE && hrtfVoices < MAX_HRTF;
    const panner = ctx.createPanner();
    panner.panningModel = isHrtf ? "HRTF" : "equalpower";
    panner.distanceModel = "inverse";
    panner.refDistance = 2.5;
    panner.maxDistance = 120;
    panner.rolloffFactor = 1.1;
    if (panner.positionX) {
      panner.positionX.value = pos.x; panner.positionY.value = pos.y; panner.positionZ.value = pos.z;
    } else panner.setPosition(pos.x, pos.y, pos.z);
    if (isHrtf) {
      hrtfVoices++;
      setTimeout(() => { hrtfVoices--; }, seconds * 1000 + 50);
    }
    gain.connect(panner).connect(master);
    if (distance < REVERB_RANGE) {
      const wet = ctx.createGain();
      wet.gain.value = 0.6;
      gain.connect(wet).connect(reverbSend);
    }
    return gain;
  }

  function claimVoice(seconds) {
    if (voices >= MAX_VOICES) return false;
    voices++;
    setTimeout(() => { voices--; }, seconds * 1000 + 50);
    return true;
  }

  function noise(out, { t, dur, type = "bandpass", freq = 1000, freqEnd = null, q = 1, gain = 1, attack = 0.001, color = "white", distortion = 0 }) {
    const src = ctx.createBufferSource();
    src.buffer = buffers[color];
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    if (freqEnd) filter.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    filter.Q.value = q;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = src.connect(filter);
    if (distortion) {
      const shaper = ctx.createWaveShaper();
      shaper.curve = distortionCurve(distortion);
      node = node.connect(shaper);
    }
    node.connect(env).connect(out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  function tone(out, { t, dur, type = "sine", freq = 100, freqEnd = null, gain = 1, attack = 0.001 }) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(env).connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  function click(out, t, freq, gain = 0.3, dur = 0.018) {
    noise(out, { t, dur, type: "bandpass", freq, q: 6, gain });
    tone(out, { t, dur: dur * 0.8, type: "square", freq: freq * 0.5, gain: gain * 0.25 });
  }

  const recipes = {
    aa12(out, t, isLocal) {
      const v = 0.9 + Math.random() * 0.15;
      tone(out, { t, dur: 0.16, type: "sine", freq: 105 * v, freqEnd: 38, gain: 1.1 });
      tone(out, { t, dur: 0.09, type: "triangle", freq: 220 * v, freqEnd: 70, gain: 0.45 });
      noise(out, { t, dur: 0.32, type: "lowpass", freq: 7000, freqEnd: 650, q: 0.7, gain: 1.15, distortion: 40 });
      noise(out, { t, dur: 0.05, type: "highpass", freq: 3200, gain: 0.8 });
      noise(out, { t: t + 0.01, dur: 0.5, type: "lowpass", freq: 900, freqEnd: 120, gain: 0.35, color: "brown" });
      if (isLocal) {
        click(out, t + 0.055, 2600, 0.22);
        click(out, t + 0.12, 1900, 0.28, 0.025);
      }
    },
    smg(out, t, isLocal) {
      const v = 0.92 + Math.random() * 0.16;
      tone(out, { t, dur: 0.06, type: "sine", freq: 130 * v, freqEnd: 55, gain: 0.6 });
      noise(out, { t, dur: 0.12, type: "lowpass", freq: 3400 * v, freqEnd: 700, q: 0.8, gain: 0.7, distortion: 10 });
      noise(out, { t, dur: 0.03, type: "bandpass", freq: 4200, q: 1.2, gain: 0.35 });
      noise(out, { t: t + 0.004, dur: 0.18, type: "lowpass", freq: 900, freqEnd: 160, gain: 0.18, color: "brown" });
      click(out, t + 0.012, 1500 * v, isLocal ? 0.24 : 0.1, 0.022);
    },
    ar(out, t, isLocal) {
      const v = 0.94 + Math.random() * 0.12;
      tone(out, { t, dur: 0.1, type: "sine", freq: 150 * v, freqEnd: 48, gain: 0.95 });
      tone(out, { t, dur: 0.05, type: "triangle", freq: 340 * v, freqEnd: 110, gain: 0.3 });
      noise(out, { t, dur: 0.2, type: "bandpass", freq: 2600 * v, freqEnd: 800, q: 0.7, gain: 1, distortion: 32 });
      noise(out, { t, dur: 0.04, type: "highpass", freq: 3600, gain: 0.6 });
      noise(out, { t: t + 0.008, dur: 0.34, type: "lowpass", freq: 1100, freqEnd: 140, gain: 0.3, color: "brown" });
      if (isLocal) click(out, t + 0.06, 2200, 0.14);
    },
    sniper(out, t, isLocal) {
      tone(out, { t, dur: 0.4, type: "sine", freq: 78, freqEnd: 26, gain: 1.35 });
      tone(out, { t, dur: 0.07, type: "triangle", freq: 260, freqEnd: 70, gain: 0.5 });
      noise(out, { t, dur: 0.65, type: "lowpass", freq: 9000, freqEnd: 480, q: 0.6, gain: 1.3, distortion: 55 });
      noise(out, { t, dur: 0.09, type: "highpass", freq: 3600, gain: 1 });
      noise(out, { t: t + 0.02, dur: 1.1, type: "lowpass", freq: 700, freqEnd: 80, gain: 0.55, color: "brown" });
      tone(out, { t: t + 0.02, dur: 0.9, type: "sine", freq: 2300, gain: 0.03, attack: 0.002 });
      if (isLocal) {
        click(out, t + 0.5, 1500, 0.3, 0.03);
        click(out, t + 0.62, 2100, 0.34, 0.025);
      }
    },
    rocket(out, t, isLocal) {
      tone(out, { t, dur: 0.45, type: "sawtooth", freq: 75, freqEnd: 28, gain: 0.5 });
      tone(out, { t, dur: 0.18, type: "sine", freq: 62, freqEnd: 30, gain: 1 });
      noise(out, { t, dur: 0.6, type: "bandpass", freq: 300, freqEnd: 1900, q: 0.8, gain: 0.85, attack: 0.04 });
      noise(out, { t: t + 0.05, dur: 0.9, type: "lowpass", freq: 4200, freqEnd: 700, q: 0.7, gain: 0.35, attack: 0.08 });
      if (isLocal) click(out, t + 0.02, 900, 0.3, 0.04);
    },
    explosion(out, t) {
      tone(out, { t, dur: 1, type: "sine", freq: 62, freqEnd: 18, gain: 1.6 });
      noise(out, { t, dur: 1.2, type: "lowpass", freq: 6500, freqEnd: 180, q: 0.6, gain: 1.4, distortion: 60 });
      noise(out, { t: t + 0.01, dur: 1.8, type: "lowpass", freq: 800, freqEnd: 60, gain: 0.8, color: "brown" });
      noise(out, { t: t + 0.12, dur: 0.5, type: "highpass", freq: 2500, gain: 0.25 });
    },
    pistol(out, t, isLocal) {
      const v = 0.94 + Math.random() * 0.12;
      tone(out, { t, dur: 0.07, type: "sine", freq: 190 * v, freqEnd: 60, gain: 0.7 });
      noise(out, { t, dur: 0.12, type: "bandpass", freq: 2200 * v, freqEnd: 900, q: 0.9, gain: 1, distortion: 18 });
      noise(out, { t, dur: 0.025, type: "highpass", freq: 5000, gain: 0.7 });
      noise(out, { t: t + 0.005, dur: 0.28, type: "lowpass", freq: 1400, freqEnd: 200, gain: 0.2, color: "brown" });
      if (isLocal) click(out, t + 0.045, 3400, 0.16);
    },
    dry(out, t) { click(out, t, 2800, 0.25, 0.015); },
    magOut(out, t, isLocal, weapon) {
      click(out, t, MAG_PITCH[weapon] ?? 2000, 0.3, 0.03);
      noise(out, { t: t + 0.02, dur: 0.08, type: "bandpass", freq: 800, q: 2, gain: 0.15 });
    },
    magIn(out, t, isLocal, weapon) {
      const pitch = MAG_PITCH[weapon] ?? 1800;
      click(out, t, pitch * 0.8, 0.45, 0.035);
      tone(out, { t, dur: 0.06, type: "triangle", freq: pitch / 8, freqEnd: pitch / 16, gain: 0.25 });
    },
    bolt(out, t) {
      click(out, t, 1700, 0.35, 0.03);
      click(out, t + 0.09, 2300, 0.4, 0.025);
    },
    switchWeapon(out, t) {
      noise(out, { t, dur: 0.12, type: "bandpass", freq: 1200, freqEnd: 600, q: 1.5, gain: 0.12 });
      click(out, t + 0.08, 2100, 0.15);
    },
    jump(out, t) { noise(out, { t, dur: 0.12, type: "bandpass", freq: 500, freqEnd: 900, q: 1.2, gain: 0.18 }); },
    walljump(out, t) {
      noise(out, { t, dur: 0.14, type: "bandpass", freq: 700, freqEnd: 1600, q: 1.5, gain: 0.3 });
      tone(out, { t, dur: 0.08, type: "sine", freq: 140, freqEnd: 80, gain: 0.3 });
    },
    land(out, t, isLocal, weapon, intensity = 1) {
      const k = Math.min(1.4, Math.max(0.25, intensity));
      tone(out, { t, dur: 0.1, type: "sine", freq: 90, freqEnd: 45, gain: 0.45 * k });
      noise(out, { t, dur: 0.08, type: "lowpass", freq: 1200, freqEnd: 300, gain: 0.25 * k });
    },
    step(out, t) { noise(out, { t, dur: 0.05, type: "bandpass", freq: 600 + Math.random() * 400, q: 1.4, gain: 0.08 }); },
    dash(out, t) {
      noise(out, { t, dur: 0.32, type: "bandpass", freq: 400, freqEnd: 3200, q: 0.8, gain: 0.5, attack: 0.03 });
      tone(out, { t, dur: 0.25, type: "sawtooth", freq: 120, freqEnd: 420, gain: 0.08, attack: 0.02 });
    },
    pad(out, t) {
      tone(out, { t, dur: 0.45, type: "sine", freq: 160, freqEnd: 720, gain: 0.35, attack: 0.01 });
      noise(out, { t, dur: 0.4, type: "bandpass", freq: 600, freqEnd: 4000, q: 1, gain: 0.25, attack: 0.02 });
    },
    hit(out, t, isLocal, weapon, intensity = 1) {
      tone(out, { t, dur: 0.06, type: "square", freq: intensity > 1 ? 1650 : 1250, gain: 0.12 });
      tone(out, { t, dur: 0.05, type: "sine", freq: intensity > 1 ? 2200 : 1700, gain: 0.1 });
    },
    kill(out, t) {
      tone(out, { t, dur: 0.12, type: "triangle", freq: 880, gain: 0.25 });
      tone(out, { t: t + 0.08, dur: 0.22, type: "triangle", freq: 1320, gain: 0.25 });
    },
    hurt(out, t) {
      tone(out, { t, dur: 0.18, type: "sawtooth", freq: 120, freqEnd: 60, gain: 0.18 });
      noise(out, { t, dur: 0.12, type: "lowpass", freq: 800, gain: 0.2 });
    },
    pickup(out, t, isLocal, weapon, intensity) {
      tone(out, { t, dur: 0.1, type: "triangle", freq: weapon ? 520 : 660, gain: 0.22 });
      tone(out, { t: t + 0.07, dur: 0.16, type: "triangle", freq: weapon ? 780 : 990, gain: 0.22 });
      if (intensity > 1) tone(out, { t: t + 0.15, dur: 0.2, type: "triangle", freq: 1240, gain: 0.2 });
    },
    death(out, t) {
      tone(out, { t, dur: 0.5, type: "sawtooth", freq: 300, freqEnd: 40, gain: 0.25 });
      noise(out, { t, dur: 0.4, type: "lowpass", freq: 3000, freqEnd: 200, gain: 0.3, distortion: 20 });
    },
    impact(out, t) { noise(out, { t, dur: 0.04, type: "bandpass", freq: 1800 + Math.random() * 1500, q: 2, gain: 0.12 }); },
    spawn(out, t) {
      tone(out, { t, dur: 0.35, type: "sine", freq: 300, freqEnd: 900, gain: 0.12, attack: 0.05 });
    },
  };

  function play(name, { pos = null, isLocal = false, weapon = null, intensity = 1, volume: v = 1 } = {}) {
    if (!ctx || ctx.state !== "running" || !recipes[name] || voices >= MAX_VOICES) return;
    const out = output(pos, isLocal, 0.8);
    if (!out) return;
    claimVoice(0.8);
    out.gain.value = v;
    recipes[name](out, ctx.currentTime + 0.002, isLocal, weapon, intensity);
  }

  function setSliding(isSliding) {
    if (!ctx || ctx.state !== "running") return;
    if (isSliding && !slideVoice) {
      const src = ctx.createBufferSource();
      src.buffer = buffers.white;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 1100;
      filter.Q.value = 0.8;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.05);
      src.connect(filter).connect(gain).connect(master);
      src.start();
      slideVoice = { src, gain, filter };
    } else if (!isSliding && slideVoice) {
      const v = slideVoice;
      slideVoice = null;
      v.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.04);
      v.src.stop(ctx.currentTime + 0.2);
    }
  }

  function updateListener(camera) {
    if (!ctx) return;
    const l = ctx.listener;
    const p = camera.position;
    listener.x = p.x; listener.y = p.y; listener.z = p.z;
    const f = { x: -Math.sin(camera.rotation.y) * Math.cos(camera.rotation.x), y: Math.sin(camera.rotation.x), z: -Math.cos(camera.rotation.y) * Math.cos(camera.rotation.x) };
    if (l.positionX) {
      const t = ctx.currentTime;
      l.positionX.setValueAtTime(p.x, t); l.positionY.setValueAtTime(p.y, t); l.positionZ.setValueAtTime(p.z, t);
      l.forwardX.setValueAtTime(f.x, t); l.forwardY.setValueAtTime(f.y, t); l.forwardZ.setValueAtTime(f.z, t);
      l.upX.setValueAtTime(0, t); l.upY.setValueAtTime(1, t); l.upZ.setValueAtTime(0, t);
    } else {
      l.setPosition(p.x, p.y, p.z);
      l.setOrientation(f.x, f.y, f.z, 0, 1, 0);
    }
  }

  function setVolume(value) {
    volume = value;
    if (master) master.gain.value = value;
  }

  function suspend() {
    setSliding(false);
    ctx?.suspend().catch(() => {});
  }

  return { ensure, play, setSliding, updateListener, setVolume, suspend };
}
