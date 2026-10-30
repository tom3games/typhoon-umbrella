// 台風の日の傘 / TYPHOON UMBRELLA
// 3D の嵐の街を自動で歩くサラリーマン。プレイヤーは傘の向きだけを操作する。時間は固定60Hz（performance.now で数える）
import * as THREE from './vendor/three.module.js'
// 古い Safari（iOS 15 以前）には canvas の roundRect が無い
if (!CanvasRenderingContext2D.prototype.roundRect) CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); this.moveTo(x + r, y); this.arcTo(x + w, y, x + w, y + h, r); this.arcTo(x + w, y + h, x, y + h, r); this.arcTo(x, y + h, x, y, r); this.arcTo(x, y, x + w, y, r); this.closePath() }

const D = window.TU_DATA, C = D.COURSE
const $ = s => document.querySelector(s)
const DT = 1 / 60, DEG = Math.PI / 180
const clamp = (v, a, b) => v < a ? a : v > b ? b : v
const lerp = (a, b, k) => a + (b - a) * k
const isTouch = matchMedia('(pointer:coarse)').matches || ('ontouchstart' in window && navigator.maxTouchPoints > 0)
const store = { get(k, d) { try { const v = localStorage.getItem('tu.' + k); return v == null ? d : v } catch (e) { return d } }, set(k, v) { try { localStorage.setItem('tu.' + k, v) } catch (e) {} } }
function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }
const pick = a => a[Math.floor(Math.random() * a.length)]

// ---------- 状態
const S = {
  lang: store.get('lang', (navigator.language || 'ja').toLowerCase().startsWith('ja') ? 'ja' : 'en'),
  muted: store.get('mute', '0') === '1',
  view: 'title', phase: 'walk', t: 0, seed: 1, rng: Math.random, bot: null, dbgPause: false, simT: 0,
  wind: { th: -50, s: 0.4, tth: -50, ts: 0.4, nextSeg: 5, gust: null, warned: {} },
  input: { dir: 0, drag: null, duckReq: false },
  objs: [], objPlan: [], cars: [], result: null, tutDone: false, tutOk: 0,
}
let P = null
const T = k => D.TXT[S.lang][k] ?? k

// ---------- 描画の土台
const canvas = $('#gl')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isTouch, powerPreference: 'high-performance', preserveDrawingBuffer: false })
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, isTouch ? 1.5 : 2))
const scene = new THREE.Scene()
const FOG = 0x40505c
scene.background = new THREE.Color(FOG)
scene.fog = new THREE.Fog(FOG, 18, 95)
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 220)
const hemi = new THREE.HemisphereLight(0xb4c6d4, 0x30363b, 1.9)
scene.add(hemi)
const sun = new THREE.DirectionalLight(0xe6eeff, 1.3); sun.position.set(-6, 14, 8); scene.add(sun)

function canvasTex(w, h, draw, rep) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
  if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]) }
  t.anisotropy = 4; return t
}
const lam = (color, o = {}) => new THREE.MeshLambertMaterial({ color, ...o })
// 同じ形・同じ材質の静止物を InstancedMesh 1つにまとめる（描画回数を減らす）
const batchQ = []
function batch(geo, mat, setup) { const o = new THREE.Object3D(); setup(o); o.updateMatrix(); batchQ.push([geo, mat, o.matrix.clone()]) }
function flushBatch(parent) {
  const groups = new Map()
  for (const [geo, mat, m] of batchQ) { const k = geo.uuid + mat.uuid; if (!groups.has(k)) groups.set(k, [geo, mat, []]); groups.get(k)[2].push(m) }
  for (const [geo, mat, ms] of groups.values()) { const im = new THREE.InstancedMesh(geo, mat, ms.length); ms.forEach((m, i) => im.setMatrixAt(i, m)); parent.add(im) }
  batchQ.length = 0
}

// ---------- 街
const L = C.length, ROAD_X0 = 2.6, ROAD_X1 = 10.4
const world = new THREE.Group(); scene.add(world)
const wrng = mulberry(7)
;(() => {
  const len = L + 120, zc = -L / 2 + 20
  const side = canvasTex(64, 64, (x, w, h) => { x.fillStyle = '#7d8488'; x.fillRect(0, 0, w, h); x.strokeStyle = '#646b6f'; x.lineWidth = 2; x.strokeRect(1, 1, 31, 31); x.strokeRect(33, 1, 30, 31); x.strokeRect(1, 33, 62, 30) }, [2, len / 2.5])
  const sw = new THREE.Mesh(new THREE.PlaneGeometry(5.6, len), lam(0xffffff, { map: side })); sw.rotation.x = -Math.PI / 2; sw.position.set(-0.2, 0, zc); world.add(sw)
  const road = canvasTex(128, 256, (x, w, h) => {
    x.fillStyle = '#33383c'; x.fillRect(0, 0, w, h)
    for (let i = 0; i < 400; i++) { x.fillStyle = `rgba(${wrng() < .5 ? '255,255,255' : '0,0,0'},.05)`; x.fillRect(wrng() * w, wrng() * h, 2, 2) }
    x.fillStyle = '#e8e8e0'; x.fillRect(4, 0, 4, h); x.fillRect(w - 8, 0, 4, h); x.fillRect(w / 2 - 2, 0, 4, h * 0.55)
  }, [1, len / 12])
  const rd = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_X1 - ROAD_X0, len), lam(0xffffff, { map: road })); rd.rotation.x = -Math.PI / 2; rd.position.set((ROAD_X0 + ROAD_X1) / 2, 0.005, zc); world.add(rd)
  const curb = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.16, len), lam(0x9aa1a4)); curb.position.set(ROAD_X0, 0.08, zc); world.add(curb)
  const sw2 = new THREE.Mesh(new THREE.PlaneGeometry(4, len), lam(0x6f777b)); sw2.rotation.x = -Math.PI / 2; sw2.position.set(ROAD_X1 + 2, 0, zc); world.add(sw2)
  // 水たまり
  const pudM = new THREE.MeshPhongMaterial({ color: 0x8aa0b0, shininess: 90, specular: 0x99aabb, transparent: true, opacity: 0.75 })
  const pudG = new THREE.CircleGeometry(1, 14)
  for (let i = 0; i < 26; i++) {
    const r = 0.5 + wrng() * 1.1, sy = 0.6 + wrng() * 0.5, x = wrng() < 0.5 ? -1.5 + wrng() * 3.5 : ROAD_X0 + 0.6 + wrng() * 7, z = 10 - wrng() * (L + 30)
    batch(pudG, pudM, o => { o.rotation.x = -Math.PI / 2; o.scale.set(r, r * sy, 1); o.position.set(x, 0.012, z) })
  }
  // ビル（InstancedMesh で1回の描画）
  const win = canvasTex(64, 128, (x, w, h) => {
    x.fillStyle = '#6b767d'; x.fillRect(0, 0, w, h)
    for (let r = 0; r < 8; r++) for (let c = 0; c < 4; c++) { x.fillStyle = wrng() < 0.33 ? '#ffd98a' : '#27323a'; x.fillRect(5 + c * 15, 6 + r * 15, 10, 10) }
  })
  const bGeo = new THREE.BoxGeometry(1, 1, 1); bGeo.translate(0, 0.5, 0)
  const list = []
  for (const sideX of [-1, 1]) {
    let z = 30
    while (z > -L - 80) {
      const d = 6 + wrng() * 9, w = 6 + wrng() * 6, h = 7 + wrng() * 18
      const x = sideX < 0 ? -2.95 - w / 2 : ROAD_X1 + 4 + w / 2
      list.push([x, z - d / 2, w, h, d - 0.4]); z -= d
    }
  }
  const bm = new THREE.InstancedMesh(bGeo, lam(0xffffff, { map: win }), list.length)
  const mt = new THREE.Matrix4(), col = new THREE.Color()
  const tints = [0xd8d2c4, 0xc4cbd0, 0xb9b3a8, 0xd0c0b0, 0xa9b4bb, 0xe0dccf]
  list.forEach(([x, z, w, h, d], i) => { mt.makeScale(w, h, d); mt.setPosition(x, 0, z); bm.setMatrixAt(i, mt); bm.setColorAt(i, col.set(tints[Math.floor(wrng() * tints.length)])) })
  world.add(bm)
  // 店のひさしと縦看板（左側）
  const awnCols = [0xd94a3d, 0x2f8f6e, 0x3566b5, 0xe0a030]
  const shopNames = ['たばこ', 'ラーメン', 'クリーニング', '不動産', '定食', 'カラオケ']
  const signTex = shopNames.map((n, i) => canvasTex(64, 220, (x, w, h) => {
    x.fillStyle = ['#c0392b', '#f4f1e8', '#1e5aa8', '#f2c230', '#2f8f6e', '#7a3fb0'][i]; x.fillRect(0, 0, w, h)
    x.fillStyle = i === 1 || i === 3 ? '#1b1b1b' : '#fff'; x.font = '900 40px "Hiragino Sans","Yu Gothic",sans-serif'; x.textAlign = 'center'
    const ch = [...n]; const step = Math.min(46, (h - 20) / ch.length); ch.forEach((c, k) => x.fillText(c, w / 2, 48 + k * step))
  }))
  const awG = new THREE.BoxGeometry(1.4, 0.08, 4), awM = awnCols.map(c => lam(c)), sgG = new THREE.PlaneGeometry(0.7, 2.6), sgM = signTex.map(t => lam(0xffffff, { map: t }))
  for (let z = 4, k = 0; z > -L - 10; z -= 11 + wrng() * 8, k++) {
    const zz = z
    batch(awG, awM[k % 4], o => { o.position.set(-2.4, 2.6, zz); o.rotation.z = -0.35 })
    if (k % 2 === 0) for (const ry of [0, Math.PI]) { const sg = new THREE.Mesh(sgG, sgM[(k / 2) % 6]); sg.position.set(-2.55, 4.5, z - 2.6 + (ry ? -0.01 : 0.01)); sg.rotation.y = ry; world.add(sg) }
  }
})()

