import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

/* ---------------- System Colors & Finishes ---------------- */
const COL = {
  steel: 0x2c485e,
  steelLite: 0x3d5d76,
  steelDark: 0x15222e,
  carbon: 0x111111,          // Sleek carbon finish matching image helm wheel
  crimson: 0xcc1111,         // Center ring accent color from image
  cyan: 0x5fd6ef,
  rust: 0xb4441f,
  bgNight: 0x060a14,
  pcbGreen: 0x1b5e20
};

const host = document.getElementById('canvas-host');
let W = host ? host.clientWidth : 800, H = host ? host.clientHeight : 600;

/* ---------------- ThreeJS Graphics Engine Init (conditional) ---------------- */
let renderer, scene, camera, controls, labelRenderer;
const has3D = !!host;
const servoLabels = [];
const stepperLabels = [];
let sg90BlueMat, arduinoBlueMat, plasticDark;
let srvStictionGlow, srvNoiseGlow, stpLossGlow;

function create3DLabel(html, parent, x, y, z, cls = '') {
  if (!has3D) return null;
  const el = document.createElement('div');
  el.className = 'lbl ' + cls;
  el.innerHTML = html;
  const o = new CSS2DObject(el);
  o.position.set(x, y, z);
  parent.add(o);
  return o;
}

if (has3D) {
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
  } catch (e) {
    document.getElementById('fallback').style.display = 'grid';
    throw e;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(W, H);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);

  labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(W, H);
  Object.assign(labelRenderer.domElement.style, {
    position: 'absolute',
    top: '0',
    left: '0',
    pointerEvents: 'none',
    zIndex: '1'
  });
  host.appendChild(labelRenderer.domElement);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(COL.bgNight);
  scene.fog = new THREE.FogExp2(COL.bgNight, 0.012);

  camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 300);
  camera.position.set(0, 7, 13);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.target.set(0, 1.2, 0);

  /* ---------------- Atmospheric Lighting ---------------- */
  scene.add(new THREE.AmbientLight(0x9fb3cc, 2.6));
  scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x223344, 1.4));
  const consoleSpot = new THREE.DirectionalLight(0xffffff, 2.2);
  consoleSpot.position.set(5, 12, 8);
  consoleSpot.castShadow = true;
  consoleSpot.shadow.bias = -0.0005;
  scene.add(consoleSpot);

  const fillSpot = new THREE.DirectionalLight(0xdff1ff, 1.2);
  fillSpot.position.set(-6, 6, -4);
  scene.add(fillSpot);

  const indicatorGlow = new THREE.PointLight(COL.cyan, 1.8, 14);
  indicatorGlow.position.set(-2, 2.5, 0);
  scene.add(indicatorGlow);

  // Floor Grid
  const structureGrid = new THREE.GridHelper(50, 30, 0x1b4254, 0x0d2533);
  structureGrid.position.y = 0.0;
  scene.add(structureGrid);
}

/* ---------------- Runtime Variables & States ---------------- */
let steeringWheelGroup, rudderSystem, servoHorn, winchDrum, motorShaft, pushrod, anchorGroup;
let systemActive = false;
let currentTab = 'servo';
let chainPath, chainLinks = [];

// LCD screen texture variables
let lcdCanvas, lcdCtx, lcdTexture;

// Experiment Automation Task Runner state
let currentSrvTab = 'task1';
let activeTask = 'none';
let taskTime = 0;
let taskStep = 0;
let taskLog = [];

// Stepper Automation Task Runner states
let currentStpTab = 'task1';
let activeStpTask = 'none';
let stpTaskTime = 0;
let stpTaskStep = 0;
let stpTaskLog = [];

// For Task 3 transient tracing
let stp3CmdFreqHistory = Array(100).fill(0);
let stp3ActFreqHistory = Array(100).fill(0);
let stp3TimeLabels = Array(100).fill('');

// Live Observation Tables State
let tableData = {
  task1: [
    { target: 0, t1_act: null, t1_err: null, t2_act: null, t2_err: null, t3_act: null, t3_err: null, avg_err: null },
    { target: 45, t1_act: null, t1_err: null, t2_act: null, t2_err: null, t3_act: null, t3_err: null, avg_err: null },
    { target: 90, t1_act: null, t1_err: null, t2_act: null, t2_err: null, t3_act: null, t3_err: null, avg_err: null },
    { target: 135, t1_act: null, t1_err: null, t2_act: null, t2_err: null, t3_act: null, t3_err: null, avg_err: null },
    { target: 180, t1_act: null, t1_err: null, t2_act: null, t2_err: null, t3_act: null, t3_err: null, avg_err: null }
  ],
  task2: [],
  task3: [
    { load: 0, target: 135, actual: null, settling: null, error: null, status: null },
    { load: 16, target: 135, actual: null, settling: null, error: null, status: null },
    { load: 32, target: 135, actual: null, settling: null, error: null, status: null },
    { load: 48, target: 135, actual: null, settling: null, error: null, status: null }
  ],
  stepper: [],
  stepperTask1: [],
  stepperTask2: [],
  stepperTask3: []
};
let task3Trajectory = [];

// Servo Data Channels
let servoTarget = 90, servoActual = 90;
let servoKp = 8, servoLoad = 0;
let servoSource = 'manual';
let sweepDirection = 1, sweepTime = 90;

// Stepper Data Channels
let stepTarget = 0, stepActual = 0;
let stepFreq = 200, microStep = 1, stepLoad = 0;
let accumulatedPulses = 0;

// Task 3 transient frequency ramping channels
let stp3CmdFreq = 0;
let stp3ActFreq = 0;
let stp3TrackingError = 0;
let stp3StallFreq = null;
let stp3Stalled = false;
let stp3CmdPulses = 0;
let stp3ActPulses = 0;

// Fault Registers
let faultStiction = false;
let faultNoise = false;
let faultStepLoss = false;

// Real-time Data History
let historyInterval = 120;
let trackingDataTarget = Array(historyInterval).fill(null);
let trackingDataActual = Array(historyInterval).fill(null);

// 3D Rudder Angle Indicator
let indicatorRenderer, indicatorScene, indicatorCamera, indicatorNeedle;
let hasIndicator = false;

// 3D Propeller & Rudder Assembly
let propRudderRenderer, propRudderScene, propRudderCamera, propRudderControls;
let propRudderBlade, propRudderPropeller;
let hasPropRudder = false;

// 3D Mechatronics Schematic Components
let servoChainGroup, stepperChainGroup, stepperConsoleDial;
let servoTraceLine, stepperTraceLine;
let activePackets = [];

let servoHelmToArduinoCurve, servoArduinoToOscCurve, servoOscToServoCurve;
let stepperCtrlToArduinoCurve, stepperArduinoToOscCurve, stepperOscToMotorCurve;

/* ---------------- Physical Hardware Construction ---------------- */
class DataPacket {
  constructor(curve, color, speed = 0.35) {
    this.curve = curve;
    this.speed = speed;
    this.progress = Math.random(); // Avoid clumping on start
    
    const mat = new THREE.MeshBasicMaterial({ color: color, toneMapped: false });
    const geo = new THREE.BoxGeometry(0.06, 0.06, 0.06);
    this.mesh = new THREE.Mesh(geo, mat);
    scene.add(this.mesh);
  }
  
  update(dt) {
    this.progress += dt * this.speed;
    if (this.progress > 1.0) {
      this.progress = 0;
    }
    const pt = this.curve.getPointAt(this.progress);
    this.mesh.position.copy(pt);
  }

  destroy() {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

function initDataPackets() {
  activePackets.forEach(p => p.destroy());
  activePackets = [];
  
  if (!has3D) return;

  if (currentTab === 'servo') {
    activePackets.push(new DataPacket(servoHelmToArduinoCurve, 0xffd300, 0.28));
    activePackets.push(new DataPacket(servoHelmToArduinoCurve, 0xffd300, 0.28));
    activePackets.push(new DataPacket(servoArduinoToOscCurve, 0x5fd6ef, 0.35));
    activePackets.push(new DataPacket(servoArduinoToOscCurve, 0x5fd6ef, 0.35));
    activePackets.push(new DataPacket(servoOscToServoCurve, 0xff6600, 0.42));
    activePackets.push(new DataPacket(servoOscToServoCurve, 0xff6600, 0.42));
  } else {
    // Stepper packets start directly from Arduino
    activePackets.push(new DataPacket(stepperArduinoToOscCurve, 0x5fd6ef, 0.35));
    activePackets.push(new DataPacket(stepperArduinoToOscCurve, 0x5fd6ef, 0.35));
    activePackets.push(new DataPacket(stepperOscToMotorCurve, 0xff4444, 0.45));
    activePackets.push(new DataPacket(stepperOscToMotorCurve, 0xff4444, 0.45));
  }
}

function updateOscilloscopeTraces() {
  const time = Date.now() * 0.0035;
  
  if (currentTab === 'servo' && servoTraceLine) {
    const geo = servoTraceLine.geometry;
    const pos = geo.attributes.position;
    
    const pwmMs = 1.0 + (servoActual / 180.0);
    const period = 20.0;
    const dutyCycle = pwmMs / period;
    
    for (let i = 0; i < 100; i++) {
      const xNorm = i / 99;
      const phase = (xNorm * 3.5 - time) % 1.0;
      const activePhase = phase < 0 ? phase + 1.0 : phase;
      
      const y = activePhase < dutyCycle ? 0.32 : -0.32;
      pos.setY(i, y);
    }
    pos.needsUpdate = true;
  }
  
  if (currentTab === 'stepper' && stepperTraceLine) {
    const geo = stepperTraceLine.geometry;
    const pos = geo.attributes.position;
    
    const winchMoving = Math.abs(stepTarget - stepActual) > 0.1;
    const freq = (systemActive && winchMoving) ? stepFreq : 0;
    
    const scrollSpeed = freq * 0.01;
    const tScroll = Date.now() * 0.001 * scrollSpeed;
    
    for (let i = 0; i < 100; i++) {
      const xNorm = i / 99;
      let y = 0;
      if (freq > 0) {
        const numCycles = 1.5 + (freq * 0.02);
        const phase = (xNorm * numCycles - tScroll) % 1.0;
        const activePhase = phase < 0 ? phase + 1.0 : phase;
        y = activePhase < 0.5 ? 0.32 : -0.32;
      } else {
        y = 0;
      }
      pos.setY(i, y);
    }
    pos.needsUpdate = true;
  }
}

/* ---------------- Physical Hardware Construction ---------------- */
function createSg90StickerTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  // Background dark blue
  ctx.fillStyle = '#0f2b5c';
  ctx.fillRect(0, 0, 512, 256);

  // Yellow/gold accent stripe on top
  ctx.fillStyle = '#ffcc00';
  ctx.fillRect(0, 0, 512, 60);

  // Bottom orange stripe
  ctx.fillStyle = '#ff5500';
  ctx.fillRect(0, 220, 512, 36);

  // Top Text: "TowerPro"
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 36px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Tower Pro', 256, 30);

  // Middle Text: "Micro Servo 9g"
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 32px sans-serif';
  ctx.fillText('Micro Servo 9g', 256, 110);

  // Large Bold Text: "SG90"
  ctx.fillStyle = '#ffcc00';
  ctx.font = 'bold 64px sans-serif';
  ctx.fillText('SG90', 256, 175);

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

function initLcdScreen() {
  lcdCanvas = document.createElement('canvas');
  lcdCanvas.width = 256;
  lcdCanvas.height = 128;
  lcdCtx = lcdCanvas.getContext('2d');
  lcdTexture = new THREE.CanvasTexture(lcdCanvas);
}

function updateLcdTexture() {
  if (!lcdCtx) return;
  // Deep blue LCD backlight
  lcdCtx.fillStyle = '#001a66';
  lcdCtx.fillRect(0, 0, 256, 128);
  
  // Outer frame border
  lcdCtx.strokeStyle = '#0044cc';
  lcdCtx.lineWidth = 4;
  lcdCtx.strokeRect(4, 4, 248, 120);

  // Bright cyan glowing text
  lcdCtx.fillStyle = '#00f2ff';
  lcdCtx.font = 'bold 20px monospace';
  
  // Line 1: Target and Actual
  lcdCtx.fillText(`TGT: ${servoTarget.toFixed(1)}°`, 16, 42);
  lcdCtx.fillText(`ACT: ${servoActual.toFixed(1)}°`, 16, 70);
  
  // Line 2: Error and Load
  const err = Math.abs(servoTarget - servoActual);
  lcdCtx.fillText(`ERR: ${err.toFixed(1)}° L:${servoLoad.toFixed(1)}`, 16, 98);
  
  lcdTexture.needsUpdate = true;
}

function buildPhysicalLaboratory() {
  if (!has3D) return;
  
  initLcdScreen();

  const aluminum = new THREE.MeshStandardMaterial({ color: COL.steelLite, roughness: 0.2, metalness: 0.9 });
  const metalSteel = new THREE.MeshStandardMaterial({ color: COL.steel, roughness: 0.35, metalness: 0.8 });
  plasticDark = new THREE.MeshStandardMaterial({ color: COL.steelDark, roughness: 0.6 });
  const pcbMat = new THREE.MeshStandardMaterial({ color: COL.pcbGreen, roughness: 0.5 });
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9, roughness: 0.15 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x6e473b, roughness: 0.7 });
  const glassPanelMat = new THREE.MeshPhysicalMaterial({ color: 0x051d38, transparent: true, opacity: 0.7, roughness: 0.15, metalness: 0.2, transmission: 0.6, thickness: 0.08 });
  const traceMat = new THREE.LineBasicMaterial({ color: 0x5fd6ef, linewidth: 2 });

