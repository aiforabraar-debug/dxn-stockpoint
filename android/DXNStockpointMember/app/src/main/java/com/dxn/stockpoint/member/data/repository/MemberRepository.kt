package com.dxn.stockpoint.member.data.repository

import com.dxn.stockpoint.member.data.local.TokenStore
import com.dxn.stockpoint.member.data.model.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class ApiRepository(private val apiClient: ApiClient, private val tokenStore: TokenStore, private val baseUrl: String) {

    private val gson = com.google.gson.Gson()

    suspend fun login(memberId: String, pin: String): LoginResponse {
        return withContext(Dispatchers.IO) {
            val response = apiClient.postJson("$baseUrl/api/v1/member/login", LoginRequest(memberId, pin))
            if (!response.isSuccessful) {
                val error = gson.fromJson(response.body?.string() ?: "", com.google.gson.reflect.TypeToken.get(com.dxn.stockpoint.member.data.model.ApiError::class.java) as com.google.gson.reflect.TypeToken<com.dxn.stockpoint.member.data.model.ApiError>)
                throw RuntimeException(error.message ?: "Login failed")
            }
            val loginResponse = gson.fromJson(response.body!!.string(), com.google.gson.reflect.TypeToken.get(LoginResponse::class.java) as com.google.gson.reflect.TypeToken<LoginResponse>)
            tokenStore.saveToken(loginResponse.token, loginResponse.member.memberId, loginResponse.member.name)
            loginResponse
        }
    }

    suspend fun getProfile(token: String): MemberProfile {
        return withContext(Dispatchers.IO) {
            val response = apiClient.getJson("$baseUrl/api/v1/member/me", token)
            if (!response.isSuccessful) throw RuntimeException("Failed to load profile")
            val body = response.body?.string() ?: ""
            val json = com.google.gson.JsonParser.parseString(body).asJsonObject
            val memberJson = json.getAsJsonObject("member")
            gson.fromJson(memberJson, com.google.gson.reflect.TypeToken.get(MemberProfile::class.java) as com.google.gson.reflect.TypeToken<MemberProfile>)
        }
    }

    suspend fun getPvHistory(token: String, limit: Int = 50, offset: Int = 0): List<PvDistribution> {
        return withContext(Dispatchers.IO) {
            val url = "$baseUrl/api/v1/member/pv-history?limit=$limit&offset=$offset"
            val response = apiClient.getJson(url, token)
            if (!response.isSuccessful) throw RuntimeException("Failed to load PV history")
            val body = response.body?.string() ?: ""
            val json = com.google.gson.JsonParser.parseString(body).asJsonObject
            val arr = json.getAsJsonArray("distributions")
            val listType = com.google.gson.reflect.TypeToken.getParameterized(
                com.google.gson.reflect.TypeToken.get(List::class.java),
                com.google.gson.reflect.TypeToken.get(PvDistribution::class.java)
            ).type
            gson.fromJson(arr, listType) as List<PvDistribution>
        }
    }

    suspend fun logout() {
        withContext(Dispatchers.IO) { tokenStore.clearToken() }
    }
}
