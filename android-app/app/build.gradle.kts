plugins {
    id("com.android.application")
}

android {
    namespace = "com.abrar.daymark"
    compileSdk = 36

    flavorDimensions += "distribution"

    productFlavors {
        create("githubSideload") {
            dimension = "distribution"
            buildConfigField("boolean", "UPDATER_ENABLED", "true")
        }
        create("play") {
            dimension = "distribution"
            buildConfigField("boolean", "UPDATER_ENABLED", "false")
        }
    }

    defaultConfig {
        applicationId = "com.abrar.daymark"
        minSdk = 26
        targetSdk = 36
        testInstrumentationRunner = "com.abrar.daymark.DaymarkPlatformInstrumentation"
        // Owner-approved fresh app identity; previous app installations remain separate.
        // Keep versionCode monotonic even though the displayed version restarts.
        versionCode = 15
        versionName = "1.8"
    }

    signingConfigs {
        create("release") {
            val keystorePath = System.getenv("KEYSTORE_PATH")
            val keystorePassword = System.getenv("KEYSTORE_PASSWORD")
            val alias = System.getenv("KEY_ALIAS")
            val keyPassword = System.getenv("KEY_PASSWORD")

            val anyProvided = keystorePath != null || keystorePassword != null || alias != null || keyPassword != null

            if (anyProvided) {
                val missing = mutableListOf<String>()
                if (keystorePath.isNullOrBlank()) missing.add("KEYSTORE_PATH")
                if (keystorePassword.isNullOrBlank()) missing.add("KEYSTORE_PASSWORD")
                if (alias.isNullOrBlank()) missing.add("KEY_ALIAS")
                if (keyPassword.isNullOrBlank()) missing.add("KEY_PASSWORD")

                if (missing.isNotEmpty()) {
                    throw GradleException(
                        "Release signing configuration error: Missing required environment variable(s): " +
                        missing.joinToString(", ") +
                        ". All four variables (KEYSTORE_PATH, KEYSTORE_PASSWORD, KEY_ALIAS, KEY_PASSWORD) must be set."
                    )
                }

                val keystoreFile = file(keystorePath!!)
                if (!keystoreFile.exists()) {
                    throw GradleException(
                        "Release signing configuration error: Keystore file not found at KEYSTORE_PATH: ${keystoreFile.absolutePath}"
                    )
                }

                storeFile = keystoreFile
                storePassword = keystorePassword
                this.keyAlias = alias
                this.keyPassword = keyPassword
                enableV1Signing = true
                enableV2Signing = true
            }
        }
    }

    buildTypes {
        release {
            val isSigningConfigured = System.getenv("KEYSTORE_PATH") != null
            if (isSigningConfigured) {
                signingConfig = signingConfigs.getByName("release")
            }
            isMinifyEnabled = false
            isShrinkResources = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        buildConfig = true
    }

    packaging {
        resources {
            excludes += setOf("META-INF/DEPENDENCIES", "META-INF/LICENSE*", "META-INF/NOTICE*")
        }
    }
}

/**
 * Verifies the merged Android manifest of every variant this build produced.
 *
 * The merged manifest is the real permission and cleartext set of the built
 * artifact, not the source manifests. It only exists after Gradle has run, so
 * it is verified here rather than in the host source guard: that guard runs
 * before the build and can therefore only ever skip the merged assertions
 * while still reporting the manifest architecture policy as verified.
 *
 * The same repository script backs the host guard, so the expected permission
 * and cleartext sets have exactly one source of truth.
 */
val verifyMergedManifests by tasks.registering {
    group = "verification"
    description = "Verifies the merged Android manifest of the variants this build produced."
    doLast {
        val mergedManifests = file("build/intermediates/merged_manifest")
        if (!mergedManifests.isDirectory) {
            logger.lifecycle("Merged manifest verification skipped: this build produced no merged manifest.")
            return@doLast
        }
        val script = rootProject.file("tools/check-merged-manifests.py")
        if (!script.isFile) {
            throw GradleException(
                "Merged manifest verification failed: tools/check-merged-manifests.py is missing."
            )
        }
        val interpreter = sequenceOf("python3", "python").firstOrNull { candidate ->
            try {
                ProcessBuilder(candidate, "--version").redirectErrorStream(true).start().waitFor() == 0
            } catch (ignored: Exception) {
                false
            }
        }
        if (interpreter == null) {
            // Not fatal: a developer machine without Python still gets a working build,
            // and the host source guard still checks the source manifests. CI runners
            // always provide an interpreter, so this never weakens CI.
            logger.lifecycle("Merged manifest verification skipped: no Python interpreter is available.")
            return@doLast
        }
        // Verify only the variants this build actually produced. A stale merged manifest
        // left behind by an earlier or aborted build must never be checked against the
        // current source, or a local build could fail for a reason that no longer exists.
        val builtVariants = project.gradle.taskGraph.allTasks
            .filter { it.name.startsWith("process") && it.name.endsWith("MainManifest") }
            .map { it.name.removePrefix("process").removeSuffix("MainManifest") }
            .map { it.replaceFirstChar { first -> first.lowercaseChar() } }
            .distinct()
            .sorted()
        val process = ProcessBuilder(
            interpreter,
            script.absolutePath,
            rootProject.projectDir.absolutePath,
            "--variants",
            builtVariants.joinToString(",")
        ).redirectErrorStream(true).start()
        // Read the whole stream before waiting so a large output cannot deadlock the pipe,
        // then surface it in the build log so the verification is auditable in CI.
        val output = process.inputStream.bufferedReader().use { it.readText() }
        val exitCode = process.waitFor()
        if (output.isNotBlank()) logger.lifecycle(output.trim())
        if (exitCode != 0) {
            throw GradleException(
                "Merged manifest verification failed with exit code $exitCode. The built " +
                "artifact does not match the expected permission and cleartext policy."
            )
        }
    }
}

tasks.matching { it.name.startsWith("assemble") || it.name.startsWith("bundle") }.configureEach {
    finalizedBy(verifyMergedManifests)
}

gradle.taskGraph.whenReady {
    val hasReleaseAssembleTask = allTasks.any { task ->
        task.name.contains("Release", ignoreCase = true) &&
        task.name.startsWith("assemble", ignoreCase = true)
    }

    if (hasReleaseAssembleTask) {
        val missing = mutableListOf<String>()
        if (System.getenv("KEYSTORE_PATH").isNullOrBlank()) missing.add("KEYSTORE_PATH")
        if (System.getenv("KEYSTORE_PASSWORD").isNullOrBlank()) missing.add("KEYSTORE_PASSWORD")
        if (System.getenv("KEY_ALIAS").isNullOrBlank()) missing.add("KEY_ALIAS")
        if (System.getenv("KEY_PASSWORD").isNullOrBlank()) missing.add("KEY_PASSWORD")

        if (missing.isNotEmpty()) {
            throw GradleException(
                "Release build rejected: Missing required signing environment variable(s): " +
                missing.joinToString(", ") +
                ". Refusing to build an unsigned or partially configured release APK."
            )
        }
    }
}

dependencies {
    implementation("androidx.core:core-splashscreen:1.2.0")
}
