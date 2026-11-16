package com.elitetunerx.adb

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.RemoteInput
import androidx.core.content.ContextCompat
import com.elitetunerx.R
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * Pairing helper. Android shows the 6-digit code on the Wireless debugging screen and closes
 * the dialog when you leave it, so the code is typed into this notification instead
 * (pull down the shade while the code is on screen).
 */
class PairService : Service() {
    companion object {
        private const val CH = "adb_pair"
        private const val ID = 31
        private const val ACTION_CODE = "com.elitetunerx.adb.CODE"
        private const val ACTION_STOP = "com.elitetunerx.adb.STOP"
        private const val KEY = "code"
        fun start(ctx: Context) = ContextCompat.startForegroundService(ctx, Intent(ctx, PairService::class.java))
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var status = "เปิด Developer options → Wireless debugging → \"จับคู่อุปกรณ์ด้วยรหัสจับคู่\""
    private var port: Int? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        val n = build()
        if (Build.VERSION.SDK_INT >= 34) startForeground(ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE) else startForeground(ID, n)
        scope.launch {
            // Keep looking until the pairing dialog is opened (up to 5 minutes).
            repeat(60) {
                val p = AdbLink.discoverPairingPort(this@PairService, 5000)
                if (p != null) {
                    port = p
                    status = "เจอหน้าจับคู่แล้ว (พอร์ต $p) — กด \"ใส่รหัส\" แล้วพิมพ์รหัส 6 หลัก"
                    update()
                    return@launch
                }
            }
            status = "หมดเวลา — กดเริ่มจับคู่ในแอปอีกครั้ง"
            update()
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> stopSelf()
            ACTION_CODE -> {
                val code = RemoteInput.getResultsFromIntent(intent)?.getCharSequence(KEY)?.toString()?.filter { it.isDigit() }
                if (!code.isNullOrEmpty()) {
                    status = "กำลังจับคู่…"
                    update()
                    scope.launch {
                        val r = AdbLink.pair(this@PairService, code, port)
                        status = r
                        update(done = r.startsWith("✔"))
                        if (r.startsWith("✔")) { Thread.sleep(4000); stopSelf() }
                    }
                }
            }
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }

    private fun update(done: Boolean = false) {
        runCatching { getSystemService(NotificationManager::class.java).notify(ID, build(done)) }
    }

    private fun build(done: Boolean = false): Notification {
        val nm = getSystemService(NotificationManager::class.java)
        if (nm.getNotificationChannel(CH) == null)
            nm.createNotificationChannel(NotificationChannel(CH, "จับคู่ ADB ในตัว", NotificationManager.IMPORTANCE_HIGH))
        val mutable = if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0
        val codeIntent = PendingIntent.getService(
            this, 1, Intent(this, PairService::class.java).setAction(ACTION_CODE),
            PendingIntent.FLAG_UPDATE_CURRENT or mutable
        )
        val stopIntent = PendingIntent.getService(
            this, 2, Intent(this, PairService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val input = RemoteInput.Builder(KEY).setLabel("รหัสจับคู่ 6 หลัก").build()
        val b = NotificationCompat.Builder(this, CH)
            .setSmallIcon(R.drawable.ic_stat)
            .setContentTitle(if (done) "Elite Tuner X เชื่อม ADB แล้ว" else "จับคู่ ADB ในตัว (ไม่ต้องใช้ Shizuku)")
            .setContentText(status)
            .setStyle(NotificationCompat.BigTextStyle().bigText(status))
            .setOnlyAlertOnce(false)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setOngoing(!done)
        if (!done) b.addAction(NotificationCompat.Action.Builder(0, "ใส่รหัส", codeIntent).addRemoteInput(input).build())
        b.addAction(0, "ปิด", stopIntent)
        return b.build()
    }
}
