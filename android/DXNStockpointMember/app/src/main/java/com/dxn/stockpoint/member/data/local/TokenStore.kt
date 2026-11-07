package com.dxn.stockpoint.member.data.local

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.core.PreferencesDataStore
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

object TokenStore {
    private const val FILE_NAME = "member_token_store"
    private val TOKEN_KEY = stringPreferencesKey("auth_token")
    private val MEMBER_ID_KEY = stringPreferencesKey("member_id")
    private val MEMBER_NAME_KEY = stringPreferencesKey("member_name")

    private var dataStore: PreferencesDataStore? = null

    fun init(context: Context) {
        if (dataStore == null) {
            dataStore = preferencesDataStore(context, FILE_NAME)
        }
    }

    val instance: PreferencesDataStore
        get() = dataStore ?: error("TokenStore not initialized. Call init(context) first.")

    suspend fun saveToken(token: String, memberId: String, memberName: String) {
        instance.edit { preferences ->
            preferences[TOKEN_KEY] = token
            preferences[MEMBER_ID_KEY] = memberId
            preferences[MEMBER_NAME_KEY] = memberName
        }
    }

    suspend fun clearToken() {
        instance.edit { preferences ->
            preferences.remove(TOKEN_KEY)
            preferences.remove(MEMBER_ID_KEY)
            preferences.remove(MEMBER_NAME_KEY)
        }
    }

    val token: Flow<String?>
        get() = instance.data.map { preferences ->
            preferences[TOKEN_KEY]
        }

    val memberId: Flow<String?>
        get() = instance.data.map { preferences ->
            preferences[MEMBER_ID_KEY]
        }

    val isLoggedIn: Flow<Boolean>
        get() = instance.data.map { preferences ->
            val t = preferences[TOKEN_KEY]
            t != null && t.isNotEmpty()
        }

    suspend fun getToken(): String? =
        instance.data.first { preferences ->
            preferences[TOKEN_KEY] != null
        }[TOKEN_KEY]
}
