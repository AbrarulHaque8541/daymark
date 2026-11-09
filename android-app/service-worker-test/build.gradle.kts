plugins {
    id("com.android.test")
}

android {
    namespace = "com.abrar.daymark.serviceworkertest"
    compileSdk = 36

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
