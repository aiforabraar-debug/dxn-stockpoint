package com.dxn.stockpoint.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.dxn.stockpoint.data.api.RetrofitClient
import com.dxn.stockpoint.data.local.Prefs
import com.dxn.stockpoint.data.model.*
import com.dxn.stockpoint.data.repository.Result
import com.dxn.stockpoint.data.repository.StockpointRepository
import com.dxn.stockpoint.data.repository.newClientUuid
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

data class UiState<T>(
    val data: T? = null,
    val isLoading: Boolean = false,
    val error: String? = null
)

data class SyncState(
    val online: Boolean = true,
    val syncing: Boolean = false,
    val lastSyncAt: Long = 0L,
    val pending: Int = 0,
    val serverRev: Int = 0,
    val error: String? = null
) {
    val label: String
        get() = when {
            syncing -> "Syncing…"
            !online && pending > 0 -> "Offline · $pending queued"
            !online -> "Offline"
            pending > 0 -> "$pending queued"
            lastSyncAt > 0L -> "Live"
            else -> "Not synced yet"
        }
}

class StockpointViewModel(app: Application) : AndroidViewModel(app) {

    private val repository = StockpointRepository()
    private val gson = Gson()

    // ── Products ─────────────────────────────────────────────────────────────
    private val _products = MutableStateFlow(UiState<List<Product>>(isLoading = true))
    val products: StateFlow<UiState<List<Product>>> = _products.asStateFlow()

    // ── Cart ─────────────────────────────────────────────────────────────────
    private val _cart = MutableStateFlow<List<CartItem>>(emptyList())
    val cart: StateFlow<List<CartItem>> = _cart.asStateFlow()

    val cartItemCount: Int get() = _cart.value.sumOf { it.quantity }

    // ── Orders ────────────────────────────────────────────────────────────────
    private val _orders = MutableStateFlow(UiState<List<Order>>())
    val orders: StateFlow<UiState<List<Order>>> = _orders.asStateFlow()

    // ── Dashboard ─────────────────────────────────────────────────────────────
    private val _dashboard = MutableStateFlow(UiState<DashboardData>(isLoading = true))
    val dashboard: StateFlow<UiState<DashboardData>> = _dashboard.asStateFlow()

    // ── Order Result ──────────────────────────────────────────────────────────
    private val _orderResult = MutableStateFlow<UiState<PlaceOrderResponse>?>(null)
    val orderResult: StateFlow<UiState<PlaceOrderResponse>?> = _orderResult.asStateFlow()

    // ── Sync / session ────────────────────────────────────────────────────────
    private val _sync = MutableStateFlow(SyncState())
    val syncState: StateFlow<SyncState> = _sync.asStateFlow()

    private val _isAdmin = MutableStateFlow(Prefs.isAdmin)
    val isAdmin: StateFlow<Boolean> = _isAdmin.asStateFlow()

    // ── Search & Filter ───────────────────────────────────────────────────────
    private val _searchQuery = MutableStateFlow("")
    val searchQuery: StateFlow<String> = _searchQuery.asStateFlow()

    private val _selectedCategory = MutableStateFlow("All")
    val selectedCategory: StateFlow<String> = _selectedCategory.asStateFlow()

    // ── Settings ──────────────────────────────────────────────────────────────
    private val _serverUrl = MutableStateFlow(RetrofitClient.getBaseUrl())
    val serverUrl: StateFlow<String> = _serverUrl.asStateFlow()

    private val _waPhoneNumber = MutableStateFlow(Prefs.waPhone)
    val waPhoneNumber: StateFlow<String> = _waPhoneNumber.asStateFlow()

    init {
        val cached = repository.cachedProducts()
        if (cached.isNotEmpty()) _products.value = UiState(data = cached)
        val cachedOrders = repository.cachedState().orders
        if (cachedOrders.isNotEmpty()) _orders.value = UiState(data = cachedOrders)

        restoreCart()
        _sync.value = SyncState(
            lastSyncAt = Prefs.lastRev.takeIf { it > 0 }?.let { System.currentTimeMillis() } ?: 0L,
            pending = repository.pendingCount(),
            serverRev = repository.currentRev()
        )

        loadProducts()
        startSyncLoop()
    }

