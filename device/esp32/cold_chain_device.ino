#include <Arduino.h>
#include <DHT.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <math.h>

#include "config.h"

DHT dht(DHT_PIN, DHT_TYPE);

bool validDeviceId(const char *value) {
  size_t length = 0;
  for (const char *p = value; *p != '\0'; ++p) {
    const char c = *p;
    if (!((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') ||
          (c >= '0' && c <= '9') || c == '-' || c == '_')) {
      return false;
    }
    ++length;
    if (length > 100) {
      return false;
    }
  }
  return length > 0;
}

bool connectWifi() {
  if (WiFi.status() == WL_CONNECTED) {
    return true;
  }

  Serial.println("Wi-Fi disconnected; connecting...");
  WiFi.disconnect();
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  const uint32_t startedAt = millis();
  while (WiFi.status() != WL_CONNECTED &&
         static_cast<uint32_t>(millis() - startedAt) < WIFI_CONNECT_TIMEOUT_MS) {
    delay(250);
  }

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Wi-Fi connection timed out; next sample will retry.");
    WiFi.disconnect();
    return false;
  }

  Serial.print("Wi-Fi connected, IP: ");
  Serial.println(WiFi.localIP());
  return true;
}

bool validReading(float temperatureC, float humidityPct) {
  return isfinite(temperatureC) && isfinite(humidityPct) &&
         temperatureC >= SENSOR_TEMP_MIN_C &&
         temperatureC <= SENSOR_TEMP_MAX_C && humidityPct >= 0.0f &&
         humidityPct <= 100.0f;
}

bool sendTelemetry(float temperatureC, float humidityPct) {
  if (!connectWifi()) {
    return false;
  }

  String endpoint = String(API_BASE_URL);
  if (endpoint.endsWith("/")) {
    endpoint.remove(endpoint.length() - 1);
  }
  endpoint += String("/api/v1/shipments/") + SHIPMENT_ID + "/telemetry";
  const String payload = String("{\"device_id\":\"") + DEVICE_ID +
                         "\",\"temperature_c\":" + String(temperatureC, 2) +
                         ",\"humidity_pct\":" + String(humidityPct, 2) + "}";

  for (int attempt = 1; attempt <= MAX_POST_ATTEMPTS; ++attempt) {
    if (WiFi.status() != WL_CONNECTED && !connectWifi()) {
      return false;
    }

    WiFiClient client;
    HTTPClient http;
    http.setConnectTimeout(HTTP_TIMEOUT_MS);
    http.setTimeout(HTTP_TIMEOUT_MS);

    if (!http.begin(client, endpoint)) {
      Serial.println("HTTP request initialization failed.");
      return false;
    }

    http.addHeader("Content-Type", "application/json");
    const int status = http.POST(payload);
    if (status >= 200 && status < 300) {
      Serial.printf("Telemetry accepted (HTTP %d).\n", status);
      http.end();
      return true;
    }

    if (status > 0) {
      Serial.printf("Telemetry rejected: HTTP %d (attempt %d/%d).\n", status,
                    attempt, MAX_POST_ATTEMPTS);
    } else {
      Serial.printf("Telemetry connection error: %s (attempt %d/%d).\n",
                    http.errorToString(status).c_str(), attempt,
                    MAX_POST_ATTEMPTS);
    }
    http.end();

    // A client error usually means configuration or payload is wrong.
    if (status >= 400 && status < 500 && status != 429) {
      Serial.println("Client error; fix configuration before the next sample.");
      return false;
    }
    if (attempt < MAX_POST_ATTEMPTS) {
      delay(RETRY_DELAY_MS);
    }
  }

  Serial.println("Telemetry delivery failed after bounded retries.");
  return false;
}

void setup() {
  Serial.begin(115200);
  dht.begin();
  WiFi.mode(WIFI_STA);

  if (!validDeviceId(DEVICE_ID)) {
    Serial.println("Invalid DEVICE_ID: use 1-100 ASCII letters, digits, - or _.");
    return;
  }
  if (MAX_POST_ATTEMPTS < 1 || SAMPLE_INTERVAL_MS < 2000UL ||
      WIFI_CONNECT_TIMEOUT_MS < 250UL || HTTP_TIMEOUT_MS < 1) {
    Serial.println("Invalid timing/retry configuration in config.h.");
    return;
  }

  Serial.println("Cold-chain telemetry device ready.");
}

void loop() {
  static bool firstSample = true;
  static uint32_t lastSampleAt = 0;

  if (!validDeviceId(DEVICE_ID) || MAX_POST_ATTEMPTS < 1 ||
      SAMPLE_INTERVAL_MS < 2000UL || WIFI_CONNECT_TIMEOUT_MS < 250UL ||
      HTTP_TIMEOUT_MS < 1) {
    delay(1000);
    return;
  }

  const uint32_t now = millis();
  if (!firstSample && static_cast<uint32_t>(now - lastSampleAt) <
                          SAMPLE_INTERVAL_MS) {
    delay(50);
    return;
  }
  firstSample = false;
  lastSampleAt = now;

  const float humidityPct = dht.readHumidity();
  const float temperatureC = dht.readTemperature();
  if (!validReading(temperatureC, humidityPct)) {
    Serial.printf("Sensor reading invalid: temperature=%.2f C, humidity=%.2f %%. Skipping.\n",
                  temperatureC, humidityPct);
    return;
  }

  Serial.printf("Reading: %.2f C, %.2f %% RH.\n", temperatureC,
                humidityPct);
  sendTelemetry(temperatureC, humidityPct);
}
