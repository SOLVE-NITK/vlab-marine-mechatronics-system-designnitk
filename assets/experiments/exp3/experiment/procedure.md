#### The following procedure steps will be followed on the simulator

### Background Theory

Servo Motors: Servo motors are closed-loop actuators that use feedback and a PWM (Pulse Width Modulation) signal to achieve a desired position. An internal controller continuously compares the target position with the actual position measured by a feedback sensor (typically a potentiometer) and drives the motor to minimize the position error. Increasing the proportional gain (Kp) improves response speed but may introduce oscillations or instability if set too high.

Stepper Motors: Stepper motors are open-loop actuators that rotate in precise digital steps. The controller energizes the stator coils in sequence, causing the rotor to align with successive magnetic fields. Although they provide accurate positioning without feedback, they can lose synchronization and skip steps if the applied mechanical load exceeds the motor's holding torque.

<center>
<img src="../exp3/images/entire.png">
</center>

### Experimental Modules

The virtual laboratory consists of two actuator control modules, accessible through the top control tabs:

- SERVO MOTOR CONTROL – Investigate the performance of a closed-loop servo system, including positioning accuracy, dynamic tracking, and proportional gain tuning.
- STEPPER MOTOR CONTROL – Analyze the operation of an open-loop stepper motor, including step sequencing, overload behavior, and acceleration profiling.

### Part 1: Servo Motor Control

#### Task 1: Static Positioning Accuracy

What it's for: To evaluate the steady-state positioning accuracy and error of the servo motor under closed-loop feedback control.

How to do it: Click Start Task 1 Protocol. Command different target angles (0°, 45°, 90°, etc.) using the preset buttons or the position slider. Observe the Actual Rudder Deflection and the corresponding PWM Signal Width (ms), and record the measurements in the data table.

<center>
<img src="../exp3/images/servoMotorControl/task1.png">
</center>

#### Task 2: Dynamic Tracking

What it's for: To examine how effectively the servo motor follows continuously changing position commands.

How to do it: Switch to Task 2 and select either the Sine Wave or Step tracking profile. Observe the real-time HUD display showing the dynamic tracking error e(t) as the servo follows the moving reference position.

<center>
<img src="../exp3/images/servoMotorControl/task2.png">
</center>

#### Task 3: Load Effect & Proportional Gain (Kp)

What it's for: To study the influence of external mechanical loads and proportional gain on servo performance.

How to do it: Apply a virtual mechanical load to the servo system and observe the increase in steady-state position error. Gradually increase the Kp value using the gain slider. Notice how the controller reduces the error by applying greater corrective effort. Excessively high Kp values may produce oscillations or jitter.

<center>
<img src="../exp3/images/servoMotorControl/task3.png">
</center>

### Part 2: Stepper Motor Control

#### Task 1: Open-Loop Sequencing

What it's for: To understand how digital coil excitation sequences generate precise rotational motion.

How to do it: Set the motor to a low rotational speed and alternate between Full-Step and Half-Step modes. Observe the motor animation and compare the motion. Half-stepping provides finer angular resolution and smoother rotation but requires a more complex coil excitation sequence.

<center>
<img src="../exp3/images/steppermotor/task1.png">
</center>

#### Task 2: Overload & Skipped Steps

What it's for: To demonstrate how excessive load torque causes stepper motors to lose synchronization in open-loop control.

How to do it: Start the motor and apply a large Load Torque. Observe that the motor stalls or vibrates while the controller continues issuing step commands. After removing the load, compare the commanded position with the actual shaft position to observe the accumulated positioning error caused by skipped steps.

<center>
<img src="../exp3/images/steppermotor/task2.png">
</center>

#### Task 3: Acceleration Profiling

What it's for: To investigate how acceleration profiles improve stepper motor performance at high operating speeds.

How to do it: Switch to Task 3 and command an Instantaneous Step to a high pulse frequency (e.g., 2000 Hz). Observe whether the motor stalls due to loss of synchronization. Then select the S-Curve Sigmoidal Ramp profile and compare how the gradual acceleration enables the motor to reach the same speed smoothly without losing steps.

<center>
<img src="../exp3/images/steppermotor/task3.png">
</center>


