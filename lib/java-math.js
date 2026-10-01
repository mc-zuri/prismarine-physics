// Optional Java Math implementation for byte-exact Java replay. Configuration is fixed per process.
const path = require('path')
const fs = require('fs')
const home = process.env.PRISMARINE_JAVA_HOME
if (!home) {
  module.exports = { sin: Math.sin, cos: Math.cos, info: { backend: 'javascript' } }
} else {
  const jvm = fs.realpathSync(path.join(home, process.platform === 'win32' ? 'bin/server/jvm.dll' : process.platform === 'darwin' ? 'lib/server/libjvm.dylib' : 'lib/server/libjvm.so'))
  const addon = process.env.PRISMARINE_JAVA_MATH_ADDON ?? path.join(__dirname, '..', 'build-java-math', process.platform === 'win32' ? 'Release/java_math.node' : 'java_math.node')
  const native = require(addon)
  const runtime = native.initialize(jvm)
  module.exports = { sin: native.sin, cos: native.cos, info: { backend: 'napi-jni', runtime, jvm } }
}
