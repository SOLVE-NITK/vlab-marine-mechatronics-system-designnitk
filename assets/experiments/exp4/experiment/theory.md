### Temperature Sensing, RTD Pt100

A Resistance Temperature Detector (RTD) uses the predictable change in electrical resistance of platinum with temperature. The Pt100 standard specifies 100 Ω at 0°C and follows the relationship R(T) = R0(1 + αT) where α = 0.00385/°C for Pt100. This gives 138.5 Ω at 100°C. The sensor is connected in a voltage-divider circuit; the output voltage is read by the ADC and converted to temperature using a calibration equation.

Accuracy is ±0.5°C; response time (in flowing water) is 10, 20 s, making it suitable for monitoring main-engine cooling-water temperature, lubricating-oil temperature, and bearing temperatures.

### Pressure Sensing, 4, 20 mA Transducer

The 4, 20 mA current loop is the marine industry standard for analog signal transmission over long cable runs in the engine room. The 4 mA "live zero" allows wire-break detection (any reading below 3.5 mA indicates an open circuit), which is a critical safety feature in marine systems. A 250 Ω burden resistor converts current to voltage (1, 5 V) for ADC reading. The scaling equation is:

Accuracy is ±1% full scale (±0.1 bar for a 0, 10 bar range); response time is 50, 200 ms.

### Vibration Sensing, MEMS Accelerometer

The accelerometer outputs a voltage proportional to acceleration: 2.5 V at 0 g, with ±1 V swing for ±10 g. Mounted on a main-engine bearing, it enables Condition-Based Maintenance (CBM) by detecting bearing-fault signatures, characterised by impulsive events at the Bearing Defect Frequency (BDF), before catastrophic failure.

### Signal Conditioning

Four signal-conditioning operations are used in this experiment:

Amplification: Vout = A × Vin; gain A = 1 + Rf/Rin.

Low-pass filtering: fc = 1/(2πRC); removes mains interference and EMI.

Offset correction: Vcorrected = Vraw − Voffset.

Scaling: x = (Vadc − Vmin)/(Vmax − Vmin) × (xmax − xmin) + xmin.

A digital moving-average filter (window size N) is implemented in software; it reduces RMS noise by a factor of √N at the cost of increased response time (N × sampling interval).