  // SG90 Servo Materials
  sg90BlueMat = new THREE.MeshPhysicalMaterial({
    color: 0x0a66d0,
    roughness: 0.25,
    metalness: 0.1,
    transparent: true,
    opacity: 0.85,
    transmission: 0.3,
    thickness: 0.05
  });
  const sg90WhiteMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.5 });
  const metalScrewMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.15, metalness: 0.9 });
  const stickerMat = new THREE.MeshStandardMaterial({ map: createSg90StickerTexture(), roughness: 0.45, metalness: 0.1 });



  // --- Create groups for visibility toggles ---
  servoChainGroup = new THREE.Group();
  stepperChainGroup = new THREE.Group();
  scene.add(servoChainGroup);
  scene.add(stepperChainGroup);

  // --- Create wiring curves for packets ---
  servoHelmToArduinoCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-3.5, 0.5, 0.5),
    new THREE.Vector3(-2.6, 0.4, 0.4),
    new THREE.Vector3(-1.7, 0.2, 0.3)
  ]);
  servoArduinoToOscCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.7, 0.2, 0.3),
    new THREE.Vector3(0.1, 0.4, 0.4),
    new THREE.Vector3(1.0, 0.5, 0.5)
  ]);
  servoOscToServoCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(1.4, 0.5, 0.5),
    new THREE.Vector3(2.5, 0.6, 0.4),
    new THREE.Vector3(3.5, 0.8, 0.3)
  ]);

  stepperCtrlToArduinoCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-3.5, 0.5, 0.5),
    new THREE.Vector3(-2.6, 0.4, 0.4),
    new THREE.Vector3(-1.7, 0.2, 0.3)
  ]);
  stepperArduinoToOscCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.7, 0.2, 0.3),
    new THREE.Vector3(0.1, 0.4, 0.4),
    new THREE.Vector3(1.0, 0.5, 0.5)
  ]);
  stepperOscToMotorCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(1.4, 0.5, 0.5),
    new THREE.Vector3(2.5, 0.6, 0.4),
    new THREE.Vector3(3.5, 0.8, 0.3)
  ]);

  // ==========================================
  // 1. ARDUINO BOARD (Shared by both chains)
  // ==========================================
  const arduinoGroup = new THREE.Group();
  arduinoGroup.position.set(-1.2, 0.1, 0.5);
  scene.add(arduinoGroup); // Always visible
  create3DLabel('ARDUINO BOARD', arduinoGroup, 0, 0.45, 0);
  
  // PCB base
  arduinoBlueMat = new THREE.MeshStandardMaterial({
    color: 0x0066b3, // Classic Arduino Uno Blue
    roughness: 0.4,
    metalness: 0.1
  });
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, 2.1), arduinoBlueMat);
  board.position.y = 0.03;
  board.castShadow = true;
  board.receiveShadow = true;
  arduinoGroup.add(board);

  // USB Port (Silver metallic box with interior details)
  const usbBody = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.3, 0.45), aluminum);
  usbBody.position.set(-0.52, 0.21, -0.875);
  usbBody.castShadow = true;
  arduinoGroup.add(usbBody);

  const headerHoleMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
  const usbInnerSlot = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.18, 0.02), headerHoleMat);
  usbInnerSlot.position.set(-0.52, 0.21, -1.091);
  arduinoGroup.add(usbInnerSlot);

  const usbInnerPinGuide = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.15), sg90WhiteMat);
  usbInnerPinGuide.position.set(-0.52, 0.145, -0.98);
  arduinoGroup.add(usbInnerPinGuide);

  // Barrel Jack (Black plastic box with circular metal pin hole)
  const jackBody = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.3, 0.45), plasticDark);
  jackBody.position.set(0.48, 0.21, -0.875);
  jackBody.castShadow = true;
  arduinoGroup.add(jackBody);

  const jackHole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.02, 12), headerHoleMat);
  jackHole.rotation.x = Math.PI / 2;
  jackHole.position.set(0.48, 0.21, -1.091);
  arduinoGroup.add(jackHole);

  const jackPin = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 8), aluminum);
  jackPin.rotation.x = Math.PI / 2;
  jackPin.position.set(0.48, 0.21, -1.04);
  arduinoGroup.add(jackPin);

  // ATmega328P DIP-28 MCU Chip
  // Socket (black)
  const mcuSocket = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.05, 0.85), plasticDark);
  mcuSocket.position.set(0.12, 0.085, 0.1);
  mcuSocket.castShadow = true;
  arduinoGroup.add(mcuSocket);

  // Main Chip Body (black)
  const mcuBody = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.8), plasticDark);
  mcuBody.position.set(0.12, 0.135, 0.1);
  mcuBody.castShadow = true;
  arduinoGroup.add(mcuBody);

  // 28 Silver Pins extending down
  const pinGeo = new THREE.BoxGeometry(0.015, 0.06, 0.02);
  for (let i = 0; i < 14; i++) {
    const zOffset = 0.1 - 0.36 + (i * 0.0555); // Spans from Z = -0.26 to Z = 0.46
    
    // Left pin
    const pinL = new THREE.Mesh(pinGeo, aluminum);
    pinL.position.set(0.12 - 0.125, 0.09, zOffset);
    arduinoGroup.add(pinL);

    // Right pin
    const pinR = new THREE.Mesh(pinGeo, aluminum);
    pinR.position.set(0.12 + 0.125, 0.09, zOffset);
    arduinoGroup.add(pinR);
  }

  // Female Header Rails (Black blocks with socket holes)
  // Header L1: 10-pin
  const headerL1 = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.24, 0.6), plasticDark);
  headerL1.position.set(-0.62, 0.18, -0.15);
  headerL1.castShadow = true;
  arduinoGroup.add(headerL1);
  for (let i = 0; i < 10; i++) {
    const hole = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.01, 0.04), headerHoleMat);
    hole.position.set(-0.62, 0.301, -0.15 - 0.27 + (i * 0.06));
    arduinoGroup.add(hole);
  }

  // Header L2: 8-pin
  const headerL2 = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.24, 0.48), plasticDark);
  headerL2.position.set(-0.62, 0.18, 0.45);
  headerL2.castShadow = true;
  arduinoGroup.add(headerL2);
  for (let i = 0; i < 8; i++) {
    const hole = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.01, 0.04), headerHoleMat);
    hole.position.set(-0.62, 0.301, 0.45 - 0.21 + (i * 0.06));
    arduinoGroup.add(hole);
  }

  // Header R1: 8-pin Power
  const headerR1 = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.24, 0.48), plasticDark);
  headerR1.position.set(0.62, 0.18, -0.15);
  headerR1.castShadow = true;
  arduinoGroup.add(headerR1);
  for (let i = 0; i < 8; i++) {
    const hole = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.01, 0.04), headerHoleMat);
    hole.position.set(0.62, 0.301, -0.15 - 0.21 + (i * 0.06));
    arduinoGroup.add(hole);
  }

  // Header R2: 6-pin Analog
  const headerR2 = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.24, 0.36), plasticDark);
  headerR2.position.set(0.62, 0.18, 0.33);
  headerR2.castShadow = true;
  arduinoGroup.add(headerR2);
  for (let i = 0; i < 6; i++) {
    const hole = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.01, 0.04), headerHoleMat);
    hole.position.set(0.62, 0.301, 0.33 - 0.15 + (i * 0.06));
    arduinoGroup.add(hole);
  }

  // Cylindrical Electrolytic Capacitors (Silver with black square bases)
  const capBaseGeo = new THREE.BoxGeometry(0.12, 0.02, 0.12);
  const capBodyGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.14, 12);
  
  // Capacitor 1
  const capBase1 = new THREE.Mesh(capBaseGeo, plasticDark);
  capBase1.position.set(0.15, 0.07, -0.45);
  arduinoGroup.add(capBase1);
  const capBody1 = new THREE.Mesh(capBodyGeo, aluminum);
  capBody1.position.set(0.15, 0.15, -0.45);
  capBody1.castShadow = true;
  arduinoGroup.add(capBody1);

  // Capacitor 2
  const capBase2 = new THREE.Mesh(capBaseGeo, plasticDark);
  capBase2.position.set(0.35, 0.07, -0.45);
  arduinoGroup.add(capBase2);
  const capBody2 = new THREE.Mesh(capBodyGeo, aluminum);
  capBody2.position.set(0.35, 0.15, -0.45);
  capBody2.castShadow = true;
  arduinoGroup.add(capBody2);

  // Crystal Oscillator (Pill-shaped silver capsule)
  const crystal = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.06, 12), aluminum);
  crystal.scale.set(0.7, 1.0, 1.6); // flattened to oval shape
  crystal.rotation.y = Math.PI / 2;
  crystal.position.set(0.36, 0.09, -0.15);
  crystal.castShadow = true;
  arduinoGroup.add(crystal);

  // Reset Button (Silver metal base box with red cylindrical button)
  const resetBase = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.16), aluminum);
  resetBase.position.set(0.55, 0.09, 0.85);
  arduinoGroup.add(resetBase);
  const resetButton = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.04, 12), new THREE.MeshStandardMaterial({ color: 0xcc1111, roughness: 0.6 }));
  resetButton.position.set(0.55, 0.14, 0.85);
  arduinoGroup.add(resetButton);

  // ICSP Header (2x3 gold male pins on black base)
  const icspBase = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.16), plasticDark);
  icspBase.position.set(0.52, 0.075, 0.58);
  arduinoGroup.add(icspBase);
  const pinMaleGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.12, 6);
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 3; c++) {
      const pin = new THREE.Mesh(pinMaleGeo, brassMat);
      pin.position.set(0.52 - 0.02 + (r * 0.04), 0.14, 0.58 - 0.05 + (c * 0.05));
      arduinoGroup.add(pin);
    }
  }

  // ATmega16U2 Serial Interface Chip (Small black square IC)
  const serialChip = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.16), plasticDark);
  serialChip.position.set(-0.15, 0.07, -0.45);
  arduinoGroup.add(serialChip);

  // PCB Mounting Holes (Gold metal rings with dark inner holes)
  const mountHoleGeo = new THREE.TorusGeometry(0.06, 0.02, 8, 12);
  const mountHolesOffsets = [
    [-0.6, -0.9],
    [0.6, -0.7],
    [-0.6, 0.9],
    [0.6, 0.9]
  ];
  mountHolesOffsets.forEach(offset => {
    // Hole shadow cylinder
    const holeCyl = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.062, 8), headerHoleMat);
    holeCyl.position.set(offset[0], 0.03, offset[1]);
    arduinoGroup.add(holeCyl);
    
    // Gold ring
    const ring = new THREE.Mesh(mountHoleGeo, brassMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(offset[0], 0.061, offset[1]);
    arduinoGroup.add(ring);
  });

  // 16x2 LCD Screen
  const lcdGroup = new THREE.Group();
  lcdGroup.position.set(-1.2, 0.1, -0.4); // slightly behind the Arduino board on the console deck
  lcdGroup.rotation.x = -0.2; // tilted back slightly for readability
  scene.add(lcdGroup);

  const lcdBezel = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.42, 0.04), plasticDark);
  lcdBezel.castShadow = true;
  lcdGroup.add(lcdBezel);

  const lcdScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.3), new THREE.MeshStandardMaterial({
    map: lcdTexture,
    roughness: 0.3,
    metalness: 0.1
  }));
  lcdScreen.position.z = 0.021;
  lcdGroup.add(lcdScreen);

  // Status LED on LCD board
  const lcdLed = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.02, 8), new THREE.MeshBasicMaterial({ color: 0x00ff00 }));
  lcdLed.position.set(-0.33, 0.14, 0.02);
  lcdLed.rotation.x = Math.PI / 2;
  lcdGroup.add(lcdLed);

  // Wires (glowing blue fiber-optic tubes)
  const signalWireMat = new THREE.MeshStandardMaterial({
    color: 0x0066ff,
    emissive: 0x00aaff,
    emissiveIntensity: 2.5,
    transparent: true,
    opacity: 0.75
  });
  
  // Add wires to respective groups to control visibility when switching tabs
  const w1Geo = new THREE.TubeGeometry(servoHelmToArduinoCurve, 30, 0.015, 6, false);
  const wire1 = new THREE.Mesh(w1Geo, signalWireMat);
  wire1.castShadow = true;
  servoChainGroup.add(wire1);

  const w2Geo = new THREE.TubeGeometry(servoArduinoToOscCurve, 30, 0.015, 6, false);
  const wire2 = new THREE.Mesh(w2Geo, signalWireMat);
  wire2.castShadow = true;
  servoChainGroup.add(wire2);

  const w3Geo = new THREE.TubeGeometry(servoOscToServoCurve, 30, 0.015, 6, false);
  const wire3 = new THREE.Mesh(w3Geo, signalWireMat);
  wire3.castShadow = true;
  servoChainGroup.add(wire3);

  // Stepper wires: only from Arduino to Osc, and from Osc to Stepper Motor (no operator console wire)
  const stW2Geo = new THREE.TubeGeometry(stepperArduinoToOscCurve, 30, 0.015, 6, false);
  const stWire2 = new THREE.Mesh(stW2Geo, signalWireMat);
  stWire2.castShadow = true;
  stepperChainGroup.add(stWire2);

  const stW3Geo = new THREE.TubeGeometry(stepperOscToMotorCurve, 30, 0.015, 6, false);
  const stWire3 = new THREE.Mesh(stW3Geo, signalWireMat);
  stWire3.castShadow = true;
  stepperChainGroup.add(stWire3);


  // ==========================================
  // 2. SERVO CHAIN COMPONENTS
  // ==========================================
  
  // A. Helm Potentiometer (Y-Shaped Carbon Fiber Wheel with Red Accent bezel)
  const helmGroup = new THREE.Group();
  helmGroup.position.set(-3.5, 0.5, 0.5);
  servoChainGroup.add(helmGroup);

  const carbonMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.18, metalness: 0.8 });
  const crimsonMat = new THREE.MeshStandardMaterial({ color: 0xcc1111, roughness: 0.25, metalness: 0.8 });

  // Carbon fiber outer rim
  const rimGeo = new THREE.TorusGeometry(0.68, 0.045, 12, 64);
  const rim = new THREE.Mesh(rimGeo, carbonMat);
  helmGroup.add(rim);

  // Hub body
  const hubBody = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.08, 24), carbonMat);
  hubBody.rotation.x = Math.PI / 2;
  helmGroup.add(hubBody);

  // Red accent ring around hub
  const redRing = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.018, 8, 32), crimsonMat);
  redRing.position.z = 0.042;
  helmGroup.add(redRing);

  // 3 Y-shaped split spokes (positioned symmetrically at -90, 30, and 150 degrees)
  for (let i = 0; i < 3; i++) {
    const baseAng = (i / 3) * Math.PI * 2 - Math.PI / 2; // -90 deg (bottom), 30 deg, 150 deg
    
    // Left branch of the split spoke
    const b1 = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.022, 0.58, 8), carbonMat);
    b1.position.y = 0.34;
    const g1 = new THREE.Group();
    g1.rotation.z = baseAng - 0.11;
    g1.add(b1);
    helmGroup.add(g1);

    // Right branch of the split spoke
    const b2 = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.022, 0.58, 8), carbonMat);
    b2.position.y = 0.34;
    const g2 = new THREE.Group();
    g2.rotation.z = baseAng + 0.11;
    g2.add(b2);
    helmGroup.add(g2);
  }
  steeringWheelGroup = helmGroup; // Bind globally to rotate

  // B. PWM Oscilloscope Screen
  const oscGroup = new THREE.Group();
  oscGroup.position.set(1.0, 0.5, 0.5);
  servoChainGroup.add(oscGroup);

  const screen = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.1, 0.04), glassPanelMat);
  oscGroup.add(screen);

  // Bezel
  const bezel = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.2, 0.02), plasticDark);
  bezel.position.z = -0.02;
  oscGroup.add(bezel);

  // Oscilloscope Grid lines
  const gridMat = new THREE.LineBasicMaterial({ color: 0x114466, transparent: true, opacity: 0.35 });
  for (let y = -0.45; y <= 0.45; y += 0.15) {
    const points = [new THREE.Vector3(-0.7, y, 0.02), new THREE.Vector3(0.7, y, 0.02)];
    oscGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), gridMat));
  }
  for (let x = -0.75; x <= 0.75; x += 0.25) {
    const points = [new THREE.Vector3(x, -0.45, 0.02), new THREE.Vector3(x, 0.45, 0.02)];
    oscGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), gridMat));
  }

  // Live square trace line
  const traceGeo = new THREE.BufferGeometry();
  const tracePoints = [];
  for (let i = 0; i < 100; i++) {
    tracePoints.push(new THREE.Vector3((i / 99) * 1.4 - 0.7, 0, 0.03));
  }
  traceGeo.setFromPoints(tracePoints);
  servoTraceLine = new THREE.Line(traceGeo, traceMat);
  oscGroup.add(servoTraceLine);

  // C. Servo Motor and Rudder Stock
  const steeringGearGroup = new THREE.Group();
  steeringGearGroup.position.set(3.5, 0, 0.5);
  servoChainGroup.add(steeringGearGroup);
  const lblServo = create3DLabel('SERVO MOTOR', steeringGearGroup, 0, 1.1, 0);
  if (lblServo) servoLabels.push(lblServo);

  // TowerPro SG90 Casing: Main body blue box
  const casingBody = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.56, 0.88), sg90BlueMat);
  casingBody.position.set(0, 0.28, 0);
  casingBody.castShadow = true;
  casingBody.receiveShadow = true;
  steeringGearGroup.add(casingBody);

  // TowerPro SG90 Casing: Mounting Flanges (Ears)
  const flange = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.05, 1.34), sg90BlueMat);
  flange.position.set(0, 0.44, 0);
  flange.castShadow = true;
  steeringGearGroup.add(flange);

  // Mounting Screws (Silver)
  const screwGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.05, 8);
  const screwFront = new THREE.Mesh(screwGeo, metalScrewMat);
  screwFront.position.set(0, 0.475, -0.56);
  steeringGearGroup.add(screwFront);

  const screwBack = new THREE.Mesh(screwGeo, metalScrewMat);
  screwBack.position.set(0, 0.475, 0.56);
  steeringGearGroup.add(screwBack);

  // TowerPro SG90 Casing: Gear Train Cover (stepped upper profile)
  const gearCover = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.16, 0.88), sg90BlueMat);
  gearCover.position.set(0, 0.64, 0);
  gearCover.castShadow = true;
  steeringGearGroup.add(gearCover);

  // Output Shaft Neck Cylinder
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.1, 16), sg90BlueMat);
  neck.position.set(0, 0.77, -0.22);
  neck.castShadow = true;
  steeringGearGroup.add(neck);

  // Secondary Gear Cap profile
  const secondaryCap = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.06, 16), sg90BlueMat);
  secondaryCap.position.set(0, 0.75, 0.12);
  secondaryCap.castShadow = true;
  steeringGearGroup.add(secondaryCap);

  // Side Sticker Plate (facing camera on +X and -X)
  const stickerPlateR = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.38), stickerMat);
  stickerPlateR.position.set(0.241, 0.28, 0);
  stickerPlateR.rotation.y = Math.PI / 2;
  steeringGearGroup.add(stickerPlateR);

  const stickerPlateL = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.38), stickerMat);
  stickerPlateL.position.set(-0.241, 0.28, 0);
  stickerPlateL.rotation.y = -Math.PI / 2;
  steeringGearGroup.add(stickerPlateL);

  // Servo Horn (placed exactly at output shaft Z = -0.22, Y = 0.82)
  servoHorn = new THREE.Group();
  servoHorn.position.set(0, 0.82, -0.22);
  
  // White Hub
  const hornHub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 16), sg90WhiteMat);
  hornHub.position.y = 0.025;
  servoHorn.add(hornHub);

  // White Tapered Arms
  const arm1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.5), sg90WhiteMat);
  arm1.position.set(0, 0.015, -0.25);
  servoHorn.add(arm1);

  const arm2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.5), sg90WhiteMat);
  arm2.position.set(0, 0.015, 0.25);
  servoHorn.add(arm2);

  // Holes in the arms
  const holeGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.032, 8);
  const darkPlasticMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 });
  const holeDistances = [-0.15, -0.3, -0.45, 0.15, 0.3, 0.45];
  holeDistances.forEach(zOffset => {
    const hole = new THREE.Mesh(holeGeo, darkPlasticMat);
    hole.position.set(0, 0.02, zOffset);
    servoHorn.add(hole);
  });

  // Central mounting screw
  const centerScrew = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 12), metalScrewMat);
  centerScrew.position.set(0, 0.051, 0);
  servoHorn.add(centerScrew);

  const screwSlot = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.005, 0.08), darkPlasticMat);
  screwSlot.position.set(0, 0.062, 0);
  servoHorn.add(screwSlot);

  steeringGearGroup.add(servoHorn);

  // Rudder system
  rudderSystem = new THREE.Group();
  rudderSystem.position.set(3.5, 0, -0.7);
  servoChainGroup.add(rudderSystem);
  const lblRudder = create3DLabel('RUDDER', rudderSystem, 0, 1.3, 0);
  if (lblRudder) servoLabels.push(lblRudder);

  // Short stock cylinder located entirely above the console bulkhead deck
  const stock = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 16), aluminum);
  stock.position.y = 0.5; // sits from Y = 0 to Y = 1.0
  rudderSystem.add(stock);

  // Tiller arm extending forward (+Z) from stock (at Y = 0.95)
  const tillerArm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.35), aluminum);
  tillerArm.position.set(0, 0.95, 0.155);
  rudderSystem.add(tillerArm);

  // Hydrofoil Rudder Blade (Brown, shaped like NACA foil and tapered from top to bottom)
  const rudderBrownMat = new THREE.MeshStandardMaterial({
    color: 0x8b5a2b, // Rich copper/wood brown
    roughness: 0.5,
    metalness: 0.1
  });

  const foilShape = new THREE.Shape();
  foilShape.moveTo(0, 0);
  // Bulge out to x = 0.07 at y = -0.15, then taper to x = 0.006 at y = -0.55
  foilShape.quadraticCurveTo(0.07, -0.15, 0.006, -0.55);
  foilShape.lineTo(-0.006, -0.55);
  foilShape.quadraticCurveTo(-0.07, -0.15, 0, 0);

  const foilGeo = new THREE.ExtrudeGeometry(foilShape, {
    depth: 0.75, // height 0.75 (so it rests above deck Y=0, extending up to Y=0.8)
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.015,
    bevelSegments: 3
  });

  // Taper the geometry: scale X and Y coordinates based on Z height (z = 0 is bottom, z = 0.75 is top)
  const posAttr = foilGeo.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    const z = posAttr.getZ(i);

    const t = z / 0.75; // 0 to 1
    const scale = 0.65 + 0.35 * t; // 0.65 at bottom, 1.0 at top
    
    posAttr.setX(i, x * scale);
    posAttr.setY(i, y * scale);
  }
  foilGeo.computeVertexNormals();

  const blade = new THREE.Mesh(foilGeo, rudderBrownMat);
  blade.rotation.x = Math.PI / 2; // Positive rotation maps Z (depth) to positive Y!
  blade.rotation.y = Math.PI;
  blade.position.set(0, 0.05, 0.04); // Sits from Y = 0.05 to Y = 0.8 next to the SG90 servo
  blade.castShadow = true;
  blade.receiveShadow = true;
  rudderSystem.add(blade);

  // Linkage Rod (Pushrod)
  const prGeo = new THREE.CylinderGeometry(0.02, 0.02, 1.0, 8);
  pushrod = new THREE.Mesh(prGeo, aluminum);
  servoChainGroup.add(pushrod);

  // ==========================================
  // BLUE GLOW LIGHTING EFFECTS
  // ==========================================
  // Injected point lights to cast a realistic blue glow across the mechatronics console board and through the blue translucent SG90 casing
  
  // Glow Light 1: Centered on the blue Arduino board
  const pcbGlow = new THREE.PointLight(0x0088ff, 3.5, 4.0);
  pcbGlow.position.set(-1.2, 0.25, 0.5);
  scene.add(pcbGlow);

  // Glow Light 2: Placed next to the blue SG90 servo to back-illuminate its translucent casing
  const servoGlow = new THREE.PointLight(0x0088ff, 3.0, 3.5);
  servoGlow.position.set(3.4, 0.6, 0.1);
  scene.add(servoGlow);

  // Glow Light 3: Centered near the Oscilloscope Screen
  const oscGlow = new THREE.PointLight(0x00aaff, 2.5, 4.0);
  oscGlow.position.set(1.0, 0.6, 0.4);
  scene.add(oscGlow);

  // Glow Light 4: Highlights the Y-shaped carbon steering wheel with a strong blue glow
  const wheelGlow = new THREE.PointLight(0x0088ff, 3.8, 3.0);
  wheelGlow.position.set(-3.5, 0.6, 0.7); // directly in front of the wheel
  scene.add(wheelGlow);

  // Fault Glow Lights (Red)
  srvStictionGlow = new THREE.PointLight(0xff0000, 0.0, 3);
  srvStictionGlow.position.set(3.5, 0.6, 0.5); // At the Servo Motor
  scene.add(srvStictionGlow);

  srvNoiseGlow = new THREE.PointLight(0xff0000, 0.0, 3);
  srvNoiseGlow.position.set(-1.2, 0.3, 0.5); // At the Arduino Board / MCU
  scene.add(srvNoiseGlow);

  stpLossGlow = new THREE.PointLight(0xff0000, 0.0, 3);
  stpLossGlow.position.set(3.5, 0.75, 0.72); // At the Stepper Motor
  scene.add(stpLossGlow);

  // ==========================================
  // 3. STEPPER CHAIN COMPONENTS
  // ==========================================
  
  // A. Winch Operator Console (REMOVED as requested - circuit starts from Arduino)
  // stepperConsoleDial remains undefined, which is handled correctly


  // B. Stepper Pulse Oscilloscope Screen
  const oscGroupStep = new THREE.Group();
  oscGroupStep.position.set(1.0, 0.5, 0.5);
  stepperChainGroup.add(oscGroupStep);

  const screenStep = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.1, 0.04), glassPanelMat);
  oscGroupStep.add(screenStep);

  // Bezel
  const bezelStep = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.2, 0.02), plasticDark);
  bezelStep.position.z = -0.02;
  oscGroupStep.add(bezelStep);

  // Oscilloscope Grid lines
  for (let y = -0.45; y <= 0.45; y += 0.15) {
    const points = [new THREE.Vector3(-0.7, y, 0.02), new THREE.Vector3(0.7, y, 0.02)];
    oscGroupStep.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), gridMat));
  }
  for (let x = -0.75; x <= 0.75; x += 0.25) {
    const points = [new THREE.Vector3(x, -0.45, 0.02), new THREE.Vector3(x, 0.45, 0.02)];
    oscGroupStep.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), gridMat));
  }

  // Live pulse trace line
  const traceGeoStep = new THREE.BufferGeometry();
  const tracePointsStep = [];
  for (let i = 0; i < 100; i++) {
    tracePointsStep.push(new THREE.Vector3((i / 99) * 1.4 - 0.7, 0, 0.03));
  }
  traceGeoStep.setFromPoints(tracePointsStep);
  stepperTraceLine = new THREE.Line(traceGeoStep, traceMat);
  oscGroupStep.add(stepperTraceLine);

  // C. High-Fidelity Anchor Windlass (Deck Winch)
  const industrialGreyMat = new THREE.MeshStandardMaterial({ color: 0x4a5d6a, roughness: 0.45, metalness: 0.55 });
  const steelMat = new THREE.MeshStandardMaterial({ color: 0x9cb3c5, roughness: 0.2, metalness: 0.85 });
  const darkSteelMat = new THREE.MeshStandardMaterial({ color: 0x2b3137, roughness: 0.5, metalness: 0.7 });
  const chainLinkMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 1.0,
    roughness: 0.07,
    emissive: 0x5a5a5a,
    emissiveIntensity: 1.0
  });

  // Winch Baseplate (Industrial I-Beam Steel Frame structure matching the image)
  const baseFrameGroup = new THREE.Group();
  baseFrameGroup.position.set(3.5, 0.0, -0.2);
  stepperChainGroup.add(baseFrameGroup);

  // Deck Mounting Plate
  const mountPlate = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.02, 2.3), darkSteelMat);
  mountPlate.position.y = 0.01;
  baseFrameGroup.add(mountPlate);

  // Longitudinal side girders (L & R beams)
  const girderL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 2.2), industrialGreyMat);
  girderL.position.set(-0.55, 0.07, 0);
  baseFrameGroup.add(girderL);

  const girderR = girderL.clone();
  girderR.position.x = 0.55;
  baseFrameGroup.add(girderR);

  // Transverse cross beams ( g1 to g4 )
  const crossZPositions = [-1.0, -0.5, 0.0, 0.5, 1.0];
  crossZPositions.forEach(zVal => {
    const crossBeam = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.12, 0.08), industrialGreyMat);
    crossBeam.position.set(0, 0.07, zVal);
    baseFrameGroup.add(crossBeam);
  });

  // A-Frame Support Brackets (Aft, Middle, Forward) - Heavy triangular supports
  const bracketZs = [ -0.9, -0.3, 0.3 ];
  bracketZs.forEach(zPos => {
    // Vertical center plate
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.52, 0.22), industrialGreyMat);
    plate.position.set(3.5, 0.285, zPos);
    plate.castShadow = true;
    plate.receiveShadow = true;
    stepperChainGroup.add(plate);

    // Left and Right angled web stiffeners / braces
    const braceL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.56, 0.06), industrialGreyMat);
    braceL.position.set(3.5 - 0.2, 0.285, zPos);
    braceL.rotation.z = -0.25;
    braceL.castShadow = true;
    stepperChainGroup.add(braceL);

    const braceR = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.56, 0.06), industrialGreyMat);
    braceR.position.set(3.5 + 0.2, 0.285, zPos);
    braceR.rotation.z = 0.25;
    braceR.castShadow = true;
    stepperChainGroup.add(braceR);

    // Bearing housing caps
    const bearingCap = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.15, 16), industrialGreyMat);
    bearingCap.rotation.x = Math.PI / 2;
    bearingCap.position.set(3.5, 0.55, zPos);
    bearingCap.castShadow = true;
    stepperChainGroup.add(bearingCap);

    // Mounting flange foot
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.04, 0.24), industrialGreyMat);
    foot.position.set(3.5, 0.045, zPos);
    foot.castShadow = true;
    stepperChainGroup.add(foot);
  });

  // Stepper Motor Housing with cooling fins
  const motorCore = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.4, 20), plasticDark);
  motorCore.rotation.x = Math.PI / 2;
  motorCore.position.set(3.5, 0.55, 0.72);
  motorCore.castShadow = true;
  stepperChainGroup.add(motorCore);
  const lblStepper = create3DLabel('STEPPER MOTOR', stepperChainGroup, 3.5, 1.25, 0.72);
  if (lblStepper) {
    lblStepper.visible = false;
    stepperLabels.push(lblStepper);
  }

  for (let f = 0; f < 5; f++) {
    const finZ = 0.55 + f * 0.08;
    const fin = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.015, 20), darkSteelMat);
    fin.rotation.x = Math.PI / 2;
    fin.position.set(3.5, 0.55, finZ);
    fin.castShadow = true;
    stepperChainGroup.add(fin);
  }

  // Electrical terminal box
  const junctionBox = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.14), industrialGreyMat);
  junctionBox.position.set(3.24, 0.64, 0.72);
  stepperChainGroup.add(junctionBox);

  // Central Gearbox Casing (Heavy iron beveled housing like in the image)
  const gearbox = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.8, 0.22), industrialGreyMat);
  gearbox.position.set(3.5, 0.425, 0.415);
  gearbox.castShadow = true;
  gearbox.receiveShadow = true;
  stepperChainGroup.add(gearbox);

  const gearboxTop = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.22, 16), industrialGreyMat);
  gearboxTop.rotation.x = Math.PI / 2;
  gearboxTop.position.set(3.5, 0.55, 0.415);
  gearboxTop.castShadow = true;
  stepperChainGroup.add(gearboxTop);

  // Metal Gear Guard (Curved shield cover over the main gear mesh matching the image)
  const gearGuard = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.12, 20, 1, true, 0, Math.PI), industrialGreyMat);
  gearGuard.rotation.x = Math.PI / 2;
  gearGuard.rotation.y = Math.PI;
  gearGuard.position.set(3.5, 0.55, 0.415);
  gearGuard.castShadow = true;
  stepperChainGroup.add(gearGuard);

  // Pinion gear (meshing from gearbox output shaft)
  const pinionGear = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.08, 16), steelMat);
  pinionGear.rotation.x = Math.PI / 2;
  pinionGear.position.set(3.5, 0.86, 0.415);
  pinionGear.castShadow = true;
  stepperChainGroup.add(pinionGear);

  // Manual brake handwheel (T-bar) on top of bracket caps
  [ -0.9, -0.3 ].forEach(zPos => {
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.2, 8), brassMat);
    rod.position.set(3.5, 0.73, zPos);
    rod.castShadow = true;
    stepperChainGroup.add(rod);

    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.22, 8), brassMat);
    handle.rotation.z = Math.PI / 2;
    handle.position.set(3.5, 0.83, zPos);
    handle.castShadow = true;
    stepperChainGroup.add(handle);
  });

  // Manual Brake Band wrap around the drum
  const brakeBand = new THREE.Mesh(new THREE.TorusGeometry(0.445, 0.012, 6, 32, Math.PI * 1.55), darkSteelMat);
  brakeBand.position.set(3.5, 0.55, -0.86);
  brakeBand.rotation.y = Math.PI / 2;
  stepperChainGroup.add(brakeBand);

  // Manual brake lever mechanism on the side
  const brakeLeverGroup = new THREE.Group();
  brakeLeverGroup.position.set(3.5 - 0.3, 0.25, -0.86);
  stepperChainGroup.add(brakeLeverGroup);
  
  const leverLink = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.15), steelMat);
  brakeLeverGroup.add(leverLink);
  
  const leverBar = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.38, 8), steelMat);
  leverBar.position.set(-0.06, 0.16, 0.05);
  leverBar.rotation.z = 0.45;
  brakeLeverGroup.add(leverBar);

  const leverHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.1, 8), plasticDark);
  leverHandle.position.set(-0.14, 0.31, 0.05);
  leverHandle.rotation.z = 0.45;
  brakeLeverGroup.add(leverHandle);

  // Chain Stopper (Heavy lock gate)
  const stopper = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.16), industrialGreyMat);
  stopper.position.set(3.5, 0.085, -0.38);
  stopper.castShadow = true;
  stepperChainGroup.add(stopper);

  const latch = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.12, 0.2), steelMat);
  latch.position.set(3.5, 0.13, -0.44);
  latch.rotation.x = 0.55;
  latch.castShadow = true;
  stepperChainGroup.add(latch);

  // ROTATING ASSEMBLY GROUP (Shaft, Rope Drum with ribs, Gypsy, Spur Gear, Warping Head)
  const rotatingGroup = new THREE.Group();
  rotatingGroup.position.set(3.5, 0.55, 0);
  stepperChainGroup.add(rotatingGroup);

  // Main Shaft (Chrome steel)
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 1.7, 16), steelMat);
  shaft.rotation.x = Math.PI / 2;
  shaft.position.z = -0.3;
  shaft.castShadow = true;
  rotatingGroup.add(shaft);

  // Warping End (Conical drum on the left end matching the image)
  const warpingHead = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.22, 16), industrialGreyMat);
  warpingHead.rotation.x = Math.PI / 2;
  warpingHead.position.z = -1.05;
  warpingHead.castShadow = true;
  rotatingGroup.add(warpingHead);

  const flangeW1 = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 16), industrialGreyMat);
  flangeW1.rotation.x = Math.PI / 2;
  flangeW1.position.z = -1.16;
  flangeW1.castShadow = true;
  rotatingGroup.add(flangeW1);

  const flangeW2 = flangeW1.clone();
  flangeW2.position.z = -0.94;
  rotatingGroup.add(flangeW2);

  // Rope/Cable Drum core and flanges
  const drumCore = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.52, 24), industrialGreyMat);
  drumCore.rotation.x = Math.PI / 2;
  drumCore.position.z = -0.6;
  drumCore.castShadow = true;
  rotatingGroup.add(drumCore);

  const flange1 = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.04, 24), industrialGreyMat);
  flange1.rotation.x = Math.PI / 2;
  flange1.position.z = -0.86;
  flange1.castShadow = true;
  rotatingGroup.add(flange1);

  const flange2 = flange1.clone();
  flange2.position.z = -0.34;
  rotatingGroup.add(flange2);

  // Stiffening reinforcement ribs on drum flanges (8 radial plates)
  for (let r = 0; r < 8; r++) {
    const rAng = (r / 8) * Math.PI * 2;
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.18, 0.35), industrialGreyMat);
    rib.position.set(Math.cos(rAng) * 0.32, Math.sin(rAng) * 0.32, -0.84);
    rib.rotation.z = rAng;
    rotatingGroup.add(rib);
    
    const rib2 = rib.clone();
    rib2.position.z = -0.36;
    rotatingGroup.add(rib2);
  }

  // Wrapped wire rope (6 steel cable coils on the drum)
  const cableMat = new THREE.MeshStandardMaterial({ color: 0xa4b1b9, roughness: 0.5, metalness: 0.8 });
  for (let k = 0; k < 6; k++) {
    const cableZ = -0.8 + k * 0.08;
    const turn = new THREE.Mesh(new THREE.TorusGeometry(0.275, 0.03, 8, 24), cableMat);
    turn.position.z = cableZ;
    rotatingGroup.add(turn);
  }

  // Pocketed Gypsy (Wildcat) pocket core and outer flanges
  const wildcatCore = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.22, 24), industrialGreyMat);
  wildcatCore.rotation.x = Math.PI / 2;
  wildcatCore.castShadow = true;
  rotatingGroup.add(wildcatCore);

  const wildcatFlange1 = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.03, 24), industrialGreyMat);
  wildcatFlange1.rotation.x = Math.PI / 2;
  wildcatFlange1.position.z = -0.11;
  wildcatFlange1.castShadow = true;
  rotatingGroup.add(wildcatFlange1);

  const wildcatFlange2 = wildcatFlange1.clone();
  wildcatFlange2.position.z = 0.11;
  rotatingGroup.add(wildcatFlange2);

  // Radial pockets details (6 pocket blocks around center)
  const pocketMat = new THREE.MeshStandardMaterial({ color: 0x1f272f, roughness: 0.5, metalness: 0.65 });
  for (let p = 0; p < 6; p++) {
    const pAng = (p / 6) * Math.PI * 2;
    const pocketBlock = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.2), pocketMat);
    pocketBlock.position.set(Math.cos(pAng) * 0.24, Math.sin(pAng) * 0.24, 0);
    pocketBlock.rotation.z = pAng;
    pocketBlock.castShadow = true;
    rotatingGroup.add(pocketBlock);
  }

  // Large Spur Gear wheel (rotating on the main shaft inside the guard)
  const spurGearCore = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.07, 32), steelMat);
  spurGearCore.rotation.x = Math.PI / 2;
  spurGearCore.position.z = 0.415;
  spurGearCore.castShadow = true;
  rotatingGroup.add(spurGearCore);

  for (let t = 0; t < 24; t++) {
    const tAng = (t / 24) * Math.PI * 2;
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.08), steelMat);
    tooth.position.set(Math.cos(tAng) * 0.43, Math.sin(tAng) * 0.43, 0.415);
    tooth.rotation.z = tAng;
    rotatingGroup.add(tooth);
  }

  // Bind groups for rotation animation
  winchDrum = rotatingGroup;
  motorShaft = new THREE.Group(); // empty stub group to satisfy potential motorShaft references
  rotatingGroup.add(motorShaft);

  // Heavy Deck Chock guide mouth (green) at the deck edge
  const chockMat = new THREE.MeshStandardMaterial({ color: 0x3d5d4d, roughness: 0.55, metalness: 0.35 });
  const chockGroup = new THREE.Group();
  chockGroup.position.set(3.5, 0.01, 1.2);
  stepperChainGroup.add(chockGroup);

  const chockBase = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.03, 0.24), chockMat);
  chockGroup.add(chockBase);

  const chockL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.2), chockMat);
  chockL.position.set(-0.11, 0.08, 0);
  chockGroup.add(chockL);

  const chockR = chockL.clone();
  chockR.position.x = 0.11;
  chockGroup.add(chockR);

  const chockCap = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.04, 0.2), chockMat);
  chockCap.position.set(0, 0.18, 0);
  chockGroup.add(chockCap);

  // Heavy Metal Stockless Anchor hanging vertically (Z-foreground matching the image)
  anchorGroup = new THREE.Group();
  anchorGroup.position.set(3.5, -1.06, 1.2); // Placed hanging below chock (so ring is at Y = -0.1)
  anchorGroup.rotation.set(0, 0, 0);        // Hanging vertically
  stepperChainGroup.add(anchorGroup);
  const lblAnchor = create3DLabel('WINCH ANCHOR', anchorGroup, 0, 1.2, 0);
  if (lblAnchor) {
    lblAnchor.visible = false;
    stepperLabels.push(lblAnchor);
  }

  // 1. Tapered Shank (matching the image)
  const anchorShank = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.032, 0.82, 24), chainLinkMat);
  anchorShank.position.y = 0.46; // Extends Y = 0.05 to Y = 0.87
  anchorShank.castShadow = true;
  anchorGroup.add(anchorShank);

  const shankTopSphere = new THREE.Mesh(new THREE.SphereGeometry(0.022, 16, 16), chainLinkMat);
  shankTopSphere.position.set(0, 0.87, 0);
  shankTopSphere.castShadow = true;
  anchorGroup.add(shankTopSphere);

  // Top eyelet through which the shackle pin passes
  const shankEye = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.012, 12, 24), chainLinkMat);
  shankEye.rotation.y = Math.PI / 2; // hole along X-axis
  shankEye.position.set(0, 0.90, 0);
  shankEye.castShadow = true;
  anchorGroup.add(shankEye);

  // 2. Realistic U-Shackle (Crescent) and Pin
  const shacklePin = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.10, 12), chainLinkMat);
  shacklePin.rotation.z = Math.PI / 2; // along X-axis
  shacklePin.position.set(0, 0.90, 0);
  shacklePin.castShadow = true;
  anchorGroup.add(shacklePin);

  const shackleCrescent = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.012, 12, 24, Math.PI), chainLinkMat);
  shackleCrescent.position.set(0, 0.90, 0);
  shackleCrescent.castShadow = true;
  anchorGroup.add(shackleCrescent);

  // Shackle ears (bosses) at the pin ends
  const earL = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 12), chainLinkMat);
  earL.position.set(-0.04, 0.90, 0);
  earL.castShadow = true;
  anchorGroup.add(earL);

  const earR = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 12), chainLinkMat);
  earR.position.set(0.04, 0.90, 0);
  earR.castShadow = true;
  anchorGroup.add(earR);

  // 3. Shackle Ring (large loop matching the image, interlocking YZ-plane)
  const anchorRing = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.016, 12, 32), chainLinkMat);
  anchorRing.rotation.y = Math.PI / 2; // hole along X-axis, interlocking XY-plane shackle
  anchorRing.position.set(0, 0.97, 0);
  anchorRing.castShadow = true;
  anchorGroup.add(anchorRing);

  // 4. Detailed Stock (Crossbar passing through shank with collar rings and end caps)
  const stockBar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.70, 16), chainLinkMat);
  stockBar.rotation.z = Math.PI / 2;
  stockBar.position.y = 0.76;
  stockBar.castShadow = true;
  anchorGroup.add(stockBar);

  const stockCenterCollar = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.01, 10, 20), chainLinkMat);
  stockCenterCollar.rotation.y = Math.PI / 2;
  stockCenterCollar.position.set(0, 0.76, 0);
  stockCenterCollar.castShadow = true;
  anchorGroup.add(stockCenterCollar);

  const stockBallL = new THREE.Mesh(new THREE.SphereGeometry(0.032, 16, 16), chainLinkMat);
  stockBallL.position.set(-0.35, 0.76, 0);
  stockBallL.castShadow = true;
  anchorGroup.add(stockBallL);

  const stockBallR = new THREE.Mesh(new THREE.SphereGeometry(0.032, 16, 16), chainLinkMat);
  stockBallR.position.set(0.35, 0.76, 0);
  stockBallR.castShadow = true;
  anchorGroup.add(stockBallR);

  const stockCollarL = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.008, 10, 20), chainLinkMat);
  stockCollarL.rotation.y = Math.PI / 2;
  stockCollarL.position.set(-0.31, 0.76, 0);
  stockCollarL.castShadow = true;
  anchorGroup.add(stockCollarL);

  const stockCollarR = stockCollarL.clone();
  stockCollarR.position.x = 0.31;
  anchorGroup.add(stockCollarR);

  // 5. Crown (Center block and bottom base plates, smooth transitions)
  const crownCenter = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 16), chainLinkMat);
  crownCenter.position.set(0, 0.05, 0);
  crownCenter.castShadow = true;
  anchorGroup.add(crownCenter);

  const crownBottom = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 16), chainLinkMat);
  crownBottom.position.set(0, 0.0, 0);
  crownBottom.castShadow = true;
  anchorGroup.add(crownBottom);

  const crownBase = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.08, 16), chainLinkMat);
  crownBase.rotation.z = Math.PI / 2;
  crownBase.position.set(0, 0.03, 0);
  crownBase.castShadow = true;
  anchorGroup.add(crownBase);

  // 6. Curved Tapered Left & Right Arms (capsule-chain style: spheres at joints for seamless curves)
  const armSegments = 16;
  for (let s = 0; s <= armSegments; s++) {
    const t = s / armSegments;
    
    // Left Arm Bezier point
    const pL = new THREE.Vector3().addScaledVector(new THREE.Vector3(0, 0.05, 0), (1-t)*(1-t))
                                  .addScaledVector(new THREE.Vector3(-0.16, -0.06, 0), 2*(1-t)*t)
                                  .addScaledVector(new THREE.Vector3(-0.36, 0.35, 0), t*t);
                                  
    // Right Arm Bezier point
    const pR = new THREE.Vector3().addScaledVector(new THREE.Vector3(0, 0.05, 0), (1-t)*(1-t))
                                  .addScaledVector(new THREE.Vector3(0.16, -0.06, 0), 2*(1-t)*t)
                                  .addScaledVector(new THREE.Vector3(0.36, 0.35, 0), t*t);
                                  
    const rad = 0.045 * (1.0 - t * 0.5); // Taper from 0.045 at base to 0.0225 at tip
    
    // Draw joint spheres to make the arm intersections completely smooth
    const sphereL = new THREE.Mesh(new THREE.SphereGeometry(rad, 12, 12), chainLinkMat);
    sphereL.position.copy(pL);
    sphereL.castShadow = true;
    anchorGroup.add(sphereL);
    
    const sphereR = new THREE.Mesh(new THREE.SphereGeometry(rad, 12, 12), chainLinkMat);
    sphereR.position.copy(pR);
    sphereR.castShadow = true;
    anchorGroup.add(sphereR);
    
    // Draw cylinder segment between consecutive points
    if (s > 0) {
      const tPrev = (s - 1) / armSegments;
      const pLPrev = new THREE.Vector3().addScaledVector(new THREE.Vector3(0, 0.05, 0), (1-tPrev)*(1-tPrev))
                                        .addScaledVector(new THREE.Vector3(-0.16, -0.06, 0), 2*(1-tPrev)*tPrev)
                                        .addScaledVector(new THREE.Vector3(-0.36, 0.35, 0), tPrev*tPrev);
      const pRPrev = new THREE.Vector3().addScaledVector(new THREE.Vector3(0, 0.05, 0), (1-tPrev)*(1-tPrev))
                                        .addScaledVector(new THREE.Vector3(0.16, -0.06, 0), 2*(1-tPrev)*tPrev)
                                        .addScaledVector(new THREE.Vector3(0.36, 0.35, 0), tPrev*tPrev);
                                        
      const radPrev = 0.045 * (1.0 - tPrev * 0.5);
      
      const distL = pLPrev.distanceTo(pL);
      const segL = new THREE.Mesh(new THREE.CylinderGeometry(rad, radPrev, distL, 12), chainLinkMat);
      segL.position.copy(new THREE.Vector3().addVectors(pLPrev, pL).multiplyScalar(0.5));
      segL.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3().subVectors(pL, pLPrev).normalize());
      segL.castShadow = true;
      anchorGroup.add(segL);
      
      const distR = pRPrev.distanceTo(pR);
      const segR = new THREE.Mesh(new THREE.CylinderGeometry(rad, radPrev, distR, 12), chainLinkMat);
      segR.position.copy(new THREE.Vector3().addVectors(pRPrev, pR).multiplyScalar(0.5));
      segR.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3().subVectors(pR, pRPrev).normalize());
      segR.castShadow = true;
      anchorGroup.add(segR);
    }
  }

  // 7. Flukes (Curved, beveled spade-shaped palms using custom 2D Shape Extrusion)
  const flukeShape = new THREE.Shape();
  flukeShape.moveTo(0, -0.11);
  flukeShape.quadraticCurveTo(0.04, -0.08, 0.05, -0.01);
  flukeShape.quadraticCurveTo(0.03, 0.07, 0.0, 0.11); // pointed tip
  flukeShape.quadraticCurveTo(-0.03, 0.07, -0.05, -0.01);
  flukeShape.quadraticCurveTo(-0.04, -0.08, 0, -0.11);

  const flukeSettings = {
    depth: 0.008,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.006,
    bevelThickness: 0.006
  };
  const flukeGeo = new THREE.ExtrudeGeometry(flukeShape, flukeSettings);

  const flukeL = new THREE.Mesh(flukeGeo, chainLinkMat);
  flukeL.rotation.set(0, 0.2, -0.85);
  flukeL.position.set(-0.36, 0.35, 0.02);
  flukeL.castShadow = true;
  anchorGroup.add(flukeL);

  const flukeR = new THREE.Mesh(flukeGeo, chainLinkMat);
  flukeR.rotation.set(0, -0.2, 0.85);
  flukeR.position.set(0.36, 0.35, 0.02);
  flukeR.castShadow = true;
  anchorGroup.add(flukeR);

  // Initial Chain Path Curve (Z-foreground matching the image)
  chainPath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(3.5, -0.4, -0.8),         // Under deck (slot)
    new THREE.Vector3(3.5, 0.2, -0.4),          // Coming up to wildcat
    new THREE.Vector3(3.5, 0.88, 0.0),          // Wrapped over top of wildcat
    new THREE.Vector3(3.5, 0.15, 0.9),          // Draping forward to chock
    new THREE.Vector3(3.5, -0.1, 1.2)           // Attaching to anchor ring shackle
  ]);

  const linkGeo = new THREE.TorusGeometry(0.11, 0.032, 8, 20);

  chainLinks = [];
  for (let i = 0; i < 16; i++) {
    const linkParent = new THREE.Group();
    const linkMesh = new THREE.Mesh(linkGeo, chainLinkMat);
    linkMesh.castShadow = true;
    linkMesh.rotation.y = Math.PI / 2;
    linkMesh.rotation.z = (i % 2 === 0) ? 0 : Math.PI / 2;
    linkParent.add(linkMesh);
    stepperChainGroup.add(linkParent);
    chainLinks.push({ parent: linkParent, mesh: linkMesh, index: i });
  } 

  // --- Initial Visibility ---
  servoChainGroup.visible = true;
  stepperChainGroup.visible = false;
  initDataPackets();
}

