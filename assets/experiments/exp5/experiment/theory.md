### Synchro Systems

A synchro is an electromechanical angle transducer consisting of a rotor (excited by 115 V, 50 Hz AC) and a wound three-phase stator. As the rotor turns, the stator generates three AC signals with amplitudes proportional to, and, uniquely encoding the shaft angle over 0, 360°.

A synchro receiver contains the complementary winding set; when connected to the transmitter stator, its rotor electromagnetically hunts to the null (zero-torque) position, mechanically indicating the transmitter shaft angle. This mechanical synchronisation requires no electronics and is inherently noise-immune in the ship's electromagnetic environment.

Marine applications include radar antenna bearing transmission, ship heading repeaters for autopilot, and rudder angle indicators on the bridge.


### Optical Incremental Encoders

An incremental encoder generates rectangular pulse trains on channels A and B, 90° (quadrature) phase-shifted relative to each other, as the shaft rotates. Resolution is defined in Pulses Per Revolution (PPR); quadrature decoding yields 4× PPR counts per revolution.

For a 1024 PPR encoder: angular resolution = 360°/1024 = 0.352° per pulse; with quadrature decoding: 0.088° per count. At 1000 RPM, channel A frequency = 1000 × 1024/60 = 17,067 Hz.

The index (Z) channel produces one pulse per revolution, providing a homing reference for absolute position after power-up. Direction is determined by the phase relationship of A and B: if B leads A, rotation is forward; if A leads B, rotation is reverse.

### Closed-Loop PID Position Control

The PID controller targets a position setpoint in encoder counts. The error is e = target_counts − current_counts. The control law is: u(t) = Kp×e(t) + Ki∫e(t)dt + Kd×de(t)/dt.

Tuning strategy:

1. Start with Ki = 0 and Kd = 0, increase Kp until oscillation begins (ultimate gain Ku).
2. Reduce Kp to ~60% of the ultimate gain.
3. Add Ki to eliminate steady-state offset.
4. Add Kd to reduce overshoot.