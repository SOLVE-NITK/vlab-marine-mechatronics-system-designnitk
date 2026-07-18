### Control Valve Fundamentals

A control valve is the final control element in a process loop. It modulates the flow of process fluid, seawater, fuel oil, or cooling water, by varying the cross-sectional area of an internal orifice in response to a controller output signal (typically 4, 20 mA or 0, 10 V). The fundamental flow equation relating valve opening to flow is:

Q = Cv √ΔP

where Q is the volumetric flow rate (US GPM), Cv is the valve flow coefficient, and ΔP is the pressure drop across the valve (psi). This equation assumes turbulent, incompressible single-phase flow and is the basis of all valve sizing calculations.

Valve rangeability is the ratio of maximum to minimum controllable flow. A typical marine control valve has a rangeability of 50:1, meaning it can accurately modulate flow from 2% to 100% of its rated maximum. Below the minimum controllable flow, the valve becomes unstable and causes hunting in the control loop.

### Inherent vs. Installed Characteristics

The inherent characteristic describes the relationship between valve opening (stem position) and flow at a constant pressure drop. The installed characteristic is the actual flow-vs.-opening relationship in a real piping system, where pressure drop across the valve varies as the system resistance changes. Installed characteristics deviate significantly from inherent characteristics whenever the valve pressure drop is a small fraction of the total system pressure drop.

This distinction is critical in marine systems: a linear valve with excellent inherent linearity may exhibit highly nonlinear installed behaviour when installed in a system with high pipe friction losses, making it unsuitable for precision cooling-water control.

### Valve Types and Marine Applications

<u>**Equal-Percentage Valve :**</u>

The flow characteristic follows an exponential relationship:

Q = Qmax × R^(x−1)

where x is the fractional valve travel (0, 1) and R is the valve rangeability, meaning equal increments of valve opening produce equal percentage changes in flow. This self-compensating behaviour makes it excellent for modulating services (cooling-water temperature control, fuel-oil flow regulation) where system pressure varies significantly.

<u>**Linear Valve :**</u>

Flow increases linearly with stem position:

Q = Qmax × x

It is preferred where the system pressure drop is essentially constant and a direct relationship between controller signal and flow is required (bilge and ballast discharge lines).

<u>**Quick-Opening Valve :**</u>

Provides maximum flow at small opening increments, then plateaus. Used exclusively for emergency on/off service (emergency cooling bypass, emergency sea suction) where rapid, full-flow opening is needed but modulation is not required.

### Actuator Technologies

Three actuator types are standard in marine practice:

| Actuator Type | Supply | Response Time (s) | Typical Force | Marine Advantage |
|--------------|--------|---------------|---------------|------------------|
| Pneumatic | 3, 6 bar compressed air | 4, 8 | Medium | Intrinsically safe; compressed air available ship-wide |
| Hydraulic | 150, 250 bar oil | 1, 3 | High | High force; used for large bore valves and steering gear |
| Electric solenoid | 24 VDC | < 1 | Low, Medium | Precise positioning; easy integration with PLC/DCS |

### Fault Modes

The three fault scenarios simulate real failure modes:

- **Valve internal leakage:** Wear on the valve seat allows 10% flow at closed position. This raises the minimum controllable flow and introduces steady-state offset error in control loops.

- **Actuator stiction:** Static friction on the valve stem creates a dead-band of ~10% additional signal before movement occurs. This degrades control quality with limit cycling.

- **Pilot supply failure (pneumatic):** Reducing pilot air below 2 bar removes the force needed to hold valve position against system pressure, causing the valve to drift closed.