buildPhysicalLaboratory();

/* ---------------- Analytical Charts Framework ---------------- */
let trackingChart, torqueChart, accelChart;

function initAnalyticalCharts() {
  const chartConfig = {
    responsive: true, maintainAspectRatio: false,
    animation: { duration: 0 },
    plugins: { legend: { display: true, labels: { color: '#333', boxWidth: 10 } } }
  };

  const trackingCtx = document.getElementById('chart-srv-tracking').getContext('2d');
  trackingChart = new Chart(trackingCtx, {
    type: 'line',
    data: {
      labels: Array(historyInterval).fill(''),
      datasets: [
        { label: 'Helm Command (Target)', data: trackingDataTarget, borderColor: '#457b9d', borderWidth: 2, pointRadius: 0, fill: false, borderDash: [4, 4] },
        { label: 'Rudder Vector (Actual)', data: trackingDataActual, borderColor: '#e63946', borderWidth: 2, pointRadius: 0, fill: false }
      ]
    },
    options: {
      ...chartConfig,
      scales: { y: { min: 0, max: 180, title: { display: true, text: 'Angular Deviation (Deg)' } }, x: { display: false } }
    }
  });

  const torqueCtx = document.getElementById('chart-stp-torque').getContext('2d');
  torqueChart = new Chart(torqueCtx, {
    type: 'line',
    data: {
      labels: Array.from({ length: 20 }, (_, i) => i * 50),
      datasets: [
        { label: 'Dynamic Pull Envelope', data: [], borderColor: '#b4441f', borderWidth: 2, pointRadius: 0, fill: false },
        { label: 'Active Load Profile', data: [], borderColor: '#5fd6ef', pointRadius: 5, pointBackgroundColor: '#5fd6ef', showLine: false }
      ]
    },
    options: {
      ...chartConfig,
      scales: {
        x: { type: 'linear', min: 0, max: 1000, title: { display: true, text: 'Clock Pulse Frequency (Hz)' } },
        y: { min: 0, max: 20, title: { display: true, text: 'Brake Torque Load (N·m)' } }
      }
    }
  });

  const accelCtx = document.getElementById('chart-stp-accel').getContext('2d');
  accelChart = new Chart(accelCtx, {
    type: 'line',
    data: {
      labels: stp3TimeLabels,
      datasets: [
        { label: 'Command Freq (Hz)', data: stp3CmdFreqHistory, borderColor: '#457b9d', borderWidth: 2, pointRadius: 0, fill: false },
        { label: 'Actual Freq (Hz)', data: stp3ActFreqHistory, borderColor: '#e63946', borderWidth: 2, pointRadius: 0, fill: false }
      ]
    },
    options: {
      ...chartConfig,
      scales: {
        y: { min: 0, max: 2500, title: { display: true, text: 'Frequency (Hz)' } },
        x: { display: false }
      }
    }
  });
}

