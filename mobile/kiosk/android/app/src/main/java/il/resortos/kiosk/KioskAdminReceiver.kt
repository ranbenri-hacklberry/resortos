package il.resortos.kiosk

import android.app.admin.DeviceAdminReceiver

/** Device-owner receiver. Lock-task is armed from the activity once this is the owner. */
class KioskAdminReceiver : DeviceAdminReceiver()
