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
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import java.util.Locale
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread

/**
 * Full-screen cart status. A drink charge starts from the LAN listener or from
 * il.resortos.kiosk.action.CHARGE. There is no drink pay button.
 * The Basalt panel is a separate top-up: balance, a hosted page, or a card tap.
 */
class KioskActivity : Activity() {
    private lateinit var titleView: TextView
    private lateinit var detailView: TextView
    private lateinit var basaltView: TextView
    private lateinit var phoneField: EditText
    private lateinit var nameField: EditText
    private lateinit var amountField: EditText
    private lateinit var pinField: EditText
    private lateinit var balanceButton: Button
    private lateinit var topupButton: Button
    private lateinit var tapButton: Button
    private val basaltBusy = AtomicBoolean(false)
    private var walletId: String = ""
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
            setBackgroundColor(0xFF1B365D.toInt())
            layoutDirection = View.LAYOUT_DIRECTION_RTL
            setPadding(48, 48, 48, 48)
        }
        titleView = TextView(this).apply {
            textSize = 36f
            setTextColor(0xFFF8FAFC.toInt())
            gravity = Gravity.CENTER
            text = "עגלת קפה"
        }
        detailView = TextView(this).apply {
            textSize = 20f
            setTextColor(0xFFE2E8F0.toInt())
            gravity = Gravity.CENTER
            text = "מוכן לתשלום"
        }
        val basaltTitle = TextView(this).apply {
            textSize = 28f
            setTextColor(0xFFF8FAFC.toInt())
            gravity = Gravity.CENTER
            text = "בזלת"
            setPadding(0, 36, 0, 8)
        }
        phoneField = field("טלפון", "")
        nameField = field("שם", "")
        amountField = field("סכום בשקלים", "200.00")
        pinField = field("קוד 4 ספרות, לא חובה", "")
        basaltView = TextView(this).apply {
            textSize = 18f
            setTextColor(0xFFFDE68A.toInt())
            gravity = Gravity.CENTER
            text = "יתרה סגורה. אין העברה ואין פדיון לשקלים. לשימוש במיאליס בלבד."
        }
        val consent = TextView(this).apply {
            textSize = 14f
            setTextColor(0xFFCBD5E1.toInt())
            gravity = Gravity.CENTER
            text = "טעינה או הצמדת כרטיס היא הסכמה ליתרת בזלת סגורה. אפשר להשתמש בה רק במיאליס."
        }
        balanceButton = actionButton("יתרה") { onBalance() }
        topupButton = actionButton("טעינה") { onTopup() }
        tapButton = actionButton("הצמדת כרטיס") { onTap() }
        val actions = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            layoutDirection = View.LAYOUT_DIRECTION_RTL
            addView(balanceButton)
            addView(topupButton)
            addView(tapButton)
        }
        root.addView(titleView)
        root.addView(detailView)
        root.addView(basaltTitle)
        root.addView(phoneField)
        root.addView(nameField)
        root.addView(amountField)
        root.addView(pinField)
        root.addView(consent)
        root.addView(actions)
        root.addView(basaltView)
        val scroll = ScrollView(this).apply {
            setBackgroundColor(0xFF1B365D.toInt())
            addView(root)
        }
        setContentView(scroll)
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

    private fun field(hint: String, value: String): EditText {
        return EditText(this).apply {
            this.hint = hint
            setText(value)
            setTextColor(0xFFF8FAFC.toInt())
            setHintTextColor(0xFF94A3B8.toInt())
            textSize = 18f
            setPadding(0, 12, 0, 12)
        }
    }

    private fun actionButton(label: String, onClick: () -> Unit): Button {
        return Button(this).apply {
            text = label
            textSize = 16f
            isAllCaps = false
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            setOnClickListener { onClick() }
        }
    }

    private fun onBalance() {
        val phone = phoneField.text.toString().trim()
        val name = nameField.text.toString().trim()
        val pin = pinField.text.toString().trim()
        runBasalt {
            val pay = service ?: return@runBasalt
            showBasalt(ensureWallet(pay, phone, name, pin))
        }
    }

    private fun onTopup() {
        val phone = phoneField.text.toString().trim()
        val name = nameField.text.toString().trim()
        val pin = pinField.text.toString().trim()
        val amount = amountField.text.toString().trim().ifBlank { "200.00" }
        runBasalt {
            val pay = service ?: return@runBasalt
            val wallet = ensureWallet(pay, phone, name, pin)
            if (!wallet.body.optBoolean("ok")) {
                showBasalt(wallet)
                return@runBasalt
            }
            showBasalt(pay.coordinator.basaltTopup(phone, amount))
        }
    }

    private fun onTap() {
        val phone = phoneField.text.toString().trim()
        val name = nameField.text.toString().trim()
        val pin = pinField.text.toString().trim()
        val amount = amountField.text.toString().trim().ifBlank { "200.00" }
        runBasalt {
            val pay = service ?: return@runBasalt
            val wallet = ensureWallet(pay, phone, name, pin)
            if (!wallet.body.optBoolean("ok")) {
                showBasalt(wallet)
                return@runBasalt
            }
            val id = wallet.body.optString("walletId").ifBlank { walletId }
            val tapped = pay.coordinator.basaltTap(phone, id, amount)
            runOnUiThread {
                render(tapped.body.optString("status"), tapped.body.optString("message"))
            }
            showBasalt(tapped)
        }
    }

    private fun ensureWallet(pay: KioskPayService, phone: String, name: String, pin: String): ChargeResult {
        val existing = pay.coordinator.basaltBalance(phone)
        if (existing.body.optBoolean("ok")) {
            walletId = existing.body.optString("walletId")
            return existing
        }
        val missing = existing.http == 404 || existing.body.optString("error") == "NOT_FOUND"
        if (!missing) return existing
        val created = pay.coordinator.basaltWallet(phone, name, pin)
        if (created.body.optBoolean("ok")) walletId = created.body.optString("walletId")
        return created
    }

    private fun runBasalt(work: () -> Unit) {
        if (service == null) {
            basaltView.text = "השירות עדיין לא עלה"
            return
        }
        if (!basaltBusy.compareAndSet(false, true)) return
        setBasaltEnabled(false)
        thread(name = "kiosk-basalt") {
            try {
                work()
            } catch (err: Exception) {
                runOnUiThread { basaltView.text = err.message ?: "בזלת לא זמינה" }
            } finally {
                basaltBusy.set(false)
                setBasaltEnabled(true)
            }
        }
    }

    private fun setBasaltEnabled(enabled: Boolean) {
        runOnUiThread {
            balanceButton.isEnabled = enabled
            topupButton.isEnabled = enabled
            tapButton.isEnabled = enabled
        }
    }

    private fun showBasalt(result: ChargeResult) {
        val body = result.body
        val balance = body.optString("balance")
        val message = body.optString("message").ifBlank { body.optString("error") }
        val url = body.optString("url")
        val bonus = body.optInt("bonusBslt")
        val line = buildString {
            if (balance.isNotBlank()) append("יתרה ").append(balance).append(" בזלת")
            if (bonus > 0) {
                if (isNotEmpty()) append('\n')
                append("תשלום ")
                append(shekels(body.optInt("payBslt")))
                append(" ₪, זיכוי ")
                append(shekels(body.optInt("creditBslt")))
                append(" בזלת")
            }
            if (message.isNotBlank()) {
                if (isNotEmpty()) append('\n')
                append(message)
            }
            if (url.isNotBlank()) {
                if (isNotEmpty()) append('\n')
                append(url)
            }
            if (isEmpty()) append("בזלת HTTP ").append(result.http)
        }
        runOnUiThread { basaltView.text = line }
    }

    private fun shekels(minor: Int): String {
        val sign = if (minor < 0) "-" else ""
        val abs = kotlin.math.abs(minor)
        return String.format(Locale.US, "%s%d.%02d", sign, abs / 100, abs % 100)
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
