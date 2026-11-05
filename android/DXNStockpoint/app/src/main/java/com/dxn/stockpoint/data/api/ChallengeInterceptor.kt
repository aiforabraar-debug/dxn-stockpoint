package com.dxn.stockpoint.data.api

import okhttp3.Interceptor
import okhttp3.Response
import javax.crypto.Cipher
import javax.crypto.spec.IvParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * InfinityFree (ByetHost) protects hosted sites with a JavaScript challenge
 * that sets a `__test` cookie. Native clients never run that JavaScript, so
 * this interceptor solves the AES-128-CBC puzzle once, caches the cookie and
 * transparently retries the request.
 */
object ChallengeInterceptor : Interceptor {

    private const val COOKIE_PREFIX = "__test="
    private const val MAX_CHALLENGE_BYTES = 64L * 1024L
    private val challengePattern = Regex(
        """a=toNumbers\("([0-9a-fA-F]+)"\),b=toNumbers\("([0-9a-fA-F]+)"\),c=toNumbers\("([0-9a-fA-F]+)"\)"""
    )

    @Volatile private var cookieHost: String? = null
    @Volatile private var cookieValue: String? = null

    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val host = request.url.host
        val cached = if (host == cookieHost) cookieValue else null
        val first = chain.proceed(
            if (cached != null) {
                request.newBuilder().header("Cookie", COOKIE_PREFIX + cached).build()
            } else {
                request
            }
        )

        if (!first.isChallenge()) return first

        val solved = solve(first.peekBody(MAX_CHALLENGE_BYTES).string()) ?: return first
        first.close()

        cookieHost = host
        cookieValue = solved

        return chain.proceed(
            request.newBuilder().header("Cookie", COOKIE_PREFIX + solved).build()
        )
    }

    private fun Response.isChallenge(): Boolean {
        if (code != 200 && code != 403 && code != 503) return false
        val type = body?.contentType()?.toString() ?: ""
        if (!type.contains("text/html", ignoreCase = true)) return false
        val snippet = peekBody(MAX_CHALLENGE_BYTES).string()
        return snippet.contains("toNumbers(") && snippet.contains("__test")
    }

    private fun solve(html: String): String? {
        val match = challengePattern.find(html) ?: return null
        return try {
            val key = match.groupValues[1].hexToBytes()
            val iv = match.groupValues[2].hexToBytes()
            val cipherText = match.groupValues[3].hexToBytes()
            val cipher = Cipher.getInstance("AES/CBC/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES"), IvParameterSpec(iv))
            cipher.doFinal(cipherText).toHex()
        } catch (_: Exception) {
            null
        }
    }

    private fun String.hexToBytes(): ByteArray =
        ByteArray(length / 2) { i ->
            ((this[i * 2].digitToInt(16) shl 4) or this[i * 2 + 1].digitToInt(16)).toByte()
        }

    private fun ByteArray.toHex(): String {
        val out = StringBuilder(size * 2)
        for (b in this) out.append("%02x".format(b.toInt() and 0xff))
        return out.toString()
    }
}
