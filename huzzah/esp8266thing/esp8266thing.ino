// Copyright (c) Arduino. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

// Includes for DHT sensor (temperature + humidity)
#include <Adafruit_Sensor.h>
#include <DHT.h>
#include <DHT_U.h>

// Pin and type for DHT sensor
#define DHTPIN 13
#define DHTTYPE DHT22

// Delay for reading DHT sensor
uint32_t delayMS;
long lastReadTime;

// Initialize DHT sensor
DHT_Unified dht(DHTPIN, DHTTYPE);

#define BUTTON_PIN 15
#define LED1_PIN 16 // LED 1
#define LED2_PIN 12 // LED 2

// Includes for ESP8266 networking
#include <ESP8266WiFi.h>
#include <WiFiClientSecure.h>

// **************************
//
// Include the main IoT Hub library
#include <AzureIoTHub.h>
// Scenario include (defines model and C style functions)
#include "esp8266thing.h"
//
// **************************

char ssid[] = "<REPLACE_WITH_SSID>"; //  your network SSID (name)
char pass[] = "<REPLACE_WITH_NETWORK_PASSWORD>";    // your network password (use for WPA, or use as key for WEP)

static const char* connectionString = "<REPLACE_WITH_DEVICE_CONNECTION_STRING>";

// Local instance of model
Esp8266Thing* model = NULL;

// Initialize SSl client
WiFiClientSecure sslClient; // for ESP8266

// Initialize IotHub sdk library
// Currently this is used to 'register' the ssl client for use inside the library
AzureIoTHubClient iotHubClient(sslClient);

// Used to track the last time we sent a message
long lastSendTime;

void setup() {
  initSerial();
  initSensors();
  initWifi();
  initTime();
  iotHubClient.begin();

  // Initialize IOT Hub client. Must be done AFTER time is initialized
  initIotHub();

  lastReadTime = 0;
  lastSendTime = 0;
  readDHTSensor();
}

// ------
//  IoT Hub Functionality
// ------

void initIotHub() {
  // Here we initialize the inner iothub client using the connection string
  // This creates a handle to the client and specifies HTTP transport
  // This is the only transport implemented currently for ESP8266
  init_azureiot_hub(connectionString);

  // Initialize the model we will use
  model = CREATE_MODEL_INSTANCE(ThingExample, Esp8266Thing);
  model->DeviceId = "huzzah";

  register_azureiot_model(model);
}

void cleanupAzureIotHub() {
  cleanup_azureiot_hub();
}

// Sends event to the IoT hub IF it has been longer than a second since the last send
void sendEvent() {
  const int eventSendPeriodInMs = 1000;
  // Check if it has been enough time since last send
  long timeSinceLastSendEvent = millis() - lastSendTime;
  if(timeSinceLastSendEvent > eventSendPeriodInMs || timeSinceLastSendEvent < 0) {
    lastSendTime = millis();

    // Serialize a message to be sent
    // This leverages the Serializer functionality of the IoT SDK for C
    unsigned char* event;
    size_t eventSize;
    if (SERIALIZE(&event, &eventSize,
          model->DeviceId,
          model->Temperature,
          model->Humidity,
          model->Led1,
          model->Led2,
          model->ButtonPressed) != IOT_AGENT_OK)
    {
        Serial.println("Failed to serialize");
    }
    else
    {
        Serial.println("Serialized event");
        // Calls the inner C api to send the event
        send_event(event, eventSize);
        free(event);
    }

    Serial.println("Sent event");
    Serial.print("ButtonPressed: ");
    Serial.println(model->ButtonPressed);
  }
}

//
// -- Message handlers
//

EXECUTE_COMMAND_RESULT TurnLedOn(Esp8266Thing* device, int led)
{
    (void)device;

    Serial.print("Turning led");
    Serial.print(led);
    Serial.println(" on");

    if(led == 1) {
      model->Led1 = true;
    } else if(led == 2) {
      model->Led2 = true;
    }

    return EXECUTE_COMMAND_SUCCESS;
}

EXECUTE_COMMAND_RESULT TurnLedOff(Esp8266Thing* device, int led)
{
    (void)device;

    Serial.print("Turning led");
    Serial.print(led);
    Serial.println(" off");

    if(led == 1) {
      model->Led1 = false;
    } else if(led == 2) {
      model->Led2 = false;
    }

    return EXECUTE_COMMAND_SUCCESS;
}

// for debounce logic on button
bool lastButtonPress = millis();

