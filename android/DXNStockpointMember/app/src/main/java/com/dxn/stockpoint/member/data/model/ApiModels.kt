package com.dxn.stockpoint.member.data.model

data class MemberProfile(
    val id: Int,
    val memberId: String,
    val name: String,
    val phone: String?,
    val totalPv: Double,
    val totalOrders: Int,
    val totalSpent: Double,
)

data class PvDistribution(
    val id: Int,
    val memberId: String,
    val staffId: Int?,
    val pvAmount: Double,
    val reason: String,
    val referenceType: String?,
    val referenceId: String?,
    val createdAt: String,
)

data class LoginRequest(
    val member_id: String,
    val pin: String
)

data class LoginResponse(
    val token: String,
    val expires_at: String,
    val role: String,
    val ttl: Long,
    val member: MemberProfile
)

data class ApiError(
    val success: Boolean = false,
    val message: String = "",
    val code: String = ""
)