// 揺れる物（木・電柱の電線・街灯）
const trees = [], lamps = [], treeIM = {}
const glowTex = canvasTex(64, 64, (x, w) => { const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,230,160,.9)'); g.addColorStop(1, 'rgba(255,230,160,0)'); x.fillStyle = g; x.fillRect(0, 0, w, w) })
;(() => {
  const trunkM = lam(0x5a4430), leafM = [lam(0x3f7a3a, { flatShading: true }), lam(0x4f8c42, { flatShading: true }), lam(0x356b37, { flatShading: true })]
  const trunkG = new THREE.CylinderGeometry(0.12, 0.18, 2.4, 6); trunkG.translate(0, 1.2, 0)
  const leafG = new THREE.IcosahedronGeometry(1, 0)
  for (let z = -6; z > -L - 20; z -= 15 + wrng() * 6) {
    trees.push({ x: ROAD_X0 - 0.5, z, ph: wrng() * 6, leaves: [0, 1, 2].map(k => [(wrng() - .5) * 0.8, 2.7 + k * 0.45, (wrng() - .5) * 0.8, 0.8 + wrng() * 0.4]) })
  }
  treeIM.trunk = new THREE.InstancedMesh(trunkG, trunkM, trees.length)
  treeIM.leaf = leafM.map(m => new THREE.InstancedMesh(leafG, m, trees.length))
  for (const im of [treeIM.trunk, ...treeIM.leaf]) { im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; world.add(im) }
  const poleM = lam(0x8d8d86), headM = new THREE.MeshLambertMaterial({ color: 0xfff1c0, emissive: 0xffd36b, emissiveIntensity: 1 })
  const lampG = { pole: new THREE.CylinderGeometry(0.07, 0.09, 4.6, 6), arm: new THREE.BoxGeometry(0.9, 0.08, 0.08), head: new THREE.BoxGeometry(0.45, 0.14, 0.25) }
  const glowM = new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true })
  for (let z = 2; z > -L - 20; z -= 22) {
    batch(lampG.pole, poleM, o => o.position.set(ROAD_X0 - 0.25, 2.3, z))
    batch(lampG.arm, poleM, o => o.position.set(ROAD_X0 + 0.15, 4.55, z))
    batch(lampG.head, headM, o => o.position.set(ROAD_X0 + 0.55, 4.45, z))
    const gl = new THREE.Sprite(glowM); gl.scale.set(3, 3, 1); gl.position.set(ROAD_X0 + 0.55, 4.45, z); world.add(gl); lamps.push(gl)
  }
  // 電柱と電線（左）
  const upM = lam(0x9b968c), wireM = new THREE.LineBasicMaterial({ color: 0x1d2328 })
  let prev = null; const upG = new THREE.CylinderGeometry(0.13, 0.17, 8.5, 7), barG = new THREE.BoxGeometry(1.6, 0.1, 0.1), wpts = []
  for (let z = 12; z > -L - 40; z -= 28) {
    batch(upG, upM, o => o.position.set(-2.2, 4.25, z)); batch(barG, upM, o => o.position.set(-2.2, 7.9, z))
    if (prev != null) for (const dx of [-0.7, 0, 0.7]) {
      for (let k = 0; k < 8; k++) for (const f of [k / 8, (k + 1) / 8]) wpts.push(new THREE.Vector3(-2.2 + dx, 7.95 - Math.sin(f * Math.PI) * 0.9, lerp(prev, z, f)))
    }
    prev = z
  }
  world.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(wpts), wireM))
  flushBatch(world)
})()

// 駅
const STATION_Z = -L
;(() => {
  const g = new THREE.Group(); g.position.z = STATION_Z; world.add(g)
  const wall = new THREE.Mesh(new THREE.BoxGeometry(14, 9, 6), lam(0xd7d2c6)); wall.position.set(-0.5, 4.5, -9); g.add(wall)
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(9, 3.2), new THREE.MeshLambertMaterial({ color: 0xfff3c9, emissive: 0xffe08a, emissiveIntensity: 0.8 })); glass.position.set(-0.5, 1.7, -5.98); g.add(glass)
  const roof = new THREE.Mesh(new THREE.BoxGeometry(9, 0.3, 7), lam(0x56606a)); roof.position.set(-0.5, 3.6, -2.6); g.add(roof)
  for (const x of [-4.6, 3.6]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3.6, 0.25), lam(0x56606a)); post.position.set(x, 1.8, 0.7); g.add(post) }
  const signT = canvasTex(512, 160, (x, w, h) => {
    x.fillStyle = '#163f8c'; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.fillRect(0, h - 14, w, 6)
    x.textAlign = 'center'; x.font = '900 92px "Hiragino Sans","Yu Gothic",sans-serif'; x.fillText('駅', 150, 105)
    x.font = '900 46px "Helvetica Neue",Arial,sans-serif'; x.fillText('STATION', 350, 92)
  })
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.9), new THREE.MeshLambertMaterial({ map: signT, emissive: 0x334466, emissiveMap: signT, emissiveIntensity: 0.9 })); sign.position.set(-0.5, 5.4, -5.95); g.add(sign)
  for (let k = 0; k < 4; k++) { const gate = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1, 1.4), lam(0xb7bec4)); gate.position.set(-3 + k * 1.6, 0.5, -5.2); g.add(gate) }
  const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); gl.scale.set(12, 6, 1); gl.position.set(-0.5, 2, -5.6); g.add(gl)
})()

// ---------- 雨（線で降らせる。風で斜めに流れる）
const RAIN_N = isTouch ? 900 : 1500
const rainPos = new Float32Array(RAIN_N * 6), drops = new Float32Array(RAIN_N * 3)
const rainGeo = new THREE.BufferGeometry(); rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3))
const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0xc4dced, transparent: true, opacity: 0.5, fog: false })); rain.frustumCulled = false; scene.add(rain)
for (let i = 0; i < RAIN_N; i++) { drops[i * 3] = (Math.random() - .5) * 36; drops[i * 3 + 1] = Math.random() * 18; drops[i * 3 + 2] = (Math.random() - .5) * 44 }
// しぶき（粒）
const SPL_N = 160, splPos = new Float32Array(SPL_N * 3), splVel = new Float32Array(SPL_N * 3), splLife = new Float32Array(SPL_N)
const splGeo = new THREE.BufferGeometry(); splGeo.setAttribute('position', new THREE.BufferAttribute(splPos, 3))
const spl = new THREE.Points(splGeo, new THREE.PointsMaterial({ color: 0xd6ecff, size: 0.14, transparent: true, opacity: 0.85 })); spl.frustumCulled = false; scene.add(spl)
let splIdx = 0
function splash(x, y, z, vx, vy, vz, n, spread = 1) {
  for (let k = 0; k < n; k++) { const i = splIdx++ % SPL_N; splPos[i * 3] = x; splPos[i * 3 + 1] = y; splPos[i * 3 + 2] = z; splVel[i * 3] = vx + (Math.random() - .5) * 3 * spread; splVel[i * 3 + 1] = vy + Math.random() * 2 * spread; splVel[i * 3 + 2] = vz + (Math.random() - .5) * 3 * spread; splLife[i] = 0.6 + Math.random() * 0.5 }
}

// ---------- サラリーマン（傘田さん）
function faceTex(expr) {
  return canvasTex(128, 128, (x) => {
    x.fillStyle = '#f2c9a0'; x.fillRect(0, 0, 128, 128)
    x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = '#1b1b1b'; x.fillStyle = '#1b1b1b'
    const eye = (cx, cy) => {
      x.lineWidth = 5
      if (expr === 'norm') { x.beginPath(); x.arc(cx, cy, 4.5, 0, 7); x.fill() }
      else if (expr === 'worry') { x.beginPath(); x.arc(cx, cy + 2, 4.5, 0, 7); x.fill() }
      else if (expr === 'scream') { x.fillStyle = '#fff'; x.beginPath(); x.arc(cx, cy, 11, 0, 7); x.fill(); x.lineWidth = 3; x.stroke(); x.fillStyle = '#1b1b1b'; x.beginPath(); x.arc(cx, cy, 3, 0, 7); x.fill() }
      else if (expr === 'soaked') { x.beginPath(); x.moveTo(cx - 8, cy - 2); x.lineTo(cx + 8, cy + 3); x.stroke(); x.strokeStyle = '#3d8ee8'; x.lineWidth = 6; x.beginPath(); x.moveTo(cx, cy + 8); x.lineTo(cx, cy + 40); x.stroke(); x.strokeStyle = '#1b1b1b' }
      else if (expr === 'happy') { x.beginPath(); x.moveTo(cx - 8, cy + 3); x.quadraticCurveTo(cx, cy - 9, cx + 8, cy + 3); x.stroke() }
      else if (expr === 'dizzy') { x.lineWidth = 3; x.beginPath(); for (let a = 0; a < 14; a += 0.3) x.lineTo(cx + Math.cos(a) * a * 0.8, cy + Math.sin(a) * a * 0.8); x.stroke() }
    }
    eye(42, 60); eye(86, 60)
    // 眉
    x.lineWidth = 5; x.beginPath()
    if (expr === 'worry' || expr === 'soaked') { x.moveTo(28, 36); x.lineTo(50, 42); x.moveTo(100, 36); x.lineTo(78, 42) }
    else if (expr === 'scream') { x.moveTo(28, 30); x.lineTo(52, 26); x.moveTo(100, 30); x.lineTo(76, 26) }
    else { x.moveTo(30, 38); x.lineTo(52, 38); x.moveTo(76, 38); x.lineTo(98, 38) }
    x.stroke()
    // 眼鏡
    x.lineWidth = 4; x.strokeStyle = '#2a2a2a'; x.beginPath(); x.roundRect(24, 46, 36, 28, 8); x.roundRect(68, 46, 36, 28, 8); x.moveTo(60, 58); x.lineTo(68, 58); x.stroke()
    // 口
    x.strokeStyle = '#1b1b1b'; x.lineWidth = 5; x.beginPath()
    if (expr === 'norm') { x.moveTo(52, 96); x.quadraticCurveTo(64, 102, 76, 96); x.stroke() }
    else if (expr === 'worry') { x.moveTo(48, 98); for (let k = 0; k <= 4; k++) x.lineTo(48 + k * 8, 98 + (k % 2 ? -5 : 0)); x.stroke() }
    else if (expr === 'scream') { x.fillStyle = '#5a1a1a'; x.ellipse(64, 102, 16, 20, 0, 0, 7); x.fill(); x.fillStyle = '#e46a6a'; x.beginPath(); x.ellipse(64, 112, 9, 6, 0, 0, 7); x.fill() }
    else if (expr === 'soaked') { x.moveTo(50, 104); x.quadraticCurveTo(64, 92, 78, 104); x.stroke() }
    else if (expr === 'happy') { x.fillStyle = '#5a1a1a'; x.moveTo(46, 92); x.quadraticCurveTo(64, 120, 82, 92); x.closePath(); x.fill() }
    else if (expr === 'dizzy') { x.moveTo(46, 100); for (let k = 0; k <= 6; k++) x.lineTo(46 + k * 6, 100 + (k % 2 ? -4 : 4)); x.stroke() }
    if (expr === 'worry' || expr === 'scream') { x.fillStyle = '#7cc4ff'; x.beginPath(); x.moveTo(110, 20); x.quadraticCurveTo(120, 36, 110, 40); x.quadraticCurveTo(100, 36, 110, 20); x.fill() }
    if (expr === 'happy') { x.fillStyle = 'rgba(255,110,110,.45)'; x.beginPath(); x.ellipse(24, 86, 9, 6, 0, 0, 7); x.ellipse(104, 86, 9, 6, 0, 0, 7); x.fill() }
  })
}
const FACES = Object.fromEntries(['norm', 'worry', 'scream', 'soaked', 'happy', 'dizzy'].map(e => [e, faceTex(e)]))
// スーツのシミ（濡れるほど増える）
const stainCv = document.createElement('canvas'); stainCv.width = stainCv.height = 64
const stainX = stainCv.getContext('2d'), stainTex = new THREE.CanvasTexture(stainCv); stainTex.colorSpace = THREE.SRGBColorSpace
const BLOBS = Array.from({ length: 30 }, (_, i) => { const r = mulberry(100 + i); return [r() * 64, r() * 64, 3 + r() * 6, r()] })
let stainN = -1
function drawStain(wet) {
  const n = Math.round(clamp(wet, 0, 100) / 100 * BLOBS.length); if (n === stainN) return; stainN = n
  stainX.fillStyle = '#3a4d82'; stainX.fillRect(0, 0, 64, 64)
  for (let i = 0; i < n; i++) { const [bx, by, br, k] = BLOBS[i]; stainX.fillStyle = `rgba(14,22,46,${0.55 + k * 0.3})`; stainX.beginPath(); stainX.ellipse(bx, by, br, br * (0.7 + k * 0.6), k * 3, 0, 7); stainX.fill() }
  stainTex.needsUpdate = true
}
drawStain(0)

