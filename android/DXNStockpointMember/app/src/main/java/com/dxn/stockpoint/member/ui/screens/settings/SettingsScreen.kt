package com.dxn.stockpoint.member.ui.screens.settings

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.dxn.stockpoint.member.ui.theme.*

class SettingsViewModel

@Composable
fun SettingsScreen(
    viewModel: SettingsViewModel,
    onBack: () -> Unit,
    onLogout: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(modifier = modifier.padding(20.dp)) {
        TopAppBar(
            title = { Text("Settings") },
            navigationIcon = {
                IconButton(onClick = onBack) {
                    Icon(
                        imageVector = Icons.Default.ArrowBack,
                        contentDescription = "Back"
                    )
                }
            },
            colors = TopAppBarDefaults.mediumTopAppBarColors(containerColor = Color.Transparent)
        )

        Spacer(modifier = Modifier.height(24.dp))

        Text("Account", style = MaterialTheme.typography.titleMedium.copy(color = Color(0xFF666666)))
        Spacer(modifier = Modifier.height(12.dp))

        ListItem(
            text = { Text("Change PIN") },
            leadingIcon = { Icon(imageVector = Icons.Default.Lock, contentDescription = "Change PIN") },
            onClick = { /* handle change pin */ }
        )

        Divider()

        ListItem(
            text = { Text("Contact Stockpoint") },
            leadingIcon = { Icon(imageVector = Icons.Default.Phone, contentDescription = "Contact") },
            onClick = { /* handle contact */ }
        )

        Spacer(modifier = Modifier.height(32.dp))

        PrimaryButton(
            onClick = onLogout,
            text = "Logout",
            modifier = Modifier.fillMaxWidth()
        )
    }
}
