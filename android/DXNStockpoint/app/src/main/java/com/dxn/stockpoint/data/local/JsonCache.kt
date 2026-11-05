package com.dxn.stockpoint.data.local

import android.content.Context
import com.dxn.stockpoint.data.model.Order
import com.dxn.stockpoint.data.model.PlaceOrderRequest
import com.dxn.stockpoint.data.model.Product
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import java.io.File

/**
 * Offline-first cache. Two tiny JSON files instead of a database: the whole
 * dataset is a few hundred DXN SKUs at most, and plain files mean no Room/KSP
 * build step and no schema migrations to babysit.
 */
data class CachedState(
    val rev: Int = 0,
    val savedAt: Long = 0L,
    val products: List<Product> = emptyList(),
    val orders: List<Order> = emptyList()
)

data class OutboxEntry(
    val id: String = "",
    val payload: PlaceOrderRequest? = null,
    val createdAt: Long = 0L,
    val attempts: Int = 0,
    /** queued | sending | failed */
    val status: String = "queued",
    val error: String? = null
) {
    val isFailed: Boolean get() = status == "failed"
}

object JsonCache {

    private const val DIR = "dxn-cache"
    private const val STATE_FILE = "state.json"
    private const val OUTBOX_FILE = "outbox.json"

    private val gson = Gson()
    private val lock = Any()
    private var root: File? = null

    fun init(context: Context) {
        if (root == null) {
            root = File(context.applicationContext.filesDir, DIR).apply { if (!exists()) mkdirs() }
        }
    }

    private fun dir(): File =
        root ?: throw IllegalStateException("JsonCache.init(context) must be called first")

    // ── Cached dataset ──────────────────────────────────────────────────────

    fun loadState(): CachedState = synchronized(lock) {
        runCatching {
            val file = File(dir(), STATE_FILE)
            if (!file.exists()) return CachedState()
            gson.fromJson(file.readText(), CachedState::class.java) ?: CachedState()
        }.getOrDefault(CachedState())
    }

    fun saveState(state: CachedState) = synchronized(lock) {
        write(STATE_FILE, gson.toJson(state.copy(savedAt = System.currentTimeMillis())))
    }

    // ── Order outbox ────────────────────────────────────────────────────────

    fun loadOutbox(): List<OutboxEntry> = synchronized(lock) {
        runCatching {
            val file = File(dir(), OUTBOX_FILE)
            if (!file.exists()) return emptyList()
            val type = object : TypeToken<List<OutboxEntry>>() {}.type
            gson.fromJson<List<OutboxEntry>>(file.readText(), type) ?: emptyList()
        }.getOrDefault(emptyList())
    }

    fun saveOutbox(entries: List<OutboxEntry>): List<OutboxEntry> = synchronized(lock) {
        write(OUTBOX_FILE, gson.toJson(entries))
        entries
    }

    fun appendOutbox(entry: OutboxEntry): List<OutboxEntry> = synchronized(lock) {
        val next = loadOutbox() + entry
        write(OUTBOX_FILE, gson.toJson(next))
        next
    }

    fun removeOutbox(id: String): List<OutboxEntry> = synchronized(lock) {
        val next = loadOutbox().filterNot { it.id == id }
        write(OUTBOX_FILE, gson.toJson(next))
        next
    }

    fun updateOutbox(id: String, transform: (OutboxEntry) -> OutboxEntry): List<OutboxEntry> = synchronized(lock) {
        val next = loadOutbox().map { if (it.id == id) transform(it) else it }
        write(OUTBOX_FILE, gson.toJson(next))
        next
    }

    fun clear() = synchronized(lock) {
        write(STATE_FILE, gson.toJson(CachedState()))
        write(OUTBOX_FILE, "[]")
    }

    /** Write to a sibling temp file first so a crash mid-write cannot corrupt state. */
    private fun write(name: String, json: String) {
        runCatching {
            val target = File(dir(), name)
            val temp = File(dir(), "$name.tmp")
            temp.writeText(json)
            if (target.exists() && !target.delete()) {
                // Fall through: overwriting is still better than losing the cache.
            }
            temp.renameTo(target)
        }
    }
}
