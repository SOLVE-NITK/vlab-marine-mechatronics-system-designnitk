### Background Theory

#### Analog Sensors in Marine Systems

Marine automation systems rely on analog sensors to continuously monitor critical engine and process parameters.

Temperature Sensors (RTD – Resistance Temperature Detector)

Platinum Pt100 RTDs are widely used for engine coolant and seawater temperature measurement.

- Resistance at 0 °C: 100 Ω
- Resistance at 100 °C: 138.5 Ω
- Linear relationship: R(T) = R₀(1 + αT)
- Typical accuracy: ±0.5 °C
- Time constant: 10–20 s in flowing water

Pressure Sensors (4–20 mA Transmitters)

Industrial marine pressure transmitters commonly use the 4–20 mA current loop standard.

- 4 mA → 0% of range (0 bar)
- 20 mA → 100% of range (10 bar)
- Linear relationship:

  I = 4 + (P / Pmax) × 16 mA

- Accuracy: ±1% Full Scale
- Response time: 50–200 ms

Vibration Sensors (Accelerometers)

Accelerometers are used for rotating machinery condition monitoring.

- Measurement range: ±10 g
- Frequency response: 1 Hz – 10 kHz
- Noise floor: ≈50 mg/√Hz
- Sensitivity: 100–500 mV/g
- Applications: Bearing-condition monitoring and structural-health monitoring

#### Signal Conditioning

Before sensor signals are processed by a microcontroller, they must be conditioned.

- Amplification

  Vout = A × Vin

  Typical gain: 10–1000 V/V

- Filtering

  Removes electrical noise using a low-pass filter.

  fc = 1 / (2πRC)

- Offset Correction

  Vcorrected = Vraw − Voffset

- Scaling

  Converts ADC voltage into engineering units.

  x = (Vadc − Vmin)/(Vmax − Vmin) × (xmax − xmin) + xmin

#### Analog-to-Digital Conversion (ADC)

Arduino analog inputs convert conditioned analog signals into digital values.

- Resolution: 10-bit (0–1023 counts)
- Input range: 0–5 V
- Conversion time: ≈100 μs
- Maximum sampling rate: ≈10 kHz

Quantization Error:

Qe = Vref / 2ⁿ

For a 5 V, 10-bit ADC:

Qe = 5 / 1024 = 4.88 mV

<center>
<img src="../exp4/images/Interface.png">
</center>

### Experimental Modules

The virtual laboratory consists of three marine sensor modules accessible from the control panel tabs.

- RTD TEMPERATURE (Pt100) – Study temperature sensing, calibration, filtering, and dynamic response.
- 4–20 mA LOOP – Investigate industrial pressure transmitter characteristics, hysteresis, and fault diagnostics.
- VIBRATION – Analyze accelerometer signals and detect bearing faults using vibration measurements.


### Part 1: RTD Temperature (Pt100)

Scenario: Monitoring the main-engine cooling-water temperature using a Pt100 RTD connected to an Arduino through a voltage divider.

#### Task 1: Sensor Calibration Logging

What it's for: To determine the calibration relationship between ADC counts and actual temperature.

How to do it: Set the True Water Temperature to 0 °C, 25 °C, 50 °C, 75 °C, and 100 °C using the slider or preset buttons. After each setting, click ＋ Record Point.

Observation: The Calibration Log records the actual temperature, ADC value, calculated temperature, and measurement error. The simulator automatically generates the calibration equation.

<center>
<img src="../exp4/images/RTDTemperature/task1.png">
</center>

#### Task 2: Filtering and Noise Reduction

What it's for: To evaluate the effectiveness of moving-average filters in reducing electrical noise.

How to do it: Click Inject 50 Hz Mains Noise. Switch between RAW, MA-5, MA-10, and MA-20 filters while observing the signal.

Observation: Compare the Raw Noise, Filtered Noise, and SNR Gain values in the Pt100 readout panel. Observe how larger moving-average windows reduce noise while increasing signal delay.

<center>
<img src="../exp4/images/RTDTemperature/task2.png">
</center>

#### Task 3: Dynamic Response & Time Constant

What it's for: To measure the transient response of the temperature measurement system.

How to do it: Click Step 50→75 °C to generate a sudden temperature increase.

