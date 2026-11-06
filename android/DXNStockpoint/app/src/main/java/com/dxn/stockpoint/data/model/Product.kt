package com.dxn.stockpoint.data.model

import com.google.gson.annotations.SerializedName

/**
 * Mirrors `Store::mapProduct()` in the PHP API. Every field except `id` and
 * `rev` has a default so a cached row from an older build still deserialises.
 */
data class Product(
    val id: Int = 0,
    val sku: String = "",
    val name: String = "",
    val category: String = "General",
    val description: String? = null,
    @SerializedName("retail_price") val retailPrice: Double = 0.0,
    @SerializedName("member_price") val memberPrice: Double = 0.0,
    @SerializedName("pv_points") val pvPoints: Double = 0.0,
    @SerializedName("stock_qty") val stockQty: Int = 0,
    @SerializedName("low_stock_at") val lowStockAt: Int = 5,
    @SerializedName("image_url") val imageUrl: String? = null,
    @SerializedName("is_active") val isActive: Int = 1,
    @SerializedName("created_at") val createdAt: String = "",
    @SerializedName("updated_at") val updatedAt: String = "",
    val rev: Int = 0
) {
    val isLowStock: Boolean get() = stockQty <= lowStockAt
    val isOutOfStock: Boolean get() = stockQty <= 0
    /** Convenience: 1 means active, 0 means archived. */
    val isActiveBoolean: Boolean get() = isActive == 1

    /** Price shown to the caller for a given customer tier. */
    fun price(isMember: Boolean): Double = if (isMember) memberPrice else retailPrice
}

data class ProductResponse(
    val success: Boolean = false,
    val products: List<Product> = emptyList(),
    val categories: List<String> = emptyList(),
    val count: Int = 0
)

data class ProductEnvelope(
    val success: Boolean = false,
    val message: String? = null,
    val product: Product? = null,
    @SerializedName("stock_qty") val stockQty: Int? = null
)

data class AddProductRequest(
    val sku: String,
    val name: String,
    val category: String,
    @SerializedName("retail_price") val retailPrice: Double,
    @SerializedName("member_price") val memberPrice: Double,
    @SerializedName("pv_points") val pvPoints: Double,
    @SerializedName("stock_qty") val stockQty: Int,
    val description: String? = null,
    @SerializedName("low_stock_at") val lowStockAt: Int? = null
)

/** One row from `GET /api/v1/stock/movements`. */
data class StockMovement(
    val id: Int = 0,
    @SerializedName("product_id") val productId: Int = 0,
    @SerializedName("product_name") val productName: String = "",
    @SerializedName("product_sku") val productSku: String = "",
    val delta: Int = 0,
    @SerializedName("quantity_after") val quantityAfter: Int = 0,
    val reason: String = "",
    @SerializedName("order_id") val orderId: Int? = null,
    @SerializedName("created_at") val createdAt: String = ""
)

data class MovementsResponse(
    val success: Boolean = false,
    val movements: List<StockMovement> = emptyList()
)
