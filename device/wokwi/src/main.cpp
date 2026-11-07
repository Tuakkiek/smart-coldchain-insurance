#include <Arduino.h>
#include <DHTesp.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <math.h>
#include <time.h>

#include <mbedtls/base64.h>
#include <mbedtls/ctr_drbg.h>
#include <mbedtls/ecdsa.h>
#include <mbedtls/entropy.h>
#include <mbedtls/md.h>
#include <mbedtls/pk.h>
#include <mbedtls/version.h>

#include "../config.h"

namespace {
constexpr int kDhtPin = 4;
constexpr uint32_t kSampleIntervalMs = 60000;
constexpr int kHttpTimeoutMs = 30000;
constexpr char kFirmwareVersion[] = "wokwi-1.0";

DHTesp sensor;
Preferences preferences;
mbedtls_pk_context signingKey;
mbedtls_entropy_context entropy;
mbedtls_ctr_drbg_context randomGenerator;
bool ready = false;
bool clockRequested = false;

bool connectWifi() {
  if (WiFi.status() == WL_CONNECTED) return true;
  WiFi.begin("Wokwi-GUEST", "", 6);
  Serial.print("Connecting to Wokwi-GUEST");
  for (int i = 0; i < 80 && WiFi.status() != WL_CONNECTED; ++i) {
    delay(250);
    Serial.print(".");
  }
  Serial.println();
  return WiFi.status() == WL_CONNECTED;
}

bool currentUtc(char *result, size_t capacity) {
  time_t now = time(nullptr);
  if (now < 1700000000) return false;
  struct tm utc;
  gmtime_r(&now, &utc);
  return strftime(result, capacity, "%Y-%m-%dT%H:%M:%SZ", &utc) != 0;
}

String canonicalMessage(uint32_t sequence, int temperatureMilli, int humidityMilli,
                        const char *recordedAt) {
  // Exact ASCII key order and separators from SIGNED-TELEMETRY-v1.
  return String("{\"device_id\":\"") + DEVICE_ID +
         "\",\"firmware_version\":\"" + kFirmwareVersion +
         "\",\"humidity_milli_pct\":" + String(humidityMilli) +
         ",\"key_id\":\"" + KEY_ID +
         "\",\"payload_version\":1,\"recorded_at\":\"" + recordedAt +
         "\",\"sequence_number\":" + String(sequence) +
         ",\"shipment_id\":\"" + SHIPMENT_ID +
         "\",\"temperature_milli_c\":" + String(temperatureMilli) + "}";
}

bool signMessage(const String &message, String &encoded) {
  unsigned char digest[32];
  unsigned char signature[MBEDTLS_ECDSA_MAX_LEN];
  unsigned char base64[128];
  size_t signatureLength = 0;
  size_t base64Length = 0;
  const mbedtls_md_info_t *sha256 = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
  if (sha256 == nullptr ||
      mbedtls_md(sha256, reinterpret_cast<const unsigned char *>(message.c_str()),
                 message.length(), digest) != 0) return false;
#if MBEDTLS_VERSION_MAJOR >= 3
  const int result = mbedtls_pk_sign(&signingKey, MBEDTLS_MD_SHA256, digest,
                                     sizeof(digest), signature, sizeof(signature),
                                     &signatureLength, mbedtls_ctr_drbg_random,
                                     &randomGenerator);
#else
  const int result = mbedtls_pk_sign(&signingKey, MBEDTLS_MD_SHA256, digest,
                                     sizeof(digest), signature, &signatureLength,
                                     mbedtls_ctr_drbg_random, &randomGenerator);
#endif
  if (result != 0 ||
      mbedtls_base64_encode(base64, sizeof(base64), &base64Length, signature,
                            signatureLength) != 0) return false;
  if (base64Length >= sizeof(base64)) return false;
  base64[base64Length] = '\0';
  encoded = String(reinterpret_cast<const char *>(base64));
  return true;
}

bool loadSigningKey() {
  mbedtls_pk_init(&signingKey);
  mbedtls_entropy_init(&entropy);
  mbedtls_ctr_drbg_init(&randomGenerator);
  const char seed[] = "coldchain-wokwi-demo";
  if (mbedtls_ctr_drbg_seed(&randomGenerator, mbedtls_entropy_func, &entropy,
                            reinterpret_cast<const unsigned char *>(seed),
                            sizeof(seed) - 1) != 0) return false;
#if MBEDTLS_VERSION_MAJOR >= 3
  return mbedtls_pk_parse_key(&signingKey,
                              reinterpret_cast<const unsigned char *>(DEVICE_PRIVATE_KEY_PEM),
                              strlen(DEVICE_PRIVATE_KEY_PEM) + 1, nullptr, 0,
                              mbedtls_ctr_drbg_random, &randomGenerator) == 0;
#else
  return mbedtls_pk_parse_key(&signingKey,
                              reinterpret_cast<const unsigned char *>(DEVICE_PRIVATE_KEY_PEM),
                              strlen(DEVICE_PRIVATE_KEY_PEM) + 1, nullptr, 0) == 0;
#endif
}

bool postTelemetry(const String &body) {
  if (!connectWifi()) return false;
  const String endpoint = String(API_BASE_URL) + "/api/v1/shipments/" +
                          SHIPMENT_ID + "/telemetry";
  for (int attempt = 1; attempt <= 3; ++attempt) {
    WiFiClientSecure client;
    // Simulator-only transport. Payload authenticity is checked by the backend signature.
    client.setInsecure();
    HTTPClient http;
    http.setConnectTimeout(kHttpTimeoutMs);
    http.setTimeout(kHttpTimeoutMs);
    if (!http.begin(client, endpoint)) {
      Serial.println("HTTPS initialization failed");
      return false;
    }
    http.addHeader("Content-Type", "application/json");
    const int status = http.POST(body);
    const String response = http.getString();
    Serial.printf("POST attempt %d: HTTP %d\n", attempt, status);
    Serial.println(response);
    http.end();
    if (status == 200 || status == 201) return true;
    if (status >= 400 && status < 500 && status != 429) return false;
    delay(2000);
  }
  return false;
}

void sendReading(float temperature, float humidity) {
  if (!isfinite(temperature) || !isfinite(humidity) || temperature < -40 ||
      temperature > 80 || humidity < 0 || humidity > 100) {
    Serial.println("Invalid DHT22 reading");
    return;
  }
  char recordedAt[21];
  if (!currentUtc(recordedAt, sizeof(recordedAt))) {
    Serial.println("Waiting for UTC clock");
    return;
  }
  const int temperatureMilli = lroundf(temperature * 1000);
  const int humidityMilli = lroundf(humidity * 1000);
  const uint32_t sequence = preferences.getUInt("sequence", 0) + 1;
  if (sequence == 0 || preferences.putUInt("sequence", sequence) != sizeof(sequence)) {
    Serial.println("Could not reserve sequence number");
    return;
  }
  String signature;
  if (!signMessage(canonicalMessage(sequence, temperatureMilli, humidityMilli,
                                    recordedAt), signature)) {
    Serial.println("Could not sign telemetry");
    return;
  }
  const String body = String("{\"payload_version\":1,\"shipment_id\":\"") +
                      SHIPMENT_ID + "\",\"device_id\":\"" + DEVICE_ID +
                      "\",\"key_id\":\"" + KEY_ID +
                      "\",\"sequence_number\":" + String(sequence) +
                      ",\"temperature_c\":" + String(temperatureMilli / 1000.0, 3) +
                      ",\"humidity_pct\":" + String(humidityMilli / 1000.0, 3) +
                      ",\"temperature_milli_c\":" + String(temperatureMilli) +
                      ",\"humidity_milli_pct\":" + String(humidityMilli) +
                      ",\"recorded_at\":\"" + recordedAt +
                      "\",\"firmware_version\":\"" + kFirmwareVersion +
                      "\",\"signature\":\"" + signature + "\"}";
  Serial.printf("Sending %.2f C, %.2f %% RH (sequence %lu)\n", temperature,
                humidity, static_cast<unsigned long>(sequence));
  postTelemetry(body);
}
}  // namespace

