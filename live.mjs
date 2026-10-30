// 公開URLの確認。node live.mjs（ログインしていないブラウザで見る）。SKIPGH=1 で GitHub ページの確認を省く
// 公開版を bot で駅まで通し、og.png と GitHub 上の個人IDの有無を見る
import { chromium, webkit } from 'playwright'
const URL0 = 'https://tom3games.github.io/typhoon-umbrella/'
const out = []
for (const [name, bt, opts] of [['chromium', chromium, {}], ['webkit', webkit, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
  const b = await bt.launch(), ctx = await b.newContext({ locale: 'ja-JP', viewport: { width: 390, height: 844 }, ...opts }), p = await ctx.newPage()
  const errs = []
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
  p.on('requestfailed', r => errs.push('fail ' + r.url()))
  await p.goto(URL0 + '?t=' + Date.now(), { waitUntil: 'networkidle' })
  await p.waitForFunction(() => window.__tuReady, null, { timeout: 15000 })
  // 遊びの通し: タイトル → 出勤 → bot で駅まで → 結果
  await p.locator('#bStart').click()
  await p.evaluate(() => { tu.dbg.pause(true); tu.setBot('good'); let k = 0; while (tu.S.view === 'play' && k++ < 7000) tu.dbg.step(1); tu.setBot(null); tu.dbg.pause(false) })
  await p.waitForTimeout(2500)
  if (!(await p.isVisible('#vResult'))) errs.push('result not shown')
  await p.screenshot({ path: `shots/live-${name}.png` })
  const og = await p.evaluate(async () => { const r = await fetch(document.querySelector('meta[property="og:image"]').content); return r.status + ' ' + r.headers.get('content-type') })
  out.push(`${name}: og=${og} errors=${errs.length ? errs.join(' | ') : 'none'}`)
  await b.close()
}
if (process.env.SKIPGH) { console.log(out.join('\n')); process.exit(0) }
// ログアウト状態でリポジトリ・更新履歴に個人のIDが出ていないか
const b = await chromium.launch(), p = await b.newPage()
for (const u of ['https://github.com/tom3games/typhoon-umbrella', 'https://github.com/tom3games/typhoon-umbrella/commits/main']) {
  const res = await p.goto(u, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2500)
  const ID = ['tmk', '4men'].join('') // 公開物に個人IDを文字で残さない
  out.push(`${u} status=${res.status()} personalId=${new RegExp(ID, 'i').test(await p.content()) ? 'FOUND' : 'none'}`)
}
await b.close()
console.log(out.join('\n'))
