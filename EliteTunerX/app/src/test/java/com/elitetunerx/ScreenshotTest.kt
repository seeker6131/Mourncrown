package com.elitetunerx

import android.widget.FrameLayout
import androidx.activity.compose.LocalActivityResultRegistryOwner
import androidx.activity.result.ActivityResultRegistry
import androidx.activity.result.ActivityResultRegistryOwner
import androidx.activity.result.contract.ActivityResultContract
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.core.app.ActivityOptionsCompat
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.ui.Modifier
import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.Paparazzi
import com.elitetunerx.core.ClusterFreq
import com.elitetunerx.core.GameInfo
import com.elitetunerx.core.Reading
import com.elitetunerx.core.Shell
import com.elitetunerx.core.Snapshot
import com.elitetunerx.core.Telemetry
import com.elitetunerx.hud.HudConfig
import com.elitetunerx.hud.HudView
import com.elitetunerx.ui.Bg
import com.elitetunerx.ui.Cyan
import com.elitetunerx.ui.HomeScreen
import com.elitetunerx.ui.HudScreen
import com.elitetunerx.ui.Purple
import org.junit.Rule
import org.junit.Test
import kotlin.math.sin

/** Renders the HUD and screens with sample numbers so the design can be reviewed without a phone. */
class ScreenshotTest {
    @get:Rule
    val paparazzi = Paparazzi(deviceConfig = DeviceConfig.PIXEL_6, theme = "android:Theme.Material.NoActionBar")

    private fun sample(): Snapshot {
        val ft = (0 until 120).map { 16.6 + 1.5 * sin(it / 5.0) + if (it == 70) 28.0 else 0.0 }
        return Snapshot(
            timeMs = 1, shell = Shell.State.READY, fgPackage = "com.example.racing",
            fps = Reading(59.6, "59.6", "SurfaceFlinger"), frameTime = Reading(16.8, "16.78 ms", "SurfaceFlinger"),
            newFrameTimes = ft,
            gpuBusy = Reading(63.0, "63%", "Adreno kgsl"), gpuFreq = Reading(850.0, "850 MHz", "kgsl"),
            gpuTemp = Reading(52.4, "52.4 °C", "kgsl"), gpuModel = "Adreno830v2",
            gpuName = "Adreno 830", game = GameInfo(
                "com.example.racing", "Asphalt Racing", 1920, 1080, 2400, 1080, 120.0, "Vulkan", 2150.0, 22.0
            ), backend = Shell.Backend.ADB,
            cpuUsage = Reading(41.0, "41%", "/proc/stat"),
            clusters = listOf(ClusterFreq("CPU0-5", 3533.0, 3533.0), ClusterFreq("CPU6-7", 4320.0, 4320.0)),
            cpuTemp = Reading(61.0, "61.0 °C", "tz"), skinTemp = Reading(39.0, "39.0 °C", "tz"),
            batteryTemp = Reading(37.5, "37.5 °C", "BatteryManager"), power = Reading(6.4, "6.40 W", "battery"),
            charging = false, ramUsedGb = 7.8, ramTotalGb = 11.2, thermalStatus = "Nominal",
            headroom = Reading(54.0, "54%", "PowerManager"),
        )
    }

    private fun hud(style: Int) {
        val v = HudView(paparazzi.context)
        v.cfg = HudConfig(style = style)
        v.pushFrames(sample().newFrameTimes)
        v.update(sample(), if (style == HudView.STYLE_FULL) "REC 01:12 • 4302 เฟรม" else null)
        val frame = FrameLayout(paparazzi.context).apply {
            setBackgroundColor(0xFF3A5A40.toInt())
            setPadding(40, 40, 40, 40)
            addView(v, FrameLayout.LayoutParams(-2, -2))
        }
        paparazzi.snapshot(frame)
    }

    @Test fun hudFull() = hud(HudView.STYLE_FULL)
    @Test fun hudBar() = hud(HudView.STYLE_BAR)
    @Test fun hudMini() = hud(HudView.STYLE_MINI)

    private val owner = object : ActivityResultRegistryOwner {
        override val activityResultRegistry = object : ActivityResultRegistry() {
            override fun <I, O> onLaunch(requestCode: Int, contract: ActivityResultContract<I, O>, input: I, options: ActivityOptionsCompat?) {}
        }
    }

    @Composable
    private fun Frame(content: @Composable () -> Unit) {
        CompositionLocalProvider(LocalActivityResultRegistryOwner provides owner) {
            MaterialTheme(colorScheme = darkColorScheme(background = Bg, primary = Cyan, secondary = Purple)) {
                Box(Modifier.fillMaxSize().background(Bg)) { content() }
            }
        }
    }

    @Test fun home() {
        Telemetry.snapshot.value = sample()
        paparazzi.snapshot { Frame { HomeScreen() } }
    }

    @Test fun hudSettings() {
        Telemetry.snapshot.value = sample()
        paparazzi.snapshot { Frame { HudScreen() } }
    }
}
