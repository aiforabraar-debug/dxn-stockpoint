package com.dxn.stockpoint.data.model

import com.google.gson.annotations.SerializedName

/**
 * Request line. Deliberately carries no price: `OrderController::create()`
 * trusts `unit_price` whenever it is numeric, so sending a Kotlin default of
 * 0.0 would silently zero out the line. The server prices every line itself
 * (member vs retail) — the app only sends what the customer actually picked.
 */
data class OrderLineRequest(
    @SerializedName("product_id") val productId: Int,
    val quantity: Int
)

data class PlaceOrderRequest(
    @SerializedName("client_uuid") val clientUuid: String,
    @SerializedName("customer_name") val customerName: String,
    @SerializedName("customer_phone") val customerPhone: String? = null,
    @SerializedName("dxn_member_id") val dxnMemberId: String? = null,
    @SerializedName("is_member") val isMember: Boolean = false,
    @SerializedName("payment_method") val paymentMethod: String = "CASH",
    val discount: Double = 0.0,
    val note: String? = null,
    val source: String = "android",
    val items: List<OrderLineRequest>
)

/** `POST /api/v1/orders` replies `{success, order, duplicate?, warning?}`. */
data class PlaceOrderResponse(
    val success: Boolean = false,
    val order: Order? = null,
    val duplicate: Boolean = false,
    val warning: String? = null,
    /** True when the device could not reach the server and parked the order locally. */
    val queued: Boolean = false
) {
    val orderNumber: String get() = order?.orderNumber ?: ""
    val totalAmount: Double get() = order?.totalAmount ?: 0.0
    val totalPV: Double get() = order?.totalPV ?: 0.0
}

data class OrderLine(
    @SerializedName("product_id") val productId: Int = 0,
    val sku: String = "",
    val name: String = "",
    val quantity: Int = 0,
    @SerializedName("unit_price") val unitPrice: Double = 0.0,
    @SerializedName("unit_pv") val unitPv: Double = 0.0,
    @SerializedName("line_total") val lineTotal: Double = 0.0,
    @SerializedName("line_pv") val linePv: Double = 0.0
)

data class Order(
    val id: Int = 0,
    @SerializedName("client_uuid") val clientUuid: String? = null,
    @SerializedName("order_number") val orderNumber: String = "",
    @SerializedName("customer_name") val customerName: String = "",
    @SerializedName("customer_phone") val customerPhone: String? = null,
    @SerializedName("dxn_member_id") val dxnMemberId: String? = null,
    @SerializedName("is_member") val isMember: Boolean = false,
    val subtotal: Double = 0.0,
    val discount: Double = 0.0,
    @SerializedName("total_amount") val totalAmount: Double = 0.0,
    @SerializedName("total_pv") val totalPV: Double = 0.0,
    val status: String = "",
    @SerializedName("payment_method") val paymentMethod: String = "CASH",
    val note: String? = null,
    val source: String = "",
    @SerializedName("created_at") val createdAt: String = "",
    @SerializedName("updated_at") val updatedAt: String = "",
    val rev: Int = 0,
    @SerializedName("courier_provider") val courierProvider: String? = null,
    @SerializedName("courier_consignment_id") val courierConsignmentId: Int? = null,
    @SerializedName("courier_tracking_code") val courierTrackingCode: String? = null,
    @SerializedName("courier_status") val courierStatus: String? = null,
    @SerializedName("courier_cod_amount") val courierCodAmount: Double? = null,
    @SerializedName("courier_created_at") val courierCreatedAt: String? = null,
    val items: List<OrderLine> = emptyList()
) {
    val isCancelled: Boolean get() = status.equals("CANCELLED", ignoreCase = true)
    val lineCount: Int get() = items.sumOf { it.quantity }
}

data class OrdersResponse(
    val success: Boolean = false,
    val orders: List<Order> = emptyList(),
    val count: Int = 0
)

data class OrderEnvelope(
    val success: Boolean = false,
    val message: String? = null,
    val order: Order? = null
)

data class OrderStatusRequest(val status: String)

data class StockUpdateRequest(
    val productId: Int,
    val newQuantity: Int,
    val reason: String = "stock_take"
)

data class StockAdjustRequest(
    val productId: Int,
    val delta: Int,
    val reason: String = "adjustment"
)

data class TopProduct(
    @SerializedName("product_id") val productId: Int = 0,
    val name: String = "",
    val quantity: Int = 0,
    val revenue: Double = 0.0
)