    // ── Product Actions ───────────────────────────────────────────────────────

    fun loadProducts() {
        viewModelScope.launch {
            val cached = repository.cachedProducts()
            _products.value = UiState(data = cached.takeIf { it.isNotEmpty() }, isLoading = true)
            when (val r = repository.getProducts()) {
                is Result.Success -> _products.value = UiState(data = r.data)
                is Result.Error -> _products.value = UiState(
                    data = cached.takeIf { it.isNotEmpty() },
                    error = if (cached.isEmpty()) r.message else null
                )
            }
        }
    }

    fun setSearch(query: String) { _searchQuery.value = query }

    fun setCategory(cat: String) { _selectedCategory.value = cat }

    fun filteredProducts(): List<Product> {
        val all = _products.value.data ?: return emptyList()
        val q = _searchQuery.value.trim().lowercase()
        val cat = _selectedCategory.value
        return all.asSequence()
            .filter { it.isActiveBoolean }
            .filter { cat == "All" || it.category.equals(cat, ignoreCase = true) }
            .filter {
                q.isEmpty() ||
                    it.name.lowercase().contains(q) ||
                    it.category.lowercase().contains(q) ||
                    it.sku.lowercase().contains(q)
            }
            .sortedWith(compareBy({ it.isOutOfStock }, { it.name }))
            .toList()
    }

    /** Categories for the filter chips, derived from live stock. */
    fun categories(): List<String> =
        listOf("All") + (_products.value.data ?: emptyList())
            .filter { it.isActiveBoolean }
            .map { it.category }
            .distinct()
            .sorted()

    // ── Cart Actions ──────────────────────────────────────────────────────────

    fun addToCart(product: Product) {
        val current = _cart.value.toMutableList()
        val existing = current.find { it.product.id == product.id }
        val limit = product.stockQty
        if (existing != null) {
            if (existing.quantity >= limit) return
            val idx = current.indexOf(existing)
            current[idx] = CartItem(product, existing.quantity + 1)
        } else {
            if (limit <= 0) return
            current.add(CartItem(product, 1))
        }
        setCart(current)
    }

    fun removeFromCart(product: Product) {
        val current = _cart.value.toMutableList()
        val existing = current.find { it.product.id == product.id } ?: return
        if (existing.quantity > 1) {
            val idx = current.indexOf(existing)
            current[idx] = CartItem(product, existing.quantity - 1)
        } else {
            current.remove(existing)
        }
        setCart(current)
    }

    fun deleteFromCart(product: Product) {
        setCart(_cart.value.filterNot { it.product.id == product.id })
    }

    fun clearCart() = setCart(emptyList())

    fun cartTotal(isMember: Boolean): Double =
        _cart.value.sumOf { if (isMember) it.subtotalMember else it.subtotalRetail }

    fun cartTotalPV(): Double = _cart.value.sumOf { it.subtotalPV }

    private fun setCart(items: List<CartItem>) {
        _cart.value = items
        persistCart(items)
    }

    private fun persistCart(items: List<CartItem>) {
        runCatching { Prefs.cartSnapshot = gson.toJson(items) }
    }

    private fun restoreCart() {
        runCatching {
            val type = object : TypeToken<List<CartItem>>() {}.type
            val raw = Prefs.cartSnapshot
            val restored: List<CartItem>? = gson.fromJson(raw, type)
            if (!restored.isNullOrEmpty()) _cart.value = restored
        }
    }

    // ── Order Actions ─────────────────────────────────────────────────────────

