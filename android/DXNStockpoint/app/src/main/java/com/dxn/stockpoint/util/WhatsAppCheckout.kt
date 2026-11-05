package com.dxn.stockpoint.util

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import com.dxn.stockpoint.data.model.CartItem
import java.net.URLEncoder

fun sendOrderToWhatsApp(
    context: Context,
    phoneNumber: String,
    customerName: String,
    dxnMemberId: String?,
    cartItems: List<CartItem>,
    isMember: Boolean,
    totalAmount: Double
) {
    val itemsListText = cartItems.joinToString("\n") { item ->
        val price = if (isMember) item.product.memberPrice else item.product.retailPrice
        "- ${item.product.name} x${item.quantity} = BDT ${"%.2f".format(price * item.quantity)}"
    }

    val memberText = if (!dxnMemberId.isNullOrBlank()) "DXN Member | ID: $dxnMemberId" else "Non-Member / Guest"
    val priceType = if (isMember) "Member Price" else "Retail Price"

    val message = """
🛒 *DXN STOCKPOINT ORDER*
━━━━━━━━━━━━━━━━━━━━━━━━
👤 *Customer:* $customerName
🆔 *Type:* $memberText
💳 *Pricing:* $priceType
━━━━━━━━━━━━━━━━━━━━━━━━
*Order Items:*
$itemsListText
━━━━━━━━━━━━━━━━━━━━━━━━
💰 *Total Amount:* BDT ${"%.2f".format(totalAmount)}

Please confirm availability and shipment details. Thank you! 🙏
    """.trimIndent()

    try {
        val encodedMessage = URLEncoder.encode(message, "UTF-8")
        val uri = Uri.parse("https://api.whatsapp.com/send?phone=$phoneNumber&text=$encodedMessage")
        val intent = Intent(Intent.ACTION_VIEW, uri)
        intent.setPackage("com.whatsapp")
        if (intent.resolveActivity(context.packageManager) != null) {
            context.startActivity(intent)
        } else {
            // Fallback: open in browser if WhatsApp not installed
            val fallbackIntent = Intent(Intent.ACTION_VIEW, uri)
            context.startActivity(fallbackIntent)
        }
    } catch (e: Exception) {
        Toast.makeText(context, "Error opening WhatsApp: ${e.message}", Toast.LENGTH_LONG).show()
        e.printStackTrace()
    }
}