void loop() {
  // Read basic sensors
  model->ButtonPressed = digitalRead(BUTTON_PIN) != 0;

  if(model->ButtonPressed && (millis() - lastButtonPress > 250)) {
    model->Led1 = !model->Led1;
    lastButtonPress = millis();
  }

  // Update basic outputs
  digitalWrite(LED1_PIN, model->Led1);
  digitalWrite(LED2_PIN, model->Led2);

  // Read DHT sensor (internally checks if within delay time)
  readDHTSensor();

  // Send an event up for model (internal check for delay since last send)
  sendEvent();

  // Allow SDK to do some work (internally has waits as well)
  azureiot_dowork();
}

void initSerial() {
  // Initialize serial
  Serial.begin(115200);
  Serial.setDebugOutput(true);

  while (!Serial) {
    ; // wait for serial port to connect. Needed for native USB port only
  }
}

void initSensors() {
  dht.begin();

  Serial.println("DHTxx Unified Sensor Example");
  // Print temperature sensor details.
  sensor_t sensor;
  dht.temperature().getSensor(&sensor);
  Serial.println("------------------------------------");
  Serial.println("Temperature");
  Serial.print  ("Sensor:       "); Serial.println(sensor.name);
  Serial.print  ("Driver Ver:   "); Serial.println(sensor.version);
  Serial.print  ("Unique ID:    "); Serial.println(sensor.sensor_id);
  Serial.print  ("Max Value:    "); Serial.print(sensor.max_value); Serial.println(" *C");
  Serial.print  ("Min Value:    "); Serial.print(sensor.min_value); Serial.println(" *C");
  Serial.print  ("Resolution:   "); Serial.print(sensor.resolution); Serial.println(" *C");
  Serial.println("------------------------------------");
  // Print humidity sensor details.
  dht.humidity().getSensor(&sensor);
  Serial.println("------------------------------------");
  Serial.println("Humidity");
  Serial.print  ("Sensor:       "); Serial.println(sensor.name);
  Serial.print  ("Driver Ver:   "); Serial.println(sensor.version);
  Serial.print  ("Unique ID:    "); Serial.println(sensor.sensor_id);
  Serial.print  ("Max Value:    "); Serial.print(sensor.max_value); Serial.println("%");
  Serial.print  ("Min Value:    "); Serial.print(sensor.min_value); Serial.println("%");
  Serial.print  ("Resolution:   "); Serial.print(sensor.resolution); Serial.println("%");
  Serial.println("------------------------------------");
  // Set delay between sensor readings based on sensor details.
  delayMS = sensor.min_delay / 1000;
  pinMode(LED1_PIN, OUTPUT);
  pinMode(LED2_PIN, OUTPUT);

  pinMode(BUTTON_PIN, INPUT);
}

void readDHTSensor() {
  long timeSinceLastSensorRead = millis() - lastReadTime;
  if(timeSinceLastSensorRead > delayMS || timeSinceLastSensorRead < 0) {
    lastReadTime = millis();
    sensors_event_t event;
    dht.temperature().getEvent(&event);
    if (isnan(event.temperature)) {
      Serial.println("Error reading temperature!");
    }
    else {
      Serial.print("Temperature: ");
      Serial.print(event.temperature);
      model->Temperature = (int)(event.temperature * 100);
      Serial.println(" *C");
    }
    // Get humidity event and print its value.
    dht.humidity().getEvent(&event);
    if (isnan(event.relative_humidity)) {
      Serial.println("Error reading humidity!");
    }
    else {
      Serial.print("Humidity: ");
      model->Humidity = (int)(event.relative_humidity * 100);
      Serial.print(event.relative_humidity);
      Serial.println("%");
    }
  }
}

void initWifi() {
  // check for the presence of the shield :
  if (WiFi.status() == WL_NO_SHIELD) {
    Serial.println("WiFi shield not present");
    // don't continue:
    while (true);
  }

  // attempt to connect to Wifi network:
  Serial.print("Attempting to connect to SSID: ");
  Serial.println(ssid);

  // Connect to WPA/WPA2 network. Change this line if using open or WEP network:
  while (WiFi.begin(ssid, pass) != WL_CONNECTED) {
    // unsuccessful, retry in 4 seconds
    Serial.print("failed ... ");
    delay(4000);
    Serial.print("retrying ... ");
  }

  Serial.println("Connected to wifi");
}

void initTime() {
  // For ESP8266 boards comment out the above portion of the function and un-comment
  // the remainder below.

  time_t epochTime;

  configTime(0, 0, "pool.ntp.org", "time.nist.gov");

  while (true) {
      epochTime = time(NULL);

      if (epochTime == 0) {
          Serial.println("Fetching NTP epoch time failed! Waiting 2 seconds to retry.");
          delay(2000);
      } else {
          Serial.print("Fetched NTP epoch time is: ");
          Serial.println(epochTime);
          break;
      }
  }
}
