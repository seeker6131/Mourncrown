package com.elitetunerx

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.sp
import com.elitetunerx.core.Telemetry
import com.elitetunerx.ui.Bg
import com.elitetunerx.ui.Cyan
import com.elitetunerx.ui.HomeScreen
import com.elitetunerx.ui.HudScreen
import com.elitetunerx.ui.LabScreen
import com.elitetunerx.ui.Muted
import com.elitetunerx.ui.Nav
import com.elitetunerx.ui.Panel
import com.elitetunerx.ui.Purple
import com.elitetunerx.ui.SessionsScreen
import com.elitetunerx.ui.SettingsScreen
import com.elitetunerx.ui.TuneScreen
import rikka.shizuku.Shizuku

class MainActivity : ComponentActivity() {
    private val permListener = Shizuku.OnRequestPermissionResultListener { _, _ -> }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        runCatching { Shizuku.addRequestPermissionResultListener(permListener) }
        setContent { EtxApp() }
    }

    override fun onDestroy() {
        runCatching { Shizuku.removeRequestPermissionResultListener(permListener) }
        super.onDestroy()
    }

    override fun onStart() {
        super.onStart()
        Telemetry.acquire(this)
    }

    override fun onStop() {
        Telemetry.release()
        super.onStop()
    }
}

@Composable
private fun EtxApp() {
    val tabs = listOf("◉" to "หน้าหลัก", "▣" to "HUD", "⚡" to "จูน", "⚗" to "แล็บ", "≡" to "เซสชัน")
    MaterialTheme(colorScheme = darkColorScheme(background = Bg, surface = Panel, primary = Cyan, secondary = Purple)) {
        val overlay = Nav.overlay.value
        BackHandler(enabled = overlay != null) { Nav.close() }
        Scaffold(
            containerColor = Bg,
            bottomBar = {
                if (overlay == null) NavigationBar(containerColor = Panel) {
                    tabs.forEachIndexed { i, (icon, label) ->
                        NavigationBarItem(
                            selected = Nav.tab.value == i, onClick = { Nav.go(i) },
                            icon = { Text(icon, fontSize = 18.sp) }, label = { Text(label, fontSize = 11.sp) },
                            colors = NavigationBarItemDefaults.colors(
                                selectedIconColor = Bg, indicatorColor = Cyan, unselectedIconColor = Muted,
                                unselectedTextColor = Muted, selectedTextColor = Cyan
                            )
                        )
                    }
                }
            }
        ) { pad ->
            Box(Modifier.padding(pad).fillMaxSize()) {
                if (overlay != null) SettingsScreen(overlay)
                else when (Nav.tab.value) {
                    Nav.TAB_HOME -> HomeScreen()
                    Nav.TAB_HUD -> HudScreen()
                    Nav.TAB_TUNE -> TuneScreen()
                    Nav.TAB_LAB -> LabScreen()
                    else -> SessionsScreen()
                }
            }
        }
    }
}
