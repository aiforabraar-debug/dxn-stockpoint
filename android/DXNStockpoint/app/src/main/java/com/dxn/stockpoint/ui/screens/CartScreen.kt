@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.dxn.stockpoint.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dxn.stockpoint.data.model.CartItem
import com.dxn.stockpoint.ui.components.ProductThumb
import com.dxn.stockpoint.ui.theme.*
import com.dxn.stockpoint.util.sendOrderToWhatsApp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CartScreen(
    cartItems: List<CartItem>,
    waPhoneNumber: String,
    isOrderLoading: Boolean,
    orderError: String?,
    onBack: () -> Unit,
    onIncrease: (CartItem) -> Unit,
    onDecrease: (CartItem) -> Unit,
    onDelete: (CartItem) -> Unit,
    onPlaceOrder: (customerName: String, isMember: Boolean, memberId: String?) -> Unit,
    onOrderErrorDismiss: () -> Unit
) {
    val context = LocalContext.current
    var customerName by remember { mutableStateOf("") }
    var memberId by remember { mutableStateOf("") }
    var isMember by remember { mutableStateOf(false) }

    val totalAmount = cartItems.sumOf {
        if (isMember) it.subtotalMember else it.subtotalRetail
    }
    val totalPV = cartItems.sumOf { it.subtotalPV }

    // Order error snackbar
    val snackbarHostState = remember { SnackbarHostState() }
    LaunchedEffect(orderError) {
        if (orderError != null) {
            snackbarHostState.showSnackbar(orderError)
            onOrderErrorDismiss()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Your Cart 🛍️", fontWeight = FontWeight.Bold) },
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
        snackbarHost = { SnackbarHost(snackbarHostState) },
        containerColor = Color(0xFFF0F4F1)
    ) { padding ->

        if (cartItems.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("🛒", fontSize = 64.sp)
                    Spacer(modifier = Modifier.height(16.dp))
                    Text("Your cart is empty", fontSize = 18.sp, color = Color.Gray)
                    Spacer(modifier = Modifier.height(8.dp))
                    Text("Add products from the catalog", fontSize = 13.sp, color = Color.LightGray)
                }
            }
            return@Scaffold
        }

        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {

            // Cart items
            items(cartItems, key = { it.product.id }) { item ->
                CartItemRow(
                    item = item,
                    isMember = isMember,
                    onIncrease = { onIncrease(item) },
                    onDecrease = { onDecrease(item) },
                    onDelete = { onDelete(item) }
                )
            }

            // Member toggle
            item {
                Card(
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column {
                            Text("DXN Member Pricing", fontWeight = FontWeight.Bold, color = DarkText)
                            Text(
                                if (isMember) "Member prices applied ✓" else "Retail prices applied",
                                fontSize = 12.sp, color = Color.Gray
                            )
                        }
                        Switch(
                            checked = isMember,
                            onCheckedChange = { isMember = it },
                            colors = SwitchDefaults.colors(checkedThumbColor = ForestGreen, checkedTrackColor = LightGreen)
                        )
                    }
                }
            }

            // Customer info
            item {
                Card(
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White)
                ) {
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text("Customer Details", fontWeight = FontWeight.Bold, color = DarkText)
                        OutlinedTextField(
                            value = customerName,
                            onValueChange = { customerName = it },
                            label = { Text("Customer Name *") },
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp),
                            colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = EmeraldGreen)
                        )
                        if (isMember) {
                            OutlinedTextField(
                                value = memberId,
                                onValueChange = { memberId = it },
                                label = { Text("DXN Member ID (optional)") },
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(12.dp),
                                colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = EmeraldGreen)
                            )
                        }
                    }
                }
            }

            // Order summary
            item {
                Card(
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = LightGreen)
                ) {
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Order Summary", fontWeight = FontWeight.Bold, color = DarkText)
                        HorizontalDivider(color = EmeraldGreen.copy(alpha = 0.3f))
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Total PV", color = DarkText)
                            Text("${"%.2f".format(totalPV)} PV", fontWeight = FontWeight.Bold, color = EmeraldGreen)
                        }
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Total Amount", fontWeight = FontWeight.Bold, color = DarkText)
                            Text(
                                "৳${"%.2f".format(totalAmount)}",
                                fontWeight = FontWeight.ExtraBold,
                                fontSize = 18.sp,
                                color = ForestGreen
                            )
                        }
                    }
                }
            }

            // Action buttons
            item {
                val canCheckout = customerName.isNotBlank() && cartItems.isNotEmpty()

                // WhatsApp button
                Button(
                    onClick = {
                        sendOrderToWhatsApp(
                            context = context,
                            phoneNumber = waPhoneNumber,
                            customerName = customerName.ifBlank { "Customer" },
                            dxnMemberId = memberId.ifBlank { null },
                            cartItems = cartItems,
                            isMember = isMember,
                            totalAmount = totalAmount
                        )
                    },
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF25D366)),
                    shape = RoundedCornerShape(16.dp),
                    contentPadding = PaddingValues(16.dp)
                ) {
                    Text("📱 Send via WhatsApp", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = Color.White)
                }

                Spacer(modifier = Modifier.height(8.dp))

                // Place order via API
                OutlinedButton(
                    onClick = {
                        if (canCheckout) {
                            onPlaceOrder(customerName, isMember, memberId.ifBlank { null })
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = canCheckout && !isOrderLoading,
                    shape = RoundedCornerShape(16.dp),
                    contentPadding = PaddingValues(16.dp),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = ForestGreen)
                ) {
                    if (isOrderLoading) {
                        CircularProgressIndicator(modifier = Modifier.size(20.dp), color = ForestGreen, strokeWidth = 2.dp)
                        Spacer(modifier = Modifier.width(8.dp))
                    }
                    Text("Place Order (API)", fontSize = 16.sp, fontWeight = FontWeight.Bold)
                }

                Spacer(modifier = Modifier.height(32.dp))
            }
        }
    }
}

@Composable
private fun CartItemRow(
    item: CartItem,
    isMember: Boolean,
    onIncrease: () -> Unit,
    onDecrease: () -> Unit,
    onDelete: () -> Unit
) {
    Card(
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(2.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            ProductThumb(
                product = item.product,
                modifier = Modifier.size(56.dp)
            )
            Spacer(modifier = Modifier.width(10.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(item.product.name, fontWeight = FontWeight.Bold, fontSize = 14.sp, color = DarkText)
                Text(item.product.category, fontSize = 11.sp, color = Color.Gray)
                Text(
                    "৳${"%.2f".format(if (isMember) item.subtotalMember else item.subtotalRetail)}",
                    fontWeight = FontWeight.ExtraBold,
                    color = ForestGreen,
                    fontSize = 14.sp
                )
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onDecrease, modifier = Modifier.size(32.dp)) {
                    Icon(Icons.Default.Remove, contentDescription = "Decrease", tint = ForestGreen)
                }
                Text(
                    "${item.quantity}",
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(horizontal = 8.dp),
                    fontSize = 16.sp
                )
                IconButton(onClick = onIncrease, modifier = Modifier.size(32.dp)) {
                    Icon(Icons.Default.Add, contentDescription = "Increase", tint = ForestGreen)
                }
                IconButton(onClick = onDelete, modifier = Modifier.size(32.dp)) {
                    Icon(Icons.Default.Delete, contentDescription = "Delete", tint = Color(0xFFD32F2F))
                }
            }
        }
    }
}