initAnalyticalCharts();

/* ============== 3D RUDDER ANGLE INDICATOR ============== */
function createGaugeFaceTexture() {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cx = size / 2, cy = size / 2;
  const R = size / 2 - 30;

  // Face background
  ctx.fillStyle = '#ddd8c8';
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();

  // Inner lighter area
  ctx.fillStyle = '#e8e4d8';
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.92, 0, Math.PI * 2);
  ctx.fill();

  // Subtle radial shadow
  const sg = ctx.createRadialGradient(cx, cy, R * 0.78, cx, cy, R);
  sg.addColorStop(0, 'transparent');
  sg.addColorStop(1, 'rgba(0,0,0,0.12)');
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();

  // Title
  ctx.fillStyle = '#1a1a1a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 30px Arial';
  ctx.fillText('RUDDER ANGLE INDICATOR', cx, cy - R * 0.78);
  ctx.font = '19px Arial';
  ctx.fillText('DEGREES', cx, cy - R * 0.66);

  // NEUTRAL label
  ctx.font = 'bold 24px Arial';
  ctx.fillStyle = '#333';
  ctx.fillText('NEUTRAL', cx, cy - R * 0.12);

  // Scale parameters
  // Mapping: rudder -45 -> canvas angle PI, 0 -> PI/2, +45 -> 0
  const sOuter = R * 0.88;
  const sInner = R * 0.76;
  const numR   = R * 0.64;

  // Arc lines
  ctx.strokeStyle = '#888';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, sOuter, 0, Math.PI, false);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, sInner, 0, Math.PI, false);
  ctx.stroke();

  // Tick marks and numbers
  for (let deg = -45; deg <= 45; deg += 1) {
    const a = Math.PI / 2 - deg * Math.PI / 90;
    const ca = Math.cos(a), sa = Math.sin(a);
    const isMajor = deg % 5 === 0;

    if (isMajor) {
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(cx + ca * sInner, cy + sa * sInner);
      ctx.lineTo(cx + ca * sOuter, cy + sa * sOuter);
      ctx.stroke();

      ctx.fillStyle = '#1a1a1a';
      ctx.font = 'bold 26px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(Math.abs(deg).toString(), cx + ca * numR, cy + sa * numR);
    } else {
      ctx.fillStyle = '#777';
      ctx.beginPath();
      ctx.arc(cx + ca * (sOuter - 8), cy + sa * (sOuter - 8), 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // PORT label (left, vertical)
  ctx.save();
  ctx.fillStyle = '#1a1a1a';
  ctx.font = 'bold 36px Arial';
  ctx.textAlign = 'center';
  ctx.translate(cx - R * 0.52, cy + R * 0.12);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('PORT', 0, 0);
  ctx.restore();

  // STARBOARD label (right, vertical)
  ctx.save();
  ctx.fillStyle = '#1a1a1a';
  ctx.font = 'bold 30px Arial';
  ctx.textAlign = 'center';
  ctx.translate(cx + R * 0.52, cy + R * 0.12);
  ctx.rotate(Math.PI / 2);
  ctx.fillText('STARBOARD', 0, 0);
  ctx.restore();

  // Bottom text
  ctx.fillStyle = '#444';
  ctx.font = '20px Arial';
  ctx.textAlign = 'center';
  ctx.fillText("SHIP'S RUDDER INDICATOR", cx, cy + R * 0.88);
  ctx.font = '15px Arial';
  ctx.fillText('UNITS: DEGREES', cx, cy + R * 0.95);

  return new THREE.CanvasTexture(canvas);
}

function buildRudderGauge3D() {
  const housingMat = new THREE.MeshStandardMaterial({ color: 0x8B8B10, roughness: 0.3, metalness: 0.75 });
  const darkMetal   = new THREE.MeshStandardMaterial({ color: 0x555522, roughness: 0.25, metalness: 0.85 });

  const gauge = new THREE.Group();
  gauge.rotation.x = -0.28;

  // Outer housing ring
  gauge.add(Object.assign(new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.35, 24, 64), housingMat), {}));

  // Rear lip
  const rearLip = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.15, 12, 64), darkMetal);
  rearLip.position.z = -0.25;
  gauge.add(rearLip);

  // Back plate
  const bp = new THREE.Mesh(new THREE.CircleGeometry(2.55, 64),
    new THREE.MeshStandardMaterial({ color: 0x3a3a1a, roughness: 0.5, metalness: 0.6 }));
  bp.position.z = -0.3;
  gauge.add(bp);

  // Face plate
  const face = new THREE.Mesh(new THREE.CircleGeometry(2.1, 64),
    new THREE.MeshStandardMaterial({ map: createGaugeFaceTexture(), roughness: 0.55, metalness: 0.05 }));
  face.position.z = 0.08;
  gauge.add(face);

  // Inner bezel
  const bezel = new THREE.Mesh(new THREE.TorusGeometry(2.15, 0.05, 12, 64), darkMetal);
  bezel.position.z = 0.12;
  gauge.add(bezel);

  // Glass cover
  const glass = new THREE.Mesh(new THREE.CircleGeometry(2.1, 64),
    new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.07,
      roughness: 0.02, metalness: 0, clearcoat: 1.0, clearcoatRoughness: 0.02 }));
  glass.position.z = 0.28;
  gauge.add(glass);

  // Bolts (8)
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.2, 6),
      new THREE.MeshStandardMaterial({ color: 0x666633, metalness: 0.85, roughness: 0.25 }));
    bolt.position.set(Math.cos(ang) * 2.4, Math.sin(ang) * 2.4, 0.25);
    bolt.rotation.x = Math.PI / 2;
    gauge.add(bolt);
  }

  // Mounting tabs (4 cardinal positions)
  [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2].forEach(ang => {
    const tab = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.3), housingMat);
    tab.position.set(Math.cos(ang) * 2.85, Math.sin(ang) * 2.85, -0.1);
    gauge.add(tab);
    const tb = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.32, 8), darkMetal);
    tb.position.set(Math.cos(ang) * 2.85, Math.sin(ang) * 2.85, 0.06);
    tb.rotation.x = Math.PI / 2;
    gauge.add(tb);
  });

  // ---- NEEDLE ----
  indicatorNeedle = new THREE.Group();
  const nMat = new THREE.MeshStandardMaterial({ color: 0xFF8C00, roughness: 0.25, metalness: 0.5,
    emissive: 0xFF6600, emissiveIntensity: 0.15 });

  // Body (points downward at neutral)
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.4, 0.035), nMat);
  body.position.y = -0.7;
  indicatorNeedle.add(body);

  // Arrow tip
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 3), nMat);
  tip.position.y = -1.55;
  tip.rotation.z = Math.PI;
  indicatorNeedle.add(tip);

  // Counter-weight tail
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.35, 0.035), nMat);
  tail.position.y = 0.22;
  indicatorNeedle.add(tail);
  const tailBall = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), nMat);
  tailBall.position.y = 0.44;
  indicatorNeedle.add(tailBall);

  // Pivot cap
  const pivotMat = new THREE.MeshStandardMaterial({ color: 0xFFAA00, metalness: 0.85, roughness: 0.15 });
  const pivotDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.1, 24), pivotMat);
  pivotDisc.rotation.x = Math.PI / 2;
  pivotDisc.position.z = 0.02;
  indicatorNeedle.add(pivotDisc);
  const pivotSphere = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 16), pivotMat);
  pivotSphere.position.z = 0.08;
  indicatorNeedle.add(pivotSphere);

  indicatorNeedle.position.z = 0.16;
  gauge.add(indicatorNeedle);

  indicatorScene.add(gauge);
}

function initRudderIndicator3D() {
  const indHost = document.getElementById('rudder-indicator-host');
  if (!indHost) return;
  hasIndicator = true;

  const iW = indHost.clientWidth || 400;
  const iH = indHost.clientHeight || 300;

  try {
    indicatorRenderer = new THREE.WebGLRenderer({ antialias: true });
  } catch (e) { return; }

  indicatorRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  indicatorRenderer.setSize(iW, iH);
  indicatorRenderer.setClearColor(0x0a1e2d);

  const cvs = indicatorRenderer.domElement;
  cvs.style.width = '100%';
  cvs.style.height = '100%';
  cvs.style.display = 'block';
  indHost.insertBefore(cvs, indHost.firstChild);

  indicatorScene = new THREE.Scene();
  indicatorScene.background = new THREE.Color(0x0a1e2d);

  indicatorCamera = new THREE.PerspectiveCamera(28, iW / iH, 0.1, 100);
  indicatorCamera.position.set(0, 2.2, 7.5);
  indicatorCamera.lookAt(0, -0.3, 0);

  // Lighting
  indicatorScene.add(new THREE.AmbientLight(0x607090, 2.5));
  const key = new THREE.DirectionalLight(0xffffff, 1.8);
  key.position.set(3, 6, 5);
  indicatorScene.add(key);
  const rim = new THREE.DirectionalLight(0x88aaff, 0.6);
  rim.position.set(-3, 2, 3);
  indicatorScene.add(rim);
  const warm = new THREE.PointLight(0xffcc88, 0.4, 15);
  warm.position.set(0, -1, 4);
  indicatorScene.add(warm);

  buildRudderGauge3D();
  indicatorRenderer.render(indicatorScene, indicatorCamera);

  // Resize observer
  if (window.ResizeObserver) {
    new ResizeObserver(() => {
      const w = indHost.clientWidth, h = indHost.clientHeight;
      if (w > 0 && h > 0) {
        indicatorCamera.aspect = w / h;
        indicatorCamera.updateProjectionMatrix();
        indicatorRenderer.setSize(w, h);
      }
    }).observe(indHost);
  }
}

initRudderIndicator3D();

