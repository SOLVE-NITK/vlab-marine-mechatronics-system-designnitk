/* ================================================================
   GLOBALS & SIMULATION STATE
================================================================ */
let scene, camera, renderer, clock;
let tankWater, tankWaterMat, tankSurface, tankSurfaceMat, gaugePointer, gateValveWheel, alarmBeacon;
let sensorProbes = []; // To store probe meshes for animation
let oceanMesh, foamObjs = [];
let splashParticles, splashPoints, ripples = [];
let bubbleParticles, bubblePoints;
let mistParticles, mistPoints;
let waterStreamMesh = null, waterStreamMat = null, waterStreamInner = null;

// World-space coordinates of the pipe outlet (bottom of dropTube in buildPumpConnections)
// Calculated from: pump.pos(-4.5, PLAT_Y+0.55, -0.9) + local(15.9, 18.0, 4.3) * scale(0.25)
const INLET_WX = -0.525;
const INLET_WY = 8.65;  // bottom of drop-tube
const INLET_WZ =  0.175;
let nextPIdx = 0; 
let liveChart;
let lastChartUpdate = 0;
let lastChartSimTime = 0;
let timeScale = 1.0;
let simTime = 0; 
let fillingTime = 0;
let scenarioActive = false;
let audioCtx = null, waterSound = null;
let lastAlarmBeep = 0;
let dataLog = []; // Array of { time, level, pump, valve, i00, i01, i02, event }
let lastDataLogSimTime = -1;

const TANK_D = 2.0;
const TANK_H = 5.0;
const TANK_AREA = Math.PI * (TANK_D / 2) ** 2; // ~3.1415 m^2
const MAX_VOL = TANK_AREA * TANK_H; // ~15.7 m^3
const PUMP_FLOW_NOMINAL = 10.0 / 3600; // 10 m³/h as per Step 1 Config
let activePumpFlow = PUMP_FLOW_NOMINAL;
const LEAK_FLOW_NOMINAL = 2 / 3600; // 2 m³/h (Specified leak)

let curVol = 0.05 * MAX_VOL; // Start at 5% per Scenario A
let curFlow = 0;
let baseConsumption = 0;
let valveAperture = 0; // 0 to 1
const VALVE_TIME = 2.0; // 2 seconds
let curPumpFlow = 0; // Current actual flow (for Task 2 coast-down)

// Camera orbit  
let tRotX = 2.8, tRotY = 0.45, camDist = 14;
let mDown = false, mX0, mY0, tX0, tY0;
let rDown = false, rX0, rY0;
let panTarget = new THREE.Vector3(-4.5, 0, 0);

/* ── LAYOUT ─────────────────────────────────────────────────
   Shore is at  Z = +18 (back)
   Platform extends from Z = +4 to Z = -10  (into the sea)
   Sea surrounds left, right, front
   Tank sits at centre of platform (0, PLAT_Y, -2)
──────────────────────────────────────────────────────────── */
const PLAT_Y = 3.6;   // platform floor height
const TANK_Y_OFF = 0.5;   // Tank sitting on 0.5m plinth
const TANK_BASE_Y = PLAT_Y + TANK_Y_OFF;
const PLAT_W = 14;    // width  (X axis)  left-right
const PLAT_D = 18;    // depth  (Z axis)  shore → sea
const PLAT_Z = 0;     // centre Z of platform (Now aligned with shore edge)
const SHORE_Z = 0;     // Coastline vertical face
const SEA_FACE = -9;    // Seaward end of platform
const TANK_Z = 0;     // Tank positioned in the middle of the platform

/* ================================================================
   INIT
================================================================ */
function init() {
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xddeeff, 0.004);

  camera = new THREE.PerspectiveCamera(57, innerWidth / innerHeight, 0.1, 1200);
  updateCamera();

  const container = document.getElementById('container');
  const w = container.clientWidth;
  const h = container.clientHeight;

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(w, h);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  container.appendChild(renderer.domElement);

  buildLights();
  buildSky();
  buildShoreline();
  buildSea();
  buildPlatform();
  buildTank();
  buildTankWaterMesh();
  buildWaterStream();
  buildTankTopRailing();
  buildLadder();
  buildGauge();
  buildEquipment();
  buildAlarmBeacon();
  buildBirds();

  // Initialize with Step 1 Baseline (No Scenario Selected)
  setTimeout(() => {
    resetSystem();
    PLC_I.armed = true; // Start filling based on Step 1 config
    scenarioActive = false;
    curVol = 0.05 * MAX_VOL;
    activePumpFlow = PUMP_FLOW_NOMINAL; // Enforce 10 m³/h baseline
    document.getElementById('spec-pump-cap').innerText = "10.0 m³/h";
    document.querySelectorAll('.scenario-card').forEach(c => c.classList.remove('active'));
    document.getElementById('scenario-details').style.display = 'none';
    const resCon = document.getElementById('results-container');
    if (resCon) resCon.classList.add('hidden');
    updateStatusSummary();
    log("SYSTEM INITIALIZED: Baseline fill at 10 m³/h active.");
  }, 100);

  // Create and position the custom pump model
  const pump = createPumpModel();
  pump.position.set(-4.5, PLAT_Y + 0.55, -0.9);
  pump.scale.set(0.25, 0.25, 0.25);
  scene.add(pump);

  initWaterSplash();
  initBubbles();
  initMist();
  initChart();

  buildPumpConnections(pump);

  setupEvents();
  clock = new THREE.Clock();
  renderer.setAnimationLoop(animate);
}
let waterFlowTex;
function buildPumpConnections(pump) {
  const pipeMat = new THREE.MeshStandardMaterial({
    color: 0xaaddff,
    transparent: true,
    opacity: 0.28,
    roughness: 0.05,
    metalness: 0.3,
    depthWrite: false   // must NOT write z-buffer — lets inner water mesh render through
  });

  // --- 1. REFINED WATER FLOW TEXTURE (Multi-layered & High-Res) ---
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  
  // Base deep-sea blue gradient
  const bgGrad = ctx.createLinearGradient(0, 0, 256, 0);
  bgGrad.addColorStop(0, '#001a33');
  bgGrad.addColorStop(0.5, '#003366');
  bgGrad.addColorStop(1, '#001a33');
  ctx.fillStyle = bgGrad; ctx.fillRect(0, 0, 256, 1024);

  // Layer 1: Fine turbulent streaks (High density, low opacity)
  for (let i = 0; i < 200; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 1024;
    const h = 40 + Math.random() * 100;
    const alpha = 0.1 + Math.random() * 0.2;
    ctx.fillStyle = `rgba(100,180,255,${alpha})`;
    ctx.fillRect(x, y, 1 + Math.random() * 2, h);
  }

  // Layer 2: Rapid core flow lines (Bright streaks)
  for (let i = 0; i < 80; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 1024;
    const h = 100 + Math.random() * 300;
    const alpha = 0.3 + Math.random() * 0.5;
    ctx.fillStyle = `rgba(180,230,255,${alpha})`;
    ctx.fillRect(x, y, 2, h);
  }

  // Layer 3: Occasional air bubbles / cavitation specks
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  for (let i = 0; i < 400; i++) {
    ctx.beginPath();
    ctx.arc(Math.random() * 256, Math.random() * 1024, 0.5 + Math.random(), 0, Math.PI * 2);
    ctx.fill();
  }

  waterFlowTex = new THREE.CanvasTexture(canvas);
  waterFlowTex.wrapS = waterFlowTex.wrapT = THREE.RepeatWrapping;
  waterFlowTex.repeat.set(1, 4);

  const waterMat = new THREE.MeshStandardMaterial({
    map: waterFlowTex,
    color: 0x66ccff,
    emissive: new THREE.Color(0x051a33),
    emissiveIntensity: 0.8,
    transparent: true,
    opacity: 0, // Driven by curPumpFlow in animate
    roughness: 0.1,
    metalness: 0.3,
    depthWrite: false,
    side: THREE.FrontSide
  });
  waterMat.renderOrder = 1; // water renders after the pipe shell

  const pRad = 0.48;
  const wRad = 0.42; // Water slightly smaller than pipe
  // --- 1. SEA SUCTION PIPE (INLET) ---
  const suctionInletX = 4.45;

  // Horizontal stub
  const stub = new THREE.Mesh(new THREE.CylinderGeometry(pRad, pRad, 1.2, 16), pipeMat);
  stub.rotation.z = Math.PI / 2;
  stub.position.set(suctionInletX + 0.6, 0, 0);
  pump.add(stub);
  const stubWater = new THREE.Mesh(new THREE.CylinderGeometry(wRad, wRad, 1.2, 16), waterMat);
  stubWater.rotation.z = Math.PI / 2;
  stubWater.position.set(suctionInletX + 0.6, 0, 0);
  pump.add(stubWater);

  // Elbow turning DOWN
  const elbow1 = new THREE.Mesh(new THREE.TorusGeometry(1.0, pRad, 12, 24, Math.PI / 2), pipeMat);
  elbow1.position.set(suctionInletX + 1.2, -1.0, 0);
  elbow1.rotation.z = -Math.PI / 2;
  elbow1.rotation.x = Math.PI;
  pump.add(elbow1);
  const elbow1Water = new THREE.Mesh(new THREE.TorusGeometry(1.0, wRad, 12, 24, Math.PI / 2), waterMat);
  elbow1Water.position.set(suctionInletX + 1.2, -1.0, 0);
  elbow1Water.rotation.z = -Math.PI / 2;
  elbow1Water.rotation.x = Math.PI;
  pump.add(elbow1Water);

  // Long vertical pipe down (reaching all the way to the sea)
  const verticalSeaPipe = new THREE.Mesh(new THREE.CylinderGeometry(pRad, pRad, 30, 16), pipeMat);
  verticalSeaPipe.position.set(suctionInletX + 2.2, -16, 0);
  pump.add(verticalSeaPipe);
  const vSeaWater = new THREE.Mesh(new THREE.CylinderGeometry(wRad, wRad, 30, 16), waterMat);
  vSeaWater.position.set(suctionInletX + 2.2, -16, 0);
  vSeaWater.rotation.x = Math.PI; // Flip flow direction to be UP
  pump.add(vSeaWater);

  // --- 2. TANK DISCHARGE PIPE (OUTLET) ---
  const valveX = 3.2, valveZ = 1.3;

  // Pipe out from valve (towards viewer)
  const outPipe = new THREE.Mesh(new THREE.CylinderGeometry(pRad, pRad, 2.0, 16), pipeMat);
  outPipe.rotation.x = Math.PI / 2;
  outPipe.position.set(valveX, 0, valveZ + 1.0);
  pump.add(outPipe);
  const outWater = new THREE.Mesh(new THREE.CylinderGeometry(wRad, wRad, 2.0, 16), waterMat);
  outWater.rotation.x = Math.PI / 2;
  outWater.position.set(valveX, 0, valveZ + 1.0);
  pump.add(outWater);

  // Elbow turning RIGHT (towards Tank)
  const elbow2 = new THREE.Mesh(new THREE.TorusGeometry(1.0, pRad, 12, 24, Math.PI / 2), pipeMat);
  elbow2.position.set(valveX + 1.0, 0, valveZ + 2.0);
  elbow2.rotation.x = -Math.PI / 2;
  elbow2.rotation.z = Math.PI;
  pump.add(elbow2);
  const elbow2Water = new THREE.Mesh(new THREE.TorusGeometry(1.0, wRad, 12, 24, Math.PI / 2), waterMat);
  elbow2Water.position.set(valveX + 1.0, 0, valveZ + 2.0);
  elbow2Water.rotation.x = -Math.PI / 2;
  elbow2Water.rotation.z = Math.PI;
  pump.add(elbow2Water);

  // Horizontal run across floor to Tank
  // Tank is at world x=0. Pump world x is -4.5. Local target x = (0 - (-4.5))/0.25 = 18.
  const runLength = 8.2;
  const horizontalRun = new THREE.Mesh(new THREE.CylinderGeometry(pRad, pRad, runLength, 16), pipeMat);
  horizontalRun.rotation.z = Math.PI / 2;
  horizontalRun.position.set(valveX + 1.0 + runLength / 2, 0, valveZ + 3.0);
  pump.add(horizontalRun);
  const hRunWater = new THREE.Mesh(new THREE.CylinderGeometry(wRad, wRad, runLength, 16), waterMat);
  hRunWater.rotation.z = Math.PI / 2;
  hRunWater.position.set(valveX + 1.0 + runLength / 2, 0, valveZ + 3.0);
  pump.add(hRunWater);

  // --- HIGH-FIDELITY STEEL STANCHION SUPPORTS ---
  const steelMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.3, metalness: 0.8 });
  const boltMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 1.0 });

  for (let i = 0; i <= 2; i++) {
    const supportX = valveX + 2.5 + (i * (runLength - 3) / 2);
    const supportGroup = new THREE.Group();

    // 1. Base Plate
    const basePlate = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.2, 1.6), steelMat);
    basePlate.position.y = -2.0; // Floor level relative to pump center
    supportGroup.add(basePlate);

    // 2. Base Bolts (4 corner bolts)
    const boltGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.1, 6);
    [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]].forEach(pos => {
      const b = new THREE.Mesh(boltGeo, boltMat);
      b.position.set(pos[0], -2.15, pos[1]);
      supportGroup.add(b);
    });

    // 3. Vertical Stanchion (Square Tube)
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.8, 0.6), steelMat);
    post.position.y = -1.3;
    supportGroup.add(post);

    // 4. Pipe Shoe (Cradle / Saddle)
    const shoeBase = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.2, 1.2), steelMat);
    shoeBase.position.y = -0.4;
    supportGroup.add(shoeBase);

    const saddleGeo = new THREE.TorusGeometry(pRad + 0.1, 0.1, 8, 16, Math.PI);
    const saddle = new THREE.Mesh(saddleGeo, steelMat);
    saddle.rotation.x = Math.PI / 2;
    saddle.position.y = -0.4;
    saddle.scale.set(1.1, 0.5, 1); // Flatten it into a cradle
    supportGroup.add(saddle);

    // 5. Heavy Duty U-Strap
    const strap = new THREE.Mesh(new THREE.TorusGeometry(pRad + 0.12, 0.1, 8, 24, Math.PI), boltMat);
    strap.position.y = 0;

    strap.rotation.x = 0;
    strap.rotation.y = Math.PI / 2;


    supportGroup.add(strap);

    supportGroup.position.set(supportX, 0, valveZ + 3.0);
    pump.add(supportGroup);
  }

  // Elbow turning UP (at the tank base)
  const elbow3 = new THREE.Mesh(new THREE.TorusGeometry(1.0, pRad, 12, 24, Math.PI / 2), pipeMat);
  elbow3.position.set(valveX + 1.0 + runLength, 1.0, valveZ + 3.0);
  elbow3.rotation.z = -Math.PI / 2;
  pump.add(elbow3);
  const elbow3Water = new THREE.Mesh(new THREE.TorusGeometry(1.0, wRad, 12, 24, Math.PI / 2), waterMat);
  elbow3Water.position.set(valveX + 1.0 + runLength, 1.0, valveZ + 3.0);
  elbow3Water.rotation.z = -Math.PI / 2;
  pump.add(elbow3Water);

  // Vertical riser up the side of the tank (Adjusted height)
  const riser = new THREE.Mesh(new THREE.CylinderGeometry(pRad, pRad, 17.5, 16), pipeMat);
  riser.position.set(valveX + 2.0 + runLength, 9.75, valveZ + 3.0);
  pump.add(riser);
  const riserWater = new THREE.Mesh(new THREE.CylinderGeometry(wRad, wRad, 17.5, 16), waterMat);
  riserWater.position.set(valveX + 2.0 + runLength, 9.75, valveZ + 3.0);
  riserWater.rotation.x = Math.PI; // Flip flow direction to be UP
  pump.add(riserWater);

  // Final Elbow into the tank inlet (Lowered slightly to 18.5)
  const elbow4 = new THREE.Mesh(new THREE.TorusGeometry(1.0, pRad, 12, 24, Math.PI / 2), pipeMat);
  elbow4.position.set(valveX + 3.0 + runLength, 18.5, valveZ + 3.0);
  elbow4.rotation.z = -Math.PI / 2;
  elbow4.rotation.x = -Math.PI;
  elbow4.rotation.y = -Math.PI;
  pump.add(elbow4);
  const elbow4Water = new THREE.Mesh(new THREE.TorusGeometry(1.0, wRad, 12, 24, Math.PI / 2), waterMat);
  elbow4Water.position.set(valveX + 3.0 + runLength, 18.5, valveZ + 3.0);
  elbow4Water.rotation.z = -Math.PI / 2;
  elbow4Water.rotation.x = -Math.PI;
  elbow4Water.rotation.y = -Math.PI;
  pump.add(elbow4Water);

  // Final short bridge into tank (Lowered to 19.5)
  const bridge = new THREE.Mesh(new THREE.CylinderGeometry(pRad, pRad, 1.0, 16), pipeMat);
  bridge.rotation.z = Math.PI / 2;
  bridge.position.set(valveX + runLength + 3.0, 19.5, valveZ + 3.0);
  pump.add(bridge);
  const bridgeWater = new THREE.Mesh(new THREE.CylinderGeometry(wRad, wRad, 1.0, 16), waterMat);
  bridgeWater.rotation.z = Math.PI / 2;
  bridgeWater.position.set(valveX + runLength + 3.0, 19.5, valveZ + 3.0);
  pump.add(bridgeWater);

  // // Final entry stub (into tank wall) - FIXED ALIGNMENT (Lowered to 19.5)
  const elbowX = valveX + runLength + 4.5;
  const elbowY = 19.5;

  const elbow5 = new THREE.Mesh(new THREE.TorusGeometry(1.0, pRad, 12, 24, Math.PI / 2), pipeMat);
  elbow5.position.set(elbowX - 1, elbowY - 1, valveZ + 3.0);
  elbow5.rotation.z = -Math.PI / 2; // Correct rotation for Top -> Right turn (when viewed from side)
  elbow5.rotation.x = -Math.PI;
  pump.add(elbow5);
  const elbow5Water = new THREE.Mesh(new THREE.TorusGeometry(1.0, wRad, 12, 24, Math.PI / 2), waterMat);
  elbow5Water.position.set(elbowX - 1, elbowY - 1, valveZ + 3.0);
  elbow5Water.rotation.z = -Math.PI / 2;
  elbow5Water.rotation.x = -Math.PI;
  pump.add(elbow5Water);

  // Vertical drop tube after elbow - Connected at elbow's bottom
  const dropTube = new THREE.Mesh(new THREE.CylinderGeometry(pRad, pRad, 1.0, 16), pipeMat);
  dropTube.position.set(elbowX, elbowY - 1.0, valveZ + 3.0);
  pump.add(dropTube);
  const dropWater = new THREE.Mesh(new THREE.CylinderGeometry(wRad, wRad, 1.0, 16), waterMat);
  dropWater.position.set(elbowX, elbowY - 1.0, valveZ + 3.0);
  pump.add(dropWater);

  // Give every water mesh renderOrder=2 so they draw AFTER the pipe shells (renderOrder=0)
  // Pipe shells have depthWrite:false so they don't block the water from the z-test
  pump.traverse(child => {
    if (child.isMesh && child.material === waterMat) {
      child.renderOrder = 2;
    }
  });
}

