package com.elitetunerx.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.elitetunerx.core.Reading
import java.util.Locale

val Bg = Color(0xFF05080F)
val Panel = Color(0xFF0D1422)
val Panel2 = Color(0xFF141E31)
val Line = Color(0xFF1E2B44)
val Cyan = Color(0xFF5AE1FF)
val Purple = Color(0xFFAA8CFF)
val Pink = Color(0xFFFF6FD8)
val Muted = Color(0xFF8A9BB4)
val Good = Color(0xFF50FFA0)
val Warn = Color(0xFFFFD25A)
val Bad = Color(0xFFFF5A64)
val Accent = Brush.linearGradient(listOf(Cyan, Purple))

@Composable
fun ScreenColumn(content: @Composable ColumnScope.() -> Unit) {
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 14.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp), content = content
    )
}

@Composable
fun Header(title: String, sub: String, trailing: (@Composable () -> Unit)? = null) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(title, style = androidx.compose.ui.text.TextStyle(brush = Accent), fontSize = 26.sp, fontWeight = FontWeight.Black)
            Text(sub, color = Muted, fontSize = 11.sp, lineHeight = 14.sp)
        }
        trailing?.invoke()
    }
}

/** Small "?" explanation block: what this menu does, in plain Thai. */
@Composable
fun HelpToggle(help: String) {
    var open by remember { mutableStateOf(false) }
    Column {
        Text(
            if (open) "▾ ซ่อนคำอธิบาย" else "ⓘ ใช้ทำอะไร?",
            color = Purple, fontSize = 11.sp, fontWeight = FontWeight.SemiBold,
            modifier = Modifier.clip(RoundedCornerShape(8.dp)).clickable { open = !open }.padding(vertical = 2.dp)
        )
        AnimatedVisibility(open) {
            Text(
                help, color = Color(0xFFC9D6EA), fontSize = 12.sp, lineHeight = 17.sp,
                modifier = Modifier.padding(top = 6.dp).fillMaxWidth().clip(RoundedCornerShape(10.dp))
                    .background(Panel2).padding(10.dp)
            )
        }
    }
}

@Composable
fun PanelCard(title: String, modifier: Modifier = Modifier, help: String? = null, content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Panel)
            .border(1.dp, Line, RoundedCornerShape(18.dp)).padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(width = 3.dp, height = 14.dp).clip(RoundedCornerShape(2.dp)).background(Accent))
            Text(title, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 13.sp, modifier = Modifier.padding(start = 8.dp))
        }
        if (help != null) HelpToggle(help)
        content()
    }
}

@Composable
fun Metric(title: String, r: Reading, modifier: Modifier = Modifier, accent: Color = Cyan, showSource: Boolean = true) {
    Column(
        modifier.clip(RoundedCornerShape(16.dp)).background(Panel).border(1.dp, Line, RoundedCornerShape(16.dp)).padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp)
    ) {
        Text(title, color = accent, fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
        Text(r.text, color = if (r.ok) Color.White else Muted, fontSize = 20.sp, fontWeight = FontWeight.Bold)
        if (showSource) Text(r.source, color = Muted, fontSize = 9.sp, lineHeight = 11.sp, maxLines = 2)
    }
}

@Composable
fun BigStat(value: String, unit: String, label: String, color: Color, modifier: Modifier = Modifier) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Row(verticalAlignment = Alignment.Bottom) {
            Text(value, color = color, fontSize = 40.sp, fontWeight = FontWeight.Black)
            Text(unit, color = Muted, fontSize = 12.sp, modifier = Modifier.padding(start = 3.dp, bottom = 8.dp))
        }
        Text(label, color = Muted, fontSize = 10.sp, textAlign = TextAlign.Center)
    }
}

@Composable
fun LoadBar(pct: Double?, modifier: Modifier = Modifier) {
    val v = ((pct ?: 0.0) / 100.0).coerceIn(0.0, 1.0).toFloat()
    Box(modifier.fillMaxWidth().height(6.dp).clip(CircleShape).background(Color(0x22FFFFFF))) {
        if (v > 0f) Box(
            Modifier.fillMaxWidth(v).height(6.dp).clip(CircleShape)
                .background(Brush.horizontalGradient(listOf(Cyan, if ((pct ?: 0.0) > 85) Bad else Purple)))
        )
    }
}

@Composable
fun StatusPill(text: String, color: Color) {
    Row(
        Modifier.clip(CircleShape).background(color.copy(alpha = 0.14f)).padding(horizontal = 10.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(Modifier.size(7.dp).clip(CircleShape).background(color))
        Text(text, color = color, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(start = 6.dp))
    }
}

@Composable
fun Body(text: String, color: Color = Muted, size: Int = 12) = Text(text, color = color, fontSize = size.sp, lineHeight = (size + 5).sp)

@Composable
fun Step(n: Int, text: String, done: Boolean = false) {
    Row(verticalAlignment = Alignment.Top) {
        Box(
            Modifier.size(22.dp).clip(CircleShape).background(if (done) Good else Panel2),
            contentAlignment = Alignment.Center
        ) { Text(if (done) "✓" else "$n", color = if (done) Bg else Cyan, fontSize = 11.sp, fontWeight = FontWeight.Bold) }
        Text(text, color = Color(0xFFD5E0F0), fontSize = 12.sp, lineHeight = 17.sp, modifier = Modifier.padding(start = 10.dp, top = 2.dp))
    }
}

@Composable
fun Mono(text: String, color: Color = Color.White) =
    Text(text, color = color, fontSize = 11.sp, fontFamily = FontFamily.Monospace, lineHeight = 14.sp)

@Composable
fun PrimaryButton(text: String, modifier: Modifier = Modifier, enabled: Boolean = true, onClick: () -> Unit) =
    Button(
        onClick, modifier, enabled = enabled, shape = RoundedCornerShape(14.dp),
        colors = ButtonDefaults.buttonColors(containerColor = Cyan, contentColor = Bg),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp)
    ) { Text(text, fontWeight = FontWeight.Bold, fontSize = 13.sp) }

@Composable
fun SecondaryButton(text: String, modifier: Modifier = Modifier, enabled: Boolean = true, onClick: () -> Unit) =
    OutlinedButton(
        onClick, modifier, enabled = enabled, shape = RoundedCornerShape(14.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, if (enabled) Purple.copy(alpha = 0.6f) else Line),
        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 10.dp)
    ) { Text(text, color = if (enabled) Color.White else Muted, fontSize = 13.sp) }

fun fmt(v: Double?, pattern: String = "%.1f", unit: String = ""): String =
    v?.let { String.format(Locale.US, pattern, it) + unit } ?: "N/A"
