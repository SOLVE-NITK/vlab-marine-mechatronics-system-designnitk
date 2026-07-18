### The following procedure steps will be followed on the simulator

### Background Theory

Control Valves: Control valves regulate the flow of fluids in industrial processes by varying the valve opening. The flow rate (Q) depends on the valve flow coefficient (Cv) and the square root of the pressure drop (ΔP) across the valve.

Linear Valves: In a linear valve, the flow capacity increases proportionally with valve travel. These valves are well suited for applications where the pressure drop across the valve remains nearly constant.

Equal Percentage Valves: In an equal percentage valve, equal increments of valve travel produce equal percentage increases in the existing flow rate. These valves are commonly used in practical process industries because they provide a nearly linear installed flow characteristic when the pressure drop changes with valve position.

<center>
<img src="../exp2/images/entire.png">
</center>

### Experimental Modules

The virtual laboratory is divided into three analytical modules, accessible through the top control tabs:

- EXP 1: EQUAL % – Study the characteristics of an Equal Percentage control valve by varying valve opening and pressure drop.
- EXP 2: LINEAR – Analyze the behavior of a Linear control valve under identical operating conditions and compare its performance.
- EXP 3: FLOW CHAR. – Compare the inherent and installed flow characteristics of both valve types using graphical analysis.

### Part 1: Equal Percentage Valve Characterization

#### Task 1: Steady-State Measurements

What it's for: To determine the steady-state flow characteristics of the Equal Percentage valve under different pressure drops.

How to do it: Click Start Automated Step 1 Test. The simulation automatically varies the valve opening from 0% to 100% at pressure drops of 0.5, 1.0, and 2.0 bar, records the corresponding flow rates, and displays the results in the data table.

<center>
<img src="../exp2/images/equal_perc/task1.png">
</center>

#### Task 2: Dynamic Response Testing

What it's for: To investigate the valve's transient response to sudden changes in pipeline pressure.

How to do it: Set the valve opening to 50% and click Start Dynamic Test. The simulation introduces a step change in pressure from 0.5 bar to 2.0 bar. Observe the dynamic response graph to analyze the system's overshoot and settling time.

<center>
<img src="../exp2/images/equal_perc/task2.png">
</center>

#### Task 3: Fault Injection (Leakage & Stiction)

What it's for: To study how common valve faults affect flow control performance and system stability.

How to do it: Enable Fault 1: Internal Leakage and reduce the valve opening to 0%. Notice that the flow never reaches 0 L/min, indicating valve seat leakage. Next, enable Fault 2: Actuator Stiction and slowly move the valve position slider. Observe the dead-band effect caused by static friction before the valve begins to move.

<center>
<img src="../exp2/images/equal_perc/fault.png">
</center>

### Part 2: Linear Valve Characterization

#### Task 1: Comparative Analysis

What it's for: To compare the steady-state flow characteristics of a Linear valve with those of an Equal Percentage valve.

How to do it: Switch to the EXP 2: LINEAR tab and repeat the Steady-State Test. Compare the generated flow curves. The Linear valve produces a nearly straight-line relationship between valve opening and flow rate, whereas the Equal Percentage valve exhibits an exponential characteristic.

<center>
<img src="../exp2/images/linear/task1.png">
</center>

#### Task 2: Dynamic Response Testing

What it's for: To evaluate the transient behavior of the Linear valve during sudden pressure changes and compare it with the Equal Percentage valve.

How to do it: While in the EXP 2: LINEAR tab, click Step 2: Dynamic Test. Observe the real-time response graph and compare the overshoot and settling characteristics with those obtained for the Equal Percentage valve.

<center>
<img src="../exp2/images/linear/task2.png">
</center>

### Part 3: Installed vs. Inherent Flow Characteristics

#### Task 1: Understanding Real-World Piping Systems

What it's for: To understand why Equal Percentage valves are preferred in most industrial process control applications.

How to do it: Switch to the EXP 3: FLOW CHAR. tab and examine Plot 1C. Compare the Inherent and Installed flow characteristics of both valve types. Notice that the installed characteristic of the Equal Percentage valve becomes nearly linear because the valve characteristic compensates for pressure losses in the piping system, whereas the Linear valve deviates significantly from linear behavior after installation.

<center>
<img src="../exp2/images/flow_char/task1.png">
</center>


