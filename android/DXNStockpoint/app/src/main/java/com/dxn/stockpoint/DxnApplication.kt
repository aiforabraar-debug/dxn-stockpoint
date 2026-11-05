package com.dxn.stockpoint

import android.app.Application
import com.dxn.stockpoint.data.api.RetrofitClient
import com.dxn.stockpoint.data.local.JsonCache
import com.dxn.stockpoint.data.local.Prefs

/**
 * Initialises the three singletons the data layer needs before the first
 * ViewModel is created. Doing it here (instead of in the Activity) means the
 * cache and the saved server URL are available even to a background sync.
 */
class DxnApplication : Application() {

    override fun onCreate() {
        super.onCreate()
        Prefs.init(this)
        JsonCache.init(this)
        RetrofitClient.init(this)
    }
}
