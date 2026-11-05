package com.dxn.stockpoint.data.api

import android.content.Context
import com.dxn.stockpoint.data.local.Prefs
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

/**
 * One Retrofit instance per server URL. The bearer token is injected per
 * request by an interceptor, so signing in or out never needs a rebuild.
 */
object RetrofitClient {

    @Volatile private var baseUrl: String = Prefs.DEFAULT_BASE_URL

    @Volatile var token: String? = null
        private set

    fun init(context: Context) {
        Prefs.init(context)
        baseUrl = normalize(Prefs.baseUrl)
        token = Prefs.token
        retrofit = buildRetrofit()
    }

    private val loggingInterceptor = HttpLoggingInterceptor().apply {
        level = HttpLoggingInterceptor.Level.BASIC
    }

    private val authInterceptor = okhttp3.Interceptor { chain ->
        val builder = chain.request().newBuilder()
            .header("Accept", "application/json")
        token?.let { builder.header("Authorization", "Bearer $it") }
        chain.proceed(builder.build())
    }

    private val okHttpClient: OkHttpClient = OkHttpClient.Builder()
        .addInterceptor(authInterceptor)
        .addInterceptor(loggingInterceptor)
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(25, TimeUnit.SECONDS)
        .writeTimeout(25, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    @Volatile private var retrofit: Retrofit = buildRetrofit()

    private fun buildRetrofit(): Retrofit = Retrofit.Builder()
        .baseUrl(baseUrl)
        .client(okHttpClient)
        .addConverterFactory(GsonConverterFactory.create())
        .build()

    val apiService: ApiService get() = retrofit.create(ApiService::class.java)

    /**
     * Accepts anything a shopkeeper might paste: the bare domain, a URL that
     * still carries `/api/v1`, or the installer URL. Only the origin survives.
     */
    fun normalize(raw: String): String {
        var value = raw.trim()
        if (value.isEmpty()) return Prefs.DEFAULT_BASE_URL
        if (!value.contains("://")) value = "https://$value"
        value = value.replace(Regex("^http://", RegexOption.IGNORE_CASE), "http://")
            .replace(Regex("^https://", RegexOption.IGNORE_CASE), "https://")

        // Drop everything from the API path onwards, then normalise the tail.
        val cut = listOf("/api/v1", "/api", "/index.php")
            .map { value.lowercase().indexOf(it) }
            .filter { it > 8 }
            .minOrNull()
        if (cut != null) value = value.substring(0, cut)

        value = value.trimEnd('/')
        return if (value.endsWith("/")) value else "$value/"
    }

    /** Call this when the user saves a new server URL in Settings. */
    fun setBaseUrl(url: String) {
        val normalized = normalize(url)
        baseUrl = normalized
        Prefs.baseUrl = normalized
        retrofit = buildRetrofit()
    }

    fun getBaseUrl(): String = baseUrl

    fun setToken(value: String?) {
        token = value
        Prefs.token = value
    }

    fun clearToken() {
        token = null
        Prefs.clearSession()
    }

    fun hasToken(): Boolean = !token.isNullOrBlank()
}
