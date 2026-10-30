// 自分で壊す検証。node verify.mjs（全部 pass で 0 終了）
import { chromium, webkit } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
const ROOT = import.meta.dirname
mkdirSync(ROOT + '/shots', { recursive: true })
const PORT = 5390
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
const URL0 = `http://localhost:${PORT}/`
let pass = 0, fail = 0
const results = []
async function t(name, fn) {
  try { const r = await fn(); if (r === false) throw new Error('false'); pass++; results.push(`ok   ${name}${r && r !== true ? '  ' + JSON.stringify(r) : ''}`) }
  catch (e) { fail++; results.push(`FAIL ${name}  ${e.message.split('\n')[0]}`) }
}
const expect = (c, msg) => { if (!c) throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg)) }
async function open(browser, opts = {}) {
  const ctx = await browser.newContext({ locale: 'ja-JP', viewport: { width: 390, height: 844 }, acceptDownloads: true, ...opts })
  await ctx.addInitScript(() => { try { localStorage.clear() } catch (e) {} })
  const p = await ctx.newPage(); p.errs = []
  p.on('pageerror', e => p.errs.push('pageerror ' + e.message))
  p.on('console', m => { if (m.type() === 'error') p.errs.push('console ' + m.text()) })
  p.on('requestfailed', r => { if (!/fonts\.(googleapis|gstatic)/.test(r.url())) p.errs.push('reqfail ' + r.url()) })
  await p.goto(URL0); await p.waitForFunction(() => window.__tuReady, null, { timeout: 40000 })
  return p
}
const overflow = p => p.evaluate(() => {
  const W = document.documentElement.clientWidth, bad = []
  for (const el of document.querySelectorAll('main:not([hidden]) *')) {
    if (el.closest('[hidden]') || el.closest('.ticker') || (el.checkVisibility && !el.checkVisibility({ visibilityProperty: true }))) continue
    const r = el.getBoundingClientRect(); if (r.width && (r.right > W + 1 || r.left < -1)) bad.push((el.id || el.className || el.tagName) + ':' + Math.round(r.left) + '-' + Math.round(r.right))
  }
  return { sw: document.documentElement.scrollWidth, W, bad: bad.slice(0, 5) }
})
const fit = q => q.evaluate(() => {
  const H = innerHeight, de = document.documentElement, over = []
  if (de.scrollHeight > H + 1) over.push('page:' + de.scrollHeight)
  for (const el of document.querySelectorAll('main:not([hidden]) button, #corner button')) {
    if (!el.offsetParent || el.closest('[hidden]')) continue
    const r = el.getBoundingClientRect(); if (r.bottom > H + 1 || r.top < -1) over.push((el.id || el.className) + ':' + Math.round(r.top) + '-' + Math.round(r.bottom))
  }
  // カードが画面からはみ出していない
  for (const el of document.querySelectorAll('main:not([hidden]) .howCard, main:not([hidden]) .rCard')) { const r = el.getBoundingClientRect(); if (r.bottom > H + 1 || r.top < -1) over.push(el.className + ':' + Math.round(r.top) + '-' + Math.round(r.bottom)) }
  // ボタン同士が重なっていない
  const bs = [...document.querySelectorAll('main:not([hidden]) button, #corner button')].filter(b => b.offsetParent && !b.closest('[hidden]')).map(b => [b.id || b.className, b.getBoundingClientRect()])
  for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) { const a = bs[i][1], b = bs[j][1]; if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) over.push('overlap ' + bs[i][0] + '/' + bs[j][0]) }
  return { H, over: over.slice(0, 6) }
})
// WebGL の画面の輝度の散らばり（ほぼ単色＝描けていない）
const glVariance = p => p.evaluate(() => {
  tu.dbg.render(); const src = document.querySelector('#gl'), c = document.createElement('canvas'); c.width = 200; c.height = 200
  const x = c.getContext('2d'); x.drawImage(src, 0, 0, 200, 200); const d = x.getImageData(0, 0, 200, 200).data
  let s = 0, s2 = 0, n = 0; for (let i = 0; i < d.length; i += 4 * 7) { const v = d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11; s += v; s2 += v * v; n++ }
  return Math.round(s2 / n - (s / n) ** 2)
})
const SIZES = [[360, 640, 'small'], [390, 844, 'phone'], [844, 390, 'land'], [667, 375, 'land-se'], [768, 1024, 'tab'], [1440, 900, 'pc']]

