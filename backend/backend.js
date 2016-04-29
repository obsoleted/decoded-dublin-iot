(function () {
  'use strict';

  var prettyjson = require('prettyjson');
  var colorsTmpl = require('colors-tmpl');
  var Rx = require('rx');
  var Client = require('azure-iothub').Client;
  var Message = require('azure-iot-common').Message;
  var EventHubClient = require('./lib/eventhubclient.js');
  var fs = require('fs');

  // ************************************************
  // Get connection string and create a service client
  // ************************************************
  var connString = process.env.IOTHUB_CONNECTION_STRING ||
    '<IOT_HUB_CONNECTION_STRING_GOES_HERE>';
  var client = Client.fromConnectionString(connString);

  // ************************************************
  // Expected states for each device
  // ************************************************
  var huzzahState = {
    led1: true,
    led2: false
  };

  var rpi2State = {
    Led: false,
    LcdText: 'RPi2'
  };

  var edisonState = {
    greenLed: false,
    redLed: true,
    lcdText: 'Edison'
  };

  var states = {
    huzzah: huzzahState,
    rpi2: rpi2State,
    edison: edisonState
  };

  // Periodically refresh expected state
  setInterval(() => {
    fs.readFile('expectedStates.json', 'utf8', (err, data) => {
      if (err) {
        return console.log(err);
      }
      try {
        states = JSON.parse(data);
      }
      catch (ex) {
        console.log('error parsing expected states: ' + ex);
      }
    });
  }, 5000);

  // ************************************************
  // Open connection to the iothub service
  //
  // ************************************************
  client.open(function (err) {
    if (err) {
      console.error('Could not connect: ' + err.Message);
    } else {
      console.log('Client connected');

      // ************************************************
      // Methods for sending messages to devices
      // Ultimately a string will be the payload but some methods
      // will prefer to send objects that will be turned into JSON
      // ************************************************
      var sendObjectToDevice = function (deviceId, objectToSend) {
        var data = JSON.stringify(objectToSend);
        sendStringToDevice(deviceId, data);
      };

      var sendStringToDevice = function (deviceId, stringToSend) {
        var message = new Message(stringToSend);
        console.log(colorsTmpl(`{bold}{white}\nSending message to ` +
          `${deviceId}: ${message.getData()}{/white}{/bold}`
        ));
        client.send(deviceId, message, printResultFor('send'));
      };

      var sendHuzzahLedOn = function (ledId) {
        sendObjectToDevice('huzzah', {
          Name: 'TurnLedOn',
          Parameters: { 'ledId': ledId }
        });
      };

      var sendHuzzahLedOff = function (ledId) {
        sendObjectToDevice('huzzah', {
          Name: 'TurnLedOff',
          Parameters: { 'ledId': ledId }
        });
      };

      // ************************************************
      // Check incomming device state against expected states
      // If there is something different send an event to
      // correct the state.
      // ************************************************
      var validateDeviceState = function (deviceId, event) {
        switch (deviceId) {
          case 'huzzah':
            if (event.Led1 !== states.huzzah.led1) {
              console.log(colorsTmpl(
                `{red}Error: Led1 in unexpected state: ${event.Led1}{/red}`
              ));
              if (states.huzzah.led1) {
                sendHuzzahLedOn(1);
              } else {
                sendHuzzahLedOff(1);
              }
            }

            if (event.Led2 !== states.huzzah.led2) {
              console.log(colorsTmpl(
                `{red}Error: Led2 in unexpected state: ${event.Led2}{/red}`
              ));
              if (states.huzzah.led2) {
                sendHuzzahLedOn(2);
              } else {
                sendHuzzahLedOff(2);
              }
            }
            break;
          case 'edison':
            if (event.greenLed !== states.edison.greenLed) {
              console.log(colorsTmpl(
                `{red}Error: Green Led in unexpected state: ${event.greenLed}` +
                `{/red}`
              ));
              sendStringToDevice('edison',
                'greenLed:' + (states.edison.greenLed ? 'on' : 'off')
              );
            }
            if (event.redLed !== states.edison.redLed) {
              console.log(colorsTmpl(
                `{red}Error: Red Led in unexpected state: ${event.redLed}` +
                `{/red}`
              ));
              sendStringToDevice('edison',
                'redLed:' + (states.edison.redLed ? 'on' : 'off')
              );
            }
            if (event.lcdText !== states.edison.lcdText) {
              console.log(colorsTmpl(
                `{red}Error: LCD Text in unexpected state: ${event.lcdText}` +
                `{/red}`
              ));
              sendStringToDevice('edison',
                'text:' + states.edison.lcdText
              );
            }
            break;
          case 'rpi2':
            if (event.Led !== states.rpi2.Led) {
              console.log(colorsTmpl(
                `{red}Error: Led in unexpected state: ${event.Led}` +
                `{/red}`
              ));
              sendStringToDevice('rpi2',
                'led:' + (states.rpi2.Led ? 'on' : 'off')
              );
            }
            if (event.LcdText !== states.rpi2.LcdText) {
              sendStringToDevice('rpi2',
                'text:' + states.rpi2.LcdText
              );
            }
            break;
          default:
            break;
        }
      };

      // Creates a generic observer for logging all the events from a  device
      // Takes the deviceid and color which will be used to help visually
      //  identify the event
      var getObserverForDevice = function (deviceId, color) {
        return Rx.Observer.create(
          function (x) {
            console.log(colorsTmpl(`\n\n{${color}}Recieved message from ` +
              `{bold}${deviceId}{/bold}{/${color}}`
            ));
            var prettyjsonOptions = {
              keysColor: 'green',
              dashColor: 'magenta',
              stringColor: 'white',
              numberColor: 'white'
            };
            console.log(prettyjson.render(x.Bytes, prettyjsonOptions));

            // Validate state data for device
            validateDeviceState(deviceId, x.Bytes);

            console.log(colorsTmpl(`{bold}{${color}}@ ` +
              `${x.SystemProperties['x-opt-enqueued-time']}` +
              `{/${color}}{/bold}\n\n`
            ));
          }
        );
      };

      // ************************************************
      // Create Event Hub client
      // This is the backing pub/sub service behind Iot Hub
      // ************************************************
      var ehClient = new EventHubClient(connString, 'messages/events/');

      // Creates a hot observable for all the events coming from the event hub
      var allEventsObservable = Rx.Observable.fromPromise(
        ehClient.GetPartitionIds()
      )
        .map(partitionIds => Rx.Observable.from(partitionIds))
        .mergeAll()
        .map(partition =>
          Rx.Observable.fromPromise(
            ehClient.CreateReceiver('$Default', partition)
          )
        )
        .mergeAll()
        .do(receiver => receiver.StartReceive(
          Date.now() /* get events only from now on */)
          .then(() => console.log('Receiver started')))
        .map(receiver => Rx.Observable.fromEvent(receiver, 'eventReceived'))
        .mergeAll().publish();

      // Start events flowing from the cold observable to hot
      allEventsObservable.connect();

      // ************************************************
      // Here we have the 'logic' for the backend
      // ************************************************

      // ESP8266 Huzzah
      //

      // Create an observable for events only from this device
      var allHuzzahEventsObservable = allEventsObservable
        .where(event =>
          event.SystemProperties['iothub-connection-device-id'] === 'huzzah'
        );

      // Subscribe the generic logger to this observable
      allHuzzahEventsObservable.subscribe(
        getObserverForDevice('huzzah', 'yellow')
      );

      // RPi2
      //

      // Create an observable for events only from this device
      var allRpi2EventsObservable = allEventsObservable
        .where(event =>
          event.SystemProperties['iothub-connection-device-id'] === 'rpi2'
        );

      // Subscribe the generic logger to this observable
      allRpi2EventsObservable.subscribe(getObserverForDevice('rpi2', 'cyan'));

      // Edison
      //

      // Create an observable for events only from this device
      var allEdisonEventsObservable = allEventsObservable
        .where(event =>
          event.SystemProperties['iothub-connection-device-id'] === 'edison'
        );

      // Subscribe the generic logger to this observable
      allEdisonEventsObservable.subscribe(
        getObserverForDevice('edison', 'green')
      );

      var printResultFor = function (op) {
        return function printResut(err, res) {
          if (err) {
            console.log(op + ' error: ' + err.toString());
          } else {
            console.log(op + ' status: ' + res.constructor.name);
          }
        };
      };
    }
  });

} ());
