# Java sin/cos through Node-API and JNI

Java `Math.cos`, JavaScript `Math.cos`, and a C++ standard library `cos` can differ by one double bit. This optional addon calls the configured JVM's `java.lang.Math` directly. It also builds Minecraft's sine tables through that JVM. It does not introduce tolerances or adjust recorded state.

Build with CMake, a C++17 compiler, JDK headers, and the headers/library for your Node installation. On Windows:

```powershell
$env:JAVA_HOME = 'C:/Program Files/Java/jdk-25.0.3'
cmake -S native/java-math -B build-java-math `
  -DNODE_INCLUDE_DIR="$env:LOCALAPPDATA/node-gyp/Cache/24.15.0/include/node" `
  -DNODE_LIBRARY="$env:LOCALAPPDATA/node-gyp/Cache/24.15.0/x64/node.lib"
cmake --build build-java-math --config Release
$env:PRISMARINE_JAVA_HOME = $env:JAVA_HOME
node --test test/java-math-native.test.js
```

Set `PRISMARINE_JAVA_HOME` before starting a replay process. `PRISMARINE_JAVA_MATH_ADDON` can override the addon path. An explicit configuration fails if the JVM or addon cannot load; it never silently falls back. Without configuration, ordinary physics retains JavaScript math. Use the capture's Java runtime and architecture for exact comparisons; equivalence with different JVM builds is not assumed.

The addon embeds one JVM per process, with a 64 MB maximum Java heap. Calls from Node worker threads attach to the JVM as daemon threads and detach after the call. The independent reference test checks signed zero, nonfinite values, pitch sweeps, every Minecraft sine-table argument, and random large angles against a separate Java process.
