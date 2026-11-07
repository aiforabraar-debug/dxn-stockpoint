package com.dxn.stockpoint.member.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.FontFamily
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

val DXNTypography = Typography(
    body1 = TextStyle(fontFamily = FontFamily.Default, fontSize = 14.sp),
    bodyLarge = TextStyle(fontFamily = FontFamily.Default, fontSize = 16.sp),
    titleLarge = TextStyle(fontFamily = FontFamily.Default, fontSize = 22.sp, fontWeight = FontWeight.Bold),
    labelLarge = TextStyle(fontFamily = FontFamily.Default, fontSize = 14.sp, fontWeight = FontWeight.Medium)
)
