const { withGradleProperties, AndroidConfig } = require('@expo/config-plugins');

/**
 * Expo Config Plugin to ensure optimal Gradle build properties persist
 * across `expo prebuild --clean` runs.
 */
const withOptimizedGradle = config => {
  return withGradleProperties(config, modConfig => {
    // 3.5 GB max heap + Metaspace + Parallel GC for compiler throughput on Apple Silicon M1 (8GB)
    modConfig.modResults = AndroidConfig.BuildProperties.updateAndroidBuildProperty(
      modConfig.modResults,
      'org.gradle.jvmargs',
      '-Xmx3584m -XX:MaxMetaspaceSize=768m -XX:+UseParallelGC'
    );

    // Enable Gradle build cache to reuse task outputs across runs
    modConfig.modResults = AndroidConfig.BuildProperties.updateAndroidBuildProperty(
      modConfig.modResults,
      'org.gradle.caching',
      'true'
    );

    // Cap workers to 6 to leave 2 cores free for OS/UI responsiveness on 8-core M1 without QoS throttling
    modConfig.modResults = AndroidConfig.BuildProperties.updateAndroidBuildProperty(
      modConfig.modResults,
      'org.gradle.workers.max',
      '6'
    );

    // Default to arm64-v8a to avoid compiling C++ for 4 ABIs in dev/local builds
    modConfig.modResults = AndroidConfig.BuildProperties.updateAndroidBuildProperty(
      modConfig.modResults,
      'reactNativeArchitectures',
      'arm64-v8a'
    );

    return modConfig;
  });
};

module.exports = withOptimizedGradle;
