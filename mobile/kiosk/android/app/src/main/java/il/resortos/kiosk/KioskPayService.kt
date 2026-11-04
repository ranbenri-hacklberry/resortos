package il.resortos.kiosk

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Binder
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import il.resortos.kiosk.cardcom.MockCardcomTapSdk
import il.resortos.kiosk.cardcom.ReflectiveCardcomTapSdk

class KioskPayService : Service() {
    lateinit var coordinator: ChargeCoordinator
        private set
    lateinit var config: KioskConfig
        private set

    private val binder = LocalBinder()
    private var server: ChargeHttpServer? = null
    private var listener: ((String, String) -> Unit)? = null

    inner class LocalBinder : Binder() {
        fun service(): KioskPayService = this@KioskPayService
    }

    override fun onBind(intent: Intent?): IBinder = binder

    override fun onCreate() {
        super.onCreate()
        config = KioskConfig.load(this)
        startInForeground()
        val sdk = if (config.live && !BuildConfig.CARDCOM_TAP_MOCK) {
            ReflectiveCardcomTapSdk(this)
        } else {
            MockCardcomTapSdk()
        }
        val api = if (config.serverEnabled) ResortApi(config.apiBase, config.serverToken) else null
        coordinator = ChargeCoordinator(this, config, sdk, api)
        coordinator.onUi = { phase, line -> listener?.invoke(phase, line) }
        val http = ChargeHttpServer(config.port, config.localToken, coordinator)
        server = http
        try {
            http.start()
        } catch (_: Exception) {
            coordinator.onUi("error", "הפורט ${config.port} תפוס")
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        return START_STICKY
    }

    override fun onDestroy() {
        server?.stop()
        super.onDestroy()
    }

    fun setUiListener(next: ((String, String) -> Unit)?) {
        listener = next
    }

    private fun startInForeground() {
        val manager = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= 26) {
            val channel = NotificationChannel(CHANNEL, getString(R.string.channel_name), NotificationManager.IMPORTANCE_LOW)
            manager.createNotificationChannel(channel)
        }
        val pending = PendingIntent.getActivity(
            this,
            0,
            Intent(this, KioskActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE
        )
        val notification: Notification = NotificationCompat.Builder(this, CHANNEL)
            .setContentTitle(getString(R.string.app_name))
            .setContentText(getString(R.string.channel_text))
            .setSmallIcon(R.drawable.ic_stat)
            .setContentIntent(pending)
            .setOngoing(true)
            .build()
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    companion object {
        private const val CHANNEL = "kiosk-pay"
        private const val NOTIFICATION_ID = 41
    }
}
