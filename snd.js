// 音のエンジン（素材なし・WebAudio）。曲・効果音・環境音（雨と風）・情けない声
// 使い方: 最初のタップで Snd.init()、画面切替で Snd.setTrack('名前')、ループで毎フレーム Snd.tick()、検証は Snd.played と Snd.level()
// ---------- 音（素材なし。WebAudio で全部鳴らす）
const Snd = {
  ctx: null, muted: false, next: 0, step: 0, track: null, want: null, switchAt: 0, played: {}, lastBrush: 0,
  TEMPO: { title: 84, play: 150, win: 132, sad: 72 },
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return
    try {
      this.ctx = new AC()
      this.master = this.ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.7
      this.an = this.ctx.createAnalyser(); this.an.fftSize = 2048; this.master.connect(this.an); this.an.connect(this.ctx.destination)
      this.bgm = this.ctx.createGain(); this.bgm.gain.value = 0.0001; this.bgm.connect(this.master)
      const len = this.ctx.sampleRate; this.noiseBuf = this.ctx.createBuffer(1, len, len)
      const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
      if (this.want) { const w = this.want; this.want = null; this.setTrack(w) }
    } catch (e) { this.ctx = null }
  },
  setMute(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.7 },
  tone(f, t0, dur, type = 'square', vol = 0.2, dest, f2) {
    if (!this.ctx) return; const c = this.ctx, o = c.createOscillator(), g = c.createGain()
    o.type = type; o.frequency.setValueAtTime(f, t0); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur)
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    o.connect(g); g.connect(dest || this.master); o.start(t0); o.stop(t0 + dur + 0.02)
  },
  noise(t0, dur, vol, freq, type = 'highpass', dest, q) {
    if (!this.ctx) return; const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain()
    s.buffer = this.noiseBuf; f.type = type; f.frequency.value = freq; if (q) f.Q.value = q
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    s.connect(f); f.connect(g); g.connect(dest || this.master); s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.02)
  },
  now() { return this.ctx ? this.ctx.currentTime : 0 },
  level() { if (!this.an) return 0; const d = new Float32Array(this.an.fftSize); this.an.getFloatTimeDomainData(d); let m = 0; for (const v of d) m = Math.max(m, Math.abs(v)); return m },
  mtof: m => 440 * Math.pow(2, (m - 69) / 12),
  mark(n) { this.played[n] = (this.played[n] || 0) + 1 },
  setTrack(name) {
    if (this.want === name) return
    this.want = name; if (!this.ctx) return
    const now = this.ctx.currentTime, g = this.bgm.gain
    g.cancelScheduledValues(now); g.setValueAtTime(Math.max(0.0001, g.value), now); g.linearRampToValueAtTime(0.0001, now + 0.25)
    this.switchAt = now + 0.27
  },
  tick() {
    if (!this.ctx) return; const c = this.ctx
    if (this.switchAt && c.currentTime >= this.switchAt) {
      this.track = this.want; this.step = 0; this.next = c.currentTime + 0.05; this.switchAt = 0
      const g = this.bgm.gain; g.cancelScheduledValues(c.currentTime); g.setValueAtTime(0.0001, c.currentTime); g.linearRampToValueAtTime(0.26, c.currentTime + 0.35)
      if (this.track) this.mark('bgm:' + this.track)
    }
    if (!this.track || this.switchAt) return
    const spb = 60 / this.TEMPO[this.track] / 4
    if (this.next < c.currentTime) this.next = c.currentTime + 0.05
    while (this.next < c.currentTime + 0.25) { this['p_' + this.track](this.step, this.next); this.next += spb; this.step++ }
  },
  kick(t, v = 0.7) { this.tone(150, t, 0.16, 'sine', v, this.bgm, 42) },
  clap(t, v = 0.2) { for (const d of [0, 0.012, 0.024]) this.noise(t + d, 0.09, v, 1500, 'bandpass', this.bgm) },
  hat(t, v = 0.06, open) { this.noise(t, open ? 0.12 : 0.03, v, 8000, 'highpass', this.bgm) },
  bass(n, t, dur = 0.18, vol = 0.45, type = 'triangle') { this.tone(this.mtof(n), t, dur, type, vol, this.bgm) },
  pad(n, t, dur, vol = 0.04) { this.tone(this.mtof(n), t, dur, 'sine', vol, this.bgm); this.tone(this.mtof(n) * 2.005, t, dur * 0.6, 'sine', vol * 0.3, this.bgm) },
  stab(ns, t, dur = 0.14, vol = 0.04) {
    if (!this.ctx) return; const c = this.ctx, f = c.createBiquadFilter(), g = c.createGain()
    f.type = 'lowpass'; f.frequency.setValueAtTime(3200, t); f.frequency.exponentialRampToValueAtTime(600, t + dur)
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    for (const n of ns) for (const d of [-8, 8]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = this.mtof(n); o.detune.value = d; o.connect(f); o.start(t); o.stop(t + dur + 0.02) }
    f.connect(g); g.connect(this.bgm)
  },
  // タイトル: 雨の日のローファイ（Dm9 - G13 - Cmaj7 - A7）
  p_title(i, t) {
    const bar = Math.floor(i / 16) % 4, s = i % 16
    const root = [38, 43, 36, 33][bar], ch = [[62, 65, 69, 72], [59, 64, 65, 69], [60, 64, 67, 71], [61, 64, 67, 69]][bar]
    if (s === 0 || s === 10) this.kick(t, 0.38); if (s === 4 || s === 12) this.clap(t, 0.05); if (s % 2 === 0) this.hat(t, 0.02)
    if (s === 0) for (const n of ch) this.pad(n, t, 1.7, 0.026)
    if (s === 0) this.bass(root, t, 0.6, 0.3, 'sine'); if (s === 8) this.bass(root + 7, t, 0.35, 0.22, 'sine')
    const mel = [[74, -1, 72, 69], [71, -1, 67, -1], [76, 74, 72, -1], [73, -1, 69, -1]][bar]
    if (s % 4 === 2) { const n = mel[(s - 2) / 4]; if (n > 0) this.tone(this.mtof(n), t, 0.4, 'sine', 0.045, this.bgm) }
  },
  // プレイ: あたふたマーチ（Am - F - E - Am、速め）
  p_play(i, t) {
    const bar = Math.floor(i / 16) % 8, s = i % 16, b4 = bar % 4
    const root = [45, 41, 40, 45][b4], ch = [[69, 72, 76], [69, 72, 77], [68, 71, 76], [69, 72, 76]][b4]
    if (s % 4 === 0) this.kick(t, 0.55); if (s === 4 || s === 12) this.clap(t, 0.1); if (s % 2 === 1) this.hat(t, 0.03)
    if (s % 4 === 0) this.bass(root, t, 0.12, 0.42, 'square'); if (s % 4 === 2) this.bass(root + 7, t, 0.1, 0.3, 'square')
    if (s === 2 || s === 10) this.stab(ch, t, 0.08, 0.025)
    const melA = [76, 76, 74, 72, 71, 72, 74, -1, 72, 72, 71, 69, 68, 69, 71, -1]
    const melB = [81, -1, 79, 77, 76, -1, 74, 72, 71, -1, 72, 74, 76, -1, -1, -1]
    if (s % 2 === 0) { const m = bar < 4 ? melA : melB, n = m[((bar % 2) * 8 + s / 2) % 16]; if (n > 0) this.tone(this.mtof(n), t, 0.13, 'triangle', 0.06, this.bgm) }
  },
  // 結果（よい）: ファンファーレ風（C - F - G - C）
  p_win(i, t) {
    const bar = Math.floor(i / 16) % 4, s = i % 16
    const root = [36, 41, 43, 36][bar], ch = [[60, 64, 67], [60, 65, 69], [59, 62, 67], [60, 64, 67]][bar]
    if (s % 4 === 0) this.kick(t, 0.5); if (s === 4 || s === 12) this.clap(t, 0.12); if (s % 2) this.hat(t, 0.03)
    if (s % 4 === 0) this.bass(root, t, 0.2, 0.38); if (s === 0 || s === 6 || s === 12) this.stab(ch.map(n => n + 12), t, 0.15, 0.03)
    const mel = [[72, 76, 79, 84], [81, 77, 81, 84], [83, 79, 74, 79], [84, -1, 79, -1]][bar]
    if (s % 4 === 0) { const n = mel[s / 4]; if (n > 0) this.tone(this.mtof(n), t, 0.22, 'square', 0.035, this.bgm) }
  },
  // 結果（ざんねん）: 物悲しいワルツ（Am - Dm - E - Am）
  p_sad(i, t) {
    const bar = Math.floor(i / 12) % 4, s = i % 12
    const ch = [[57, 60, 64], [57, 62, 65], [56, 59, 64], [57, 60, 64]][bar], root = [33, 38, 40, 33][bar]
    if (s === 0) this.bass(root, t, 0.8, 0.3, 'sine'); if (s === 4 || s === 8) for (const n of ch) this.tone(this.mtof(n), t, 0.4, 'triangle', 0.02, this.bgm)
    const mel = [[76, 74, 72], [74, 72, 69], [71, 69, 68], [69, -1, -1]][bar]
    if (s % 4 === 0) { const n = mel[s / 4]; if (n > 0) this.tone(this.mtof(n), t, 0.5, 'sine', 0.06, this.bgm) }
  },
  // 雨と風の環境音（ループ）。s=風の強さ 0〜1.6
  ambStart() {
    if (!this.ctx || this.rain) return; const c = this.ctx
    const mk = (type, f, q) => { const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true; const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = c.createGain(); g.gain.value = 0.0001; src.connect(fl); fl.connect(g); g.connect(this.master); src.start(); return { src, fl, g } }
    this.rain = mk('highpass', 2500, 0.5); this.wind = mk('bandpass', 400, 1.5)
  },
  setAmb(rain, s) {
    if (!this.rain) return; const t = this.ctx.currentTime
    this.rain.g.gain.setTargetAtTime(0.0001 + rain * 0.09, t, 0.2)
    this.wind.g.gain.setTargetAtTime(0.0001 + Math.min(1.6, s) * 0.16, t, 0.15)
    this.wind.fl.frequency.setTargetAtTime(250 + s * 520, t, 0.2)
  },
  // 情けない声（母音のフォルマントを当てたのこぎり波）。p0→p1 へピッチが動く
  voice(vow, p0, p1, dur, vol = 0.22, t0) {
    if (!this.ctx) return; const c = this.ctx, t = t0 ?? c.currentTime
    const F = { a: [800, 1250], i: [300, 2300], u: [350, 1300], e: [500, 1900], o: [500, 900] }[vow] || [700, 1200]
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(p0, t); o.frequency.exponentialRampToValueAtTime(p1, t + dur)
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 7; lg.gain.value = p0 * 0.04; lfo.connect(lg); lg.connect(o.frequency)
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.03); g.gain.setValueAtTime(vol, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    for (const f of F) { const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 6; o.connect(bp); bp.connect(g) }
    g.connect(this.master); o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05)
  },
  // 効果音
  sfx(name, v = 1) {
    if (!this.ctx) return; const t = this.ctx.currentTime; this.mark(name)
    switch (name) {
      case 'tap': this.tone(880, t, 0.06, 'triangle', 0.12 * v); break
      case 'flip': this.noise(t, 0.35, 0.5, 1800, 'bandpass', null, 0.8); this.noise(t + 0.02, 0.5, 0.25, 600, 'lowpass'); this.tone(220, t, 0.18, 'square', 0.12, null, 900); this.voice('a', 520, 900, 0.55, 0.2, t + 0.08); this.voice('a', 900, 300, 0.5, 0.18, t + 0.6); break
      case 'fix': this.tone(500, t, 0.08, 'triangle', 0.15, null, 700); this.tone(700, t + 0.09, 0.12, 'triangle', 0.15, null, 1000); break
      case 'boing': this.tone(180, t, 0.35, 'sine', 0.4, null, 520); this.tone(520, t + 0.1, 0.25, 'sine', 0.2, null, 260); break
      case 'thud': this.tone(110, t, 0.35, 'sine', 0.7, null, 40); this.noise(t, 0.25, 0.3, 900, 'lowpass'); this.voice('u', 300, 180, 0.3, 0.2, t + 0.02); break
      case 'clonk': this.tone(900, t, 0.25, 'square', 0.1, null, 860); this.tone(1340, t, 0.3, 'triangle', 0.1); this.noise(t, 0.08, 0.2, 3000); break
      case 'bag': this.noise(t, 0.4, 0.25, 4000, 'highpass'); this.voice('u', 260, 200, 0.6, 0.18, t + 0.05); break
      case 'splash': this.noise(t, 0.9, 0.45, 1200, 'lowpass'); this.noise(t + 0.05, 0.6, 0.2, 3500, 'highpass'); this.voice('e', 420, 260, 0.6, 0.16, t + 0.2); break
      case 'honk': this.tone(392, t, 0.22, 'square', 0.1); this.tone(494, t, 0.22, 'square', 0.08); this.tone(392, t + 0.3, 0.3, 'square', 0.1); this.tone(494, t + 0.3, 0.3, 'square', 0.08); break
      case 'car': this.noise(t, 1.2, 0.18, 300, 'lowpass'); this.tone(70, t, 1.2, 'sawtooth', 0.06, null, 110); break
      case 'warn': for (let k = 0; k < 3; k++) { this.tone(880, t + k * 0.22, 0.1, 'square', 0.07); this.tone(660, t + k * 0.22 + 0.11, 0.1, 'square', 0.07) } break
      case 'gust': this.noise(t, 1.6, 0.4, 500, 'bandpass', null, 1.2); this.noise(t + 0.2, 1.4, 0.25, 1200, 'bandpass', null, 2); break
      case 'lift': this.tone(400, t, 1.0, 'sine', 0.15, null, 1600); this.voice('a', 600, 1100, 1.1, 0.2, t + 0.1); break
      case 'fall': this.tone(1500, t, 0.8, 'sine', 0.15, null, 300); break
      case 'blown': this.tone(400, t, 2.4, 'sine', 0.15, null, 2400); this.voice('o', 700, 1200, 1.2, 0.2, t + 0.1); this.voice('o', 1200, 500, 1.6, 0.16, t + 1.3); break
      case 'whoosh': this.noise(t, 0.3, 0.12, 900, 'bandpass', null, 2); break
      case 'thunder': this.noise(t, 2.5, 0.5, 220, 'lowpass'); this.noise(t + 0.05, 0.4, 0.3, 1500, 'lowpass'); break
      case 'chime': [72, 76, 79, 84, 79, 84].forEach((n, k) => this.tone(this.mtof(n), t + k * 0.16, 0.5, 'sine', 0.2)); break
      case 'roll': for (let k = 0; k < 40; k++) this.noise(t + k * 0.04, 0.05, 0.05 + k * 0.004, 1800, 'bandpass'); break
      case 'stamp': this.tone(110, t, 0.4, 'sine', 0.8, null, 40); this.noise(t, 0.3, 0.35, 2500, 'lowpass'); break
      case 'cheer': this.noise(t, 2.2, 0.16, 1200, 'bandpass', null, 0.6); for (let k = 0; k < 4; k++) this.tone(1800, t + k * 0.35, 0.35, 'sine', 0.06, null, 2600); break
      case 'boo': this.tone(311, t, 0.45, 'sawtooth', 0.08, null, 294); this.tone(294, t + 0.5, 0.45, 'sawtooth', 0.08, null, 277); this.tone(277, t + 1, 1.2, 'sawtooth', 0.08, null, 220); break
      case 'yay': this.voice('a', 300, 520, 0.5, 0.2); this.voice('i', 520, 600, 0.4, 0.15, t + 0.45); break
    }
  },
}

