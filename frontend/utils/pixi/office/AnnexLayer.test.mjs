import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

// Loads AnnexLayer with small stand-ins for PixiJS and gsap so the reveal logic runs in Node.
function load() {
  const exports = {}
  const tweens = []
  class Container {
    constructor() { this.children = []; this.eventMode = 'passive'; this.destroyed = false; this.position = { set() {} }; this.anchor = { set() {} } }
    addChild(...children) { this.children.push(...children) }
    destroy() { this.destroyed = true }
  }
  class Graphics extends Container {
    constructor() { super(); this.shapes = 0 }
    clear() { this.shapes = 0; return this }
    rect() { this.shapes++; return this }
    roundRect() { return this }
    fill() { return this }
    stroke() { return this }
  }
  class Text extends Container { constructor() { super(); this.width = 40 } }
  const gsap = { to(target, options) { const tween = { target, options, kill() {} }; tweens.push(tween); return tween } }
  const source = ts.transpileModule(readFileSync(new URL('./AnnexLayer.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText
  vm.runInNewContext(source, {
    exports,
    require: name => {
      if (name === 'pixi.js') return { Container, Graphics, Text }
      if (name === 'gsap') return { gsap }
      throw new Error(name)
    },
  })
  return { AnnexLayer: exports.AnnexLayer, tweens }
}

const annex = { reveal: { x: 50, y: 0, width: 36, height: 30 }, triggers: [[49, 15], [49, 16]] }
const signs = [{ text: 'Salas →', x: 47.5, y: 14.3 }]

test('the dark wing catches the pointer so nothing beneath it can be hovered', () => {
  const { AnnexLayer } = load()
  const layer = new AnnexLayer(annex, signs)
  assert.equal(layer.darkness.eventMode, 'static')
  assert.ok(layer.darkness.shapes > 0)
})

test('an instant reveal clears the darkness, stops catching the pointer and reports it', () => {
  const { AnnexLayer } = load()
  let revealed = 0
  const layer = new AnnexLayer(annex, signs, () => { revealed++ })
  assert.equal(revealed, 0)
  layer.reveal(false)
  assert.equal(revealed, 1)
  assert.equal(layer.darkness.shapes, 0)
  assert.equal(layer.darkness.eventMode, 'none')
  layer.reveal(false)
  assert.equal(revealed, 1, 'a second reveal does nothing')
})

test('the sweep reports the reveal only when it finishes', () => {
  const { AnnexLayer, tweens } = load()
  let revealed = 0
  const layer = new AnnexLayer(annex, signs, () => { revealed++ })
  layer.reveal(true)
  const [tween] = tweens
  tween.target.progress = 0.5
  tween.options.onUpdate()
  assert.equal(revealed, 0)
  assert.equal(layer.darkness.eventMode, 'static')
  tween.target.progress = 1
  tween.options.onUpdate()
  tween.options.onComplete()
  assert.equal(revealed, 1)
  assert.equal(layer.darkness.eventMode, 'none')
})

test('without a callback the layer still reveals', () => {
  const { AnnexLayer } = load()
  const layer = new AnnexLayer(annex, signs)
  layer.reveal(false)
  assert.equal(layer.revealed, true)
})
