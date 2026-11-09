plugins {
    id("com.android.test")
}

android {
    namespace = "com.abrar.daymark.serviceworkertest"
    compileSdk = 36

    defaultConfig {
        // The target app has both githubSideload and play flavors. Resolve the
        // test module's missing distribution dimension explicitly so Gradle
        // never guesses between two equally compatible debug APKs.
        missingDimensionStrategy("distribution", "githubSideload")
        minSdk = 26
        targetSdk = 36
        testInstrumentationRunner = "com.abrar.daymark.DaymarkServiceWorkerInstrumentation"
    }

    targetProjectPath = ":app"

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
