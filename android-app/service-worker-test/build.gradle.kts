plugins {
    id("com.android.test")
}

android {
    namespace = "com.abrar.daymark.serviceworkertest"
    compileSdk = 36

    flavorDimensions += "distribution"

    // Mirror both target-app flavors. The test-only plugin's missing-dimension
    // fallback did not add the consumer flavor attribute required to resolve
    // :app's githubSideloadDebug and playDebug tested APKs.
    productFlavors {
        create("githubSideload") {
            dimension = "distribution"
        }
        create("play") {
            dimension = "distribution"
        }
    }

    defaultConfig {
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
