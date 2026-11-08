#pragma once

// Copy to config.h (ignored by Git) and replace every placeholder.
// Use a new device key; a key previously committed to Git must be revoked.
#define API_BASE_URL "https://YOUR-SERVICE.onrender.com"
#define WIFI_SSID "YOUR_WIFI_SSID"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"
#define SHIPMENT_ID "YOUR_LOWERCASE_SHIPMENT_UUID_V4"
#define DEVICE_ID "YOUR_DEVICE_ID"
#define KEY_ID "YOUR_KEY_ID"

static const char DEVICE_PRIVATE_KEY_PEM[] = R"PEM(-----BEGIN EC PRIVATE KEY-----
PASTE_NEW_DEVICE_PRIVATE_KEY_HERE
-----END EC PRIVATE KEY-----
)PEM";

// PEM of the CA that validates API_BASE_URL. Keep this current when the
// service certificate chain changes. Do not use setInsecure().
static const char TLS_ROOT_CA_PEM[] = R"PEM(-----BEGIN CERTIFICATE-----
PASTE_API_TLS_ROOT_CA_HERE
-----END CERTIFICATE-----
)PEM";