const man = new THREE.Group(); scene.add(man)
const M = {}
;(() => {
  const suit = lam(0xffffff, { map: stainTex }), pants = lam(0x2a3048), skin = lam(0xf2c9a0), hairM = lam(0x1e1a18), shoe = lam(0x161616), shirt = lam(0xf4f4f0)
  M.suit = suit; M.pants = pants; M.shirt = shirt
  M.body = new THREE.Group(); man.add(M.body)
  M.legs = [-0.13, 0.13].map(x => {
    const g = new THREE.Group(); g.position.set(x, 0.95, 0)
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.88, 0.22), pants); l.position.y = -0.44; g.add(l)
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.34), shoe); s.position.set(0, -0.9, -0.05); g.add(s)
    M.body.add(g); return g
  })
  M.torso = new THREE.Group(); M.torso.position.y = 0.95; M.body.add(M.torso)
  const tor = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.72, 0.32), suit); tor.position.y = 0.38; M.torso.add(tor)
  const v = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.12, 0.72, 0), new THREE.Vector3(0, 0.36, 0), new THREE.Vector3(0.12, 0.72, 0)]), shirt)
  v.geometry.computeVertexNormals(); v.position.z = -0.163; v.rotation.y = Math.PI; M.torso.add(v)
  M.tie = new THREE.Group(); M.tie.position.set(0, 0.7, -0.17); M.torso.add(M.tie)
  const tie = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.36, 0.02), lam(0xc8322a)); tie.position.y = -0.18; M.tie.add(tie)
  // 腕（右手で傘、左手でカバン）
  M.armR = new THREE.Group(); M.armR.position.set(0.34, 0.66, 0); M.torso.add(M.armR)
  const ar = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.62, 0.16), suit); ar.position.y = 0.28; M.armR.add(ar)
  const hr = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.13), skin); hr.position.y = 0.63; M.armR.add(hr)
  M.armR.rotation.z = -0.25
  M.armL = new THREE.Group(); M.armL.position.set(-0.36, 0.66, 0); M.torso.add(M.armL)
  const al = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.62, 0.16), suit); al.position.y = -0.3; M.armL.add(al)
  const bag = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.32, 0.46), lam(0x5a3a22)); bag.position.y = -0.78; M.armL.add(bag)
  M.head = new THREE.Group(); M.head.position.y = 0.9; M.torso.add(M.head)
  const hd = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.4, 0.36), skin); hd.position.y = 0.2; M.head.add(hd)
  M.face = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.38), new THREE.MeshLambertMaterial({ map: FACES.norm })); M.face.position.set(0, 0.2, -0.181); M.face.rotation.y = Math.PI; M.head.add(M.face)
  M.hair = new THREE.Group(); M.hair.position.y = 0.4; M.head.add(M.hair)
  const h1 = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.4), hairM); h1.position.y = 0.02; M.hair.add(h1)
  const h2 = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.08), hairM); h2.position.set(0, -0.12, 0.17); M.hair.add(h2)
  M.spikes = []
  for (let k = 0; k < 5; k++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 4), hairM); sp.position.set(-0.16 + k * 0.08, 0.1, 0.05 * (k % 2)); sp.visible = false; M.hair.add(sp); M.spikes.push(sp) }
  // かぶったバケツ・顔に張り付く袋
  M.bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.21, 0.36, 10, 1, true), lam(0x2f7fd9, { side: THREE.DoubleSide })); M.bucket.position.y = 0.42; M.bucket.rotation.z = 0.2; M.bucket.visible = false; M.head.add(M.bucket)
  M.faceBag = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 0), lam(0xf2f4f5, { transparent: true, opacity: 0.85, flatShading: true })); M.faceBag.scale.set(1.1, 1, 0.5); M.faceBag.position.set(0, 0.2, -0.2); M.faceBag.visible = false; M.head.add(M.faceBag)
  const sh = new THREE.Mesh(new THREE.CircleGeometry(0.55, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false })); sh.rotation.x = -Math.PI / 2; sh.position.y = 0.02; M.shadow = sh; scene.add(sh)
})()

// 傘（8枚の膜。裏返る・ふくらむ・破れる）
const umb = new THREE.Group(); man.add(umb)
const U = { panels: [], ribs: [], canopy: new THREE.Group() }
;(() => {
  umb.position.set(0.36, 2.15, -0.02)
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.15, 5), lam(0xd8d8d8)); shaft.position.y = 0.5; umb.add(shaft)
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.025, 5, 10, Math.PI), lam(0xffd23f)); handle.position.set(0.08, -0.08, 0); handle.rotation.z = Math.PI; umb.add(handle)
  U.canopy.position.y = 1.05; umb.add(U.canopy)
  const R = 1.12, drop = 0.4, half = Math.PI / 8
  const pm = new THREE.MeshLambertMaterial({ color: 0xeef8ff, transparent: true, opacity: 0.86, side: THREE.DoubleSide, depthWrite: false, emissive: 0x7d8d9b })
  const ribM = lam(0xffffff)
  for (let i = 0; i < 8; i++) {
    const piv = new THREE.Group(); piv.rotation.y = i * Math.PI / 4; U.canopy.add(piv)
    const g = new THREE.BufferGeometry()
    const a = [0, 0, 0], b = [R * Math.cos(-half), -drop, R * Math.sin(-half)], c = [R * Math.cos(half), -drop, R * Math.sin(half)], m = [R * 0.93, -drop * 0.8, 0]
    g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...m, ...a, ...m, ...c], 3)); g.computeVertexNormals()
    const p = new THREE.Mesh(g, pm); piv.add(p); U.panels.push(piv)
    const rib = new THREE.Group(); rib.rotation.y = i * Math.PI / 4 + half; U.canopy.add(rib)
    const rm = new THREE.Mesh(new THREE.BoxGeometry(R, 0.04, 0.04), ribM); rm.position.set(R / 2, -drop / 2, 0); rm.rotation.z = -Math.atan2(drop, R); rib.add(rm); U.ribs.push(rib)
  }
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.14, 5), lam(0xd8d8d8)); tip.position.y = 0.07; U.canopy.add(tip)
})()

// ---------- 飛んでくる物と車
const OBJ_MESH = {
  bag: () => { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 0), lam(0xf4f6f7, { transparent: true, opacity: 0.85, flatShading: true })); m.scale.set(1, 0.7, 0.8); return m },
  bucket: () => { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.4, 10, 1, true), lam(0x2f7fd9, { side: THREE.DoubleSide }))); const b = new THREE.Mesh(new THREE.CircleGeometry(0.22, 10), lam(0x2a6fc0)); b.rotation.x = Math.PI / 2; b.position.y = -0.2; g.add(b); return g },
  sign: (() => {
    const tex = canvasTex(128, 160, (x, w, h) => { x.fillStyle = '#f4f1e8'; x.fillRect(0, 0, w, h); x.strokeStyle = '#c0392b'; x.lineWidth = 8; x.strokeRect(6, 6, w - 12, h - 12); x.fillStyle = '#c0392b'; x.textAlign = 'center'; x.font = '900 40px "Hiragino Sans",sans-serif'; x.fillText('営業中', w / 2, 70); x.font = '900 30px Arial,sans-serif'; x.fillText('OPEN', w / 2, 120) })
    return () => { const g = new THREE.Group(); const m = lam(0xffffff, { map: tex, side: THREE.DoubleSide }); for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.0), m); p.position.z = s * 0.18; p.rotation.x = s * 0.35; g.add(p) } return g }
  })(),
}
function makeCar(color) {
  const g = new THREE.Group()
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 4.2), lam(color)); body.position.y = 0.65; g.add(body)
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 2.2), lam(0x2c3540)); cab.position.set(0, 1.25, 0.2); g.add(cab)
  const wm = lam(0x111111), wg = new THREE.CylinderGeometry(0.33, 0.33, 0.25, 10); wg.rotateZ(Math.PI / 2)
  for (const [x, z] of [[-0.85, 1.3], [0.85, 1.3], [-0.85, -1.3], [0.85, -1.3]]) { const w = new THREE.Mesh(wg, wm); w.position.set(x, 0.33, z); g.add(w) }
  const hl = new THREE.MeshBasicMaterial({ color: 0xfff6d0 }), tl = new THREE.MeshBasicMaterial({ color: 0xff3b2f })
  for (const x of [-0.6, 0.6]) { const a = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.15, 0.05), hl); a.position.set(x, 0.75, -2.11); g.add(a); const b = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.15, 0.05), tl); b.position.set(x, 0.75, 2.11); g.add(b) }
  g.visible = false; scene.add(g); return g
}
const carPool = [0xd23a2f, 0xe6e6e6, 0x2f6fc0, 0x333a40].map(makeCar)

// ---------- 音
window.Snd = Snd
Snd.setMute(S.muted)

// ---------- 画面
const views = ['vTitle', 'vHow', 'vPlay', 'vPause', 'vResult']
function show(v) {
  for (const id of views) $('#' + id).hidden = id !== v
  $('#bPause').hidden = v !== 'vPlay'
}
function applyLang() {
  document.documentElement.lang = S.lang
  document.querySelectorAll('[data-t]').forEach(el => { el.textContent = T(el.dataset.t) })
  $('#bLang').textContent = T('lang')
  $('#ctrlLine').textContent = isTouch ? T('ctrlSp') : T('ctrlPc')
  $('#keys').textContent = T('ctrlPc')
  $('#tutTxt').textContent = isTouch ? T('tutSp') : T('tutPc')
  if (S.result && S.view === 'result') fillResult(true)
}
function applyMute() {
  Snd.setMute(S.muted)
  $('#bMute .on').style.display = S.muted ? 'none' : ''; $('#bMute .off').style.display = S.muted ? '' : 'none'
}
document.body.classList.add(isTouch ? 'spmode' : 'pcmode')
$('#vPlay').classList.add(isTouch ? 'spmode' : 'pcmode')
applyLang(); applyMute()

