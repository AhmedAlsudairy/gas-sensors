/*
  Gas Sensor Arduino Sketch
  ─────────────────────────
  Wiring (based on circuit diagram):
    MQ-2   → A0  (combustible gas / smoke)
    MQ-136 → A1  (hydrogen sulfide H₂S)
    MQ-7   → A2  (carbon monoxide CO)
    Buzzer → D8  (active buzzer, active-HIGH)

  The Raspberry Pi reads Serial at 115200 baud.
  Every 800 ms the Arduino prints one JSON line:
    {"mq2":412.3,"mq136":8.1,"mq7":55.7,"buzzer":false}

  Calibration (RL values & R0) – adjust SENSOR_x_R0 to match your
  sensors after a 24 h burn-in in clean air.
*/

// ── Pin assignments ────────────────────────────────────────────────────────────
const int PIN_MQ2   = A0;
const int PIN_MQ136 = A1;
const int PIN_MQ7   = A2;
const int PIN_BUZZER = 8;

// ── Load resistance in kΩ (the 1 kΩ resistor on sensor board) ─────────────────
const float RL_MQ2   = 1.0;
const float RL_MQ136 = 1.0;
const float RL_MQ7   = 1.0;

// ── R0 values – measure in clean air and set here (typical values) ─────────────
float R0_MQ2   = 9.83;   // kΩ in clean air
float R0_MQ136 = 3.60;
float R0_MQ7   = 27.5;

// ── Danger thresholds (ppm) that trigger the onboard buzzer ───────────────────
const float THRESHOLD_MQ2   = 1000.0;
const float THRESHOLD_MQ136 = 50.0;
const float THRESHOLD_MQ7   = 200.0;

// ── ADC reference voltage ──────────────────────────────────────────────────────
const float VCC = 5.0;

// ── Read Rs from raw ADC ───────────────────────────────────────────────────────
float readRs(int pin, float rl) {
  int raw = analogRead(pin);
  if (raw <= 0) raw = 1;              // avoid divide-by-zero
  float vout = (raw / 1023.0) * VCC;
  if (vout <= 0) vout = 0.001;
  return rl * (VCC - vout) / vout;    // Rs = RL * (VCC-Vout) / Vout
}

// ── MQ-2  curve: LPG/Propane dominant – datasheet log-log coefficients ─────────
float mq2ToPpm(float rs) {
  float ratio = rs / R0_MQ2;
  // PPM = 10^( (log(ratio) - b) / m )  from datasheet curve fit
  return 987.99 * pow(ratio, -2.162);
}

// ── MQ-136 curve: H₂S dominant ────────────────────────────────────────────────
float mq136ToPpm(float rs) {
  float ratio = rs / R0_MQ136;
  return 116.6020682 * pow(ratio, -2.769034857);
}

// ── MQ-7 curve: CO dominant ───────────────────────────────────────────────────
float mq7ToPpm(float rs) {
  float ratio = rs / R0_MQ7;
  return 99.042 * pow(ratio, -1.518);
}

// ── Setup ──────────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  pinMode(PIN_BUZZER, OUTPUT);
  digitalWrite(PIN_BUZZER, LOW);

  // Warm-up message
  Serial.println("{\"status\":\"warming_up\"}");
  delay(20000);   // MQ sensors need ~20 s preheat
  Serial.println("{\"status\":\"ready\"}");
}

// ── Loop ───────────────────────────────────────────────────────────────────────
void loop() {
  // Average 5 samples to reduce noise
  float rs2 = 0, rs136 = 0, rs7 = 0;
  for (int i = 0; i < 5; i++) {
    rs2   += readRs(PIN_MQ2,   RL_MQ2);
    rs136 += readRs(PIN_MQ136, RL_MQ136);
    rs7   += readRs(PIN_MQ7,   RL_MQ7);
    delay(20);
  }
  rs2 /= 5; rs136 /= 5; rs7 /= 5;

  float ppm2   = mq2ToPpm(rs2);
  float ppm136 = mq136ToPpm(rs136);
  float ppm7   = mq7ToPpm(rs7);

  // Clamp negatives (sensor noise)
  if (ppm2   < 0) ppm2   = 0;
  if (ppm136 < 0) ppm136 = 0;
  if (ppm7   < 0) ppm7   = 0;

  // Buzzer – activate if any sensor exceeds danger threshold
  bool danger = (ppm2 >= THRESHOLD_MQ2) ||
                (ppm136 >= THRESHOLD_MQ136) ||
                (ppm7   >= THRESHOLD_MQ7);
  digitalWrite(PIN_BUZZER, danger ? HIGH : LOW);

  // Emit compact JSON over Serial (Raspberry Pi reads this)
  Serial.print("{\"mq2\":");
  Serial.print(ppm2, 1);
  Serial.print(",\"mq136\":");
  Serial.print(ppm136, 1);
  Serial.print(",\"mq7\":");
  Serial.print(ppm7, 1);
  Serial.print(",\"buzzer\":");
  Serial.print(danger ? "true" : "false");
  Serial.println("}");

  delay(800);  // ~1 reading per second after sampling overhead
}
