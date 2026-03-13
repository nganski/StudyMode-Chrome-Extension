// StudyMode Offscreen Audio Engine

let audioCtx = null;
let gainNode = null;
let activeNodes = [];
let currentSound = null;
let isPlaying = false;
let forestTimeouts = [];
let eventTimeouts = [];

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.target !== 'offscreen') return;
  switch (msg.action) {
    case 'play': playSound(msg.sound, msg.volume); break;
    case 'stop': stopSound(); break;
    case 'volume': setVolume(msg.volume); break;
    case 'ping': chrome.runtime.sendMessage({ type: 'AUDIO_STATE', isPlaying, currentSound }); break;
    case 'chime': playChime(); break;
  }
});

function getCtx() {
  if (!audioCtx || audioCtx.state === 'closed') audioCtx = new AudioContext();
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
    case 'white':   createWhiteNoise(ctx, gainNode); break;
    case 'brown':   createBrownNoise(ctx, gainNode); break;
    case 'rain':    createRain(ctx, gainNode); break;
    case 'ocean':   createOcean(ctx, gainNode); break;
    case 'fire':    createFire(ctx, gainNode); break;
    case 'forest':  createForest(ctx, gainNode); break;
    case 'cafe':    createCafe(ctx, gainNode); break;
    case 'lofi':
      chrome.runtime.sendMessage({ type: 'OPEN_LOFI' });
      isPlaying = false;   // lofi plays in a tab, not via offscreen audio
      currentSound = null; // prevent re-opening tab on every restore
      break;
  }
}

function stopSound() {
  isPlaying = false;
  currentSound = null;
  forestTimeouts.forEach(t => clearTimeout(t));
  eventTimeouts.forEach(t => clearTimeout(t));
  forestTimeouts = [];
  eventTimeouts = [];
  activeNodes.forEach(n => { try { n.stop(); } catch (_) {} try { n.disconnect(); } catch (_) {} });
  activeNodes = [];
  if (gainNode) { try { gainNode.disconnect(); } catch (_) {} gainNode = null; }
}

function setVolume(v) { if (gainNode) gainNode.gain.value = v; }

// Audio Core 

