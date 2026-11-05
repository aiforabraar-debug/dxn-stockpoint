package com.dxn.stockpoint.data.repository

import com.dxn.stockpoint.data.api.RetrofitClient
import com.dxn.stockpoint.data.local.CachedState
import com.dxn.stockpoint.data.local.JsonCache
import com.dxn.stockpoint.data.local.OutboxEntry
import com.dxn.stockpoint.data.model.*
import com.google.gson.Gson
import com.google.gson.JsonObject
import retrofit2.HttpException
import java.io.IOException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import java.util.UUID

sealed class Result<out T> {
    data class Success<T>(val data: T) : Result<T>()
    data class Error(
        val message: String,
        val cause: Throwable? = null,
        /** True when the server was never reached — safe to retry later. */
        val isNetwork: Boolean = false,
        val code: String? = null
    ) : Result<Nothing>()
}

/**
 * Cache-first read, push-when-possible writes. Every mutation that matters for
 * money (creating an order) lands in the outbox when the network is down and is
 * replayed with the same `client_uuid`, so the server de-duplicates it.
 */
class StockpointRepository {

    private val api get() = RetrofitClient.apiService
    private val gson = Gson()

    // ── Cache ───────────────────────────────────────────────────────────────

    fun cachedState(): CachedState = JsonCache.loadState()

    fun cachedProducts(): List<Product> = cachedState().products

    fun saveProducts(products: List<Product>, rev: Int): List<Product> {
        val state = cachedState()
        val merged = mergeById(state.products, products)
        JsonCache.saveState(state.copy(products = merged, rev = maxOf(rev, state.rev)))
        return merged
    }

    fun saveOrders(orders: List<Order>, rev: Int): List<Order> {
        val state = cachedState()
        val merged = mergeById(state.orders, orders).sortedByDescending { it.id }
        JsonCache.saveState(state.copy(orders = merged, rev = maxOf(rev, state.rev)))
        return merged
    }

    private fun <T> mergeById(existing: List<T>, incoming: List<T>): List<T> where T : Any {
        val keyOf: (T) -> Int = { item ->
            when (item) {
                is Product -> item.id
                is Order -> item.id
                else -> 0
            }
        }
        val map = LinkedHashMap<Int, T>()
        existing.forEach { map[keyOf(it)] = it }
        incoming.forEach { map[keyOf(it)] = it }
        return map.values.toList()
    }

    // ── Auth ────────────────────────────────────────────────────────────────

    suspend fun login(pin: String): Result<AuthResponse> = try {
        val response = api.login(LoginRequest(pin))
        if (response.success && response.token.isNotBlank()) {
            RetrofitClient.setToken(response.token)
            Result.Success(response)
        } else {
            Result.Error("Sign in failed", code = "invalid_credentials")
        }
    } catch (e: Throwable) {
        failure(e)
    }

    suspend fun verifySession(): Result<MeResponse> = try {
        Result.Success(api.me())
    } catch (e: Throwable) {
        failure(e)
    }

    // ── Catalog ─────────────────────────────────────────────────────────────

    suspend fun getProducts(): Result<List<Product>> = try {
        val includeInactive = if (RetrofitClient.hasToken()) 1 else 0
        val response = api.getProducts(includeInactive)
        if (response.success) Result.Success(saveProducts(response.products, currentRev()))
        else Result.Error("Server rejected the product list")
    } catch (e: Throwable) {
        val cached = cachedProducts()
        if (cached.isNotEmpty() && isOffline(e)) Result.Success(cached) else failure(e)
    }

    suspend fun addProduct(request: AddProductRequest): Result<Product?> = try {
        val response = api.addProduct(request)
        response.product?.let { saveProducts(listOf(it), currentRev()) }
        Result.Success(response.product)
    } catch (e: Throwable) {
        failure(e)
    }

    suspend fun updateStock(productId: Int, newQty: Int, reason: String = "stock_take"): Result<Product?> = try {
        val response = api.updateStock(StockUpdateRequest(productId, newQty, reason))
        response.product?.let { saveProducts(listOf(it), currentRev()) }
        Result.Success(response.product)
    } catch (e: Throwable) {
        failure(e)
    }

    suspend fun movements(limit: Int = 100): Result<List<StockMovement>> = try {
        Result.Success(api.movements(limit).movements)
    } catch (e: Throwable) {
        failure(e)
    }

    // ── Orders ──────────────────────────────────────────────────────────────

    suspend fun getOrders(): Result<List<Order>> = try {
        val response = api.getOrders(100)
        if (response.success) Result.Success(saveOrders(response.orders, currentRev()))
        else Result.Error("Server rejected the order list")
    } catch (e: Throwable) {
        val cached = cachedState().orders
        if (cached.isNotEmpty() && isOffline(e)) Result.Success(cached) else failure(e)
    }

    suspend fun setOrderStatus(orderId: Int, status: String): Result<Order?> = try {
        val response = api.setOrderStatus(orderId, OrderStatusRequest(status))
        response.order?.let { saveOrders(listOf(it), currentRev()) }
        Result.Success(response.order)
    } catch (e: Throwable) {
        failure(e)
    }

    /**
     * Sends the order now, or parks it in the outbox when the server is
     * unreachable. Stock is optimistically decremented by the caller so the
     * catalog never offers units the customer already bought.
     */
    suspend fun placeOrder(request: PlaceOrderRequest): Result<PlaceOrderResponse> = try {
        val response = api.placeOrder(request)
        response.order?.let { order ->
            JsonCache.removeOutbox(request.clientUuid)
            saveOrders(listOf(order), currentRev())
        }
        Result.Success(response)
    } catch (e: Throwable) {
        if (isOffline(e)) {
            enqueue(request)
            Result.Success(
                PlaceOrderResponse(
                    success = true,
                    order = Order(
                        orderNumber = "QUEUED",
                        customerName = request.customerName,
                        totalAmount = 0.0,
                        totalPV = 0.0,
                        status = "PENDING_SYNC",
                        source = request.source,
                        clientUuid = request.clientUuid
                    ),
                    queued = true
                )
            )
        } else {
            failure(e)
        }
    }

