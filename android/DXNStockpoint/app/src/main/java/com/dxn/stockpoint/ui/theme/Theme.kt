package com.dxn.stockpoint.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val ForestGreen = Color(0xFF054A29)
val EmeraldGreen = Color(0xFF0A723D)
val LightGreen = Color(0xFFE2EBE4)
val GlassBackground = Color(0xCCFFFFFF)
val GlassBorder = Color(0x66FFFFFF)
val DarkText = Color(0xFF1C3322)
val AccentGold = Color(0xFFB8860B)

private val DXNColorScheme = lightColorScheme(
    primary = ForestGreen,
    secondary = EmeraldGreen,
    tertiary = AccentGold,
    background = Color(0xFFF0F4F1),
    surface = GlassBackground,
    onPrimary = Color.White,
    onSecondary = Color.White,
    onBackground = DarkText,
    onSurface = DarkText
)

@Composable
fun DXNStockpointTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = DXNColorScheme,
        content = content
    )
}
