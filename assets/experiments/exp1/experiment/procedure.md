### <u>PLC Based Ballast:</u>

### Background Theory

PLC Control: PLCs continuously scan inputs (sensors) and update outputs (pumps, valves) based on a programmed sequence known as Ladder Logic. In marine engineering, they are crucial for reliable automated control of critical ship systems.

Ladder Logic: A graphical programming language where logic is represented by electrical circuits. Contacts (Normally Open/Normally Closed) act as switches, and Coils act as outputs (relays).

<img src="../exp1/images/entire.png"/>

### The PLC Control Center (Tabs)

The right-hand panel is the PLC Control Center, divided into two main tabs:

CONTROLS: The primary operator dashboard. Here you can run predefined scenarios, manually trigger the pump and emergency stops, and inject faults.

ANALYSIS: The engineering view. This tab contains the live Ladder Logic diagram, the I/O state configuration table, and real-time performance charting.

### Part 1: Operational Scenarios (CONTROLS Tab)

Use the CONTROLS tab to test various real-world automation situations:

#### Scenario A: Auto-Fill (Normal Operation)

What it's for: To test the fundamental start/stop logic based on limit switches.

How to do it: Click Scenario A: Auto-Fill. Watch the live Ladder Logic monitor. You will see NET 1 activate the pump (Q0.0) when the low level sensor is active. Once the water hits 91%, NET 2 will trigger the high-level shutoff coil, stopping the pump automatically.

<center>
<img src="../exp1/images/scenarioa.png">
</center>

#### Scenario B: Maintaining Level (Disturbance)

What it's for: To observe how a PLC handles continuous operational disturbances, such as an active leak or ongoing discharge.

How to do it: Click Scenario B. The system will open the outlet valve. Observe how the pump cycles on and off (duty cycle) to continuously maintain the water level within acceptable limits.

<center>
<img src="../exp1/images/scenariob.png">
</center>

#### Scenario C: Fault Injection & Recovery

What it's for: To train operators on manual recovery procedures when physical sensors or actuators break.

How to do it: Click Scenario C. Inject faults using the buttons that appear (e.g., Low Sensor Fail, Valve Stuck OPEN, Pump Cavitation). Note the DIAGNOSTIC ALERT panel that appears. Follow the red "OPERATOR RECOVERY ACTION" instructions (like manually isolating the valve or boosting pump pressure) to save the system from total failure.

<center>
<img src="../exp1/images/scenarioc.png">
</center>

### Part 2: Data Collection and Analysis (ANALYSIS Tab)

Switch to the ANALYSIS tab in the Control Center. This tab provides automated data collection and calculations for four engineering tasks:

#### Task 1: Hysteresis Characterization

What it's for: To calculate the sensor trigger points and the hysteresis band (the difference between rising and falling trigger levels).

How to do it: Expand Task 1 and click START TASK 1. Wait for the automated experiment to complete and record the results.

<center>
<img src="../exp1/images/task1.png">
</center>

#### Task 2: System Response Time

What it's for: To measure the delay between the high-level sensor triggering and the pump physically shutting down.

How to do it: Expand Task 2 and click START TASK 2. Wait for the scenario to finish and observe the timing metrics.

<center>
<img src="../exp1/images/task2.png">
</center>

#### Task 3: Steady-State Behavior

What it's for: To analyze pump duty cycle and hunting (oscillations) around a setpoint when there is a continuous disturbance (outlet leak).

How to do it: Expand Task 3 and click START TASK 3. Let the simulation run until it calculates the pump duty cycle and average levels.

<center>
<img src="../exp1/images/task3.png">
</center>

#### Task 4: Fault Detection & Safety Interlocks

What it's for: To calculate the Time-to-Detect (TTD) latency for various safety interlocks during catastrophic fault scenarios.

How to do it: Expand Task 4 and click START TASK 4. Review the detection latency and recommended threshold results.

<center>
<img src="../exp1/images/task4.png">
</center>

-----
----

### <u>Water Tank Level Control</u>

### Background Theory

Draft & Displacement: According to Archimedes' principle, a ship displaces a volume of water equal to its total mass. When a ship unloads heavy cargo, its mass decreases, causing it to float higher (lower draft).

The Need for Ballast: Floating too high is extremely dangerous. The propeller may come out of the water (losing propulsion), and the bow may slam violently into waves. To counteract this, ships pump thousands of tons of seawater into internal ballast tanks to artificially increase their weight and sink back to a safe operating draft.

<center>
<img src="../exp1/images/exp2/entire.png">
</center>

### Ship Ballast System Visualization

The simulation provides a 3D cross-section of a container ship. Use the Exterior, Cutaway, and X-ray buttons to explore the ship structure, including the double-bottom and wing ballast tanks.

#### Part 1: Loading Conditions

Use the preset loading conditions to understand how cargo and ballast influence the ship's draft and displacement.

**Task 1: Preset Loading Conditions**

What it's for: To observe how different combinations of cargo and ballast affect the ship's waterline and stability.

How to do it: Click the preset buttons: Empty, Ballast Only, Half Load, and Full & Trim. Observe the changes in the Draft (m) and Displacement (t) displays. Notice that selecting Empty causes the system to trigger an Unsafe alarm because the ship floats too high.

<center>
<img src="../exp1/images/exp2/task1.png">
</center>

**Task 2: Manual Control & Sea State**

What it's for: To investigate the combined effects of cargo loading, ballast water, and ocean waves on ship stability.

How to do it: Use the Cargo and Ballast Water sliders to manually adjust the loading conditions. Increase the Sea State slider to generate larger waves. Set both Cargo and Ballast to 0% while selecting Sea State 5. Observe the Propeller Emergence effect, where the propeller repeatedly comes out of the water, demonstrating why ballast water is essential for safe operation.

<center>
<img src="../exp1/images/exp2/task2.png">
</center>

**Task 3: PLC Automation Testing**

What it's for: To observe how the ship's automated ballast control system maintains a safe operating draft and responds to system faults.

How to do it: Click Scenario A to allow the PLC controller to automatically pump ballast water until the ship reaches a safe draft. Next, click Scenario C (Faults) to simulate a sensor failure and observe the system generating a diagnostic alarm while entering fault-handling mode.

<center>
<img src="../exp1/images/exp2/task3.png">
</center>