void setup() {
  Serial.begin(115200);
  sensor.setup(kDhtPin, DHTesp::DHT22);
  WiFi.mode(WIFI_STA);
  if (!preferences.begin("coldchain", false) || !loadSigningKey()) {
    Serial.println("Configuration or signing key failed");
    return;
  }
  if (preferences.getString("device", "") != DEVICE_ID) {
    preferences.putString("device", DEVICE_ID);
    preferences.putUInt("sequence", 0);
  }
  ready = true;
  if (connectWifi()) {
    configTime(0, 0, "pool.ntp.org", "time.google.com");
    clockRequested = true;
  }
}

void loop() {
  static uint32_t lastSampleAt = 0;
  static bool firstSample = true;
  if (!ready) { delay(1000); return; }
  if (time(nullptr) < 1700000000) {
    if (WiFi.status() != WL_CONNECTED) clockRequested = false;
    if (!clockRequested && connectWifi()) {
      configTime(0, 0, "pool.ntp.org", "time.google.com");
      clockRequested = true;
    }
    delay(1000);
    return;
  }
  if (!firstSample && millis() - lastSampleAt < kSampleIntervalMs) {
    delay(100);
    return;
  }
  firstSample = false;
  lastSampleAt = millis();
  const TempAndHumidity reading = sensor.getTempAndHumidity();
  sendReading(reading.temperature, reading.humidity);
}
