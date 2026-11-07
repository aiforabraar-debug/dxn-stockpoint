package com.dxn.stockpoint.member.ui.screens

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberSaveable
import androidx.compose.ui.Modifier
import com.dxn.stockpoint.member.data.model.MemberProfile
import com.dxn.stockpoint.member.ui.theme.DXNStockpointMemberTheme
import com.dxn.stockpoint.member.ui.screens.dashboard.DashboardScreen
import com.dxn.stockpoint.member.ui.screens.dashboard.DashboardViewModel
import com.dxn.stockpoint.member.ui.screens.history.PvHistoryScreen
import com.dxn.stockpoint.member.ui.screens.history.PvHistoryViewModel
import com.dxn.stockpoint.member.ui.screens.login.LoginScreenContent
import com.dxn.stockpoint.member.ui.screens.settings.SettingsScreen
import com.dxn.stockpoint.member.ui.screens.settings.SettingsViewModel

@Composable
fun AppNavigation(
    isLoggedIn: Boolean,
    onLogin: () -> Unit,
    onLogout: () -> Unit
) {
    val selectedScreen by rememberSaveable { mutableStateOf<String>("dashboard") }

    DXNStockpointMemberTheme {
        Scaffold(
            modifier = Modifier.fillMaxSize(),
            bottomBar = {
                androidx.compose.material3.NavigationBar {
                    androidx.compose.material3.NavigationBarItem(
                        icon = { androidx.compose.material3.Icon(androidx.compose.material3.Icons.Default.Home, contentDescription = "Dashboard") },
                        label = { androidx.compose.material3.Text("Dashboard") },
                        selected = selectedScreen == "dashboard",
                        onClick = { selectedScreen = "dashboard" }
                    )
                    androidx.compose.material3.NavigationBarItem(
                        icon = { androidx.compose.material3.Icon(androidx.compose.material3.Icons.Default.History, contentDescription = "PV History") },
                        label = { androidx.compose.material3.Text("PV History") },
                        selected = selectedScreen == "history",
                        onClick = { selectedScreen = "history" }
                    )
                    androidx.compose.material3.NavigationBarItem(
                        icon = { androidx.compose.material3.Icon(androidx.compose.material3.Icons.Default.Settings, contentDescription = "Settings") },
                        label = { androidx.compose.material3.Text("Settings") },
                        selected = selectedScreen == "settings",
                        onClick = { selectedScreen = "settings" }
                    )
                }
            }
        ) {
            when (selectedScreen) {
                "dashboard" -> {
                    if (isLoggedIn) {
                        DashboardScreen(
                            viewModel = DashboardViewModel(
                                profile = MemberProfile(
                                    id = 0,
                                    memberId = "",
                                    name = "Member",
                                    phone = null,
                                    totalPv = 0.0,
                                    totalOrders = 0,
                                    totalSpent = 0.0
                                )
                            ),
                            onNavigateToHistory = { selectedScreen = "history" },
                            onLogout = onLogout
                        )
                    } else {
                        LoginScreenContent(onLoginSuccess = onLogin)
                    }
                }
                "history" -> {
                    if (isLoggedIn) {
                        PvHistoryScreen(
                            viewModel = PvHistoryViewModel(),
                            onBack = { selectedScreen = "dashboard" }
                        )
                    } else {
                        LoginScreenContent(onLoginSuccess = onLogin)
                    }
                }
                "settings" -> {
                    if (isLoggedIn) {
                        SettingsScreen(
                            viewModel = SettingsViewModel(),
                            onBack = { selectedScreen = "dashboard" },
                            onLogout = onLogout
                        )
                    } else {
                        LoginScreenContent(onLoginSuccess = onLogin)
                    }
                }
            }
        }
    }
}
