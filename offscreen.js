// StudyMode Offscreen Audio Engine
// This document persists independently of the popup, keeping music alive.

let audioCtx = null;
let gainNode = null;
let activeNodes = [];
let currentSound = null;
let isPlaying = false;
let birdTimeout = null;
let clinkTimeout = null;

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.target !== 'offscreen') return;

  switch (msg.action) {
    case 'play':
      playSound(msg.sound, msg.volume);
      break;
    case 'stop':
      stopSound();
      break;
    case 'volume':
      setVolume(msg.volume);
      break;
    case 'ping':
      chrome.runtime.sendMessage({ type: 'AUDIO_STATE', isPlaying, currentSound });
      break;
    case 'chime':
      playChime();
      break;
  }
});

function getCtx() {
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playSound(sound, volume = 0.5) {
  stopSound();
  currentSound = sound;
  isPlaying = true;

  const ctx = getCtx();
  gainNode = ctx.createGain();
  gainNode.gain.value = volume;
  gainNode.connect(ctx.destination);

  switch (sound) {
    case 'white':  createWhiteNoise(ctx, gainNode); break;
    case 'brown':  createBrownNoise(ctx, gainNode); break;
    case 'rain':   createRain(ctx, gainNode); break;
    case 'ocean':  createOcean(ctx, gainNode); break;
    case 'fire':   createFire(ctx, gainNode); break;
    case 'forest': createForest(ctx, gainNode); break;
    case 'cafe':   createCafe(ctx, gainNode); break;
    case 'lofi':
      // Lo-Fi opens a tab — signal background to open it
      chrome.runtime.sendMessage({ type: 'OPEN_LOFI' });
      isPlaying = true;
      break;
  }
}

function stopSound() {
  isPlaying = false;
  currentSound = null;
  clearTimeout(birdTimeout);
  clearTimeout(clinkTimeout);
  birdTimeout = null;
  clinkTimeout = null;

  activeNodes.forEach(n => {
    try { n.stop(); } catch (_) {}
    try { n.disconnect(); } catch (_) {}
  });
  activeNodes = [];

  if (gainNode) {
    try { gainNode.disconnect(); } catch (_) {}
    gainNode = null;
  }
}

function setVolume(v) {
  if (gainNode) gainNode.gain.value = v;
}

// ── Noise helpers ────────────────────────────────────────

function makeNoiseBuffer(ctx, type) {
  const len = 3 * ctx.sampleRate;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  if (type === 'white') {
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  } else { // brown
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      d[i] = (last + 0.02 * w) / 1.02;
      last = d[i];
      d[i] *= 3.5;
    }
  }
  return buf;
}

function loopBuffer(ctx, buf, dest) {
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.connect(dest);
  src.start();
  activeNodes.push(src);
  return src;
}

// ── Sound generators ─────────────────────────────────────

function createWhiteNoise(ctx, dest) {
  loopBuffer(ctx, makeNoiseBuffer(ctx, 'white'), dest);
}

function createBrownNoise(ctx, dest) {
  loopBuffer(ctx, makeNoiseBuffer(ctx, 'brown'), dest);
}

function createRain(ctx, dest) {
  // High band — rain hiss
  const hiss = ctx.createBiquadFilter();
  hiss.type = 'bandpass';
  hiss.frequency.value = 1400;
  hiss.Q.value = 0.8;
  loopBuffer(ctx, makeNoiseBuffer(ctx, 'white'), hiss);
  hiss.connect(dest);
  activeNodes.push(hiss);

  // Low rumble
  const rumble = ctx.createBiquadFilter();
  rumble.type = 'lowpass';
  rumble.frequency.value = 200;
  const rGain = ctx.createGain();
  rGain.gain.value = 0.3;
  loopBuffer(ctx, makeNoiseBuffer(ctx, 'brown'), rumble);
  rumble.connect(rGain);
  rGain.connect(dest);
  activeNodes.push(rumble, rGain);
}

function createOcean(ctx, dest) {
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 500;
  filter.Q.value = 1.2;

  loopBuffer(ctx, makeNoiseBuffer(ctx, 'white'), filter);
  filter.connect(dest);
  activeNodes.push(filter);

  // LFO wave motion
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.15;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 300;
  lfo.connect(lfoGain);
  lfoGain.connect(filter.frequency);
  lfo.start();
  activeNodes.push(lfo, lfoGain);
}