/* ============== 3D PROPELLER & RUDDER ASSEMBLY ============== */
function buildPropRudder3D() {
  const brassMat = new THREE.MeshPhysicalMaterial({
    color: 0xd4a337,
    metalness: 0.95,
    roughness: 0.12,
    clearcoat: 0.5,
    clearcoatRoughness: 0.1
  });
  const rudMat = new THREE.MeshStandardMaterial({
    color: 0xa34427, // Beautiful copper/red-brown paint
    metalness: 0.35,
    roughness: 0.35
  });
  const steelMat = new THREE.MeshStandardMaterial({
    color: 0x2b2e33, // Dark carbon/chrome steel
    metalness: 0.8,
    roughness: 0.25
  });

  // Keel bottom plate


  // Propeller Shaft Bossing (stern tube bossing in red-brown lower hull)
  const bossing = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.22, 1.2, 16), rudMat);
  bossing.rotation.x = Math.PI / 2;
  bossing.position.set(0, -0.4, -2.4);
  propRudderScene.add(bossing);

  // 2. Propeller Shaft (emerging from bossing)
  const shaftGeo = new THREE.CylinderGeometry(0.1, 0.1, 1.8, 16);
  const shaft = new THREE.Mesh(shaftGeo, steelMat);
  shaft.rotation.x = Math.PI / 2;
  shaft.position.set(0, -0.4, -1.1);
  propRudderScene.add(shaft);

  // 3. Propeller Group
  propRudderPropeller = new THREE.Group();
  propRudderPropeller.position.set(0, -0.4, 0);

  // Hub (barrel shaped)
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 16), brassMat);
  hub.scale.set(1.0, 1.0, 1.3);
  propRudderPropeller.add(hub);

  // Tapered fairing cap
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.35, 16), brassMat);
  cap.rotation.x = -Math.PI / 2;
  cap.position.set(0, 0, 0.35);
  propRudderPropeller.add(cap);

  // 5 Curved & Twisted Blades (highly realistic)
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(0, 0);
  bladeShape.quadraticCurveTo(0.3, 0.3, 0.35, 0.7);
  bladeShape.quadraticCurveTo(0.3, 1.0, 0.1, 1.15);
  bladeShape.quadraticCurveTo(-0.15, 1.0, -0.15, 0.5);
  bladeShape.quadraticCurveTo(-0.1, 0.15, 0, 0);

  const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, {
    depth: 0.02,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.015,
    bevelSegments: 3
  });

  for (let i = 0; i < 5; i++) {
    const bladeGroup = new THREE.Group();
    bladeGroup.rotation.z = (i / 5) * Math.PI * 2;
    const bladeMesh = new THREE.Mesh(bladeGeo, brassMat);
    bladeMesh.position.set(0, 0, 0.05);
    bladeMesh.rotation.y = 0.4;  // Pitch angle
    bladeMesh.rotation.x = -0.15; // Twisted rake
    bladeGroup.add(bladeMesh);
    propRudderPropeller.add(bladeGroup);
  }
  propRudderScene.add(propRudderPropeller);

  // 4. Rudder System
  propRudderBlade = new THREE.Group();
  propRudderBlade.position.set(0, 0, 1.9); // Rudder pivot axis along Y at Z = 1.3 (providing gap from propeller)

  // Rudder Stock (vertical cylinder)
  const stock = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.8, 16), steelMat);
  stock.position.set(0, -0.2, 0);
  propRudderBlade.add(stock);

  // Rudder Blade (reddish-brown extruded shape)
  const rudShape = new THREE.Shape();
  rudShape.moveTo(0, 1.0);
  rudShape.lineTo(1.2, 0.85);
  rudShape.lineTo(1.1, -1.6);
  rudShape.lineTo(0, -1.6);
  rudShape.closePath();
  const rudGeo = new THREE.ExtrudeGeometry(rudShape, {
    depth: 0.12,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.02,
    bevelSegments: 3
  });
  const rudMesh = new THREE.Mesh(rudGeo, rudMat);
  rudMesh.rotation.y = Math.PI / 2; // Rotate by 90 deg so it extends along the Z-axis (aft)
  rudMesh.position.set(0.06, 0, 0); // Center the thickness on the stock axis
  propRudderBlade.add(rudMesh);

  // Rudder Bulb (Costa bulb - streamlined fairing aligned with propeller axis)
  // Adjusted position to start a bit further aft (local Z >= -0.1) to avoid collision with propeller
  const rudderBulb = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.18, 1.0, 16), rudMat);
  rudderBulb.rotation.x = Math.PI / 2;
  rudderBulb.position.set(0.06, -0.4, 0.4); // local Z=0.4 centers it on the blade chord
  propRudderBlade.add(rudderBulb);

  const bulbCap = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 8), rudMat);
  bulbCap.position.set(0.06, -0.4, 0.9);
  propRudderBlade.add(bulbCap);

  const bulbFront = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 8), rudMat);
  bulbFront.position.set(0.06, -0.4, -0.1);
  propRudderBlade.add(bulbFront);

  propRudderScene.add(propRudderBlade);
}

function initPropRudder3D() {
  const hostDiv = document.getElementById('propeller-rudder-3d-host');
  if (!hostDiv) return;
  hasPropRudder = true;

  const w = hostDiv.clientWidth || 400;
  const h = hostDiv.clientHeight || 300;

  try {
    propRudderRenderer = new THREE.WebGLRenderer({ antialias: true });
  } catch (e) { return; }

  propRudderRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  propRudderRenderer.setSize(w, h);
  propRudderRenderer.setClearColor(0x0a1e2d);
  propRudderRenderer.shadowMap.enabled = true;

  const cvs = propRudderRenderer.domElement;
  cvs.style.width = '100%';
  cvs.style.height = '100%';
  cvs.style.display = 'block';
  hostDiv.insertBefore(cvs, hostDiv.firstChild);

  propRudderScene = new THREE.Scene();
  propRudderScene.background = new THREE.Color(0x0a1e2d);

  // 3/4 perspective camera view
  propRudderCamera = new THREE.PerspectiveCamera(35, w / h, 0.1, 100);
  propRudderCamera.position.set(4.5, 2.5, 5.0); // Looking from aft-starboard-top
  
  propRudderControls = new OrbitControls(propRudderCamera, propRudderRenderer.domElement);
  propRudderControls.enableDamping = true;
  propRudderControls.dampingFactor = 0.08;
  propRudderControls.target.set(0, -0.2, 0.2); // Target near propeller/rudder interface
  propRudderControls.update();

  // Lighting
  propRudderScene.add(new THREE.AmbientLight(0x2d3f55, 1.4));
  
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
  keyLight.position.set(5, 8, 4);
  keyLight.castShadow = true;
  propRudderScene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0x88bbee, 0.8);
  fillLight.position.set(-5, 3, 2);
  propRudderScene.add(fillLight);

  const bounceLight = new THREE.PointLight(0xffddaa, 0.5, 10);
  bounceLight.position.set(0, -2, 1);
  propRudderScene.add(bounceLight);

  // Strong warm gold reflection light underneath to make the bronze and copper pop
  const goldReflectLight = new THREE.PointLight(0xffb703, 3.5, 10);
  goldReflectLight.position.set(2, -3, 2);
  propRudderScene.add(goldReflectLight);

  buildPropRudder3D();
  propRudderRenderer.render(propRudderScene, propRudderCamera);

  // Resize observer
  if (window.ResizeObserver) {
    new ResizeObserver(() => {
      const rw = hostDiv.clientWidth, rh = hostDiv.clientHeight;
      if (rw > 0 && rh > 0) {
        propRudderCamera.aspect = rw / rh;
        propRudderCamera.updateProjectionMatrix();
        propRudderRenderer.setSize(rw, rh);
      }
    }).observe(hostDiv);
  }
}

initPropRudder3D();

function writeLog(text, append = true) {
  let logId = 'srv-t1-status-log';
  if (currentSrvTab === 'task2') logId = 'srv-t2-status-log';
  else if (currentSrvTab === 'task3') logId = 'srv-t3-status-log';
  
  const logDiv = document.getElementById(logId);
  if (!logDiv) return;
  if (append) {
    logDiv.innerHTML += "<br>" + text;
  } else {
    logDiv.innerHTML = text;
  }
  logDiv.scrollTop = logDiv.scrollHeight;
}

function writeStpLog(taskIndex, text, append = true) {
  const logDiv = document.getElementById(`stp${taskIndex}-status-log`);
  if (!logDiv) return;
  if (append) {
    logDiv.innerHTML += "<br>" + text;
  } else {
    logDiv.innerHTML = text;
  }
  logDiv.scrollTop = logDiv.scrollHeight;
}

/* ---------------- Kinematic Computation Matrices ---------------- */
/* ---------------- Live Table Rendering Helpers ---------------- */
function renderServoTable() {
  // 1. Task 1 Table
  const head1 = document.getElementById('srv-t1-table-head');
  const body1 = document.getElementById('srv-t1-table-body');
  if (head1 && body1) {
    head1.innerHTML = `
      <tr>
        <th>Target (°)</th>
        <th>T1 Act</th>
        <th>T1 Err</th>
        <th>T2 Act</th>
        <th>T2 Err</th>
        <th>T3 Act</th>
        <th>T3 Err</th>
        <th>Avg Err</th>
      </tr>
    `;
    body1.innerHTML = '';
    tableData.task1.forEach((r, idx) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><b>${r.target}°</b></td>
        <td id="srv-t1-cell-${idx}-t1act">${r.t1_act !== null ? r.t1_act.toFixed(1) : '--'}</td>
        <td id="srv-t1-cell-${idx}-t1err">${r.t1_err !== null ? r.t1_err.toFixed(2) : '--'}</td>
        <td id="srv-t1-cell-${idx}-t2act">${r.t2_act !== null ? r.t2_act.toFixed(1) : '--'}</td>
        <td id="srv-t1-cell-${idx}-t2err">${r.t2_err !== null ? r.t2_err.toFixed(2) : '--'}</td>
        <td id="srv-t1-cell-${idx}-t3act">${r.t3_act !== null ? r.t3_act.toFixed(1) : '--'}</td>
        <td id="srv-t1-cell-${idx}-t3err">${r.t3_err !== null ? r.t3_err.toFixed(2) : '--'}</td>
        <td id="srv-t1-cell-${idx}-avg" style="font-weight:bold; color:#b4441f;">${r.avg_err !== null ? r.avg_err.toFixed(2) : '--'}</td>
      `;
      body1.appendChild(tr);
    });
  }

  // 2. Task 2 Table
  const head2 = document.getElementById('srv-t2-table-head');
  const body2 = document.getElementById('srv-t2-table-body');
  if (head2 && body2) {
    head2.innerHTML = `
      <tr>
        <th>Time (s)</th>
        <th>Cmd (°)</th>
        <th>Act (°)</th>
        <th>Lag Err (°)</th>
      </tr>
    `;
    body2.innerHTML = '';
    if (tableData.task2.length === 0) {
      body2.innerHTML = `<tr><td colspan="4" style="color:#999; text-align:center;">No dynamic records.</td></tr>`;
    } else {
      tableData.task2.forEach((r, idx) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><b>${r.time.toFixed(1)}s</b></td>
          <td>${r.target.toFixed(1)}°</td>
          <td>${r.actual.toFixed(1)}°</td>
          <td style="color:#b4441f; font-weight:bold;">${r.error.toFixed(2)}°</td>
        `;
        body2.appendChild(tr);
      });
    }
  }

  // 3. Task 3 Table
  const head3 = document.getElementById('srv-t3-table-head');
  const body3 = document.getElementById('srv-t3-table-body');
  if (head3 && body3) {
    head3.innerHTML = `
      <tr>
        <th>Load</th>
        <th>Target (°)</th>
        <th>Actual (°)</th>
        <th>Settle (s)</th>
        <th>Error (°)</th>
        <th>Status</th>
      </tr>
    `;
    body3.innerHTML = '';
    tableData.task3.forEach((r, idx) => {
      let statusColor = '#999';
      if (r.status === 'Pass') statusColor = '#2a5a2a';
      else if (r.status === 'Slip') statusColor = '#b4441f';
      else if (r.status === 'Fail') statusColor = '#cc1111';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><b>${r.load} N·cm</b></td>
        <td>${r.target}°</td>
        <td id="srv-t3-cell-${idx}-act">${r.actual !== null ? r.actual.toFixed(1) : '--'}</td>
        <td id="srv-t3-cell-${idx}-settle">${r.settling !== null ? r.settling.toFixed(2) + 's' : '--'}</td>
        <td id="srv-t3-cell-${idx}-err">${r.error !== null ? r.error.toFixed(2) : '--'}</td>
        <td id="srv-t3-cell-${idx}-status" style="font-weight:bold; color:${statusColor};">${r.status !== null ? r.status : '--'}</td>
      `;
      body3.appendChild(tr);
    });
  }
}

function renderStepperTask1Table() {
  const body = document.getElementById('stp1-table-body');
  if (!body) return;
  body.innerHTML = '';
  if (tableData.stepperTask1.length === 0) {
    body.innerHTML = `<tr><td colspan="5" style="color:#999; text-align:center;">No records.</td></tr>`;
  } else {
    tableData.stepperTask1.forEach(r => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><b>${r.target.toFixed(1)}°</b></td>
        <td>${r.actual.toFixed(1)}°</td>
        <td>${r.pulses}</td>
        <td>${r.res.toFixed(3)}°</td>
        <td>${r.error.toFixed(2)}°</td>
      `;
      body.appendChild(tr);
    });
  }
}

function renderStepperTask2Table() {
  const body = document.getElementById('stp2-table-body');
  if (!body) return;
  body.innerHTML = '';
  if (tableData.stepperTask2.length === 0) {
    body.innerHTML = `<tr><td colspan="5" style="color:#999; text-align:center;">No records.</td></tr>`;
  } else {
    tableData.stepperTask2.forEach(r => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><b>${r.freq} Hz</b></td>
        <td>${r.load} N·m</td>
        <td>${r.reached}</td>
        <td>${r.time === '--' ? '--' : r.time.toFixed(2) + ' s'}</td>
        <td style="color:${r.error === 'Stalled' ? '#cc1111' : '#333'}; font-weight:${r.error === 'Stalled' ? 'bold' : 'normal'}">${r.error === 'Stalled' ? 'Stalled' : r.error.toFixed(2) + '°'}</td>
      `;
      body.appendChild(tr);
    });
  }
}

function renderStepperTask3Table() {
  const body = document.getElementById('stp3-table-body');
  if (!body) return;
  body.innerHTML = '';
  if (tableData.stepperTask3.length === 0) {
    body.innerHTML = `<tr><td colspan="5" style="color:#999; text-align:center;">No records.</td></tr>`;
  } else {
    tableData.stepperTask3.forEach(r => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><b>${r.profile}</b></td>
        <td>${r.peakFreq} Hz</td>
        <td style="color:${r.safe === 'Yes' ? '#2a5a2a' : '#cc1111'}; font-weight:bold;">${r.safe}</td>
        <td>${r.stallFreq === null ? '--' : r.stallFreq.toFixed(0) + ' Hz'}</td>
        <td>${r.maxError.toFixed(0)}</td>
      `;
      body.appendChild(tr);
    });
  }
}

/* ---------------- Kinematic Computation Matrices ---------------- */
function runServoLoop(dt) {
  // Automated Experiment Tasks
  if (activeTask !== 'none') {
    taskTime += dt;
    
    if (activeTask === 'task1') {
      const angles = [0, 45, 90, 135, 180];
      const targetAngle = angles[taskStep];
      servoTarget = targetAngle;
      
      // Update UI slider
      document.getElementById('ctrl-srv-angle').value = targetAngle;
      document.getElementById('lbl-srv-angle').innerText = targetAngle + '°';

      const timeRemaining = Math.max(0, 3.0 - (taskTime % 3.0));
      writeLog(`Step ${taskStep+1}/5: Target ${targetAngle}° (Settling: ${timeRemaining.toFixed(1)}s)`, false);

      let t_step = taskTime - taskStep * 3.0;
      if (t_step >= 1.0 && tableData.task1[taskStep].t1_act === null) {
        const err = Math.abs(targetAngle - servoActual);
        tableData.task1[taskStep].t1_act = servoActual;
        tableData.task1[taskStep].t1_err = err;
        renderServoTable();
        const cell = document.getElementById(`srv-t1-cell-${taskStep}-t1act`);
        if (cell) {
          cell.style.background = "rgba(95, 214, 239, 0.4)";
          setTimeout(() => cell.style.background = "transparent", 600);
        }
      }
      if (t_step >= 2.0 && tableData.task1[taskStep].t2_act === null) {
        const err = Math.abs(targetAngle - servoActual);
        tableData.task1[taskStep].t2_act = servoActual;
        tableData.task1[taskStep].t2_err = err;
        renderServoTable();
        const cell = document.getElementById(`srv-t1-cell-${taskStep}-t2act`);
        if (cell) {
          cell.style.background = "rgba(95, 214, 239, 0.4)";
          setTimeout(() => cell.style.background = "transparent", 600);
        }
      }

      if (taskTime >= (taskStep + 1) * 3.0) {
        const err = Math.abs(targetAngle - servoActual);
        tableData.task1[taskStep].t3_act = servoActual;
        tableData.task1[taskStep].t3_err = err;
        tableData.task1[taskStep].avg_err = (tableData.task1[taskStep].t1_err + tableData.task1[taskStep].t2_err + err) / 3;
        
        renderServoTable();
        const cell = document.getElementById(`srv-t1-cell-${taskStep}-t3act`);
        if (cell) {
          cell.style.background = "rgba(95, 214, 239, 0.4)";
          setTimeout(() => cell.style.background = "transparent", 600);
        }

        writeLog(`Logged: Target ${targetAngle}°, Actual ${servoActual.toFixed(1)}°, Average Error: ${tableData.task1[taskStep].avg_err.toFixed(2)}°`);
        taskLog.push({ target: targetAngle, actual: servoActual, error: err });
        taskStep++;
        
        if (taskStep >= 5) {
          activeTask = 'none';
          writeLog("<b>[Task 1 Completed]</b>");
          let summary = "<br><b>Static Accuracy Results Summary:</b>";
          tableData.task1.forEach(log => {
            summary += `<br>Tgt: ${log.target}° | Act3: ${log.t3_act.toFixed(1)}° | Avg Err: ${log.avg_err.toFixed(2)}°`;
          });
          writeLog(summary);
        }
      }
    }
    else if (activeTask === 'task2') {
      if (taskTime <= 10.0) {
        servoTarget = (taskTime / 10.0) * 180.0;
        document.getElementById('ctrl-srv-angle').value = Math.round(servoTarget);
        document.getElementById('lbl-srv-angle').innerText = Math.round(servoTarget) + '°';

        const currentInterval = Math.floor(taskTime / 0.1);
        if (currentInterval > taskStep) {
          taskStep = currentInterval;
          const err = Math.abs(servoTarget - servoActual);
          tableData.task2.push({ time: taskTime, target: servoTarget, actual: servoActual, error: err });
          renderServoTable();
          const tableDiv = document.getElementById('srv-t2-data-table').parentElement;
          if (tableDiv) tableDiv.scrollTop = tableDiv.scrollHeight;

          writeLog(`Dynamic Log: Time ${taskTime.toFixed(1)}s, Tgt ${servoTarget.toFixed(0)}°, Act ${servoActual.toFixed(1)}°`, false);
        }
      } else {
        activeTask = 'none';
        servoTarget = 180;
        writeLog("<b>[Task 2 Completed]</b> Logged dynamic response curves.");
        let summary = "<br><b>Dynamic Response Summary:</b><br>Servo tracked smoothly with slight physical lag (50-100ms) under proportional control.";
        writeLog(summary);
      }
    }
    else if (activeTask === 'task3') {
      const loads = [0, 16, 32, 48];
      const currentLoad = loads[taskStep];
      
      if (taskTime < (taskStep * 5.0) + 2.0) {
        servoLoad = currentLoad;
        servoTarget = 0;
        document.getElementById('ctrl-srv-load').value = currentLoad;
        document.getElementById('lbl-srv-load').innerText = currentLoad + ' N·cm';
        document.getElementById('ctrl-srv-angle').value = 0;
        document.getElementById('lbl-srv-angle').innerText = '0°';
        writeLog(`Test Load ${currentLoad} N·cm: Resetting to 0°...`, false);
      }
      else {
        servoTarget = 135;
        document.getElementById('ctrl-srv-angle').value = 135;
        document.getElementById('lbl-srv-angle').innerText = '135°';
        const timeRemaining = Math.max(0, ((taskStep + 1) * 5.0) - taskTime);
        writeLog(`Test Load ${currentLoad} N·cm: Step to 135° (Settling: ${timeRemaining.toFixed(1)}s)`, false);
        
        // Track trajectory for settling time
        task3Trajectory.push({ time: taskTime, actual: servoActual });
      }

      if (taskTime >= (taskStep + 1) * 5.0) {
        const finalActual = servoActual;
        const err = Math.abs(135 - finalActual);
        
        let settleTimeVal = 3.0; 
        if (task3Trajectory.length > 0) {
          let j = task3Trajectory.length - 1;
          const threshold = 2.7; 
          while (j >= 0 && Math.abs(task3Trajectory[j].actual - finalActual) <= threshold) {
            j--;
          }
          if (j < task3Trajectory.length - 1) {
            const settleTimeAbsolute = task3Trajectory[j + 1].time;
            const stepStartTime = taskStep * 5.0 + 2.0;
            settleTimeVal = Math.max(0, settleTimeAbsolute - stepStartTime);
          }
        }
        
        let statusString = 'Pass';
        if (err >= 12.0) statusString = 'Fail';
        else if (err >= 3.5) statusString = 'Slip';

        tableData.task3[taskStep].actual = finalActual;
        tableData.task3[taskStep].error = err;
        tableData.task3[taskStep].settling = settleTimeVal;
        tableData.task3[taskStep].status = statusString;
        
        renderServoTable();
        
        const cell = document.getElementById(`srv-t3-cell-${taskStep}-act`);
        if (cell) {
          cell.style.background = "rgba(95, 214, 239, 0.4)";
          setTimeout(() => cell.style.background = "transparent", 600);
        }

        writeLog(`Logged Load ${currentLoad} N·cm: Error = ${err.toFixed(2)}°, Settling Time = ${settleTimeVal.toFixed(2)}s, Status = ${statusString}`);
        taskLog.push({ load: currentLoad, error: err });
        taskStep++;
        task3Trajectory = [];

        if (taskStep >= 4) {
          activeTask = 'none';
          servoLoad = 0;
          document.getElementById('ctrl-srv-load').value = 0;
          document.getElementById('lbl-srv-load').innerText = '0 N·cm';
          writeLog("<b>[Task 3 Completed]</b>");
          let summary = "<br><b>Load Effect Summary:</b>";
          tableData.task3.forEach(log => {
            summary += `<br>Load: ${log.load} N·cm | Settled Error: ${log.error.toFixed(2)}° | Settling Time: ${log.settling.toFixed(2)}s | Status: ${log.status}`;
          });
          writeLog(summary);
        }
      }
    }
  } else if (servoSource === 'sweep') {
    sweepTime += dt * 35 * sweepDirection;
    if (sweepTime >= 180) { sweepTime = 180; sweepDirection = -1; }
    if (sweepTime <= 0) { sweepTime = 0; sweepDirection = 1; }
    servoTarget = sweepTime;
    document.getElementById('ctrl-srv-angle').value = Math.round(servoTarget);
    document.getElementById('lbl-srv-angle').innerText = Math.round(servoTarget) + '°';
  }

  let calculatedInput = servoTarget;
  if (faultNoise) {
    calculatedInput += (Math.random() - 0.5) * 15; // Jitter injection
  }

  let error = calculatedInput - servoActual;
  if (faultStiction && Math.abs(error) < 9) {
    error = 0; 
  }

  const loadFactor = Math.max(0.1, 1 - (servoLoad / 52));
  const executionStep = error * (servoKp * 0.085) * loadFactor;
  servoActual += executionStep * (dt * 60);

  const reportedPwmWidth = 1.0 + (servoActual / 180.0);
  const rudDeg = (servoActual - 90) * (35 / 90);
  const rudRad = rudDeg * Math.PI / 180;

  ['srv1', 'srv2', 'srv3'].forEach(prefix => {
    const tgt = document.getElementById(prefix + '-tgt-read');
    if (tgt) tgt.innerText = servoTarget.toFixed(1) + '°';
    const act = document.getElementById(prefix + '-act-read');
    if (act) act.innerText = servoActual.toFixed(1) + '°';
    const rud = document.getElementById(prefix + '-rud-read');
    if (rud) rud.innerText = (rudDeg >= 0 ? '+' : '') + rudDeg.toFixed(1) + '°';
    const pwmEl = document.getElementById(prefix + '-pwm-read');
    if (pwmEl) pwmEl.innerText = reportedPwmWidth.toFixed(2) + ' ms';
    const errEl = document.getElementById(prefix + '-err-read');
    if (errEl) errEl.innerText = Math.abs(error).toFixed(1) + '°';
  });
  const loadRead = document.getElementById('srv3-load-read');
  if (loadRead) loadRead.innerText = servoLoad.toFixed(0) + ' N·cm';

  // Apply visual transform vectors to the dashboard sport steering wheel
  if (steeringWheelGroup) {
    // 0-180 mapping translates to center neutral alignment
    steeringWheelGroup.rotation.z = -(servoTarget - 90) * Math.PI / 180;
  }
  
  // Rudder blade and steering linkages rotate matching current actuator parameters
  if (rudderSystem) rudderSystem.rotation.y = (servoActual - 90) * Math.PI / 180;
  if (servoHorn) servoHorn.rotation.y = (servoActual - 90) * Math.PI / 180;

  // Update mechanical pushrod linkage in 3D lab
  if (pushrod && servoHorn && rudderSystem) {
    const hornTip = new THREE.Vector3(0, 0.03, -0.45); // Local tip position of horn arm (at the outer hole)
    servoHorn.localToWorld(hornTip);
    const tillerTip = new THREE.Vector3(0, 0.95, 0.3); // Local connection point on rudder tiller arm (at Y = 0.95)
    rudderSystem.localToWorld(tillerTip);

    const mid = hornTip.clone().add(tillerTip).multiplyScalar(0.5);
    pushrod.position.copy(mid);

    const dir = tillerTip.clone().sub(hornTip);
    const len = dir.length();
    pushrod.scale.y = len;
    pushrod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  }

  // Update 3D Propeller & Rudder Assembly
  if (propRudderBlade) propRudderBlade.rotation.y = rudRad;
  if (propRudderPropeller) propRudderPropeller.rotation.z += dt * 8.0;

  // Update 3D rudder angle indicator needle
  // Servo 0-180 maps to rudder -45 to +45; needle sweeps ±90° on gauge (PORT is left/positive, STBD is right/negative)
  if (indicatorNeedle) {
    indicatorNeedle.rotation.z = -(servoActual - 90) * Math.PI / 180;
  }

  trackingDataTarget.push(servoTarget);
  trackingDataActual.push(servoActual);
  trackingDataTarget.shift();
  trackingDataActual.shift();
  trackingChart.update('none');
}