// ---------- プレイヤー
function newPlayer() {
  return { x: 0, z: 0, y: 0, vy: 0, u: 0, stress: 0, flipT: 0, fixAnim: 0, air: false, airT: 0, duckT: 0, duckCd: 0, stumbleT: 0, bagT: 0, bagShake: 0, bagU: 0, bucket: false,
    wet: 0, dmg: 0, flips: 0, hits: 0, blocks: 0, fly: 0, walkPh: 0, face: 'norm', faceT: 0, landT: 0, spd: 0 }
}
P = newPlayer()

function windTarget(first) {
  const w = S.wind, r = S.rng
  if (first) { w.tth = -55; w.ts = 0.42; w.nextSeg = 5.5; return }
  if (S.t < 10) { w.tth = 50; w.ts = 0.5; w.nextSeg = 10; return }
  let th; do { th = -85 + r() * 170 } while (Math.abs(th - w.tth) < 55)
  w.tth = th; w.ts = 0.45 + r() * 0.3 + Math.min(0.15, S.t / 400); w.nextSeg = S.t + 1.5 + r() * 1.5
}
function planObjects() {
  const r = S.rng, plan = []; let t = 8.5
  while (t < 60) { const k = r(); plan.push({ t, type: k < 0.4 ? 'bag' : k < 0.7 ? 'bucket' : 'sign', done: false }); t += 2.4 + r() * 1.8 - Math.min(0.6, t / 100) }
  return plan
}

function startGame(seed) {
  S.seed = seed ?? (Date.now() % 100000); S.rng = mulberry(S.seed)
  S.t = 0; S.phase = 'walk'; S.result = null; S.tutOk = 0; S.botHist = []
  S.wind = { th: -55, s: 0.42, tth: -55, ts: 0.42, nextSeg: 5.5, gust: null, warned: {}, eff: 0.42 }
  windTarget(true)
  for (const o of S.objs) scene.remove(o.mesh)
  S.objs = []; S.objPlan = planObjects()
  S.cars = D.CARS.map(t => ({ t, done: false, warned: false, car: null }))
  for (const c of carPool) c.visible = false
  P = newPlayer(); S.input.dir = 0; S.input.drag = null
  M.bucket.visible = false; M.faceBag.visible = false; drawStain(0)
  setFace('norm')
  S.view = 'play'; camera.clearViewOffset(); resize(); show('vPlay'); $('#bagOv').hidden = true; $('#msg').hidden = true
  S.tutDone = false; $('#tut').hidden = false; $('#tutSvg').style.display = isTouch ? '' : 'none'
  Snd.setTrack('play'); say('start'); flashMsg(S.lang === 'ja' ? '出勤！' : 'GO!', 1.0)
  camSnap = true
}

// ---------- 演出の部品
let msgT = 0, bubbleT = 0
function flashMsg(txt, sec, red, small) {
  const m = $('#msg'); m.hidden = false; m.className = 'msg' + (red ? ' red' : ''); m.textContent = txt
  if (small) { const s = document.createElement('small'); s.textContent = small; m.appendChild(s) }
  msgT = sec
}
function say(kind, panic) {
  const arr = D.SAY[kind]?.[S.lang]; if (!arr) return
  const b = $('#bubble'); b.textContent = pick(arr); b.hidden = false; b.className = 'bubble' + (panic ? ' panic' : ''); bubbleT = 1.7
}
function ono(txt, color) {
  const p = toScreen(new THREE.Vector3(man.position.x + 0.4, man.position.y + 2.9, man.position.z))
  const d = document.createElement('div'); d.className = 'ono'; d.textContent = txt
  d.style.left = clamp(p.x + (Math.random() - .5) * 60, 90, innerWidth - 90) + 'px'; d.style.top = clamp(p.y, 140, innerHeight - 160) + 'px'; if (color) d.style.color = color
  $('#fx').replaceChildren(d); setTimeout(() => d.remove(), 950)
}
function setFace(f, t = 0) { P.face = f; P.faceT = t; M.face.material.map = FACES[f]; M.face.material.needsUpdate = true }
const tmpV = new THREE.Vector3()
function toScreen(v) { tmpV.copy(v).project(camera); return { x: (tmpV.x + 1) / 2 * innerWidth, y: (1 - tmpV.y) / 2 * innerHeight, behind: tmpV.z > 1 } }
let shake = 0, lightning = 0, nextBolt = 6

// ---------- 1ステップ（1/60秒）
const tE = new THREE.Euler(), tQ = new THREE.Quaternion(), tM = new THREE.Matrix4(), tP = new THREE.Vector3(), tP2 = new THREE.Vector3(), tS = new THREE.Vector3()
function step() {
  S.simT += DT
  const w = S.wind
  if (S.view === 'play' && S.phase === 'walk') stepPlay()
  else if (S.view === 'play' && S.phase === 'goal') stepGoal()
  else if (S.view === 'play' && S.phase === 'blown') stepBlown()
  else if (S.view === 'title' || S.view === 'how') stepTitle()
  else if (S.view === 'result') stepResultIdle()
  // 共通の見た目（雨・木・しぶき・稲妻）
  const s = w.eff ?? w.s, th = w.th * DEG, bx = -Math.sin(th), bz = Math.cos(th)
  const cx = man.position.x, cz = man.position.z - 6
  const vx = bx * s * 13, vz = bz * s * 13, vy = -21
  for (let i = 0; i < RAIN_N; i++) {
    const k = i * 3; let px = drops[k] + vx * DT, py = drops[k + 1] + vy * DT, pz = drops[k + 2] + vz * DT
    if (py < 0 || Math.abs(px - cx) > 18 || Math.abs(pz - cz) > 22) { py = 12 + Math.random() * 8; px = cx + (Math.random() - .5) * 36 - vx * 0.4; pz = cz + (Math.random() - .5) * 44 - vz * 0.4 }
    drops[k] = px; drops[k + 1] = py; drops[k + 2] = pz
    const j = i * 6; rainPos[j] = px; rainPos[j + 1] = py; rainPos[j + 2] = pz; rainPos[j + 3] = px - vx * 0.045; rainPos[j + 4] = py - vy * 0.045; rainPos[j + 5] = pz - vz * 0.045
  }
  rainGeo.attributes.position.needsUpdate = true
  trees.forEach((tr, i) => {
    const vis = S.view !== 'play' || tr.z < man.position.z + 1.2, ph = tr.ph + S.simT * (2 + s * 3)
    tE.set(bz * s * 0.22 + Math.cos(ph) * 0.03 * s, 0, -bx * s * 0.22 + Math.sin(ph) * 0.04 * s); tQ.setFromEuler(tE)
    tM.compose(tP.set(tr.x, 0, tr.z), tQ, tS.setScalar(vis ? 1 : 0)); treeIM.trunk.setMatrixAt(i, tM)
    tr.leaves.forEach(([lx, ly, lz, sc], k) => { tP2.set(lx, ly, lz).applyQuaternion(tQ).add(tP); tM.compose(tP2, tQ, tS.setScalar(vis ? sc : 0)); treeIM.leaf[k].setMatrixAt(i, tM) })
  })
  treeIM.trunk.instanceMatrix.needsUpdate = true; for (const im of treeIM.leaf) im.instanceMatrix.needsUpdate = true
  for (let i = 0; i < SPL_N; i++) { if (splLife[i] <= 0) { splPos[i * 3 + 1] = -10; continue } splLife[i] -= DT; splVel[i * 3 + 1] -= 12 * DT; for (let a = 0; a < 3; a++) splPos[i * 3 + a] += splVel[i * 3 + a] * DT; if (splPos[i * 3 + 1] < 0) splLife[i] = 0 }
  splGeo.attributes.position.needsUpdate = true
  // 稲妻（見た目だけ）
  if (S.simT > nextBolt) { lightning = 0.22; nextBolt = S.simT + 7 + Math.random() * 9; setTimeout(() => Snd.sfx('thunder'), 400) }
  lightning = Math.max(0, lightning - DT)
  hemi.intensity = 1.9 + (lightning > 0.12 || (lightning > 0 && lightning < 0.06) ? 3 : 0)
  shake = Math.max(0, shake - DT * 2)
  stepCamera()
}

function stepTitle() {
  // 待機画面: 傘田さんが嵐の中で立ち尽くす。ときどき傘が裏返る
  const w = S.wind, t = S.simT
  w.th = Math.sin(t * 0.4) * 70; w.s = 0.55 + Math.sin(t * 1.3) * 0.15; w.eff = w.s
  man.position.set(0, 0, 0); man.rotation.y = 0
  const cyc = t % 7
  P.flipT = cyc > 4.6 && cyc < 6.2 ? 1 : 0
  P.u = clamp(Math.sin(t * 0.4 + 0.6) * 0.75, -1, 1); P.stress = P.flipT ? 0 : 0.35 + Math.sin(t * 9) * 0.2
  if (cyc > 4.6 && cyc - DT <= 4.6 && S.view === 'title') { setFace('scream') } else if (cyc > 6.2 && cyc - DT <= 6.2) setFace('worry')
  P.air = false; P.duckT = 0; P.spd = 0
  poseMan(t)
}
function stepResultIdle() { const w = S.wind; w.s = lerp(w.s, 0.35, 0.02); w.eff = w.s; P.spd = 0; poseMan(S.simT) }

