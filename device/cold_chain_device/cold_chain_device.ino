#include <Arduino.h>
#include <DHTesp.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <math.h>
#include <string.h>
#include <time.h>

#include <mbedtls/base64.h>
#include <mbedtls/ctr_drbg.h>
#include <mbedtls/ecdsa.h>
#include <mbedtls/entropy.h>
#include <mbedtls/md.h>
#include <mbedtls/pk.h>
#include <mbedtls/version.h>

#include "config.h"  // Local credentials and TLS CA; ignored by Git.

namespace {
constexpr int kDhtPin = 27;
constexpr uint32_t kSampleIntervalMs = 60000;
constexpr int kHttpTimeoutMs = 30000;
constexpr char kFirmwareVersion[] = "esp32-1.0";

// A newly provisioned device starts at sequence 1. Existing NVS values survive reboot.
constexpr uint32_t kInitialSequenceNumber = 0;
constexpr uint8_t kMaxSequenceConflictSkips = 50;

DHTesp sensor;
Preferences preferences;
mbedtls_pk_context signingKey;
mbedtls_entropy_context entropy;
mbedtls_ctr_drbg_context randomGenerator;
bool ready = false;
bool clockRequested = false;

bool connectWifi() {
  if (WiFi.status() == WL_CONNECTED) return true;

  Serial.printf("[WiFi] Connecting to %s", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  for (int i = 0; i < 80 && WiFi.status() != WL_CONNECTED; ++i) {
    delay(250);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("[WiFi] Connected successfully");
    Serial.print("[WiFi] IP address: ");
    Serial.println(WiFi.localIP());
    return true;
  }

  Serial.println("[WiFi] Connection failed");
  return false;
}

bool currentUtc(char *result, size_t capacity) {
  const time_t now = time(nullptr);
  if (now < 1700000000) return false;

  struct tm utc;
  gmtime_r(&now, &utc);
  return strftime(result, capacity, "%Y-%m-%dT%H:%M:%SZ", &utc) != 0;
}

String canonicalMessage(uint32_t sequence, int temperatureMilli,
                        int humidityMilli, const char *recordedAt) {
  // Keep this exact key order and formatting synchronized with the backend.
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

  const mbedtls_md_info_t *sha256 =
      mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
  if (sha256 == nullptr ||
      mbedtls_md(sha256,
                 reinterpret_cast<const unsigned char *>(message.c_str()),
                 message.length(), digest) != 0) {
    Serial.println("[SIGN] SHA-256 calculation failed");
    return false;
  }

#if MBEDTLS_VERSION_MAJOR >= 3
  const int result = mbedtls_pk_sign(
      &signingKey, MBEDTLS_MD_SHA256, digest, sizeof(digest), signature,
      sizeof(signature), &signatureLength, mbedtls_ctr_drbg_random,
      &randomGenerator);
#else
  const int result = mbedtls_pk_sign(
      &signingKey, MBEDTLS_MD_SHA256, digest, sizeof(digest), signature,
      &signatureLength, mbedtls_ctr_drbg_random, &randomGenerator);
#endif

  if (result != 0) {
    Serial.printf("[SIGN] ECDSA signing failed: -0x%04X\n", -result);
    return false;
  }

  if (mbedtls_base64_encode(base64, sizeof(base64), &base64Length, signature,
                            signatureLength) != 0 ||
      base64Length >= sizeof(base64)) {
    Serial.println("[SIGN] Base64 encoding failed");
    return false;
  }

  base64[base64Length] = '\0';
  encoded = String(reinterpret_cast<const char *>(base64));
  return true;
}

bool loadSigningKey() {
  mbedtls_pk_init(&signingKey);
  mbedtls_entropy_init(&entropy);
  mbedtls_ctr_drbg_init(&randomGenerator);

  const char seed[] = "coldchain-wokwi-demo";
  if (mbedtls_ctr_drbg_seed(
          &randomGenerator, mbedtls_entropy_func, &entropy,
          reinterpret_cast<const unsigned char *>(seed), sizeof(seed) - 1) !=
      0) {
    Serial.println("[SIGN] Random generator initialization failed");
    return false;
  }

#if MBEDTLS_VERSION_MAJOR >= 3
  const int result = mbedtls_pk_parse_key(
      &signingKey,
      reinterpret_cast<const unsigned char *>(DEVICE_PRIVATE_KEY_PEM),
      strlen(DEVICE_PRIVATE_KEY_PEM) + 1, nullptr, 0,
      mbedtls_ctr_drbg_random, &randomGenerator);
#else
  const int result = mbedtls_pk_parse_key(
      &signingKey,
      reinterpret_cast<const unsigned char *>(DEVICE_PRIVATE_KEY_PEM),
      strlen(DEVICE_PRIVATE_KEY_PEM) + 1, nullptr, 0);
#endif

  if (result != 0) {
    Serial.printf("[SIGN] Private key parsing failed: -0x%04X\n", -result);
    return false;
  }
  return true;
}

// Returns HTTP status. Returns -1 when the request could not be initialized
// or the transport failed. A 409 is returned immediately so sendReading()
// can allocate and sign a different sequence number for the same sample.
int postTelemetry(const String &body) {
  if (!connectWifi()) return -1;

  const String endpoint = String(API_BASE_URL) + "/api/v1/shipments/" +
                          SHIPMENT_ID + "/telemetry";
  int lastStatus = -1;

  for (int attempt = 1; attempt <= 3; ++attempt) {
    WiFiClientSecure client;
    // Test configuration only: TLS certificate verification is disabled.
    client.setCACert(TLS_ROOT_CA_PEM);

    HTTPClient http;
    http.setConnectTimeout(kHttpTimeoutMs);
    http.setTimeout(kHttpTimeoutMs);

    if (!http.begin(client, endpoint)) {
      Serial.println("[HTTP] HTTPS initialization failed");
      return -1;
    }

    http.addHeader("Content-Type", "application/json");
    const int status = http.POST(body);
    lastStatus = status;
    const String response = http.getString();

    Serial.printf("[HTTP] POST attempt %d: HTTP %d\n", attempt, status);
    if (response.length() > 0) Serial.println(response);
    http.end();

    if (status == 200 || status == 201) return status;

    // A 409 is not a transient transport failure. Let the caller try a new
    // sequence number rather than retrying the same conflicting payload.
    if (status == 409) return status;

    // Other permanent 4xx responses should not be retried.
    if (status >= 400 && status < 500 && status != 429) return status;

    if (attempt < 3) delay(2000);
  }

  return lastStatus;
}

void sendReading(float temperature, float humidity) {
  if (!isfinite(temperature) || !isfinite(humidity) || temperature < -40 ||
      temperature > 80 || humidity < 0 || humidity > 100) {
    Serial.println("[DHT22] Invalid sensor reading");
    return;
  }

  char recordedAt[21];
  if (!currentUtc(recordedAt, sizeof(recordedAt))) {
    Serial.println("[TIME] Waiting for UTC clock");
    return;
  }

  const int temperatureMilli = lroundf(temperature * 1000.0f);
  const int humidityMilli = lroundf(humidity * 1000.0f);

  // On HTTP 409, keep the same physical sample and timestamp, but reserve a
  // new sequence, re-sign the canonical message, and retry with that sequence.
  for (uint8_t conflict = 0; conflict <= kMaxSequenceConflictSkips; ++conflict) {
    const uint32_t previousSequence =
        preferences.getUInt("sequence", kInitialSequenceNumber);

    if (previousSequence == UINT32_MAX) {
      Serial.println("[SEQUENCE] Counter exhausted; refusing to wrap to zero");
      return;
    }

    const uint32_t sequence = previousSequence + 1;
    if (preferences.putUInt("sequence", sequence) != sizeof(sequence)) {
      Serial.println("[SEQUENCE] Could not persist sequence number");
      return;
    }

    String signature;
    const String canonical = canonicalMessage(
        sequence, temperatureMilli, humidityMilli, recordedAt);

    if (!signMessage(canonical, signature)) {
      Serial.println("[SIGN] Could not sign telemetry; sample not sent");
      return;
    }

    const String body =
        String("{\"payload_version\":1,\"shipment_id\":\"") + SHIPMENT_ID +
        "\",\"device_id\":\"" + DEVICE_ID + "\",\"key_id\":\"" + KEY_ID +
        "\",\"sequence_number\":" + String(sequence) +
        ",\"temperature_c\":" + String(temperatureMilli / 1000.0, 3) +
        ",\"humidity_pct\":" + String(humidityMilli / 1000.0, 3) +
        ",\"temperature_milli_c\":" + String(temperatureMilli) +
        ",\"humidity_milli_pct\":" + String(humidityMilli) +
        ",\"recorded_at\":\"" + recordedAt +
        "\",\"firmware_version\":\"" + kFirmwareVersion +
        "\",\"signature\":\"" + signature + "\"}";

    Serial.printf("[DHT22] %.2f C, %.2f %% RH\n", temperature, humidity);
    Serial.printf("[SEQUENCE] Sending sequence %lu\n",
                  static_cast<unsigned long>(sequence));

    const int status = postTelemetry(body);

    if (status == 200 || status == 201) {
      Serial.printf("[SUCCESS] Telemetry accepted (sequence %lu)\n",
                    static_cast<unsigned long>(sequence));
      return;
    }

    if (status == 409) {
      Serial.printf(
          "[SEQUENCE] Conflict at %lu. Reserving the next number and retrying the same sample.\n",
          static_cast<unsigned long>(sequence));
      continue;
    }

    if (status == -1) {
      Serial.println("[HTTP] Network/transport failure; this sequence remains reserved");
    } else {
      Serial.printf("[HTTP] Backend rejected telemetry with HTTP %d\n", status);
    }
    return;
  }

  Serial.printf(
      "[SEQUENCE] Stopped after %u consecutive conflicts. Check the backend's latest sequence for this device.\n",
      static_cast<unsigned>(kMaxSequenceConflictSkips + 1));
}

}  // namespace

void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println();
  Serial.println("====================================");
  Serial.println(" ESP32 COLD CHAIN MONITORING");
  Serial.println("====================================");
  Serial.printf("[DHT22] DATA pin: GPIO%d\n", kDhtPin);

