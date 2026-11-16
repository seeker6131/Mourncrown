/*
  Elite Tuner X — ESP32 companion display + tuning buttons (protocol v1)

  Hardware (example): any ESP32 + 320x240 TFT driven by TFT_eSPI
  (e.g. the "Cheap Yellow Display" ESP32-2432S028), plus up to 3 push buttons to GND.

  Libraries (Arduino Library Manager):
    - TFT_eSPI   (configure User_Setup.h for your screen)
    - ArduinoJson 7.x

  Phone side: Elite Tuner X → ⚙ → ESP32 → turn on, copy the 6-letter device key into ETX_KEY.
  Phone and ESP32 must be on the same Wi-Fi (or the ESP32 joins the phone's hotspot).

  Packets:
    phone → ESP32  UDP 4210  {"v":1,"key":"..","fps":59.8,"res":"1920x1080","gpu":63,...}
    ESP32 → phone  UDP 4211  {"key":"..","cmd":"fps","value":"60"}
*/
#include <WiFi.h>
#include <WiFiUdp.h>
#include <ArduinoJson.h>
#include <TFT_eSPI.h>

// ------------------------------------------------------------------ settings
const char* WIFI_SSID = "YOUR_WIFI";
const char* WIFI_PASS = "YOUR_PASSWORD";
const char* ETX_KEY   = "ABC123";      // device key shown in the app

const int BTN_FPS   = 0;   // cycles FPS cap: off → 30 → 45 → 60 → 90 → 120   (-1 = not wired)
const int BTN_SCALE = -1;  // cycles render scale 100 → 90 → 80 → 70 %
const int BTN_REC   = -1;  // start / stop session recording

const uint16_t PORT_IN  = 4210;  // telemetry from phone
const uint16_t PORT_OUT = 4211;  // commands to phone

// ------------------------------------------------------------------ state
WiFiUDP udp;
TFT_eSPI tft;
IPAddress phone;
bool havePhone = false;
unsigned long lastPacket = 0, lastHello = 0, lastDraw = 0;
char ackMsg[96] = "";
unsigned long ackAt = 0;

struct T {
  float fps = -1, ft = -1, gpuT = -1, cpuT = -1, w = -1, batT = -1, ram = -1, cpuGhz = -1;
  int gpu = -1, cpu = -1, gpuMhz = -1, hz = -1, gameCpu = -1, gameRamMb = -1, ramT = -1;
  char res[16] = "", api[24] = "", game[40] = "", gpuName[32] = "", th[16] = "";
  bool rec = false;
} t;

const int fpsSteps[] = {0, 30, 45, 60, 90, 120};
int fpsIdx = 0;
const char* scaleSteps[] = {"1.0", "0.9", "0.8", "0.7"};
int scaleIdx = 0;

// ------------------------------------------------------------------ helpers
void sendCmd(const char* cmd, const char* value) {
  if (!havePhone) return;
  JsonDocument d;
  d["key"] = ETX_KEY;
  d["cmd"] = cmd;
  if (value) d["value"] = value;
  char buf[128];
  size_t n = serializeJson(d, buf);
  udp.beginPacket(phone, PORT_OUT);
  udp.write((const uint8_t*)buf, n);
  udp.endPacket();
}

uint16_t fpsColor(float v) {
  if (v < 0) return TFT_DARKGREY;
  if (v >= 55) return TFT_GREEN;
  if (v >= 30) return TFT_YELLOW;
  return TFT_RED;
}

uint16_t tempColor(float v) {
  if (v < 0) return TFT_DARKGREY;
  if (v < 60) return TFT_CYAN;
  if (v < 75) return TFT_YELLOW;
  return TFT_RED;
}

void bar(int x, int y, int w, int h, int pct, uint16_t c) {
  tft.drawRoundRect(x, y, w, h, h / 2, TFT_DARKGREY);
  int fw = pct < 0 ? 0 : (w - 2) * min(pct, 100) / 100;
  tft.fillRoundRect(x + 1, y + 1, w - 2, h - 2, (h - 2) / 2, TFT_BLACK);
  if (fw > 0) tft.fillRoundRect(x + 1, y + 1, fw, h - 2, (h - 2) / 2, c);
}

