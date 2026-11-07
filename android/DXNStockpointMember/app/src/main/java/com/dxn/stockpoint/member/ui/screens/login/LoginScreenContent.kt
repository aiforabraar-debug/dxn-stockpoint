package com.dxn.stockpoint.member.ui.screens.login

import androidx.compose.runtime.Composable
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewmodel.compose.viewModel

@Composable
fun LoginScreenContent(
    onLoginSuccess: () -> Unit,
    viewModel: LoginViewModel = viewModel()
) {
    LoginScreen(viewModel = viewModel, onLoginSuccess = onLoginSuccess)
}
