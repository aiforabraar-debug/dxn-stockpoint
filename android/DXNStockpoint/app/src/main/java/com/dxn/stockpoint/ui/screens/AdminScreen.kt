@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.dxn.stockpoint.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dxn.stockpoint.data.model.DashboardData
import com.dxn.stockpoint.data.model.Order
import com.dxn.stockpoint.data.model.Product
import com.dxn.stockpoint.ui.components.ProductThumb
import com.dxn.stockpoint.ui.components.StatCard
import com.dxn.stockpoint.ui.theme.*
import com.dxn.stockpoint.viewmodel.UiState

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AdminScreen(
    dashboardState: UiState<DashboardData>,
    productsState: UiState<List<Product>>,
    ordersState: UiState<List<Order>>,
    onBack: () -> Unit,
    onRefresh: () -> Unit,
    onUpdateStock: (productId: Int, qty: Int) -> Unit,
    onAddProduct: (sku: String, name: String, category: String,
                   retailPrice: Double, memberPrice: Double,
                   pvPoints: Double, stockQty: Int) -> Unit,
    onLoadOrders: () -> Unit
) {
    var selectedTab by remember { mutableIntStateOf(0) }
    val tabs = listOf("Dashboard", "Stock", "Add Product", "Orders")

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Admin Panel 🔧", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = Color.White)
                    }
                },
                actions = {
                    IconButton(onClick = onRefresh) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh", tint = Color.White)
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
        Column(modifier = Modifier.padding(padding)) {
            ScrollableTabRow(
                selectedTabIndex = selectedTab,
                containerColor = Color.White,
                contentColor = ForestGreen,
                edgePadding = 0.dp
            ) {
                tabs.forEachIndexed { index, title ->
                    Tab(
                        selected = selectedTab == index,
                        onClick = {
                            selectedTab = index
                            if (index == 3) onLoadOrders()
                        },
                        text = { Text(title, fontSize = 13.sp) }
                    )
                }
            }

            when (selectedTab) {
                0 -> DashboardTab(dashboardState)
                1 -> StockUpdateTab(productsState, onUpdateStock)
                2 -> AddProductTab(onAddProduct)
                3 -> OrdersTab(ordersState)
            }
        }
    }
}

// ── Dashboard Tab ─────────────────────────────────────────────────────────────

@Composable
private fun DashboardTab(state: UiState<DashboardData>) {
    when {
        state.isLoading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(color = ForestGreen)
        }
        state.error != null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text("Error: ${state.error}", color = Color.Red)
        }
        state.data != null -> {
            val data = state.data
            LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                // Stats row
                item {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        StatCard(
                            title = "Total Orders",
                            value = "${data.totalOrders}",
                            icon = Icons.Default.ShoppingCart,
                            modifier = Modifier.weight(1f)
                        )
                        StatCard(
                            title = "Revenue",
                            value = "৳${"%.0f".format(data.totalRevenue)}",
                            icon = Icons.Default.AttachMoney,
                            modifier = Modifier.weight(1f)
                        )
                        StatCard(
                            title = "Total PV",
                            value = "${"%.1f".format(data.totalPV)}",
                            icon = Icons.Default.Star,
                            modifier = Modifier.weight(1f)
                        )
                    }
                }

                // Low stock alerts
                if (data.lowStockProducts.isNotEmpty()) {
                    item {
                        Text(
                            "⚠️ Low Stock Alerts",
                            fontWeight = FontWeight.Bold,
                            fontSize = 16.sp,
                            color = Color(0xFFD32F2F)
                        )
                    }
                    items(data.lowStockProducts) { product ->
                        Card(
                            shape = RoundedCornerShape(12.dp),
                            colors = CardDefaults.cardColors(containerColor = Color(0xFFFFEBEE))
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(12.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(
                                    modifier = Modifier.weight(1f),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    ProductThumb(
                                        product = product,
                                        modifier = Modifier.size(42.dp),
                                        cornerRadius = 10.dp
                                    )
                                    Spacer(modifier = Modifier.width(10.dp))
                                    Column {
                                        Text(product.name, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                                        Text(product.category, fontSize = 12.sp, color = Color.Gray)
                                    }
                                }
                                Badge(containerColor = Color(0xFFD32F2F)) {
                                    Text("${product.stockQty} left", color = Color.White, fontSize = 11.sp)
                                }
                            }
                        }
                    }
                } else {
                    item {
                        Card(
                            shape = RoundedCornerShape(12.dp),
                            colors = CardDefaults.cardColors(containerColor = Color(0xFFE8F5E9))
                        ) {
                            Text(
                                "✅ All products sufficiently stocked",
                                modifier = Modifier.padding(16.dp),
                                color = ForestGreen,
                                fontWeight = FontWeight.Medium
                            )
                        }
                    }
                }
            }
        }
    }
}