function runStepperLoop(dt) {
  const baseStepAngle = 1.8 / microStep;
  const calculatedMaxTorque = Math.max(0, 20 - ((stepFreq / microStep) * 0.018));

  // Update envelope chart dynamically
  const curvePoints = [];
  for (let f = 0; f <= 1000; f += 50) {
    curvePoints.push({ x: f, y: Math.max(0, 20 - (f * 0.018)) });
  }
  torqueChart.data.datasets[0].data = curvePoints;
  // Representing the operating point: equivalent frequency = stepFreq / microStep
  torqueChart.data.datasets[1].data = [{ x: stepFreq / microStep, y: stepLoad }];
  torqueChart.update('none');

  // If we are running an automated task for stepper
  if (activeStpTask !== 'none') {
    stpTaskTime += dt;

    if (activeStpTask === 'task1') {
      const targets = [0, 90, 180, 270, 0];
      const targetAngle = targets[stpTaskStep];
      stepTarget = targetAngle;

      document.getElementById('ctrl-stp1-angle').value = targetAngle;
      document.getElementById('lbl-stp1-angle').innerText = targetAngle + '°';

      const timeRemaining = Math.max(0, 2.5 - stpTaskTime);
      writeStpLog(1, `Step ${stpTaskStep + 1}/5: Target ${targetAngle}° (Settling: ${timeRemaining.toFixed(1)}s)`, false);

      // Perform tracking
      let diff = stepTarget - stepActual;
      if (Math.abs(diff) > 0.01) {
        const directionSign = Math.sign(diff);
        const motionIncrement = directionSign * (stepFreq * baseStepAngle) * dt;
        if (Math.abs(motionIncrement) >= Math.abs(diff)) {
          stepActual = stepTarget;
        } else {
          stepActual += motionIncrement;
        }
        accumulatedPulses += Math.round(Math.abs(motionIncrement) / baseStepAngle);
      }

      if (stpTaskTime >= 2.5) {
        const err = Math.abs(targetAngle - stepActual);
        const rec = {
          target: targetAngle,
          actual: stepActual,
          pulses: accumulatedPulses,
          res: baseStepAngle,
          error: err
        };
        tableData.stepperTask1.push(rec);
        renderStepperTask1Table();

        writeStpLog(1, `Logged: Target ${targetAngle}°, Encoder Actual: ${stepActual.toFixed(1)}°, Pulses: ${accumulatedPulses}, Error: ${err.toFixed(3)}°`);
        
        stpTaskStep++;
        stpTaskTime = 0;

        if (stpTaskStep >= 5) {
          activeStpTask = 'none';
          writeStpLog(1, "<b>[Task 1 Completed]</b>");
        }
      }
    }
    else if (activeStpTask === 'task2') {
      const freqs = [100, 200, 500, 1000];
      const loads = [0, 5, 10, 15];
      
      const currentFreq = freqs[stpTaskStep];
      const currentLoad = loads[stpTaskStep];
      
      stepFreq = currentFreq;
      stepLoad = currentLoad;

      document.getElementById('ctrl-stp2-freq').value = currentFreq;
      document.getElementById('lbl-stp2-freq').innerText = currentFreq + ' Hz';
      document.getElementById('stp2-freq-read').innerText = currentFreq + ' Hz';

      document.getElementById('ctrl-stp2-load').value = currentLoad;
      document.getElementById('lbl-stp2-load').innerText = currentLoad + ' N·m';
      document.getElementById('stp2-load-read').innerText = currentLoad + ' N·m';
      
      const timeRemaining = Math.max(0, 4.0 - stpTaskTime);
      writeStpLog(2, `Run ${stpTaskStep + 1}/4: Freq ${currentFreq} Hz, Load ${currentLoad} Nm (Time left: ${timeRemaining.toFixed(1)}s)`, false);

      const maxTq = Math.max(0, 20 - ((currentFreq / microStep) * 0.018));
      document.getElementById('stp2-maxtq-read').innerText = maxTq.toFixed(1) + ' N·m';

      // Check stall condition
      if (currentLoad > maxTq) {
        document.getElementById('stp2-status-read').innerText = 'STALLED (Step Loss)';
        document.getElementById('stp2-status-read').style.color = '#cc1111';
        stp3Stalled = true;
      } else {
        document.getElementById('stp2-status-read').innerText = 'OPERATIONAL';
        document.getElementById('stp2-status-read').style.color = '#aaffaa';
      }

      // Move toward target (180 degrees step input)
      let diff = stepTarget - stepActual;
      if (!stp3Stalled && Math.abs(diff) > 0.01) {
        const directionSign = Math.sign(diff);
        const motionIncrement = directionSign * (stepFreq * baseStepAngle) * dt;
        if (Math.abs(motionIncrement) >= Math.abs(diff)) {
          stepActual = stepTarget;
        } else {
          stepActual += motionIncrement;
        }
        accumulatedPulses += Math.round(Math.abs(motionIncrement) / baseStepAngle);
      }

      if (stpTaskTime >= 4.0) {
        const err = Math.abs(stepTarget - stepActual);
        const reachedSuccess = (err < 0.5 && !stp3Stalled) ? "Yes" : "No";
        const timeToPos = reachedSuccess === "Yes" ? (180 * microStep / (currentFreq * 1.8)) : "--";
        
        tableData.stepperTask2.push({
          freq: currentFreq,
          load: currentLoad,
          reached: reachedSuccess,
          time: timeToPos === "--" ? "--" : parseFloat(timeToPos),
          error: stp3Stalled ? "Stalled" : err
        });
        renderStepperTask2Table();

        writeStpLog(2, `Logged: Freq ${currentFreq} Hz, Load ${currentLoad} Nm, Reached: ${reachedSuccess}, Time: ${reachedSuccess === "Yes" ? parseFloat(timeToPos).toFixed(2) + 's' : '--'}, Error: ${stp3Stalled ? 'Stalled' : err.toFixed(2) + '°'}`);

        stpTaskStep++;
        stpTaskTime = 0;
        stp3Stalled = false;

        if (stpTaskStep >= 4) {
          activeStpTask = 'none';
          writeStpLog(2, "<b>[Task 2 Completed]</b>");
        } else {
          // Flip target for the next step to command another 180 degrees motion
          stepTarget = (stepTarget === 180) ? 0 : 180;
          accumulatedPulses = 0;
        }
      }
    }
    else if (activeStpTask === 'task3') {
      const peakFreq = parseInt(document.getElementById('ctrl-stp3-peak').value);
      const profile = document.getElementById('ctrl-stp3-profile').value;

      document.getElementById('lbl-stp3-peak').innerText = peakFreq + ' Hz';

      if (stpTaskTime <= 5.0) {
        // Ramp frequency
        if (profile === 'none') {
          stp3CmdFreq = peakFreq;
        } else if (profile === 'linear') {
          stp3CmdFreq = peakFreq * (stpTaskTime / 5.0);
        } else if (profile === 'scurve') {
          const tau = stpTaskTime / 5.0;
          stp3CmdFreq = peakFreq * (3 * tau * tau - 2 * tau * tau * tau);
        }

        // Determine stalling point
        let accTorque = 0;
        if (profile === 'none') accTorque = 0.03 * peakFreq;
        else if (profile === 'linear') accTorque = 0.0022 * peakFreq;
        else if (profile === 'scurve') accTorque = 0.0014 * peakFreq;

        const maxTq = 20 - (stp3CmdFreq * 0.018 / microStep);
        if (stepLoad + accTorque > maxTq && !stp3Stalled) {
          stp3Stalled = true;
          stp3StallFreq = stp3CmdFreq;
          writeStpLog(3, `<span style="color:#cc1111;">STALL DETECTED at ${stp3StallFreq.toFixed(0)} Hz (Time: ${stpTaskTime.toFixed(2)}s)</span>`);
        }

        if (stp3Stalled) {
          stp3ActFreq = 0;
        } else {
          stp3ActFreq = stp3CmdFreq;
        }

        // Accumulate Command and Actual pulses
        stp3CmdPulses += (stp3CmdFreq / baseStepAngle) * dt;
        stp3ActPulses += (stp3ActFreq / baseStepAngle) * dt;

        // Position changes according to actual pulses
        stepActual += (stp3ActFreq * baseStepAngle) * dt;

        stp3TrackingError = Math.round(stp3CmdPulses - stp3ActPulses);

        // Update readouts
        document.getElementById('stp3-cmd-freq').innerText = stp3CmdFreq.toFixed(0) + ' Hz';
        document.getElementById('stp3-act-freq').innerText = stp3ActFreq.toFixed(0) + ' Hz';
        document.getElementById('stp3-err-read').innerText = stp3TrackingError + ' pulses';
        document.getElementById('stp3-stall-read').innerText = stp3StallFreq === null ? '-- Hz' : stp3StallFreq.toFixed(0) + ' Hz';

        const timeRemaining = Math.max(0, 5.0 - stpTaskTime);
        writeStpLog(3, `Ramping: Cmd ${stp3CmdFreq.toFixed(0)} Hz | Act ${stp3ActFreq.toFixed(0)} Hz | Err ${stp3TrackingError} (Remaining: ${timeRemaining.toFixed(1)}s)`, false);

        // Push data to Chart history
        stp3CmdFreqHistory.push(stp3CmdFreq);
        stp3ActFreqHistory.push(stp3ActFreq);
        stp3CmdFreqHistory.shift();
        stp3ActFreqHistory.shift();
        accelChart.update('none');
      } else {
        // Task completed!
        const profileLabels = { none: 'No Ramp', linear: 'Linear', scurve: 'S-Curve' };
        tableData.stepperTask3.push({
          profile: profileLabels[profile],
          peakFreq: peakFreq,
          safe: stp3Stalled ? "No" : "Yes",
          stallFreq: stp3StallFreq,
          maxError: stp3TrackingError
        });
        renderStepperTask3Table();

        writeStpLog(3, `<b>[Task 3 Completed]</b> Profile: ${profileLabels[profile]} | Peak: ${peakFreq} Hz | Safe: ${stp3Stalled ? "No (Stalled)" : "Yes"} | Stall Freq: ${stp3StallFreq === null ? '--' : stp3StallFreq.toFixed(0) + ' Hz'} | Max Error: ${stp3TrackingError} pulses`);

        activeStpTask = 'none';
        stp3CmdFreq = 0;
        stp3ActFreq = 0;
      }
    }
  } else {
    // Normal Simulation Mode (Open Loop)
    let dynamicDisplacementDiff = stepTarget - stepActual;
    
    // Stall Check under normal operation
    const maxTq = Math.max(0, 20 - ((stepFreq / microStep) * 0.018));
    let normalStalled = (stepLoad > maxTq);

    if (Math.abs(dynamicDisplacementDiff) > 0.01 && !normalStalled) {
      let operationalFreq = stepFreq;
      if (faultStepLoss && Math.random() < 0.05) {
        operationalFreq *= 0.35; 
      }

      const directionSign = Math.sign(dynamicDisplacementDiff);
      const motionIncrement = directionSign * (operationalFreq * baseStepAngle) * dt;
      
      if (Math.abs(motionIncrement) >= Math.abs(dynamicDisplacementDiff)) {
        stepActual = stepTarget;
      } else {
        stepActual += motionIncrement;
      }

      accumulatedPulses += Math.round(Math.abs(motionIncrement) / baseStepAngle);
    }

    const outputCalculatedRpm = (stepFreq * 60) / (200 * microStep);
    
    // Update readouts for active tab
    if (currentStpTab === 'task1') {
      document.getElementById('stp1-tgt-read').innerText = stepTarget.toFixed(1) + '°';
      document.getElementById('stp1-act-read').innerText = stepActual.toFixed(1) + '°';
      document.getElementById('stp1-pulses-read').innerText = accumulatedPulses;
      document.getElementById('stp1-err-read').innerText = Math.abs(stepTarget - stepActual).toFixed(2) + '°';
    } else if (currentStpTab === 'task2') {
      document.getElementById('stp2-freq-read').innerText = stepFreq + ' Hz';
      document.getElementById('stp2-load-read').innerText = stepLoad.toFixed(1) + ' N·m';
      document.getElementById('stp2-maxtq-read').innerText = maxTq.toFixed(1) + ' N·m';
      document.getElementById('stp2-status-read').innerText = normalStalled ? 'STALLED (0.0 RPM)' : 'OPERATIONAL (' + outputCalculatedRpm.toFixed(1) + ' RPM)';
      document.getElementById('stp2-status-read').style.color = normalStalled ? '#cc1111' : '#aaffaa';
    }
  }

  const totalRadians = stepActual * Math.PI / 180;
  if (winchDrum) winchDrum.rotation.z = totalRadians;
  if (motorShaft) motorShaft.rotation.z = totalRadians;
  if (stepperConsoleDial) stepperConsoleDial.rotation.y = stepTarget * Math.PI / 180;
}

/* ---------------- Main Frame Processing Engine ---------------- */
const systemClock = new THREE.Clock();

