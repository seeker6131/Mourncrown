package com.elitetunerx.tune

import android.content.Context
import com.elitetunerx.Prefs
import com.elitetunerx.core.Shell
import com.elitetunerx.core.Telemetry
import com.elitetunerx.session.Recorder

/**
 * One-tap tuning used from the HUD panel and from an ESP32 controller.
 * Every action acts on the game that is on screen right now and returns a short result line.
 */
object QuickActions {
    fun currentGame(): String? = Telemetry.snapshot.value?.game?.pkg ?: Telemetry.snapshot.value?.fgPackage

    private fun needShell(): String? = if (!Shell.ready) "✖ ต้องเชื่อม ADB ในตัวก่อน (หน้า เชื่อมต่อ)" else null
    private fun needGame(): String? = if (currentGame() == null) "✖ ยังไม่เจอเกมบนจอ" else null

    private fun short(s: String) = s.lineSequence().firstOrNull()?.take(80) ?: s

    /** FPS cap through Android Game Manager (Android 13+). 0 = no cap. Takes effect when the game restarts. */
    fun fpsCap(ctx: Context, fps: Int): String {
        needShell()?.let { return it }; needGame()?.let { return it }
        val pkg = currentGame()!!
        val p = Prefs.get(ctx)
        p.edit().putInt("qa_fps:$pkg", fps).apply()
        val ds = p.getString("qa_ds:$pkg", "1.0") ?: "1.0"
        val r = Tweaks.gameIntervention(pkg, ds, fps.toString())
        return if (r.startsWith("✔")) "✔ ล็อก FPS ${if (fps == 0) "ปิด" else fps.toString()} • เปิดเกมใหม่เพื่อให้มีผล" else short(r)
    }

    /** Render resolution scale (1.0 = native). Takes effect when the game restarts. */
    fun downscale(ctx: Context, scale: String): String {
        needShell()?.let { return it }; needGame()?.let { return it }
        val pkg = currentGame()!!
        val p = Prefs.get(ctx)
        p.edit().putString("qa_ds:$pkg", scale).apply()
        val fps = p.getInt("qa_fps:$pkg", 0)
        val r = Tweaks.gameIntervention(pkg, scale, fps.toString())
        return if (r.startsWith("✔")) "✔ ความละเอียด ${(scale.toDouble() * 100).toInt()}% • เปิดเกมใหม่เพื่อให้มีผล" else short(r)
    }

    fun gameMode(mode: String): String {
        needShell()?.let { return it }; needGame()?.let { return it }
        val r = Tweaks.gameMode(currentGame()!!, mode)
        return if (r.startsWith("✔")) "✔ Game mode: $mode" else short(r)
    }

    fun refresh(ctx: Context, hz: Float): String {
        needShell()?.let { return it }
        val r = Tweaks.setRefreshRate(ctx, hz)
        return r.lineSequence().lastOrNull() ?: r
    }

    fun refreshAuto(ctx: Context): String {
        needShell()?.let { return it }
        return Tweaks.revertRefreshRate(ctx).lineSequence().lastOrNull() ?: "✔"
    }

    fun clearRam(ctx: Context): String {
        needShell()?.let { return it }
        return short(Tweaks.killBackground(ctx))
    }

    fun record(ctx: Context): String {
        val wasOn = Recorder.active.value != null
        Recorder.toggle(ctx, Prefs.label(ctx))
        return if (wasOn) "■ หยุดอัด — ดูผลที่หน้า เซสชัน" else "● เริ่มอัดเซสชัน"
    }

    /** Dispatcher for remote controllers (ESP32). */
    fun run(ctx: Context, cmd: String, value: String?): String = when (cmd) {
        "fps" -> fpsCap(ctx, value?.toIntOrNull() ?: 0)
        "scale" -> downscale(ctx, value ?: "1.0")
        "mode" -> gameMode(value ?: "standard")
        "hz" -> if (value == null || value == "auto") refreshAuto(ctx) else refresh(ctx, value.toFloatOrNull() ?: 60f)
        "ram" -> clearRam(ctx)
        "rec" -> record(ctx)
        else -> "✖ ไม่รู้จักคำสั่ง $cmd"
    }
}