// ── Stock Update Tab ──────────────────────────────────────────────────────────

@Composable
private fun StockUpdateTab(productsState: UiState<List<Product>>, onUpdateStock: (Int, Int) -> Unit) {
    val products = productsState.data ?: emptyList()
    var selectedProduct by remember { mutableStateOf<Product?>(null) }
    var quantityText by remember { mutableStateOf("") }
    var expanded by remember { mutableStateOf(false) }
    var successMsg by remember { mutableStateOf<String?>(null) }

    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Text("Update Stock Quantity", fontWeight = FontWeight.Bold, fontSize = 16.sp, color = DarkText)
        }
        item {
            ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = it }) {
                OutlinedTextField(
                    value = selectedProduct?.name ?: "Select a product…",
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Product") },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .menuAnchor(),
                    shape = RoundedCornerShape(12.dp),
                    colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = EmeraldGreen)
                )
                ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                    products.forEach { product ->
                        DropdownMenuItem(
                            text = { Text("${product.name} (${product.stockQty} in stock)") },
                            onClick = {
                                selectedProduct = product
                                quantityText = product.stockQty.toString()
                                expanded = false
                            }
                        )
                    }
                }
            }
        }
        item {
            OutlinedTextField(
                value = quantityText,
                onValueChange = { quantityText = it.filter { c -> c.isDigit() } },
                label = { Text("New Quantity") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = EmeraldGreen)
            )
        }
        item {
            Button(
                onClick = {
                    val qty = quantityText.toIntOrNull()
                    if (selectedProduct != null && qty != null) {
                        onUpdateStock(selectedProduct!!.id, qty)
                        successMsg = "Stock updated for ${selectedProduct!!.name}"
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                enabled = selectedProduct != null && quantityText.isNotBlank(),
                colors = ButtonDefaults.buttonColors(containerColor = ForestGreen),
                shape = RoundedCornerShape(12.dp),
                contentPadding = PaddingValues(16.dp)
            ) {
                Text("Update Stock", fontWeight = FontWeight.Bold)
            }
        }
        successMsg?.let {
            item {
                Card(
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFFE8F5E9))
                ) {
                    Text("✅ $it", modifier = Modifier.padding(12.dp), color = ForestGreen)
                }
            }
        }
    }
}

// ── Add Product Tab ───────────────────────────────────────────────────────────