  sensor.setup(kDhtPin, DHTesp::DHT22);
  WiFi.mode(WIFI_STA);

  if (!preferences.begin("coldchain", false)) {
    Serial.println("[ERROR] Could not open Preferences namespace");
    return;
  }

  // Initialize the local counter only for a new device namespace/key.
  // Do not reset an existing counter on every boot.
  const String savedDevice = preferences.getString("device", "");
  if (savedDevice != DEVICE_ID) {
    preferences.putString("device", DEVICE_ID);
    if (preferences.putUInt("sequence", kInitialSequenceNumber) !=
        sizeof(uint32_t)) {
      Serial.println("[ERROR] Could not initialize sequence counter");
      return;
    }
    Serial.printf("[SEQUENCE] New local counter initialized at %lu; first attempt is %lu\n",
                  static_cast<unsigned long>(kInitialSequenceNumber),
                  static_cast<unsigned long>(kInitialSequenceNumber + 1));
  } else if (!preferences.isKey("sequence")) {
    if (preferences.putUInt("sequence", kInitialSequenceNumber) !=
        sizeof(uint32_t)) {
      Serial.println("[ERROR] Could not initialize missing sequence counter");
      return;
    }
    Serial.printf("[SEQUENCE] Missing counter initialized at %lu\n",
                  static_cast<unsigned long>(kInitialSequenceNumber));
  } else {
    Serial.printf("[SEQUENCE] Restored last reserved sequence: %lu\n",
                  static_cast<unsigned long>(
                      preferences.getUInt("sequence", kInitialSequenceNumber)));
  }

  if (!loadSigningKey()) {
    Serial.println("[ERROR] Signing key initialization failed");
    return;
  }

  ready = true;
  Serial.println("[SYSTEM] Firmware initialization complete");

  if (connectWifi()) {
    configTime(0, 0, "pool.ntp.org", "time.google.com");
    clockRequested = true;
    Serial.println("[TIME] NTP synchronization requested");
  }
}

void loop() {
  static uint32_t lastSampleAt = 0;
  static bool firstSample = true;

  if (!ready) {
    delay(1000);
    return;
  }

  if (time(nullptr) < 1700000000) {
    if (WiFi.status() != WL_CONNECTED) clockRequested = false;
    if (!clockRequested && connectWifi()) {
      configTime(0, 0, "pool.ntp.org", "time.google.com");
      clockRequested = true;
      Serial.println("[TIME] NTP synchronization requested again");
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