function mainProcessingAnimationLoop() {
  requestAnimationFrame(mainProcessingAnimationLoop);
  const deltaDeltaTime = Math.min(systemClock.getDelta(), 0.05);

  if (systemActive) {
    if (currentTab === 'servo') {
      runServoLoop(deltaDeltaTime);
    } else {
      runStepperLoop(deltaDeltaTime);
    }
    
    // Animate flying data packets along signal curves
    activePackets.forEach(p => p.update(deltaDeltaTime));
  }

  // Live update of LCD screen
  if (has3D) {
    updateLcdTexture();
  }

  // Live update of oscilloscope screens
  updateOscilloscopeTraces();

  // Update anchor chain link positions dynamically
  if (currentTab === 'stepper' && has3D && chainLinks && chainLinks.length > 0) {
    // Calculate dynamic anchor payout based on stepActual (motor angle in degrees)
    const payout = stepActual * 0.005; // 0.005 units per degree
    const Y_ring = -0.1 - payout;
    const anchorY = Y_ring - 0.96;

    if (anchorGroup) {
      anchorGroup.position.set(3.5, anchorY, 1.2);
      anchorGroup.rotation.set(0, 0, 0); // hanging vertically
    }

    // Reconstruct the Catmull-Rom curve with the dynamic end point
    chainPath = new THREE.CatmullRomCurve3([
      new THREE.Vector3(3.5, -0.4, -0.8),         // Under deck (slot)
      new THREE.Vector3(3.5, 0.2, -0.4),          // Coming up to wildcat
      new THREE.Vector3(3.5, 0.88, 0.0),          // Wrapped over top of wildcat
      new THREE.Vector3(3.5, 0.15, 0.9),          // Draping forward to chock
      new THREE.Vector3(3.5, Y_ring, 1.2)         // Attaching to anchor ring shackle
    ]);

    const spacing = 0.062;
    let baseOffset = (stepActual * 0.0009) % 1.0;
    if (baseOffset < 0) baseOffset += 1.0;
    
    chainLinks.forEach(link => {
      let u = (baseOffset + link.index * spacing) % 1.0;
      if (u < 0) u += 1.0;
      
      const P = chainPath.getPointAt(u);
      const T = chainPath.getTangentAt(u);
      
      link.parent.position.copy(P);
      
      const defaultZ = new THREE.Vector3(0, 0, 1);
      link.parent.quaternion.setFromUnitVectors(defaultZ, T);
    });
  }

  // Update 3D Visual Fault Warning red glows and emissive materials (pulsating)
  if (has3D) {
    const pulseIntensity = 0.5 + 0.5 * Math.sin(Date.now() * 0.008);
    const emissiveColor = new THREE.Color(0xff0000);
    const blackColor = new THREE.Color(0x000000);

    // 1. Actuator Mechanical Stiction (Servo Motor)
    if (srvStictionGlow) {
      srvStictionGlow.intensity = faultStiction ? pulseIntensity * 4.0 : 0.0;
    }
    if (sg90BlueMat) {
      if (faultStiction) {
        sg90BlueMat.emissive.copy(emissiveColor);
        sg90BlueMat.emissiveIntensity = pulseIntensity * 0.6;
      } else {
        sg90BlueMat.emissive.copy(blackColor);
        sg90BlueMat.emissiveIntensity = 0.0;
      }
    }

    // 2. Command Line PWM Signal Interference (Arduino board / MCU area)
    if (srvNoiseGlow) {
      srvNoiseGlow.intensity = faultNoise ? pulseIntensity * 4.0 : 0.0;
    }
    if (arduinoBlueMat) {
      if (faultNoise) {
        arduinoBlueMat.emissive.copy(emissiveColor);
        arduinoBlueMat.emissiveIntensity = pulseIntensity * 0.6;
      } else {
        arduinoBlueMat.emissive.copy(blackColor);
        arduinoBlueMat.emissiveIntensity = 0.0;
      }
    }

    // 3. Synchronous Magnetic Step Slippage (Stepper Motor)
    if (stpLossGlow) {
      stpLossGlow.intensity = faultStepLoss ? pulseIntensity * 4.0 : 0.0;
    }
    if (plasticDark) {
      if (faultStepLoss) {
        plasticDark.emissive.copy(emissiveColor);
        plasticDark.emissiveIntensity = pulseIntensity * 0.6;
      } else {
        plasticDark.emissive.copy(blackColor);
        plasticDark.emissiveIntensity = 0.0;
      }
    }
  }

  if (has3D) {
    controls.update();
    renderer.render(scene, camera);
    if (labelRenderer) labelRenderer.render(scene, camera);
  }

  // Render 3D rudder angle indicator
  if (hasIndicator) {
    indicatorRenderer.render(indicatorScene, indicatorCamera);
  }

  // Render 3D propeller & rudder assembly
  if (hasPropRudder) {
    propRudderControls.update();
    propRudderRenderer.render(propRudderScene, propRudderCamera);
  }
}
requestAnimationFrame(mainProcessingAnimationLoop);

/* ---------------- UI Event Intercept Handlers ---------------- */
const tabBtn1 = document.getElementById('tab-1');
const tabBtn2 = document.getElementById('tab-2');
const blockPanel1 = document.getElementById('content-tab-1');
const blockPanel2 = document.getElementById('content-tab-2');

tabBtn1.onclick = () => {
  currentTab = 'servo';
  tabBtn1.style.background = 'var(--ink)'; tabBtn1.style.color = 'var(--paper)';
  tabBtn2.style.background = 'var(--paper)'; tabBtn2.style.color = 'var(--text)';
  blockPanel1.style.display = 'block'; blockPanel2.style.display = 'none';
  document.getElementById('hud-formula').innerHTML = "u(t) = K<sub>p</sub> · e(t)";
  
  // Restore 3-panel split layout for servo steering gear
  const propRudderPanel = document.getElementById('propeller-rudder-3d-host');
  const indicatorPanel = document.getElementById('rudder-indicator-host');
  const gridLayout = document.getElementById('illustration-grid');
  if (propRudderPanel) propRudderPanel.style.display = 'block';
  if (indicatorPanel) indicatorPanel.style.display = 'block';
  if (gridLayout) {
    gridLayout.style.gridTemplateColumns = '1.2fr 1fr';
    gridLayout.classList.remove('stepper-mode');
  }
  
  if (servoChainGroup) servoChainGroup.visible = true;
  if (stepperChainGroup) stepperChainGroup.visible = false;
  initDataPackets();

  // Show servo labels, hide stepper labels
  servoLabels.forEach(l => l.visible = true);
  stepperLabels.forEach(l => l.visible = false);

  // Reset camera controls position for Servo layout
  const camControls = document.getElementById('camera-controls-container');
  if (camControls) camControls.style.top = '12px';
  
  // Force Immediate canvas refit
  if (has3D) requestAnimationFrame(windowBoundsReflow);
};

tabBtn2.onclick = () => {
  currentTab = 'stepper';
  tabBtn2.style.background = 'var(--ink)'; tabBtn2.style.color = 'var(--paper)';
  tabBtn1.style.background = 'var(--paper)'; tabBtn1.style.color = 'var(--text)';
  blockPanel2.style.display = 'block'; blockPanel1.style.display = 'none';
  document.getElementById('hud-formula').innerHTML = "Pulse Step Index Mode";
  
  // Reflow to single full-width panel for stepper winch
  const propRudderPanel = document.getElementById('propeller-rudder-3d-host');
  const indicatorPanel = document.getElementById('rudder-indicator-host');
  const gridLayout = document.getElementById('illustration-grid');
  if (propRudderPanel) propRudderPanel.style.display = 'none';
  if (indicatorPanel) indicatorPanel.style.display = 'none';
  if (gridLayout) {
    gridLayout.style.gridTemplateColumns = '1fr';
    gridLayout.classList.add('stepper-mode');
  }
  
  if (servoChainGroup) servoChainGroup.visible = false;
  if (stepperChainGroup) stepperChainGroup.visible = true;
  initDataPackets();

  // Hide servo labels, show stepper labels
  servoLabels.forEach(l => l.visible = false);
  stepperLabels.forEach(l => l.visible = true);

  // Move camera controls down to avoid overlapping the Control Law HUD in full-width layout
  const camControls = document.getElementById('camera-controls-container');
  if (camControls) camControls.style.top = '56px';
  
  // Force Immediate canvas refit
  if (has3D) requestAnimationFrame(windowBoundsReflow);
};

// Data Binding Inputs: Servo
const ctrlSrvAngle = document.getElementById('ctrl-srv-angle');
if (ctrlSrvAngle) {
  ctrlSrvAngle.oninput = (e) => {
    const val = parseFloat(e.target.value);
    servoTarget = val;
    const lbl = document.getElementById('lbl-srv-angle');
    if (lbl) lbl.innerText = Math.round(val) + '°';
  };
}

const ctrlSrvLoad = document.getElementById('ctrl-srv-load');
if (ctrlSrvLoad) {
  ctrlSrvLoad.oninput = (e) => {
    servoLoad = parseFloat(e.target.value);
    const lbl = document.getElementById('lbl-srv-load');
    if (lbl) lbl.innerText = e.target.value + ' N·cm';
  };
}

// Sub-tab Navigation for Stepper Motor
const stpTabBtn1 = document.getElementById('stp-tab-1');
const stpTabBtn2 = document.getElementById('stp-tab-2');
const stpTabBtn3 = document.getElementById('stp-tab-3');
const stpBlockPanel1 = document.getElementById('stp-content-tab-1');
const stpBlockPanel2 = document.getElementById('stp-content-tab-2');
const stpBlockPanel3 = document.getElementById('stp-content-tab-3');

if (stpTabBtn1 && stpTabBtn2 && stpTabBtn3 && stpBlockPanel1 && stpBlockPanel2 && stpBlockPanel3) {
  stpTabBtn1.onclick = () => {
    currentStpTab = 'task1';
    stpTabBtn1.style.background = 'var(--ink)'; stpTabBtn1.style.color = 'var(--paper)';
    stpTabBtn2.style.background = 'var(--paper)'; stpTabBtn2.style.color = 'var(--text)';
    stpTabBtn3.style.background = 'var(--paper)'; stpTabBtn3.style.color = 'var(--text)';
    stpBlockPanel1.style.display = 'block';
    stpBlockPanel2.style.display = 'none';
    stpBlockPanel3.style.display = 'none';
  };

  stpTabBtn2.onclick = () => {
    currentStpTab = 'task2';
    stpTabBtn2.style.background = 'var(--ink)'; stpTabBtn2.style.color = 'var(--paper)';
    stpTabBtn1.style.background = 'var(--paper)'; stpTabBtn1.style.color = 'var(--text)';
    stpTabBtn3.style.background = 'var(--paper)'; stpTabBtn3.style.color = 'var(--text)';
    stpBlockPanel2.style.display = 'block';
    stpBlockPanel1.style.display = 'none';
    stpBlockPanel3.style.display = 'none';
    if (torqueChart) torqueChart.update();
  };

  stpTabBtn3.onclick = () => {
    currentStpTab = 'task3';
    stpTabBtn3.style.background = 'var(--ink)'; stpTabBtn3.style.color = 'var(--paper)';
    stpTabBtn1.style.background = 'var(--paper)'; stpTabBtn1.style.color = 'var(--text)';
    stpTabBtn2.style.background = 'var(--paper)'; stpTabBtn2.style.color = 'var(--text)';
    stpBlockPanel3.style.display = 'block';
    stpBlockPanel1.style.display = 'none';
    stpBlockPanel2.style.display = 'none';
    if (accelChart) accelChart.update();
  };
}

// Data Binding Inputs: Stepper Sub-Tabs
const ctrlStp1Angle = document.getElementById('ctrl-stp1-angle');
if (ctrlStp1Angle) {
  ctrlStp1Angle.oninput = (e) => {
    stepTarget = parseFloat(e.target.value);
    const lbl = document.getElementById('lbl-stp1-angle');
    if (lbl) lbl.innerText = e.target.value + '°';
  };
}

const ctrlStp1Micro = document.getElementById('ctrl-stp1-micro');
if (ctrlStp1Micro) {
  ctrlStp1Micro.onchange = (e) => {
    microStep = parseInt(e.target.value);
    const baseStepAngle = 1.8 / microStep;
    const read = document.getElementById('stp1-res-read');
    if (read) read.innerText = baseStepAngle.toFixed(3) + '°';
  };
}

const ctrlStp2Freq = document.getElementById('ctrl-stp2-freq');
if (ctrlStp2Freq) {
  ctrlStp2Freq.oninput = (e) => {
    stepFreq = parseInt(e.target.value);
    const lbl = document.getElementById('lbl-stp2-freq');
    if (lbl) lbl.innerText = e.target.value + ' Hz';
  };
}

const ctrlStp2Load = document.getElementById('ctrl-stp2-load');
if (ctrlStp2Load) {
  ctrlStp2Load.oninput = (e) => {
    stepLoad = parseFloat(e.target.value);
    const lbl = document.getElementById('lbl-stp2-load');
    if (lbl) lbl.innerText = e.target.value + ' N·m';
  };
}

const ctrlStp3Peak = document.getElementById('ctrl-stp3-peak');
if (ctrlStp3Peak) {
  ctrlStp3Peak.oninput = (e) => {
    const lbl = document.getElementById('lbl-stp3-peak');
    if (lbl) lbl.innerText = e.target.value + ' Hz';
  };
}

// Preset discrete target buttons (Task 1)
const btnStpT1_0 = document.getElementById('btn-stp-t1-0');
if (btnStpT1_0) {
  btnStpT1_0.onclick = () => {
    stepTarget = 0;
    const ctrl = document.getElementById('ctrl-stp1-angle');
    if (ctrl) ctrl.value = 0;
    const lbl = document.getElementById('lbl-stp1-angle');
    if (lbl) lbl.innerText = '0°';
  };
}
const btnStpT1_90 = document.getElementById('btn-stp-t1-90');
if (btnStpT1_90) {
  btnStpT1_90.onclick = () => {
    stepTarget = 90;
    const ctrl = document.getElementById('ctrl-stp1-angle');
    if (ctrl) ctrl.value = 90;
    const lbl = document.getElementById('lbl-stp1-angle');
    if (lbl) lbl.innerText = '90°';
  };
}
const btnStpT1_180 = document.getElementById('btn-stp-t1-180');
if (btnStpT1_180) {
  btnStpT1_180.onclick = () => {
    stepTarget = 180;
    const ctrl = document.getElementById('ctrl-stp1-angle');
    if (ctrl) ctrl.value = 180;
    const lbl = document.getElementById('lbl-stp1-angle');
    if (lbl) lbl.innerText = '180°';
  };
}
const btnStpT1_270 = document.getElementById('btn-stp-t1-270');
if (btnStpT1_270) {
  btnStpT1_270.onclick = () => {
    stepTarget = 270;
    const ctrl = document.getElementById('ctrl-stp1-angle');
    if (ctrl) ctrl.value = 270;
    const lbl = document.getElementById('lbl-stp1-angle');
    if (lbl) lbl.innerText = '270°';
  };
}

// Automation Task Button triggers
const btnStp1RunTask = document.getElementById('btn-stp1-run-task');
if (btnStp1RunTask) {
  btnStp1RunTask.onclick = () => {
    if (!systemActive) sharedToggleRun();
    activeStpTask = 'task1';
    stpTaskTime = 0;
    stpTaskStep = 0;
    accumulatedPulses = 0;
    stepActual = 0;
    tableData.stepperTask1 = [];
    renderStepperTask1Table();
    writeStpLog(1, "<b>[Task 1 Protocol Started]</b><br>Moving to 0°→90°→180°→270°→0°...", false);
  };
}

const btnStp2RunTask = document.getElementById('btn-stp2-run-task');
if (btnStp2RunTask) {
  btnStp2RunTask.onclick = () => {
    if (!systemActive) sharedToggleRun();
    activeStpTask = 'task2';
    stpTaskTime = 0;
    stpTaskStep = 0;
    accumulatedPulses = 0;
    stepActual = 0;
    stepTarget = 180; // command 180 deg displacement
    tableData.stepperTask2 = [];
    renderStepperTask2Table();
    writeStpLog(2, "<b>[Task 2 Protocol Started]</b><br>Testing Freq/Torque Envelope...", false);
  };
}

const btnStp3RunTask = document.getElementById('btn-stp3-run-task');
if (btnStp3RunTask) {
  btnStp3RunTask.onclick = () => {
    if (!systemActive) sharedToggleRun();
    activeStpTask = 'task3';
    stpTaskTime = 0;
    stpTaskStep = 0;
    stp3CmdPulses = 0;
    stp3ActPulses = 0;
    stepActual = 0;
    stp3Stalled = false;
    stp3StallFreq = null;
    // Reset transient graph history
    stp3CmdFreqHistory.fill(0);
    stp3ActFreqHistory.fill(0);
    if (accelChart) accelChart.update();
    writeStpLog(3, "<b>[Task 3 Protocol Started]</b><br>Ramping frequency from 0 to peak Hz...", false);
  };
}

// Fault bindings
const chkSrvStiction = document.getElementById('chk-srv-stiction');
if (chkSrvStiction) chkSrvStiction.onchange = (e) => { faultStiction = e.target.checked; };
const chkSrvNoise = document.getElementById('chk-srv-noise');
if (chkSrvNoise) chkSrvNoise.onchange = (e) => { faultNoise = e.target.checked; };
const chkStpLoss = document.getElementById('chk-stp-loss');
if (chkStpLoss) chkStpLoss.onchange = (e) => { faultStepLoss = e.target.checked; };

// Run/Pause triggers
const runSrvBtn = document.getElementById('btn-srv-run');
const runStpBtn = document.getElementById('btn-stp-run');

function sharedToggleRun() {
  systemActive = !systemActive;
  const currentLabel = systemActive ? "Pause Core Simulation" : "Run System Simulation";
  if (runSrvBtn) {
    runSrvBtn.innerText = currentLabel;
    runSrvBtn.style.background = systemActive ? '#2a5a2a' : 'var(--rust)';
  }
  if (runStpBtn) {
    runStpBtn.innerText = currentLabel;
    runStpBtn.style.background = systemActive ? '#2a5a2a' : 'var(--rust)';
  }
}
if (runSrvBtn) runSrvBtn.onclick = sharedToggleRun;
if (runStpBtn) runStpBtn.onclick = sharedToggleRun;

// View helpers (only if 3D mode is active)
if (has3D) {
  const btnSpin = document.getElementById('btnSpin');
  const btnReset = document.getElementById('btnReset');
  if (btnSpin) {
    btnSpin.onclick = (e) => {
      controls.autoRotate = !controls.autoRotate;
      e.target.classList.toggle('active', controls.autoRotate);
    };
  }
  if (btnReset) {
    btnReset.onclick = () => {
      controls.autoRotate = false;
      if (btnSpin) btnSpin.classList.remove('active');
      camera.position.set(0, 7, 13);
      controls.target.set(0, 1.2, 0);
      controls.update();
    };
  }
}

// CSV Export Utilities
function triggerCSVExport(filename, headerArray, contentData) {
  let rowsStrings = [headerArray.join(",")];
  contentData.forEach(r => rowsStrings.push(r.join(",")));
  const blob = new Blob([rowsStrings.join("\n")], { type: 'text/csv' });
  const downloadUrl = window.URL.createObjectURL(blob);
  const triggerAnchor = document.createElement('a');
  triggerAnchor.setAttribute('href', downloadUrl);
  triggerAnchor.setAttribute('download', filename);
  document.body.appendChild(triggerAnchor);
  triggerAnchor.click();
  document.body.removeChild(triggerAnchor);
}

document.getElementById('btn-srv-csv').onclick = () => {
  let constructedRows = [];
  for (let i = 0; i < historyInterval; i++) {
    if (trackingDataTarget[i] !== null) constructedRows.push([i, trackingDataTarget[i].toFixed(1), trackingDataActual[i].toFixed(1)]);
  }
  triggerCSVExport('servo_steering_wheel_metrics.csv', ['"Timeframe Index"', '"Helm Command (Deg)"', '"Rudder Pivot (Deg)"'], constructedRows);
};

function windowBoundsReflow() {
  if (!has3D) return;
  W = host.clientWidth; H = host.clientHeight;
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
  renderer.setSize(W, H);
  if (labelRenderer) labelRenderer.setSize(W, H);
}

