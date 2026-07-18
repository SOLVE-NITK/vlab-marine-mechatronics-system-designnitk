/* ================================================================
   PLC SIMULATION ENGINE (plc.js)
================================================================ */

// PLC I/O State
let PLC_I = { i00: false, i01: false, i02: false, manualStop: false, manualPump: false, armed: false };
let PLC_Q = { q00: false, q01: false, q02: false };
let sensorValidation = true;

// Per-network firing states for Ladder Logic Monitor display
let networkState = {
  n1_i00: false, n1_i02_nc: false, n1_firing: false, n1_output: false,
  n2_i02: false,                   n2_firing: false, n2_output: false,
  n3_overfill: false,              n3_firing: false, n3_output: false,
  n4_sensorFail: false,            n4_firing: false, n4_output: false,
  n5_manualStop: false,            n5_firing: false, n5_output: false
};

// Timers & Watchdogs
let highSensorWatchdog = 0;       // Timer to detect stiction
let unintendedDrainWatchdog = 0;  // Timer for Fault 3
let fillingPredictionTimer = 0;
let drainLevelTracker = null;      // Tracks level for rate-of-change (Fault 3)
let pumpDelayTimer = 0;            // Task 2: Electrical shutdown delay

// Analysis Task 1: Hysteresis Tracking
let sensorStates = { i00: false, i01: false, i02: false };
let hysteresisLog = []; // Stores { sensor, direction, level, time }
let alarmState = {
  sensor_stiction: false,
  efficiency_loss: false,
  unintended_drain: false,
  low_sensor_failure: false
};

// Simulation State (Disturbances & Faults)
let pumpEfficiency = 1.0;
let expectedRiseRate = 0.00265; // Defaults to 10 m³/h
let leakEnabled = false;
let faults = {
  low_sensor_fail: false,
  high_sensor_stuck: false,
  valve_stuck_open: false,
  cavitation: false
};
let forceInlet = false;
let diagnosticsActive = false; // Disabled by default for Scenarios A & B
let lastFillingPrediction = "--:--";
let valveIsolated = false;     // Manual override for Fault 3 recovery

/**
 * runPLCCycle: The deterministic scan cycle of the PLC
 * @param {number} level - Normalized water level (0.0 - 1.0)
 * @param {number} delta - Time since last scan
 */
