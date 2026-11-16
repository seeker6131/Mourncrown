package com.elitetunerx.hud

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.IBinder
import android.provider.Settings
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.WindowManager
import android.widget.HorizontalScrollView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.elitetunerx.MainActivity
import com.elitetunerx.Prefs
import com.elitetunerx.R
import com.elitetunerx.core.Snapshot
import com.elitetunerx.core.Telemetry
import com.elitetunerx.link.Esp32Link
import com.elitetunerx.session.ActiveSession
import com.elitetunerx.session.Recorder
import com.elitetunerx.tune.QuickActions
import com.elitetunerx.tune.Tweaks
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.Locale
import kotlin.math.abs

class HudService : Service() {
    companion object {
        const val ACTION_STOP = "com.elitetunerx.hud.STOP"
        const val ACTION_REC = "com.elitetunerx.hud.REC"
        const val ACTION_RELOAD = "com.elitetunerx.hud.RELOAD"
        private const val CHANNEL = "hud"
        val running = MutableStateFlow(false)

        fun canDraw(ctx: Context) = Settings.canDrawOverlays(ctx)
        fun start(ctx: Context) = ContextCompat.startForegroundService(ctx, Intent(ctx, HudService::class.java))
        fun stop(ctx: Context) {
            if (running.value) ctx.startService(Intent(ctx, HudService::class.java).setAction(ACTION_STOP))
        }
        /** Re-read HUD settings (style, size, opacity, lines) while running. */
        fun reload(ctx: Context) {
            if (running.value) ctx.startService(Intent(ctx, HudService::class.java).setAction(ACTION_RELOAD))
        }

        fun loadConfig(ctx: Context): HudConfig {
            val p = Prefs.get(ctx)
            return HudConfig(
                style = p.getInt("hud_style", HudView.STYLE_FULL),
                alpha = p.getInt("hud_alpha", 200),
                scale = p.getFloat("hud_scale", 1f),
                graph = p.getBoolean("hud_graph", true),
                game = p.getBoolean("hud_game", true),
                gpu = p.getBoolean("hud_gpu", true),
                cpu = p.getBoolean("hud_cpu", true),
                mem = p.getBoolean("hud_mem", true),
                power = p.getBoolean("hud_power", true),
            )
        }
    }

    private val scope = MainScope()
    private lateinit var wm: WindowManager
    private var hud: HudView? = null
    private lateinit var lp: WindowManager.LayoutParams
    private var panel: View? = null
    private var panelStatus: TextView? = null
    private var last: Pair<Snapshot?, ActiveSession?> = null to null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        startForegroundCompat()
        running.value = true
        Telemetry.acquire(this)
        if (Esp32Link.enabled(this)) Esp32Link.start(this)
        wm = getSystemService(WindowManager::class.java)
        if (canDraw(this)) addHud()
        scope.launch {
            combine(Telemetry.snapshot, Recorder.active) { s, a -> s to a }.collect {
                last = it
                render()
                updateNotification()
            }
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> stopSelf()
            ACTION_REC -> Recorder.toggle(this, Prefs.label(this))
            ACTION_RELOAD -> hud?.let { it.cfg = loadConfig(this); wm.updateViewLayout(it, lp) }
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        scope.cancel()
        closePanel()
        hud?.let { runCatching { wm.removeView(it) } }
        hud = null
        Telemetry.release()
        running.value = false
        super.onDestroy()
    }

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    private fun overlayType() =
        if (Build.VERSION.SDK_INT >= 26) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        else @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE

    private fun addHud() {
        val v = HudView(this).apply { cfg = loadConfig(this@HudService) }
        lp = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.WRAP_CONTENT, overlayType(),
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS or
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = Prefs.get(this@HudService).getInt("hud_x", dp(12))
            y = Prefs.get(this@HudService).getInt("hud_y", dp(48))
            if (Build.VERSION.SDK_INT >= 28) layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
        }
        val slop = ViewConfiguration.get(this).scaledTouchSlop
        val longPress = ViewConfiguration.getLongPressTimeout().toLong()
        v.setOnTouchListener(object : View.OnTouchListener {
            var sx = 0f; var sy = 0f; var ix = 0; var iy = 0; var moved = false; var downAt = 0L
            override fun onTouch(view: View, e: MotionEvent): Boolean {
                when (e.action) {
                    MotionEvent.ACTION_DOWN -> { sx = e.rawX; sy = e.rawY; ix = lp.x; iy = lp.y; moved = false; downAt = e.eventTime }
                    MotionEvent.ACTION_MOVE -> {
                        val dx = (e.rawX - sx).toInt(); val dy = (e.rawY - sy).toInt()
                        if (abs(dx) > slop || abs(dy) > slop) moved = true
                        if (moved) { lp.x = ix + dx; lp.y = iy + dy; runCatching { wm.updateViewLayout(view, lp) }; movePanel() }
                    }
                    MotionEvent.ACTION_UP -> {
                        if (moved) Prefs.get(this@HudService).edit().putInt("hud_x", lp.x).putInt("hud_y", lp.y).apply()
                        else if (e.eventTime - downAt >= longPress) cycleStyle()
                        else togglePanel()
                    }
                }
                return true
            }
        })
        hud = v
        wm.addView(v, lp)
    }

    private fun cycleStyle() {
        val p = Prefs.get(this)
        val next = (p.getInt("hud_style", 0) + 1) % HudView.STYLE_NAMES.size
        p.edit().putInt("hud_style", next).apply()
        hud?.let { it.cfg = loadConfig(this); runCatching { wm.updateViewLayout(it, lp) } }
    }

    private fun render() {
        val (s, a) = last
        val rec = a?.let {
            val dur = ((System.currentTimeMillis() - it.startMs) / 1000).toInt()
            String.format(Locale.US, "REC %02d:%02d • %d เฟรม", dur / 60, dur % 60, synchronized(it) { it.frames.size })
        }
        hud?.update(s, rec)
    }

    // ------------------------------------------------------------------ quick tune panel
    private fun chip(text: String, accent: Boolean = false, onClick: () -> Unit) = TextView(this).apply {
        this.text = text
        textSize = 12f
        typeface = Typeface.DEFAULT_BOLD
        setTextColor(if (accent) Color.rgb(6, 10, 20) else Color.rgb(230, 240, 255))
        setPadding(dp(12), dp(7), dp(12), dp(7))
        background = GradientDrawable().apply {
            cornerRadius = dp(16).toFloat()
            if (accent) setColor(Color.rgb(90, 225, 255)) else { setColor(Color.argb(60, 255, 255, 255)); setStroke(dp(1), Color.argb(90, 170, 140, 255)) }
        }
        setOnClickListener { onClick() }
    }

    private fun row(title: String, vararg chips: View): View {
        val col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(0, dp(4), 0, dp(2)) }
        col.addView(TextView(this).apply {
            text = title; textSize = 10f; setTextColor(Color.rgb(140, 160, 180)); setPadding(dp(2), 0, 0, dp(3))
        })
        val r = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        chips.forEach { c -> r.addView(c, LinearLayout.LayoutParams(-2, -2).apply { marginEnd = dp(6) }) }
        col.addView(HorizontalScrollView(this).apply { isHorizontalScrollBarEnabled = false; addView(r) })
        return col
    }

    private fun act(block: () -> String) {
        panelStatus?.text = "กำลังทำ…"
        scope.launch {
            val r = withContext(Dispatchers.IO) { runCatching(block).getOrElse { "✖ ${it.message}" } }
            panelStatus?.text = r
            panelStatus?.setTextColor(if (r.startsWith("✖")) Color.rgb(255, 90, 100) else Color.rgb(80, 255, 160))
        }
    }

    private fun togglePanel() { if (panel != null) closePanel() else openPanel() }

    private fun closePanel() {
        panel?.let { runCatching { wm.removeView(it) } }
        panel = null; panelStatus = null
    }

    private fun panelParams() = WindowManager.LayoutParams(
        dp(300), WindowManager.LayoutParams.WRAP_CONTENT, overlayType(),
        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
        PixelFormat.TRANSLUCENT
    ).apply {
        gravity = Gravity.TOP or Gravity.START
        val dm = resources.displayMetrics
        val hudW = hud?.width ?: dp(236)
        x = if (lp.x + hudW + dp(306) < dm.widthPixels) lp.x + hudW + dp(6) else (lp.x - dp(306)).coerceAtLeast(0)
        y = lp.y
    }

    private fun movePanel() { panel?.let { runCatching { wm.updateViewLayout(it, panelParams()) } } }

    private fun openPanel() {
        val ctx = this
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(12), dp(10), dp(12), dp(10))
            background = GradientDrawable().apply {
                setColor(Color.argb(235, 8, 12, 24)); cornerRadius = dp(16).toFloat(); setStroke(dp(1), Color.argb(200, 90, 225, 255))
            }
        }
        val game = QuickActions.currentGame()
        box.addView(TextView(this).apply {
            text = "จูนด่วน • " + (Telemetry.snapshot.value?.game?.label ?: game ?: "ไม่มีเกมบนจอ")
            textSize = 13f; typeface = Typeface.DEFAULT_BOLD; setTextColor(Color.rgb(90, 225, 255))
        })
        val rates = Tweaks.supportedRates(this)
        box.addView(row("ล็อก FPS (Game Mode • เปิดเกมใหม่เพื่อให้มีผล)",
            *listOf(0, 30, 45, 60, 90, 120).map { f -> chip(if (f == 0) "ไม่ล็อก" else "$f") { act { QuickActions.fpsCap(ctx, f) } } }.toTypedArray()))
        box.addView(row("ความละเอียดเรนเดอร์ของเกม",
            *listOf("1.0", "0.9", "0.8", "0.7", "0.6", "0.5").map { s -> chip("${(s.toDouble() * 100).toInt()}%") { act { QuickActions.downscale(ctx, s) } } }.toTypedArray()))
        box.addView(row("โหมดเกม",
            chip("Performance", true) { act { QuickActions.gameMode("performance") } },
            chip("Standard") { act { QuickActions.gameMode("standard") } },
            chip("Battery") { act { QuickActions.gameMode("battery") } }))
        if (rates.isNotEmpty()) box.addView(row("อัตรารีเฟรชจอ",
            *(rates.map { hz -> chip(String.format(Locale.US, "%.0f", hz)) { act { QuickActions.refresh(ctx, hz) } } } +
                chip("อัตโนมัติ") { act { QuickActions.refreshAuto(ctx) } }).toTypedArray()))
        box.addView(row("เครื่องมือ",
            chip("ล้าง RAM", true) { act { QuickActions.clearRam(ctx) } },
            chip(if (Recorder.active.value == null) "● อัดเซสชัน" else "■ หยุดอัด") { act { QuickActions.record(ctx) }; closePanel() },
            chip("สลับแบบ HUD") { cycleStyle(); movePanel() },
            chip("ปิด HUD") { stopSelf() }))
        panelStatus = TextView(this).apply {
            text = "แตะ HUD = เปิด/ปิดแผงนี้ • กดค้าง = เปลี่ยนแบบ • ลาก = ย้าย"
            textSize = 11f; setTextColor(Color.rgb(140, 160, 180)); setPadding(dp(2), dp(8), 0, 0)
        }
        box.addView(panelStatus)
        box.addView(chip("ปิดแผง") { closePanel() }, LinearLayout.LayoutParams(-2, -2).apply { topMargin = dp(8); gravity = Gravity.END })
        panel = box
        runCatching { wm.addView(box, panelParams()) }
    }

    // ------------------------------------------------------------------ notification
    private fun notification(): Notification {
        val nm = getSystemService(NotificationManager::class.java)
        if (nm.getNotificationChannel(CHANNEL) == null)
            nm.createNotificationChannel(NotificationChannel(CHANNEL, "Performance HUD", NotificationManager.IMPORTANCE_LOW))
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), flags)
        val stop = PendingIntent.getService(this, 1, Intent(this, HudService::class.java).setAction(ACTION_STOP), flags)
        val recI = PendingIntent.getService(this, 2, Intent(this, HudService::class.java).setAction(ACTION_REC), flags)
        val s = last.first
        val recording = last.second != null
        return NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat)
            .setContentTitle(if (recording) "กำลังอัดเซสชัน" else "Elite Tuner X HUD")
            .setContentText(s?.let { "FPS ${it.fps.text} • ${it.game?.resText ?: ""} • GPU ${it.gpuBusy.text} • ${it.power.text}" } ?: "กำลังเริ่ม…")
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(open)
            .addAction(0, if (recording) "หยุดอัด" else "อัดเซสชัน", recI)
            .addAction(0, "ปิด HUD", stop)
            .build()
    }

    private var lastNotif = 0L
    private fun updateNotification() {
        val now = System.currentTimeMillis()
        if (now - lastNotif < 3000) return
        lastNotif = now
        runCatching { getSystemService(NotificationManager::class.java).notify(7, notification()) }
    }

    private fun startForegroundCompat() {
        if (Build.VERSION.SDK_INT >= 34) startForeground(7, notification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        else startForeground(7, notification())
    }
}
