const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { Worker } = require('node:worker_threads')

test('Node-API JNI sin/cos match an independent Java process bit for bit', { skip: !process.env.PRISMARINE_JAVA_HOME }, () => {
  const javaMath = require('../lib/java-math')
  assert.equal(javaMath.info.backend, 'napi-jni')
  const inputs = [0, -0, Number.MIN_VALUE, -Number.MIN_VALUE, Math.PI, -Math.PI, Infinity, -Infinity, NaN]
  for (let pitch = -90; pitch <= 90; pitch += 0.125) inputs.push(Math.fround(pitch * Math.fround(Math.PI / 180)))
  // Every input used to build both Minecraft sine lookup tables.
  for (let i = 0; i < 65536; i++) inputs.push(i / 10430.378350470453, i * Math.PI * 2 / 65536)
  let seed = 12345
  for (let i = 0; i < 10000; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    inputs.push((seed / 2 ** 32 - 0.5) * 1e6)
  }
  const data = Buffer.alloc(inputs.length * 8)
  inputs.forEach((x, i) => data.writeDoubleBE(x, i * 8))
  const java = path.join(process.env.PRISMARINE_JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java')
  const run = spawnSync(java, [path.join(__dirname, '../native/java-math/MathReference.java')], { input: data, maxBuffer: inputs.length * 16 + 1024 * 1024 })
  assert.equal(run.status, 0, run.stderr.toString())
  assert.equal(run.stdout.length, inputs.length * 16)
  for (let i = 0; i < inputs.length; i++) {
    for (const [offset, name] of [[0, 'sin'], [8, 'cos']]) {
      assert.ok(Object.is(javaMath[name](inputs[i]), run.stdout.readDoubleBE(i * 16 + offset)), `${name}(${inputs[i]}) differs from Java`)
    }
  }
})

test('Java Math can be called from a Node worker without sharing a JNIEnv', { skip: !process.env.PRISMARINE_JAVA_HOME }, async () => {
  const javaMath = require('../lib/java-math')
  const worker = new Worker('const {parentPort,workerData}=require(\'node:worker_threads\');const math=require(workerData);parentPort.postMessage([math.cos(Math.fround(56*Math.fround(Math.PI/180))),Object.is(math.sin(-0),-0)])', { eval: true, workerData: require.resolve('../lib/java-math') })
  const result = await new Promise((resolve, reject) => { worker.once('message', resolve); worker.once('error', reject) })
  assert.deepEqual(result, [javaMath.cos(Math.fround(56 * Math.fround(Math.PI / 180))), true])
  await worker.terminate()
})
