
### Programmable Logic Controllers

A Programmable Logic Controller (PLC) is an industrial digital computer hardened for real-time process control. Unlike general-purpose computers, a PLC executes a repetitive scan cycle, reading inputs, running the control program, updating outputs, with a deterministic, fixed cycle time (typically 1-100 ms). This determinism is essential in marine applications where a delayed response to a high-level alarm could cause structural flooding or stability loss.

Key PLC hardware elements include the Central Processing Unit (CPU), isolated 24 VDC I/O modules, a power supply unit, and a programming terminal. Isolation of I/O modules provides noise immunity in the electromagnetically noisy engine-room environment. Modern PLCs support multiple IEC 61131-3 programming languages; Ladder Diagram (LD) is the most common in marine practice because it resembles electrical relay schematics familiar to ship engineers.

### Sequence Control and Interlocks

Sequence control is the ordered activation and deactivation of plant devices. Interlocks are logical conditions that prevent a dangerous or undesired state from occurring. In a marine ballast system, representative interlocks include:

- Preventing the inlet pump and outlet solenoid from being simultaneously energised.
- Inhibiting pump start if the outlet valve is not fully seated (confirmed by valve-position feedback).
- Automatically closing the inlet and raising an alarm if any level sensor fails (fail-safe design).
- Disabling filling if the high-level sensor is activated to prevent structural overstress.

The concept of a "safe state," typically pump OFF and outlet OPEN, underpins all interlock design. Any unresolved fault must drive the system to this state. This approach is consistent with IEC 61511 functional-safety requirements applied to marine process systems.

### Level Sensing Technologies

Four principal technologies are used for tank level measurement aboard ships:

| Sensor Type | Operating Principle | Typical Application | Key Limitation |
|-------------|---------------------|---------------------|----------------|
| Float switch | Mechanical float on hinged arm breaks/makes circuit | Ballast/freshwater simple alarm | Binary only; limited resolution |
| Capacitive probe | Change in capacitance as liquid contacts probe | Fuel oil, bilge monitoring | Affected by fluid dielectric variation |
| Hydrostatic pressure | Pressure proportional to liquid column height | Deep ballast tanks | Requires temperature/density compensation |
| Ultrasonic | Time-of-flight of acoustic pulse to liquid surface | Sealed tanks, clean fluids | Affected by vapour, foam, internal structure |

For this experiment, three discrete level sensors (low at 10%, mid at 50%, high at 90% of tank height) are used, simulating float-switch or capacitive point-level devices that are standard in shipboard ballast systems.

### Virtual Ballast Tank Model

The simulator uses a cylindrical tank (diameter 2 m, height 5 m, total volume ≈ 15.7 m³) with an inlet pump (nominal 10 m³/h) and a solenoid outlet valve. Inlet and outlet flow rates, sensor trigger thresholds, valve response delays (2 s), and pump startup time constants are all configurable. The PLC program is entered in a TIA Portal-compatible ladder-logic environment and executed by the simulation engine in real time.

### PLC Ladder Logic, Key Networks

The automatic filling program implements five essential networks:

- **Network 1:** Start pump when low-level sensor is ON AND high-level sensor is OFF.
- **Network 2:** Stop pump when high-level sensor turns ON.
- **Network 3:** Open outlet solenoid (fail-safe normally-closed) when overfill alarm activates.
- **Network 4:** Force safe state (pump OFF, outlet OPEN, alarm ON) on any sensor-validation failure.
- **Network 5:** Manual override switch; operator can force pump OFF and outlet OPEN at any time.

This logic demonstrates the principle of defensive programming: each network addresses one specific hazardous condition, and collectively they ensure the system can reach a safe state regardless of which single component fails.

### Fault Response and Diagnostics

The experiment includes four fault-injection scenarios simulating real failure modes encountered at sea:

- **Low-level sensor open-circuit:** Pump fails to start; requires manual override and sensor replacement.
- **High-level sensor stuck ON:** Pump shuts down spuriously; watchdog timer detects prolonged "full" signal without expected filling.
- **Outlet valve stuck open:** Tank cannot hold level; alarm triggered by inability to raise level despite pump running.
- **Pump cavitation (reduced displacement):** Filling time doubles; diagnosed by comparing actual vs. expected rise rate.

Diagnostic response time target is ≤ 30s for all fault types; all faults must cause the system to enter the defined safe state automatically.