void draw() {
  tft.fillRect(0, 0, 320, 240, TFT_BLACK);
  if (!havePhone || millis() - lastPacket > 3000) {
    tft.setTextColor(TFT_CYAN, TFT_BLACK);
    tft.drawString("ELITE TUNER X", 10, 10, 4);
    tft.setTextColor(TFT_WHITE, TFT_BLACK);
    tft.drawString(WiFi.status() == WL_CONNECTED ? "Waiting for phone..." : "Connecting Wi-Fi...", 10, 60, 2);
    tft.drawString(WiFi.localIP().toString(), 10, 85, 2);
    return;
  }
  // header: game + resolution
  tft.setTextColor(TFT_LIGHTGREY, TFT_BLACK);
  tft.drawString(t.game, 8, 4, 2);
  tft.setTextColor(TFT_CYAN, TFT_BLACK);
  tft.setTextDatum(TR_DATUM);
  tft.drawString(t.res, 312, 4, 2);
  tft.setTextDatum(TL_DATUM);

  // FPS big
  char b[32];
  snprintf(b, sizeof b, t.fps < 0 ? "--" : "%.0f", t.fps);
  tft.setTextColor(fpsColor(t.fps), TFT_BLACK);
  tft.drawString(b, 8, 26, 8);
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.drawString("FPS", 150, 34, 4);
  snprintf(b, sizeof b, "%.1f ms", t.ft);
  tft.drawString(t.ft < 0 ? "" : b, 150, 64, 2);
  snprintf(b, sizeof b, "%d Hz  %s", t.hz, t.api);
  tft.setTextColor(0xB47F, TFT_BLACK);
  tft.drawString(b, 150, 84, 2);

  // GPU
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  snprintf(b, sizeof b, "GPU %d%%  %dMHz", t.gpu, t.gpuMhz);
  tft.drawString(b, 8, 112, 2);
  tft.setTextColor(tempColor(t.gpuT), TFT_BLACK);
  snprintf(b, sizeof b, "%.0fC", t.gpuT);
  tft.drawString(b, 270, 112, 2);
  bar(8, 130, 304, 10, t.gpu, TFT_CYAN);

  // CPU
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  snprintf(b, sizeof b, "CPU %d%%  game %d%%  %.2fGHz", t.cpu, t.gameCpu, t.cpuGhz);
  tft.drawString(b, 8, 148, 2);
  tft.setTextColor(tempColor(t.cpuT), TFT_BLACK);
  snprintf(b, sizeof b, "%.0fC", t.cpuT);
  tft.drawString(b, 270, 148, 2);
  bar(8, 166, 304, 10, t.cpu, 0xB47F);

  // footer
  tft.setTextColor(TFT_LIGHTGREY, TFT_BLACK);
  snprintf(b, sizeof b, "RAM %.1f/%dGB", t.ram, t.ramT);
  tft.drawString(b, 8, 186, 2);
  snprintf(b, sizeof b, "%.1fW  BAT %.0fC", t.w, t.batT);
  tft.drawString(b, 170, 186, 2);
  tft.drawString(t.gpuName, 8, 204, 2);
  if (t.rec) { tft.fillCircle(304, 210, 6, TFT_RED); }

  if (ackAt && millis() - ackAt < 3000) {
    tft.setTextColor(TFT_GREEN, TFT_BLACK);
    tft.drawString(ackMsg, 8, 222, 2);
  }
}

void readPacket() {
  int n = udp.parsePacket();
  if (n <= 0) return;
  static char buf[768];
  int len = udp.read(buf, sizeof(buf) - 1);
  if (len <= 0) return;
  buf[len] = 0;
  JsonDocument d;
  if (deserializeJson(d, buf)) return;
  if (strcmp(d["key"] | "", ETX_KEY) != 0) return;  // not our phone

  if (!havePhone || phone != udp.remoteIP()) { phone = udp.remoteIP(); havePhone = true; }
  lastPacket = millis();

  if (d["ack"].is<const char*>()) {
    strlcpy(ackMsg, d["msg"] | "", sizeof ackMsg);
    ackAt = millis();
    return;
  }
  t.fps = d["fps"] | -1.0f;   t.ft = d["ft"] | -1.0f;
  t.gpu = d["gpu"] | -1;      t.gpuMhz = d["gpuMhz"] | -1;  t.gpuT = d["gpuT"] | -1.0f;
  t.cpu = d["cpu"] | -1;      t.cpuGhz = d["cpuGhz"] | -1.0f; t.cpuT = d["cpuT"] | -1.0f;
  t.gameCpu = d["gameCpu"] | -1; t.gameRamMb = d["gameRamMb"] | -1;
  t.ram = d["ram"] | -1.0f;   t.ramT = d["ramT"] | -1;
  t.w = d["w"] | -1.0f;       t.batT = d["batT"] | -1.0f;
  t.hz = d["hz"] | -1;        t.rec = d["rec"] | false;
  strlcpy(t.res, d["res"] | "", sizeof t.res);
  strlcpy(t.api, d["api"] | "", sizeof t.api);
  strlcpy(t.game, d["game"] | "", sizeof t.game);
  strlcpy(t.gpuName, d["gpuName"] | "", sizeof t.gpuName);
  strlcpy(t.th, d["th"] | "", sizeof t.th);
}

bool pressed(int pin) {
  if (pin < 0) return false;
  static unsigned long last[40] = {0};
  if (digitalRead(pin) == LOW && millis() - last[pin] > 350) { last[pin] = millis(); return true; }
  return false;
}

// ------------------------------------------------------------------ main
void setup() {
  Serial.begin(115200);
  if (BTN_FPS >= 0) pinMode(BTN_FPS, INPUT_PULLUP);
  if (BTN_SCALE >= 0) pinMode(BTN_SCALE, INPUT_PULLUP);
  if (BTN_REC >= 0) pinMode(BTN_REC, INPUT_PULLUP);
  tft.init();
  tft.setRotation(1);
  tft.fillScreen(TFT_BLACK);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  udp.begin(PORT_IN);
}

void loop() {
  readPacket();

  // Ask the phone to send straight to us (instead of broadcast) every few seconds.
  if (havePhone && millis() - lastHello > 5000) { lastHello = millis(); sendCmd("hello", nullptr); }

  if (pressed(BTN_FPS)) {
    fpsIdx = (fpsIdx + 1) % (sizeof(fpsSteps) / sizeof(fpsSteps[0]));
    char v[8]; snprintf(v, sizeof v, "%d", fpsSteps[fpsIdx]);
    sendCmd("fps", v);
  }
  if (pressed(BTN_SCALE)) {
    scaleIdx = (scaleIdx + 1) % (sizeof(scaleSteps) / sizeof(scaleSteps[0]));
    sendCmd("scale", scaleSteps[scaleIdx]);
  }
  if (pressed(BTN_REC)) sendCmd("rec", nullptr);

  if (millis() - lastDraw > 250) { lastDraw = millis(); draw(); }
}