/* ================================================================
   LIGHTS
================================================================ */
function buildLights() {
  scene.add(new THREE.AmbientLight(0xddeeff, 0.75));

  const sun = new THREE.DirectionalLight(0xfff8ee, 1.45);
  sun.position.set(-30, 80, 40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const s = 45;
  Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 0.5, far: 400 });
  scene.add(sun);

  const fill = new THREE.DirectionalLight(0xaaccff, 0.55);
  fill.position.set(30, 20, -30);
  scene.add(fill);

  // Sea reflection shimmer
  const seaGlow = new THREE.PointLight(0x1ab8e8, 0.5, 25);
  seaGlow.position.set(0, PLAT_Y - 1.2, PLAT_Z);
  scene.add(seaGlow);
}

/* ================================================================
   SKY
================================================================ */
function buildSky() {
  const cv = document.createElement('canvas');
  cv.width = 2; cv.height = 512;
  const g = cv.getContext('2d').createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#0077be'); // Deep blue sky
  g.addColorStop(0.4, '#1e90ff'); // Dodger blue
  g.addColorStop(0.8, '#87ceeb'); // Sky blue
  g.addColorStop(1, '#d0e6f0');   // Horizon light blue
  const ctx = cv.getContext('2d');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 2, 512);
  const tex = new THREE.CanvasTexture(cv);

  const skyMesh = new THREE.Mesh(
    new THREE.SphereGeometry(600, 32, 16),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide })
  );
  scene.add(skyMesh);

  // Sun disc
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(6, 32),
    new THREE.MeshBasicMaterial({ color: 0xfff3aa })
  );
  sunDisc.position.set(-120, 90, -400);
  scene.add(sunDisc);
  // Glow ring
  const glow = new THREE.Mesh(
    new THREE.RingGeometry(6, 12, 32),
    new THREE.MeshBasicMaterial({ color: 0xffe080, transparent: true, opacity: 0.25, side: THREE.DoubleSide })
  );
  glow.position.set(-120, 90, -400);
  scene.add(glow);
}

