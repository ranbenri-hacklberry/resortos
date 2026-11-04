package il.resortos.kiosk

import android.app.Activity
import android.app.ActivityManager
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.TextView
import kotlin.concurrent.thread

/**
 * Full-screen status only. A charge starts from the LAN listener or from
 * il.resortos.kiosk.action.CHARGE. There is no pay button.
 */
class KioskActivity : Activity() {
    private lateinit var titleView: TextView
    private lateinit var detailView: TextView
    private var service: KioskPayService? = null
    private var queued: Intent? = null
    private var askedLock = false

    private val connection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, binder: IBinder?) {
            val bound = (binder as? KioskPayService.LocalBinder)?.service() ?: return
            service = bound
            bound.setUiListener { phase, line ->
                runOnUiThread { render(phase, line) }
            }
            if (!bound.config.configured) {
                render("config", "חסר קובץ הגדרות על המכשיר")
            } else {
                render("idle", "מוכן לתשלום")
            }
            queued?.let { startFromIntent(it) }
            queued = null
        }

        override fun onServiceDisconnected(name: ComponentName?) {
            service = null
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            )
        }
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(0xFF1B365D.toInt())
            layoutDirection = View.LAYOUT_DIRECTION_RTL
            setPadding(48, 48, 48, 48)
        }
        titleView = TextView(this).apply {
            textSize = 42f
            setTextColor(0xFFF8FAFC.toInt())
            gravity = Gravity.CENTER
            text = "עגלת קפה"
        }
        detailView = TextView(this).apply {
            textSize = 22f
            setTextColor(0xFFE2E8F0.toInt())
            gravity = Gravity.CENTER
            text = "מוכן לתשלום"
        }
        root.addView(titleView)
        root.addView(detailView)
        setContentView(root)
        val launch = Intent(this, KioskPayService::class.java)
        if (Build.VERSION.SDK_INT >= 26) startForegroundService(launch) else startService(launch)
        bindService(launch, connection, Context.BIND_AUTO_CREATE)
        if (intent?.action == CHARGE) queued = intent
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        if (intent?.action == CHARGE) {
            if (service == null) queued = intent else startFromIntent(intent)
        }
    }

    override fun onResume() {
        super.onResume()
        hideSystemBars()
        armLockTask()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemBars()
    }

    @Deprecated("Kiosk swallows back so a customer cannot leave the payment screen.")
    override fun onBackPressed() {
        // Locked on purpose. Leave with: adb shell am task lock stop
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK) return true
        return super.onKeyDown(keyCode, event)
    }

    override fun onDestroy() {
        service?.setUiListener(null)
        runCatching { unbindService(connection) }
        super.onDestroy()
    }

    private fun startFromIntent(intent: Intent) {
        val pay = service ?: return
        val token = intent.getStringExtra("token").orEmpty()
        if (!constantTimeEquals(token, pay.config.localToken)) return
        val amount = intent.getStringExtra("amount").orEmpty()
        val orderId = intent.getStringExtra("orderId").orEmpty()
        thread(name = "kiosk-intent") {
            val result = pay.coordinator.charge(
                org.json.JSONObject().put("amount", amount).put("orderId", orderId).put("timeoutSec", 60)
            )
            runOnUiThread { render(result.body.optString("status"), result.body.optString("message")) }
        }
    }

    private fun render(phase: String, line: String) {
        titleView.text = when (phase) {
            "tap" -> "הצמידו כרטיס"
            "approved" -> "אושר"
            "declined" -> "נדחה"
            "cancelled" -> "בוטל"
            "timeout" -> "תם הזמן"
            "qr" -> "סרקו לתשלום"
            "recover" -> "רגע"
            "config", "error" -> "עגלת קפה"
            else -> "עגלת קפה"
        }
        detailView.text = line
    }

    private fun hideSystemBars() {
        if (Build.VERSION.SDK_INT >= 30) {
            window.insetsController?.let { controller ->
                controller.hide(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
                controller.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = (
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    or View.SYSTEM_UI_FLAG_FULLSCREEN
                    or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                )
        }
    }

    private fun armLockTask() {
        val dpm = getSystemService(DevicePolicyManager::class.java) ?: return
        val admin = ComponentName(this, KioskAdminReceiver::class.java)
        if (dpm.isDeviceOwnerApp(packageName)) {
            dpm.setLockTaskPackages(admin, arrayOf(packageName))
            if (Build.VERSION.SDK_INT >= 28) {
                dpm.setLockTaskFeatures(admin, DevicePolicyManager.LOCK_TASK_FEATURE_NONE)
            }
        }
        val manager = getSystemService(ActivityManager::class.java)
        val locked = (manager?.lockTaskModeState ?: ActivityManager.LOCK_TASK_MODE_NONE) != ActivityManager.LOCK_TASK_MODE_NONE
        if (locked) return
        if (askedLock) return
        askedLock = true
        // Device owner skips the system dialog. Otherwise Android asks once to pin the screen.
        runCatching { startLockTask() }
    }

    companion object {
        const val CHARGE = "il.resortos.kiosk.action.CHARGE"
    }
}