    private fun enqueue(request: PlaceOrderRequest) {
        val existing = JsonCache.loadOutbox().any { it.id == request.clientUuid }
        if (existing) return
        JsonCache.appendOutbox(
            OutboxEntry(
                id = request.clientUuid,
                payload = request,
                createdAt = System.currentTimeMillis(),
                status = "queued"
            )
        )
    }

    fun outbox(): List<OutboxEntry> = JsonCache.loadOutbox()

    fun discardOutbox(id: String) {
        JsonCache.removeOutbox(id)
    }

    /** Replays queued orders oldest-first. Returns how many the server accepted. */
    suspend fun flushOutbox(): Int {
        val entries = JsonCache.loadOutbox().filter { it.status != "sending" }
        var sent = 0
        for (entry in entries) {
            val payload = entry.payload
            if (payload == null) {
                JsonCache.removeOutbox(entry.id)
                continue
            }
            try {
                JsonCache.updateOutbox(entry.id) { it.copy(status = "sending") }
                api.placeOrder(payload)
                JsonCache.removeOutbox(entry.id)
                sent++
            } catch (e: Throwable) {
                val permanent = e is HttpException && e.code() in listOf(400, 403, 404, 409, 422)
                JsonCache.updateOutbox(entry.id) {
                    it.copy(
                        status = if (permanent) "failed" else "queued",
                        attempts = it.attempts + 1,
                        error = messageOf(e)
                    )
                }
                if (!permanent && isOffline(e)) break // still offline: stop hammering
            }
        }
        return sent
    }

    // ── Dashboard & settings ────────────────────────────────────────────────

    suspend fun getDashboard(): Result<DashboardData> = try {
        val response = api.getDashboard()
        if (response.success) {
            saveOrders(response.data.recentOrders, currentRev())
            Result.Success(response.data)
        } else {
            Result.Error("Server rejected the dashboard call")
        }
    } catch (e: Throwable) {
        failure(e)
    }

    suspend fun getSettings(): Result<Map<String, String>> = try {
        val response = api.getSettings()
        Result.Success(flatten(response.settings ?: response.public))
    } catch (e: Throwable) {
        failure(e)
    }

    suspend fun health(): Result<HealthResponse> = try {
        Result.Success(api.health())
    } catch (e: Throwable) {
        failure(e)
    }

    private fun flatten(source: Map<String, Any?>?): Map<String, String> {
        if (source == null) return emptyMap()
        val out = LinkedHashMap<String, String>()
        source.forEach { (key, value) ->
            if (key == "admin_pin_hash") return@forEach
            out[key] = when (value) {
                null -> ""
                is Double -> if (value % 1.0 == 0.0) value.toLong().toString() else value.toString()
                else -> value.toString()
            }
        }
        return out
    }

    // ── Sync ────────────────────────────────────────────────────────────────

    /**
     * Applies one incremental page. The caller keeps calling while [SyncResponse.truncated]
     * is true so a large backlog still lands in full.
     */
    suspend fun sync(since: Int): Result<SyncResponse> = try {
        val response = api.sync(since)
        if (response.success) {
            val state = cachedState()
            JsonCache.saveState(
                state.copy(
                    rev = maxOf(state.rev, response.serverRev),
                    products = if (response.products.isEmpty()) state.products
                    else mergeById(state.products, response.products),
                    orders = if (response.orders.isEmpty()) state.orders
                    else mergeById(state.orders, response.orders).sortedByDescending { it.id }
                )
            )
            Result.Success(response)
        } else {
            Result.Error("Server rejected the sync call")
        }
    } catch (e: Throwable) {
        failure(e)
    }

    fun currentRev(): Int = cachedState().rev

    fun pendingCount(): Int = JsonCache.loadOutbox().count { it.status != "sending" }

    fun resetDevice() {
        JsonCache.clear()
        RetrofitClient.clearToken()
    }

    // ── Error plumbing ──────────────────────────────────────────────────────

    private fun isOffline(e: Throwable): Boolean =
        e is IOException || e is UnknownHostException || e is SocketTimeoutException

    private fun failure(e: Throwable): Result.Error {
        if (isOffline(e)) {
            return Result.Error(
                message = "Cannot reach the server. Working offline.",
                cause = e,
                isNetwork = true,
                code = "offline"
            )
        }
        return Result.Error(messageOf(e), e, code = (e as? HttpException)?.let { "http_${it.code()}" })
    }

    private fun messageOf(e: Throwable): String {
        if (e !is HttpException) return e.message ?: "Unexpected error"
        val raw = runCatching { e.response()?.errorBody()?.string() }.getOrNull()
        if (!raw.isNullOrBlank()) {
            runCatching {
                val json: JsonObject = gson.fromJson(raw, JsonObject::class.java)
                json.get("message")?.takeIf { !it.isJsonNull }?.asString?.let { return it }
                json.getAsJsonObject("error")?.get("message")?.asString?.let { return it }
            }
        }
        return when (e.code()) {
            401, 403 -> "Not authorised. Sign in with the shop PIN."
            404 -> "Not found on the server."
            409 -> "Not enough stock on the server."
            422 -> "The server rejected some of the values."
            else -> "Server error (${e.code()})"
        }
    }
}

/** Stable id used for the idempotent order push. */
fun newClientUuid(): String = UUID.randomUUID().toString()