function stepPlay() {
  const w = S.wind, I = S.input
  S.t += DT
  // --- 入力（傘の向き）
  if (S.bot) botInput()
  if (I.dir) P.u = clamp(P.u + I.dir * 2.6 * DT, -1, 1)
  if (I.duckReq) { I.duckReq = false; if (P.duckCd <= 0 && P.duckT <= 0 && !P.air) { P.duckT = 0.85; Snd.sfx('whoosh') } }
  if (P.duckT > 0) { P.duckT -= DT; if (P.duckT <= 0) P.duckCd = 0.35 } else P.duckCd -= DT
  // --- 風
  if (S.t >= w.nextSeg) windTarget(false)
  let gustS = 0, gustOn = null
  for (const g of D.GUSTS) {
    const warn = g.kind === 'mega' ? 1.7 : 1.2
    if (S.t >= g.t - warn && !w.warned[g.t]) {
      w.warned[g.t] = 1
      if (g.kind === 'mega') { let th; do { th = -80 + S.rng() * 160 } while (Math.abs(th - w.th) < 50); w.tth = th; w.nextSeg = g.t + g.dur + 0.5 }
      flashMsg(T(g.kind === 'mega' ? 'mega' : 'gust'), warn + 0.3, true); Snd.sfx('warn'); if (g.kind === 'mega') say('gust', true)
    }
    if (S.t >= g.t && S.t < g.t + g.dur) { const e = Math.min(1, (S.t - g.t) / 0.25, (g.t + g.dur - S.t) / 0.25); if (g.s * e > gustS) { gustS = g.s * e; gustOn = g } }
    if (S.t >= g.t && S.t - DT < g.t) { Snd.sfx('gust'); shake = Math.max(shake, g.kind === 'mega' ? 1 : 0.5) }
  }
  const rate = gustOn?.kind === 'mega' ? 140 : 62
  w.th += clamp(w.tth - w.th, -rate * DT, rate * DT)
  w.s = lerp(w.s, w.ts, 0.02)
  w.eff = Math.max(w.s, gustS); w.gust = gustOn
  const s = w.eff, th = w.th * DEG, bx = -Math.sin(th), bz = Math.cos(th)
  const ut = w.th / 90, m = Math.abs(P.u - ut)
  // --- 傘の負荷
  if (P.flipT > 0) {
    P.flipT -= DT; P.wet += 6.5 * DT
    if (P.flipT <= 0) { P.fixAnim = 0.35; Snd.sfx('fix'); say('fix'); setFace(P.wet > 55 ? 'soaked' : 'worry') }
  } else if (P.air) {
    // 空中: 傘が帆になって流される。合わせれば降りる
    P.airT += DT
    const up = s > 1.0 && m > 0.3
    P.vy = lerp(P.vy, up ? 2.4 : -3.2, 0.06)
    const ox = P.x, oz = P.z, oy = P.y
    P.x = clamp(P.x + bx * s * 3.4 * DT, -2.2, 9.5); P.z += bz * s * 3.4 * DT - (up ? 0 : 1.5 * DT); P.y = Math.max(0, P.y + P.vy * DT)
    P.fly += Math.hypot(P.x - ox, P.z - oz, P.y - oy)
    P.wet += 1.2 * DT
    if (P.airT > C.blownTime && up) { blownAway(); return }
    if (P.y <= 0 && P.vy < 0) {
      P.air = false; P.y = 0; P.landT = 0.6; P.dmg += 4; P.wet += 3; Snd.sfx('thud'); say('land'); setFace('dizzy', 1.2); shake = 0.7
      splash(P.x, 0.1, P.z, 0, 2, 0, 24, 1.4); ono(S.lang === 'ja' ? 'ドサッ' : 'THUD')
    }
  } else {
    const r = s * s * 2.2 * Math.pow(Math.max(0, m - 0.1), 1.1)
    P.stress += r * DT - (m < 0.15 ? 0.45 : 0.05) * DT
    P.stress = clamp(P.stress, 0, 1)
    // 超突風の最中は、裏返るより先に体ごと浮く（傘が帆になる）
    if (gustOn?.kind === 'mega' && s > 1.2 && P.stress > 0.45 && P.duckT <= 0) takeOff()
    else if (P.stress >= 1) flip()
    P.wet += (0.08 + s * Math.max(0, m - 0.15) * 2.6) * DT
  }
  // --- 歩く
  let spd = 0
  if (!P.air && P.duckT <= 0) {
    spd = C.walk * (1 - 0.32 * s * Math.max(0, bz)) * (P.flipT > 0 ? 0.45 : 1) * (P.stumbleT > 0 ? 0.25 : 1) * (P.landT > 0 ? 0.2 : 1)
    if (P.bagT > 0) spd *= 0.7
  }
  P.spd = spd; P.z -= spd * DT
  if (!P.air) P.x = lerp(P.x, 0, 0.02)
  P.stumbleT -= DT; P.landT -= DT
  // 顔のビニール袋: 傘を左右に振るとはがれる。何もしなくても約2秒で飛んでいく
  if (P.bagT > 0) { P.bagShake += Math.abs(P.u - P.bagU); P.bagU = P.u; P.bagT -= DT; if (P.bagShake > 1.3) peelBag(true); else if (P.bagT <= 0) peelBag(false) }
  if (P.faceT > 0) { P.faceT -= DT; if (P.faceT <= 0) setFace(P.wet > 55 ? 'soaked' : 'norm') }
  P.wet = clamp(P.wet, 0, 100); P.dmg = clamp(P.dmg, 0, 100)
  // --- 飛来物
  for (const pl of S.objPlan) if (!pl.done && S.t >= pl.t) { pl.done = true; spawnObj(pl.type) }
  stepObjs()
  // --- 車の水しぶき
  for (const c of S.cars) stepCar(c)
  // --- チュートリアル
  if (!S.tutDone) { if (m < 0.22) S.tutOk += DT; if ((S.tutOk > 1.5 && S.t > 4) || S.t > 10) { S.tutDone = true; $('#tut').hidden = true } }
  poseMan(S.simT)
  if (P.z <= STATION_Z + 1.5) reachGoal()
}

let bagTimer = 0
function peelBag(shook) {
  P.bagT = 0; M.faceBag.visible = false
  const ov = $('#bagOv'); ov.classList.add('off'); clearTimeout(bagTimer); bagTimer = setTimeout(() => { ov.hidden = true; ov.classList.remove('off') }, 520)
  Snd.sfx('whoosh'); say('bagOff'); ono(shook ? (S.lang === 'ja' ? 'ベリッ!' : 'RIP!') : (S.lang === 'ja' ? 'ひゅ〜' : 'WHOOSH'), '#fff')
  if (shook) splash(P.x, 2.2, P.z, 2, 3, 0, 14, 1)
}
function flip() {
  P.flipT = C.flipTime; P.stress = 0; P.flips++; P.dmg += 13; P.wet += 2; shake = 0.8
  Snd.sfx('flip'); say('flip', true); setFace('scream'); ono(S.lang === 'ja' ? 'バサァッ!!' : 'FWUMP!!', '#ffd23f')
  splash(man.position.x + 0.4, 3, man.position.z, 0, 1, 0, 20, 1.2)
}
function takeOff() {
  P.air = true; P.airT = 0; P.vy = 2.4; P.y = 0.05; Snd.sfx('lift'); say('lift', true); setFace('scream'); flashMsg(T('flyHint'), 2.2, true)
  ono(S.lang === 'ja' ? 'ふわっ' : 'WHOOSH', '#7ad3ff')
}
function blownAway() {
  S.phase = 'blown'; S.blownT = 0; Snd.sfx('blown'); say('blown', true); setFace('scream'); P.flips += 0
  flashMsg(S.lang === 'ja' ? 'さようなら傘田さん' : 'Farewell, Mr. Kasada', 3, true)
}
function stepBlown() {
  const w = S.wind; S.blownT += DT
  const th = w.th * DEG, bx = -Math.sin(th), bz = Math.cos(th)
  const ox = P.x, oz = P.z, oy = P.y
  P.y += (3 + S.blownT * 2.5) * DT; P.x += bx * 3 * DT; P.z += bz * 3 * DT - 2 * DT
  P.fly += Math.hypot(P.x - ox, P.z - oz, P.y - oy)
  poseMan(S.simT)
  if (S.blownT > 3.4) finish(true)
}
function reachGoal() {
  S.phase = 'goal'; S.goalT = 0; S.finishT = S.t; Snd.sfx('chime'); say('goal'); setFace(P.wet > 55 ? 'soaked' : 'happy')
  for (const o of S.objs) scene.remove(o.mesh); S.objs = []
  $('#bagOv').hidden = true; M.faceBag.visible = false; $('#tut').hidden = true; $('#sideL').hidden = $('#sideR').hidden = $('#sideF').hidden = true
  flashMsg(S.lang === 'ja' ? '到着！' : 'ARRIVED!', 1.4)
}
function stepGoal() {
  S.goalT += DT; const w = S.wind; w.s = lerp(w.s, 0.3, 0.03); w.eff = w.s
  P.flipT = 0; P.air = false; P.y = 0; P.stress = Math.max(0, P.stress - DT)
  const tz = STATION_Z - 2.6
  P.spd = P.z > tz ? 3 : 0; P.z = Math.max(tz, P.z - P.spd * DT); P.x = lerp(P.x, 0, 0.05)
  poseMan(S.simT)
  if (S.goalT > 1.6) finish(false)
}

// ---------- 飛来物
function spawnObj(type, forcePhi) {
  const w = S.wind, r = S.rng
  const T0 = 2.1, futureZ = P.z - C.walk * 0.85 * T0
  // 3割は正面から（風と関係なく前から飛んでくる）
  const front = r() < 0.3, rp = (r() - .5) * 30, phi = forcePhi ?? (front ? rp : w.th + rp), src = phi * DEG
  const sx = Math.sin(src), sz = -Math.cos(src)
  const ty = type === 'sign' ? 1.5 : 2.0
  const target = new THREE.Vector3(P.x + (r() - .5) * 0.6, ty, futureZ)
  const start = new THREE.Vector3(target.x + sx * 20, ty + 2 + r() * 2, target.z + sz * 20)
  const mesh = OBJ_MESH[type](); mesh.position.copy(start); scene.add(mesh)
  const vel = target.clone().sub(start).divideScalar(T0); vel.y += 0.5 * 9.8 * T0 * 0.15
  S.objs.push({ type, mesh, vel, t: 0, T0, phi, resolved: false, spin: new THREE.Vector3(r() * 6, r() * 6, r() * 6), side: Math.abs(phi) < 22 ? 0 : Math.sign(sx) })
}
function stepObjs() {
  const mp = new THREE.Vector3(P.x, P.y, P.z)
  let warnL = false, warnR = false, warnF = false
  for (let i = S.objs.length - 1; i >= 0; i--) {
    const o = S.objs[i]; o.t += DT
    if (!o.resolved) o.vel.y -= 9.8 * 0.15 * DT; else o.vel.y -= 9.8 * DT
    o.mesh.position.addScaledVector(o.vel, DT)
    o.mesh.rotation.x += o.spin.x * DT; o.mesh.rotation.y += o.spin.y * DT; o.mesh.rotation.z += o.spin.z * DT
    if (!o.resolved) {
      if (o.T0 - o.t < 1.3 && o.T0 - o.t > 0) { if (o.side < 0) warnL = true; else if (o.side > 0) warnR = true; else warnF = true }
      const dx = o.mesh.position.x - mp.x, dz = o.mesh.position.z - mp.z
      if (o.t >= o.T0 - 0.02 || (Math.hypot(dx, dz) < 0.9 && o.t > o.T0 * 0.7)) resolveObj(o)
    }
    if (o.t > o.T0 + 3) { scene.remove(o.mesh); S.objs.splice(i, 1) }
  }
  $('#sideL').hidden = !warnL; $('#sideR').hidden = !warnR; $('#sideF').hidden = !warnF
}
function resolveObj(o) {
  o.resolved = true
  const covers = P.flipT <= 0 && !P.air && Math.abs(P.u * 90 - o.phi) <= 45
  if (P.duckT > 0) { say('dodge'); ono(S.lang === 'ja' ? 'ひょいっ' : 'DODGE', '#7ad3ff'); Snd.sfx('whoosh'); o.vel.y += 3; return }
  if (covers) {
    P.blocks++; P.dmg += o.type === 'sign' ? 9 : 3; P.stress = Math.min(0.95, P.stress + (o.type === 'sign' ? 0.35 : 0.12))
    o.vel.multiplyScalar(-0.5); o.vel.y = 5; Snd.sfx('boing'); say('block'); ono(S.lang === 'ja' ? 'ボヨン!' : 'BOING!', '#9df07a'); shake = 0.3
    return
  }
  P.hits++; shake = 0.6
  if (o.type === 'bag') {
    P.bagT = 2.0; P.bagShake = 0; P.bagU = P.u; P.dmg += 2; const ov = $('#bagOv'); clearTimeout(bagTimer); ov.classList.remove('off'); ov.hidden = false; M.faceBag.visible = true; S.tutDone = true; $('#tut').hidden = true
    Snd.sfx('bag'); say('bag', true); setFace('worry', 2); flashMsg(T('bagHit'), 1.6, true, innerHeight < 560 && innerWidth > innerHeight ? T('bagHint') : ''); scene.remove(o.mesh); o.t = 99
  }
  else if (o.type === 'bucket') { P.bucket = true; M.bucket.visible = true; P.wet += 10; Snd.sfx('clonk'); say('bucket', true); setFace('dizzy', 1.4); ono(S.lang === 'ja' ? 'カポッ' : 'CLONK', '#7ad3ff'); splash(P.x, 2.4, P.z, 0, 2, 0, 30, 1.5); scene.remove(o.mesh); o.t = 99 }
  else { P.stumbleT = 0.8; P.dmg += 10; P.wet += 3; Snd.sfx('thud'); say('sign', true); setFace('dizzy', 1.4); ono(S.lang === 'ja' ? 'ゴンッ!!' : 'BONK!!', '#ff4b3e'); o.vel.multiplyScalar(-0.3); o.vel.y = 3 }
}