@Composable
private fun AddProductTab(
    onAddProduct: (String, String, String, Double, Double, Double, Int) -> Unit
) {
    var sku by remember { mutableStateOf("") }
    var name by remember { mutableStateOf("") }
    var category by remember { mutableStateOf("Coffee") }
    var retailPrice by remember { mutableStateOf("") }
    var memberPrice by remember { mutableStateOf("") }
    var pvPoints by remember { mutableStateOf("") }
    var stockQty by remember { mutableStateOf("") }
    var expanded by remember { mutableStateOf(false) }
    var submitted by remember { mutableStateOf(false) }

    val categories = listOf("Coffee", "Supplements", "Personal Care", "Other")

    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { Text("Add New Product", fontWeight = FontWeight.Bold, fontSize = 16.sp, color = DarkText) }

        item {
            OutlinedTextField(value = sku, onValueChange = { sku = it }, label = { Text("SKU *") },
                modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp),
                colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = EmeraldGreen))
        }
        item {
            OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Product Name *") },
                modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp),
                colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = EmeraldGreen))
        }
        item {
            ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = it }) {
                OutlinedTextField(
                    value = category, onValueChange = {}, readOnly = true,
                    label = { Text("Category") },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
                    modifier = Modifier.fillMaxWidth().menuAnchor(),
                    shape = RoundedCornerShape(12.dp),
                    colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = EmeraldGreen)
                )
                ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                    categories.forEach {
                        DropdownMenuItem(text = { Text(it) }, onClick = { category = it; expanded = false })
                    }
                }
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(value = retailPrice, onValueChange = { retailPrice = it }, label = { Text("Retail Price ৳") },
                    modifier = Modifier.weight(1f), shape = RoundedCornerShape(12.dp),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = EmeraldGreen))
                OutlinedTextField(value = memberPrice, onValueChange = { memberPrice = it }, label = { Text("Member Price ৳") },
                    modifier = Modifier.weight(1f), shape = RoundedCornerShape(12.dp),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = EmeraldGreen))
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(value = pvPoints, onValueChange = { pvPoints = it }, label = { Text("PV Points") },
                    modifier = Modifier.weight(1f), shape = RoundedCornerShape(12.dp),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = EmeraldGreen))
                OutlinedTextField(value = stockQty, onValueChange = { stockQty = it.filter { c -> c.isDigit() } }, label = { Text("Stock Qty") },
                    modifier = Modifier.weight(1f), shape = RoundedCornerShape(12.dp),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = EmeraldGreen))
            }
        }
        item {
            Button(
                onClick = {
                    if (sku.isNotBlank() && name.isNotBlank()) {
                        onAddProduct(
                            sku, name, category,
                            retailPrice.toDoubleOrNull() ?: 0.0,
                            memberPrice.toDoubleOrNull() ?: 0.0,
                            pvPoints.toDoubleOrNull() ?: 0.0,
                            stockQty.toIntOrNull() ?: 0
                        )
                        submitted = true
                        sku = ""; name = ""; retailPrice = ""; memberPrice = ""; pvPoints = ""; stockQty = ""
                    }
                },
                modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                enabled = sku.isNotBlank() && name.isNotBlank(),
                colors = ButtonDefaults.buttonColors(containerColor = ForestGreen),
                shape = RoundedCornerShape(12.dp),
                contentPadding = PaddingValues(16.dp)
            ) {
                Text("Add Product", fontWeight = FontWeight.Bold)
            }
        }
        if (submitted) {
            item {
                Card(shape = RoundedCornerShape(12.dp), colors = CardDefaults.cardColors(containerColor = Color(0xFFE8F5E9))) {
                    Text("✅ Product added successfully!", modifier = Modifier.padding(12.dp), color = ForestGreen)
                }
            }
        }
    }
}

// ── Orders Tab ────────────────────────────────────────────────────────────────

@Composable
private fun OrdersTab(ordersState: UiState<List<Order>>) {
    when {
        ordersState.isLoading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(color = ForestGreen)
        }
        ordersState.error != null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text("Error: ${ordersState.error}", color = Color.Red)
        }
        ordersState.data != null -> {
            if (ordersState.data.isEmpty()) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("No orders yet", color = Color.Gray)
                }
            } else {
                LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    item { Text("Order History", fontWeight = FontWeight.Bold, fontSize = 16.sp, color = DarkText) }
                    items(ordersState.data) { order ->
                        Card(
                            shape = RoundedCornerShape(12.dp),
                            colors = CardDefaults.cardColors(containerColor = Color.White),
                            elevation = CardDefaults.cardElevation(2.dp)
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth().padding(12.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column {
                                    Text(order.orderNumber, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                                    Text(order.customerName, fontSize = 12.sp, color = Color.Gray)
                                    Text("৳${"%.2f".format(order.totalAmount)}", color = ForestGreen, fontWeight = FontWeight.Bold)
                                    if (order.courierTrackingCode != null) {
                                        Text("SteadFast: ${order.courierTrackingCode} (${order.courierStatus ?: "in_review"})", fontSize = 10.sp, color = Color(0xFF1976D2))
                                    }
                                }
                                val chipColor = when (order.status) {
                                    "CONFIRMED" -> Color(0xFF4CAF50)
                                    "CANCELLED" -> Color(0xFFD32F2F)
                                    else -> Color(0xFF1976D2)
                                }
                                Badge(containerColor = chipColor) {
                                    Text(order.status, color = Color.White, fontSize = 10.sp, modifier = Modifier.padding(horizontal = 4.dp))
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

