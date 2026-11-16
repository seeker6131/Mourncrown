package com.elitetunerx.hud

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import android.view.View
import com.elitetunerx.core.Reading
import com.elitetunerx.core.Shell
import com.elitetunerx.core.Snapshot
import java.util.Locale
import kotlin.math.max
import kotlin.math.min

/** Which lines the full HUD shows; set in the app's HUD page. */
data class HudConfig(
    val style: Int = HudView.STYLE_FULL,
    val alpha: Int = 200,          // background opacity 0..255
    val scale: Float = 1f,         // overall size
    val graph: Boolean = true,
    val game: Boolean = true,
    val gpu: Boolean = true,
    val cpu: Boolean = true,
    val mem: Boolean = true,
    val power: Boolean = true,
)

/**
 * The overlay itself. Drawn by hand on a Canvas so it stays light (no layout passes) and looks the
 * same on every Android skin.
 */
class HudView(ctx: Context) : View(ctx) {
    companion object {
        const val STYLE_FULL = 0
        const val STYLE_BAR = 1
        const val STYLE_MINI = 2
        val STYLE_NAMES = listOf("เต็ม", "แถบ", "มินิ")

        val GOOD = Color.rgb(80, 255, 160)
        val WARN = Color.rgb(255, 210, 90)
        val BAD = Color.rgb(255, 90, 100)
        val CYAN = Color.rgb(90, 225, 255)
        val VIOLET = Color.rgb(170, 140, 255)
        val TEXT = Color.rgb(235, 245, 255)
        val MUTED = Color.rgb(140, 160, 180)
    }

    var cfg = HudConfig()
        set(v) { field = v; requestLayout(); invalidate() }
    var snap: Snapshot? = null
    var recording: String? = null
    private val frames = FloatArray(160)
    private var fCount = 0
    private var fHead = 0
    private var lastSnapAt = 0L

    // Frames arrive from the system in batches (every 250 ms). They are released into the graph
    // at their own pace so the line scrolls continuously, ~30 redraws/s, never more than 0.3 s behind.
    private val pending = ArrayDeque<Double>()
    private var scrollAt = 0L
    private var scrolling = false
    private var carryMs = 0.0
    private val scroller = object : Runnable {
        override fun run() {
            val now = android.os.SystemClock.uptimeMillis()
            var budget = (now - scrollAt).toDouble() + carryMs
            scrollAt = now
            val out = ArrayList<Double>()
            synchronized(pending) {
                var backlog = pending.sum()
                while (pending.isNotEmpty() && (pending.first() <= budget || backlog > 300.0)) {
                    val f = pending.removeFirst()
                    budget -= f; backlog -= f
                    out.add(f)
                }
                carryMs = if (pending.isEmpty()) 0.0 else budget.coerceAtLeast(0.0)
            }
            if (out.isNotEmpty()) { pushFrames(out); invalidate() }
            if (pending.isNotEmpty() && isAttachedToWindow) postDelayed(this, 33) else scrolling = false
        }
    }

    private fun scheduleScroll() {
        if (scrolling || cfg.style != STYLE_FULL || !cfg.graph) {
            if (cfg.style != STYLE_FULL || !cfg.graph) synchronized(pending) { pending.clear() }
            return
        }
        scrolling = true
        scrollAt = android.os.SystemClock.uptimeMillis()
        post(scroller)
    }

    override fun onDetachedFromWindow() {
        removeCallbacks(scroller); scrolling = false
        super.onDetachedFromWindow()
    }

    fun pushFrames(ft: List<Double>) {
        ft.forEach { frames[fHead] = it.toFloat(); fHead = (fHead + 1) % frames.size; if (fCount < frames.size) fCount++ }
    }

