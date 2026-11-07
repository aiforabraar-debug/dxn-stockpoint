package com.dxn.stockpoint.member

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.Surface
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import com.dxn.stockpoint.member.data.local.TokenStore
import com.dxn.stockpoint.member.data.repository.ApiRepository
import com.dxn.stockpoint.member.data.remote.ApiClient
import com.dxn.stockpoint.member.ui.screens.AppNavigation
import com.dxn.stockpoint.member.ui.theme.DXNStockpointMemberTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        TokenStore.init(this)
        val apiClient = ApiClient.getInstance(this)
        val tokenStore = TokenStore
        val repository = ApiRepository(apiClient, tokenStore, "https://dxn.10001mb.com")

        var isLoggedIn by remember { mutableStateOf(false) }

        setContent {
            DXNStockpointMemberTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    AppNavigation(
                        isLoggedIn = isLoggedIn,
                        onLogin = { isLoggedIn = true },
                        onLogout = { isLoggedIn = false }
                    )
                }
            }
        }
    }
}