function createFire(ctx, dest) {
  // Body crackle
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 700;
  loopBuffer(ctx, makeNoiseBuffer(ctx, 'brown'), filter);
  filter.connect(dest);
  activeNodes.push(filter);

  // Sparse pops
  const popLen = 3 * ctx.sampleRate;
  const popBuf = ctx.createBuffer(1, popLen, ctx.sampleRate);
  const pd = popBuf.getChannelData(0);
  for (let i = 0; i < popLen; i++) {
    pd[i] = Math.random() < 0.003 ? (Math.random() * 2 - 1) : 0;
  }
  const popGain = ctx.createGain();
  popGain.gain.value = 0.5;
  loopBuffer(ctx, popBuf, popGain);
  popGain.connect(dest);
  activeNodes.push(popGain);
}

function createForest(ctx, dest) {
  // Wind
  const wFilter = ctx.createBiquadFilter();
  wFilter.type = 'bandpass';
  wFilter.frequency.value = 800;
  wFilter.Q.value = 0.5;
  const wGain = ctx.createGain();
  wGain.gain.value = 0.4;
  loopBuffer(ctx, makeNoiseBuffer(ctx, 'white'), wFilter);
  wFilter.connect(wGain);
  wGain.connect(dest);
  activeNodes.push(wFilter, wGain);

  // Periodic bird chirps
  function chirp() {
    if (!isPlaying || currentSound !== 'forest') return;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    const f = 2000 + Math.random() * 2000;
    osc.frequency.setValueAtTime(f, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(f * 1.5, ctx.currentTime + 0.1);
    osc.frequency.linearRampToValueAtTime(f, ctx.currentTime + 0.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.05, ctx.currentTime);
    g.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
    osc.connect(g);
    g.connect(dest);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
    birdTimeout = setTimeout(chirp, 1200 + Math.random() * 4000);
  }
  birdTimeout = setTimeout(chirp, 600);
}

function createCafe(ctx, dest) {
  // Chatter
  const cFilter = ctx.createBiquadFilter();
  cFilter.type = 'bandpass';
  cFilter.frequency.value = 1000;
  cFilter.Q.value = 0.3;
  const cGain = ctx.createGain();
  cGain.gain.value = 0.15;
  loopBuffer(ctx, makeNoiseBuffer(ctx, 'white'), cFilter);
  cFilter.connect(cGain);
  cGain.connect(dest);
  activeNodes.push(cFilter, cGain);

  // Cup clinks
  function clink() {
    if (!isPlaying || currentSound !== 'cafe') return;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 2500 + Math.random() * 1000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.025, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
    osc.connect(g);
    g.connect(dest);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
    clinkTimeout = setTimeout(clink, 3000 + Math.random() * 8000);
  }
  clinkTimeout = setTimeout(clink, 1000);
}

// ── Timer completion chime ────────────────────────────────
// Three ascending bell tones — plays independently of ambient sound
function playChime() {
  const ctx = getCtx();
  const masterGain = ctx.createGain();
  masterGain.gain.value = 0.55;
  masterGain.connect(ctx.destination);

  // Reverb-style convolver for warmth
  const reverbLen = ctx.sampleRate * 1.5;
  const reverbBuf = ctx.createBuffer(1, reverbLen, ctx.sampleRate);
  const rd = reverbBuf.getChannelData(0);
  for (let i = 0; i < reverbLen; i++) {
    rd[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / reverbLen, 2);
  }
  const convolver = ctx.createConvolver();
  convolver.buffer = reverbBuf;
  const reverbGain = ctx.createGain();
  reverbGain.gain.value = 0.25;
  convolver.connect(reverbGain);
  reverbGain.connect(masterGain);

  // Three chime notes: C5, E5, G5 (major chord arpeggio)
  const notes = [523.25, 659.25, 783.99];
  notes.forEach((freq, i) => {
    const t = ctx.currentTime + i * 0.32;

    // Fundamental
    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.value = freq;

    // Harmonic overtone
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = freq * 2.756; // slight inharmonicity like a real bell

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.6, t + 0.01);   // sharp attack
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.8); // long decay

    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0, t);
    g2.gain.linearRampToValueAtTime(0.15, t + 0.01);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 1.2);

    osc1.connect(g); g.connect(masterGain); g.connect(convolver);
    osc2.connect(g2); g2.connect(masterGain);

    osc1.start(t); osc1.stop(t + 1.9);
    osc2.start(t); osc2.stop(t + 1.3);
  });
}
