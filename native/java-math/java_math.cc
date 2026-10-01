#include <node_api.h>
#include <jni.h>
#include <cmath>
#include <atomic>
#include <mutex>
#include <string>
#ifdef _WIN32
#include <windows.h>
#else
#include <dlfcn.h>
#endif

namespace {
JavaVM* vm = nullptr;
jclass mathClass = nullptr;
jmethodID sinMethod = nullptr;
jmethodID cosMethod = nullptr;
std::mutex initMutex;
std::atomic<bool> ready{false};
std::string runtimeVersion;
std::string loadedPath;

napi_value fail(napi_env env, const char* message) {
  napi_throw_error(env, nullptr, message);
  return nullptr;
}

// A JNI environment belongs to its calling thread. Node workers must never reuse the creator's JNIEnv.
struct JavaThread {
  JNIEnv* env = nullptr;
  bool attached = false;
  JavaThread() {
    if (!vm) return;
    jint status = vm->GetEnv(reinterpret_cast<void**>(&env), JNI_VERSION_1_8);
    if (status == JNI_EDETACHED) {
      attached = vm->AttachCurrentThreadAsDaemon(reinterpret_cast<void**>(&env), nullptr) == JNI_OK;
      if (!attached) env = nullptr;
    } else if (status != JNI_OK) env = nullptr;
  }
  ~JavaThread() { if (attached) vm->DetachCurrentThread(); }
};

napi_value initialize(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  size_t size = 0;
  if (argc != 1 || napi_get_value_string_utf8(env, args[0], nullptr, 0, &size) != napi_ok)
    return fail(env, "initialize requires an absolute path to the JVM library");
  std::string path(size + 1, '\0');
  napi_get_value_string_utf8(env, args[0], path.data(), path.size(), &size);
  path.resize(size);
  std::lock_guard<std::mutex> lock(initMutex);
  if (vm && path != loadedPath) return fail(env, "a different JVM is already initialized");
  if (vm && !ready.load()) return fail(env, "previous JVM initialization did not complete");
  if (!vm) {
#ifdef _WIN32
    int length = MultiByteToWideChar(CP_UTF8, 0, path.data(), static_cast<int>(path.size()), nullptr, 0);
    std::wstring wide(length, L'\0');
    MultiByteToWideChar(CP_UTF8, 0, path.data(), static_cast<int>(path.size()), wide.data(), length);
    auto library = LoadLibraryExW(wide.c_str(), nullptr, LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_DEFAULT_DIRS);
    auto create = library ? reinterpret_cast<jint(JNICALL*)(JavaVM**, void**, void*)>(GetProcAddress(library, "JNI_CreateJavaVM")) : nullptr;
#else
    auto library = dlopen(path.c_str(), RTLD_NOW | RTLD_GLOBAL);
    auto create = library ? reinterpret_cast<jint(*)(JavaVM**, void**, void*)>(dlsym(library, "JNI_CreateJavaVM")) : nullptr;
#endif
    if (!create) return fail(env, "cannot load JNI_CreateJavaVM from the configured JVM");
    JavaVMOption options[4];
    options[0].optionString = const_cast<char*>("-Xrs");
    options[1].optionString = const_cast<char*>("-Xms16m");
    options[2].optionString = const_cast<char*>("-Xmx64m");
    options[3].optionString = const_cast<char*>("-XX:+UseSerialGC");
    JavaVMInitArgs init{};
    init.version = JNI_VERSION_1_8;
    init.nOptions = 4;
    init.options = options;
    JNIEnv* java = nullptr;
    if (create(&vm, reinterpret_cast<void**>(&java), &init) != JNI_OK)
      return fail(env, "cannot initialize JVM for Java Math");
    loadedPath = path;
    jclass local = java->FindClass("java/lang/Math");
    if (local) {
      mathClass = static_cast<jclass>(java->NewGlobalRef(local));
      sinMethod = java->GetStaticMethodID(mathClass, "sin", "(D)D");
      cosMethod = java->GetStaticMethodID(mathClass, "cos", "(D)D");
      java->DeleteLocalRef(local);
    }
    if (java->ExceptionCheck() || !sinMethod || !cosMethod) {
      java->ExceptionClear();
      return fail(env, "cannot resolve java.lang.Math sin/cos");
    }
    jclass system = java->FindClass("java/lang/System");
    jmethodID property = java->GetStaticMethodID(system, "getProperty", "(Ljava/lang/String;)Ljava/lang/String;");
    jstring key = java->NewStringUTF("java.runtime.version");
    jstring value = static_cast<jstring>(java->CallStaticObjectMethod(system, property, key));
    if (java->ExceptionCheck() || !value) {
      java->ExceptionClear();
      return fail(env, "cannot read Java runtime version");
    }
    const char* version = java->GetStringUTFChars(value, nullptr);
    runtimeVersion = version;
    java->ReleaseStringUTFChars(value, version);
    java->DeleteLocalRef(value);
    java->DeleteLocalRef(key);
    java->DeleteLocalRef(system);
    ready.store(true);
  }
  napi_value result;
  napi_create_string_utf8(env, runtimeVersion.c_str(), runtimeVersion.size(), &result);
  return result;
}

template<int operation> napi_value compute(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  double input;
  if (argc != 1 || napi_get_value_double(env, args[0], &input) != napi_ok)
    return fail(env, "sin/cos require one numeric argument");
  double output;
  if constexpr (operation >= 2) output = operation == 2 ? std::sin(input) : std::cos(input);
  else {
    if (!ready.load()) return fail(env, "initialize the JVM before calling Java sin/cos");
    JavaThread java;
    if (!java.env || !mathClass) return fail(env, "initialize the JVM before calling Java sin/cos");
    output = java.env->CallStaticDoubleMethod(mathClass, operation == 0 ? sinMethod : cosMethod, input);
    if (java.env->ExceptionCheck()) {
      java.env->ExceptionClear();
      return fail(env, "java.lang.Math call failed");
    }
  }
  napi_value result;
  napi_create_double(env, output, &result);
  return result;
}

napi_value initializeExports(napi_env env, napi_value target) {
  napi_property_descriptor functions[] = {
    {"initialize", nullptr, initialize, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"sin", nullptr, compute<0>, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"cos", nullptr, compute<1>, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"systemSin", nullptr, compute<2>, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"systemCos", nullptr, compute<3>, nullptr, nullptr, nullptr, napi_default, nullptr}
  };
  napi_define_properties(env, target, 5, functions);
  return target;
}
}
NAPI_MODULE(java_math, initializeExports)