    fun placeOrder(customerName: String, isMember: Boolean, dxnMemberId: String?) {
        val items = _cart.value
        if (items.isEmpty()) {
            _orderResult.value = UiState(error = "Your cart is empty")
            return
        }
        viewModelScope.launch {
            _orderResult.value = UiState(isLoading = true)
            val request = PlaceOrderRequest(
                clientUuid = newClientUuid(),
                customerName = customerName.trim(),
                dxnMemberId = dxnMemberId?.trim()?.takeIf { it.isNotEmpty() },
                isMember = isMember,
                items = items.map { OrderLineRequest(it.product.id, it.quantity) }
            )
            when (val r = repository.placeOrder(request)) {
                is Result.Success -> {
                    _orderResult.value = UiState(data = r.data)
                    decreaseLocalStock(items)
                    clearCart()
                    _sync.update { it.copy(pending = repository.pendingCount()) }
                    if (!r.data.queued) refreshQuietly()
                }
                is Result.Error -> _orderResult.value = UiState(error = r.message)
            }
        }
    }

    fun clearOrderResult() { _orderResult.value = null }

    /** Optimistic stock write so the catalog agrees with what was just sold. */
    private fun decreaseLocalStock(items: List<CartItem>) {
        val current = _products.value.data ?: return
        val sold = items.associate { it.product.id to it.quantity }
        val next = current.map { product ->
            val qty = sold[product.id] ?: return@map product
            product.copy(stockQty = (product.stockQty - qty).coerceAtLeast(0))
        }
        _products.value = _products.value.copy(data = next)
        // Keep the on-disk cache in step, otherwise a restart before the next
        // sync would advertise stock this device already sold.
        runCatching { repository.saveProducts(next, repository.currentRev()) }
    }

    fun loadOrders() {
        viewModelScope.launch {
            if (!_isAdmin.value) {
                _orders.value = UiState(error = "Sign in with the shop PIN to see orders")
                return@launch
            }
            val cached = repository.cachedState().orders
            _orders.value = UiState(data = cached.takeIf { it.isNotEmpty() }, isLoading = true)
            when (val r = repository.getOrders()) {
                is Result.Success -> _orders.value = UiState(data = r.data.sortedByDescending { it.id })
                is Result.Error -> _orders.value = UiState(
                    data = cached.takeIf { it.isNotEmpty() },
                    error = if (cached.isEmpty()) r.message else null
                )
            }
        }
    }

    fun setOrderStatus(orderId: Int, status: String, onDone: (Boolean) -> Unit) {
        viewModelScope.launch {
            when (repository.setOrderStatus(orderId, status)) {
                is Result.Success -> {
                    loadOrders()
                    loadDashboard()
                    onDone(true)
                }
                is Result.Error -> onDone(false)
            }
        }
    }

    // ── Dashboard Actions ─────────────────────────────────────────────────────

    fun loadDashboard() {
        viewModelScope.launch {
            if (!_isAdmin.value) {
                _dashboard.value = UiState(error = "Sign in with the shop PIN")
                return@launch
            }
            _dashboard.value = UiState(data = _dashboard.value.data, isLoading = true)
            when (val r = repository.getDashboard()) {
                is Result.Success -> _dashboard.value = UiState(data = r.data)
                is Result.Error -> _dashboard.value = UiState(
                    data = _dashboard.value.data,
                    error = r.message
                )
            }
        }
    }

    fun updateStock(productId: Int, qty: Int, onDone: (Boolean) -> Unit) {
        viewModelScope.launch {
            when (repository.updateStock(productId, qty)) {
                is Result.Success -> {
                    onDone(true)
                    loadProducts()
                    loadDashboard()
                }
                is Result.Error -> onDone(false)
            }
        }
    }

    fun adjustStock(productId: Int, delta: Int, onDone: (Boolean) -> Unit) {
        viewModelScope.launch {
            val product = _products.value.data?.find { it.id == productId }
            val target = ((product?.stockQty ?: 0) + delta).coerceAtLeast(0)
            when (repository.updateStock(productId, target, "adjustment")) {
                is Result.Success -> {
                    onDone(true)
                    loadProducts()
                    loadDashboard()
                }
                is Result.Error -> onDone(false)
            }
        }
    }

    fun addProduct(request: AddProductRequest, onDone: (Boolean) -> Unit) {
        viewModelScope.launch {
            when (repository.addProduct(request)) {
                is Result.Success -> {
                    onDone(true)
                    loadProducts()
                    loadDashboard()
                }
                is Result.Error -> onDone(false)
            }
        }
    }

