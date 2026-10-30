// SNS用サムネ og.png（1200x630）。突風で体ごと浮いた瞬間＋タイトル。node og.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
const ROOT = import.meta.dirname
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: '5323' } })
await new Promise(r => setTimeout(r, 400))
const b = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const p = await b.newPage({ viewport: { width: 1200, height: 630 }, locale: 'ja-JP' })
await p.goto('http://localhost:5323/'); await p.waitForFunction(() => window.__tuReady)
await p.evaluate(() => document.fonts.ready)
await p.evaluate(() => {
  tu.dbg.pause(true); tu.start(8); tu.S.objPlan = []; tu.S.cars = []
  tu.dbg.step(60 * 6)
  tu.force.wind(-75, 1.5); tu.P.u = 0.7; tu.force.wet(46); tu.force.dmg(48); tu.force.bucket()
  tu.force.lift(); tu.dbg.step(50)
  tu.force.obj('sign'); tu.force.obj('bag'); tu.dbg.step(40)
  const P = tu.P, c = tu.camera
  P.x = -0.6; P.y = 2.4; tu.force.wind(-40, 1.5); P.u = -0.95; tu.dbg.step(1)
  c.position.set(P.x + 0.5, P.y + 0.7, P.z - 4.4); c.lookAt(P.x - 1.9, P.y + 1.7, P.z); c.updateMatrixWorld()
  tu.dbg.render()
})
await p.addStyleTag({ content: `main.view,#corner,.bubble{display:none!important}
  body::after{content:'';position:fixed;inset:0 0 0 50%;background:linear-gradient(90deg,rgba(15,22,28,0),rgba(15,22,28,.9) 26%);z-index:30}` })
await p.evaluate(() => {
  const d = document.createElement('div'); d.style.cssText = 'position:fixed;right:40px;top:0;bottom:0;width:520px;z-index:31;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:18px;color:#fff;text-align:center'
  d.innerHTML = `<div style="background:#ff4b3e;font:900 22px 'M PLUS Rounded 1c',sans-serif;padding:6px 14px;border-radius:6px;box-shadow:0 3px 0 #9e1f17;letter-spacing:.06em">LIVE 台風中継</div>
  <div style="font-family:'Dela Gothic One';line-height:1;transform:rotate(-3deg)"><div style="font-size:54px;text-shadow:0 4px 0 #0b1218">台風の日の</div><div style="font-size:170px;color:#ffd23f;text-shadow:0 8px 0 #a8820c,0 0 34px rgba(255,210,63,.5)">傘</div></div>
  <div style="font:900 30px/1.45 'M PLUS Rounded 1c',sans-serif">突風で傘が裏返る前に、<br>駅までたどり着け。</div>`
  document.body.appendChild(d)
  const o = document.createElement('div'); o.textContent = '浮いてるぅぅ！'
  o.style.cssText = "position:fixed;left:70px;top:60px;z-index:31;background:#ffd23f;color:#16202a;font:900 34px 'M PLUS Rounded 1c',sans-serif;padding:10px 20px;border-radius:20px;border:4px solid #0b1218;box-shadow:0 5px 0 #0b1218;transform:rotate(-5deg)"
  document.body.appendChild(o)
})
await p.waitForTimeout(500)
await p.screenshot({ path: ROOT + '/og.png' })
await b.close(); server.kill()
console.log('ok')