// ---------- 車
function stepCar(c) {
  if (c.done) return
  const lead = 1.7
  if (!c.warned && S.t >= c.t - lead) {
    c.warned = true; c.car = carPool.find(k => !k.visible) || carPool[0]; c.car.visible = true
    flashMsg(T('car'), lead, true); Snd.sfx('honk')
  }
  if (c.warned) {
    const dt = c.t - S.t, carZ = P.z + dt * 28
    c.car.position.set(ROAD_X0 + 1.6, 0, carZ)
    if (!c.splashed && dt <= 0) {
      c.splashed = true
      const guard = P.flipT <= 0 && !P.air && P.u >= 0.45 && P.duckT <= 0
      splash(ROAD_X0 + 0.6, 0.3, P.z, -6, 3, -2, 70, 1.6)
      if (guard) { P.stress = Math.min(0.9, P.stress + 0.2); P.blocks++; Snd.sfx('boing'); say('block'); ono(S.lang === 'ja' ? 'ガード!' : 'BLOCKED!', '#9df07a') }
      else { P.wet += 14; Snd.sfx('splash'); say('splash', true); setFace('soaked', 1.6); ono(S.lang === 'ja' ? 'ザバァッ' : 'SPLOOSH', '#7ad3ff'); shake = 0.5 }
      Snd.sfx('car')
    }
    if (dt < -2.5) { c.done = true; c.car.visible = false }
  }
}

// ---------- 自動操作（検証用）
function botInput() {
  const w = S.wind, I = S.input
  if (S.bot === 'idle') { I.dir = 0; return }
  if (S.bot === 'good') {
    // 上手い人: 0.3秒前の風を見て合わせる（反応の遅れ）
    S.botHist = S.botHist || []; S.botHist.push(w.th); if (S.botHist.length > 12) S.botHist.shift()
    let target = S.botHist[0] / 90
    for (const c of S.cars) if (c.warned && !c.splashed && c.t - S.t < 0.5) target = 0.6
    const nearObj = S.objs.find(o => !o.resolved && o.T0 - o.t < 0.3)
    if (nearObj && Math.abs(P.u * 90 - nearObj.phi) > 40) I.duckReq = true
    I.dir = Math.abs(target - P.u) < 0.03 ? 0 : Math.sign(target - P.u)
  }
  if (S.bot === 'flail') { I.dir = Math.sin(S.t * 1.7) > 0 ? 1 : -1 }
  // そこそこの人: 0.5秒ごとに風を見て、少しずれた所へ合わせる。しゃがまない
  if (S.bot === 'sloppy') { if (Math.round(S.t * 60) % 30 === 0) S.botT = clamp(w.th / 90 + Math.sin(S.t * 3.7) * 0.3, -1, 1); const tg = S.botT ?? 0; I.dir = Math.abs(tg - P.u) < 0.05 ? 0 : Math.sign(tg - P.u) }
}

// ---------- 見た目のポーズ
const TEAR_ORDER = [0, 4, 2, 6, 1, 5]
function poseMan(t) {
  const w = S.wind, s = w.eff ?? w.s, th = w.th * DEG, bx = -Math.sin(th), bz = Math.cos(th)
  man.position.set(P.x, P.y, P.z)
  M.shadow.position.set(P.x, 0.02, P.z); M.shadow.scale.setScalar(1 / (1 + P.y * 0.4)); M.shadow.material.opacity = 0.3 / (1 + P.y * 0.5)
  const duck = P.duckT > 0 ? 1 : 0
  P.walkPh += P.spd * DT * 2.3
  const sw = Math.sin(P.walkPh) * Math.min(1, P.spd / 3) * 0.6
  if (P.air || S.phase === 'blown') {
    const f = Math.sin(t * 18) * 0.7; M.legs[0].rotation.x = f; M.legs[1].rotation.x = -f; M.armL.rotation.x = Math.sin(t * 14) * 0.9; M.armL.rotation.z = -0.8
  } else {
    M.legs[0].rotation.x = sw - duck * 1.2; M.legs[1].rotation.x = -sw - duck * 1.2; M.armL.rotation.x = -sw * 0.6; M.armL.rotation.z = P.flipT > 0 ? -1.2 + Math.sin(t * 20) * 0.4 : 0
  }
  M.body.position.y = -duck * 0.45 + Math.abs(Math.sin(P.walkPh)) * 0.05 * Math.min(1, P.spd / 3)
  M.torso.rotation.x = duck * 0.5 + (P.stumbleT > 0 ? -0.4 : 0) + (P.flipT > 0 ? Math.sin(t * 25) * 0.08 : 0) - bz * s * 0.12
  M.torso.rotation.z = bx * s * -0.1 + (P.landT > 0 ? Math.sin(t * 30) * 0.15 : 0)
  M.tie.rotation.z = -bx * s * 1.2 + Math.sin(t * 15) * 0.3 * s; M.tie.rotation.x = bz * s * 1.0 + 0.2
  // 髪: 濡れるとぺったり、裏返り・空中で逆立つ
  const spiky = P.flipT > 0 || P.air || S.phase === 'blown'
  for (const sp of M.spikes) sp.visible = spiky
  M.hair.scale.y = spiky ? 1.4 : P.wet > 50 ? 0.55 : 1
  M.bucket.visible = P.bucket
  // スーツの色（濡れるほど暗く）
  drawStain(P.wet)
  M.pants.color.setRGB(lerp(0.165, 0.07, P.wet / 100), lerp(0.19, 0.09, P.wet / 100), lerp(0.28, 0.17, P.wet / 100))
  M.shirt.color.setRGB(lerp(0.96, 0.7, P.wet / 100), lerp(0.96, 0.78, P.wet / 100), lerp(0.94, 0.86, P.wet / 100))
  // 傘
  const alpha = P.u * 90 * DEG, tilt = (0.35 + 0.6 * Math.min(1, s)) * (duck ? 1.3 : 1)
  umb.rotation.order = 'YXZ'; umb.rotation.y = -alpha; umb.rotation.x = -tilt; umb.rotation.z = 0
  umb.position.set(0.36, 2.15 - duck * 0.55, -0.02)
  M.armR.rotation.z = -0.25 - P.u * 0.3; M.armR.rotation.x = -tilt * 0.4
  const st = P.air ? 1 : P.stress, jit = st > 0.5 ? (Math.sin(t * 47) * 0.04 + Math.sin(t * 31) * 0.03) * st : 0
  let sy
  if (P.flipT > 0) { sy = -1.15 + Math.sin(t * 22) * 0.12 } else if (P.fixAnim > 0) { P.fixAnim -= DT; sy = lerp(1, -1, P.fixAnim / 0.35) } else sy = 1 + st * 0.9 + jit * 4
  U.canopy.scale.set(1 + st * 0.18 + jit, sy, 1 + st * 0.18 + jit)
  // 破れた膜はぶら下がってはためく
  const torn = Math.min(6, Math.floor(P.dmg / 15))
  U.panels.forEach((p, i) => { const oi = TEAR_ORDER.indexOf(i), isTorn = oi > -1 && oi < torn; p.rotation.z = isTorn ? -1.1 + Math.sin(t * 20 + i) * 0.4 : (P.flipT > 0 ? Math.sin(t * 25 + i) * 0.15 : 0) })
  U.ribs.forEach((r, i) => { r.rotation.z = P.flipT > 0 ? Math.sin(i * 2.3) * 0.25 : P.dmg > 40 && i % 3 === 0 ? -0.35 : 0 })
  man.rotation.y = (S.view === 'result' && !S.result?.blown) || (S.phase === 'goal' && S.goalT > 0.9 && S.view === 'play') ? Math.PI : 0
}

// ---------- カメラ
let camSnap = true
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3()
function stepCamera() {
  const portrait = innerWidth / innerHeight < 0.8
  const p = man.position
  let pos, look
  if (S.view === 'title' || S.view === 'how') {
    const a = S.simT * 0.12
    pos = new THREE.Vector3(p.x + Math.sin(a) * 1.5 + 0.8, 1.9, p.z - (portrait ? 6.6 : 5.2))
    look = new THREE.Vector3(p.x, portrait ? 2.0 : 1.8, p.z)
  } else if (S.view === 'result' || (S.view === 'play' && S.phase === 'goal' && S.goalT > 0.8)) {
    if (S.result?.blown) { pos = new THREE.Vector3(p.x + 3, p.y - 4, p.z + 8); look = new THREE.Vector3(p.x, p.y, p.z) }
    else { pos = new THREE.Vector3(p.x - 1.3, 1.9, p.z + (portrait ? 5.6 : 4.4)); look = new THREE.Vector3(p.x, 1.7, p.z) }
  } else if (S.phase === 'blown') {
    pos = new THREE.Vector3(p.x + 3, Math.max(4, p.y - 3), p.z + 9); look = new THREE.Vector3(p.x, p.y + 1, p.z)
  } else {
    const low = !portrait && innerHeight < 600
    const back = portrait ? 8.6 : low ? 6.4 : 6.6, up = portrait ? 4.2 : low ? 3.4 : 3.2
    pos = new THREE.Vector3(p.x * 0.6 + 0.8, up + p.y * 0.7, p.z + back)
    look = low ? new THREE.Vector3(p.x * 0.8, 0.3 + p.y * 0.8, p.z - 2.5) : new THREE.Vector3(p.x * 0.8, 1.7 + p.y * 0.8, p.z - 5)
  }
  if (camSnap) { camPos.copy(pos); camLook.copy(look); camSnap = false } else { camPos.lerp(pos, 0.08); camLook.lerp(look, 0.1) }
  const sk = shake * 0.12 + ((S.wind.eff ?? 0) > 1 ? 0.03 : 0)
  camera.position.set(camPos.x + (Math.random() - .5) * sk, camPos.y + (Math.random() - .5) * sk, camPos.z)
  camera.lookAt(camLook)
}

