package com.dxn.stockpoint

import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dxn.stockpoint.data.model.AddProductRequest
import com.dxn.stockpoint.ui.screens.*
import com.dxn.stockpoint.ui.theme.AccentGold
import com.dxn.stockpoint.ui.theme.DXNStockpointTheme
import com.dxn.stockpoint.ui.theme.DarkText
import com.dxn.stockpoint.ui.theme.EmeraldGreen
import com.dxn.stockpoint.ui.theme.ForestGreen
import com.dxn.stockpoint.viewmodel.StockpointViewModel
import com.dxn.stockpoint.viewmodel.SyncState

enum class NavItem(val title: String, val icon: ImageVector) {
    CATALOG("Catalog", Icons.Default.Storefront),
    CART("Cart", Icons.Default.ShoppingCart),
    ADMIN("Admin POS", Icons.Default.AdminPanelSettings),
    SETTINGS("Settings", Icons.Default.Settings)
}

class MainActivity : ComponentActivity() {

    private val viewModel: StockpointViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        setContent {
            DXNStockpointTheme {
                DXNStockpointApp(viewModel)
            }
        }
    }
}

@Composable
fun DXNStockpointApp(viewModel: StockpointViewModel) {
    val context = LocalContext.current
    var currentTab by remember { mutableStateOf(NavItem.CATALOG) }

    val productsState by viewModel.products.collectAsState()
    val cart by viewModel.cart.collectAsState()
    val ordersState by viewModel.orders.collectAsState()
    val dashboardState by viewModel.dashboard.collectAsState()
    val orderResult by viewModel.orderResult.collectAsState()
    val searchQuery by viewModel.searchQuery.collectAsState()
    val selectedCategory by viewModel.selectedCategory.collectAsState()
    val serverUrl by viewModel.serverUrl.collectAsState()
    val waPhone by viewModel.waPhoneNumber.collectAsState()
    val syncState by viewModel.syncState.collectAsState()
    val isAdmin by viewModel.isAdmin.collectAsState()

    // PIN gate
    var showPinDialog by remember { mutableStateOf(false) }
    var pinInput by remember { mutableStateOf("") }
    var pinError by remember { mutableStateOf<String?>(null) }
    var pinBusy by remember { mutableStateOf(false) }
    var pendingTab by remember { mutableStateOf<NavItem?>(null) }

    val previewProducts = viewModel.filteredProducts()
    val cartCount = viewModel.cartItemCount

    val openAdminPanel: (NavItem) -> Unit = { target ->
        if (isAdmin) {
            viewModel.loadDashboard()
            viewModel.loadOrders()
            currentTab = target
        } else {
            pendingTab = target
            pinInput = ""
            pinError = null
            showPinDialog = true
        }
    }

    LaunchedEffect(orderResult) {
        orderResult?.data?.let { result ->
            val message = if (result.queued) {
                "📥 Order saved offline — it will sync automatically"
            } else {
                "✅ Order ${result.orderNumber} successfully recorded!"
            }
            Toast.makeText(context, message, Toast.LENGTH_LONG).show()
            viewModel.clearOrderResult()
        }
        orderResult?.error?.let { err ->
            Toast.makeText(context, "⚠️ $err", Toast.LENGTH_LONG).show()
        }
    }

    Scaffold(
        bottomBar = {
            Column {
                SyncStrip(
                    state = syncState,
                    isAdmin = isAdmin,
                    onSync = { viewModel.syncNow() },
                    onAccount = {
                        if (isAdmin) {
                            viewModel.logout()
                            if (currentTab == NavItem.ADMIN) currentTab = NavItem.CATALOG
                            Toast.makeText(context, "Signed out", Toast.LENGTH_SHORT).show()
                        } else {
                            pendingTab = null
                            pinInput = ""
                            pinError = null
                            showPinDialog = true
                        }
                    }
                )
                NavigationBar(
                    containerColor = Color.White,
                    tonalElevation = 8.dp
                ) {
                    NavItem.values().forEach { item ->
                        val isSelected = currentTab == item
                        NavigationBarItem(
                            selected = isSelected,
                            onClick = {
                                when (item) {
                                    NavItem.ADMIN -> openAdminPanel(NavItem.ADMIN)
                                    else -> currentTab = item
                                }
                            },
                            icon = {
                                Box {
                                    Icon(
                                        imageVector = item.icon,
                                        contentDescription = item.title,
                                        tint = if (isSelected) ForestGreen else Color.Gray
                                    )
                                    if (item == NavItem.CART && cartCount > 0) {
                                        Badge(
                                            modifier = Modifier
                                                .align(Alignment.TopEnd)
                                                .offset(x = 10.dp, y = (-4).dp),
                                            containerColor = Color(0xFFD32F2F)
                                        ) {
                                            Text(
                                                text = if (cartCount > 99) "99+" else "$cartCount",
                                                color = Color.White,
                                                fontSize = 9.sp,
                                                fontWeight = FontWeight.Bold
                                            )
                                        }
                                    }
                                    if (item == NavItem.ADMIN && !isAdmin) {
                                        Icon(
                                            imageVector = Icons.Default.Lock,
                                            contentDescription = "Locked",
                                            tint = Color.Gray,
                                            modifier = Modifier
                                                .align(Alignment.TopEnd)
                                                .offset(x = 9.dp, y = (-5).dp)
                                                .size(11.dp)
                                        )
                                    }
                                }
                            },
                            label = {
                                Text(
                                    text = item.title,
                                    fontSize = 11.sp,
                                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                                    color = if (isSelected) ForestGreen else Color.Gray
                                )
                            },
                            colors = NavigationBarItemDefaults.colors(
                                indicatorColor = EmeraldGreen.copy(alpha = 0.15f)
                            )
                        )
                    }
                }
            }
        }
    ) { padding ->
        Box(modifier = Modifier.padding(padding)) {
            when (currentTab) {
                NavItem.CATALOG -> CatalogScreen(
                    uiState = productsState.copy(data = previewProducts),
                    cartItemCount = cartCount,
                    searchQuery = searchQuery,
                    selectedCategory = selectedCategory,
                    onSearchChanged = viewModel::setSearch,
                    onCategorySelected = viewModel::setCategory,
                    onAddToCart = { product ->
                        viewModel.addToCart(product)
                        Toast.makeText(context, "Added ${product.name}", Toast.LENGTH_SHORT).show()
                    },
                    onCartClick = { currentTab = NavItem.CART },
                    onRefresh = viewModel::loadProducts,
                    onSettingsClick = { currentTab = NavItem.SETTINGS },
                    onAdminClick = { openAdminPanel(NavItem.ADMIN) }
                )

                NavItem.CART -> CartScreen(
                    cartItems = cart,
                    waPhoneNumber = waPhone,
                    isOrderLoading = orderResult?.isLoading == true,
                    orderError = orderResult?.error,
                    onBack = { currentTab = NavItem.CATALOG },
                    onIncrease = { viewModel.addToCart(it.product) },
                    onDecrease = { viewModel.removeFromCart(it.product) },
                    onDelete = { viewModel.deleteFromCart(it.product) },
                    onPlaceOrder = { name, isMember, memberId ->
                        viewModel.placeOrder(name, isMember, memberId)
                    },
                    onOrderErrorDismiss = viewModel::clearOrderResult
                )

                NavItem.ADMIN -> AdminScreen(
                    dashboardState = dashboardState,
                    productsState = productsState,
                    ordersState = ordersState,
                    onBack = { currentTab = NavItem.CATALOG },
                    onRefresh = {
                        viewModel.loadProducts()
                        viewModel.loadDashboard()
                    },
                    onUpdateStock = { productId, qty ->
                        viewModel.updateStock(productId, qty) { success ->
                            val msg = if (success) "Stock updated successfully!" else "Update failed"
                            Toast.makeText(context, msg, Toast.LENGTH_SHORT).show()
                        }
                    },
                    onAddProduct = { sku, name, category, retail, member, pv, stock ->
                        viewModel.addProduct(
                            AddProductRequest(
                                sku = sku,
                                name = name,
                                category = category,
                                retailPrice = retail,
                                memberPrice = member,
                                pvPoints = pv,
                                stockQty = stock
                            )
                        ) { success ->
                            val msg = if (success) "Product added to catalog!" else "Failed to add product"
                            Toast.makeText(context, msg, Toast.LENGTH_SHORT).show()
                        }
                    },
                    onLoadOrders = viewModel::loadOrders
                )

                NavItem.SETTINGS -> SettingsScreen(
                    currentServerUrl = serverUrl,
                    currentWaPhone = waPhone,
                    onBack = { currentTab = NavItem.CATALOG },
                    onSaveServerUrl = viewModel::saveServerUrl,
                    onSaveWaPhone = viewModel::setWaPhoneNumber
                )
            }
        }
    }

    if (showPinDialog) {
        AlertDialog(
            onDismissRequest = {
                if (!pinBusy) {
                    showPinDialog = false
                    pendingTab = null
                }
            },
            title = { Text("Shop PIN", fontWeight = FontWeight.Bold) },
            text = {
                Column {
                    Text(
                        "Unlock the admin panel. The PIN is the one set when the " +
                            "stockpoint was installed.",
                        fontSize = 12.sp,
                        color = Color.Gray
                    )
                    Spacer(Modifier.height(10.dp))
                    OutlinedTextField(
                        value = pinInput,
                        onValueChange = {
                            pinInput = it
                            pinError = null
                        },
                        singleLine = true,
                        label = { Text("PIN") },
                        isError = pinError != null,
                        visualTransformation = PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword)
                    )
                    pinError?.let {
                        Spacer(Modifier.height(6.dp))
                        Text(it, color = Color(0xFFD32F2F), fontSize = 12.sp)
                    }
                }
            },
            confirmButton = {
                TextButton(
                    enabled = !pinBusy && pinInput.isNotBlank(),
                    onClick = {
                        pinBusy = true
                        viewModel.login(pinInput) { ok, message ->
                            pinBusy = false
                            if (ok) {
                                showPinDialog = false
                                pinError = null
                                pendingTab?.let { currentTab = it }
                                pendingTab = null
                                Toast.makeText(context, "Admin unlocked", Toast.LENGTH_SHORT).show()
                            } else {
                                pinError = message ?: "Invalid PIN"
                            }
                        }
                    }
                ) {
                    Text(if (pinBusy) "Checking…" else "Unlock", color = ForestGreen, fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                TextButton(onClick = {
                    showPinDialog = false
                    pendingTab = null
                }) { Text("Cancel") }
            }
        )
    }
}

/**
 * One-line truth about the connection, always visible: is this device talking
 * to the server, how many sales are still queued, and which revision it holds.
 */
@Composable
private fun SyncStrip(
    state: SyncState,
    isAdmin: Boolean,
    onSync: () -> Unit,
    onAccount: () -> Unit
) {
    val dotColor = when {
        state.syncing -> AccentGold
        !state.online -> Color(0xFFD32F2F)
        state.pending > 0 -> AccentGold
        else -> EmeraldGreen
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color.White)
            .clickable { onSync() }
            .padding(start = 14.dp, end = 6.dp, top = 2.dp, bottom = 2.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            Modifier
                .size(7.dp)
                .background(dotColor, CircleShape)
        )
        Spacer(Modifier.width(8.dp))
        Text(
            text = state.label,
            fontSize = 11.sp,
            fontWeight = FontWeight.SemiBold,
            color = DarkText,
            modifier = Modifier.weight(1f)
        )
        if (state.serverRev > 0) {
            Text("rev ${state.serverRev}", fontSize = 10.sp, color = Color.Gray)
            Spacer(Modifier.width(6.dp))
        }
        IconButton(onClick = onSync, modifier = Modifier.size(28.dp)) {
            Icon(
                imageVector = if (state.syncing) Icons.Default.Sync else Icons.Default.Refresh,
                contentDescription = "Sync now",
                tint = EmeraldGreen,
                modifier = Modifier.size(16.dp)
            )
        }
        IconButton(onClick = onAccount, modifier = Modifier.size(28.dp)) {
            Icon(
                imageVector = if (isAdmin) Icons.Default.LockOpen else Icons.Default.Lock,
                contentDescription = if (isAdmin) "Sign out" else "Sign in",
                tint = if (isAdmin) EmeraldGreen else Color.Gray,
                modifier = Modifier.size(15.dp)
            )
        }
    }
}
