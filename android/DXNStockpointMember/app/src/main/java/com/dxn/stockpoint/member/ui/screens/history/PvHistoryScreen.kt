package com.dxn.stockpoint.member.ui.screens.history

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.dxn.stockpoint.member.data.model.PvDistribution
import com.dxn.stockpoint.member.ui.theme.*
import kotlinx.coroutines.CoroutineScope

class PvHistoryViewModel(
    private val distributions: List<PvDistribution> = emptyList()
) {
    val items = distributions
}

@Composable
fun PvHistoryScreen(
    viewModel: PvHistoryViewModel,
    onBack: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(modifier = modifier.padding(20.dp)) {
        TopAppBar(
            title = { Text("PV History") },
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

        Spacer(modifier = Modifier.height(16.dp))

        if (viewModel.items.isEmpty()) {
            Text(
                text = "No PV distributions yet",
                style = MaterialTheme.typography.bodyLarge.copy(color = Color(0xFF666666)),
                modifier = Modifier.align(alignment = androidx.compose.ui.Alignment.CenterHorizontally)
            )
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxWidth()
            ) {
                items(viewModel.items) { dist ->
                    DistributionRow(
                        date = dist.createdAt,
                        reason = dist.reason,
                        amount = "+%,.2f".format(dist.pvAmount),
                        reference = dist.referenceId ?: "-"
                    )
                }
            }
        }
    }
}

@Composable
private fun DistributionRow(date: String, reason: String, amount: String, reference: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp)
            .border(
                width = 1.dp,
                color = Color(0xFFE0E0E0),
                shape = RoundedCornerShape(12.dp)
            ),
        verticalAlignment = androidx.compose.ui.Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f).padding(horizontal = 12.dp)) {
            Text(text = reason, style = MaterialTheme.typography.bodyMedium.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.Medium))
            Spacer(modifier = Modifier.height(4.dp))
            Text(text = date, style = MaterialTheme.typography.bodySmall.copy(color = Color(0xFF666666)))
        }
        Column(modifier = Modifier.padding(horizontal = 12.dp)) {
            Text(text = amount, style = MaterialTheme.typography.titleMedium.copy(color = Green, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold))
            Spacer(modifier = Modifier.height(4.dp))
            Text(text = "Ref: $reference", style = MaterialTheme.typography.bodySmall.copy(color = Color(0xFF666666)))
        }
    }
}
