// Copyright (c) Microsoft. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

#include <stdlib.h>

#include <stdio.h>
#include <stdint.h>

/* This sample uses the _LL APIs of iothub_client for example purposes.
That does not mean that HTTP only works with the _LL APIs.
Simply changing the using the convenience layer (functions not having _LL)
and removing calls to _DoWork will yield the same results. */

#include "AzureIoTHub.h"
#include "iot_logging.h"

// Handle for IoT hub client to be saved between calls to sketch
IOTHUB_CLIENT_LL_HANDLE _iotHubClientHandle;

// ---------------------
//
//    Creates Azure IoT Client handle
//
// ---------------------
bool init_azureiot_hub(const char* connectionString) {
    if (serializer_init(NULL) != SERIALIZER_OK)
    {
        LogInfo("Failed on serializer_init\r\n");
    }
    _iotHubClientHandle = IoTHubClient_LL_CreateFromConnectionString(connectionString, HTTP_Protocol);
    if (_iotHubClientHandle == NULL)
    {
        LogInfo("Failed on IoTHubClient_LL_Create\r\n");
    }
    else
    {
        unsigned int minimumPollingTime = 2; /*because it can poll "after 2 seconds" polls will happen effectively at ~3 seconds*/
        if (IoTHubClient_LL_SetOption(_iotHubClientHandle, "MinimumPollingTime", &minimumPollingTime) != IOTHUB_CLIENT_OK)
        {
            printf(PSTR("failure to set option \"MinimumPollingTime\"\r\n"));
        }
    }
}

// ---------------------
//
//    BOILER PLATE
//
// ---------------------

DEFINE_ENUM_STRINGS(IOTHUB_CLIENT_CONFIRMATION_RESULT, IOTHUB_CLIENT_CONFIRMATION_RESULT_VALUES);

void sendCallback(IOTHUB_CLIENT_CONFIRMATION_RESULT result, void* userContextCallback)
{
    int messageTrackingId = (intptr_t)userContextCallback;

    LogInfo("Message Id: %d Received.\r\n", messageTrackingId);

    LogInfo("Result Call Back Called! Result is: %s \r\n", ENUM_TO_STRING(IOTHUB_CLIENT_CONFIRMATION_RESULT, result));
}

static void sendMessage(IOTHUB_CLIENT_LL_HANDLE iotHubClientHandle, const unsigned char* buffer, size_t size)
{
    static unsigned int messageTrackingId;
    IOTHUB_MESSAGE_HANDLE messageHandle = IoTHubMessage_CreateFromByteArray(buffer, size);
    if (messageHandle == NULL)
    {
        LogInfo("unable to create a new IoTHubMessage\r\n");
    }
    else
    {
        if (IoTHubClient_LL_SendEventAsync(iotHubClientHandle, messageHandle, sendCallback, (void*)(uintptr_t)messageTrackingId) != IOTHUB_CLIENT_OK)
        {
            LogInfo("failed to hand over the message to IoTHubClient");
        }
        else
        {
            LogInfo("IoTHubClient accepted the message for delivery\r\n");
        }
        IoTHubMessage_Destroy(messageHandle);
    }
    free((void*)buffer);
    messageTrackingId++;
}

/*this function "links" IoTHub to the serialization library*/
static IOTHUBMESSAGE_DISPOSITION_RESULT IoTHubMessage(IOTHUB_MESSAGE_HANDLE message, void* userContextCallback)
{
    IOTHUBMESSAGE_DISPOSITION_RESULT result;
    const unsigned char* buffer;
    size_t size;
    if (IoTHubMessage_GetByteArray(message, &buffer, &size) != IOTHUB_MESSAGE_OK)
    {
        LogInfo("unable to IoTHubMessage_GetByteArray\r\n");
        result = EXECUTE_COMMAND_ERROR;
    }
    else
    {
        /*buffer is not zero terminated*/
        char* temp = malloc(size + 1);
        if (temp == NULL)
        {
            LogInfo("failed to malloc\r\n");
            result = EXECUTE_COMMAND_ERROR;
        }
        else
        {
            memcpy(temp, buffer, size);
            temp[size] = '\0';
            EXECUTE_COMMAND_RESULT executeCommandResult = EXECUTE_COMMAND(userContextCallback, temp);
            result =
                (executeCommandResult == EXECUTE_COMMAND_ERROR) ? IOTHUBMESSAGE_ABANDONED :
                (executeCommandResult == EXECUTE_COMMAND_SUCCESS) ? IOTHUBMESSAGE_ACCEPTED :
                IOTHUBMESSAGE_REJECTED;
            free(temp);
        }
    }
    return result;
}

// ---------------
//
//  END BOILER PLATE
//
// ----------------

bool register_azureiot_model(void* modelInstance) {
    if (modelInstance == NULL)
    {
        LogInfo("Failed on CREATE_MODEL_INSTANCE\r\n");
    }
    else
    {
        if (IoTHubClient_LL_SetMessageCallback(_iotHubClientHandle, IoTHubMessage, modelInstance) != IOTHUB_CLIENT_OK)
        {
            printf(PSTR("unable to IoTHubClient_SetMessageCallback\r\n"));
        }
    }
}

bool cleanup_azureiot_hub() {
    IoTHubClient_LL_Destroy(_iotHubClientHandle);
    serializer_deinit();
}

bool send_event(unsigned char* event, size_t eventSize) {
     IOTHUB_MESSAGE_HANDLE messageHandle = IoTHubMessage_CreateFromByteArray(event, eventSize);
    if (messageHandle == NULL)
    {
        printf(PSTR("unable to create a new IoTHubMessage\r\n"));
    }
    else
    {
        if (IoTHubClient_LL_SendEventAsync(_iotHubClientHandle, messageHandle, sendCallback, (void*)1) != IOTHUB_CLIENT_OK)
        {
            printf(PSTR("failed to hand over the message to IoTHubClient"));
        }
        else
        {
            printf(PSTR("IoTHubClient accepted the message for delivery\r\n"));
        }

        IoTHubMessage_Destroy(messageHandle);
    }
}

void azureiot_dowork() {
    IoTHubClient_LL_DoWork(_iotHubClientHandle);
}
