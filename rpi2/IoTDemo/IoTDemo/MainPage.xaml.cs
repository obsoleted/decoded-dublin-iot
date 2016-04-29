using GrovePi;
using GrovePi.I2CDevices;
using GrovePi.Sensors;
using Newtonsoft.Json;
using System;
using System.Diagnostics;
using System.Text;
using System.Threading.Tasks;
using Windows.System.Threading;
using Windows.UI.Xaml.Controls;

// Azure IoTHub
using Microsoft.Azure.Devices.Client;


namespace IoTDemo
{
    /// <summary>
    /// Simple class to represent the this device will send up to the backend
    /// </summary>
    class StateEvent
    {
        // Name of this device
        public string DeviceId;
        // Location of this device
        public string Location;
        // Type of event
        public readonly string Type = "state";

        // State information
        //
        // Current value of led
        public bool Led;
        // Current text being displayed
        public string LcdText;
        // Current light level
        public int LightLevel;
    }

    /// <summary>
    /// An empty page that can be used on its own or navigated to within a Frame.
    /// </summary>
    public sealed partial class MainPage : Page
    {
        // Create IoT Hub Client
        DeviceClient _deviceClient = DeviceClient.CreateFromConnectionString("<INSERT_IOTHUB_DEVICE_CONNECTION_STRING_NERE>", TransportType.Http1);

        // Create sensor instances
        IRgbLcdDisplay _groveLCD = DeviceFactory.Build.RgbLcdDisplay();
        ILed _blueLED = DeviceFactory.Build.Led(Pin.DigitalPin3);
        ILightSensor _lightSensor = DeviceFactory.Build.LightSensor(Pin.AnalogPin0);
        IButtonSensor _button = DeviceFactory.Build.ButtonSensor(Pin.DigitalPin2);

        // Timers for periodic actions
        ThreadPoolTimer SensorReadTimer;
        ThreadPoolTimer SendEventTimer;
        ThreadPoolTimer LcdUpdateTimer;

        // Holds model data that we will send to the service
        StateEvent _state = new StateEvent();

        public MainPage()
        {
            this.InitializeComponent();

            // Start task that will poll for new messages from the hub
            Task.Run(() => ReceiveDataFromAzureAsync());

            // Start timers for periodic actions
            SensorReadTimer = ThreadPoolTimer.CreatePeriodicTimer(ReadSensors, TimeSpan.FromMilliseconds(200));
            SendEventTimer = ThreadPoolTimer.CreatePeriodicTimer(SendDataEvent, TimeSpan.FromSeconds(10));
            LcdUpdateTimer = ThreadPoolTimer.CreatePeriodicTimer(UpdateLcd, TimeSpan.FromSeconds(0.5));

            _state.DeviceId = "rpi2";
            _state.Location = "Dublin";
            _state.LcdText = "Started!";
        }

        /// <summary>
        /// Sends the current _state to azure as event
        /// </summary>
        /// <param name="source"></param>
        private async void SendDataEvent(ThreadPoolTimer source)
        {
            var msg = new Message(Encoding.UTF8.GetBytes(JsonConvert.SerializeObject(_state)));
            await SafeSendMessage(msg);
        }

        /// <summary>
        /// Generic method for sending already constructed Message to azure
        /// Currently written to swallow exceptions (demo reliability)
        /// </summary>
        /// <param name="msg"></param>
        /// <returns></returns>
        private async Task SafeSendMessage(Message msg)
        {
            try
            {
                await _deviceClient.SendEventAsync(msg);
            }
            catch (Exception ex) // Swallow exceptions for demo stability
            {
                Debug.WriteLine("Exception Caught: " + ex.ToString());
            }
        }