// ---------- HUD
const H = { last: {} }
function setText(id, v) { if (H.last[id] !== v) { H.last[id] = v; $('#' + id).textContent = v } }
function arcPath(a0, a1) { const r = 86, cx = 100, cy = 100, p = a => [cx + Math.sin(a * DEG) * r, cy - Math.cos(a * DEG) * r]; const [x0, y0] = p(a0), [x1, y1] = p(a1); return `M${x0.toFixed(1)} ${y0.toFixed(1)}A${r} ${r} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}` }
function hud() {
  if (S.view !== 'play') return
  const w = S.wind, s = w.eff ?? w.s
  const prog = clamp(-P.z / L, 0, 1), left = Math.max(0, Math.round(-STATION_Z + P.z))
  $('#progBar').style.width = (prog * 100).toFixed(1) + '%'; $('#progMan').style.left = (prog * 100).toFixed(1) + '%'
  setText('progLab', `${left}m`)
  $('#wetBar').style.width = P.wet.toFixed(1) + '%'; setText('wetNum', Math.round(P.wet) + '%')
  $('#dmgBar').style.width = P.dmg.toFixed(1) + '%'; setText('dmgNum', Math.round(P.dmg) + '%')
  const arr = $('#windArr'); arr.setAttribute('transform', `rotate(${(w.th + 180).toFixed(1)} 50 50)`)
  arr.style.color = s > 1.15 ? '#ff4b3e' : s > 0.8 ? '#ffd23f' : '#7ad3ff'
  setText('windLab', `${T('wind')} ${Math.round(s * 24)}m/s`)
  $('#windBox').classList.toggle('hot', s > 1)
  const ut = clamp(w.th / 90, -1, 1) * 90
  $('#gZone').setAttribute('d', arcPath(clamp(ut - 12, -88, 88), clamp(ut + 12, -88, 88)))
  $('#gNeedle').setAttribute('transform', `rotate(${(P.u * 90).toFixed(1)} 100 100)`)
  const stv = P.flipT > 0 ? 1 : P.air ? 1 : P.stress
  const gs = $('#gStress'); gs.setAttribute('width', (80 * stv).toFixed(1)); gs.setAttribute('fill', P.flipT > 0 ? '#ff4b3e' : stv > 0.6 ? '#ff4b3e' : '#ffd23f')
  $('#vig').style.boxShadow = `inset 0 0 ${80 + P.wet}px rgba(95,176,255,${(P.wet / 100 * 0.55).toFixed(2)})`
  $('#flash').style.opacity = lightning > 0.12 ? 0.35 : 0
  $('#bL').classList.toggle('on', S.input.dir < 0); $('#bR').classList.toggle('on', S.input.dir > 0); $('#bDuck').classList.toggle('on', P.duckT > 0)
}
function overlays(dt) {
  if (msgT > 0) { msgT -= dt; if (msgT <= 0) $('#msg').hidden = true }
  const b = $('#bubble')
  if (bubbleT > 0 && (S.view === 'play' || S.view === 'title')) {
    bubbleT -= dt; if (bubbleT <= 0) b.hidden = true
    const p = toScreen(new THREE.Vector3(man.position.x, man.position.y + 2.1, man.position.z))
    const toR = P.u < -0.15, dx = Math.min(70, innerWidth * 0.12)
    b.classList.toggle('toR', toR); b.classList.toggle('toL', !toR)
    const bw = b.offsetWidth || 150
    b.style.left = clamp(p.x + (toR ? dx : -dx), toR ? 8 : bw + 8, toR ? innerWidth - bw - 8 : innerWidth - 8) + 'px'; b.style.top = clamp(p.y, 150, innerHeight - 120) + 'px'
  } else if (!b.hidden) b.hidden = true
}

// ---------- 結果
function computeResult(blown) {
  const r = { wet: Math.round(P.wet), flips: P.flips, fly: Math.round(P.fly), hits: P.hits, blocks: P.blocks, time: blown ? null : Math.round(S.finishT * 10) / 10, blown: !!blown, bucket: P.bucket, dmg: Math.round(P.dmg) }
  r.tier = D.TIERS.find(t => t.test(r)).id
  return r
}
function finish(blown) {
  S.result = computeResult(blown); S.view = 'result'; show('vResult')
  $('#msg').hidden = true; $('#bubble').hidden = true; $('#bagOv').hidden = true
  if (blown) { P.y = 9; P.x = clamp(P.x, -2, 8) }
  else setFace(S.result.wet > 55 ? 'soaked' : S.result.tier === 'legend' || S.result.tier === 'dry' ? 'happy' : 'worry')
  setViewOffset(); camSnap = true
  fillResult(false)
}
const GOOD = ['legend', 'dry', 'half', 'kite']
let revealTimers = []
function fillResult(instant) {
  const R = S.result, tier = D.TIERS.find(t => t.id === R.tier)
  const st = $('#rStamp'); st.textContent = tier[S.lang]; st.style.color = shade(tier.color)
  $('#rLine').textContent = quote(D.RESULT_LINE[R.tier][S.lang])
  const u = k => T(k)
  $('#rStats').innerHTML = [
    [u('flips'), `${R.flips}<small>${u('unitTimes')}</small>`], [u('fly'), `${R.fly}<small>${u('unitM')}</small>`],
    [u('hits'), `${R.hits}<small>${u('unitPcs')}</small>`], [u('time'), R.time == null ? `<small>${u('notArrived')}</small>` : `${R.time}<small>${u('unitSec')}</small>`],
  ].map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('')
  const bd = $('#rBadge'); bd.hidden = !R.bucket; bd.textContent = T('bucketBadge')
  if (instant) { $('#rWet').innerHTML = `${R.wet}<small>%</small>`; return }
  revealTimers.forEach(clearTimeout); revealTimers = []
  st.style.visibility = 'hidden'; st.classList.remove('show')
  document.querySelectorAll('#vResult .reveal').forEach(e => e.classList.remove('on'))
  Snd.setTrack(null); Snd.sfx('roll')
  const t0 = performance.now(), dur = 1500
  const tick = () => { const k = Math.min(1, (performance.now() - t0) / dur); $('#rWet').innerHTML = `${Math.round(R.wet * (1 - Math.pow(1 - k, 3)))}<small>%</small>`; if (k < 1 && S.view === 'result') requestAnimationFrame(tick) }
  tick()
  revealTimers.push(setTimeout(() => {
    st.style.visibility = 'visible'; st.classList.add('show'); Snd.sfx('stamp'); shake = 0.6
    const good = GOOD.includes(R.tier); Snd.setTrack(good ? 'win' : 'sad'); Snd.sfx(good ? 'cheer' : 'boo')
  }, dur + 150))
  revealTimers.push(setTimeout(() => document.querySelectorAll('#vResult .reveal').forEach(e => e.classList.add('on')), dur + 700))
}
const quote = s => S.lang === 'ja' ? '「' + s + '」' : '\u201C' + s + '\u201D'
function shade(hex) { // 紙の上で読める濃さに落とす
  const c = new THREE.Color(hex); c.multiplyScalar(0.52); return '#' + c.getHexString()
}
function setViewOffset() {
  const W = innerWidth, Hh = innerHeight
  if (S.view !== 'result') { camera.clearViewOffset(); return }
  const land = W > Hh && Hh <= 560
  if (land) camera.setViewOffset(W, Hh, W * 0.27, 0, W, Hh)
  else if (W / Hh < 1) camera.setViewOffset(W, Hh, 0, Hh * (S.result?.blown ? 0.2 : 0.3), W, Hh)
  else camera.setViewOffset(W, Hh, W * 0.22, Hh * 0.05, W, Hh)
}

