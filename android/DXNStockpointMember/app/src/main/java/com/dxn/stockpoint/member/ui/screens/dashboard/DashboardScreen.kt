package com.dxn.stockpoint.member.ui.screens.dashboard

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.dxn.stockpoint.member.data.model.MemberProfile
import com.dxn.stockpoint.member.ui.theme.*
import kotlinx.coroutines.CoroutineScope

class DashboardViewModel(
    private val profile: MemberProfile
) {
    val memberName = profile.name
    val memberId = profile.memberId
    val totalPv = profile.totalPv
    val totalOrders = profile.totalOrders
    val totalSpent = profile.totalSpent
}

@Composable
fun DashboardScreen(
    viewModel: DashboardViewModel,
    onNavigateToHistory: () -> Unit,
    onLogout: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(modifier = modifier.padding(20.dp)) {
        Text(
            text = "Welcome back, ${viewModel.memberName}",
            style = MaterialTheme.typography.titleLarge.copy(color = Green),
            modifier = Modifier.padding(bottom = 4.dp)
        )
        Text(
            text = "Member ID: ${viewModel.memberId}",
            style = MaterialTheme.typography.bodyMedium.copy(color = Color(0xFF666666)),
            modifier = Modifier.padding(bottom = 32.dp)
        )

        // PV Balance card
        Card(
            modifier = Modifier.fillMaxWidth(),
            elevation = 4.dp,
            shape = RoundedCornerShape(16.dp)
        ) {
            Column(
                modifier = Modifier.padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(text = "PV Balance", style = MaterialTheme.typography.bodyMedium.copy(color = Color(0xFF666666)))
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "%,.2f PV".format(viewModel.totalPv),
                    style = MaterialTheme.typography.displayMedium.copy(color = Green, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold)
                )
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = androidx.compose.foundation.layout.Arrangement.SpaceBetween
        ) {
            StatBox("Total Orders", viewModel.totalOrders.toString())
            StatBox("Total Spent", "%,.2f".format(viewModel.totalSpent))
        }

        Spacer(modifier = Modifier.height(32.dp))

        PrimaryButton(
            onClick = onNavigateToHistory,
            text = "View PV History",
            modifier = Modifier.fillMaxWidth()
        )

        Spacer(modifier = Modifier.height(16.dp))

        TextButton(onClick = onLogout) {
            Text("Logout", style = MaterialTheme.typography.labelLarge.copy(color = Color.Red))
        }
    }
}

@Composable
private fun StatBox(label: String, value: String) {
    Column(
        modifier = Modifier.weight(1f).padding(horizontal = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(text = label, style = MaterialTheme.typography.bodySmall.copy(color = Color(0xFF666666)))
        Spacer(modifier = Modifier.height(4.dp))
        Text(text = value, style = MaterialTheme.typography.titleMedium.copy(color = Green, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold))
    }
}