        /// <summary>
        /// Method that loops polling azure for new messages
        /// Currently it expects the message to be a string in the form of 'command:arguments'
        /// 
        /// Curretly supported commands are:
        /// 
        ///    'led:on' -> turns led on
        ///    'led:off' -> turns led off
        ///    'text:string' -> updates the lcd to display the string argument
        /// 
        /// </summary>
        /// <returns></returns>
        private async Task ReceiveDataFromAzureAsync()
        {
            Message receivedMessage;

            string messageData;

            while (true)
            {
                try
                {
                    // use client to get message
                    receivedMessage = await _deviceClient.ReceiveAsync();
                    if (receivedMessage != null)
                    {
                        // If message was received then decode it and handle it
                        messageData = Encoding.ASCII.GetString(receivedMessage.GetBytes());
                        await HandleMessageAsync(messageData);
                        await _deviceClient.CompleteAsync(receivedMessage);
                    }
                }
                catch (Exception ex)
                {
                    Debug.WriteLine("Exception caught receiving from hub: " + ex.ToString());
                }
            }
        }

        /// <summary>
        /// Parses the given message string and takes appropriate action. 
        /// Does nothing if string is not recognized as a valid action 
        /// </summary>
        /// <param name="message"></param>
        /// <returns></returns>
        private async Task HandleMessageAsync(string message)
        {
            if (string.IsNullOrEmpty(message))
            {
                return;
            }

            var splitMessage = message.Split(':');
            if (splitMessage.Length < 1)
            {
                return;
            }

            switch (splitMessage[0])
            {
                case "led":
                    {
                        if (splitMessage.Length > 1)
                        {
                            if (splitMessage[1] == "on")
                            {
                                SetLedState(SensorStatus.On);
                            }
                            else
                            {
                                SetLedState(SensorStatus.Off);
                            }
                        }
                    }
                    break;
                case "text":
                    {
                        string messageToWrite = splitMessage.Length > 1 ? splitMessage[1] : "";
                        await WriteTextToLcdAsync(messageToWrite);
                    }
                    break;
            }
        }

        /// <summary>
        /// Reads current sensor values and takes any action needed
        /// </summary>
        /// <param name="source"></param>
        private void ReadSensors(ThreadPoolTimer source)
        {
            bool buttonPressed = _button.CurrentState == SensorStatus.On;
            _state.Led = _blueLED.CurrentState == SensorStatus.On;
            _state.LightLevel = _lightSensor.SensorValue() < 1000 ? _lightSensor.SensorValue() : _state.LightLevel;

            // Update the LCD backlight based on light level
            _groveLCD.SetBacklightRgb(Linear(0xff, 0x4b, _state.LightLevel, 0xff),
                                      Linear(0x00, 0x00, _state.LightLevel, 0xff),
                                      Linear(0x00, 0x82, _state.LightLevel, 0xff));

            // If the button was pressed toggle the LED and set the text to a new value
            // This simulates something going "wrong" on the device requirnig the backend
            // to react
            if (buttonPressed)
            {
                _blueLED.ChangeState(_state.Led ? SensorStatus.Off : SensorStatus.On);
                _state.LcdText = "ERROR";
            }
        }

        /// <summary>
        /// Updates the LCD text line 2. Used for incomming message display
        /// </summary>
        /// <param name="text">Text that will be displayed on line 2</param>
        /// <returns></returns>
        private Task WriteTextToLcdAsync(string text)
        {
            _state.LcdText = text;
            // Invoke lcd update now instead of waiting
            return Task.Run(() => UpdateLcd(null));
        }

        /// <summary>
        /// Actually updates the lcd component
        /// </summary>
        /// <param name="sourceTimer"></param>
        private void UpdateLcd(ThreadPoolTimer sourceTimer)
        {
            _groveLCD.SetText(_state.LcdText);
        }

        /// <summary>
        /// Updates the LED based on the given status
        /// </summary>
        /// <param name="status"></param>
        /// <returns></returns>
        private Task SetLedState(SensorStatus status)
        {
            return Task.Run(() => _blueLED.ChangeState(status));
        }

        private byte Linear(int start, int end, int step, int steps)
        {
            return (byte)((end - start) * step / steps + start);
        }
    }
}