    // ── Auth ──────────────────────────────────────────────────────────────────

    fun login(pin: String, onDone: (Boolean, String?) -> Unit = { _, _ -> }) {
        viewModelScope.launch {
            when (val r = repository.login(pin)) {
                is Result.Success -> {
                    _isAdmin.value = true
                    onDone(true, null)
                    syncNow()
                    loadDashboard()
                    loadOrders()
                }
                is Result.Error -> onDone(false, r.message)
            }
        }
    }

    fun logout() {
        RetrofitClient.clearToken()
        _isAdmin.value = false
        _dashboard.value = UiState()
        _orders.value = UiState()
    }

    // ── Sync ──────────────────────────────────────────────────────────────────

    private fun startSyncLoop() {
        viewModelScope.launch {
            var first = true
            while (isActive) {
                delay(if (first) 1_200L else 20_000L)
                first = false
                syncNow(quiet = true)
            }
        }
    }

    /**
     * Push the outbox, then pull every page the server still has for us.
     * `truncated` means "more than 500 rows changed" — keep going.
     */
    fun syncNow(quiet: Boolean = false) {
        if (_sync.value.syncing) return
        viewModelScope.launch {
            _sync.update { it.copy(syncing = true, error = if (quiet) it.error else null) }

            val sent = runCatching { repository.flushOutbox() }.getOrDefault(0)

            var cursor = repository.currentRev()
            var rounds = 0
            var newOrders = false
            var error: String? = null
            var networkDown = false

            while (rounds++ < 12) {
                val before = cursor
                when (val r = repository.sync(cursor)) {
                    is Result.Success -> {
                        val page = r.data
                        newOrders = newOrders || page.orders.isNotEmpty()
                        if (page.products.isNotEmpty()) {
                            _products.value = _products.value.copy(data = repository.cachedProducts())
                        }
                        if (!page.truncated || page.serverRev <= before) {
                            cursor = maxOf(cursor, page.serverRev)
                            break
                        }
                        cursor = page.serverRev
                    }
                    is Result.Error -> {
                        error = r.message
                        networkDown = r.isNetwork
                        break
                    }
                }
            }

            val rev = repository.currentRev()
            if (rev > 0) Prefs.lastRev = rev

            if (newOrders) {
                _orders.value = _orders.value.copy(data = repository.cachedState().orders)
                if (_isAdmin.value) loadDashboard()
            }

            _sync.update {
                it.copy(
                    syncing = false,
                    online = !networkDown,
                    lastSyncAt = if (error == null) System.currentTimeMillis() else it.lastSyncAt,
                    pending = repository.pendingCount(),
                    serverRev = rev,
                    error = error
                )
            }

            if (sent > 0 || newOrders) loadProductsIfStale()
        }
    }

    private fun loadProductsIfStale() {
        if ((_products.value.data ?: emptyList()).isEmpty()) loadProducts()
    }

    fun retryQueue() {
        viewModelScope.launch {
            runCatching { repository.flushOutbox() }
            _sync.update { it.copy(pending = repository.pendingCount()) }
            syncNow(quiet = true)
        }
    }

    // ── Settings ──────────────────────────────────────────────────────────────

    fun saveServerUrl(url: String) {
        RetrofitClient.setBaseUrl(url)
        _serverUrl.value = RetrofitClient.getBaseUrl()
        Prefs.lastRev = 0
        loadProducts()
        syncNow()
    }

    fun setWaPhoneNumber(phone: String) {
        _waPhoneNumber.value = phone
        Prefs.waPhone = phone
    }

    fun resetDevice() {
        repository.resetDevice()
        clearCart()
        _products.value = UiState()
        _orders.value = UiState()
        _dashboard.value = UiState()
        _isAdmin.value = false
        _sync.value = SyncState()
    }

    private fun refreshQuietly() {
        viewModelScope.launch {
            runCatching { repository.getOrders() }
            if (_isAdmin.value) runCatching { repository.getDashboard() }
        }
    }
}