function makeNoiseBuffer(ctx, type) {
  const len = 10 * ctx.sampleRate; 
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  if (type === 'white') {
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  } else { 
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      d[i] = (last + 0.02 * w) / 1.02;
      last = d[i];
      d[i] *= 4.5;
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

// Noise Generators

function createCafe(ctx, dest) {
  // --- LAYER 1: THE "WALL OF TALK" ---
  const formant1 = ctx.createBiquadFilter();
  formant1.type = 'bandpass';
  formant1.frequency.value = 600;
  formant1.Q.value = 4;

  const formant2 = ctx.createBiquadFilter();
  formant2.type = 'bandpass';
  formant2.frequency.value = 1600;
  formant2.Q.value = 4;

  const murmurGain = ctx.createGain();
  // INCREASED: Volume of the background chatter from 0.15 to 0.25
  murmurGain.gain.value = 0.25; 

  const crowdLFO = ctx.createOscillator();
  crowdLFO.frequency.value = 0.1; 
  const crowdLFOArea = ctx.createGain();
  crowdLFOArea.gain.value = 0.05;
  crowdLFO.connect(crowdLFOArea);
  crowdLFOArea.connect(murmurGain.gain);
  crowdLFO.start();

  loopBuffer(ctx, makeNoiseBuffer(ctx, 'white'), formant1);
  formant1.connect(formant2);
  formant2.connect(murmurGain);
  murmurGain.connect(dest);

  // --- LAYER 2: RANDOM "HUMAN" EVENTS ---
  function cafeEvents() {
    if (!isPlaying || currentSound !== 'cafe') return;

    const type = Math.random();
    const now = ctx.currentTime;

    // ADJUSTED LOGIC: 
    // Now Syllables (Talking) occupy 0.0 to 0.7 (70% chance)
    // Cup Clinks occupy 0.7 to 0.9 (20% chance)
    // Espresso Wand occupies 0.9 to 1.0 (Only 10% chance)

    if (type > 0.9) { 
      // 1. Espresso Wand (Now much rarer)
      const hissFilter = ctx.createBiquadFilter();
      hissFilter.type = 'highpass';
      hissFilter.frequency.value = 1000;
      const hGain = ctx.createGain();
      hGain.gain.setValueAtTime(0, now);
      hGain.gain.linearRampToValueAtTime(0.015, now + 0.5); // Slightly quieter
      hGain.gain.linearRampToValueAtTime(0, now + 2);
      
      const hissSource = ctx.createBufferSource();
      hissSource.buffer = makeNoiseBuffer(ctx, 'white');
      hissSource.connect(hissFilter);
      hissFilter.connect(hGain);
      hGain.connect(dest);
      hissSource.start(now); hissSource.stop(now + 2);

    } else if (type > 0.7) {
      // 2. Ceramic Cup Clink
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.frequency.setValueAtTime(2500 + Math.random() * 1000, now);
      g.gain.setValueAtTime(0.01, now);
      g.gain.exponentialRampToValueAtTime(0.00001, now + 0.1);
      osc.connect(g); g.connect(dest);
      osc.start(); osc.stop(now + 0.1);

    } else {
      // 3. Syllable Murmur (Now happens much more often)
      const voiceOsc = ctx.createOscillator();
      const voiceGain = ctx.createGain();
      const panner = ctx.createStereoPanner();
      
      voiceOsc.type = 'triangle'; 
      voiceOsc.frequency.setValueAtTime(150 + Math.random() * 100, now);
      voiceOsc.frequency.exponentialRampToValueAtTime(100 + Math.random() * 100, now + 0.4);
      
      panner.pan.value = (Math.random() * 2) - 1;
      
      // INCREASED: Volume of individual voice spikes from 0.01 to 0.025
      voiceGain.gain.setValueAtTime(0, now);
      voiceGain.gain.linearRampToValueAtTime(0.025, now + 0.1); 
      voiceGain.gain.linearRampToValueAtTime(0, now + 0.4);
      
      voiceOsc.connect(voiceGain);
      voiceGain.connect(panner);
      panner.connect(dest);
      voiceOsc.start(); voiceOsc.stop(now + 0.4);
    }

    // Fast scheduling to keep the "higher" density of talking feeling busy
    eventTimeouts.push(setTimeout(cafeEvents, 800 + Math.random() * 2500));
  }

  cafeEvents();
  activeNodes.push(formant1, formant2, murmurGain, crowdLFO, crowdLFOArea);
}

function createForest(ctx, dest) {
  // Layer 1: Crickets/Cicadas (High frequency oscillating noise)
  const insectFilter = ctx.createBiquadFilter();
  insectFilter.type = 'bandpass';
  insectFilter.frequency.value = 4500;
  insectFilter.Q.value = 10;
  const iGain = ctx.createGain(); iGain.gain.value = 0.05;
  
  const insectLFO = ctx.createOscillator();
  insectLFO.frequency.value = 8; // Rapid "cricket" pulsing
  const iLFOGain = ctx.createGain(); iLFOGain.gain.value = 0.04;
  insectLFO.connect(iLFOGain); iLFOGain.connect(iGain.gain);
  insectLFO.start();

  loopBuffer(ctx, makeNoiseBuffer(ctx, 'white'), insectFilter);
  insectFilter.connect(iGain); iGain.connect(dest);

  // Layer 2: Wind and Leaves
  const wind = ctx.createBiquadFilter();
  wind.type = 'lowpass'; wind.frequency.value = 800;
  const wGain = ctx.createGain(); wGain.gain.value = 0.15;
  loopBuffer(ctx, makeNoiseBuffer(ctx, 'white'), wind);
  wind.connect(wGain); wGain.connect(dest);

  function birdLife() {
    if (!isPlaying || currentSound !== 'forest') return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const freq = 1500 + Math.random() * 2000;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.2, ctx.currentTime + 0.1);
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(0.006, ctx.currentTime + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
    osc.connect(g); g.connect(dest);
    osc.start(); osc.stop(ctx.currentTime + 0.4);
    forestTimeouts.push(setTimeout(birdLife, 4000 + Math.random() * 10000));
  }
  birdLife(); birdLife();
  activeNodes.push(insectFilter, iGain, insectLFO, iLFOGain, wind, wGain);
}

function createFire(ctx, dest) {
  // Layer 1: Low rumble (Brown noise)
  const rumble = ctx.createBiquadFilter();
  rumble.type = 'lowpass'; rumble.frequency.value = 250;
  loopBuffer(ctx, makeNoiseBuffer(ctx, 'brown'), rumble);
  rumble.connect(dest);

  // Layer 2: Constant "Sizzle" (Filtered high white noise)
  const sizzle = ctx.createBiquadFilter();
  sizzle.type = 'highpass'; sizzle.frequency.value = 3000;
  const sGain = ctx.createGain(); sGain.gain.value = 0.03;
  loopBuffer(ctx, makeNoiseBuffer(ctx, 'white'), sizzle);
  sizzle.connect(sGain); sGain.connect(dest);

  // Layer 3: Dynamic wood snaps (physics-based)
  const snapLen = 2 * ctx.sampleRate;
  const snapBuf = ctx.createBuffer(1, snapLen, ctx.sampleRate);
  const sd = snapBuf.getChannelData(0);
  for (let i = 0; i < snapLen; i++) {
    if (Math.random() < 0.0006) {
      sd[i] = Math.random() * 2 - 1;
      // Tail of the snap
      for(let j=0; j<80; j++) sd[i+j] += (Math.random() * 0.2) * (1 - j/80);
    }
  }
  const snapFilter = ctx.createBiquadFilter();
  snapFilter.type = 'highpass'; snapFilter.frequency.value = 1200;
  loopBuffer(ctx, snapBuf, snapFilter);
  snapFilter.connect(dest);
  activeNodes.push(rumble, sizzle, sGain, snapFilter);
}
 
function createRain(ctx, dest) {
  const drops = ctx.createBiquadFilter();
  drops.type = 'bandpass'; drops.frequency.value = 2800;
  const dGain = ctx.createGain(); dGain.gain.value = 0.2;
  
  const dropData = ctx.createBuffer(1, 4 * ctx.sampleRate, ctx.sampleRate);
  const dd = dropData.getChannelData(0);
  for (let i = 0; i < dd.length; i++) if (Math.random() < 0.015) dd[i] = Math.random() * 2 - 1;

  const pour = ctx.createBiquadFilter();
  pour.type = 'lowpass'; pour.frequency.value = 400;

  loopBuffer(ctx, dropData, drops);
  drops.connect(dGain); dGain.connect(dest);
  loopBuffer(ctx, makeNoiseBuffer(ctx, 'brown'), pour);
  pour.connect(dest);
  activeNodes.push(drops, dGain, pour);
}

function createOcean(ctx, dest) {
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass'; filter.frequency.value = 500;
  const vca = ctx.createGain(); vca.gain.value = 0.4;
  loopBuffer(ctx, makeNoiseBuffer(ctx, 'brown'), filter);
  filter.connect(vca); vca.connect(dest);
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.1;
  const lfoG = ctx.createGain(); lfoG.gain.value = 0.35;
  lfo.connect(lfoG); lfoG.connect(vca.gain);
  lfo.start();
  activeNodes.push(filter, vca, lfo, lfoG);
}

function createWhiteNoise(ctx, dest) {
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400; 
  loopBuffer(ctx, makeNoiseBuffer(ctx, 'white'), f); f.connect(dest);
  activeNodes.push(f);
}

function createBrownNoise(ctx, dest) {
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 150;
  loopBuffer(ctx, makeNoiseBuffer(ctx, 'brown'), f); f.connect(dest);
  activeNodes.push(f);
}

function playChime() {
  const ctx = getCtx();
  const m = ctx.createGain(); m.gain.value = 0.2; m.connect(ctx.destination);
  [523.25, 659.25, 783.99].forEach((freq, i) => {
    const t = ctx.currentTime + i * 0.4;
    const o = ctx.createOscillator(); o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.2, t + 0.05); g.gain.exponentialRampToValueAtTime(0.001, t + 2.0);
    o.connect(g); g.connect(m); o.start(t); o.stop(t + 2.1);
  });
}