    fun update(s: Snapshot?, rec: String?) {
        if (s != null && s.timeMs != lastSnapAt) {
            lastSnapAt = s.timeMs
            synchronized(pending) { pending.addAll(s.newFrameTimes) }
            if (pending.isNotEmpty()) scheduleScroll()
        }
        val needLayout = (snap == null) != (s == null) || snap?.game?.label != s?.game?.label
        snap = s; recording = rec
        if (needLayout) requestLayout()
        invalidate()
    }

    private val d = resources.displayMetrics.density
    private fun dp(v: Float) = v * d * cfg.scale

    private val bg = Paint(Paint.ANTI_ALIAS_FLAG)
    private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    private val txt = Paint(Paint.ANTI_ALIAS_FLAG).apply { typeface = Typeface.create("sans-serif-condensed", Typeface.NORMAL) }
    private val bold = Paint(Paint.ANTI_ALIAS_FLAG).apply { typeface = Typeface.create("sans-serif-condensed", Typeface.BOLD) }
    private val mono = Paint(Paint.ANTI_ALIAS_FLAG).apply { typeface = Typeface.MONOSPACE }
    private val bar = Paint(Paint.ANTI_ALIAS_FLAG)
    private val line = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeJoin = Paint.Join.ROUND }
    private val rect = RectF()
    private val path = Path()

    private fun widthFor(style: Int): Float = when (style) {
        STYLE_FULL -> dp(236f)
        STYLE_MINI -> dp(64f)
        else -> barWidth()
    }

    private fun barWidth(): Float {
        bold.textSize = dp(12f)
        return bold.measureText(barText()) + dp(22f)
    }

    private fun fullHeight(): Float {
        var h = dp(10f) + dp(14f) /*title*/ + dp(40f) /*fps*/
        if (cfg.graph) h += dp(34f)
        if (cfg.gpu) h += dp(30f)
        if (cfg.cpu) h += dp(30f)
        if (cfg.mem) h += dp(16f)
        if (cfg.power) h += dp(16f)
        if (recording != null) h += dp(16f)
        return h + dp(8f)
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val w = widthFor(cfg.style)
        val h = when (cfg.style) {
            STYLE_FULL -> fullHeight()
            STYLE_MINI -> dp(40f)
            else -> dp(26f)
        }
        setMeasuredDimension(w.toInt() + 1, h.toInt() + 1)
    }

    private fun fpsColor(v: Double?): Int = when {
        v == null -> MUTED
        v >= 55 -> GOOD
        v >= 30 -> WARN
        else -> BAD
    }

    private fun tempColor(v: Double?): Int = when {
        v == null -> MUTED
        v < 60 -> CYAN
        v < 75 -> WARN
        else -> BAD
    }

    private fun loadColor(v: Double?): Int = when {
        v == null -> MUTED
        v < 70 -> CYAN
        v < 90 -> WARN
        else -> BAD
    }

    private fun f0(v: Double?) = v?.let { String.format(Locale.US, "%.0f", it) } ?: "--"

    private fun barText(): String {
        val s = snap ?: return "ELITE TUNER X"
        val parts = ArrayList<String>()
        parts += "${f0(s.fps.value)} FPS"
        s.game?.takeIf { it.renderW != null }?.let { parts += it.resText }
        if (s.gpuBusy.ok) parts += "GPU ${f0(s.gpuBusy.value)}%"
        if (s.cpuUsage.ok) parts += "CPU ${f0(s.cpuUsage.value)}%"
        val t = max(s.cpuTemp.value ?: 0.0, s.gpuTemp.value ?: 0.0)
        if (t > 0) parts += "${f0(t)}°"
        if (s.power.ok) parts += String.format(Locale.US, "%.1fW", s.power.value)
        return parts.joinToString("  ·  ")
    }

    private fun panel(c: Canvas, w: Float, h: Float, r: Float) {
        rect.set(dp(0.5f), dp(0.5f), w - dp(0.5f), h - dp(0.5f))
        bg.shader = null
        bg.color = Color.argb(cfg.alpha, 6, 10, 20)
        c.drawRoundRect(rect, r, r, bg)
        stroke.strokeWidth = dp(1.2f)
        stroke.shader = LinearGradient(0f, 0f, w, h, Color.argb(220, 90, 225, 255), Color.argb(220, 170, 140, 255), Shader.TileMode.CLAMP)
        c.drawRoundRect(rect, r, r, stroke)
    }

    override fun onDraw(c: Canvas) {
        val w = width.toFloat(); val h = height.toFloat()
        when (cfg.style) {
            STYLE_MINI -> drawMini(c, w, h)
            STYLE_BAR -> drawBar(c, w, h)
            else -> drawFull(c, w, h)
        }
    }

    private fun drawMini(c: Canvas, w: Float, h: Float) {
        panel(c, w, h, dp(12f))
        val v = snap?.fps?.value
        bold.textSize = dp(20f); bold.color = fpsColor(v); bold.textAlign = Paint.Align.CENTER
        c.drawText(f0(v), w / 2, dp(23f), bold)
        txt.textSize = dp(8f); txt.color = MUTED; txt.textAlign = Paint.Align.CENTER
        c.drawText(if (recording != null) "● REC" else "FPS", w / 2, dp(34f), txt)
        bold.textAlign = Paint.Align.LEFT; txt.textAlign = Paint.Align.LEFT
    }

    private fun drawBar(c: Canvas, w: Float, h: Float) {
        panel(c, w, h, h / 2)
        bold.textSize = dp(12f); bold.color = fpsColor(snap?.fps?.value)
        val t = barText()
        val first = t.substringBefore("  ·  ")
        c.drawText(first, dp(11f), dp(17.5f), bold)
        val rest = t.removePrefix(first)
        bold.color = TEXT
        c.drawText(rest, dp(11f) + bold.measureText(first), dp(17.5f), bold)
        if (recording != null) { bar.color = BAD; c.drawCircle(w - dp(6f), dp(6f), dp(3f), bar) }
    }

    private fun drawFull(c: Canvas, w: Float, h: Float) {
        panel(c, w, h, dp(14f))
        val s = snap
        val pad = dp(10f)
        var y = dp(10f)

        // --- title: game name + backend
        txt.textSize = dp(9.5f); txt.color = MUTED
        val game = s?.game
        val title = (game?.label ?: s?.fgPackage ?: "ELITE TUNER X").uppercase(Locale.US)
        c.drawText(ellipsize(title, txt, w - pad * 2 - dp(56f)), pad, y + dp(9f), txt)
        val be = s?.backend ?: Shell.Backend.NONE
        txt.textAlign = Paint.Align.RIGHT
        txt.color = if (be == Shell.Backend.NONE) WARN else GOOD
        c.drawText(if (be == Shell.Backend.NONE) "● LIMITED" else "● " + be.name, w - pad, y + dp(9f), txt)
        txt.textAlign = Paint.Align.LEFT
        y += dp(14f)

        // --- big FPS + frame time + resolution block
        val fps = s?.fps?.value
        bold.textSize = dp(34f); bold.color = fpsColor(fps)
        val fpsStr = if (s?.fps?.ok == true) f0(fps) else "--"
        c.drawText(fpsStr, pad, y + dp(31f), bold)
        val fw = bold.measureText(fpsStr)
        txt.textSize = dp(10f); txt.color = TEXT
        c.drawText("FPS", pad + fw + dp(4f), y + dp(18f), txt)
        txt.color = MUTED
        c.drawText(s?.frameTime?.takeIf { it.ok }?.text ?: "-- ms", pad + fw + dp(4f), y + dp(31f), txt)

        // right column: resolution / refresh / API
        txt.textAlign = Paint.Align.RIGHT
        bold.textSize = dp(13f); bold.color = CYAN; bold.textAlign = Paint.Align.RIGHT
        c.drawText(game?.resText ?: "N/A", w - pad, y + dp(13f), bold)
        bold.textAlign = Paint.Align.LEFT
        txt.textSize = dp(9.5f); txt.color = TEXT
        val hz = game?.refreshHz?.let { String.format(Locale.US, "%.0f Hz", it) } ?: ""
        val scale = game?.scalePct?.takeIf { it in 1..99 }?.let { " · ${it}%" } ?: ""
        c.drawText(hz + scale, w - pad, y + dp(24f), txt)
        txt.color = VIOLET
        c.drawText(game?.api ?: "", w - pad, y + dp(35f), txt)
        txt.textAlign = Paint.Align.LEFT
        y += dp(40f)

        // --- frame-time graph
        if (cfg.graph) {
            drawGraph(c, pad, y + dp(2f), w - pad * 2, dp(28f))
            y += dp(34f)
        }

        // --- GPU
        if (cfg.gpu) {
            drawMeter(
                c, pad, y, w - pad * 2, "GPU", s?.gpuName ?: "", s?.gpuBusy,
                listOfNotNull(s?.gpuFreq?.takeIf { it.ok }?.text, s?.gpuTemp?.takeIf { it.ok }?.let { "${f0(it.value)}°" }),
                s?.gpuTemp?.value,
            )
            y += dp(30f)
        }
        // --- CPU
        if (cfg.cpu) {
            val ghz = s?.clusters?.mapNotNull { it.curMhz }?.maxOrNull()?.let { String.format(Locale.US, "%.2f GHz", it / 1000) }
            val gameCpu = game?.cpuPct?.let { "เกม ${f0(it)}%" } ?: ""
            drawMeter(
                c, pad, y, w - pad * 2, "CPU", gameCpu, s?.cpuUsage,
                listOfNotNull(ghz, s?.cpuTemp?.takeIf { it.ok }?.let { "${f0(it.value)}°" }),
                s?.cpuTemp?.value,
            )
            y += dp(30f)
        }
        // --- memory
        if (cfg.mem && s != null) {
            txt.textSize = dp(10f)
            drawKv(c, pad, y + dp(11f), "RAM", String.format(Locale.US, "%.1f/%.0f GB", s.ramUsedGb, s.ramTotalGb), TEXT)
            game?.ramMb?.let {
                txt.textAlign = Paint.Align.RIGHT; txt.color = MUTED
                c.drawText(String.format(Locale.US, "เกมใช้ %.2f GB", it / 1024), w - pad, y + dp(11f), txt)
                txt.textAlign = Paint.Align.LEFT
            }
            y += dp(16f)
        }
        // --- power / battery
        if (cfg.power && s != null) {
            txt.textSize = dp(10f)
            drawKv(c, pad, y + dp(11f), "PWR", s.power.text, TEXT)
            txt.textAlign = Paint.Align.RIGHT; txt.color = tempColor(s.batteryTemp.value)
            val th = if (s.thermalStatus == "Nominal" || s.thermalStatus == "Unknown") "" else "  ${s.thermalStatus}"
            c.drawText("BAT ${s.batteryTemp.text}$th", w - pad, y + dp(11f), txt)
            txt.textAlign = Paint.Align.LEFT
            y += dp(16f)
        }
        if (recording != null) {
            bar.color = BAD
            c.drawCircle(pad + dp(4f), y + dp(7f), dp(3.5f), bar)
            txt.textSize = dp(10f); txt.color = BAD
            c.drawText(recording!!, pad + dp(12f), y + dp(11f), txt)
        }
    }

    private fun drawKv(c: Canvas, x: Float, y: Float, k: String, v: String, color: Int) {
        txt.color = MUTED
        c.drawText(k, x, y, txt)
        txt.color = color
        c.drawText(v, x + dp(28f), y, txt)
    }

    private fun drawMeter(c: Canvas, x: Float, y: Float, w: Float, label: String, sub: String, r: Reading?, extras: List<String>, temp: Double?) {
        bold.textSize = dp(10.5f); bold.color = TEXT
        c.drawText(label, x, y + dp(11f), bold)
        txt.textSize = dp(9f); txt.color = MUTED
        c.drawText(ellipsize(sub, txt, w * 0.5f), x + dp(28f), y + dp(11f), txt)
        txt.textAlign = Paint.Align.RIGHT; txt.textSize = dp(10f)
        val pct = r?.takeIf { it.ok }?.let { "${f0(it.value)}%" } ?: "N/A"
        val ex = extras.joinToString("  ")
        txt.color = tempColor(temp)
        val exW = if (ex.isNotEmpty()) txt.measureText(ex) else 0f
        if (ex.isNotEmpty()) c.drawText(ex, x + w, y + dp(11f), txt)
        bold.textAlign = Paint.Align.RIGHT; bold.color = loadColor(r?.value)
        c.drawText(pct, x + w - exW - (if (ex.isNotEmpty()) dp(6f) else 0f), y + dp(11f), bold)
        bold.textAlign = Paint.Align.LEFT; txt.textAlign = Paint.Align.LEFT
        // bar
        val by = y + dp(16f); val bh = dp(5f)
        rect.set(x, by, x + w, by + bh)
        bar.shader = null; bar.color = Color.argb(60, 255, 255, 255)
        c.drawRoundRect(rect, bh / 2, bh / 2, bar)
        val v = (r?.value ?: 0.0).coerceIn(0.0, 100.0).toFloat() / 100f
        if (v > 0f) {
            rect.set(x, by, x + max(bh, w * v), by + bh)
            bar.shader = LinearGradient(x, 0f, x + w, 0f, CYAN, if ((r?.value ?: 0.0) > 85) BAD else VIOLET, Shader.TileMode.CLAMP)
            c.drawRoundRect(rect, bh / 2, bh / 2, bar)
            bar.shader = null
        }
    }

    private fun drawGraph(c: Canvas, x: Float, y: Float, w: Float, h: Float) {
        rect.set(x, y, x + w, y + h)
        bar.color = Color.argb(40, 255, 255, 255)
        c.drawRoundRect(rect, dp(6f), dp(6f), bar)
        if (fCount < 2) {
            txt.textSize = dp(9f); txt.color = MUTED
            c.drawText("frame time", x + dp(6f), y + h / 2 + dp(3f), txt)
            return
        }
        // scale: at least 33 ms tall so smooth 60 FPS looks flat and spikes stand out
        var maxV = 0f
        for (i in 0 until fCount) maxV = max(maxV, frames[(fHead - fCount + i + frames.size) % frames.size])
        val top = max(33.4f, min(maxV * 1.15f, 120f))
        // 16.7 ms guide
        line.strokeWidth = dp(0.8f); line.color = Color.argb(70, 80, 255, 160)
        val gy = y + h - (16.7f / top) * h
        c.drawLine(x, gy, x + w, gy, line)
        path.reset()
        val n = fCount
        for (i in 0 until n) {
            val v = frames[(fHead - n + i + frames.size) % frames.size]
            val px = x + w * (frames.size - n + i) / (frames.size - 1).toFloat()
            val py = y + h - (min(v, top) / top) * (h - dp(2f)) - dp(1f)
            if (i == 0) path.moveTo(px, py) else path.lineTo(px, py)
        }
        line.strokeWidth = dp(1.4f)
        line.shader = LinearGradient(0f, y, 0f, y + h, BAD, GOOD, Shader.TileMode.CLAMP)
        c.drawPath(path, line)
        line.shader = null
        txt.textSize = dp(8f); txt.color = MUTED
        c.drawText(String.format(Locale.US, "max %.0f ms", maxV), x + dp(5f), y + dp(9f), txt)
    }

    private fun ellipsize(s: String, p: Paint, maxW: Float): String {
        if (p.measureText(s) <= maxW) return s
        var e = s
        while (e.isNotEmpty() && p.measureText("$e…") > maxW) e = e.dropLast(1)
        return "$e…"
    }
}
