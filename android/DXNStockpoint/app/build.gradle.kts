plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

android {
    namespace = "com.dxn.stockpoint"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.dxn.stockpoint"
        minSdk = 26
        targetSdk = 35
        versionCode = 8
        versionName = "2.2.0"
    }

    // The release keystore comes from CI (env vars) or a local
    // android/DXNStockpoint/release.keystore. Without either, the release
    // APK/AAB is simply left unsigned instead of failing the build.
    signingConfigs {
        create("release") {
            val storePath = System.getenv("DXN_KEYSTORE")
                ?: project.rootProject.file("release.keystore")
                    .takeIf { it.exists() }?.absolutePath
                ?: ""
            if (storePath.isNotEmpty() && file(storePath).exists()) {
                storeFile = file(storePath)
                storePassword = System.getenv("DXN_KEYSTORE_PASSWORD") ?: ""
                keyAlias = System.getenv("DXN_KEY_ALIAS") ?: "dxn"
                keyPassword = System.getenv("DXN_KEY_PASSWORD") ?: ""
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            val releaseConfig = signingConfigs.getByName("release")
            if (releaseConfig.storeFile != null) {
                signingConfig = releaseConfig
            }
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
        freeCompilerArgs += listOf(
            "-opt-in=androidx.compose.material3.ExperimentalMaterial3Api"
        )
    }

    buildFeatures {
        compose = true
    }
}

dependencies {
    // Core
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.activity.compose)

    // Compose BOM
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.ui)
    implementation(libs.androidx.ui.graphics)
    implementation(libs.androidx.ui.tooling.preview)
    implementation(libs.androidx.material3)
    implementation("androidx.compose.material:material-icons-extended")

    // ViewModel + StateFlow
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")

    // Retrofit + Gson
    implementation("com.squareup.retrofit2:retrofit:2.9.0")
    implementation("com.squareup.retrofit2:converter-gson:2.9.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")

    // Coroutines
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")

    // Product photography (remote URLs for shopkeeper-added products)
    implementation("io.coil-kt:coil-compose:2.7.0")

    // Debug
    debugImplementation(libs.androidx.ui.tooling)
    debugImplementation(libs.androidx.ui.test.manifest)
}

