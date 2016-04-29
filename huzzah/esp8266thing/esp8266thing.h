// Copyright (c) Microsoft. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

#ifndef ESP8266THINGHTTP_H
#define ESP8266THINGHTTP_H

#ifdef __cplusplus
extern "C" {
#endif
    // Initializes the client handle
    bool init_azureiot_hub(const char* connectionString);
    // Cleans up client handle
    bool cleanup_azureiot_hub();
    // Sends an event to the hub
    bool send_event(unsigned char* message, size_t messageSize);

    // Helps link the serialization library and the iot sdk
    bool register_azureiot_model(void* model);

    // Called from the sketch to give the iot sdk a chance to process work
    void azureiot_dowork();

    // Define the Model
    //
    // This defines the events that the device can send up as well as
    // the messages it can receive. This leverages the Serializer portion
    // of the Azure IoT Hub C sdk which automates implementing events/messages
    // on top of the raw IoT apis.
    BEGIN_NAMESPACE(ThingExample);
    DECLARE_MODEL(Esp8266Thing,
    WITH_DATA(ascii_char_ptr, DeviceId),
    WITH_DATA(int, Temperature),
    WITH_DATA(int, Humidity),
    WITH_DATA(bool, Led1),
    WITH_DATA(bool, Led2),
    WITH_DATA(bool, ButtonPressed),
    WITH_ACTION(TurnLedOn, int, ledId),
    WITH_ACTION(TurnLedOff, int, ledId)
    );
    END_NAMESPACE(ThingExample);

#ifdef __cplusplus
}
#endif

#endif /* ESP8266THINGHTTP_H */