Observation: Observe the Temperature Trace graph and the automatically measured response time for both raw and filtered signals to reach 65.8 °C (63.2% response).

<center>
<img src="../exp4/images/RTDTemperature/task3.png">
</center>

### Part 2: 4–20 mA Pressure Transmitter

Scenario: Monitoring ballast pump discharge pressure using a standard 4–20 mA transmitter.

#### Task 1: Sensor Linearity and Hysteresis

What it's for: To evaluate transmitter linearity and measure hysteresis during increasing and decreasing pressure.

How to do it: Click 0→10→0 bar Sweep. The simulator automatically increases the pressure to 10 bar and returns it to 0 bar.

Observation: Examine the Hysteresis Log showing pressure values during rising and falling cycles. The simulator calculates the maximum hysteresis difference.

<center>
<img src="../exp4/images/4-20mA/task1.png">
</center>

#### Task 2: Accuracy Under Load Changes

What it's for: To study the transient response of the pressure transmitter to a sudden pressure increase.

How to do it: Click Step 5→7 bar.

Observation: Observe the Pressure Trace graph and record the 63.2% rise time, settling time, and peak overshoot.

<center>
<img src="../exp4/images/4-20mA/task2.png">
</center>

#### Task 3: Out-of-Range Detection

What it's for: To investigate transmitter diagnostics under wiring fault conditions.

How to do it: Activate the Open Circuit (<3.5 mA) and Short Circuit (>21 mA) fault buttons.

Observation: Observe the loop current and verify that the diagnostic panel immediately displays an error. Clear the faults and confirm that normal operation resumes.

<center>
<img src="../exp4/images/4-20mA/task3.png">
</center>

### Part 3: Bearing Vibration (Accelerometer)

Scenario: Monitoring engine main-bearing health using an accelerometer.

#### Task 1: Static Offset Calibration

What it's for: To remove the accelerometer's DC offset before vibration measurements.

How to do it: Click Calibrate 0g (Horizontal).

Observation: The system averages multiple samples and displays the calculated offset error. Although instantaneous acceleration fluctuates because of normal engine vibration, the average reading becomes centered around 0 g.

<center>
<img src="../exp4/images/Vibration/task1.png">
</center>

#### Task 2: High-Frequency Injection

What it's for: To determine the frequency response of the vibration measurement system.

How to do it: Inject sinusoidal vibrations at 10 Hz, 100 Hz, 500 Hz, 1 kHz, and 5 kHz, recording each measurement.

Observation: Observe the Frequency Response graph. Notice that the response reaches the −3 dB point near 1 kHz, while higher frequencies are significantly attenuated.

<center>
<img src="../exp4/images/Vibration/task2.png">
</center>

#### Task 3: Bearing-Fault Detection

What it's for: To detect impulsive vibration signatures caused by bearing damage.

How to do it: Click Induce Bearing Spall to simulate a bearing defect.

Observation: Observe the Peak |g| value and the Accelerometer Waveform. Large impulsive shocks exceeding 8 g immediately trigger the Bearing Spall Detected alarm, even if the RMS vibration remains within normal limits.

<center>
<img src="../exp4/images/Vibration/task3.png">
</center>

### Part 4: Sensor Performance Evaluation

The simulator automatically computes important performance metrics for each sensor.

Students should evaluate:

- Accuracy – Difference between measured and true value.
- Repeatability – Consistency of repeated measurements.
- Response Time – Time required to respond to an input change.
- Hysteresis – Difference between increasing and decreasing measurements.
- Noise – Random variation under constant conditions.

### Part 5: Data Analysis

Compile the experimental results into a sensor performance table and compare the measured values with the expected specifications.

| Sensor Type | Accuracy | Repeatability | Response Time | Hysteresis | Noise |
|--------------|----------|---------------|---------------|------------|-------|
| RTD Pt100 | ±0.5 °C | ±0.2 °C | 15 s | ±0.1 °C | 0.2 °C |
| 4–20 mA Pressure | ±0.1 bar | ±0.05 bar | 100 ms | ±0.05 bar | 0.05 bar |
| Accelerometer | ±0.1 g | ±0.05 g | 5 ms | ±0.05 g | 0.1 g |


