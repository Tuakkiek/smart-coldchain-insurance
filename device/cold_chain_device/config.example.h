#pragma once

// config.h is generated/updated by the local Backend when an Admin registers
// a device. It is ignored by Git because it contains the device private key.
#define API_BASE_URL "https://YOUR-SERVICE.onrender.com"
#define WIFI_SSID "YOUR_WIFI_SSID"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"
#define SHIPMENT_ID "YOUR_LOWERCASE_SHIPMENT_UUID_V4"
#define DEVICE_ID "YOUR_DEVICE_ID"
#define KEY_ID "YOUR_KEY_ID"

static const char DEVICE_PRIVATE_KEY_PEM[] = R"PEM(-----BEGIN EC PRIVATE KEY-----
GENERATED_BY_LOCAL_BACKEND
-----END EC PRIVATE KEY-----
)PEM";

// PEM of the CA that validates API_BASE_URL. Keep this current when the
// service certificate chain changes. Do not use setInsecure().
static const char TLS_ROOT_CA_PEM[] = R"PEM(-----BEGIN CERTIFICATE-----
PASTE_API_TLS_ROOT_CA_HERE
-----END CERTIFICATE-----
)PEM";