function runPLCCycle(level, delta) {
  // 1. INPUT SCAN (with 1% industrial hysteresis for Task 1)
  const dead = 0.01; // 1% deadband
  
  // Low Sensor (I0.0) - Triggers ON at <9%, OFF at >11%
  let next_i00 = PLC_I.i00;
  if (level < 0.10 - dead) next_i00 = true;
  if (level > 0.10 + dead) next_i00 = false;
  
  // Mid Sensor (I0.1) - Triggers ON at >51%, OFF at <49%
  let next_i01 = PLC_I.i01;
  if (level > 0.50 + dead) next_i01 = true;
  if (level < 0.50 - dead) next_i01 = false;
  
  // High Sensor (I0.2) - Triggers ON at >91%, OFF at <89%
  let next_i02 = PLC_I.i02;
  if (level > 0.90 + dead) next_i02 = true;
  if (level < 0.90 - dead) next_i02 = false;

  // Track Trigger Events for Task 1
  checkTrigger(next_i00, "I0.0", level);
  checkTrigger(next_i01, "I0.1", level);
  checkTrigger(next_i02, "I0.2", level);

  PLC_I.i00 = next_i00;
  PLC_I.i01 = next_i01;
  PLC_I.i02 = next_i02;

  // 2. INPUT FAULTS & WATCHDOGS
  if (faults.low_sensor_fail) PLC_I.i00 = false;
  if (faults.high_sensor_stuck) PLC_I.i02 = true;

  // WATCHDOG: Detect High-Level Stiction (Fault 2)
  // Condition: I0.2 is ON but actual level is below the real trigger threshold (90%).
  // A genuine full-tank reading is valid only above 90%; anything lower means stiction.
  const HIGH_SENSOR_THRESHOLD = 0.90; // I0.2 real ON threshold
  const STICTION_TIMEOUT = 10.0;      // 10s sustained mismatch → stiction alarm

  if (PLC_I.i02 && level < HIGH_SENSOR_THRESHOLD) {
    const prevWatchdog = highSensorWatchdog;
    highSensorWatchdog += delta;

    // Log once when mismatch is first detected
    if (diagnosticsActive && prevWatchdog === 0) {
      if (typeof log === 'function')
        log(`WATCHDOG START: I0.2 HIGH but level=${(level*100).toFixed(1)}% (below ${(HIGH_SENSOR_THRESHOLD*100).toFixed(0)}% threshold). Stiction timer running.`);
    }

    // Mid-point warning (fires once when crossing 50% of timeout)
    if (diagnosticsActive && prevWatchdog < STICTION_TIMEOUT * 0.5 && highSensorWatchdog >= STICTION_TIMEOUT * 0.5) {
      if (typeof log === 'function')
        log(`WATCHDOG WARNING: High sensor stuck for ${(STICTION_TIMEOUT*0.5).toFixed(0)}s. Level=${(level*100).toFixed(1)}%, sensor still reads FULL.`);
    }

    // Fire stiction alarm when timeout elapsed
    if (diagnosticsActive && highSensorWatchdog >= STICTION_TIMEOUT && !alarmState.sensor_stiction) {
      alarmState.sensor_stiction = true;
      if (typeof log === 'function') {
        log(`ALARM: High-Level Sensor Stiction Detected! (${STICTION_TIMEOUT}s elapsed)`);
        log(`DIAGNOSIS: I0.2 = TRUE but actual level = ${(level*100).toFixed(1)}% — sensor is stuck HIGH (open-circuit / mechanical stiction).`);
      }
    }
  } else {
    if (highSensorWatchdog > 0 && !alarmState.sensor_stiction) {
      if (typeof log === 'function')
        log(`WATCHDOG RESET: Stiction timer cleared (level=${(level*100).toFixed(1)}%, I0.2=${PLC_I.i02}).`);
    }
    highSensorWatchdog = 0;
  }

  // WATCHDOG: Detect Low-Level Sensor Failure (Fault 1: Open Circuit)
  if (diagnosticsActive && ((level < 0.05 && !PLC_I.i00) || (level > 0.15 && !PLC_I.i00 && faults.low_sensor_fail))) {
    if (!alarmState.low_sensor_failure) {
      alarmState.low_sensor_failure = true;
      if (typeof log === 'function') log("ALARM: Low-Level Sensor Mismatch Detected (I0.0 Open Circuit)!");
    }
  }

  // 3. LOGIC RESOLUTION (LADDER LOGIC)
  
  // Only execute pump logic if ARMED or in MANUAL
  if (PLC_I.armed || PLC_I.manualPump) {
    // NETWORK 1: Pump Enable (Including Fault 1 Manual Recovery)
    // Safety Interlock: Inhibit pump if outlet valve (Q0.1) is commanded OPEN
    if (!PLC_Q.q01) {
      if (PLC_I.i00 === true || PLC_I.manualPump === true) {
        PLC_Q.q00 = true;
      } else if (level < 0.88 && !PLC_I.i02 && !PLC_I.manualStop && !faults.low_sensor_fail) {
        // Standard hunting logic
        PLC_Q.q00 = true; 
      }
    } else {
      PLC_Q.q00 = false; // Forced interlock shutdown
    }

    // NETWORK 2: Safety Shutdowns
    const shouldStop = (PLC_I.i02 === true || alarmState.sensor_stiction || (alarmState.low_sensor_failure && !PLC_I.manualPump) || PLC_I.manualStop) && !forceInlet;
    if (shouldStop) {
      // Electrical response time (PLC scan + coil de-energization) ≈ 0.4s
      pumpDelayTimer += delta;
      if (pumpDelayTimer >= 0.4) {
        PLC_Q.q00 = false;
      }
    } else {
      pumpDelayTimer = 0;
    }
  } else {
    PLC_Q.q00 = false; // System not armed
  }

  // NETWORK 3: Solenoid outlet valve (Fail-Safe: normally closed)
  // Logic: Open if Overfilled, if any sensor validation fails, or if Manual Stop is active.
  // Safety Interlock: Prevent opening if pump (Q0.0) is active, UNLESS in a critical emergency state.
  const sensorFail = alarmState.sensor_stiction || alarmState.low_sensor_failure;
  const emergencyDrain = level > 0.95 || sensorFail || PLC_I.manualStop;
  
  if (emergencyDrain) {
    PLC_Q.q01 = true;
  } else if (!PLC_Q.q00) {
    // Normal operation (non-emergency): only allow opening if pump is OFF
    PLC_Q.q01 = false; 
  } else {
    PLC_Q.q01 = false;
  }

  // DIAGNOSTIC: Detect Unintended Drain (Fault 3: Outlet Valve Stuck Open)
  // Condition A: Pump is ON but level is still falling (drain > fill) AND level < mid-point
  // Condition B: Valve is commanded open (Q0.1=TRUE) while pump has been running and level is still below 50%
  // Both conditions indicate the valve is stuck open and draining faster than the pump can fill.
  const DRAIN_ALARM_TIMEOUT = 8.0; // 8s sustained mismatch → unintended drain alarm

  // Level falling check (robust check against noise)
  const levelFalling = (level < (drainLevelTracker || level) - 0.001); 
  drainLevelTracker = level; 

  // Condition: LEVEL FALLING while Pump is ON (Major mismatch)
  // OR level is below 50% (mid-point) and we are unable to recover it.
  const drainCondition = (PLC_Q.q00 && levelFalling) || (level < 0.50 && levelFalling && !valveIsolated);

  if (drainCondition && !alarmState.unintended_drain) {
    const prevWatchdog = unintendedDrainWatchdog;
    unintendedDrainWatchdog += delta;

    // Log once when drain mismatch is first detected
    if (diagnosticsActive && prevWatchdog === 0) {
      if (typeof log === 'function')
        log(`WATCHDOG START (Fault 3): Outlet valve OPEN but level = ${(level*100).toFixed(1)}% (below 50%). Drain timer running.`);
    }

    // Mid-point warning at 50% of timeout
    if (diagnosticsActive && prevWatchdog < DRAIN_ALARM_TIMEOUT * 0.5 && unintendedDrainWatchdog >= DRAIN_ALARM_TIMEOUT * 0.5) {
      if (typeof log === 'function')
        log(`WATCHDOG WARNING (Fault 3): Pump ON but level still falling at ${(level*100).toFixed(1)}%. Drain rate exceeds fill rate. ${(DRAIN_ALARM_TIMEOUT * 0.5).toFixed(0)}s elapsed.`);
    }

    // Fire alarm when timeout elapsed
    if (diagnosticsActive && unintendedDrainWatchdog >= DRAIN_ALARM_TIMEOUT) {
      alarmState.unintended_drain = true;
      if (typeof log === 'function') {
        log(`⚠ ALARM F03: Unintended Drain Detected! (Outlet Valve Stuck OPEN)`);
        log(`DIAGNOSIS: System unable to maintain level above 50% despite pump operation. Mismatch between Q0.1 state and level trend detected for ${DRAIN_ALARM_TIMEOUT}s.`);
        log(`RECOVERY: 1) MANUALLY ISOLATE outlet valve. 2) DRAIN tank completely for inspection. 3) CHECK valve seat and actuator.`);
      }
    }
  } else if (!drainCondition) {
    if (unintendedDrainWatchdog > 0 && !alarmState.unintended_drain) {
      if (typeof log === 'function')
        log(`WATCHDOG RESET (Fault 3): Drain condition cleared (level=${(level*100).toFixed(1)}%, Q0.1=${PLC_Q.q01}).`);
    }
    unintendedDrainWatchdog = 0;
    drainLevelTracker = level;
  }

  // DIAGNOSTIC: Cavitation / Efficiency (Fault 4: Pressure Loss)
  // Only runs if the fault is actually injected to prevent false alarms in Normal Mode
  if (PLC_Q.q00 && faults.cavitation) {
    fillingPredictionTimer += delta;
    if (fillingPredictionTimer > 15.0) {
      const expectedRise = expectedRiseRate; 
      const actualRise = level - (PLC_I.lastLevel || level);
      
      if (actualRise < expectedRise * 0.7) { 
        if (!alarmState.efficiency_loss) {
          alarmState.efficiency_loss = true;
          const remaining = (0.9 - level) / (actualRise / 15);
          const minutes = Math.floor(remaining / 60);
          const seconds = Math.floor(remaining % 60);
          
          if (typeof log === 'function') {
            log("ALARM: Pump Efficiency Loss (Cavitation Detected)!");
            log(`PREDICTION: New estimated filling time is ${minutes}m ${seconds}s.`);
            lastFillingPrediction = `${minutes}m ${seconds}s`;
          }
        }
      }
      PLC_I.lastLevel = level;
      fillingPredictionTimer = 0;
    }
  } else {
    fillingPredictionTimer = 0;
    PLC_I.lastLevel = level;
  }

  // 4. OUTPUT RESOLUTION
  if (alarmState.sensor_stiction || alarmState.unintended_drain || alarmState.low_sensor_failure || PLC_I.manualStop) {
    PLC_Q.q02 = true; // Master Alarm
  } else {
    PLC_Q.q02 = false;
  }

  // 5. UPDATE NETWORK STATES (for Ladder Logic Monitor display)
  const _sensorFail = alarmState.sensor_stiction || alarmState.low_sensor_failure || alarmState.unintended_drain;
  const _overfill   = level > 0.95 || faults.valve_stuck_open;

  // NET 1: IF Low_Level_Sensor ON AND High_Level_Sensor OFF → Pump Enable
  networkState.n1_i00     = PLC_I.i00;
  networkState.n1_i02_nc  = !PLC_I.i02;
  networkState.n1_firing  = PLC_I.i00 && !PLC_I.i02 && !PLC_I.manualStop && !_sensorFail;
  networkState.n1_output  = PLC_Q.q00;

  // NET 2: IF High_Level_Sensor ON → Pump Disable
  networkState.n2_i02    = PLC_I.i02;
  networkState.n2_firing = PLC_I.i02;
  networkState.n2_output = PLC_I.i02 && !PLC_Q.q00;

  // NET 3: IF Overfill_Alarm ON → Outlet Valve ON
  networkState.n3_overfill = _overfill;
  networkState.n3_firing   = _overfill;
  networkState.n3_output   = PLC_Q.q01;

  // NET 4: IF Sensor_Validation FAILED → Pump OFF + Valve ON + Alarm ON
  networkState.n4_sensorFail = _sensorFail;
  networkState.n4_firing     = _sensorFail;
  networkState.n4_output     = _sensorFail;

  // NET 5: IF Manual_Stop Pressed → Pump OFF + Outlet Valve ON
  networkState.n5_manualStop = PLC_I.manualStop;
  networkState.n5_firing     = PLC_I.manualStop;
  networkState.n5_output     = PLC_I.manualStop;
}

