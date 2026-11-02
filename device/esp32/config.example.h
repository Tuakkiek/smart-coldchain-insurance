#pragma once

// Copy this file to config.h and edit the values for your local network.
// config.h is ignored by Git. Keep Wi-Fi credentials out of this example file.
#define WIFI_SSID "YOUR_WIFI_SSID"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"

// Use the computer's LAN IP, not localhost: localhost on the ESP32 is the ESP32.
// Phase 1 uses plain HTTP on a trusted local development network.
#define API_BASE_URL "http://192.168.1.100:8000"
#define SHIPMENT_ID "8b4fb8a2-2996-4da2-90b9-35019517f56f"
#define DEVICE_ID "ESP32-01"

// Adafruit DHT sensor library: DHT11 or DHT22. GPIO 4 is an example.
#define DHT_PIN 4
#define DHT_TYPE DHT22

#define SAMPLE_INTERVAL_MS 60000UL
#define WIFI_CONNECT_TIMEOUT_MS 10000UL
#define HTTP_TIMEOUT_MS 5000
#define MAX_POST_ATTEMPTS 3
#define RETRY_DELAY_MS 1000UL

// Set these to the supported range of the actual sensor if it differs.
#define SENSOR_TEMP_MIN_C -40.0f
#define SENSOR_TEMP_MAX_C 80.0f
