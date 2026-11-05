@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.dxn.stockpoint.ui.screens

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Save
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dxn.stockpoint.R
import com.dxn.stockpoint.ui.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    currentServerUrl: String,
    currentWaPhone: String,
    onBack: () -> Unit,
    onSaveServerUrl: (String) -> Unit,
    onSaveWaPhone: (String) -> Unit
) {
    var serverUrl by remember(currentServerUrl) { mutableStateOf(currentServerUrl) }
    var waPhone by remember(currentWaPhone) { mutableStateOf(currentWaPhone) }
    var urlSaved by remember { mutableStateOf(false) }
    var phoneSaved by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Settings ⚙️", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = Color.White)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = ForestGreen,
                    titleContentColor = Color.White
                )
            )
        },
        containerColor = Color(0xFFF0F4F1)
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {

            // Server URL
            item {
                Card(
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    elevation = CardDefaults.cardElevation(2.dp)
                ) {
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text("🌐 Server Configuration", fontWeight = FontWeight.Bold, fontSize = 16.sp, color = DarkText)
                        Text(
                            "Set the URL of your local backend or Cloudflare/Ngrok tunnel.",
                            fontSize = 12.sp, color = Color.Gray
                        )
                        OutlinedTextField(
                            value = serverUrl,
                            onValueChange = { serverUrl = it; urlSaved = false },
                            label = { Text("Base URL") },
                            placeholder = { Text("http://10.0.2.2:3000/") },
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp),
                            singleLine = true,
                            colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = EmeraldGreen)
                        )
                        Button(
                            onClick = {
                                onSaveServerUrl(serverUrl)
                                urlSaved = true
                            },
                            modifier = Modifier.fillMaxWidth(),
                            colors = ButtonDefaults.buttonColors(containerColor = ForestGreen),
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Icon(Icons.Default.Save, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Save & Reconnect")
                        }
                        if (urlSaved) {
                            Text("✅ URL saved. Reloading catalog…", color = EmeraldGreen, fontSize = 12.sp)
                        }
                        Text(
                            "💡 Tip: the built-in default connects to the live shop API\n" +
                            "(https://dxnstock.byethost7.com/). For local development, point this\n" +
                            "at a tunnel or the emulator loopback instead.",
                            fontSize = 11.sp, color = Color.Gray
                        )
                    }
                }
            }

            // WhatsApp phone
            item {
                Card(
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    elevation = CardDefaults.cardElevation(2.dp)
                ) {
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text("📱 WhatsApp Settings", fontWeight = FontWeight.Bold, fontSize = 16.sp, color = DarkText)
                        Text(
                            "Phone number to receive orders via WhatsApp (with country code, no + or spaces).",
                            fontSize = 12.sp, color = Color.Gray
                        )
                        OutlinedTextField(
                            value = waPhone,
                            onValueChange = { waPhone = it.filter { c -> c.isDigit() }; phoneSaved = false },
                            label = { Text("WhatsApp Number") },
                            placeholder = { Text("8801XXXXXXXXX") },
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp),
                            singleLine = true,
                            colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = EmeraldGreen)
                        )
                        Button(
                            onClick = {
                                onSaveWaPhone(waPhone)
                                phoneSaved = true
                            },
                            modifier = Modifier.fillMaxWidth(),
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF25D366)),
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Text("Save WhatsApp Number")
                        }
                        if (phoneSaved) {
                            Text("✅ WhatsApp number saved.", color = EmeraldGreen, fontSize = 12.sp)
                        }
                    }
                }
            }

            // About
            item {
                Card(
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = LightGreen),
                    elevation = CardDefaults.cardElevation(0.dp)
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Image(
                            painter = painterResource(R.drawable.logo_full),
                            contentDescription = "Mohammadpur Stock Point logo",
                            contentScale = ContentScale.Fit,
                            modifier = Modifier.size(150.dp)
                        )
                        Text(
                            "Mohammadpur Stock Point",
                            fontWeight = FontWeight.ExtraBold,
                            color = ForestGreen,
                            fontSize = 16.sp,
                            textAlign = TextAlign.Center
                        )
                        Text("Independent DXN distributor", fontSize = 12.sp, color = Color.Gray)
                        Text(
                            "H # 1, R # 11, B # A, Chandrima Model Town, Dhaka-1207",
                            fontSize = 12.sp,
                            color = DarkText.copy(alpha = 0.75f),
                            textAlign = TextAlign.Center
                        )
                        Text("Ph. 01939994578", fontSize = 12.sp, color = DarkText.copy(alpha = 0.75f))
                        Spacer(modifier = Modifier.height(6.dp))
                        Text("Version 2.1.0", fontSize = 12.sp, color = Color.Gray)
                        Text(
                            "Offline-first POS, inventory and PV tracking for the shop.",
                            fontSize = 12.sp,
                            color = Color.Gray,
                            textAlign = TextAlign.Center
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            "Stack: Kotlin · Jetpack Compose · Retrofit · PHP 8 · MySQL",
                            fontSize = 11.sp,
                            color = Color.Gray,
                            textAlign = TextAlign.Center
                        )
                    }
                }
            }
        }
    }
}