/**
 * checkTrigger: Helper for Analysis Task 1 (Hysteresis)
 */
function checkTrigger(newState, name, level) {
  const key = name.toLowerCase().replace('.', '');
  if (newState !== sensorStates[key]) {
    const direction = newState ? "RISING" : "FALLING";
    hysteresisLog.push({ sensor: name, direction, level, time: Date.now() });
    sensorStates[key] = newState;
    const msg = `TASK 1: ${name} ${direction} trigger at ${(level*100).toFixed(2)}%`;
    if (typeof log === 'function') log(msg);
    window._lastEvent = msg; // Store for time-series log
  }
}

/**
 * injectFault: Updated to handle cavitation efficiency
 */
function injectFault(type) {
  const _log = (msg) => { if (typeof log === 'function') log(msg); };
  diagnosticsActive = true;

  switch (type) {
    case 'low_sensor': 
      faults.low_sensor_fail = true; 
      _log("FAULT: Low-level sensor open circuit (I0.0)"); 
      break;
    case 'high_stuck':
      faults.high_sensor_stuck = true;
      _log("FAULT INJECTED: High-level sensor stuck HIGH (I0.2 = TRUE).");
      _log("INTERLOCK: I0.2 = TRUE → Network 2 fires → Pump (Q0.0) shut down immediately.");
      break;
    case 'valve_stuck': 
      faults.valve_stuck_open = true; 
      _log("FAULT: Outlet valve stuck OPEN"); 
      break;
    case 'cavitation': 
      faults.cavitation = true; 
      pumpEfficiency = 0.50; // 5 m³/h vs 10 m³/h nominal
      _log("FAULT: Pump cavitation (Pressure loss detected; capacity reduced to 50%)"); 
      break;
  }
}

function resetSystem() {
  faults = { low_sensor_fail: false, high_sensor_stuck: false, valve_stuck_open: false, cavitation: false };
  alarmState = { sensor_stiction: false, efficiency_loss: false, unintended_drain: false, low_sensor_failure: false };
  valveIsolated = false;
  pumpEfficiency = 1.0;
  expectedRiseRate = 0.00265;
  PLC_I.manualStop = false;
  PLC_I.manualPump = false;
  PLC_I.armed = false;
  PLC_I.i00 = false;
  PLC_I.i01 = false;
  PLC_I.i02 = false;
  PLC_Q.q00 = false;
  PLC_Q.q01 = false;
  PLC_Q.q02 = false;
  sensorStates = { i00: false, i01: false, i02: false };
  diagnosticsActive = false;
  highSensorWatchdog = 0;
  unintendedDrainWatchdog = 0;
  drainLevelTracker = null;
  pumpDelayTimer = 0;
  PLC_I.lastLevel = 0;
  if (typeof baseConsumption !== 'undefined') baseConsumption = 0;
  if (typeof log === 'function') log("SYSTEM RESET: All faults cleared");
}