const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const p = await open(browser)
await t('起動時にエラーが出ない', async () => { expect(p.errs.length === 0, p.errs.join('|')) })
await t('ブラウザの拡大が起きない（viewport・ピンチ・Ctrl+ホイール・Ctrl+プラス）', async () => {
  const r = await p.evaluate(() => {
    const vp = document.querySelector('meta[name=viewport]').content
    const g = new Event('gesturestart', { cancelable: true }); document.dispatchEvent(g)
    const w = new WheelEvent('wheel', { ctrlKey: true, deltaY: -10, bubbles: true, cancelable: true }); window.dispatchEvent(w)
    const k = new KeyboardEvent('keydown', { key: '+', ctrlKey: true, bubbles: true, cancelable: true }); window.dispatchEvent(k)
    return { vp, gesture: g.defaultPrevented, wheel: w.defaultPrevented, key: k.defaultPrevented, ta: getComputedStyle(document.documentElement).touchAction, us: getComputedStyle(document.body).userSelect }
  })
  expect(/user-scalable=no/.test(r.vp) && r.gesture && r.wheel && r.key && r.ta === 'manipulation' && r.us === 'none', r); return r
})
await t('OGP 一式があり og:image と og:url が公開先', async () => {
  const r = await p.evaluate(() => Object.fromEntries(['og:title', 'og:description', 'og:image', 'og:url', 'og:type'].map(k => [k, document.querySelector(`meta[property="${k}"]`)?.content]).concat([['tw', document.querySelector('meta[name="twitter:card"]')?.content]])))
  expect(Object.values(r).every(Boolean) && r['og:image'] === 'https://tom3games.github.io/typhoon-umbrella/og.png?v=1' && r['og:url'] === 'https://tom3games.github.io/typhoon-umbrella/' && r.tw === 'summary_large_image', r)
})
await t('タイトルに 3D の街と傘田さんが描けている（輝度の散らばり）', async () => { await p.waitForTimeout(500); const v = await glVariance(p); expect(v > 150, 'variance ' + v); return { variance: v } })
await t('タイトル → 遊び方 → もどる → 遊び方から出勤', async () => {
  await p.click('#bHow'); expect(await p.isVisible('#vHow'), 'how'); const txt = await p.textContent('#ctrlLine'); expect(/← →/.test(txt), txt)
  await p.click('#bHowBack'); expect(await p.isVisible('#vTitle'), 'title')
  await p.click('#bHow'); await p.click('#bHowGo'); expect(await p.isVisible('#vPlay'), 'play')
  return txt
})
await t('キーで傘が傾く（→ で右、← で左）、↓ でしゃがむ', async () => {
  await p.evaluate(() => tu.dbg.pause(true))
  const u0 = await p.evaluate(() => tu.P.u)
  await p.keyboard.down('ArrowRight'); await p.evaluate(() => tu.dbg.step(20)); await p.keyboard.up('ArrowRight')
  const u1 = await p.evaluate(() => tu.P.u)
  await p.keyboard.down('a'); await p.evaluate(() => tu.dbg.step(40)); await p.keyboard.up('a')
  const u2 = await p.evaluate(() => tu.P.u)
  await p.keyboard.press('ArrowDown'); const duck = await p.evaluate(() => { tu.dbg.step(2); return tu.P.duckT })
  expect(u1 > u0 + 0.5 && u2 < u1 - 1, { u0, u1, u2 }); expect(duck > 0, 'duck ' + duck)
  return { u0, u1: +u1.toFixed(2), u2: +u2.toFixed(2), duck: +duck.toFixed(2) }
})
await t('プレイ中の画面も描けている・HUD の風の矢印と傘の針が動く', async () => {
  const r = await p.evaluate(() => { tu.force.wind(70, 0.6); tu.P.u = -0.5; tu.dbg.step(3); tu.dbg.render(); return { arr: document.querySelector('#windArr').getAttribute('transform'), needle: document.querySelector('#gNeedle').getAttribute('transform'), zone: document.querySelector('#gZone').getAttribute('d') } })
  const v = await glVariance(p); expect(v > 150, 'variance ' + v)
  expect(/rotate\(250/.test(r.arr) && /rotate\(-45/.test(r.needle) && r.zone.length > 10, r); return { variance: v, ...r }
})
await t('一時停止: Esc で止まり時間が進まない、再開できる', async () => {
  await p.evaluate(() => tu.dbg.pause(false))
  await p.keyboard.press('Escape'); const a = await p.evaluate(() => tu.S.t); await p.waitForTimeout(400); const b = await p.evaluate(() => tu.S.t)
  expect(await p.isVisible('#vPause') && a === b, { a, b })
  await p.click('#bResume'); await p.waitForTimeout(300); const c = await p.evaluate(() => tu.S.t); expect(c > b && await p.isVisible('#vPlay'), { b, c })
  await p.evaluate(() => tu.dbg.pause(true))
})
// --- 遊びの仕組み
await t('風上に合わせていれば強風でも裏返らない', async () => {
  const r = await p.evaluate(() => { tu.start(5); tu.dbg.pause(true); tu.force.wind(80, 1.0); tu.P.u = 80 / 90; for (let i = 0; i < 180; i++) { tu.P.u = 80 / 90; tu.dbg.step(1) } return { flips: tu.P.flips, stress: tu.P.stress } })
  expect(r.flips === 0 && r.stress < 0.2, r); return r
})
await t('風と逆に向けると傘がふくらみ、限界で裏返る（ずぶ濡れが増える・直る）', async () => {
  const r = await p.evaluate(() => {
    tu.start(5); tu.dbg.pause(true); tu.force.wind(80, 1.0); const out = { maxStress: 0 }
    for (let i = 0; i < 240 && tu.P.flips === 0; i++) { tu.P.u = -1; tu.dbg.step(1); out.maxStress = Math.max(out.maxStress, tu.P.stress) }
    out.flips = tu.P.flips; out.flipT = tu.P.flipT; const w0 = tu.P.wet; tu.P.u = 80 / 90; tu.dbg.step(60); out.wetGain = +(tu.P.wet - w0).toFixed(1)
    tu.dbg.step(120); out.fixed = tu.P.flipT <= 0; out.played = tu.Snd?.played || null; return out
  })
  expect(r.flips === 1 && r.flipT > 2 && r.wetGain > 4 && r.fixed, r); return r
})
await t('飛来物: 傘で受ける・しゃがんでよける・当たる の3通り', async () => {
  const r = await p.evaluate(() => {
    const one = (setup) => { tu.start(9); tu.dbg.pause(true); tu.S.objPlan = []; tu.S.cars = []; tu.force.wind(-60, 0.5); tu.P.u = -60 / 90; tu.force.obj('sign'); setup(); for (let i = 0; i < 160; i++) { setup(); tu.dbg.step(1) } return { hits: tu.P.hits, blocks: tu.P.blocks } }
    return { block: one(() => { tu.P.u = (tu.S.objs[0]?.phi ?? -60) / 90 }), duck: one(() => { tu.P.u = 0.9; if (tu.S.objs[0] && tu.S.objs[0].T0 - tu.S.objs[0].t < 0.5 && tu.P.duckT <= 0) tu.S.input.duckReq = true }), hit: one(() => { tu.P.u = 0.9 }) }
  })
  expect(r.block.blocks === 1 && r.block.hits === 0 && r.duck.hits === 0 && r.duck.blocks === 0 && r.hit.hits === 1, r); return r
})
await t('正面から飛んでくる物にも予告「!」が出る', async () => {
  const r = await p.evaluate(() => { tu.start(9); tu.dbg.pause(true); tu.S.objPlan = []; tu.S.cars = []; tu.force.wind(-60, 0.5); tu.force.obj('bag', 0); tu.dbg.step(60); return { f: !document.querySelector('#sideF').hidden, l: !document.querySelector('#sideL').hidden, r: !document.querySelector('#sideR').hidden } })
  expect(r.f && !r.l && !r.r, r); return r
})
await t('バケツが当たると頭にかぶったまま、ビニール袋は前が見えなくなる', async () => {
  const r = await p.evaluate(() => {
    const one = (type) => { tu.start(9); tu.dbg.pause(true); tu.S.objPlan = []; tu.S.cars = []; tu.force.wind(-60, 0.5); tu.force.obj(type); let bag = false; for (let i = 0; i < 160; i++) { tu.P.u = 0.9; tu.dbg.step(1); if (!document.querySelector('#bagOv').hidden) bag = true } return { bucket: tu.P.bucket, bag } }
    return { bucket: one('bucket'), bag: one('bag') }
  })
  expect(r.bucket.bucket && r.bag.bag && !r.bag.bucket, r); return r
})
await t('顔のビニール袋: 大きな文字と悲鳴が出て、左右に振るとはがれ、放っておいても約2秒で飛ぶ', async () => {
  const r = await p.evaluate(() => {
    const hit = () => { tu.start(9); tu.dbg.pause(true); tu.S.objPlan = []; tu.S.cars = []; tu.force.wind(-60, 0.5); tu.force.obj('bag', -60); for (let i = 0; i < 200 && tu.P.bagT <= 0; i++) { tu.P.u = 0.9; tu.dbg.step(1) } }
    hit(); const msg = document.querySelector('#msg').textContent, bub = document.querySelector('#bubble').textContent, shown = !document.querySelector('#bagOv').hidden, txt = document.querySelector('#bagOv').innerText
    let k = 0; while (tu.P.bagT > 0 && k < 40) { tu.P.u = k % 10 < 5 ? 0.9 : -0.9; tu.dbg.step(1); k++ }
    const shakeSteps = k, peeled = tu.P.bagT <= 0, off = document.querySelector('#bagOv').classList.contains('off')
    hit(); let n = 0; while (tu.P.bagT > 0 && n < 400) { tu.P.u = 0.9; tu.dbg.step(1); n++ }
    return { msg, bub, shown, txt, shakeSteps, peeled, off, autoSec: +(n / 60).toFixed(2) }
  })
  expect(/ビニール袋/.test(r.msg) && /もがもが/.test(r.bub) && r.shown && !/THANK/.test(r.txt) && r.peeled && r.off && r.shakeSteps < 40 && r.autoSec > 1.6 && r.autoSec < 2.4, r); return r
})
await t('車の水しぶき: 右に傾ければ防げる、防がないと濡れる', async () => {
  const r = await p.evaluate(() => {
    const one = (u) => { tu.start(11); tu.dbg.pause(true); tu.S.objPlan = []; tu.S.cars = [{ t: 2, done: false, warned: false }]; tu.force.wind(0, 0.3); for (let i = 0; i < 200; i++) { tu.P.u = u; tu.dbg.step(1) } return +tu.P.wet.toFixed(1) }
    return { guard: one(0.7), noGuard: one(-0.5) }
  })
  expect(r.noGuard - r.guard > 10, r); return r
})
await t('超突風で傘を外すと体ごと浮き、合わせれば着地する', async () => {
  const r = await p.evaluate(() => {
    tu.start(3); tu.dbg.pause(true); tu.S.objPlan = []; tu.S.cars = []
    const g = tu.D.GUSTS.find(g => g.kind === 'mega'); let air = false, maxY = 0, landed = false
    while (tu.S.t < g.t + g.dur + 3 && tu.S.view === 'play') {
      const ut = tu.S.wind.th / 90
      tu.P.u = tu.S.t > g.t && tu.S.t < g.t + 1.2 ? (ut > 0 ? ut - 0.9 : ut + 0.9) : ut
      tu.dbg.step(1); if (tu.P.air) air = true; if (air && !tu.P.air) landed = true; maxY = Math.max(maxY, tu.P.y)
    }
    return { air, landed, maxY: +maxY.toFixed(1), fly: Math.round(tu.P.fly) }
  })
  expect(r.air && r.landed && r.maxY > 1 && r.fly > 2, r); return r
})
await t('採点の再現性: 同じ seed と操作なら結果が同じ', async () => {
  const r = await p.evaluate(() => [tu.simulate(77, 'good'), tu.simulate(77, 'good'), tu.simulate(77, 'idle'), tu.simulate(77, 'idle')])
  expect(JSON.stringify(r[0]) === JSON.stringify(r[1]) && JSON.stringify(r[2]) === JSON.stringify(r[3]) && r[0].steps > 1000, r); return { good: r[0], idle: r[2] }
})
let dist
await t('採点の分布: 上手（bot）は50〜70秒で着き中間の称号が中心・無傷の伝説はたまに、そこそこ以下はひどい称号、放置は飛ばされるか裏返り多数', async () => {
  dist = await p.evaluate(() => { const out = []; for (let s = 1; s <= 10; s++) { const g = tu.simulate(s * 31, 'good'), i = tu.simulate(s * 31, 'idle'), f = tu.simulate(s * 31, 'flail'), m = tu.simulate(s * 31, 'sloppy'); out.push({ g: [g.tier, g.wet, g.flips, g.time], i: [i.tier, i.wet, i.flips, i.blown], f: [f.tier, f.wet, f.flips], m: [m.tier, m.wet, m.time] }) } return out })
  const goodOk = dist.every(d => ['legend', 'dry', 'half', 'rat', 'puddle'].includes(d.g[0]) && d.g[3] >= 50 && d.g[3] <= 70)
  const legends = dist.filter(d => d.g[0] === 'legend').length, mids = dist.filter(d => ['dry', 'half', 'rat', 'puddle'].includes(d.g[0])).length
  const idleBad = dist.every(d => ['sky', 'broom', 'kite', 'puddle', 'rat'].includes(d.i[0]) && (d.i[2] >= 3 || d.i[3] || d.i[0] === 'kite'))
  const order = dist.every(d => d.g[1] < d.m[1] && d.m[1] <= d.i[1] && d.m[0] !== 'legend') && legends >= 1 && legends <= 4 && mids >= 6
  expect(goodOk && idleBad && order, { legends, mids, dist }); return dist.slice(0, 4)
})
await t('称号が少なくとも6種類出る（bot 4種 × 10 seed）', async () => { const set = new Set(dist.flatMap(d => [d.g[0], d.i[0], d.f[0], d.m[0]])); expect(set.size >= 6, [...set]); return [...set] })
await t('境界: ずぶ濡れ度は0〜100%に収まる・時間切れでも止まらない', async () => {
  const r = await p.evaluate(() => { const a = tu.simulate(1, 'idle'), b = tu.simulate(2, 'good'); return { a: a.wet, b: b.wet, steps: [a.steps, b.steps] } })
  expect(r.a <= 100 && r.a >= 0 && r.b >= 0 && r.steps.every(s => s < 120 * 60), r); return r
})
// --- 結果
await t('結果発表: 判定（ハンコ）は数え上げの後に出る・数字と称号が出る', async () => {
  await p.evaluate(() => { tu.dbg.pause(false); tu.start(31); tu.setBot('good'); let k = 0; while (tu.S.view === 'play' && k++ < 7000) tu.dbg.step(1); tu.setBot(null) })
  const early = await p.evaluate(() => getComputedStyle(document.querySelector('#rStamp')).visibility)
  await p.waitForTimeout(2600)
  const r = await p.evaluate(() => ({ vis: getComputedStyle(document.querySelector('#rStamp')).visibility, stamp: document.querySelector('#rStamp').textContent, wet: document.querySelector('#rWet').textContent, stats: document.querySelector('#rStats').innerText.replace(/\s+/g, ' '), res: tu.result() }))
  expect(early === 'hidden' && r.vis === 'visible' && r.stamp.length > 2 && r.wet.includes(String(r.res.wet)), { early, ...r })
  await p.screenshot({ path: ROOT + '/shots/v-result-good.png' })
  return { stamp: r.stamp, wet: r.wet, stats: r.stats }
})
await t('結果画像 1080x1350 が描けて保存（ダウンロード）できる', async () => {
  const info = await p.evaluate(async () => { const c = await tu.makeCard(); const x = c.getContext('2d'), d = x.getImageData(0, 0, c.width, c.height).data; let s = 0, s2 = 0, n = 0; for (let i = 0; i < d.length; i += 4 * 97) { const v = d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11; s += v; s2 += v * v; n++ } const url = c.toDataURL('image/png'); return { w: c.width, h: c.height, variance: Math.round(s2 / n - (s / n) ** 2), url } })
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 8000 }), p.click('#bSave')])
  const fs = await import('node:fs'); fs.writeFileSync(ROOT + '/shots/v-card.png', Buffer.from(info.url.split(',')[1], 'base64'))
  expect(info.w === 1080 && info.h === 1350 && info.variance > 500 && dl.suggestedFilename() === 'typhoon-umbrella.png', info.variance); return { w: info.w, h: info.h, variance: info.variance, file: dl.suggestedFilename() }
})
await t('もう一回ですぐ遊べる（状態が初期化される）', async () => {
  await p.click('#bAgain'); const r = await p.evaluate(() => ({ view: tu.S.view, wet: tu.P.wet, flips: tu.P.flips, z: tu.P.z, bucket: tu.P.bucket, off: tu.camera.view?.enabled || false }))
  expect(r.view === 'play' && r.wet === 0 && r.flips === 0 && r.z === 0 && !r.bucket && !r.off, r); return r
})
await t('飛ばされた結果（空の旅）でも結果と画像が出る', async () => {
  const r = await p.evaluate(async () => { const s = tu.simulate(31, 'idle'); const c = await tu.makeCard(); return { tier: s.tier, blown: s.blown, view: tu.S.view, card: c.width } })
  await p.waitForTimeout(2400); await p.screenshot({ path: ROOT + '/shots/v-result-blown.png' })
  expect(r.view === 'result' && r.card === 1080, r); return r
})
await t('音: 全効果音と曲を鳴らしてもエラーなし・音が出ている', async () => {
  await p.mouse.click(5, 300)
  const r = await p.evaluate(async () => {
    const S = window.Snd; S.init(); S.ambStart(); S.setMute(false)
    for (const n of ['tap', 'flip', 'fix', 'boing', 'thud', 'clonk', 'bag', 'splash', 'honk', 'car', 'warn', 'gust', 'lift', 'fall', 'blown', 'whoosh', 'thunder', 'chime', 'roll', 'stamp', 'cheer', 'boo', 'yay']) S.sfx(n)
    for (const tr of ['title', 'play', 'win', 'sad']) { S.setTrack(tr); for (let i = 0; i < 20; i++) { await new Promise(r => setTimeout(r, 20)); S.tick() } }
    let lv = 0; for (let i = 0; i < 10; i++) { await new Promise(r => setTimeout(r, 30)); lv = Math.max(lv, S.level()) }
    return { state: S.ctx?.state, level: +lv.toFixed(3), played: Object.keys(S.played).length }
  })
  expect(r.level > 0.01 && r.played >= 23 && p.errs.length === 0, { ...r, errs: p.errs }); return r
})
await t('ミュートが効いて保存される', async () => {
  await p.click('#bMute'); const r = await p.evaluate(() => ({ m: window.Snd.muted, g: window.Snd.master?.gain.value, ls: localStorage.getItem('tu.mute') }))
  await p.click('#bMute'); expect(r.m && r.g === 0 && r.ls === '1', r); return r
})
await t('英語に切り替わる（タイトル・遊び方・結果）', async () => {
  await p.evaluate(() => tu.title()); await p.click('#bLang')
  const r = await p.evaluate(() => ({ l1: document.querySelector('.logo .l1').textContent, l2: document.querySelector('.logo .l2').textContent, start: document.querySelector('#bStart').textContent.trim(), lang: document.documentElement.lang }))
  await p.screenshot({ path: ROOT + '/shots/v-title-en.png' })
  await p.click('#bHow'); await p.screenshot({ path: ROOT + '/shots/v-how-en.png' })
  const res = await p.evaluate(() => { tu.simulate(31, 'good'); return document.querySelector('#rStamp').textContent })
  await p.waitForTimeout(2500); await p.screenshot({ path: ROOT + '/shots/v-result-en.png' })
  expect(r.l1 === 'TYPHOON' && r.l2 === 'UMBRELLA' && /Go to work/.test(r.start) && r.lang === 'en' && /[A-Za-z]/.test(res) && !/[ぁ-ん]/.test(res), { ...r, res })
  await p.click('#bLang'); return { ...r, res }
})
await t('fps（プレイ中・GPU 描画）', async () => {
  await p.evaluate(() => { tu.dbg.pause(false); tu.start(4) }); await p.waitForTimeout(800)
  const fps = await p.evaluate(() => tu.fps()); const info = await p.evaluate(() => ({ calls: tu.renderer.info.render.calls, tris: tu.renderer.info.render.triangles }))
  expect(fps >= 24, fps); return { fps, ...info }
})
await t('全体でエラーが出ていない', async () => { expect(p.errs.length === 0, p.errs.join('|')) })
await p.close()

