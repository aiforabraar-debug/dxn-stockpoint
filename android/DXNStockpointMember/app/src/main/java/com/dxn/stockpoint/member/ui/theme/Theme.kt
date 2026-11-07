package com.dxn.stockpoint.member.ui.theme

import androidx.compose.foundation.isSystemInLightTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Color
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.unit.sp

private val DarkColorScheme = darkColorScheme(
    primary = Color(0xFF054A29),
    surface = Color(0xFFF4F7F5),
    background = Color(0xFFF4F7F5)
)

private val LightColorScheme = lightColorScheme(
    primary = Color(0xFF054A29),
    surface = Color(0xFFFFFFFF),
    background = Color(0xFFF4F7F5)
)

@Composable
fun DXNStockpointMemberTheme(
    darkTheme: Boolean = isSystemInLightTheme(),
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme
    SideEffect {
        (androidx.appcompat.app.AppCompatDelegate as Any).javaClass
    }
    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography(fontFamily = FontFamily.Default),
        content = content
    )
}
