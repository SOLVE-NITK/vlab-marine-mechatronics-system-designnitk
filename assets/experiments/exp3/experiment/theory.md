### Arduino Microcontroller Platform

The Arduino Uno is based on the ATmega328P 8-bit microcontroller running at 16 MHz. It provides 14 digital I/O pins, 6 analog input pins (10-bit ADC, 0, 1023 counts), 6 PWM output channels, 3 hardware timers, and serial communication at up to 115,200 baud. The platform is ideal for rapid prototyping of embedded control systems because its IDE compiles C++ code to AVR machine code without requiring an external programmer.

### Servo Motors

A servo motor is a closed-loop positioning device comprising a DC motor, gear train, potentiometer feedback, and integrated control electronics. Position is commanded via a PWM signal: pulse width 1.0 ms = 0°, 1.5 ms = 90°, 2.0 ms = 180°. The internal electronics compare potentiometer feedback to the commanded position and drive the motor until the error is zero.

In marine rudder systems, servo motors provide precise angular positioning across the full ±35° rudder range, with fail-safe return to amidships on power loss. Performance specifications include: speed 60 deg/s, torque 4.8 kg·cm (48 N·cm) at 4.8 V, holding torque 3.5 kg·cm minimum.

### Stepper Motors

A stepper motor advances in discrete angular steps in response to digital pulses. For a 200-step/rev motor, each full step = 1.8°. Microstepping divides each full step further (1/2, 1/4, 1/8) for smoother motion. Control requires only a STEP pulse, a DIRECTION signal, and an ENABLE line, no position feedback is needed for open-loop operation.

Marine applications include winch position indexing, anchor windlass hold-to-position, and cargo hatch sequencing. The stepper's inherent open-loop accuracy (±0.5°) and high holding torque (5, 20 N·m for NEMA 23/34) are well matched to these tasks.

### Control Strategies

Proportional Control: u(t) = Kp × e(t), where e(t) is the positional error. Simple but leaves a steady-state error under constant load.

PID Control: u(t) = Kp × e(t) + Ki∫e(t)dt + Kd × de(t)/dt. The integral term Ki∫e(t)dt eliminates steady-state offset; the derivative term Kd × de(t)/dt damps oscillation and reduces overshoot.

Integrator anti-windup is implemented in the code by clamping sumError to ±1000, preventing excessive integral accumulation when the motor is saturated.