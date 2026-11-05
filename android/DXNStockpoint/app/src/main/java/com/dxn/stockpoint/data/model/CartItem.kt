package com.dxn.stockpoint.data.model

data class CartItem(
    val product: Product,
    var quantity: Int
) {
    val subtotalRetail: Double get() = product.retailPrice * quantity
    val subtotalMember: Double get() = product.memberPrice * quantity
    val subtotalPV: Double get() = product.pvPoints * quantity
}
