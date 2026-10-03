// All sounds are synthesized in the browser (original, no copyrighted audio).
let ctx: AudioContext | null = null;
function ac() {
  if (typeof window === "undefined") return null;
  if (!ctx)
    ctx = new (
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    )();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(
  freq: number,
  start: number,
  dur: number,
  type: OscillatorType,
  vol: number,
  dest?: AudioNode,
  slideTo?: number,
) {
  const c = ac();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(vol, start + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(dest ?? c.destination);
  o.start(start);
  o.stop(start + dur + 0.05);
}

function noise(start: number, dur: number, vol: number, hp = 1000, dest?: AudioNode) {
  const c = ac();
  if (!c) return;
  const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = c.createBufferSource();
  s.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = "highpass";
  f.frequency.value = hp;
  const g = c.createGain();
  g.gain.value = vol;
  s.connect(f)
    .connect(g)
    .connect(dest ?? c.destination);
  s.start(start);
}

export function playCorrect() {
  const c = ac();
  if (!c) return;
  const t = c.currentTime;
  [659, 784, 988].forEach((f, i) => tone(f, t + i * 0.1, 0.24, "sine", 0.11));
  tone(1318, t + 0.3, 0.4, "sine", 0.07);
}

export function playWrong() {
  const c = ac();
  if (!c) return;
  const t = c.currentTime;
  tone(392, t, 0.16, "sine", 0.08);
  tone(330, t + 0.16, 0.24, "sine", 0.07);
}

export function playBuzz() {
  const c = ac();
  if (!c) return;
  const t = c.currentTime;
  tone(880, t, 0.12, "square", 0.12);
  tone(1320, t + 0.08, 0.15, "square", 0.1);
}

/** Original "mass hero entry" style loop: thavil-like drums + brass hook. Returns a stop function. */
export function startMassBgm(): () => void {
  const c = ac();
  if (!c) return () => {};
  const master = c.createGain();
  master.gain.value = 0.32;
  master.connect(c.destination);
  const bpm = 124,
    beat = 60 / bpm,
    bar = beat * 4;
  // Original celebratory pentatonic cue; not based on a copyrighted track.
  const hook = [392, 440, 523, 659, 523, 440, 392, 523, 659, 784, 659, 523, 440, 523, 392, 0];
  let next = c.currentTime + 0.1;
  let barNo = 0;

  function scheduleBar(t: number, n: number) {
    for (let i = 0; i < 8; i++) {
      const s = t + i * (beat / 2);
      if (i % 4 === 0 || i === 3 || i === 6) tone(74, s, 0.22, "sine", 0.55, master, 48);
      if (i % 2 === 1) noise(s, 0.08, 0.1, 3200, master);
      tone(i % 2 ? 220 : 165, s, 0.1, "triangle", 0.12, master, 132);
    }
    if (n % 4 !== 0) noise(t + bar - beat / 2, 0.25, 0.3, 4000, master);
    const off = (n % 2) * 8;
    for (let i = 0; i < 8; i++) {
      const f = hook[off + i];
      if (!f) continue;
      const s = t + i * (beat / 2);
      tone(f, s, beat * 0.42, "triangle", 0.09, master);
      tone(f * 2, s, beat * 0.38, "sine", 0.025, master);
    }
  }
  const timer = setInterval(() => {
    while (next < c.currentTime + 0.6) {
      scheduleBar(next, barNo++);
      next += bar;
    }
  }, 150);
  return () => {
    clearInterval(timer);
    master.gain.setTargetAtTime(0, c.currentTime, 0.2);
    setTimeout(() => master.disconnect(), 800);
  };
}
