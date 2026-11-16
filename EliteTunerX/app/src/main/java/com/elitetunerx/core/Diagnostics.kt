package com.elitetunerx.core

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.content.FileProvider
import java.io.File

/**
 * Collects what the FPS / resolution readers see on this phone, so a failing device can be fixed
 * from real data. Only lines that mention the game on screen are kept — no list of other apps.
 */
object Diagnostics {
    private fun section(sb: StringBuilder, title: String, body: String) {
        sb.append("\n===== ").append(title).append(" =====\n").append(body.trimEnd()).append('\n')
    }

    fun build(ctx: Context, pkgHint: String?): String {
        val sb = StringBuilder()
        val g = GpuInfo.get()
        sb.append("Elite Tuner X diagnostics\n")
        sb.append("Device: ${DeviceInfo.model} | ${DeviceInfo.chip} | ${g.renderer}\n")
        sb.append("OS: ${DeviceInfo.skin} | ${DeviceInfo.android} | build ${Build.DISPLAY}\n")
        sb.append("Backend: ${Shell.backend()} uid=${Shell.uid()}\n")
        sb.append("Fast-lane tick: ${Telemetry.tickStats()}\n")
        sb.append("FPS source: ${Telemetry.snapshot.value?.fps?.source}\n")
        if (!Shell.ready) { sb.append("\n(no privileged shell — connect built-in ADB first)\n"); return sb.toString() }

        // Opened from inside Elite Tuner X: report on the last game instead of ourselves.
        val pkg = (pkgHint ?: FpsMeter.focusedPackage())?.takeIf { it != ctx.packageName } ?: GameProbe.lastGame ?: pkgHint
        sb.append("Game: $pkg\n")
        section(sb, "focus", Shell.sh("dumpsys window | grep -E 'mCurrentFocus|mFocusedApp' | head -n 4", 4000).out)
        if (pkg == null) return sb.toString()

        val list = Shell.exec(arrayOf("dumpsys", "SurfaceFlinger", "--list"), 4000).out.lines()
        section(sb, "--list (game lines, ${list.size} total)", list.filter { it.contains(pkg) }.joinToString("\n"))
        list.filter { it.contains(pkg) }.map { FpsMeter.layerName(it) }.take(6).forEach { name ->
            val lat = Shell.exec(arrayOf("dumpsys", "SurfaceFlinger", "--latency", name), 3000).out.lines()
            section(sb, "--latency '$name' (${lat.size} lines)", lat.take(4).joinToString("\n") + "\n...\n" + lat.takeLast(3).joinToString("\n"))
        }
        section(sb, "page flip 1013", Shell.exec(arrayOf("service", "call", "SurfaceFlinger", "1013"), 3000).text())

        Shell.exec(arrayOf("dumpsys", "SurfaceFlinger", "--timestats", "-enable"), 3000)
        Thread.sleep(1200)
        val ts = Shell.exec(arrayOf("dumpsys", "SurfaceFlinger", "--timestats", "-dump"), 4000).out.lines()
        val tsOut = StringBuilder()
        ts.take(12).forEach { tsOut.append(it).append('\n') }
        ts.forEachIndexed { i, l -> if (l.contains(pkg)) ts.subList(maxOf(0, i - 1), minOf(ts.size, i + 14)).forEach { tsOut.append(it).append('\n') } }
        section(sb, "timestats (${ts.size} lines)", tsOut.toString())
        section(sb, "current layer", "${FpsMeter.currentLayer} • tick ${Telemetry.tickStats()}")
        section(sb, "fps parse", FpsMeter.parseTimeStats(ts.joinToString("\n"), pkg, 1.2)?.let { "layer=${it.layer} fps=${it.displayFps} frames=${it.frameTimesMs.size}" } ?: "null")

        val sf = Shell.exec(arrayOf("dumpsys", "SurfaceFlinger"), 8000).out.lines()
        val sfOut = StringBuilder()
        sf.forEachIndexed { i, l ->
            if (l.contains("Source Crop") || l.contains("HWC layers")) sfOut.append("[$i] ").append(l).append('\n')
            if (l.contains(pkg)) sf.subList(i, minOf(sf.size, i + 6)).forEach { sfOut.append("[$i] ").append(it).append('\n') }
        }
        section(sb, "SurfaceFlinger dump (${sf.size} lines, game parts)", sfOut.toString().take(12000))

        val gpu = Shell.exec(arrayOf("dumpsys", "gpu"), 4000).out
        val gi = gpu.indexOf("appPackageName = $pkg")
        section(sb, "gpustats", if (gi >= 0) gpu.substring(gi, minOf(gpu.length, gi + 900)) else "(no entry)")
        section(sb, "gpuwork", Shell.exec(arrayOf("dumpsys", "gpu", "--gpuwork"), 4000).out.take(3000))
        section(sb, "kgsl x5", Shell.sh("for i in 1 2 3 4 5; do cat /sys/class/kgsl/kgsl-3d0/gpu_busy_percentage /sys/class/kgsl/kgsl-3d0/gpubusy /sys/class/kgsl/kgsl-3d0/devfreq/cur_freq 2>&1 | tr '\\n' ' '; echo; sleep 0.2; done; ls /sys/class/kgsl/kgsl-3d0/ /sys/class/devfreq/ 2>&1 | head -c 3000", 6000).out)
        section(sb, "processes", Shell.sh("ps -A -o PID,NAME | grep '$pkg'", 3000).out)
        section(sb, "gpu nodes", Shell.sh(
            "for f in /sys/class/kgsl/kgsl-3d0/gpu_busy_percentage /sys/class/kgsl/kgsl-3d0/gpubusy /sys/class/kgsl/kgsl-3d0/gpuclk /sys/kernel/gpu/gpu_busy; do echo \"\$f: \$(cat \$f 2>&1 | head -c 80)\"; done", 3000
        ).out)
        return sb.toString()
    }

    /** Writes the report, copies it to the clipboard and opens the share sheet. */
    fun share(ctx: Context, text: String) {
        val dir = File(ctx.cacheDir, "export").apply { mkdirs() }
        val f = File(dir, "etx-report.txt").apply { writeText(text) }
        runCatching {
            ctx.getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("Elite Tuner X report", text))
        }
        val uri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.files", f)
        val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_STREAM, uri)
            .putExtra(Intent.EXTRA_TEXT, text.take(60000)).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        ctx.startActivity(Intent.createChooser(send, "ส่งรายงาน").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}