// 結果を1枚の画像に（1080x1350）
async function makeCard() {
  const R = S.result, tier = D.TIERS.find(t => t.id === R.tier)
  const c = document.createElement('canvas'); c.width = 1080; c.height = 1350; const x = c.getContext('2d')
  // 3D の場面を撮る
  const pr = renderer.getPixelRatio(), lt = lightning; lightning = 0; hemi.intensity = 1.9
  renderer.setPixelRatio(1); renderer.setSize(1080, 860, false)
  camera.clearViewOffset(); camera.aspect = 1080 / 860; camera.fov = 50; camera.updateProjectionMatrix()
  const cp = camera.position.clone(), cq = camera.quaternion.clone(), mp = man.position
  if (R.blown) { camera.position.set(mp.x + 2.2, mp.y - 1.5, mp.z + 5); camera.lookAt(mp.x, mp.y + 1.6, mp.z) }
  else { camera.position.set(mp.x - 1.1, 2.0, mp.z + 3.6); camera.lookAt(mp.x, 1.75, mp.z) }
  renderer.render(scene, camera)
  camera.position.copy(cp); camera.quaternion.copy(cq)
  x.drawImage(renderer.domElement, 0, 150, 1080, 860)
  renderer.setPixelRatio(pr); resize(); lightning = lt
  try { await document.fonts.ready } catch (e) {}
  const g = x.createLinearGradient(0, 0, 0, 1350); g.addColorStop(0, 'rgba(20,30,38,1)'); g.addColorStop(0.11, 'rgba(20,30,38,1)'); g.addColorStop(0.2, 'rgba(20,30,38,0)'); g.addColorStop(0.62, 'rgba(20,30,38,0)'); g.addColorStop(0.76, 'rgba(20,30,38,1)'); x.fillStyle = g; x.fillRect(0, 0, 1080, 1350)
  x.fillStyle = '#ff4b3e'; roundRect(x, 50, 46, 340, 56, 8); x.fill(); x.fillStyle = '#fff'; x.font = "900 30px 'M PLUS Rounded 1c',sans-serif"; x.textAlign = 'left'; x.fillText('● ' + T('resultHead'), 72, 86)
  x.textAlign = 'right'; x.font = "54px 'Dela Gothic One',sans-serif"; x.fillStyle = '#ffd23f'; x.fillText(S.lang === 'ja' ? '台風の日の傘' : 'TYPHOON UMBRELLA', 1030, 96)
  // ハンコ
  x.save(); x.translate(540, 860); x.rotate(-0.08)
  x.font = "86px 'Dela Gothic One',sans-serif"; x.textAlign = 'center'
  let fs = 86; while (x.measureText(tier[S.lang]).width > 900 && fs > 40) { fs -= 4; x.font = `${fs}px 'Dela Gothic One',sans-serif` }
  const tw = x.measureText(tier[S.lang]).width + 70
  x.fillStyle = 'rgba(246,243,234,.94)'; roundRect(x, -tw / 2, -78, tw, 128, 20); x.fill()
  x.strokeStyle = shade(tier.color); x.lineWidth = 12; roundRect(x, -tw / 2 + 10, -68, tw - 20, 108, 14); x.stroke()
  x.fillStyle = shade(tier.color); x.fillText(tier[S.lang], 0, 16); x.restore()
  // 数字
  x.textAlign = 'center'; x.fillStyle = '#fff'; x.font = "900 40px 'M PLUS Rounded 1c',sans-serif"; x.fillText(T('wetRate'), 540, 1062)
  x.font = "150px 'Dela Gothic One',sans-serif"; x.fillStyle = '#7ad3ff'; x.fillText(R.wet + '%', 540, 1190)
  x.font = "900 34px 'M PLUS Rounded 1c',sans-serif"; x.fillStyle = '#f6f3ea'
  const line = `${T('flips')} ${R.flips}${T('unitTimes')}   ${T('fly')} ${R.fly}${T('unitM')}   ${R.time == null ? T('notArrived') : T('time') + ' ' + R.time + T('unitSec')}`
  x.fillText(line, 540, 1256)
  x.font = "900 30px 'M PLUS Rounded 1c',sans-serif"; x.fillStyle = '#fff'; x.fillStyle = 'rgba(15,22,28,.75)'; const ql = quote(D.RESULT_LINE[R.tier][S.lang]), qw = Math.min(1000, x.measureText(ql).width + 40); roundRect(x, 540 - qw / 2, 966, qw, 50, 25); x.fill(); x.fillStyle = '#fff'; x.fillText(ql, 540, 1002, 980)
  x.font = "800 26px 'M PLUS Rounded 1c',sans-serif"; x.fillStyle = '#a9b8c2'; x.fillText('tom3games.github.io/typhoon-umbrella', 540, 1318)
  if (R.bucket) { x.save(); x.translate(860, 250); x.rotate(0.12); x.fillStyle = '#16202a'; roundRect(x, -190, -34, 380, 60, 30); x.fill(); x.fillStyle = '#ffd23f'; x.font = "900 28px 'M PLUS Rounded 1c',sans-serif"; x.fillText(T('bucketBadge'), 0, 6); x.restore() }
  return c
}
function roundRect(x, X, Y, w, h, r) { x.beginPath(); x.roundRect(X, Y, w, h, r) }
const PUBLIC_URL = 'https://tom3games.github.io/typhoon-umbrella/'
function xPost() {
  const tier = D.TIERS.find(t => t.id === S.result.tier)
  const text = T('shareText').replace('{t}', tier[S.lang]).replace('{w}', S.result.wet) + ' ' + T('xTag')
  return { text, url: PUBLIC_URL, href: `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(PUBLIC_URL)}` }
}
function openX() { if (!S.result) return; window.open(xPost().href, '_blank', 'noopener') }
async function saveImage() {
  const c = await makeCard()
  const blob = await new Promise(r => c.toBlob(r, 'image/png'))
  const tier = D.TIERS.find(t => t.id === S.result.tier)
  const file = new File([blob], 'typhoon-umbrella.png', { type: 'image/png' })
  const text = T('shareText').replace('{t}', tier[S.lang]).replace('{w}', S.result.wet) + ' https://tom3games.github.io/typhoon-umbrella/'
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], text }); return blob } catch (e) { if (e && e.name === 'AbortError') return blob }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'typhoon-umbrella.png'; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast(T('saved')); return blob
}
function toast(s) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = s; document.body.appendChild(d); setTimeout(() => d.remove(), 1600) }

// ---------- 画面遷移
function goTitle() {
  S.view = 'title'; S.result = null; show('vTitle'); camera.clearViewOffset(); resize(); camSnap = true
  P = newPlayer(); M.bucket.visible = false; M.faceBag.visible = false; drawStain(0); setFace('worry')
  for (const o of S.objs) scene.remove(o.mesh); S.objs = []; for (const c of carPool) c.visible = false
  Snd.setTrack('title')
}
function pauseGame(on) {
  if (on && S.view === 'play') { S.view = 'pause'; show('vPause'); S.input.dir = 0 }
  else if (!on && S.view === 'pause') { S.view = 'play'; show('vPlay'); last = performance.now(); acc = 0 }
}
const firstTap = () => { Snd.init(); Snd.ambStart() }
document.addEventListener('pointerdown', firstTap, { capture: true })
document.addEventListener('keydown', firstTap, { capture: true })
$('#bStart').onclick = () => { Snd.sfx('tap'); startGame() }
$('#bHow').onclick = () => { Snd.sfx('tap'); S.view = 'how'; show('vHow') }
$('#bHowBack').onclick = () => { Snd.sfx('tap'); S.view = 'title'; show('vTitle') }
$('#bHowGo').onclick = () => { Snd.sfx('tap'); startGame() }
$('#bAgain').onclick = () => { Snd.sfx('tap'); revealTimers.forEach(clearTimeout); startGame() }
$('#bTitle').onclick = () => { Snd.sfx('tap'); revealTimers.forEach(clearTimeout); goTitle() }
$('#bSave').onclick = () => { Snd.sfx('tap'); saveImage() }
$('#bX').onclick = () => { Snd.sfx('tap'); openX() }
$('#bPause').onclick = () => pauseGame(true)
$('#bResume').onclick = () => pauseGame(false)
$('#bQuit').onclick = () => { S.view = 'title'; goTitle() }
$('#bMute').onclick = () => { S.muted = !S.muted; store.set('mute', S.muted ? '1' : '0'); applyMute() }
$('#bLang').onclick = () => { S.lang = S.lang === 'ja' ? 'en' : 'ja'; store.set('lang', S.lang); H.last = {}; applyLang() }
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(true) })

// 入力: キー・ボタン・なぞり
const held = { l: false, r: false }
function updDir() { S.input.dir = (held.r ? 1 : 0) - (held.l ? 1 : 0) }
addEventListener('keydown', e => {
  if (e.repeat && !['ArrowLeft', 'ArrowRight', 'a', 'd', 'A', 'D'].includes(e.key)) return
  if (S.view === 'play') {
    if (['ArrowLeft', 'a', 'A'].includes(e.key)) { held.l = true; updDir(); e.preventDefault() }
    else if (['ArrowRight', 'd', 'D'].includes(e.key)) { held.r = true; updDir(); e.preventDefault() }
    else if (['ArrowDown', 's', 'S', ' '].includes(e.key)) { S.input.duckReq = true; e.preventDefault() }
    else if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') pauseGame(true)
  } else if (S.view === 'pause' && (e.key === 'Escape' || e.key === 'p' || e.key === 'P')) pauseGame(false)
  else if (S.view === 'title' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); startGame() }
})
addEventListener('keyup', e => {
  if (['ArrowLeft', 'a', 'A'].includes(e.key)) held.l = false
  if (['ArrowRight', 'd', 'D'].includes(e.key)) held.r = false
  updDir()
})
for (const [id, k] of [['#bL', 'l'], ['#bR', 'r']]) {
  const b = $(id)
  b.addEventListener('pointerdown', e => { e.preventDefault(); held[k] = true; updDir(); try { b.setPointerCapture(e.pointerId) } catch (er) {} })
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, () => { held[k] = false; updDir() })
}
$('#bDuck').addEventListener('pointerdown', e => { e.preventDefault(); S.input.duckReq = true })
canvas.addEventListener('pointerdown', e => { if (S.view !== 'play') return; S.input.drag = { id: e.pointerId, x0: e.clientX, u0: P.u }; try { canvas.setPointerCapture(e.pointerId) } catch (er) {} })
canvas.addEventListener('pointermove', e => { const d = S.input.drag; if (!d || d.id !== e.pointerId || S.view !== 'play') return; P.u = clamp(d.u0 + (e.clientX - d.x0) / (Math.min(innerWidth, 700) * 0.3), -1, 1) })
for (const ev of ['pointerup', 'pointercancel']) canvas.addEventListener(ev, () => { S.input.drag = null })

// ---------- ループ
function resize() {
  const W = innerWidth, Hh = innerHeight
  renderer.setSize(W, Hh, false)
  camera.aspect = W / Hh; camera.fov = W / Hh < 0.8 ? 66 : 56; camera.updateProjectionMatrix()
  setViewOffset()
}
addEventListener('resize', resize); resize()
let acc = 0, last = performance.now(), frames = 0
function frame() {
  requestAnimationFrame(frame)
  const now = performance.now(); let d = (now - last) / 1000; last = now; if (d > 0.25) d = 0.25
  if (!S.dbgPause && S.view !== 'pause') { acc += d; let n = 0; while (acc >= DT && n < 8) { step(); acc -= DT; n++ } if (n === 8) acc = 0 }
  render(d)
}
function render(d = 0) {
  Snd.tick()
  if (Snd.rain) Snd.setAmb(S.view === 'pause' ? 0.3 : 1, S.view === 'pause' ? 0 : (S.wind.eff ?? S.wind.s))
  hud(); overlays(S.dbgPause ? 0 : d)
  renderer.render(scene, camera); frames++
}

// ---------- 検証用の窓口
window.tu = {
  S, get P() { return P }, D, renderer, camera, scene, man, umb,
  start: seed => startGame(seed), title: goTitle, finish, saveImage, xPost, openX, makeCard, fillResult,
  setBot: b => { S.bot = b },
  result: () => S.result,
  // seed と bot を決めて最後まで一気に回す（採点の再現性テスト用）
  simulate(seed, bot, maxSec = 120) {
    startGame(seed); S.bot = bot; let n = 0
    while (S.view === 'play' && n < maxSec * 60) { step(); n++ }
    S.bot = null; return { ...S.result, steps: n }
  },
  force: {
    flip: () => flip(), lift: () => takeOff(), wind: (th, s) => { S.wind.th = S.wind.tth = th; S.wind.s = S.wind.ts = s; S.wind.eff = s; S.wind.nextSeg = S.t + 999 },
    obj: (type, phi) => spawnObj(type, phi), wet: v => { P.wet = v }, dmg: v => { P.dmg = v }, z: v => { P.z = v }, bucket: () => { P.bucket = true },
  },
  dbg: { pause(b = true) { S.dbgPause = b; if (!b) { last = performance.now(); acc = 0 } }, step(n = 1) { for (let i = 0; i < n; i++) step() }, render() { render(0) } },
  fps: () => new Promise(res => { const f0 = frames, t0 = performance.now(); setTimeout(() => res(Math.round((frames - f0) / ((performance.now() - t0) / 1000))), 2000) }),
}
goTitle()
requestAnimationFrame(frame)
window.__tuReady = true