data class DaySales(
    val day: String = "",
    val orders: Int = 0,
    val revenue: Double = 0.0,
    val pv: Double = 0.0
)

/**
 * Server names are snake_case; the Kotlin names are kept so the existing
 * Compose admin screen (data.totalOrders / data.lowStockProducts) is untouched.
 */
data class DashboardData(
    @SerializedName("total_orders") val totalOrders: Int = 0,
    @SerializedName("total_revenue") val totalRevenue: Double = 0.0,
    @SerializedName("total_pv") val totalPV: Double = 0.0,
    @SerializedName("today_orders") val todayOrders: Int = 0,
    @SerializedName("today_revenue") val todayRevenue: Double = 0.0,
    @SerializedName("today_pv") val todayPV: Double = 0.0,
    @SerializedName("total_products") val totalProducts: Int = 0,
    @SerializedName("stock_units") val stockUnits: Int = 0,
    @SerializedName("stock_value") val stockValue: Double = 0.0,
    @SerializedName("low_stock_count") val lowStockCount: Int = 0,
    @SerializedName("low_stock_products") val lowStockProducts: List<Product> = emptyList(),
    @SerializedName("top_products") val topProducts: List<TopProduct> = emptyList(),
    @SerializedName("recent_orders") val recentOrders: List<Order> = emptyList(),
    @SerializedName("sales_by_day") val salesByDay: List<DaySales> = emptyList()
)

data class DashboardResponse(
    val success: Boolean = false,
    val data: DashboardData = DashboardData()
)

data class GenericResponse(
    val success: Boolean = false,
    val message: String = ""
)

// ── Courier (SteadFast) ──────────────────────────────────────────────────────

data class ShipOrderRequest(
    @SerializedName("recipient_address") val recipientAddress: String,
    @SerializedName("cod_amount") val codAmount: Double = 0.0,
    @SerializedName("item_description") val itemDescription: String? = null,
    @SerializedName("note") val note: String? = null,
    @SerializedName("delivery_type") val deliveryType: Int = 0
)

data class CourierSettings(
    @SerializedName("base_url") val baseUrl: String = "",
    @SerializedName("api_key") val apiKey: String = "",
    @SerializedName("secret_key") val secretKey: String = "",
    @SerializedName("webhook_token") val webhookToken: String = "",
    val configured: Boolean = false
)

data class CourierSettingsResponse(
    val success: Boolean = false,
    val settings: CourierSettings? = null
)

data class CourierBalanceResponse(
    val success: Boolean = false,
    val balance: Map<String, Any?>? = null
)


// ── Auth ────────────────────────────────────────────────────────────────────

data class LoginRequest(val pin: String)

data class AuthResponse(
    val success: Boolean = false,
    val token: String = "",
    @SerializedName("expires_at") val expiresAt: String = "",
    val role: String = "",
    val ttl: Long = 0
)

data class MeResponse(
    val success: Boolean = false,
    val role: String = ""
)

data class ChangePinRequest(@SerializedName("new_pin") val newPin: String)

// ── Sync & health ───────────────────────────────────────────────────────────

data class SyncResponse(
    val success: Boolean = false,
    @SerializedName("server_rev") val serverRev: Int = 0,
    val since: Int = 0,
    val scope: String = "public",
    val products: List<Product> = emptyList(),
    val orders: List<Order> = emptyList(),
    val settings: Map<String, Any?>? = null,
    val truncated: Boolean = false,
    @SerializedName("server_time") val serverTime: String = ""
)

data class SyncStatusResponse(
    val success: Boolean = false,
    @SerializedName("server_rev") val serverRev: Int = 0,
    @SerializedName("server_time") val serverTime: String = "",
    val scope: String = "public"
)

data class HealthDatabase(
    val ok: Boolean = false,
    val error: String? = null,
    val counts: Map<String, Int> = emptyMap()
)

data class HealthResponse(
    val success: Boolean = false,
    val status: String = "",
    val version: String = "",
    val driver: String = "",
    val installed: Boolean = false,
    @SerializedName("server_rev") val serverRev: Int = 0,
    @SerializedName("server_time") val serverTime: String = "",
    val database: HealthDatabase = HealthDatabase()
)

/** `GET/PUT /api/v1/settings` — values arrive as strings or numbers. */
data class SettingsResponse(
    val success: Boolean = false,
    val settings: Map<String, Any?>? = null,
    val public: Map<String, Any?>? = null,
    val rev: Int = 0
)
