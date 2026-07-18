### Background Theory

Synchro Systems: Synchro systems are electromechanical devices used to transmit shaft-angle information from one location to another. A synchro transmitter converts mechanical rotation into electrical signals, while a synchro receiver converts these signals back into mechanical rotation. Mechanical friction and loading can introduce steady-state position errors and tracking lag.

Optical Encoders: Incremental optical encoders generate digital pulses proportional to shaft rotation. A typical encoder provides 1024 Pulses Per Revolution (PPR). The pulse frequency is directly proportional to rotational speed, while two quadrature output channels (A and B) separated by 90° enable the detection of rotational direction.

PID Control: Proportional–Integral–Derivative (PID) control is a closed-loop feedback strategy used to position motors accurately. The proportional term improves response speed, the integral term removes steady-state error, and the derivative term reduces overshoot and improves stability.

<center>
<img src="../exp5/images/interface.png">
</center>

### Experimental Modules

The virtual laboratory is divided into three marine instrumentation modules, accessible from the control panel tabs.

- SYNCHRO – Investigate remote shaft-angle transmission, synchronization, and the effects of mechanical friction.
- ENCODER – Study incremental optical encoders, pulse generation, speed measurement, and direction detection.
- PID CTRL – Analyze closed-loop servo position control using encoder feedback and PID tuning.

### General Procedure

Before beginning the experiments:

1. Launch the simulation in a web browser.
2. Wait for the 3D models of the transmitter, receiver, Arduino board, and oscilloscope to load.
3. Rotate the 3D view using the mouse (or touch gestures) to inspect the equipment.
4. Zoom using the mouse wheel or pinch gesture.
5. Select the desired experiment tab from the control panel.


### Part 1: Synchro System

The synchro module demonstrates remote shaft-angle transmission and synchronization between transmitter and receiver units.

#### Task 1: Steady-State Angle Measurement

What it's for: To measure the steady-state angular error between the synchro transmitter and receiver under different mechanical loading conditions.

How to do it: Set the desired Receiver Friction Torque using the slider and click ▶ Run Task 1. The simulator automatically rotates the transmitter through 360° in 30° increments while recording the receiver angle and synchronization time.

Observation: Compare the transmitter and receiver shaft angles. Record the synchronization error and observe how increasing friction increases the steady-state angular error.

<center>
<img src="../exp5/images/task3.png">
</center>

#### Task 2: Dynamic Tracking

What it's for: To investigate the dynamic tracking performance of the synchro system during continuous shaft rotation.

How to do it: Click ▶ Run Task 2. The transmitter continuously rotates through 360°, and the receiver attempts to follow the motion.

Observation: Observe the oscilloscope display and note the reported tracking lag (ms) and maximum tracking error. The receiver exhibits a small delay due to electrical and mechanical dynamics.

<center>
<img src="../exp5/images/task2.png">
</center>

#### Task 3: Receiver Load Effect

What it's for: To determine the maximum mechanical load that the synchro receiver can tolerate before losing synchronization.

How to do it: Click ▶ Run Task 3. The simulator gradually increases the receiver friction while repeatedly stepping the shaft position.

Observation: Monitor the synchronization status. The simulator identifies the load level at which SYNC LOST occurs, indicating that the receiver can no longer accurately follow the transmitter.

<center>
<img src="../exp5/images/task2.png">
</center>

### Part 2: Optical Encoder Measurement

#### Task 1: Speed and Direction Measurement

What it's for: To understand how encoder pulse frequency relates to shaft speed and how quadrature signals determine rotational direction.

How to do it: Select the ENCODER tab and click the 1000 RPM preset. Verify that the displayed pulse frequency satisfies the relationship:

Frequency = (RPM × 1024) / 60

Next, click Reverse (-1) to reverse the shaft direction.

Observation: Observe the oscilloscope traces. Notice that Channel A and Channel B are separated by 90°. When the direction is reversed, the phase relationship changes, allowing the controller to determine the direction of rotation.

<center>
<img src="../exp5/images/task3.png">
</center>

### Part 3: Closed-Loop PID Control

#### Task 1: PID Gain Tuning

What it's for: To investigate how proportional, integral, and derivative gains affect servo positioning performance.

How to do it: Select the PID CTRL tab and initialize the controller with:

- Kp = 0.50
- Ki = 0.01
- Kd = 0.10

Set the Target Angle to 180° and click ▶ Run Loop.

Observation: Observe the motor position response. Increase Kp if the response is too slow, or increase Kd if excessive overshoot occurs. Fine-tune the gains until the motor reaches the target smoothly with minimal oscillation.

<center>
<img src="../exp5/images/encoder.png">
</center>

#### Task 2: Disturbance Rejection

What it's for: To evaluate the controller's ability to reject external disturbances and maintain the desired shaft position.

How to do it: Once the motor has stabilized at 180°, click  Step Load : Now to apply a sudden mechanical disturbance.

Observation: Observe how the PID controller responds. The Integral (Ki) term gradually removes the steady-state error caused by the disturbance and restores the motor to the commanded position.

<center>
<img src="../exp5/images/pidcontrol.png">
</center>