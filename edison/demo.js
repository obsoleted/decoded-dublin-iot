/*
 * Copyright (c) 2016 Microsoft Corporation.
 *
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files (the
 * 'Software'), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to
 * the following conditions:
 *
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
 * LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
 * WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

// This example uses the Seeed Studio Grove Starter Kit Plus - Intel IoT Edition
// This example incorporates examples from the Johnny-Five API examples at
// http://johnny-five.io/examples/grove-lcd-rgb-temperature-display-edison/

(function () {
  'use strict';

  var five = require('johnny-five');
  var Edison = require('edison-io');
  var device = require('azure-iot-device');

  // Define the client object that communicates with Azure IoT Hubs
  var Client = require('azure-iot-device').Client;

  // Define the message object that will define the message format going into Azure IoT Hubs
  var Message = require('azure-iot-device').Message;

  // Define the protocol that will be used to send messages to Azure IoT Hub
  // For this demo we will use AMQP
  // If you want to use a different protocol, comment out the protocol you want to replace,
  // and uncomment one of the other transports.

  // var Protocol = require('azure-iot-device-amqp-ws').AmqpWs;
  var Protocol = require('azure-iot-device-amqp').Amqp;
  // var Protocol = require('azure-iot-device-http').Http;
  // var Protocol = require('azure-iot-device-mqtt').Mqtt;

  // The device-specific connection string to your Azure IoT Hub
  var connectionString = process.env.IOTHUB_DEVICE_CONN ||
    'YOUR IOT HUB DEVICE-SPECIFIC CONNECTION STRING HERE';

  // Create the client instanxe that will manage the connection to your IoT Hub
  // The client is created in the context of an Azure IoT device.
  var client = Client.fromConnectionString(connectionString, Protocol);

  // Extract the Azure IoT Hub device ID from the connection string
  var deviceId = device.ConnectionString.parse(connectionString).DeviceId;

  // location is simply a string that you can filter on later
  var location = process.env.DEVICE_LOCATION || 'DECODED';

  // Sensors device will be using
  var lcd;
  var redLed;
  var greenLed;
  var light;
  var button;

  // State we will be tracking
  var lcdText;
  var redLedStatus;
  var greenLedStatus;

  function setLcdText(text) {
    lcd.clear();
    lcd.cursor(0, 0).print(text);
    lcdText = text;
  }

  function turnGreenLedOn() {
    greenLed.on();
    greenLedStatus = true;
  }

  function turnGreenLedOff() {
    greenLed.off();
    greenLedStatus = false;
  }

  function turnRedLedOn() {
    redLed.on();
    redLedStatus = true;
  }

  function turnRedLedOff() {
    redLed.off();
    redLedStatus = false;
  }

  // Create board instance and specify to use Edison for io
  // This is where the otherwise unaware johnny-rive library
  // gains the ability to talk to Edison
  var board = new five.Board({
    io: new Edison()
  });


  // *********************************************
  // Send a state messae to Azure IoT Hub.
  // Always send the same message format (to
  // ensure the StreamAnalytics job doesn't fail)
  // includng deviceId, location and the sensor
  // type/value combination.
  // *********************************************
  function sendStateEvent() {
    // Define the message body
    var payload = JSON.stringify({
      deviceId: deviceId,
      location: location,
      type: 'state',
      greenLed: greenLedStatus,
      redLed: redLedStatus,
      lcdText: lcdText,
      lightLevel: light.value
    });

    // Create the message based on the payload JSON
    var message = new Message(payload);

    // For debugging purposes, write out the message payload to the console
    console.log('Sending message: ' + message.getData());

    // Send the message to Azure IoT Hub
    client.sendEvent(message, printResultFor('send'));

    console.log('- - - -');
  }

  // *********************************************
  // Helper function to print results in the console
  // *********************************************
  function printResultFor(op) {
    return function printResult(err, res) {
      if (err) {
        console.log(op + ' error: ' + err.toString());
      }

      if (res) {
        console.log(op + ' status: ' + res.constructor.name);
      }
    };
  }

  // *********************************************
  // Open the connection to Azure IoT Hub.
  // When the connection respondes (either open or
  // error) the anonymous function is executed.
  // *********************************************
  var connectCallback = function (err) {
    console.log('Open Azure IoT connection...');

    // *********************************************
    // If there is a connection error, display it
    // in the console.
    // *********************************************
    if (err) {
      console.error('...could not connect: ' + err);



      // *********************************************
      // If there is no error, send and receive
      // messages, and process completed messages.
      // *********************************************
    } else {
      console.log('...client connected');



      // *********************************************
      // Create a message and send it to the IoT Hub
      // every two-seconds
      // *********************************************
      var sendInterval = setInterval(function () {
        sendStateEvent();
      }, 5000);



      // *********************************************
      // Listen for incoming messages
      // *********************************************
      client.on('message', function (msg) {
        console.log('*********************************************');
        console.log('**** Message Received - Id: ' + msg.messageId + ' Body: ' + msg.data);
        console.log('*********************************************');

        // Split the message on a delimiter.
        var body = msg.data.toString().split(':');

        // Look for the 'redLed' indicator.
        var indexOfRedLed = body.indexOf('redLed');

        // If 'redLed' is found, look at the next node in
        // the message body, and turn the led on or off
        // accordingly.
        if (indexOfRedLed >= 0) {
          if (body[indexOfRedLed + 1] === 'on') {
            turnRedLedOn();
          } else if (body[indexOfRedLed + 1] === 'off') {
            turnRedLedOff();
          }
        }

        // Look for the 'greenLed' indicator.
        var indexOfGreenLed = body.indexOf('greenLed');

        // If 'greenLed' is found, look at the next node in
        // the message body, and turn the led on or off
        // accordingly.
        if (indexOfGreenLed >= 0) {
          if (body[indexOfGreenLed + 1] === 'on') {
            turnGreenLedOn();
          } else if (body[indexOfGreenLed + 1] === 'off') {
            turnGreenLedOff();
          }
        }

        // look for the 'text' indicator
        var indexOfText = body.indexOf('text');

        // if 'text' is found look at the next node in
        // in the message body, and set the lcd text
        // to that value
        if (indexOfText >= 0) {
          setLcdText(body[indexOfText + 1]);
        }

        // *********************************************
        // Process completed messages and remove them
        // from the message queue.
        // *********************************************
        client.complete(msg, printResultFor('completed'));
        // reject and abandon follow the same pattern.
        // /!\ reject and abandon are not available with MQTT
      });

      // *********************************************
      // If the client gets an error, dsiplay it in
      // the console.
      // *********************************************
      client.on('error', function (err) {
        console.error(err.message);
      });



      // *********************************************
      // If the client gets disconnected, cleanup and
      // reconnect.
      // *********************************************
      client.on('disconnect', function () {
        clearInterval(sendInterval);
        client.removeAllListeners();
        client.connect(connectCallback);
      });
    }
  };


  board.on('ready', function () {
    console.log('Board connected...');

    //
    // Get get sensors
    //

    // Attach the LCD to an I2C slot
    lcd = new five.LCD({
      controller: 'JHD1313M1'
    });

    // Plug the button into D5
    button = new five.Button(5);

    // Use added LED
    greenLed = new five.Led(6);
    redLed = new five.Led(2);

    // Plug the light sensor into A0
    light = new five.Sensor('A0');

    setLcdText('Dublin is cool.');

    turnGreenLedOff();
    turnRedLedOn();

    if (Math.random() > 0.5) {
      turnGreenLedOn();
      turnRedLedOff();
    }

    // *********************************************
    // The button.on('press') invokes the anonymous
    // callback when the button is pressed.
    // *********************************************
    button.on('press', function () {

      if (greenLedStatus) {
        turnGreenLedOff();
      } else {
        turnGreenLedOn();
      }

      if (Math.random() > 0.5) {
        turnRedLedOn();
      }

      setLcdText('Dublin is cool.');

    });

    // *********************************************
    // Open the connection to Azure IoT Hubs and
    // begin sending messages.
    // *********************************************
    client.open(connectCallback);

    // Set scaling of the Rotary angle
    // sensor's output to 0-255 (8-bit)
    // range. Set the LCD's background
    // color to a RGB value between
    // Red and Violet based on the
    // value of the light sensor.
    light.scale(0, 255).on('change', function () {
      var r = linear(0xFF, 0x4B, this.value, 0xFF);
      var g = linear(0x00, 0x00, this.value, 0xFF);
      var b = linear(0x00, 0x82, this.value, 0xFF);

      lcd.bgColor(r, g, b);
    });

  });

  // [Linear Interpolation](https://en.wikipedia.org/wiki/Linear_interpolation)
  function linear(start, end, step, steps) {
    return (end - start) * step / steps + start;
  }

} ());
