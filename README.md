# IoT Demo
Demos for my IoT talk @ DECODED Event in Dublin

# Description

In this repo are 4 applications. 3 of them are device implementations for various platforms
and one is a backend service implementation.

## Device Logic

Each device is implemented to do the following:
- Periodically report current state to IoT Hub. Current state consists of the current values for the sensors attached to the device (e.g. LED on/off state, temperature reading)
- Process messages that update current state (e.g. Turn LED on/off, updated LCD text)
- Change state as a reaction to local input (e.g. button press)

## Backend Logic

The backend is implemented to maintain an expected state for each device. It subscribes to the events from each device and compares the state recieved with the expected state. If there is a difference then it sends messages to the device to 'fix' the state.

The service code is written to read the expected state values from a file periodically. So once running you would just need to update the file and the service will eventually pick up the new expected state.


## Usage

In order to run this demo end to end you will need to create an Azure IoT Hub instance and provision the devices you need. Then update the azure connection string or device key information in each application accordingly.