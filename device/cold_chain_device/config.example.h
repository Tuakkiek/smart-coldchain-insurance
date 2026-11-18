#pragma once

// Run the Backend configure-device command after assigning a fixed ESP32.
// config.h is ignored by Git because it contains that device's private key.
#define API_BASE_URL "https://YOUR-SERVICE.onrender.com"
#define WIFI_SSID "YOUR_WIFI_SSID"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"
#define SHIPMENT_ID "YOUR_LOWERCASE_SHIPMENT_UUID_V4"
#define DEVICE_ID "ESP32-01"
#define KEY_ID "key-v1"

static const char DEVICE_PRIVATE_KEY_PEM[] = R"PEM(-----BEGIN EC PRIVATE KEY-----
GENERATED_BY_LOCAL_BACKEND
-----END EC PRIVATE KEY-----
)PEM";
