import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.preferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

object TokenStore {
    private const val FILE_NAME = "member_token_store"
    private val TOKEN_KEY = stringPreferencesKey("auth_token")
    private val MEMBER_ID_KEY = stringPreferencesKey("member_id")
    private val MEMBER_NAME_KEY = stringPreferencesKey("member_name")

    private var dataStore: androidx.datastore.preferences.core.PreferencesDataStore? = null

    fun init(context: Context) {
        if (dataStore == null) {
            dataStore = preferencesDataStore(context, FILE_NAME)
        }
    }

    val instance: androidx.datastore.preferences.core.PreferencesDataStore
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
            preferences[TOKEN_KEY] = null
            preferences[MEMBER_ID_KEY] = null
            preferences[MEMBER_NAME_KEY] = null
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
            preferences[TOKEN_KEY] != null && preferences[TOKEN_KEY]!!.isNotEmpty()
        }

    suspend fun getToken(): String? = instance.data.first().let { preferences ->
        preferences[TOKEN_KEY]
    }
}
