package com.dxn.stockpoint.ui.components

import androidx.annotation.DrawableRes
import com.dxn.stockpoint.R

/**
 * Bundled product photography for the seeded DXN catalogue. Keeping the
 * photos inside the APK means the catalogue looks right on the very first run
 * and stays usable with no connection; remote `image_url` values are used for
 * products the shopkeeper adds later.
 */
object ProductArtwork {

    @DrawableRes
    fun forSku(sku: String?): Int? = when (sku?.trim()?.uppercase()) {
        "DXN-SOAP-GANO" -> R.drawable.p_dxn_soap_gano
        "DXN-NEEM-BAR-1" -> R.drawable.p_dxn_neem_bar_1
        "DXN-NEEM-BAR-3" -> R.drawable.p_dxn_neem_bar_3
        "DXN-SHAMPOO-GANO" -> R.drawable.p_dxn_shampoo_gano
        "DXN-NEEM-FACEWASH" -> R.drawable.p_dxn_neem_facewash
        "DXN-PAPAYA-SCRUB" -> R.drawable.p_dxn_papaya_scrub
        "DXN-ALOE-SCRUB" -> R.drawable.p_dxn_aloe_scrub
        "DXN-ALOE-CLEANSING-JELLY" -> R.drawable.p_dxn_aloe_cleansing_jelly
        "DXN-TOOTHPASTE-120" -> R.drawable.p_dxn_toothpaste_120
        "DXN-TOOTHPASTE-50" -> R.drawable.p_dxn_toothpaste_50
        "DXN-TOOTHPASTE-IND-150" -> R.drawable.p_dxn_toothpaste_ind_150
        "DXN-TOOTHPASTE-IND-75" -> R.drawable.p_dxn_toothpaste_ind_75
        "DXN-TALCUM" -> R.drawable.p_dxn_talcum
        "DXN-SUNSCREEN-100" -> R.drawable.p_dxn_sunscreen_100
        "DXN-BODY-LOTION" -> R.drawable.p_dxn_body_lotion
        "DXN-BODY-SCRUB-200" -> R.drawable.p_dxn_body_scrub_200
        "DXN-HAIR-OIL-100" -> R.drawable.p_dxn_hair_oil_100
        "DXN-RISHI-GANO-TEA-200" -> R.drawable.p_dxn_rishi_gano_tea_200
        "DXN-MASALA-TEA-100" -> R.drawable.p_dxn_masala_tea_100
        "DXN-LZC-BLACK-20" -> R.drawable.p_dxn_lzc_black_20
        "DXN-LZC-3IN1-20" -> R.drawable.p_dxn_lzc_3in1_20
        "DXN-LZC-LITE-20" -> R.drawable.p_dxn_lzc_lite_20
        "DXN-WHITE-COFFEE-20" -> R.drawable.p_dxn_white_coffee_20
        "DXN-ZHI-MOCHA-20" -> R.drawable.p_dxn_zhi_mocha_20
        "DXN-EU-CAFE-20" -> R.drawable.p_dxn_eu_cafe_20
        "DXN-VITA-CAFE-20" -> R.drawable.p_dxn_vita_cafe_20
        "DXN-CORDYCEPS-COFFEE-20" -> R.drawable.p_dxn_cordyceps_coffee_20
        "DXN-LIONS-MANE-COFFEE-20" -> R.drawable.p_dxn_lions_mane_coffee_20
        "DXN-COCOZHI-500" -> R.drawable.p_dxn_cocozhi_500
        "DXN-SPIRULINA-CEREAL-500" -> R.drawable.p_dxn_spirulina_cereal_500
        "DXN-CORDYCEPS-CEREAL-500" -> R.drawable.p_dxn_cordyceps_cereal_500
        "DXN-LEMONZHI-500" -> R.drawable.p_dxn_lemonzhi_500
        "DXN-ZHI-YOBITE-30" -> R.drawable.p_dxn_zhi_yobite_30
        "DXN-LINA-YOBITE-30" -> R.drawable.p_dxn_lina_yobite_30
        "DXN-APPLE-ENZYME-750" -> R.drawable.p_dxn_apple_enzyme_750
        "DXN-APPLE-JAM-300" -> R.drawable.p_dxn_apple_jam_300
        "DXN-LIONS-MANE-OOCHA" -> R.drawable.p_dxn_lions_mane_oocha
        "DXN-LIONS-MANE-MATCHA" -> R.drawable.p_dxn_lions_mane_matcha
        "DXN-SPIRUDLE-PLAIN" -> R.drawable.p_dxn_spirudle_plain
        "DXN-GOJI-BERRY" -> R.drawable.p_dxn_goji_berry
        "DXN-OOCHA-NOODLES" -> R.drawable.p_dxn_oocha_noodles
        "DXN-OOCHA-NOODLES-TYF" -> R.drawable.p_dxn_oocha_noodles_tyf
        "DXN-VEGGIE-NOODLE" -> R.drawable.p_dxn_veggie_noodle
        "DXN-RG-POWDER-50" -> R.drawable.p_dxn_rg_powder_50
        "DXN-GL-POWDER-80" -> R.drawable.p_dxn_gl_powder_80
        "DXN-CORDYCEPS-POWDER-30" -> R.drawable.p_dxn_cordyceps_powder_30
        "DXN-LIONS-MANE-POWDER-30" -> R.drawable.p_dxn_lions_mane_powder_30
        else -> null
    }
}