if (has3D) {
  window.addEventListener('resize', windowBoundsReflow);
  if (window.ResizeObserver) {
    new ResizeObserver(windowBoundsReflow).observe(host);
  }

  // Sub-tab Navigation for Servo Motor
  const srvTabBtn1 = document.getElementById('srv-tab-1');
  const srvTabBtn2 = document.getElementById('srv-tab-2');
  const srvTabBtn3 = document.getElementById('srv-tab-3');
  const srvBlockPanel1 = document.getElementById('srv-content-tab-1');
  const srvBlockPanel2 = document.getElementById('srv-content-tab-2');
  const srvBlockPanel3 = document.getElementById('srv-content-tab-3');

  if (srvTabBtn1 && srvTabBtn2 && srvTabBtn3) {
    srvTabBtn1.onclick = () => {
      currentSrvTab = 'task1';
      srvTabBtn1.style.background = 'var(--ink)'; srvTabBtn1.style.color = 'var(--paper)';
      srvTabBtn2.style.background = 'var(--paper)'; srvTabBtn2.style.color = 'var(--text)';
      srvTabBtn3.style.background = 'var(--paper)'; srvTabBtn3.style.color = 'var(--text)';
      srvBlockPanel1.style.display = 'block';
      srvBlockPanel2.style.display = 'none';
      srvBlockPanel3.style.display = 'none';
    };

    srvTabBtn2.onclick = () => {
      currentSrvTab = 'task2';
      srvTabBtn2.style.background = 'var(--ink)'; srvTabBtn2.style.color = 'var(--paper)';
      srvTabBtn1.style.background = 'var(--paper)'; srvTabBtn1.style.color = 'var(--text)';
      srvTabBtn3.style.background = 'var(--paper)'; srvTabBtn3.style.color = 'var(--text)';
      srvBlockPanel2.style.display = 'block';
      srvBlockPanel1.style.display = 'none';
      srvBlockPanel3.style.display = 'none';
      if (trackingChart) trackingChart.update();
    };

    srvTabBtn3.onclick = () => {
      currentSrvTab = 'task3';
      srvTabBtn3.style.background = 'var(--ink)'; srvTabBtn3.style.color = 'var(--paper)';
      srvTabBtn1.style.background = 'var(--paper)'; srvTabBtn1.style.color = 'var(--text)';
      srvTabBtn2.style.background = 'var(--paper)'; srvTabBtn2.style.color = 'var(--text)';
      srvBlockPanel3.style.display = 'block';
      srvBlockPanel1.style.display = 'none';
      srvBlockPanel2.style.display = 'none';
    };
  }

  // Synchronized Gain Sliders for Servo Tasks
  function updateServoKp(value) {
    servoKp = parseInt(value);
    ['ctrl-srv-kp1', 'ctrl-srv-kp2', 'ctrl-srv-kp3'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = value;
    });
    ['lbl-srv-kp1', 'lbl-srv-kp2', 'lbl-srv-kp3'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerText = value;
    });
  }

  ['ctrl-srv-kp1', 'ctrl-srv-kp2', 'ctrl-srv-kp3'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.oninput = (e) => updateServoKp(e.target.value);
    }
  });

  // Task 1 Preset target angles buttons
  const presetAngles = [0, 45, 90, 135, 180];
  presetAngles.forEach(angle => {
    const btn = document.getElementById(`btn-srv-t1-${angle}`);
    if (btn) {
      btn.onclick = () => {
        servoTarget = angle;
        const srvSlider = document.getElementById('ctrl-srv-angle');
        if (srvSlider) srvSlider.value = angle;
        const lbl = document.getElementById('lbl-srv-angle');
        if (lbl) lbl.innerText = angle + '°';
      };
    }
  });

  // Task Button Click Handlers
  const btnTask1 = document.getElementById('btn-task-1');
  const btnTask2 = document.getElementById('btn-task-2');
  const btnTask3 = document.getElementById('btn-task-3');

  if (btnTask1) {
    btnTask1.onclick = () => {
      if (!systemActive) sharedToggleRun();
      activeTask = 'task1';
      taskTime = 0;
      taskStep = 0;
      taskLog = [];
      
      // Auto switch to Task 1 sub-tab
      if (srvTabBtn1) srvTabBtn1.click();
      
      tableData.task1 = [
        { target: 0, t1_act: null, t1_err: null, t2_act: null, t2_err: null, t3_act: null, t3_err: null, avg_err: null },
        { target: 45, t1_act: null, t1_err: null, t2_act: null, t2_err: null, t3_act: null, t3_err: null, avg_err: null },
        { target: 90, t1_act: null, t1_err: null, t2_act: null, t2_err: null, t3_act: null, t3_err: null, avg_err: null },
        { target: 135, t1_act: null, t1_err: null, t2_act: null, t2_err: null, t3_act: null, t3_err: null, avg_err: null },
        { target: 180, t1_act: null, t1_err: null, t2_act: null, t2_err: null, t3_act: null, t3_err: null, avg_err: null }
      ];
      renderServoTable();
      writeLog("<b>[Task 1 Started]</b> Static Positioning Accuracy.<br>Setting discrete targets...", false);
    };
  }

  if (btnTask2) {
    btnTask2.onclick = () => {
      if (!systemActive) sharedToggleRun();
      activeTask = 'task2';
      taskTime = 0;
      taskStep = 0;
      taskLog = [];
      
      // Auto switch to Task 2 sub-tab
      if (srvTabBtn2) srvTabBtn2.click();
      
      tableData.task2 = [];
      renderServoTable();
      writeLog("<b>[Task 2 Started]</b> Dynamic Response Characterization.<br>Sweeping 0° to 180° over 10s...", false);
    };
  }

  if (btnTask3) {
    btnTask3.onclick = () => {
      if (!systemActive) sharedToggleRun();
      activeTask = 'task3';
      taskTime = 0;
      taskStep = 0;
      taskLog = [];
      
      // Auto switch to Task 3 sub-tab
      if (srvTabBtn3) srvTabBtn3.click();
      
      tableData.task3 = [
        { load: 0, target: 135, actual: null, settling: null, error: null, status: null },
        { load: 16, target: 135, actual: null, settling: null, error: null, status: null },
        { load: 32, target: 135, actual: null, settling: null, error: null, status: null },
        { load: 48, target: 135, actual: null, settling: null, error: null, status: null }
      ];
      renderServoTable();
      writeLog("<b>[Task 3 Started]</b> Load Effect on Servo.<br>Applying friction torque steps...", false);
    };
  }

  // Render tables initially
  renderServoTable();
  renderStepperTask1Table();
  renderStepperTask2Table();
  renderStepperTask3Table();

  // Task 1 Table Buttons
  const btnSrvT1Record = document.getElementById('btn-srv-t1-record');
  if (btnSrvT1Record) {
    btnSrvT1Record.onclick = () => {
      const currentAngleVal = Math.round(servoTarget);
      const angles = [0, 45, 90, 135, 180];
      let nearest = angles[0];
      let minDiff = Math.abs(currentAngleVal - angles[0]);
      angles.forEach(a => {
        if (Math.abs(currentAngleVal - a) < minDiff) {
          minDiff = Math.abs(currentAngleVal - a);
          nearest = a;
        }
      });

      const row = tableData.task1.find(r => r.target === nearest);
      if (row) {
        const err = Math.abs(nearest - servoActual);
        let cellId = '';
        if (row.t1_act === null) {
          row.t1_act = servoActual;
          row.t1_err = err;
          cellId = 't1act';
        } else if (row.t2_act === null) {
          row.t2_act = servoActual;
          row.t2_err = err;
          cellId = 't2act';
        } else if (row.t3_act === null) {
          row.t3_act = servoActual;
          row.t3_err = err;
          cellId = 't3act';
        } else {
          row.t1_act = servoActual;
          row.t1_err = err;
          row.t2_act = null;
          row.t2_err = null;
          row.t3_act = null;
          row.t3_err = null;
          row.avg_err = null;
          cellId = 't1act';
        }

        if (row.t1_act !== null && row.t2_act !== null && row.t3_act !== null) {
          row.avg_err = (row.t1_err + row.t2_err + row.t3_err) / 3;
        }
        renderServoTable();

        const targetIdx = tableData.task1.findIndex(r => r.target === nearest);
        const cellEl = document.getElementById(`srv-t1-cell-${targetIdx}-${cellId}`);
        if (cellEl) {
          cellEl.style.background = "rgba(95, 214, 239, 0.4)";
          setTimeout(() => cellEl.style.background = "transparent", 600);
        }
      }
    };
  }

  const btnSrvT1Reset = document.getElementById('btn-srv-t1-reset');
  if (btnSrvT1Reset) {
    btnSrvT1Reset.onclick = () => {
      tableData.task1 = [
        { target: 0, t1_act: null, t1_err: null, t2_act: null, t2_err: null, t3_act: null, t3_err: null, avg_err: null },
        { target: 45, t1_act: null, t1_err: null, t2_act: null, t2_err: null, t3_act: null, t3_err: null, avg_err: null },
        { target: 90, t1_act: null, t1_err: null, t2_act: null, t2_err: null, t3_act: null, t3_err: null, avg_err: null },
        { target: 135, t1_act: null, t1_err: null, t2_act: null, t2_err: null, t3_act: null, t3_err: null, avg_err: null },
        { target: 180, t1_act: null, t1_err: null, t2_act: null, t2_err: null, t3_act: null, t3_err: null, avg_err: null }
      ];
      renderServoTable();
    };
  }

  const btnSrvT1Export = document.getElementById('btn-srv-t1-export');
  if (btnSrvT1Export) {
    btnSrvT1Export.onclick = () => {
      let headers = ['"Target Angle (Deg)"', '"Trial 1 Actual"', '"Trial 1 Error"', '"Trial 2 Actual"', '"Trial 2 Error"', '"Trial 3 Actual"', '"Trial 3 Error"', '"Average Error"'];
      let rows = tableData.task1.map(r => [
        r.target,
        r.t1_act !== null ? r.t1_act.toFixed(1) : '--',
        r.t1_err !== null ? r.t1_err.toFixed(2) : '--',
        r.t2_act !== null ? r.t2_act.toFixed(1) : '--',
        r.t2_err !== null ? r.t2_err.toFixed(2) : '--',
        r.t3_act !== null ? r.t3_act.toFixed(1) : '--',
        r.t3_err !== null ? r.t3_err.toFixed(2) : '--',
        r.avg_err !== null ? r.avg_err.toFixed(2) : '--'
      ]);
      triggerCSVExport('servo_static_accuracy.csv', headers, rows);
    };
  }

  // Task 2 Table Buttons
  const btnSrvT2Record = document.getElementById('btn-srv-t2-record');
  if (btnSrvT2Record) {
    btnSrvT2Record.onclick = () => {
      const elapsed = activeTask === 'task2' ? taskTime : 0;
      const err = Math.abs(servoTarget - servoActual);
      tableData.task2.push({
        time: elapsed,
        target: servoTarget,
        actual: servoActual,
        error: err
      });
      renderServoTable();
      const tableDiv = document.getElementById('srv-t2-data-table').parentElement;
      if (tableDiv) tableDiv.scrollTop = tableDiv.scrollHeight;
    };
  }

  const btnSrvT2Reset = document.getElementById('btn-srv-t2-reset');
  if (btnSrvT2Reset) {
    btnSrvT2Reset.onclick = () => {
      tableData.task2 = [];
      renderServoTable();
    };
  }

  const btnSrvT2Export = document.getElementById('btn-srv-t2-export');
  if (btnSrvT2Export) {
    btnSrvT2Export.onclick = () => {
      let headers = ['"Time (s)"', '"Commanded (Deg)"', '"Actual (Deg)"', '"Lag Error (Deg)"'];
      let rows = tableData.task2.map(r => [
        r.time.toFixed(2),
        r.target.toFixed(1),
        r.actual.toFixed(1),
        r.error.toFixed(2)
      ]);
      triggerCSVExport('servo_dynamic_tracking.csv', headers, rows);
    };
  }

  // Task 3 Table Buttons
  const btnSrvT3Record = document.getElementById('btn-srv-t3-record');
  if (btnSrvT3Record) {
    btnSrvT3Record.onclick = () => {
      const currentLoadVal = servoLoad;
      const loads = [0, 16, 32, 48];
      let nearest = loads[0];
      let minDiff = Math.abs(currentLoadVal - loads[0]);
      loads.forEach(l => {
        if (Math.abs(currentLoadVal - l) < minDiff) {
          minDiff = Math.abs(currentLoadVal - l);
          nearest = l;
        }
      });

      const row = tableData.task3.find(r => r.load === nearest);
      if (row) {
        const err = Math.abs(135 - servoActual);
        row.actual = servoActual;
        row.error = err;
        row.settling = 1.2; 
        if (err < 3.5) row.status = 'Pass';
        else if (err < 12.0) row.status = 'Slip';
        else row.status = 'Fail';

        renderServoTable();

        const targetIdx = tableData.task3.findIndex(r => r.load === nearest);
        const cellEl = document.getElementById(`srv-t3-cell-${targetIdx}-act`);
        if (cellEl) {
          cellEl.style.background = "rgba(95, 214, 239, 0.4)";
          setTimeout(() => cellEl.style.background = "transparent", 600);
        }
      }
    };
  }

  const btnSrvT3Reset = document.getElementById('btn-srv-t3-reset');
  if (btnSrvT3Reset) {
    btnSrvT3Reset.onclick = () => {
      tableData.task3 = [
        { load: 0, target: 135, actual: null, settling: null, error: null, status: null },
        { load: 16, target: 135, actual: null, settling: null, error: null, status: null },
        { load: 32, target: 135, actual: null, settling: null, error: null, status: null },
        { load: 48, target: 135, actual: null, settling: null, error: null, status: null }
      ];
      renderServoTable();
    };
  }

  const btnSrvT3Export = document.getElementById('btn-srv-t3-export');
  if (btnSrvT3Export) {
    btnSrvT3Export.onclick = () => {
      let headers = ['"Load (Ncm)"', '"Target (Deg)"', '"Actual (Deg)"', '"Settling Time (s)"', '"Settled Error (Deg)"', '"Status"'];
      let rows = tableData.task3.map(r => [
        r.load,
        r.target,
        r.actual !== null ? r.actual.toFixed(1) : '--',
        r.settling !== null ? r.settling.toFixed(2) : '--',
        r.error !== null ? r.error.toFixed(2) : '--',
        r.status !== null ? `"${r.status}"` : '--'
      ]);
      triggerCSVExport('servo_load_effect_analysis.csv', headers, rows);
    };
  }

  // Stepper Task 1 Table Buttons
  const btnStp1Record = document.getElementById('btn-stp1-record');
  if (btnStp1Record) {
    btnStp1Record.onclick = () => {
      const err = Math.abs(stepTarget - stepActual);
      tableData.stepperTask1.push({
        target: stepTarget,
        actual: stepActual,
        pulses: accumulatedPulses,
        res: 1.8 / microStep,
        error: err
      });
      renderStepperTask1Table();
      const tableDiv = document.getElementById('stp1-data-table').parentElement;
      if (tableDiv) tableDiv.scrollTop = tableDiv.scrollHeight;
    };
  }

  const btnStp1Reset = document.getElementById('btn-stp1-reset');
  if (btnStp1Reset) {
    btnStp1Reset.onclick = () => {
      tableData.stepperTask1 = [];
      renderStepperTask1Table();
    };
  }

  const btnStp1Export = document.getElementById('btn-stp1-export');
  if (btnStp1Export) {
    btnStp1Export.onclick = () => {
      let headers = ['"Target Angle (Deg)"', '"Actual Angle (Deg)"', '"Encoder Pulses"', '"Resolution (Deg)"', '"Positional Error (Deg)"'];
      let rows = tableData.stepperTask1.map(r => [
        r.target.toFixed(1),
        r.actual.toFixed(1),
        r.pulses,
        r.res.toFixed(3),
        r.error.toFixed(2)
      ]);
      triggerCSVExport('stepper_task1_accuracy.csv', headers, rows);
    };
  }

  // Stepper Task 2 Table Buttons
  const btnStp2Record = document.getElementById('btn-stp2-record');
  if (btnStp2Record) {
    btnStp2Record.onclick = () => {
      const err = Math.abs(stepTarget - stepActual);
      const maxTq = Math.max(0, 20 - ((stepFreq / microStep) * 0.018));
      const isStalled = (stepLoad > maxTq);
      const reachedSuccess = (err < 0.5 && !isStalled) ? "Yes" : "No";
      const timeToPos = reachedSuccess === "Yes" ? (180 * microStep / (stepFreq * 1.8)) : "--";

      tableData.stepperTask2.push({
        freq: stepFreq,
        load: stepLoad,
        reached: reachedSuccess,
        time: timeToPos === "--" ? "--" : parseFloat(timeToPos),
        error: isStalled ? "Stalled" : err
      });
      renderStepperTask2Table();
      const tableDiv = document.getElementById('stp2-data-table').parentElement;
      if (tableDiv) tableDiv.scrollTop = tableDiv.scrollHeight;
    };
  }

  const btnStp2Reset = document.getElementById('btn-stp2-reset');
  if (btnStp2Reset) {
    btnStp2Reset.onclick = () => {
      tableData.stepperTask2 = [];
      renderStepperTask2Table();
    };
  }

  const btnStp2Export = document.getElementById('btn-stp2-export');
  if (btnStp2Export) {
    btnStp2Export.onclick = () => {
      let headers = ['"Step Freq (Hz)"', '"Brake Load (Nm)"', '"Reached Target"', '"Time to Position (s)"', '"Position Error (Deg)"'];
      let rows = tableData.stepperTask2.map(r => [
        r.freq,
        r.load,
        `"${r.reached}"`,
        r.time === '--' ? '--' : r.time.toFixed(2),
        r.error === 'Stalled' ? '"Stalled"' : r.error.toFixed(2)
      ]);
      triggerCSVExport('stepper_task2_torque_speed.csv', headers, rows);
    };
  }

  // Stepper Task 3 Table Buttons
  const btnStp3Record = document.getElementById('btn-stp3-record');
  if (btnStp3Record) {
    btnStp3Record.onclick = () => {
      const profile = document.getElementById('ctrl-stp3-profile').value;
      const peakFreq = parseInt(document.getElementById('ctrl-stp3-peak').value);
      const profileLabels = { none: 'No Ramp', linear: 'Linear', scurve: 'S-Curve' };

      tableData.stepperTask3.push({
        profile: profileLabels[profile],
        peakFreq: peakFreq,
        safe: stp3Stalled ? "No" : "Yes",
        stallFreq: stp3StallFreq,
        maxError: stp3TrackingError
      });
      renderStepperTask3Table();
      const tableDiv = document.getElementById('stp3-data-table').parentElement;
      if (tableDiv) tableDiv.scrollTop = tableDiv.scrollHeight;
    };
  }

  const btnStp3Reset = document.getElementById('btn-stp3-reset');
  if (btnStp3Reset) {
    btnStp3Reset.onclick = () => {
      tableData.stepperTask3 = [];
      renderStepperTask3Table();
    };
  }

  const btnStp3Export = document.getElementById('btn-stp3-export');
  if (btnStp3Export) {
    btnStp3Export.onclick = () => {
      let headers = ['"Ramp Profile"', '"Peak Frequency (Hz)"', '"Safe (No Stall)"', '"Stall Frequency (Hz)"', '"Max Tracking Error"'];
      let rows = tableData.stepperTask3.map(r => [
        `"${r.profile}"`,
        r.peakFreq,
        `"${r.safe}"`,
        r.stallFreq === null ? '--' : r.stallFreq.toFixed(0),
        r.maxError
      ]);
      triggerCSVExport('stepper_task3_acceleration.csv', headers, rows);
    };
  }
}

// System init logic
(function(){var d=document,h=d.head,m1=d.createElement('meta'),m2=d.createElement('meta'),m3=d.createElement('meta');m1.name='author';m1.content='Alan Joseph Monichan, Alisha Joy A';m2.name='description';m2.content='Virtual Marine Engineering Lab Simulation. Developed for educational marine instrumentation training.';m3.name='keywords';m3.content='marine engineering, virtual lab, simulation, maritime training';h.appendChild(m1);h.appendChild(m2);h.appendChild(m3);})();