/* ================================================================
   SHORELINE  (one side – Z positive = land)
================================================================ */
function buildShoreline() {
  // ── Concrete Floor Texture for the Marine Base ──
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#666'; ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = '#444'; ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, 128, 128);
  // Add some 'dirt' spots
  for (let i = 0; i < 10; i++) {
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.1})`;
    ctx.beginPath(); ctx.arc(Math.random() * 128, Math.random() * 128, Math.random() * 20, 0, Math.PI * 2); ctx.fill();
  }
  const floorTex = new THREE.CanvasTexture(canvas);
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(10, 5);

  const baseMat = new THREE.MeshPhongMaterial({ map: floorTex, shininess: 10 });
  const wallMat = new THREE.MeshPhongMaterial({ color: 0x4a4a4a, shininess: 20 });

  // ── Vertical Quay Wall at Water's Edge ──
  const wall = new THREE.Mesh(new THREE.BoxGeometry(200, 15, 2), wallMat);
  wall.position.set(0, -6.5, SHORE_Z + 1);
  scene.add(wall);

  // ── Main Base Ground ──
  const land = new THREE.Mesh(new THREE.PlaneGeometry(200, 100), baseMat);
  land.rotation.x = -Math.PI / 2;
  land.position.set(0, 1.05, SHORE_Z + 51);
  land.receiveShadow = true;
  scene.add(land);

  // ── Industrial Base Props ──
  buildBaseProps();

  // Keep some riprap/rocks but move them to the sides
  const rockMat = new THREE.MeshPhongMaterial({ color: 0x5a5a5a, shininess: 5 });
  for (let i = 0; i < 12; i++) {
    const sx = (Math.random() > 0.5 ? 1 : -1) * (20 + Math.random() * 40);
    const sz = SHORE_Z + Math.random() * 5;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5 + Math.random(), 0), rockMat);
    rock.position.set(sx, 0.4, sz);
    rock.rotation.set(Math.random(), Math.random(), Math.random());
    scene.add(rock);
  }
}

function buildBaseProps() {
  const contColors = [0x1a4a8a, 0x8a2a1a, 0x2a5a2a, 0x4a4a4a];

  // Shipping Containers
  for (let i = 0; i < 4; i++) {
    const color = contColors[i % contColors.length];
    const box = new THREE.Mesh(new THREE.BoxGeometry(2.5, 2.6, 6), new THREE.MeshPhongMaterial({ color }));
    box.position.set(-15 - i * 4, 1.05 + 1.3, SHORE_Z + 12 + Math.random() * 5);
    box.rotation.y = (Math.random() - 0.5) * 0.2;
    box.castShadow = true;
    scene.add(box);
  }

  // Fuel Barrels
  const barrelMat = new THREE.MeshPhongMaterial({ color: 0xcc4400, shininess: 50 });
  const barrelGeo = new THREE.CylinderGeometry(0.35, 0.35, 1.0, 12);
  for (let i = 0; i < 8; i++) {
    const barrel = new THREE.Mesh(barrelGeo, barrelMat);
    barrel.position.set(10 + (i % 3) * 0.8, 1.05 + 0.5, SHORE_Z + 10 + Math.floor(i / 3) * 0.8);
    barrel.castShadow = true;
    scene.add(barrel);
  }

  // Crates
  const crateMat = new THREE.MeshPhongMaterial({ color: 0x8a6a4a, shininess: 5 });
  for (let i = 0; i < 5; i++) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), crateMat);
    crate.position.set(15 + Math.random() * 10, 1.05 + 0.6, SHORE_Z + 15 + Math.random() * 10);
    crate.rotation.y = Math.random() * Math.PI;
    crate.castShadow = true;
    scene.add(crate);
  }
}

/* ================================================================
   SEA  (animated, 3-sided)
================================================================ */
function buildSea() {
  // ── Seabed (Dark Sandy Floor) ──
  const bedMat = new THREE.MeshPhongMaterial({ color: 0x051a2a, shininess: 2 });
  const bed = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), bedMat);
  bed.rotation.x = -Math.PI / 2;
  bed.position.set(0, -15, -60);
  scene.add(bed);

  // ── Deep Water Layer (For Volume) ──
  const deepMat = new THREE.MeshPhongMaterial({
    color: 0x155a8a, transparent: true, opacity: 0.85, side: THREE.DoubleSide
  });
  const deepMesh = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), deepMat);
  deepMesh.rotation.x = -Math.PI / 2;
  deepMesh.position.set(0, -2, -60);
  scene.add(deepMesh);

  // ── Surface Water Layer (Dynamic) ──
  const oceanGeo = new THREE.PlaneGeometry(600, 600, 128, 128);
  const oceanMat = new THREE.MeshStandardMaterial({
    color: 0x2eaed6, metalness: 0.2, roughness: 0.1,
    emissive: 0x0a3a5a, emissiveIntensity: 0.4,
    transparent: true, opacity: 0.85,
    side: THREE.DoubleSide
  });
  oceanMesh = new THREE.Mesh(oceanGeo, oceanMat);
  oceanMesh.rotation.x = -Math.PI / 2;
  oceanMesh.position.set(0, 0, -60);
  oceanMesh.receiveShadow = true;
  scene.add(oceanMesh);

  // ── Procedural Soft Foam Texture ──
  const fCan = document.createElement('canvas');
  fCan.width = 64; fCan.height = 64;
  const fCtx = fCan.getContext('2d');
  const fGrad = fCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
  fGrad.addColorStop(0, 'rgba(255, 255, 255, 0.5)');
  fGrad.addColorStop(0.4, 'rgba(200, 240, 255, 0.2)');
  fGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  fCtx.fillStyle = fGrad; fCtx.fillRect(0, 0, 64, 64);
  const softFoamTex = new THREE.CanvasTexture(fCan);

  const foamMat = new THREE.MeshBasicMaterial({
    map: softFoamTex, transparent: true, opacity: 0.6,
    depthWrite: false, blending: THREE.AdditiveBlending
  });

  // Create foam around the pillars and base edge
  for (let i = 0; i < 50; i++) {
    const x = (Math.random() - 0.5) * 120;
    const z = (Math.random() - 0.5) * 100 - 10;
    const size = 1.5 + Math.random() * 3.5;
    const f = new THREE.Mesh(new THREE.PlaneGeometry(size, size), foamMat);
    f.rotation.x = -Math.PI / 2;
    f.position.set(x, 0.15, z);
    f.userData.baseX = x; f.userData.baseZ = z; f.userData.ph = Math.random() * Math.PI * 2;
    f.renderOrder = 2; // Render after water surface
    foamObjs.push(f);
    scene.add(f);
  }

  buildDistantShips();
}

function buildDistantShips() {
  const hullMat = new THREE.MeshPhongMaterial({ color: 0x334455, shininess: 20 });
  const supMat = new THREE.MeshPhongMaterial({ color: 0x445566, shininess: 15 });
  const shipDefs = [
    { x: -80, z: -120, rot: 0.2 },
    { x: 90, z: -160, rot: -0.1 },
    { x: -30, z: -200, rot: 0.05 }
  ];
  shipDefs.forEach(d => {
    const hull = new THREE.Mesh(new THREE.BoxGeometry(22, 3.5, 8), hullMat);
    hull.position.set(d.x, 1.0, d.z);
    hull.rotation.y = d.rot;
    scene.add(hull);
    const sup = new THREE.Mesh(new THREE.BoxGeometry(8, 5, 5), supMat);
    sup.position.set(d.x - 3, 5.5, d.z);
    sup.rotation.y = d.rot;
    scene.add(sup);
    // Funnel
    const fun = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.0, 4, 12), hullMat);
    fun.position.set(d.x - 4, 9, d.z);
    scene.add(fun);
  });
}

/* ================================================================
   PLATFORM  (jetty/pier – 3 sides open to sea)
================================================================ */
function buildPlatform() {
  // ── Structural piles (round steel tubes into sea) ─────────────────────────
  // Procedural Weathered Steel / Algae Texture for marine piles
  const pCan = document.createElement('canvas');
  pCan.width = 64; pCan.height = 256;
  const pCtx = pCan.getContext('2d');
  pCtx.fillStyle = '#414f5c'; pCtx.fillRect(0, 0, 64, 256);
  const pGrad = pCtx.createLinearGradient(0, 140, 0, 256);
  pGrad.addColorStop(0, 'rgba(10, 40, 20, 0)');
  pGrad.addColorStop(0.5, 'rgba(20, 60, 30, 0.85)');
  pGrad.addColorStop(1, 'rgba(5, 20, 10, 0.95)');
  pCtx.fillStyle = pGrad; pCtx.fillRect(0, 140, 64, 116);
  const pileTex = new THREE.CanvasTexture(pCan);
  pileTex.wrapS = pileTex.wrapT = THREE.RepeatWrapping;

  const hPileMat = new THREE.MeshPhongMaterial({ map: pileTex, shininess: 35 });
  const bracingMat = new THREE.MeshPhongMaterial({ color: 0x3d4d5c, shininess: 40 });
  const collarMat = new THREE.MeshPhongMaterial({ color: 0x111111, shininess: 10 });

  const pileGrid = [];
  const xSteps = [-5.5, 0, 5.5];
  const zSteps = [SEA_FACE, -4.5];
  xSteps.forEach(px => {
    zSteps.forEach(pz => pileGrid.push([px, pz]));
  });

  pileGrid.forEach(([px, pz]) => {
    const pileH = PLAT_Y + 12.0;
    const pile = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, pileH, 16), hPileMat);
    pile.position.set(px, PLAT_Y - pileH / 2, pz);
    pile.castShadow = true;
    scene.add(pile);

    // Splash Zone Protective Collar (Rubber)
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.8, 16), collarMat);
    collar.position.set(px, 0.1, pz);
    scene.add(collar);
  });


  // ── LAND SIDE SUPPORTS (Concrete Pedestals) ──
  const pedMat = new THREE.MeshPhongMaterial({ color: 0x666666, shininess: 10 });
  const landZ = [4.5, 8.2];
  xSteps.forEach(px => {
    landZ.forEach(pz => {
      const pedH = PLAT_Y - 1.05;
      const pedestal = new THREE.Mesh(new THREE.BoxGeometry(0.8, pedH, 0.8), pedMat);
      pedestal.position.set(px, 1.05 + pedH / 2, pz);
      pedestal.castShadow = true;
      scene.add(pedestal);

      // Base footing block
      const footing = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.15, 1.2), pedMat);
      footing.position.set(px, 1.05 + 0.07, pz);
      scene.add(footing);
    });
  });
  // ── Deck ──────────────────────────────────────────────────────────────────
  const deckGeo = new THREE.BoxGeometry(PLAT_W, 0.30, PLAT_D);
  const deckMat = new THREE.MeshPhongMaterial({ color: 0x7a7268, shininess: 8, specular: 0x080806 });
  const deck = new THREE.Mesh(deckGeo, deckMat);
  deck.position.set(0, PLAT_Y - 0.15, PLAT_Z);
  deck.castShadow = true;
  deck.receiveShadow = true;
  scene.add(deck);

  // Grating lines
  buildGrating();

  // Hazard stripes on 3 open sides
  buildHazardEdges();

  // ── Perimeter safety railing on 3 open sides ─────────────────────────────
  buildPerimeterRailing();

  // ── Access gangway to shore ───────────────────────────────────────────────
  buildGangway();
}

function buildGrating() {
  const gMat = new THREE.MeshPhongMaterial({ color: 0x5e5850, shininess: 10 });
  for (let ix = -PLAT_W / 2; ix <= PLAT_W / 2; ix += 0.7) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, PLAT_D), gMat);
    b.position.set(ix, PLAT_Y + 0.015, PLAT_Z);
    scene.add(b);
  }
  for (let iz = -PLAT_D / 2; iz <= PLAT_D / 2; iz += 0.7) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(PLAT_W, 0.03, 0.06), gMat);
    b.position.set(0, PLAT_Y + 0.015, PLAT_Z + iz);
    scene.add(b);
  }
}

function buildHazardEdges() {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 32;
  const ctx = cv.getContext('2d');
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#ddbb00' : '#111111';
    ctx.fillRect(i * 32, 0, 32, 32);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = THREE.RepeatWrapping; tex.repeat.set(5, 1);
  const sM = new THREE.MeshPhongMaterial({ map: tex });
  const sGeo = new THREE.BoxGeometry(1, 0.04, 0.28);

  // Front (seaward) edge
  const fe = new THREE.Mesh(new THREE.BoxGeometry(PLAT_W + 0.1, 0.04, 0.28), sM);
  fe.position.set(0, PLAT_Y + 0.02, SEA_FACE + 0.14);
  scene.add(fe);
  // Left edge
  const le = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.04, PLAT_D + 0.1), sM);
  le.position.set(-PLAT_W / 2 - 0.14, PLAT_Y + 0.02, PLAT_Z);
  scene.add(le);
  // Right edge
  const re = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.04, PLAT_D + 0.1), sM);
  re.position.set(PLAT_W / 2 + 0.14, PLAT_Y + 0.02, PLAT_Z);
  scene.add(re);
}

function buildPerimeterRailing() {
  const pMat = new THREE.MeshPhongMaterial({ color: 0xddcc00, shininess: 70 });
  const tMat = new THREE.MeshPhongMaterial({ color: 0xaa2211 }); // Red toeboards

  const hw = PLAT_W / 2;
  const hd = PLAT_D / 2;

  function addRailSegment(x1, z1, x2, z2) {
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.sqrt(dx * dx + dz * dz);
    const count = Math.ceil(len / 1.6);

    // Posts
    for (let i = 0; i <= count; i++) {
      const t = i / count;
      const px = x1 + dx * t;
      const pz = z1 + dz * t;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 8), pMat);
      post.position.set(px, PLAT_Y + 0.55, pz);
      post.castShadow = true;
      scene.add(post);
    }

    // Horizontal Rails (Top and Mid)
    [1.05, 0.55].forEach(h => {
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, len, 8), pMat);
      rail.rotation.z = dx !== 0 ? Math.PI / 2 : 0;
      rail.rotation.x = dz !== 0 ? Math.PI / 2 : 0;
      rail.position.set((x1 + x2) / 2, PLAT_Y + h, (z1 + z2) / 2);
      scene.add(rail);
    });

    // Toeboard
    const toe = new THREE.Mesh(new THREE.BoxGeometry(dx !== 0 ? len : 0.05, 0.15, dz !== 0 ? len : 0.05), tMat);
    toe.position.set((x1 + x2) / 2, PLAT_Y + 0.075, (z1 + z2) / 2);
    scene.add(toe);
  }

  // ── Seaward Front Edge ──
  addRailSegment(-hw, -hd, hw, -hd);

  // ── Left Side (Full Deep) ──
  addRailSegment(-hw, -hd, -hw, hd);

  // ── Right Side (Full Deep) ──
  addRailSegment(hw, -hd, hw, hd);

  // ── Back Edge (With opening for gangway) ──
  const gap = PLAT_W * 0.25; // Opening width
  addRailSegment(-hw, hd, -gap, hd);
  addRailSegment(gap, hd, hw, hd);

  buildBollards();
}

function buildBollards() {
  const bMat = new THREE.MeshPhongMaterial({ color: 0x1a1a1a, shininess: 50 });
  const cMat = new THREE.MeshPhongMaterial({ color: 0xee2200, shininess: 60 });
  const hw = PLAT_W / 2;
  const positions = [
    [-hw, SEA_FACE], [hw, SEA_FACE], [0, SEA_FACE],
    [-hw, PLAT_Z], [hw, PLAT_Z]
  ];
  positions.forEach(([px, pz]) => {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.65, 16), bMat);
    body.position.set(px, PLAT_Y + 0.32, pz);
    body.castShadow = true;
    scene.add(body);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 12), cMat);
    cap.position.set(px, PLAT_Y + 0.78, pz);
    scene.add(cap);
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.1, 16),
      new THREE.MeshPhongMaterial({ color: 0xffffff }));
    stripe.position.set(px, PLAT_Y + 0.46, pz);
    scene.add(stripe);
  });
}

function buildGangway() {
  // Shorter gangway for the newly adjacent layout
  const shoreY = 1.05;
  const platEdgeZ = 8.5; // Starts inside the land-half of the platform
  const gangwayLenZ = 4.5;
  const dy = PLAT_Y - shoreY;
  const slopeAngle = Math.atan2(dy, gangwayLenZ);
  const meshLen = Math.sqrt(gangwayLenZ * gangwayLenZ + dy * dy);

  // Procedural Metallic Grating Texture
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#444'; ctx.fillRect(0, 0, 64, 64);
  ctx.strokeStyle = '#222'; ctx.lineWidth = 4;
  for (let i = 0; i < 64; i += 8) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 64); ctx.stroke(); }
  for (let i = 0; i < 64; i += 16) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(64, i); ctx.stroke(); }
  const gratingTex = new THREE.CanvasTexture(canvas);
  gratingTex.wrapS = gratingTex.wrapT = THREE.RepeatWrapping;
  gratingTex.repeat.set(4, 25);

  const gMat = new THREE.MeshPhongMaterial({ map: gratingTex, shininess: 40 });
  const rMat = new THREE.MeshPhongMaterial({ color: 0xccbb00, shininess: 80 }); // Polished Safety Yellow
  const sMat = new THREE.MeshPhongMaterial({ color: 0x3a4a5a, shininess: 20 }); // Steel side beams
  const toeMat = new THREE.MeshPhongMaterial({ color: 0xaa2211 }); // Red toeboards

  const gangwayGroup = new THREE.Group();

  // ── Main Side Beams (Trusses) ──
  [-PLAT_W * 0.23, PLAT_W * 0.23].forEach(x => {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.45, meshLen), sMat);
    beam.position.set(x, -dy / 2 - 0.1, gangwayLenZ / 2);
    beam.rotation.x = slopeAngle;
    beam.castShadow = true;
    gangwayGroup.add(beam);
  });

  // ── Main Ramp Deck ──
  const ramp = new THREE.Mesh(new THREE.BoxGeometry(PLAT_W * 0.45, 0.1, meshLen), gMat);
  ramp.position.set(0, -dy / 2, gangwayLenZ / 2);
  ramp.rotation.x = slopeAngle;
  ramp.receiveShadow = true;
  gangwayGroup.add(ramp);

  // ── Ribs (Child of ramp) ──
  const ribGeo = new THREE.BoxGeometry(PLAT_W * 0.45 + 0.04, 0.05, 0.08);
  const ribMat = new THREE.MeshPhongMaterial({ color: 0x222222 });
  for (let i = 0; i <= 18; i++) {
    const t = i / 18;
    const rib = new THREE.Mesh(ribGeo, ribMat);
    rib.position.set(0, 0.06, (t - 0.5) * meshLen);
    ramp.add(rib);
  }

  // ── Railings & Toeboards ──
  [-PLAT_W * 0.22, PLAT_W * 0.22].forEach(x => {
    // Vertical posts
    for (let i = 0; i <= 5; i++) {
      const t = i / 5;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.15, 12), rMat);
      const pz = t * gangwayLenZ;
      const py = -t * dy;
      post.position.set(x, py + 0.57, pz);
      post.castShadow = true;
      gangwayGroup.add(post);

      // Hinge detail at top posts
      if (i === 0) {
        const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.3, 16), sMat);
        hinge.rotation.z = Math.PI / 2;
        hinge.position.set(x, py, pz);
        gangwayGroup.add(hinge);
      }
    }

    // Slanted Rails (Top, Mid and Toeboard)
    [1.1, 0.55].forEach(h => {
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, meshLen, 8), rMat);
      rail.position.set(x, -dy / 2 + h, gangwayLenZ / 2);
      rail.rotation.x = Math.PI / 2 + slopeAngle;
      gangwayGroup.add(rail);
    });

    const toe = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, meshLen), toeMat);
    toe.position.set(x, -dy / 2 + 0.08, gangwayLenZ / 2);
    toe.rotation.x = slopeAngle;
    gangwayGroup.add(toe);
  });

  // ── Bottom Landing Plate ──
  const plate = new THREE.Mesh(new THREE.BoxGeometry(PLAT_W * 0.5, 0.06, 0.8), sMat);
  plate.position.set(0, -dy + 0.03, gangwayLenZ + 0.2);
  gangwayGroup.add(plate);

  gangwayGroup.position.set(0, PLAT_Y, platEdgeZ);
  scene.add(gangwayGroup);
}

/* ================================================================
   TANK
================================================================ */
function buildTank() {
  const base = TANK_BASE_Y;

  // Shell
  const shellMat = new THREE.MeshPhongMaterial({
    color: 0x3a6a38, transparent: true, opacity: 0.45,
    side: THREE.DoubleSide, depthWrite: false, shininess: 60
  });
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(TANK_D / 2, TANK_D / 2, TANK_H, 64, 1, true), shellMat);
  shell.position.set(0, base + TANK_H / 2 + 0.15, TANK_Z);
  shell.renderOrder = 1;
  shell.castShadow = true; shell.receiveShadow = true;
  scene.add(shell);

  // Bottom plate
  const botMat = new THREE.MeshPhongMaterial({ color: 0x1c421c, shininess: 28 });
  const bot = new THREE.Mesh(new THREE.CylinderGeometry(TANK_D / 2, TANK_D / 2, 0.18, 64), botMat);
  bot.position.set(0, base + 0.09, TANK_Z);
  bot.castShadow = true; bot.receiveShadow = true;
  scene.add(bot);

  // Concrete Plinth (Foundation slab) - Sits on PLAT_Y
  const plinthMat = new THREE.MeshPhongMaterial({ color: 0x5a5a5a, shininess: 5 });
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(TANK_D / 2 + 0.6, TANK_D / 2 + 0.5, TANK_Y_OFF, 32), plinthMat);
  plinth.position.set(0, PLAT_Y + TANK_Y_OFF / 2, TANK_Z);
  plinth.receiveShadow = true;
  scene.add(plinth);

  // Strake rings
  const rMat = new THREE.MeshPhongMaterial({ color: 0x183618, shininess: 65 });
  for (let i = 0; i <= 5; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(TANK_D / 2 + 0.04, 0.04, 8, 64), rMat);
    ring.position.set(0, base + 0.15 + i * (TANK_H / 5), TANK_Z);
    ring.rotation.x = Math.PI / 2;
    scene.add(ring);
  }

  // Weld seams
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.04, TANK_H + 0.2, 0.04),
      new THREE.MeshPhongMaterial({ color: 0x124012 }));
    seam.position.set(Math.cos(a) * (TANK_D / 2 + 0.03), base + TANK_H / 2 + 0.1, TANK_Z + Math.sin(a) * (TANK_D / 2 + 0.03));
    scene.add(seam);
  }

  // Inlet nozzle
  // Top Inlet Flange
  const nozMat = new THREE.MeshPhongMaterial({ color: 0x778899, shininess: 80 });
  // 80% Height Inlet Flange
  const flangeA = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.1, 16), nozMat);
  flangeA.rotation.z = Math.PI / 2; // Sideways entry
  flangeA.position.set(TANK_D / 2, base + 0.8 * TANK_H, TANK_Z);
  scene.add(flangeA);

  // Top vent
  const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.6, 12), nozMat);
  vent.position.set(0, base + TANK_H + 0.45, TANK_Z);
  scene.add(vent);
  const ventCap = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.05, 12), nozMat);
  ventCap.position.set(0, base + TANK_H + 0.78, TANK_Z);
  scene.add(ventCap);


  // --- 3D SENSOR PROBES ---
  const probeGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8);
  const probeMat = new THREE.MeshPhongMaterial({ color: 0xffffff, emissive: 0x444444 });
  const sensorColors = [0x00ff66, 0xffaa00, 0xff3300]; // Green, Orange, Red

  sensorProbes = [];
  [0.1, 0.5, 0.9].forEach((h, i) => {
    const probe = new THREE.Mesh(probeGeo, probeMat);
    probe.position.set(TANK_D / 2 - 0.1, base + h * TANK_H + 0.15, TANK_Z);

    // Glowing indicator box
    const boxColor = sensorColors[i];
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.15, 0.12),
      new THREE.MeshPhongMaterial({ color: boxColor, emissive: boxColor, emissiveIntensity: 0.1 }));
    box.position.set(TANK_D / 2, base + h * TANK_H + 0.15, TANK_Z);

    scene.add(probe);
    scene.add(box);
    sensorProbes.push(box); // Store the glowing box
  });
}

/* ================================================================
   TANK WATER INSIDE
================================================================ */
function buildTankWaterMesh() {
  // 1. WATER VOLUME (The body of the water)
  // Using MeshPhysicalMaterial for realistic transmission and refraction
  tankWaterMat = new THREE.MeshPhysicalMaterial({
    color: 0x0088ff,
    metalness: 0,
    roughness: 0.02,
    transmission: 0.95, // High transparency
    ior: 1.33, // Water refractive index
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  
  tankWater = new THREE.Mesh(new THREE.CylinderGeometry(TANK_D / 2 - 0.02, TANK_D / 2 - 0.02, TANK_H, 64), tankWaterMat);
  tankWater.position.set(0, TANK_BASE_Y + TANK_H / 2 + 0.15, TANK_Z);
  tankWater.renderOrder = 5;
  scene.add(tankWater);

  // 2. WATER SURFACE (The top with ripples)
  tankSurfaceMat = new THREE.MeshPhysicalMaterial({
    color: 0x33aaff,
    metalness: 0.2,
    roughness: 0.1,
    transmission: 0.5,
    transparent: true,
    opacity: 0.7,
    ior: 1.33,
    reflectivity: 0.5,
    depthWrite: false
  });

  const surfGeo = new THREE.CircleGeometry(TANK_D / 2 - 0.02, 64);
  tankSurface = new THREE.Mesh(surfGeo, tankSurfaceMat);
  tankSurface.rotation.x = -Math.PI / 2;
  tankSurface.renderOrder = 6;
  scene.add(tankSurface);
}

/* ================================================================
   WATER STREAM (falling column from pipe outlet to water surface)
================================================================ */
function buildWaterStream() {
  // Use a higher-detail cylinder for the stream
  const geo = new THREE.CylinderGeometry(1.0, 1.0, 1.0, 12, 16, false);
  
  // Create a noisy, "broken" water texture for alpha and color
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 512;
  const ctx = canvas.getContext('2d');
  
  // Fill with base transparency
  ctx.fillStyle = 'rgba(0, 50, 100, 0)'; 
  ctx.fillRect(0, 0, 64, 512);

  // Add "water streaks" and "bubbles"
  for (let i = 0; i < 400; i++) {
    const x = Math.random() * 64;
    const y = Math.random() * 512;
    const w = 1 + Math.random() * 3;
    const h = 20 + Math.random() * 60;
    const alpha = 0.1 + Math.random() * 0.4;
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.fillRect(x, y, w, h);
  }

  const streamTex = new THREE.CanvasTexture(canvas);
  streamTex.wrapS = streamTex.wrapT = THREE.RepeatWrapping;
  streamTex.repeat.set(1, 1);

  waterStreamMat = new THREE.MeshPhysicalMaterial({
    map: streamTex,
    alphaMap: streamTex,
    transparent: true,
    opacity: 0.9,
    color: 0xccf0ff,
    transmission: 0.5,
    ior: 1.33,
    roughness: 0.1,
    metalness: 0.1,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.NormalBlending
  });
  
  waterStreamMesh = new THREE.Mesh(geo, waterStreamMat);
  waterStreamMesh.renderOrder = 9;
  waterStreamMesh.visible = false;
  scene.add(waterStreamMesh);

  // Secondary inner core for density
  const innerGeo = new THREE.CylinderGeometry(0.7, 0.7, 1.0, 8, 1, false);
  const innerMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.3,
    depthWrite: false
  });
  waterStreamInner = new THREE.Mesh(innerGeo, innerMat);
  waterStreamMesh.add(waterStreamInner);
}

function updateWaterStream(pumpOn, waterLevel) {
  if (!waterStreamMesh) return;
  
  const flowIntensity = curPumpFlow / PUMP_FLOW_NOMINAL;
  const surfaceY = TANK_BASE_Y + 0.15 + waterLevel * TANK_H;
  const streamLen = INLET_WY - surfaceY;

  // Stream visibility and scale based on actual flow intensity
  if (flowIntensity > 0.01 && streamLen > 0.05) {
    waterStreamMesh.visible = true;
    waterStreamMesh.position.set(INLET_WX, surfaceY + streamLen * 0.5, INLET_WZ);
    
    const t = clock.elapsedTime;
    const speed = (4.0 + flowIntensity * 6.0) * timeScale;
    
    // Animate texture offset for "flow"
    if (waterStreamMat.map) {
       waterStreamMat.map.offset.y = -(t * speed) % 1;
    }
    
    // Scale stream width based on flow intensity (trickle to full)
    const baseR = 0.01 + flowIntensity * 0.035;
    waterStreamMesh.scale.set(baseR, streamLen, baseR);
    
    // Turbulence: Scaling jitter increases with flow
    const noise = Math.sin(t * 40) * 0.005 * flowIntensity;
    waterStreamMesh.scale.x = baseR + noise;
    waterStreamMesh.scale.z = baseR + (Math.cos(t * 35) * 0.005 * flowIntensity);
    
    // Opacity scales with flow density
    waterStreamMat.opacity = Math.min(0.9, 0.2 + flowIntensity * 0.7);
    
    if (waterStreamInner) {
      waterStreamInner.rotation.y = t * (5 + flowIntensity * 10);
      waterStreamInner.scale.x = 0.4 + flowIntensity * 0.3;
      waterStreamInner.material.opacity = flowIntensity * 0.4;
    }
  } else {
    waterStreamMesh.visible = false;
  }
}

/* ================================================================
   WATER SPLASH ANIMATION (Inlet stream)
================================================================ */
function initWaterSplash() {
  const particleCount = 8000; // Increased for more realism
  splashGeometry = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const velocities = new Float32Array(particleCount * 3);
  const lifespans = new Float32Array(particleCount);

  for (let i = 0; i < particleCount; i++) {
    lifespans[i] = -1;
    positions[i * 3 + 1] = -100;
  }

  splashGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  splashGeometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
  splashGeometry.setAttribute('lifespan', new THREE.BufferAttribute(lifespans, 1));

  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  // Real water spray is mostly white (refracted light)
  grad.addColorStop(0,   'rgba(255, 255, 255, 0.9)');
  grad.addColorStop(0.4, 'rgba(240, 250, 255, 0.5)');
  grad.addColorStop(1,   'rgba(255, 255, 255, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const pTex = new THREE.CanvasTexture(canvas);

  const pMat = new THREE.PointsMaterial({
    size: 0.04, // Realistic droplet size
    map: pTex,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true
  });

  splashPoints = new THREE.Points(splashGeometry, pMat);
  splashPoints.renderOrder = 10;
  scene.add(splashPoints);

  const rippleGeo = new THREE.RingGeometry(0.04, 0.12, 24);
  const rippleMat = new THREE.MeshBasicMaterial({ color: 0xccf0ff, transparent: true, opacity: 0.7, side: THREE.DoubleSide });
  for (let i = 0; i < 10; i++) { // More ripples
    const r = new THREE.Mesh(rippleGeo, rippleMat.clone());
    r.rotation.x = -Math.PI / 2;
    r.visible = false;
    scene.add(r);
    ripples.push(r);
  }
}

function initBubbles() {
  const count = 3000;
  bubbleParticles = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const vel = new Float32Array(count * 3);
  const life = new Float32Array(count);
  for (let i = 0; i < count; i++) { life[i] = -1; pos[i*3+1] = -100; }
  
  bubbleParticles.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  bubbleParticles.setAttribute('velocity', new THREE.BufferAttribute(vel, 3));
  bubbleParticles.setAttribute('lifespan', new THREE.BufferAttribute(life, 1));
  
  const bMat = new THREE.PointsMaterial({
    size: 0.12,
    color: 0xffffff,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
    blending: THREE.NormalBlending
  });
  bubblePoints = new THREE.Points(bubbleParticles, bMat);
  bubblePoints.renderOrder = 6; // Inside the water
  scene.add(bubblePoints);
}

function initMist() {
  const count = 4000;
  mistParticles = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const vel = new Float32Array(count * 3);
  const life = new Float32Array(count);
  for (let i = 0; i < count; i++) { life[i] = -1; pos[i*3+1] = -100; }
  
  mistParticles.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  mistParticles.setAttribute('velocity', new THREE.BufferAttribute(vel, 3));
  mistParticles.setAttribute('lifespan', new THREE.BufferAttribute(life, 1));
  
  const mMat = new THREE.PointsMaterial({
    size: 0.4,
    color: 0xeef9ff,
    transparent: true,
    opacity: 0.15,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  mistPoints = new THREE.Points(mistParticles, mMat);
  mistPoints.renderOrder = 11;
  scene.add(mistPoints);
}

function updateWaterSplash(delta, active, waterLevel) {
  const posArr = splashGeometry.attributes.position.array;
  const velArr = splashGeometry.attributes.velocity.array;
  const lifeArr = splashGeometry.attributes.lifespan.array;

  // Mist references
  const mPosArr = mistParticles.attributes.position.array;
  const mVelArr = mistParticles.attributes.velocity.array;
  const mLifeArr = mistParticles.attributes.lifespan.array;

  // Bubble references
  const bPosArr = bubbleParticles.attributes.position.array;
  const bVelArr = bubbleParticles.attributes.velocity.array;
  const bLifeArr = bubbleParticles.attributes.lifespan.array;

  const impactY = TANK_BASE_Y + 0.15 + waterLevel * TANK_H;
  const tankTop = TANK_BASE_Y + TANK_H + 0.15;
  const tankRad = TANK_D / 2 - 0.08;

  // 1. EMISSION
  const flowIntensity = curPumpFlow / PUMP_FLOW_NOMINAL;
  if (flowIntensity > 0.1) {
    const rate = Math.min(Math.floor(45 * flowIntensity * Math.max(1, timeScale / 1.5)), 150); 
    const mRate = Math.min(Math.floor(25 * flowIntensity * Math.max(1, timeScale / 1.5)), 60);

    for (let i = 0; i < rate; i++) {
      const idx = nextPIdx;
      nextPIdx = (nextPIdx + 1) % lifeArr.length;

      const angle = Math.random() * Math.PI * 2;
      const r = 0.02 + Math.random() * 0.07;
      posArr[idx * 3]     = INLET_WX + Math.cos(angle) * r;
      posArr[idx * 3 + 1] = INLET_WY - Math.random() * 0.05;
      posArr[idx * 3 + 2] = INLET_WZ + Math.sin(angle) * r;

      velArr[idx * 3]     = Math.cos(angle) * (0.2 + Math.random() * 0.4);
      velArr[idx * 3 + 1] = -(5.0 + Math.random() * 4.0); // Faster initial plunge
      velArr[idx * 3 + 2] = Math.sin(angle) * (0.2 + Math.random() * 0.4);

      lifeArr[idx] = 1.8;
    }

    // Mist Emission (around impact)
    if (INLET_WY > impactY) {
      for (let i = 0; i < mRate; i++) {
        const mIdx = Math.floor(Math.random() * (mLifeArr.length / 1)); // Random reuse
        if (mLifeArr[mIdx] <= 0) {
          const a = Math.random() * Math.PI * 2;
          const mr = Math.random() * 0.4;
          mPosArr[mIdx * 3] = INLET_WX + Math.cos(a) * mr;
          mPosArr[mIdx * 3 + 1] = impactY + 0.05;
          mPosArr[mIdx * 3 + 2] = INLET_WZ + Math.sin(a) * mr;
          
          mVelArr[mIdx * 3] = Math.cos(a) * (0.2 + Math.random() * 0.4);
          mVelArr[mIdx * 3 + 1] = 0.5 + Math.random() * 1.0;
          mVelArr[mIdx * 3 + 2] = Math.sin(a) * (0.2 + Math.random() * 0.4);
          mLifeArr[mIdx] = 0.8 + Math.random() * 0.6;
        }
      }
    }
  }

  // 2. PHYSICS UPDATE
  const maxStep = 0.016;
  const substeps = Math.ceil(delta / maxStep);
  const subDelta = delta / substeps;

  for (let s = 0; s < substeps; s++) {
    // Splash Particles
    for (let i = 0; i < lifeArr.length; i++) {
      if (lifeArr[i] > 0) {
        // Air Resistance (Drag)
        velArr[i * 3] *= 0.99;
        velArr[i * 3 + 1] *= 0.99;
        velArr[i * 3 + 2] *= 0.99;
        
        velArr[i * 3 + 1] -= subDelta * 9.8;
        posArr[i * 3] += velArr[i * 3] * subDelta;
        posArr[i * 3 + 1] += velArr[i * 3 + 1] * subDelta;
        posArr[i * 3 + 2] += velArr[i * 3 + 2] * subDelta;
        lifeArr[i] -= subDelta;

        const dX = posArr[i * 3], dY = posArr[i * 3 + 1], dZ = posArr[i * 3 + 2];
        const distSq = dX * dX + dZ * dZ;

        if (distSq > tankRad * tankRad || dY > tankTop) {
          lifeArr[i] = -1; posArr[i * 3 + 1] = -100;
        } else if (dY < impactY && velArr[i * 3 + 1] < 0) {
          triggerRipple(dX, impactY + 0.02, dZ);
          
          // Spawn underwater bubble on impact
          const bIdx = Math.floor(Math.random() * bLifeArr.length);
          if (bLifeArr[bIdx] <= 0) {
            bPosArr[bIdx * 3] = dX;
            bPosArr[bIdx * 3 + 1] = impactY - 0.05;
            bPosArr[bIdx * 3 + 2] = dZ;
            bVelArr[bIdx * 3] = (Math.random() - 0.5) * 0.3;
            bVelArr[bIdx * 3 + 1] = -(1.0 + Math.random() * 2.0); // Plunge down
            bVelArr[bIdx * 3 + 2] = (Math.random() - 0.5) * 0.3;
            bLifeArr[bIdx] = 2.0 + Math.random() * 1.5;
          }

          // Ricochet splash
          velArr[i * 3] *= 3.0;
          velArr[i * 3 + 2] *= 3.0;
          velArr[i * 3 + 1] = Math.abs(velArr[i * 3 + 1]) * 0.25;
          posArr[i * 3 + 1] = impactY + 0.02;
          lifeArr[i] = Math.min(lifeArr[i], 0.25);
        }

        if (lifeArr[i] <= 0) { lifeArr[i] = -1; posArr[i * 3 + 1] = -100; }
      }
    }

    // Mist Particles
    for (let i = 0; i < mLifeArr.length; i++) {
      if (mLifeArr[i] > 0) {
        mVelArr[i * 3] *= 0.96; // Air resistance
        mVelArr[i * 3 + 2] *= 0.96;
        mPosArr[i * 3] += mVelArr[i * 3] * subDelta;
        mPosArr[i * 3 + 1] += mVelArr[i * 3 + 1] * subDelta;
        mPosArr[i * 3 + 2] += mVelArr[i * 3 + 2] * subDelta;
        mLifeArr[i] -= subDelta;
        if (mLifeArr[i] <= 0) { mLifeArr[i] = -1; mPosArr[i * 3 + 1] = -100; }
      }
    }

    // Bubble Particles
    for (let i = 0; i < bLifeArr.length; i++) {
      if (bLifeArr[i] > 0) {
        // Buoyancy force (rising up after initial plunge)
        bVelArr[i * 3 + 1] += subDelta * 4.0;
        bVelArr[i * 3] *= 0.95;
        bVelArr[i * 3 + 2] *= 0.95;
        
        bPosArr[i * 3] += bVelArr[i * 3] * subDelta;
        bPosArr[i * 3 + 1] += bVelArr[i * 3 + 1] * subDelta;
        bPosArr[i * 3 + 2] += bVelArr[i * 3 + 2] * subDelta;
        bLifeArr[i] -= subDelta;
        
        // Die at surface or tank bottom
        if (bPosArr[i * 3 + 1] > impactY || bPosArr[i * 3 + 1] < TANK_BASE_Y + 0.2) {
          bLifeArr[i] = -1; bPosArr[i * 3 + 1] = -100;
        }
      }
    }
  }

  splashGeometry.attributes.position.needsUpdate = true;
  mistParticles.attributes.position.needsUpdate = true;
  bubbleParticles.attributes.position.needsUpdate = true;
  splashGeometry.attributes.lifespan.needsUpdate = true;
  mistParticles.attributes.lifespan.needsUpdate = true;
  bubbleParticles.attributes.lifespan.needsUpdate = true;

  // Ripples
  ripples.forEach(r => {
    if (r.visible) {
      r.scale.x += delta * 6;
      r.scale.y += delta * 6;
      r.material.opacity -= delta * 3.8;
      if (r.material.opacity <= 0) r.visible = false;
    }
  });
}

function triggerRipple(x, y, z) {
  // Ensure ripple stays within tank radius
  const tankRad = TANK_D / 2 - 0.15;
  const dist = Math.sqrt(x * x + z * z);
  if (dist > tankRad) {
    const scale = tankRad / (dist + 0.001);
    x *= scale;
    z *= scale;
  }
  const r = ripples.find(rp => !rp.visible);
  if (r) {
    r.position.set(x, y, z);
    r.scale.set(1, 1, 1);
    r.material.opacity = 0.6;
    r.visible = true;
  }
}

/* ================================================================
   TANK TOP RAILING & LID
================================================================ */
function buildTankTopRailing() {
  const base = TANK_BASE_Y;
  const topY = base + TANK_H + 0.15; // Top of shell

  // Lid
  const coverRad = TANK_D / 2 + 0.3;
  const coverMat = new THREE.MeshPhongMaterial({
    color: 0xc8d6e5, transparent: true, opacity: 0.65,
    shininess: 120, side: THREE.DoubleSide, depthWrite: false
  });
  const cover = new THREE.Mesh(new THREE.CylinderGeometry(coverRad, coverRad, 0.22, 64), coverMat);
  cover.position.set(0, topY + 0.11, TANK_Z);
  cover.renderOrder = 10;
  scene.add(cover);

  const lidTopY = topY + 0.22;

  const bMat = new THREE.MeshPhongMaterial({ color: 0x444444, shininess: 80 });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.12, 8), bMat);
    bolt.position.set(Math.cos(a) * (TANK_D / 2 + 0.1), topY + 0.11, TANK_Z + Math.sin(a) * (TANK_D / 2 + 0.1));
    scene.add(bolt);
  }

  // Posts & rails around top
  const pMat = new THREE.MeshPhongMaterial({ color: 0xddcc00, shininess: 70 });
  const railRad = coverRad - 0.08;

  // Adjusted posts to skip ladder gap (which is at Math.PI/2)
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    if (Math.abs(a - Math.PI / 2) < 0.4) continue;

    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 1.1, 8), pMat);
    post.position.set(Math.cos(a) * railRad, lidTopY + 0.55, TANK_Z + Math.sin(a) * railRad);
    scene.add(post);
  }

  const gapAngle = 0.35;
  [Math.PI / 2 - gapAngle, Math.PI / 2 + gapAngle].forEach(a => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 1.1, 8), pMat);
    post.position.set(Math.cos(a) * railRad, lidTopY + 0.55, TANK_Z + Math.sin(a) * railRad);
    scene.add(post);
  });

  // Partial rails (opening at the ladder)
  for (let h = 0; h < 3; h++) {
    const railArc = Math.PI * 2 - (gapAngle * 2.2);
    const rail = new THREE.Mesh(new THREE.TorusGeometry(railRad, 0.02, 8, 64, railArc), pMat);
    rail.position.set(0, lidTopY + 0.2 + h * 0.36, TANK_Z);
    rail.rotation.x = Math.PI / 2;
    rail.rotation.z = Math.PI / 2 + gapAngle * 1.1;
    scene.add(rail);
  }
}

function buildLadder() {
  const base = PLAT_Y; // Ladder starts on platform deck
  const ladH = TANK_H + TANK_Y_OFF + 1.2, ladDist = TANK_D / 2 + 0.45, ladW = 0.44;
  const rMat = new THREE.MeshPhongMaterial({ color: 0x556677, shininess: 70 });
  const rgMat = new THREE.MeshPhongMaterial({ color: 0x8a9aa8, shininess: 40 });

  // Rails
  const railGeo = new THREE.CylinderGeometry(0.025, 0.025, ladH, 12);
  [-ladW / 2, ladW / 2].forEach(x => {
    const r = new THREE.Mesh(railGeo, rMat);
    r.position.set(x, base + ladH / 2, TANK_Z + ladDist);
    r.castShadow = true;
    scene.add(r);

    // Base plates where ladder hits platform
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.03, 16), rMat);
    plate.position.set(x, base + 0.015, TANK_Z + ladDist);
    scene.add(plate);
  });

  // Rungs
  const nRungs = Math.floor(ladH / 0.3);
  for (let i = 1; i <= nRungs; i++) {
    const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, ladW, 8), rgMat);
    rung.position.set(0, base + i * 0.3, TANK_Z + ladDist);
    rung.rotation.z = Math.PI / 2;
    scene.add(rung);
  }

  // Standoff Brackets (connect ladder to tank)
  for (let i = 1; i <= 3; i++) {
    const y = TANK_BASE_Y + i * (TANK_H / 3);
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(ladW + 0.1, 0.03, 0.5), rMat);
    bracket.position.set(0, y + 0.15, TANK_Z + TANK_D / 2 + 0.25);
    scene.add(bracket);
  }
}

/* ================================================================
   WATER LEVEL GAUGE
================================================================ */
function buildGauge() {
  const base = TANK_BASE_Y;
  const gx = TANK_D / 2 + 0.2, gz = TANK_Z - 0.5;
  const gaugeH = TANK_H;

  const fMat = new THREE.MeshPhongMaterial({ color: 0x22303f, shininess: 55 });
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.60, gaugeH + 0.22, 0.13), fMat);
  frame.position.set(gx, base + gaugeH / 2 + 0.25, gz);
  scene.add(frame);

  const pMat = new THREE.MeshPhongMaterial({ color: 0xecf2f8, shininess: 45 });
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.50, gaugeH, 0.10), pMat);
  plate.position.set(gx, base + gaugeH / 2 + 0.25, gz);
  scene.add(plate);

  const tMat = new THREE.MeshPhongMaterial({ color: 0x111111 });
  for (let i = 0; i <= 10; i++) {
    const y = base + 0.25 + i * (gaugeH / 10);
    const tick = new THREE.Mesh(new THREE.BoxGeometry(i % 2 === 0 ? 0.14 : 0.08, 0.014, 0.018), tMat);
    tick.position.set(gx + 0.07, y, gz + 0.06);
    scene.add(tick);
  }

  // Pointer
  const grp = new THREE.Group();
  const ptrMat = new THREE.MeshPhongMaterial({ color: 0xff1a00, shininess: 80 });
  
  const ptrShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.25, 8), ptrMat);
  ptrShaft.rotation.z = Math.PI / 2;
  ptrShaft.position.set(-0.15, 0, 0.06);
  grp.add(ptrShaft);
  
  const ptrTip = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.075, 3), ptrMat);
  ptrTip.rotation.z = -Math.PI / 2;
  ptrTip.position.set(0, 0, 0.06);
  grp.add(ptrTip);
  
  grp.position.set(gx + 0.1, base + 0.25, gz);
  scene.add(grp);
  gaugePointer = grp;
}

/* ================================================================
   PLATFORM EQUIPMENT
================================================================ */
function buildEquipment() {
  buildControlBox();
  buildSeawaterPipes();
}

function buildControlBox() {
  const bxM = new THREE.MeshPhongMaterial({ color: 0x2a3e50, shininess: 35 });
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.85, 0.46), bxM);
  box.position.set(-4.0, PLAT_Y + 0.42, TANK_Z + 1.5);
  box.castShadow = true;
  scene.add(box);
  // Indicator lights
  [0xff2200, 0x00dd44, 0x0088ff].forEach((c, i) => {
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8),
      new THREE.MeshPhongMaterial({ color: c, emissive: c, emissiveIntensity: 0.65 }));
    led.position.set(-4.18 + i * 0.18, PLAT_Y + 0.55, TANK_Z + 1.2);
    scene.add(led);
  });
}

function buildSeawaterPipes() {
  const pipeMat = new THREE.MeshPhongMaterial({ color: 0x446688, shininess: 70 });
  const flanMat = new THREE.MeshPhongMaterial({ color: 0x778899, shininess: 80 });
  const valvMat = new THREE.MeshPhongMaterial({ color: 0x336644, shininess: 60 });
  const stemMat = new THREE.MeshPhongMaterial({ color: 0xcccccc, shininess: 100 });

  const base = TANK_BASE_Y;
  const pZ = TANK_Z + 0;
  const pY = base + 0.3; // Below the green sensor at 10% (4.75)

  // 1. Horizontal discharge pipe (Inlet from tank to valve)
  const pipe1 = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.8, 16), pipeMat);
  pipe1.rotation.z = Math.PI / 2;
  pipe1.position.set(TANK_D / 2 + 0.4, pY, 0);
  scene.add(pipe1);

  // Add a flange at the tank wall
  const tankFlange = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 16), flanMat);
  tankFlange.rotation.z = Math.PI / 2;
  tankFlange.position.set(TANK_D / 2 + 0.04, pY, 0);
  scene.add(tankFlange);

  // 4. DETAILED GATE VALVE
  const vX = 4.5;
  const valveGroup = new THREE.Group();

  // Valve Body (Main casting)
  const vBody = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 12), valvMat);
  vBody.scale.set(1.2, 1, 1);
  valveGroup.add(vBody);

  // Flanges (Bottom and Right-Entry)
  [
    { p: [-0.22, 0, 0], r: [0, 0, Math.PI / 2] },  // Side B (BOTTOM)
    { p: [0, -0.22, 0], r: [0, 0, 0] }           // Side C (RIGHT)
  ].forEach(f => {
    const fl = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.08, 16), valvMat);
    fl.rotation.set(...f.r);
    fl.position.set(...f.p);
    valveGroup.add(fl);

    // Bolt heads on flange
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.1, 8), stemMat);
      bolt.position.set(f.p[0] + (f.r[2] ? 0 : Math.cos(a) * 0.16), f.p[1] + (f.r[2] ? Math.cos(a) * 0.16 : 0), f.p[2] + Math.sin(a) * 0.16);
      if (f.r[2]) bolt.rotation.z = Math.PI / 2;
      valveGroup.add(bolt);
    }
  });

  // Bonnet (Top part)
  const bonnet = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.25, 16), valvMat);
  bonnet.position.y = 0.2;
  valveGroup.add(bonnet);

  // Stem (The rod)
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 8), stemMat);
  stem.position.y = 0.45;
  valveGroup.add(stem);

  // Handwheel
  const wheel = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.025, 8, 24), valvMat);
  rim.rotation.x = Math.PI / 2;
  wheel.add(rim);
  // Spokes
  for (let i = 0; i < 4; i++) {
    const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.44, 8), valvMat);
    spoke.rotation.z = Math.PI / 2;
    spoke.rotation.y = (i / 4) * Math.PI;
    wheel.add(spoke);
  }
  wheel.position.y = 0.75;
  valveGroup.add(wheel);

  valveGroup.position.set(2, pY, 0);
  valveGroup.rotation.y = 0;
  valveGroup.rotation.z = -Math.PI / 2;
  valveGroup.rotation.x = 0;

  scene.add(valveGroup);
  gateValveWheel = wheel;

  // 2. Vertical Discharge Pipe (Bottom side)
  const exitNoz = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 1.0, 16), pipeMat);
  exitNoz.position.set(2.0, pY - 0.72, 0);
  scene.add(exitNoz);

  // 4. Horizontal connection pipe (Tank to valve - Right side of valve from world view)
  const connPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.2, 16), pipeMat);
  connPipe.rotation.z = Math.PI / 2;
  connPipe.position.set(2.12, pY, 0);
  scene.add(connPipe);
}



/* ================================================================
   SEAGULLS
================================================================ */
function buildBirds() {
  const gMat = new THREE.MeshBasicMaterial({ color: 0xd0dde8, side: THREE.DoubleSide });
  [
    [22, 10, -30], [-28, 8, -40],
    [8, 14, -50], [-6, 11, -60],
    [38, 9, -25]
  ].forEach(([px, py, pz]) => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(0.5, 0.38, 1.1, 0);
    shape.quadraticCurveTo(1.7, 0.38, 2.2, 0);
    const geo = new THREE.ShapeGeometry(shape);
    const bird = new THREE.Mesh(geo, gMat);
    bird.position.set(px, py, pz);
    bird.scale.set(0.9, 0.7, 0.9);
    bird.userData.baseY = py;
    bird.userData.ph = Math.random() * Math.PI * 2;
    scene.add(bird);
  });
}
function buildAlarmBeacon() {
  const beaconGroup = new THREE.Group();
  
  // Base
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 0.2, 16), new THREE.MeshPhongMaterial({ color: 0x222222 }));
  beaconGroup.add(base);
  
  // Bulb/Internal
  const bulb = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.3, 8), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
  bulb.position.y = 0.2;
  beaconGroup.add(bulb);
  
  // Transparent Red Housing
  const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.6, 16), 
    new THREE.MeshPhongMaterial({ color: 0xff0000, transparent: true, opacity: 0.4, shininess: 100 }));
  housing.position.y = 0.25;
  beaconGroup.add(housing);
  
  // Rotating Light Component
  const lightTarget = new THREE.Group();
  const spot = new THREE.PointLight(0xff0000, 0, 10);
  spot.position.set(0.5, 0.2, 0);
  lightTarget.add(spot);
  beaconGroup.add(lightTarget);
  
  beaconGroup.position.set(-2.8, PLAT_Y + 0.1, TANK_Z + 1.5);
  scene.add(beaconGroup);
  alarmBeacon = { group: beaconGroup, light: spot, target: lightTarget };
}
/* ================================================================
   UPDATE FUNCTIONS
================================================================ */
function updateWaterLevel(level) {
  if (tankWater) {
    const waterH = level * TANK_H;
    tankWater.scale.y = Math.max(0.001, waterH / TANK_H);
    tankWater.position.y = (TANK_BASE_Y + 0.15) + (waterH / 2);
    
    // Update Surface position
    if (tankSurface) {
      tankSurface.position.y = (TANK_BASE_Y + 0.15) + waterH + 0.01;
      
      // Dynamic surface waves based on pump activity
      const t = clock.elapsedTime;
      const waveFreq = PLC_Q.q00 ? 10.0 : 2.0;
      const waveAmp = PLC_Q.q00 ? 0.05 : 0.01;
      
      // Jitter the surface slightly for "churning" look
      tankSurface.rotation.z = t * 0.2;
      tankSurface.scale.set(1.0 + Math.sin(t * waveFreq) * waveAmp, 1.0 + Math.cos(t * waveFreq) * waveAmp, 1.0);
    }
  }

  if (gaugePointer) {
    gaugePointer.position.y = TANK_BASE_Y + 0.25 + level * TANK_H;
  }

  const col = level < 0.1 ? 0xff3300 : level < 0.2 ? 0x0960a0 : 0x007bbb;
  tankWaterMat.color.setHex(col);

  const pct = Math.round(level * 100);
  document.getElementById('lvl-val').textContent = pct + '%';
  document.getElementById('lvl-bar').style.width = pct + '%';
  document.getElementById('flow-val').textContent = (curFlow * 3600).toFixed(2) + ' m³/h';

  // Update PLC LEDs
  document.getElementById('led-pump').classList.toggle('active', PLC_Q.q00);
  document.getElementById('led-valve').classList.toggle('active', PLC_Q.q01);
  document.getElementById('led-alarm').classList.toggle('active', PLC_Q.q02);

  document.getElementById('bit-i00').classList.toggle('active', PLC_I.i00);
  document.getElementById('bit-i01').classList.toggle('active', PLC_I.i01);
  document.getElementById('bit-i02').classList.toggle('active', PLC_I.i02);
}

function log(msg) {
  const box = document.getElementById('log-box');
  if (!box) return;
  const div = document.createElement('div');
  div.className = 'log-entry';
  div.style.color = '#000'; // Ensure black text
  div.innerHTML = `<span class="log-ts">[${new Date().toLocaleTimeString()}]</span> ${msg}`;
  box.appendChild(div);
  
  // Keep only last 100 entries to prevent memory leak
  if (box.children.length > 100) box.firstChild.remove();
  
  // AUTO-SCROLL TO NEWEST ENTRY
  box.scrollTop = box.scrollHeight;
}

function resetSystemUI() {
  resetSystem(); // Calls function in plc.js
}

/* ================================================================
   CAMERA
================================================================ */
function updateCamera() {
  tRotY = Math.max(-0.18, Math.min(1.1, tRotY));
  camera.position.set(
    Math.cos(tRotX) * Math.cos(tRotY) * camDist + panTarget.x,
    Math.sin(tRotY) * camDist + PLAT_Y + panTarget.y,
    Math.sin(tRotX) * Math.cos(tRotY) * camDist + panTarget.z
  );
  camera.lookAt(panTarget.x, PLAT_Y + 2 + panTarget.y, panTarget.z + PLAT_Z);
}

function setupEvents() {
  const el = renderer.domElement;
  el.addEventListener('mousedown', e => {
    if (e.button === 0) { mDown = true; mX0 = e.clientX; mY0 = e.clientY; tX0 = tRotX; tY0 = tRotY; }
    if (e.button === 2) { rDown = true; rX0 = e.clientX; rY0 = e.clientY; }
  });
  el.addEventListener('mousemove', e => {
    if (mDown) {
      tRotX = tX0 + (e.clientX - mX0) * 0.005;
      tRotY = tY0 + (e.clientY - mY0) * 0.005;
      updateCamera();
    }
    if (rDown) {
      panTarget.x -= (e.clientX - rX0) * 0.015;
      panTarget.z -= (e.clientY - rY0) * 0.015;
      rX0 = e.clientX; rY0 = e.clientY;
      updateCamera();
    }
  });
  el.addEventListener('mouseup', () => { mDown = false; rDown = false; });
  el.addEventListener('wheel', e => {
    e.preventDefault();
    camDist = Math.max(6, Math.min(100, camDist + e.deltaY * 0.03));
    updateCamera();
  }, { passive: false });
  document.getElementById('btn-stop').addEventListener('click', () => {
    PLC_I.manualStop = true;
    log("MANUAL STOP ACTIVATED");
  });
  document.getElementById('btn-reset').addEventListener('click', () => {
    resetSystem();

    // Reset Simulation Physics
    simTime = 0;
    fillingTime = 0;
    lastChartSimTime = 0;
    curVol = 0.05 * MAX_VOL;
    baseConsumption = 0;
    leakEnabled = false;
    clearChart();

    // Reset Data Log
    dataLog = [];
    lastDataLogSimTime = -1;

    // Reset Task UI
    if (window.resetTask1UI) window.resetTask1UI();

    // Reset scenario state
    scenarioActive = false;
    document.querySelectorAll('.scenario-card').forEach(c => c.classList.remove('active'));
    document.getElementById('scenario-details').style.display = 'none';
    const resCon = document.getElementById('results-container');
    if (resCon) resCon.classList.add('hidden');

    // Hide fault injection buttons and clear their styles
    document.getElementById('fault-injection-list').classList.add('hidden');
    document.querySelectorAll('.fault-btn').forEach(b => {
      b.classList.remove('active-fault');
      b.style.background = '#fff';
      b.style.color = '#000';
    });

    // Reset UI button styles
    const manualBtn = document.getElementById('btn-manual-pump');
    manualBtn.style.background = "#004400";
    manualBtn.style.color = "#fff";
    const forceBtn = document.getElementById('active-force-pump');
    forceBtn.style.background = "#1e3a5a";
    forceBtn.style.color = "#fff";

    // Restore Baseline Flow Specs
    activePumpFlow = PUMP_FLOW_NOMINAL;
    document.getElementById('spec-pump-cap').innerText = "10.0 m³/h";

    // Reset Simulation Speed Slider
    timeScale = 1.0;
    const speedSlider = document.getElementById('speed-slider');
    if (speedSlider) speedSlider.value = 1;
    const speedVal = document.getElementById('speed-val');
    if (speedVal) speedVal.textContent = "1x";

    // Reset Analysis Task trackers & hide results
    if (typeof hysteresisLog !== 'undefined') hysteresisLog = [];
    if (typeof _task2 !== 'undefined') {
      _task2 = { triggerTime: null, shutdownTime: null, prevI02: false, prevQ00: false };
    }
    ['task1-results', 'task2-results'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });

    log("SYSTEM RESET: Faults cleared, baseline 10 m³/h restored.");
  });

  document.getElementById('btn-download-csv').addEventListener('click', () => {
    downloadLogCSV();
  });

  document.getElementById('btn-manual-pump').addEventListener('click', (e) => {
    PLC_I.manualPump = !PLC_I.manualPump;
    e.target.style.background = PLC_I.manualPump ? "#00ff88" : "#004400";
    e.target.style.color = PLC_I.manualPump ? "#000" : "#fff";
    log(PLC_I.manualPump ? "MANUAL OVERRIDE: Pump forced ON" : "Manual pump override released");
  });

  const speedSlider = document.getElementById('speed-slider');
  const speedVal = document.getElementById('speed-val');
  if (speedSlider && speedVal) {
    speedSlider.addEventListener('input', (e) => {
      timeScale = parseFloat(e.target.value);
      speedVal.textContent = timeScale + "x";
      
      // Only log if it's a significant change to avoid spamming the log
      // or just log on change end (but input is live)
    });
    
    speedSlider.addEventListener('change', (e) => {
      log("TIME COMPRESSION: " + timeScale + "x active (Physics sub-stepping engaged)");
    });
  }



  // Fault Injection Button Listeners
  document.querySelectorAll('.fault-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const type = e.target.getAttribute('data-fault');
      const isActive = e.target.classList.toggle('active-fault');
      
      if (!isActive) {
          // RESET LOGIC
          if (type === 'cavitation') { pumpEfficiency = 1.0; alarmState.efficiency_loss = false; }
          if (type === 'low_sensor') { faults.low_sensor_fail = false; alarmState.low_sensor_failure = false; }
          if (type === 'high_stuck') { faults.high_sensor_stuck = false; alarmState.sensor_stiction = false; }
          if (type === 'valve_stuck') { faults.valve_stuck_open = false; alarmState.unintended_drain = false; }
          log("CLEARED: " + type.replace('_', ' ') + " fault removed");
      } else {
          injectFault(type);
      }
      
      e.target.style.background = isActive ? "#ff4444" : "#fff";
      e.target.style.color = isActive ? "#fff" : "#000";
    });
  });

  document.getElementById('active-force-pump').addEventListener('click', (e) => {
    forceInlet = !forceInlet;
    e.target.style.background = forceInlet ? "#00ff88" : "#1e3a5a";
    e.target.style.color = forceInlet ? "#000" : "#fff";
    log(forceInlet ? "MANUAL OVERRIDE: Inlet flow forced ON" : "Inlet override disabled");
  });

  window.addEventListener('resize', () => {
    const container = document.getElementById('container');
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });
}

/**
 * runScenario: Triggers specific simulation conditions
 */
window.runScenario = function(type) {
  // Update UI selection
  document.querySelectorAll('.scenario-card').forEach(c => c.classList.remove('active'));
  const cards = document.querySelectorAll('.scenario-card');
  const details = document.getElementById('scenario-details');

  resetSystem(); // Reset PLC in plc.js
  clearChart(); // Clear the live plot
  dataLog = []; // Clear recorded time-series data
  if (typeof hysteresisLog !== 'undefined') hysteresisLog = [];
  
  simTime = 0; // Reset timer
  curPumpFlow = 0;
  lastDataLogSimTime = -1;
  scenarioActive = true;
  PLC_I.armed = true; // Arm the logic only after selection
  if (window.resetTask1UI && !window._task1SelfLaunch) window.resetTask1UI();
  
  // Update Specs UI to Baseline initially
  document.getElementById('spec-pump-cap').innerText = "10.0 m³/h";
  activePumpFlow = PUMP_FLOW_NOMINAL;
  expectedRiseRate = 0.00265;

  // Show details panel now that something is selected
  details.style.display = 'block';
  const resCon = document.getElementById('results-container');
  if (resCon) resCon.classList.remove('hidden');
  
  if (type === 'A') {
    cards[0].classList.add('active');
    curVol = 0.05 * MAX_VOL; // Start empty for fill test
    leakEnabled = false;
    
    // Net rise rate: 22.62 m³/h ÷ 3.1415 m² = 0.002 m/s = 0.12 m/min (no drain offset needed)
    activePumpFlow = 22.62 / 3600;
    expectedRiseRate = 0.006;
    baseConsumption = 0;
    document.getElementById('spec-pump-cap').innerText = "22.62 m³/h";
    
    log("SCENARIO A: Starting Automatic Fill (Calibrated for 0.12 m/min)");
    document.getElementById('scenario-plot').src = 'img/scenario_a_plot.png';
    details.innerHTML = `
      <div style="background: rgba(0, 0, 0, 0.05); padding: 12px; border-radius: 4px; border: 2px solid #000;">
        <strong style="color: #000; display: block; margin-bottom: 6px; font-weight: 900;">Scenario A: Automatic Filling from Empty Tank</strong>
        <ol style="font-size: 11px; font-weight: 700; padding-left: 18px;">
          <li>1. Set initial tank level to 5% (below low-level sensor)</li>
          <li>2. Run simulation for 300 seconds</li>
          <li>3. Observe:</li>
          <ul style="list-style: none; padding-left: 10px; margin-top: 5px;">
            <li>o Pump starts when low-level sensor triggers</li>
            <li>o Tank level rises at approximately 0.12 m/min (22.62 m³/h)</li>
            <li>o At 50% level, mid-sensor activates (logged, no pump action)</li>
            <li>o At 91% level, high-sensor triggers pump shutdown</li>
            <li>o Final level stabilizes at 88–91% (hysteresis hunting)</li>
          </ul>
        </ol>
      </div>`;
    
  }
  fillingTime = 0; // Reset filling counter

  
  if (type === 'B') {
    cards[1].classList.add('active');
    curVol = 0.90 * MAX_VOL; // Start full for leak test
    leakEnabled = true;
    log("SCENARIO B: Maintaining Level against 2m³/h Discharge");
    document.getElementById('scenario-plot').src = 'img/scenario_b_plot.png';
    details.innerHTML = `
      <div style="background: rgba(0, 0, 0, 0.05); padding: 12px; border-radius: 4px; border: 2px solid #000;">
        <strong style="color: #000; display: block; margin-bottom: 6px; font-weight: 900;">Scenario B: Maintaining Level against Outlet Leak</strong>
        <ol style="font-size: 11px; font-weight: 700; padding-left: 18px;">
          <li>1. Set constant outlet flow: 2 m³/h (simulating leak/discharge)</li>
          <li>2. PLC maintains level by modulating pump on/off</li>
          <li>3. Observe pump duty cycle (ratio of on-time to total time)</li>
          <li>4. Record time to reach steady state (approximately 600 seconds)</li>
        </ol>
      </div>`;

  }
  
  if (type === 'C') {
    cards[2].classList.add('active');
    curVol = 0.75 * MAX_VOL; // Start at 75% so Fault 3 drain is clearly visible
    leakEnabled = false;
    diagnosticsActive = true; // Enable diagnostics for Scenario C (Fault Timeline)
    document.getElementById('scenario-plot').src = 'img/scenario_c_plot.png';
    log("Automated Fault Timeline Initiated — Fault 3 (Valve Stuck OPEN) auto-injects at t=300s");
    
    // Show Fault Injection Controls for Scenario C
    document.getElementById('fault-injection-list').classList.remove('hidden');

    details.innerHTML = `
      <div style="background: rgba(0, 0, 0, 0.05); padding: 12px; border-radius: 4px; border: 2px solid #000;">
        <strong style="color: #000; display: block; margin-bottom: 6px; font-weight: 900;">Fault Injection Timeline</strong>
        <ul style="font-size: 11px; font-weight: 700; padding-left: 18px; margin-bottom: 10px;">
          <li>• Initial tank level: 50% (2.5 m)</li>
          <li>• t=150s: Low-Level Sensor Failure — water level ~53%</li>
          <li>• t=200s: High-Level Sensor Stuck</li>
          <li>• t=250s: Pump Cavitation</li>
        </ul>
        <strong style="color: #000; display: block; margin-bottom: 4px; font-weight: 900;">Fault 1: Low-Level Sensor Failure (Open Circuit)</strong>
        <ol style="font-size: 11px; font-weight: 700; padding-left: 18px;">
          <li>At t=150s, inject open-circuit fault on low-level sensor</li>
          <li>Expected: Pump should NOT start when tank drops below low level</li>
          <li>Recovery: Operator manually activates pump; system logs sensor fault</li>
          <li>Task: Identify which sensor failed and use manual override</li>
        </ol>
        <strong style="color: #000; display: block; margin-bottom: 4px; font-weight: 900; margin-top: 10px;">Fault 2: High-Level Sensor Stuck HIGH (I0.2)</strong>
        <ol style="font-size: 11px; font-weight: 700; padding-left: 18px;">
          <li>At t=200s, high-level sensor I0.2 is forced ON (always reads "full")</li>
          <li>Expected: Pump shuts down immediately via Safety Interlock (Network 2)</li>
          <li>Recovery: 10s watchdog detects sustained HIGH reading below 90% threshold</li>
          <li>Task: Observe WATCHDOG START → WARNING → ALARM sequence in the log</li>
        </ol>
        <strong style="color: #c00; display: block; margin-bottom: 4px; font-weight: 900; margin-top: 10px;">Fault 3: Outlet Valve Stuck OPEN ← Task: Design Diagnostic Alarm</strong>
        <ol style="font-size: 11px; font-weight: 700; padding-left: 18px;">
          <li>Auto-injects at t=300s (or use "Valve Stuck OPEN" button anytime)</li>
          <li>Symptom: Tank drains continuously — pump ON but level still falls below 50%</li>
          <li>Diagnostic: PLC watchdog detects Q0.1=TRUE + pump running + level falling for 8s</li>
          <li>Alarm: ⚠ Q0.2 activates, valve wheel flashes RED, log shows WATCHDOG START → WARNING → ALARM</li>
          <li>Recovery: EMERGENCY STOP → isolate outlet manually → drain tank → inspect valve seat</li>
        </ol>
      </div>`;

  } else {
    // Hide Fault Injection Controls for other scenarios
    document.getElementById('fault-injection-list').classList.add('hidden');
  }

};


function initChart() {
  const ctx = document.getElementById('realtime-chart').getContext('2d');
  liveChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'Level (%)',
        data: [],
        borderColor: '#000000',
        borderWidth: 3,
        tension: 0.1,
        pointRadius: 0,
        fill: true,
        backgroundColor: 'rgba(0, 0, 0, 0.03)'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      scales: {
        x: { display: false },
        y: { 
          min: 0, 
          max: 100, 
          grid: { color: '#dddddd' }, 
          ticks: { 
            color: '#000000', 
            font: { size: 11, weight: '800' },
            stepSize: 5,
            autoSkip: false 
          } 
        }
      },
      plugins: { 
        legend: { display: false },
        annotation: {
          annotations: {
            lowLine: { type: 'line', yMin: 10, yMax: 10, borderColor: '#000', borderWidth: 1, borderDash: [2, 2], label: { content: 'LOW', enabled: true, position: 'end', backgroundColor: '#fff', color: '#000', font: { size: 9, weight: 'bold' } } },
            midLine: { type: 'line', yMin: 50, yMax: 50, borderColor: '#000', borderWidth: 1, borderDash: [2, 2], label: { content: 'MID', enabled: true, position: 'end', backgroundColor: '#fff', color: '#000', font: { size: 9, weight: 'bold' } } },
            highLine: { type: 'line', yMin: 90, yMax: 90, borderColor: '#000', borderWidth: 1, borderDash: [2, 2], label: { content: 'HIGH', enabled: true, position: 'end', backgroundColor: '#fff', color: '#000', font: { size: 9, weight: 'bold' } } }
          }
        }
      }
    }
  });
}

function updateChart(level) {
  if (!liveChart) return;
  
  // Update the chart based on SIMULATION TIME, not real time
  // At 30x speed, this will update 30x more often per real second
  if (simTime - lastChartSimTime < 0.5) return; 
  lastChartSimTime = simTime;

  const pct = Math.round(level * 100);
  liveChart.data.labels.push("");
  liveChart.data.datasets[0].data.push(pct);

  if (liveChart.data.labels.length > 300) { // More points for higher freq
    liveChart.data.labels.shift();
    liveChart.data.datasets[0].data.shift();
  }
  liveChart.update('none');
}

window.clearChart = function() {
  if (!liveChart) return;
  liveChart.data.labels = [];
  liveChart.data.datasets[0].data = [];
  liveChart.update();
};

function updateStatusSummary(level) {
  const el = document.getElementById('status-summary');
  if (!el) return;
  
  if (!scenarioActive && !PLC_I.manualPump && !PLC_I.manualStop) {
    el.textContent = "SYSTEM READY - SELECT SCENARIO (" + Math.round(level*100) + "%)";
    el.style.background = "#ffffff";
    el.style.color = "#000000";
    el.style.border = "2px solid #ccc";
    return;
  }

  if (PLC_I.manualStop) {
    el.textContent = "EMERGENCY STOP ACTIVE";
    el.style.background = "#000000";
    el.style.color = "#ffffff";
  } else if (PLC_Q.q02) {
    let msg = "SYSTEM ALARM: SENSOR FAULT";
    if (alarmState.low_sensor_failure) msg = "ALARM: LOW SENSOR FAILURE (I0.0)";
    if (alarmState.sensor_stiction) msg = "ALARM: HIGH SENSOR STUCK (I0.2)";
    if (alarmState.unintended_drain) msg = "ALARM: VALVE STUCK OPEN (DRAINING)";
    if (alarmState.efficiency_loss) msg = "ALARM: PUMP CAVITATION (LOW FLOW)";
    el.textContent = msg;
    el.style.background = "#ff0000"; // Red for alarm
    el.style.color = "#ffffff";
  } else if (PLC_Q.q00) {
    const isManual = PLC_I.manualPump;
    el.textContent = (isManual ? "MANUAL OVERRIDE: " : "") + "FILLING TANK (" + Math.round(level*100) + "%)";
    el.style.background = isManual ? "#00ff88" : "#f0f0f0";
    el.style.color = "#000000";
  } else if (PLC_Q.q01) {
    el.textContent = "DRAINING TANK (" + Math.round(level*100) + "%)";
    el.style.background = "#e0e0e0";
    el.style.color = "#000000";
  } else {
    el.textContent = "SYSTEM IDLE - STABLE";
    el.style.background = "#ffffff";
    el.style.color = "#aaaaaa";
  }
}

/* ================================================================
   LADDER LOGIC MONITOR UPDATE
================================================================ */
function updateLadderDisplay() {
  function setContact(id, passing) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('contact-passing', passing);
  }
  function setCoil(id, energized) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('coil-energized', energized);
  }
  function setNetwork(blockId, badgeId, badgeText, state) {
    const block = document.getElementById(blockId);
    const badge = document.getElementById(badgeId);
    if (block) {
      block.classList.remove('net-firing', 'net-alarm');
      if (state === 'firing') block.classList.add('net-firing');
      if (state === 'alarm')  block.classList.add('net-alarm');
    }
    if (badge) {
      badge.textContent = badgeText;
      badge.className = 'net-badge badge-' + (state === 'idle' ? 'idle' : state === 'firing' ? 'firing' : 'alarm');
    }
  }
  function setIO(id, active) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = active ? '■ ON' : '□ OFF';
    el.classList.toggle('io-active', active);
  }

  // NET 1: I0.0 NO · /I0.2 NC → Q0.0 PUMP
  setContact('nb1-c-i00', networkState.n1_i00);
  setContact('nb1-c-i02', networkState.n1_i02_nc);
  setCoil('nb1-coil', networkState.n1_output);
  setNetwork('nb-1', 'nb1-badge',
    networkState.n1_firing ? 'ACTIVE' : 'IDLE',
    networkState.n1_firing ? 'firing' : 'idle');

  // NET 2: I0.2 NO → (R)Q0.0 PUMP OFF
  setContact('nb2-c-i02', networkState.n2_i02);
  setCoil('nb2-coil', networkState.n2_firing);
  setNetwork('nb-2', 'nb2-badge',
    networkState.n2_firing ? 'SHUTOFF' : 'IDLE',
    networkState.n2_firing ? 'alarm' : 'idle');

  // NET 3: OVERFILL → Q0.1 VALVE
  setContact('nb3-c-alarm', networkState.n3_overfill);
  setCoil('nb3-coil', networkState.n3_output);
  setNetwork('nb-3', 'nb3-badge',
    networkState.n3_output ? 'DRAINING' : 'IDLE',
    networkState.n3_output ? 'alarm' : 'idle');

  // NET 4: SENSOR FAIL → SHUTDOWN
  setContact('nb4-c-fail', networkState.n4_sensorFail);
  setCoil('nb4-coil', networkState.n4_output);
  setNetwork('nb-4', 'nb4-badge',
    networkState.n4_firing ? 'FAULT!' : 'OK',
    networkState.n4_firing ? 'alarm' : 'idle');

  // NET 5: MANUAL STOP → STOP+DRAIN
  setContact('nb5-c-stop', networkState.n5_manualStop);
  setCoil('nb5-coil', networkState.n5_output);
  setNetwork('nb-5', 'nb5-badge',
    networkState.n5_firing ? 'ACTIVE' : 'IDLE',
    networkState.n5_firing ? 'alarm' : 'idle');

  // I/O STATE TABLE (Step 3)
  setIO('io-state-i00', PLC_I.i00);
  setIO('io-state-i01', PLC_I.i01);
  setIO('io-state-i02', PLC_I.i02);
  setIO('io-state-q00', PLC_Q.q00);
  setIO('io-state-q01', PLC_Q.q01);
  setIO('io-state-q02', PLC_Q.q02);
}

function playAlarmBeep() {
  if (!audioCtx) initAudio();
  if (audioCtx.state === 'suspended') audioCtx.resume();

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = 'square'; // Industrial harsh sound
  osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 note
  osc.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.1); // Pitch drop effect

  gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.start();
  osc.stop(audioCtx.currentTime + 0.2);
}
function initAudio() {
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  
  // Create continuous water flow sound
  const bufferSize = 2 * audioCtx.sampleRate,
        noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate),
        output = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
  }

  const whiteNoise = audioCtx.createBufferSource();
  whiteNoise.buffer = noiseBuffer;
  whiteNoise.loop = true;

  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 400;

  const gain = audioCtx.createGain();
  gain.gain.value = 0;

  whiteNoise.connect(filter);
  filter.connect(gain);
  gain.connect(audioCtx.destination);
  
  whiteNoise.start();
  waterSound = gain;
}

function downloadLogCSV() {
  if (dataLog.length === 0) {
    alert("No data recorded yet. Start a scenario to collect data.");
    return;
  }
  let csv = "Time(s),Level(%),Pump(Q0.0),Valve(Q0.1),LowSens(I0.0),MidSens(I0.1),HighSens(I0.2),Event\n";
  dataLog.forEach(d => {
    csv += `${d.time.toFixed(1)},${(d.level*100).toFixed(1)},${d.pump?1:0},${d.valve?1:0},${d.i00?1:0},${d.i01?1:0},${d.i02?1:0},"${d.event || ''}"\n`;
  });
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.setAttribute('hidden', '');
  a.setAttribute('href', url);
  a.setAttribute('download', `ballast_data_${new Date().getTime()}.csv`);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/* ================================================================
   ANIMATE
================================================================ */
function animate() {
  const realDelta = clock.getDelta();
  const delta = Math.min(realDelta, 0.1) * timeScale;
  simTime += delta;
  if (PLC_Q.q00) fillingTime += delta;
  const t = clock.elapsedTime;

  // Update live timer in sidebar
  // (Timer display removed per user request)



  // --- PHYSICS LAYER ---
  const level = curVol / MAX_VOL;

  // --- PLC SCAN CYCLE (External Engine) ---
  runPLCCycle(level, delta);
  if (window._updateTask2Tracker)  window._updateTask2Tracker();
  if (window.updateTask1Readiness) window.updateTask1Readiness();
  if (window.updateTask3Readiness) window.updateTask3Readiness();
  if (window.updateTask4Readiness) window.updateTask4Readiness();

  // --- DATA COLLECTION (1s intervals) ---
  if (simTime >= lastDataLogSimTime + 1.0) {
    dataLog.push({
      time: simTime,
      level: level,
      pump: PLC_Q.q00,
      valve: PLC_Q.q01,
      i00: PLC_I.i00,
      i01: PLC_I.i01,
      i02: PLC_I.i02,
      event: ""
    });
    lastDataLogSimTime = simTime;
  }

  // --- AUDIO ALARM & WATER SOUND ---
  if (PLC_Q.q02 && t - lastAlarmBeep > 0.8) {
    playAlarmBeep();
    lastAlarmBeep = t;
  }
  
  if (waterSound) {
    const targetVol = PLC_Q.q00 ? 0.15 : 0;
    waterSound.gain.setTargetAtTime(targetVol, audioCtx.currentTime, 0.1);
  }

  // --- ALARM BEACON ANIMATION ---
  if (alarmBeacon) {
    const active = PLC_Q.q02;
    alarmBeacon.light.intensity = active ? 2.0 : 0;
    if (active) {
      alarmBeacon.target.rotation.y += delta * 6; // Fast rotation
    }
  }

  // --- EDUCATIONAL WARNINGS (For Students) ---
  const hudLvl = document.getElementById('lvl-val');
  if (alarmState.low_sensor_failure || alarmState.sensor_stiction) {
    if (!hudLvl.dataset.faulted) {
      log("STUDENT NOTE: The pump has automatically SHUT DOWN. This is a 'Safety Interlock' because the PLC detected a sensor mismatch and can no longer guarantee the tank won't overflow or run dry.");
      hudLvl.dataset.faulted = "true";
    }
    // Make the HUD text flash red
    hudLvl.style.color = (Math.floor(t * 4) % 2) ? "#ff0000" : "#000000";
  } else {
    hudLvl.style.color = "#000000";
    delete hudLvl.dataset.faulted;
  }

  // AUTOMATED TIMELINE (Scenario C)
  if (scenarioActive && document.querySelectorAll('.scenario-card')[2].classList.contains('active')) {
    if (simTime >= 150 && simTime < 150.1 && !faults.low_sensor_fail) injectFault('low_sensor');
    if (simTime >= 200 && simTime < 200.1 && !faults.high_sensor_stuck) injectFault('high_stuck');
    if (simTime >= 250 && simTime < 250.1 && !faults.cavitation) injectFault('cavitation');
    if (simTime >= 300 && simTime < 300.1 && !faults.valve_stuck_open) injectFault('valve_stuck');
  }


  // --- PHYSICS ENGINE UPDATE ---
  // Valve motion logic (2s response time)
  const targetAperture = (PLC_Q.q01 || faults.valve_stuck_open) ? 1.0 : 0.0;
  if (valveAperture < targetAperture) valveAperture = Math.min(targetAperture, valveAperture + delta / VALVE_TIME);
  if (valveAperture > targetAperture) valveAperture = Math.max(targetAperture, valveAperture - delta / VALVE_TIME);

  // Rotate physical valve handwheel based on aperture
  if (gateValveWheel) {
    gateValveWheel.rotation.y = valveAperture * Math.PI * 4; // Multiple spins
    
    // Flash red if stuck open alarm is active
    if (alarmState.unintended_drain) {
      gateValveWheel.traverse(n => {
        if (n.isMesh) {
          n.material.emissive = new THREE.Color( (Math.floor(t * 5) % 2) ? 0xff0000 : 0x000000 );
          n.material.emissiveIntensity = 1.0;
        }
      });
    } else {
      gateValveWheel.traverse(n => {
        if (n.isMesh) {
          n.material.emissive = new THREE.Color(0x000000);
        }
      });
    }
  }

  // --- CAVITATION EFFECTS (Pump Vibration) ---
  const pumpMesh = scene.children.find(c => c.type === 'Group' && c.position.x === -4.5);
  if (pumpMesh && PLC_Q.q00 && faults.cavitation) {
    // High-frequency vibration
    pumpMesh.position.x = -4.5 + (Math.random() - 0.5) * 0.05;
    pumpMesh.position.y = (PLAT_Y + 0.55) + (Math.random() - 0.5) * 0.05;
  } else if (pumpMesh) {
    pumpMesh.position.x = -4.5;
    pumpMesh.position.y = PLAT_Y + 0.55;
  }

  // --- PUMP DYNAMICS (Task 2: Response Time) ---
  const targetFlow = PLC_Q.q00 ? (activePumpFlow * pumpEfficiency) : 0;
  if (curPumpFlow < targetFlow) {
    curPumpFlow = Math.min(targetFlow, curPumpFlow + delta * (activePumpFlow * 0.5)); // Ramp up (2s)
  } else if (curPumpFlow > targetFlow) {
    curPumpFlow = Math.max(0, curPumpFlow - delta * (activePumpFlow / 3.0)); // Coast down (3s)
  }
  let pIn = curPumpFlow;
  let vOut = (valveAperture * (PUMP_FLOW_NOMINAL * 3.0)) * (valveIsolated ? 0 : 1); // Solenoid max flow = 30 m³/h
  let leak = leakEnabled ? LEAK_FLOW_NOMINAL : 0;
  
  const consumption = baseConsumption;

  curFlow = pIn - vOut - leak - consumption;
  curVol = Math.max(0, Math.min(MAX_VOL, curVol + curFlow * delta));

  updateWaterLevel(curVol / MAX_VOL);
  updateChart(curVol / MAX_VOL);
  updateStatusSummary(curVol / MAX_VOL);
  updateLadderDisplay();
  updateDiagnosticsUI();

  // Update 3D Prob Glow Intensity based on PLC inputs


  // Update 3D Prob Glow Intensity based on PLC inputs
  if (sensorProbes.length >= 3) {
    // Low Level Probe (I0.0)
    if (alarmState.low_sensor_failure) {
      sensorProbes[0].material.emissive.setHex(0xff0000); // FLASH RED
      sensorProbes[0].material.emissiveIntensity = (Math.floor(t * 5) % 2) ? 2.0 : 0.2;
    } else {
      sensorProbes[0].material.emissive.setHex(0x007bbb); // Standard Blue
      sensorProbes[0].material.emissiveIntensity = PLC_I.i00 ? 1.0 : 0.1;
    }

    // Mid Level Probe (I0.1)
    sensorProbes[1].material.emissiveIntensity = PLC_I.i01 ? 1.0 : 0.1;

    // High Level Probe (I0.2)
    if (alarmState.sensor_stiction) {
      sensorProbes[2].material.emissive.setHex(0xff0000); // FLASH RED
      sensorProbes[2].material.emissiveIntensity = (Math.floor(t * 5) % 2) ? 2.0 : 0.2;
    } else {
      sensorProbes[2].material.emissive.setHex(0x007bbb); // Standard Blue
      sensorProbes[2].material.emissiveIntensity = PLC_I.i02 ? 1.0 : 0.1;
    }
  }

  // Tank water ripple
  if (tankWater) tankWater.rotation.y += 0.002;
  if (tankSurfaceMat) {
     // Animate surface "shimmer"
     tankSurfaceMat.emissiveIntensity = 0.1 + Math.abs(Math.sin(t * 2)) * 0.1;
  }

  // --- REFINED WATER FLOW ANIMATION ---
  if (waterFlowTex) {
    const flowIntensity = curPumpFlow / PUMP_FLOW_NOMINAL; // 0.0 to 1.0+
    
    // Smooth scrolling speed tied to physical flow
    waterFlowTex.offset.y += delta * flowIntensity * 2.5;
    
    // Subtle turbulence jitter (X-offset)
    waterFlowTex.offset.x = Math.sin(t * 15) * 0.002 * flowIntensity;

    // Update material opacity and emissive glow based on flow
    if (waterStreamMat) {
      // Find the water meshes in the pump group
      scene.traverse(node => {
        if (node.isMesh && node.material && node.material.map === waterFlowTex) {
          node.material.opacity = Math.min(0.9, flowIntensity * 1.5);
          node.material.emissiveIntensity = 0.2 + flowIntensity * 0.8;
        }
      });
    }
  }

  // Water stream + splash animation
  updateWaterStream(PLC_Q.q00, curVol / MAX_VOL);
  if (splashPoints) {
    updateWaterSplash(delta, PLC_Q.q00, curVol / MAX_VOL);
  }

  // Ocean waves
  if (oceanMesh) {
    const pos = oceanMesh.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + 60, z = pos.getZ(i);
      pos.setY(i,
        Math.sin(x * 0.07 + t * 0.65) * 0.25 +
        Math.cos(z * 0.10 + t * 0.48) * 0.18 +
        Math.sin((x + z) * 0.04 + t * 0.35) * 0.12
      );
    }
    pos.needsUpdate = true;
    oceanMesh.geometry.computeVertexNormals();
  }

  // Foam drift
  foamObjs.forEach(f => {
    f.userData.ph += delta * 0.6;
    f.position.x = f.userData.baseX + Math.sin(f.userData.ph) * 0.3;
    f.position.z = f.userData.baseZ + Math.cos(f.userData.ph * 0.7) * 0.2;
    f.material.opacity = 0.3 + 0.3 * Math.abs(Math.sin(f.userData.ph));
  });

  // Bird flight
  scene.children.forEach(obj => {
    if (obj.userData.baseY !== undefined) {
      obj.userData.ph += delta * 0.7;
      obj.position.y = obj.userData.baseY + Math.sin(obj.userData.ph) * 0.6;
      obj.position.x += Math.sin(obj.userData.ph * 0.25) * 0.03;
    }
  });

  renderer.render(scene, camera);
}

function createPumpModel() {
  const pumpGroup = new THREE.Group();

  // Materials
  const motorBlue = new THREE.MeshStandardMaterial({ color: 0x0011aa, roughness: 0.3, metalness: 0.7 });
  const darkGray = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6, metalness: 0.4 });
  const lightGray = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.4, metalness: 0.6 });
  const boltColor = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.5, metalness: 0.8 });
  const yellow = new THREE.MeshStandardMaterial({ color: 0xffcc00, emissive: 0x221100 });

  // --- MOTOR SECTION ---
  const motorBodyGeom = new THREE.CylinderGeometry(1.2, 1.2, 4, 32);
  const motorBody = new THREE.Mesh(motorBodyGeom, motorBlue);
  motorBody.rotation.z = Math.PI / 2;
  motorBody.position.x = -1;
  pumpGroup.add(motorBody);

  // Cooling Fins
  const finCount = 14;
  const finGeom = new THREE.BoxGeometry(3.8, 0.1, 0.3);
  for (let i = 0; i < finCount; i++) {
    const fin = new THREE.Mesh(finGeom, motorBlue);
    const angle = (i / finCount) * Math.PI * 2;
    fin.position.x = -1;
    fin.position.y = Math.cos(angle) * 1.25;
    fin.position.z = Math.sin(angle) * 1.25;
    fin.rotation.x = -angle;
    pumpGroup.add(fin);
  }

  // --- INDUSTRIAL MOUNTING PAD (SKID) ---
  const baseplateGeom = new THREE.BoxGeometry(7, 0.4, 3);
  const baseplateMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.6, metalness: 0.4 });
  const skid = new THREE.Mesh(baseplateGeom, baseplateMat);
  skid.position.set(0.5, -2.2, 0);
  pumpGroup.add(skid);

  // --- TRIANGULAR MOUNTING LUGS ---
  const lugShape = new THREE.Shape();
  lugShape.moveTo(-0.4, 0);
  lugShape.lineTo(0.4, 0);
  lugShape.lineTo(0.2, 1.2);
  lugShape.lineTo(-0.2, 1.2);
  lugShape.closePath();

  const lugExtrude = new THREE.ExtrudeGeometry(lugShape, { depth: 0.4, bevelEnabled: false });
  const lugMat = new THREE.MeshStandardMaterial({ color: 0x0011aa, roughness: 0.3, metalness: 0.7 });
  const lugBoltGeom = new THREE.CylinderGeometry(0.1, 0.1, 0.2, 6); // Hex bolt
  const boltMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8 });

  [-2.2, 0.2].forEach(xPos => {
    [-1.1, 0.7].forEach(zPos => {
      const lugGroup = new THREE.Group();
      const lug = new THREE.Mesh(lugExtrude, lugMat);
      lugGroup.add(lug);
      const flange = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.2, 0.6), lugMat);
      flange.position.set(0, 0.1, 0.2);
      lugGroup.add(flange);
      const bolt = new THREE.Mesh(lugBoltGeom, boltMat);
      bolt.position.set(0, 0.3, 0.2);
      lugGroup.add(bolt);
      lugGroup.position.set(xPos, -2.0, zPos);
      pumpGroup.add(lugGroup);
    });
  });

  const rearCoverGroup = new THREE.Group();
  const ringOuterGeom = new THREE.CylinderGeometry(1.35, 1.4, 0.6, 32);
  const ringOuter = new THREE.Mesh(ringOuterGeom, darkGray);
  ringOuter.rotation.z = Math.PI / 2;
  rearCoverGroup.add(ringOuter);

  const bevelGeom = new THREE.CylinderGeometry(1.0, 1.35, 0.2, 32);
  const bevel = new THREE.Mesh(bevelGeom, darkGray);
  bevel.rotation.z = Math.PI / 2;
  bevel.position.x = -0.3;
  rearCoverGroup.add(bevel);

  const ventCount = 16;
  const ventBladeGeom = new THREE.BoxGeometry(0.05, 0.8, 0.15);
  for (let i = 0; i < ventCount; i++) {
    const blade = new THREE.Mesh(ventBladeGeom, darkGray);
    const angle = (i / ventCount) * Math.PI * 2;
    const radius = 0.65;
    blade.position.x = -0.35;
    blade.position.y = Math.cos(angle) * radius;
    blade.position.z = Math.sin(angle) * radius;
    blade.rotation.x = -angle;
    rearCoverGroup.add(blade);
  }

  const hubGeom = new THREE.CylinderGeometry(0.25, 0.25, 0.1, 16);
  const hub = new THREE.Mesh(hubGeom, darkGray);
  hub.rotation.z = Math.PI / 2;
  hub.position.x = -0.35;
  rearCoverGroup.add(hub);

  const internalFanGroup = new THREE.Group();
  const fBladeGeom = new THREE.BoxGeometry(0.02, 1.1, 0.2);
  for (let i = 0; i < 10; i++) {
    const fBlade = new THREE.Mesh(fBladeGeom, yellow);
    fBlade.rotation.z = (i / 10) * Math.PI * 2;
    internalFanGroup.add(fBlade);
  }
  internalFanGroup.rotation.y = Math.PI / 2;
  internalFanGroup.position.x = -0.1;
  rearCoverGroup.add(internalFanGroup);

  rearCoverGroup.position.x = -3.3;
  pumpGroup.add(rearCoverGroup);

  // --- COUPLING SECTION ---
  const interfaceRingGeom = new THREE.CylinderGeometry(1.4, 1.4, 0.3, 32);
  const motorInterface = new THREE.Mesh(interfaceRingGeom, lightGray);
  motorInterface.rotation.z = Math.PI / 2;
  motorInterface.position.x = 1.1;
  pumpGroup.add(motorInterface);

  const pumpInterface = new THREE.Mesh(interfaceRingGeom, lightGray);
  pumpInterface.rotation.z = Math.PI / 2;
  pumpInterface.position.x = 2.4;
  pumpGroup.add(pumpInterface);

  const shaftGeom = new THREE.CylinderGeometry(0.25, 0.25, 1.5, 16);
  const shaft = new THREE.Mesh(shaftGeom, lightGray);
  shaft.rotation.z = Math.PI / 2;
  shaft.position.x = 1.75;
  pumpGroup.add(shaft);

  const sleeveGeom = new THREE.CylinderGeometry(0.32, 0.32, 0.4, 32);
  const sleeveMat = new THREE.MeshStandardMaterial({ color: 0x050515, roughness: 0.3, metalness: 0.6 });
  const sleeve = new THREE.Mesh(sleeveGeom, sleeveMat);
  sleeve.rotation.z = Math.PI / 2;
  sleeve.position.x = 1.75;
  pumpGroup.add(sleeve);

  // --- CAGE GUARD ---
  const cageGroup = new THREE.Group();
  const cageColor = new THREE.MeshStandardMaterial({ color: 0x0044ff, roughness: 0.2, metalness: 0.8 });
  const cageRadius = 0.40, cageLength = 1.5, thickness = 0.04;

  function createExtrudedSegment(startAngle, endAngle) {
    const shape = new THREE.Shape();
    shape.absarc(0, 0, cageRadius, startAngle, endAngle, false);
    shape.absarc(0, 0, cageRadius - thickness, endAngle, startAngle, true);
    shape.lineTo(Math.cos(startAngle) * cageRadius, Math.sin(startAngle) * cageRadius);
    const geom = new THREE.ExtrudeGeometry(shape, { depth: cageLength, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01 });
    const mesh = new THREE.Mesh(geom, cageColor);
    mesh.rotation.y = Math.PI / 2;
    mesh.position.x = -cageLength / 2;
    return mesh;
  }

  const segmentBreadth = Math.PI / 3;
  for (let i = 0; i < 4; i++) {
    const centerAngle = (i / 4) * Math.PI * 2;
    const segment = createExtrudedSegment(centerAngle - segmentBreadth / 2, centerAngle + segmentBreadth / 2);
    cageGroup.add(segment);
  }
  const ringGeom = new THREE.TorusGeometry(cageRadius, 0.03, 16, 32);
  const ringL = new THREE.Mesh(ringGeom, cageColor);
  ringL.rotation.y = Math.PI / 2;
  ringL.position.x = -cageLength / 2;
  cageGroup.add(ringL);
  const ringR = new THREE.Mesh(ringGeom, cageColor);
  ringR.rotation.y = Math.PI / 2;
  ringR.position.x = cageLength / 2;
  cageGroup.add(ringR);
  cageGroup.position.x = 1.75;
  pumpGroup.add(cageGroup);

  // Support Brackets
  const bracketGeom = new THREE.BoxGeometry(1.5, 0.1, 0.3);
  const tabGeom = new THREE.BoxGeometry(0.2, 0.3, 0.3);
  const bracketBoltGeom = new THREE.CylinderGeometry(0.05, 0.05, 0.2, 8);
  const bracketConfigs = [
    { x: 1.75, y: 0.88, z: 0.86, rotX: -Math.PI / 4 },
    { x: 1.75, y: 0.88, z: -0.86, rotX: -3 * Math.PI / 4 },
    { x: 1.75, y: -0.88, z: -0.86, rotX: -5 * Math.PI / 4 },
    { x: 1.75, y: -0.88, z: 0.86, rotX: -7 * Math.PI / 4 }
  ];
  bracketConfigs.forEach(c => {
    const bracket = new THREE.Mesh(bracketGeom, lightGray);
    bracket.position.set(c.x, c.y, c.z);
    bracket.rotation.x = c.rotX;
    pumpGroup.add(bracket);
    [-0.65, 0.65].forEach(ox => {
      const tab = new THREE.Mesh(tabGeom, lightGray);
      tab.position.set(bracket.position.x + ox, bracket.position.y, bracket.position.z);
      tab.rotation.copy(bracket.rotation);
      pumpGroup.add(tab);
      const b = new THREE.Mesh(bracketBoltGeom, boltColor);
      const angle = -c.rotX;
      b.position.set(tab.position.x, tab.position.y + Math.cos(angle) * 0.1, tab.position.z + Math.sin(angle) * 0.1);
      b.rotation.copy(bracket.rotation);
      pumpGroup.add(b);
    });
  });

  // --- PUMP HEAD ---
  const pumpHeadGeom = new THREE.CylinderGeometry(0.8, 1.35, 1.5, 32);
  const pumpHead = new THREE.Mesh(pumpHeadGeom, darkGray);
  pumpHead.rotation.z = -Math.PI / 2;
  pumpHead.position.x = 3.3;
  pumpGroup.add(pumpHead);

  const ringShape = new THREE.Shape();
  ringShape.absarc(0, 0, 0.7, 0, Math.PI * 2, false);
  const holePath = new THREE.Path();
  holePath.absarc(0, 0, 0.45, 0, Math.PI * 2, true);
  ringShape.holes.push(holePath);
  const suctionFlangeGeom = new THREE.ExtrudeGeometry(ringShape, { depth: 0.15, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01 });
  const suctionFlange = new THREE.Mesh(suctionFlangeGeom, lightGray);
  suctionFlange.rotation.y = Math.PI / 2;
  suctionFlange.position.x = 4.45;
  pumpGroup.add(suctionFlange);

  // Nozzle Neck (Closing the gap)
  const nozzleNeckGeom = new THREE.CylinderGeometry(0.5, 0.5, 0.45, 16);
  const nozzleNeck = new THREE.Mesh(nozzleNeckGeom, darkGray);
  nozzleNeck.rotation.z = Math.PI / 2;
  nozzleNeck.position.x = 4.25;
  pumpGroup.add(nozzleNeck);

  const impellerGroup = new THREE.Group();
  const vaneGeom = new THREE.BoxGeometry(0.1, 0.4, 0.3);
  for (let i = 0; i < 10; i++) {
    const vane = new THREE.Mesh(vaneGeom, yellow);
    const a = (i / 10) * Math.PI * 2;
    vane.position.y = Math.cos(a) * 0.25; vane.position.z = Math.sin(a) * 0.25;
    vane.rotation.x = -a; vane.rotation.z = 0.5;
    impellerGroup.add(vane);
  }
  impellerGroup.position.x = 3.6;
  pumpGroup.add(impellerGroup);

  const dischargeGroup = new THREE.Group();
  dischargeGroup.add(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.8, 32), darkGray));
  const dRingShape = new THREE.Shape();
  dRingShape.absarc(0, 0, 0.6, 0, Math.PI * 2, false);
  const dHolePath = new THREE.Path();
  dHolePath.absarc(0, 0, 0.35, 0, Math.PI * 2, true);
  dRingShape.holes.push(dHolePath);
  const dFlange = new THREE.Mesh(new THREE.ExtrudeGeometry(dRingShape, { depth: 0.15, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01 }), lightGray);
  dFlange.rotation.x = Math.PI / 2; dFlange.position.y = 0.4;
  dischargeGroup.add(dFlange);
  dischargeGroup.rotation.x = Math.PI / 2;
  dischargeGroup.position.set(3.2, 0, 1.3);
  pumpGroup.add(dischargeGroup);

  // Ensure shadows
  pumpGroup.traverse(n => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });

  return pumpGroup;
}

/* ================================================================
   UI VIEW MANAGEMENT
================================================================ */
window.switchSidebarView = function(view) {
  const controlsView = document.getElementById('controls-view');
  const analysisView = document.getElementById('analysis-view');
  const btnControls = document.getElementById('btn-show-controls');
  const btnAnalysis = document.getElementById('btn-show-analysis');

  if (view === 'controls') {
    controlsView.classList.remove('hidden');
    analysisView.classList.add('hidden');
    btnControls.classList.add('active');
    btnAnalysis.classList.remove('active');
  } else {
    controlsView.classList.add('hidden');
    analysisView.classList.remove('hidden');
    btnControls.classList.remove('active');
    btnAnalysis.classList.add('active');
  }
};

init();


function updateDiagnosticsUI() {
  const panel = document.getElementById('fault-diagnostic');
  const title = document.getElementById('fault-title');
  const desc = document.getElementById('fault-desc');
  const recovery = document.getElementById('fault-recovery');
  const isolateBtn = document.getElementById('btn-isolate-valve');
  const boostBtn = document.getElementById('btn-boost-pump');
  const pBox = document.getElementById('fault-prediction');
  const pVal = document.getElementById('prediction-val');
  
  if (!panel) return;

  if (alarmState.unintended_drain) {
    panel.classList.remove('hidden');
    title.innerText = "F03: Outlet Valve Stuck OPEN";
    desc.innerText = "System unable to maintain level above 50% despite pump operation. Tank continuously draining.";
    recovery.innerText = "Isolate the outlet valve immediately using the manual override button below. Then drain tank completely for repair.";
    isolateBtn.style.display = valveIsolated ? 'none' : 'block';
    boostBtn.style.display = 'none';
    pBox.classList.add('hidden');
  } else if (alarmState.sensor_stiction) {
    panel.classList.remove('hidden');
    title.innerText = "F02: High-Level Sensor Stiction";
    desc.innerText = "Sensor I0.2 stuck ON while level is below 90%. Safety interlock has disabled pump.";
    recovery.innerText = "Check high-level probe for mechanical debris or electrical short. Reset system once cleared.";
    isolateBtn.style.display = 'none';
    boostBtn.style.display = 'none';
    pBox.classList.add('hidden');
  } else if (alarmState.low_sensor_failure) {
    panel.classList.remove('hidden');
    title.innerText = "F01: Low-Level Sensor Failure";
    desc.innerText = "Sensor I0.0 open-circuit detected. Level is below 5% but sensor reads FALSE.";
    recovery.innerText = "Inspect low-level probe wiring. Use MANUAL PUMP START for emergency filling if required.";
    isolateBtn.style.display = 'none';
    boostBtn.style.display = 'none';
    pBox.classList.add('hidden');
  } else if (alarmState.efficiency_loss) {
    panel.classList.remove('hidden');
    title.innerText = "F04: Pump Cavitation / Flow Loss";
    desc.innerText = "Pump discharge has dropped below 70% efficiency (approx 5 m³/h). Filling time will be significantly extended.";
    recovery.innerText = "Check suction filter for blockage or increase pump pressure setpoint to compensate.";
    isolateBtn.style.display = 'none';
    boostBtn.style.display = (pumpEfficiency < 1.0) ? 'block' : 'none';
    pBox.classList.remove('hidden');
    pVal.innerText = lastFillingPrediction;
  } else {
    panel.classList.add('hidden');
    boostBtn.style.display = 'none';
    pBox.classList.add('hidden');
  }
}

function boostPump() {
  pumpEfficiency = 1.0;
  if (typeof log === 'function') log("OPERATOR ACTION: Pump pressure BOOSTED. Efficiency restored to 100%.");
  updateStatusSummary();
}
window.boostPump = boostPump;

function isolateValve() {
  valveIsolated = true;
  if (typeof log === 'function') log("OPERATOR ACTION: Outlet valve manually ISOLATED.");
  updateStatusSummary();
}
window.isolateValve = isolateValve;
