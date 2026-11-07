import android.content.Context
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import okhttp3.*
import java.io.IOException
import java.util.concurrent.TimeUnit

class ApiClient private constructor(private val client: OkHttpClient) {

    private val gson = Gson()

    companion object {
        @Volatile private var instance: ApiClient? = null

        fun getInstance(context: Context): ApiClient {
            return instance ?: synchronized(this) {
                instance ?: ApiClient(OkHttpClient.Builder()
                    .connectTimeout(30, TimeUnit.SECONDS)
                    .readTimeout(30, TimeUnit.SECONDS)
                    .writeTimeout(30, TimeUnit.SECONDS)
                    .addInterceptor { chain ->
                        val request = chain.request().newBuilder()
                            .addHeader("Accept", "application/json")
                            .addHeader("Content-Type", "application/json")
                            .build()
                        chain.proceed(request)
                    }
                    .build()).also { instance = it }
            }
        }
    }

    suspend fun postJson(url: String, body: Any): Response {
        val json = gson.toJson(body)
        val requestBody = RequestBody.create(json, MediaType.get("application/json; charset=utf-8"))
        val request = Request.Builder().url(url).post(requestBody).build()
        return client.newCall(request).execute()
    }

    suspend fun getJson(url: String, token: String? = null): Response {
        val builder = Request.Builder().url(url).get()
        if (token != null && token.isNotEmpty()) {
            builder.addHeader("Authorization", "Bearer $token")
        }
        return client.newCall(builder.build()).execute()
    }

    fun <T> decodeResponse(response: Response, type: TypeToken<T>): T {
        val body = response.body?.string() ?: throw IOException("Empty response body")
        return gson.fromJson(body, type)
    }
}