// ---- 6サイズ × 全画面で一画面に収まる
for (const [w, h, name] of SIZES) {
  const q = await open(browser, { viewport: { width: w, height: h } })
  const views = {}
  await q.evaluate(() => { tu.dbg.pause(true); tu.dbg.step(90); tu.dbg.render() })
  views.title = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-title.png` })
  await q.click('#bHow'); views.how = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-how.png` })
  await q.click('#bHowGo'); await q.evaluate(() => { tu.dbg.step(60 * 14); tu.dbg.render() }); views.play = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-play.png` })
  await q.evaluate(() => { tu.force.flip(); tu.dbg.step(15); tu.dbg.render() }); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-flip.png` })
  await q.click('#bPause'); views.pause = await fit(q)
  await q.click('#bResume'); await q.evaluate(() => { tu.dbg.pause(true); tu.setBot('good'); let k = 0; while (tu.S.view === 'play' && k++ < 7000) tu.dbg.step(1); tu.setBot(null); tu.dbg.pause(false) })
  await q.waitForTimeout(2500); views.result = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-result.png` })
  for (const [v, r] of Object.entries(views)) await t(`一画面に収まる ${name} ${w}x${h} ${v}`, async () => { expect(!r.over.length, r) })
  await t(`${name}: はみ出し・エラーなし`, async () => { const o = await overflow(q); expect(o.sw <= o.W && !o.bad.length && !q.errs.length, JSON.stringify(o) + q.errs.join('|')) })
  await q.close()
}
await browser.close()

// ---- WebKit（iPhone 相当）でタッチの通し
const wb = await webkit.launch()
for (const [w, h, name] of [[390, 844, 'wk-phone'], [844, 390, 'wk-land']]) {
  const wp = await open(wb, { viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  await t(`${name}: タップで出勤できる`, async () => { await wp.tap('#bStart'); expect(await wp.evaluate(() => tu.S.view) === 'play', 'view') })
  await t(`${name}: スマホ用の ◀ ▶ としゃがむボタンが出て、キー説明は出ない`, async () => {
    const r = await wp.evaluate(() => ({ l: !!document.querySelector('#bL').offsetParent, r: !!document.querySelector('#bR').offsetParent, d: !!document.querySelector('#bDuck').offsetParent, keys: !!document.querySelector('#keys').offsetParent, tut: document.querySelector('#tutTxt').textContent }))
    expect(r.l && r.r && r.d && !r.keys && /なぞ/.test(r.tut), r); return r
  })
  await t(`${name}: 画面を左右になぞると傘が傾く`, async () => {
    await wp.evaluate(() => tu.dbg.pause(true))
    const u = await wp.evaluate(async () => {
      const c = document.querySelector('#gl'), W = innerWidth, y = innerHeight * 0.5
      const fire = (type, x) => c.dispatchEvent(new PointerEvent(type, { pointerId: 7, clientX: x, clientY: y, bubbles: true, pointerType: 'touch' }))
      fire('pointerdown', W * 0.5); fire('pointermove', W * 0.5 + 80); const a = tu.P.u; fire('pointermove', W * 0.5 - 120); const b = tu.P.u; fire('pointerup', W * 0.5 - 120); return [a, b]
    })
    expect(u[0] > 0.3 && u[1] < -0.3, u); return u.map(v => +v.toFixed(2))
  })
  await t(`${name}: ◀ ボタン長押しで左に傾く・しゃがむボタンが効く`, async () => {
    const r = await wp.evaluate(() => {
      tu.P.u = 0; const b = document.querySelector('#bL'); b.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 3, bubbles: true }))
      tu.dbg.step(20); b.dispatchEvent(new PointerEvent('pointerup', { pointerId: 3, bubbles: true })); const u = tu.P.u
      document.querySelector('#bDuck').dispatchEvent(new PointerEvent('pointerdown', { pointerId: 4, bubbles: true })); tu.dbg.step(2)
      return { u, duck: tu.P.duckT > 0, dir: tu.S.input.dir }
    })
    expect(r.u < -0.5 && r.duck && r.dir === 0, r); return r
  })
  await wp.evaluate(() => { tu.dbg.step(60 * 20); tu.dbg.render() })
  await wp.screenshot({ path: `${ROOT}/shots/${name}-play.png` })
  await t(`${name}: 2本指の touchmove を止める`, async () => {
    const r = await wp.evaluate(() => { const e = new Event('touchmove', { cancelable: true, bubbles: true }); Object.defineProperty(e, 'touches', { value: [{}, {}] }); document.body.dispatchEvent(e); return e.defaultPrevented })
    expect(r, r)
  })
  await t(`${name}: 最後まで遊んで結果が出る`, async () => {
    await wp.evaluate(() => { tu.setBot('good'); let k = 0; while (tu.S.view === 'play' && k++ < 7000) tu.dbg.step(1); tu.setBot(null); tu.dbg.pause(false) })
    await wp.waitForTimeout(2500); await wp.screenshot({ path: `${ROOT}/shots/${name}-result.png` })
    const f = await fit(wp); expect(await wp.isVisible('#vResult') && !f.over.length, f)
  })
  await t(`${name}: エラーなし`, async () => { expect(wp.errs.length === 0, wp.errs.join('|')) })
  await wp.close()
}
await wb.close()
server.kill()
console.log(results.join('\n'))
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
