package com.dxn.stockpoint.member.ui.screens.login

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.dxn.stockpoint.member.data.local.TokenStore
import com.dxn.stockpoint.member.data.repository.MemberRepository
import com.dxn.stockpoint.member.ui.theme.*
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class LoginViewModel(
    private val repository: MemberRepository,
    private val tokenStore: TokenStore
) {
    private val _uiState = MutableStateFlow(LoginUiState())
    val uiState = _uiState.asStateFlow()

    var memberId by mutableStateOf("")
    var pin by mutableStateOf("")
    var rememberMe by mutableStateOf(false)

    fun login(scope: CoroutineScope) {
        scope.launch {
            _uiState.value = _uiState.value.copy(loading = true, error = null)
            try {
                repository.login(memberId, pin)
                _uiState.value = _uiState.value.copy(loading = false, loggedIn = true)
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(loading = false, error = e.message ?: "Login failed")
            }
        }
    }
}

data class LoginUiState(
    val loading: Boolean = false,
    val error: String? = null,
    val loggedIn: Boolean = false
)

@Composable
fun LoginScreen(
    viewModel: LoginViewModel,
    onLoginSuccess: () -> Unit,
    modifier: Modifier = Modifier
) {
    var showPassword by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    Column(
        modifier = modifier.padding(24.dp),
        horizontalAlignment = androidx.compose.ui.Alignment.CenterHorizontally
    ) {
        Text(
            text = "DXN Member PV",
            style = MaterialTheme.typography.titleLarge.copy(color = Green),
            modifier = Modifier.padding(bottom = 8.dp)
        )
        Text(
            text = "Login to your account",
            style = MaterialTheme.typography.bodyLarge,
            modifier = Modifier.padding(bottom = 32.dp)
        )

        OutlinedTextField(
            value = viewModel.memberId,
            onValueChange = { viewModel.memberId = it },
            label = "Member ID",
            placeholder = "DXN123456",
            keyboardOptions = androidx.compose.material3.KeyboardOptions.Default
        )

        Spacer(modifier = Modifier.height(16.dp))

        OutlinedTextField(
            value = viewModel.pin,
            onValueChange = { viewModel.pin = it },
            label = "PIN",
            placeholder = "4-6 digits",
            keyboardOptions = androidx.compose.material3.KeyboardOptions(numericKeyboard = true)
        )

        Spacer(modifier = Modifier.height(12.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = androidx.compose.ui.Alignment.CenterVertically
        ) {
            Checkbox(
                checked = viewModel.rememberMe,
                onCheckedChange = { viewModel.rememberMe = it }
            )
            Text("Remember me", style = MaterialTheme.typography.bodyLarge)
        }

        Spacer(modifier = Modifier.height(16.dp))

        viewModel.uiState.error?.let { error ->
            Text(
                text = error,
                style = MaterialTheme.typography.bodySmall.copy(color = Color.Red),
                modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp)
            )
        }

        PrimaryButton(
            onClick = { viewModel.login(scope) },
            text = "Login",
            enabled = !viewModel.uiState.loading && viewModel.memberId.isNotEmpty() && viewModel.pin.isNotEmpty(),
            modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp)
        )

        if (viewModel.uiState.loggedIn) {
            LaunchedEffect(Unit) { onLoginSuccess() }
        }

        Spacer(modifier = Modifier.height(24.dp))

        TextButton(
            onClick = { },
            modifier = Modifier.padding(top = 8.dp)
        ) {
            Text("Forgot PIN?", style = MaterialTheme.typography.labelLarge.copy(color = Emerald))
        }
    }
}
