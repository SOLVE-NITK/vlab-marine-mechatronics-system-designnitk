import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/* ---------------- palette ---------------- */
const COL = {
  steel:0x2c485e, steelLite:0x3d5d76, steelDark:0x213848,
  cyan:0x5fd6ef, cyanDeep:0x0c2f3d,
  hot:0xff5a00, hotLite:0xff8a2a,
  waterDeep:0x0c4d70, waterMid:0x1f7fab,
  bg0:0x0a1d2b,
};

const container = document.getElementById('canvas-host');
let W = container.clientWidth, H = container.clientHeight;

/* ---------------- renderer ---------------- */
let renderer;
try{ renderer = new THREE.WebGLRenderer({ antialias:true }); }
catch(e){ document.getElementById('fallback').style.display='grid'; throw e; }
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
renderer.setSize(W, H);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
container.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(W, H);
Object.assign(labelRenderer.domElement.style, { position:'absolute', top:'0', left:'0', pointerEvents:'none' });
container.appendChild(labelRenderer.domElement);

/* ---------------- scene + env ---------------- */
const scene = new THREE.Scene();
scene.background = makeBackdrop();

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(40, W/H, 0.1, 400);
const VIEW_DIR = new THREE.Vector3(0.85, 0.46, 1).normalize();
const TARGET = new THREE.Vector3(0, 0.1, 0);
const FIT_R = 17;
let initialPos = new THREE.Vector3();

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.075;
controls.minPolarAngle = Math.PI*0.18; controls.maxPolarAngle = Math.PI*0.82;
controls.target.copy(TARGET);
controls.autoRotate = false; controls.autoRotateSpeed = 0.5;

function fitCamera(){
  const fov = THREE.MathUtils.degToRad(camera.fov), aspect = camera.aspect;
  const fitH = FIT_R/Math.sin(fov/2);
  const hFov = 2*Math.atan(Math.tan(fov/2)*aspect);
  const fitW = FIT_R/Math.sin(hFov/2);
  const dist = Math.max(fitH, fitW)*1.04;
  initialPos.copy(TARGET).add(VIEW_DIR.clone().multiplyScalar(dist));
  camera.position.copy(initialPos);
  controls.minDistance = dist*0.4; controls.maxDistance = dist*2.2;
  controls.update();
}
fitCamera();

/* ---------------- lights ---------------- */
scene.add(new THREE.HemisphereLight(0x9fd4ec, 0x081420, 0.5));
const key = new THREE.DirectionalLight(0xdff1ff, 1.15);
key.position.set(-12, 16, 12); key.castShadow = true;
key.shadow.mapSize.set(2048,2048); key.shadow.camera.near=1; key.shadow.camera.far=70;
const sc=key.shadow.camera; sc.left=-22; sc.right=22; sc.top=18; sc.bottom=-18; key.shadow.bias=-0.0004; key.shadow.radius=4;
scene.add(key);
const rim = new THREE.DirectionalLight(0x5fd6ef, 0.6); rim.position.set(8,4,-14); scene.add(rim);
const coolerLight = new THREE.PointLight(0xff6a10, 0, 12, 2); // intensity animated
scene.add(coolerLight);

/* ---------------- materials ---------------- */
const steel = new THREE.MeshStandardMaterial({ color:COL.steel, metalness:0.92, roughness:0.34, envMapIntensity:0.7 });
const steelLite = new THREE.MeshStandardMaterial({ color:COL.steelLite, metalness:0.95, roughness:0.28, envMapIntensity:0.85 });
const steelDark = new THREE.MeshStandardMaterial({ color:COL.steelDark, metalness:0.9, roughness:0.4, envMapIntensity:0.6 });
const glowCyan = ()=> new THREE.MeshStandardMaterial({ color:0x07222c, emissive:COL.cyan, emissiveIntensity:1.2, metalness:0, roughness:0.5 });
const glassPipe = new THREE.MeshStandardMaterial({
  color: 0xaaddff,
  transparent: true,
  opacity: 0.28,
  roughness: 0.05,
  metalness: 0.3,
  depthWrite: false
});

/* ---------------- water flow textures ---------------- */
function makeFlowTexture(){
  const c=document.createElement('canvas'); c.width=128; c.height=512;
  const ctx=c.getContext('2d');
  
  // Base water color gradient
  const grad = ctx.createLinearGradient(0,0,128,0);
  grad.addColorStop(0, '#106ea8');
  grad.addColorStop(0.5, '#2ab4f2');
  grad.addColorStop(1, '#106ea8');
  ctx.fillStyle=grad;
  ctx.fillRect(0,0,128,512);

  // Draw flow lines parallel to Y axis
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 4;
  for(let i=0; i<30; i++){
    ctx.strokeStyle = (i%2===0) ? '#4fb6e3' : '#0c7bba'; // light and dark blue streaks
    ctx.beginPath();
    const startX = Math.random()*128;
    ctx.moveTo(startX, 0);
    // slight wavy variation
    const wave = Math.random()*15;
    for(let y=0; y<=512; y+=32) {
      ctx.lineTo(startX + Math.sin(y*0.05 + i)*wave, y);
    }
    ctx.stroke();
  }
  
  ctx.globalAlpha = 1.0;
  const t=new THREE.CanvasTexture(c); 
  t.wrapS=t.wrapT=THREE.RepeatWrapping; 
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeBubbleTexture(){
  const c=document.createElement('canvas'); c.width=128; c.height=256;
  const ctx=c.getContext('2d');
  ctx.clearRect(0,0,128,256);
  ctx.fillStyle='rgba(255,255,255,0.85)';
  for(let i=0;i<150;i++){
    const x = Math.random()*128;
    const y = Math.random()*256;
    const r = Math.random()*2.0 + 0.5;
    ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
  }
  const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping;
  return t;
}
const flowTex = makeFlowTexture();
const bubbleTex = makeBubbleTexture();
const waterLayers = []; // { bubbleMap, flowMap }, offset animated each frame

// inner water column visible through the glass pipe shell
function addWaterCore(cx, len, r){
  const flowMap = flowTex.clone(); flowMap.needsUpdate = true;
  flowMap.repeat.set(1, len/2); // tile along the length

  const bubbleMap = bubbleTex.clone(); bubbleMap.needsUpdate = true;
  bubbleMap.repeat.set(2, Math.max(1, len/1.1));
  
  // Real water material using standard material for clear visibility
  const baseMat = new THREE.MeshStandardMaterial({
    color: 0x66ccff,
    emissive: 0x051a33,
    emissiveIntensity: 0.8,
    map: flowMap,
    transparent: true,
    opacity: 0.85,
    roughness: 0.1,
    metalness: 0.3,
    depthWrite: false,
    side: THREE.FrontSide
  });
  const core = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 32), baseMat);
  core.rotation.z=Math.PI/2; core.position.x=cx; 
  core.renderOrder = 2; // Render after the glass pipe
  root.add(core);

  // Subtle bubbles instead of glowing streaks
  const bubbleMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: bubbleMap,
    transparent: true,
    opacity: 0.55,
    roughness: 0.1,
    metalness: 0,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const bubbleMesh = new THREE.Mesh(new THREE.CylinderGeometry(r*0.95, r*0.95, len, 32, 1, true), bubbleMat);
  bubbleMesh.rotation.z=Math.PI/2; bubbleMesh.position.x=cx; 
  bubbleMesh.renderOrder = 3; // Render after the core water
  root.add(bubbleMesh);

  waterLayers.push({ bubbleMap, flowMap });
}

/* ---------------- world build ---------------- */
const RP = 0.55;                       // pipe radius
const root = new THREE.Group(); scene.add(root);
let coolerHotMat = null;               // animated heat glow
let dischargeWaves = [];               // animated exit ripples

function addShadow(m){ m.castShadow=true; m.receiveShadow=true; return m; }

// generic glowing edge overlay (additive cyan)
function edges(geo, opacity=0.6, color=COL.cyan){
  return new THREE.LineSegments(new THREE.EdgesGeometry(geo, 22),
    new THREE.LineBasicMaterial({ color, transparent:true, opacity, blending:THREE.AdditiveBlending, depthWrite:false }));
}

// pipe segment along X — glass shell with an animated water core flowing inside
function pipe(x1, x2, r=RP){
  const len=Math.abs(x2-x1), cx=(x1+x2)/2;
  const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,len,40,1,false), glassPipe);
  m.receiveShadow=true; m.rotation.z=Math.PI/2; m.position.x=cx; root.add(m);
  const rim=edges(m.geometry,0.22); rim.rotation.copy(m.rotation); rim.position.copy(m.position); root.add(rim);
  addWaterCore(cx, len, r*0.62);
  return m;
}
// flange (raised ring) at x, optional bolts
function flange(x, r=0.86, w=0.3, bolts=0){
  const g=new THREE.Group();
  const ring=addShadow(new THREE.Mesh(new THREE.CylinderGeometry(r,r,w,44), steelLite));
  ring.rotation.z=Math.PI/2; g.add(ring);
  const glow=new THREE.Mesh(new THREE.TorusGeometry(r+0.005, 0.035, 10, 60),
    new THREE.MeshBasicMaterial({ color:COL.cyan, transparent:true, opacity:0.85, blending:THREE.AdditiveBlending, depthWrite:false }));
  glow.rotation.y=Math.PI/2; g.add(glow);
  if(bolts){
    const bm=steelDark;
    for(let i=0;i<bolts;i++){
      const a=i/bolts*Math.PI*2;
      const b=new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.07,w+0.12,8), bm);
      b.rotation.z=Math.PI/2;
      b.position.set(0, Math.cos(a)*(r-0.18), Math.sin(a)*(r-0.18));
      g.add(b);
    }
  }
  g.position.x=x; root.add(g); return g;
}
// open inlet/outlet mouth with recessed cyan glow disc
function mouth(x, dir, r=0.86){
  flange(x, r, 0.34, 12);
  const bore=new THREE.Mesh(new THREE.CircleGeometry(r-0.22, 40),
    new THREE.MeshBasicMaterial({ color:0x06181f }));
  bore.position.set(x+dir*0.18, 0, 0); bore.rotation.y=dir*Math.PI/2; root.add(bore);
  const glow=new THREE.Mesh(new THREE.CircleGeometry(r-0.26, 40),
    new THREE.MeshBasicMaterial({ color:COL.cyan, transparent:true, opacity:0.5, blending:THREE.AdditiveBlending, depthWrite:false }));
  glow.position.set(x+dir*0.16, 0, 0); glow.rotation.y=dir*Math.PI/2; root.add(glow);
}

/* ----- layout coordinates (flow -X -> +X) ----- */
const X = { inlet:-15, checkV:-9, ctrlV:-2, coolerA:3.4, coolerB:8.6, disch:14 };



// INLET T-FITTING
(function inletTFitting(){
  const g=new THREE.Group();
  const rBody = 0.82;
  
  // Horizontal metal body
  const hBody=addShadow(new THREE.Mesh(new THREE.CylinderGeometry(rBody,rBody,2.4,32), steel));
  hBody.rotation.z=Math.PI/2; g.add(hBody);
  const he=edges(hBody.geometry,0.45); he.rotation.z=Math.PI/2; g.add(he);

  // Vertical neck
  const vBody=addShadow(new THREE.Mesh(new THREE.CylinderGeometry(rBody,rBody,1.4,32), steel));
  vBody.position.y=0.7; g.add(vBody);
  const ve=edges(vBody.geometry,0.45); ve.position.y=0.7; g.add(ve);

  // Top flange
  const topFlange=addShadow(new THREE.Mesh(new THREE.CylinderGeometry(1.06,1.06,0.28,32), steelLite));
  topFlange.position.y=1.4; g.add(topFlange);
  const te=edges(topFlange.geometry,0.45); te.position.y=1.4; g.add(te);
  // bolts
  for(let i=0;i<8;i++){
    const a=i/8*Math.PI*2;
    const b=new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.06,0.4,8), steelDark);
    b.position.set(Math.cos(a)*0.84, 1.4, Math.sin(a)*0.84);
    g.add(b);
  }
  
  // bore hole for top flange
  const bore=new THREE.Mesh(new THREE.CircleGeometry(0.65, 32), new THREE.MeshBasicMaterial({ color:0x06181f }));
  bore.rotation.x=-Math.PI/2; bore.position.y=1.55; g.add(bore);

  g.position.x=X.inlet; root.add(g);
  
  // Left flange (mouth)
  flange(X.inlet-1.2, 1.06, 0.28, 8);
  const mBore=new THREE.Mesh(new THREE.CircleGeometry(0.65, 32), new THREE.MeshBasicMaterial({ color:0x06181f }));
  mBore.rotation.y=-Math.PI/2; mBore.position.set(X.inlet-1.35, 0, 0); root.add(mBore);

  // Right flange connecting to glass
  flange(X.inlet+1.2, 1.06, 0.28, 8);
})();

pipe(X.inlet+1.2, -12.6); flange(-12.6,0.8,0.26);   // spool joint
pipe(-12.6, X.checkV-1.05);

// CHECK VALVE body (globe style)
(function checkValve(){
  const g=new THREE.Group();
  const F_DIST = 1.05;
  flange(X.checkV-F_DIST, 0.9, 0.28); flange(X.checkV+F_DIST, 0.9, 0.28);
  
  // Bulbous main body
  const body=addShadow(new THREE.Mesh(new THREE.SphereGeometry(0.9, 32, 24), steel));
  body.scale.set(1.15, 0.9, 0.9); // slightly elongated
  g.add(body);
  const be=edges(body.geometry, 0.45); be.scale.copy(body.scale); g.add(be);

  // Vertical neck
  const neck=addShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.8, 32), steel));
  neck.position.y=0.7; g.add(neck);
  const ne=edges(neck.geometry, 0.45); ne.position.y=0.7; g.add(ne);

  // Top flange
  const topFlange=addShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.18, 32), steel));
  topFlange.position.y=1.15; g.add(topFlange);
  const tfe=edges(topFlange.geometry, 0.45); tfe.position.y=1.15; g.add(tfe);

  // Cover plate
  const coverPlate=addShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.18, 32), steelLite));
  coverPlate.position.y=1.35; g.add(coverPlate);
  const cpe=edges(coverPlate.geometry, 0.45); cpe.position.y=1.35; g.add(cpe);

  // Bolts
  for(let i=0; i<4; i++){
    const a=i/4*Math.PI*2 + Math.PI/4; // 45 deg offset
    
    // Bolt shaft
    const b=new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.6, 12), steelDark);
    b.position.set(Math.cos(a)*0.68, 1.25, Math.sin(a)*0.68);
    g.add(b);

    // Nut on top
    const nut=new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.12, 6), steelDark);
    nut.position.set(Math.cos(a)*0.68, 1.5, Math.sin(a)*0.68);
    g.add(nut);
  }

  g.position.x=X.checkV; root.add(g);
})();
pipe(X.checkV+1.05, X.ctrlV-0.95);

// CONTROL VALVE + ACTUATOR
const actuatorGroup = new THREE.Group();
const stemGroup = new THREE.Group();
let valveFaultMat = null;
(function controlValve(){
  const g=new THREE.Group();
  flange(X.ctrlV-0.95,0.9,0.3); flange(X.ctrlV+0.95,0.9,0.3);
  valveFaultMat = steel.clone();
  valveFaultMat.emissive.setHex(0x000000);
  const body=addShadow(new THREE.Mesh(new THREE.SphereGeometry(1.08,36,28), valveFaultMat));
  body.scale.set(1.0,1.12,1.12); g.add(body); const be=edges(body.geometry,0.5); be.scale.copy(body.scale); g.add(be);
  // bonnet neck
  const neck=addShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.42,0.6,0.7,24), steelLite));
  neck.position.y=1.18; g.add(neck);
  // yoke posts
  const pm=steelDark;
  [-0.34,0.34].forEach(z=>{
    const p=new THREE.Mesh(new THREE.CylinderGeometry(0.08,0.08,1.0,10), pm);
    p.position.set(0,1.95,z); g.add(p);
  });
  
  // Stem that moves up and down inside the yoke
  const stem = addShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.4, 12), new THREE.MeshStandardMaterial({color: 0xcccccc, metalness: 0.8, roughness: 0.2})));
  stem.position.y = 1.9; // base position
  
  // High-Visibility Travel Indicator Block
  const indicatorMat = new THREE.MeshStandardMaterial({ color: 0xff5a00, emissive: 0xff2200, emissiveIntensity: 0.5, roughness: 0.3 });
  const indicator = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.15, 16), indicatorMat);
  indicator.position.y = 1.65; // Base position (fully closed)

  stemGroup.add(stem);
  stemGroup.add(indicator);

  // actuator (diaphragm cylinder) on top - NOW MOVING WITH STEM
  const aBody=addShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.92,0.92,1.35,40), steelLite));
  aBody.position.y=3.05; stemGroup.add(aBody);
  const aTop=addShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.98,0.86,0.34,40), steel));
  aTop.position.y=3.86; stemGroup.add(aTop);
  const aGlow=new THREE.Mesh(new THREE.TorusGeometry(0.93,0.04,10,52),
    new THREE.MeshBasicMaterial({color:COL.cyan, transparent:true, opacity:0.8, blending:THREE.AdditiveBlending, depthWrite:false}));
  aGlow.rotation.x=Math.PI/2; aGlow.position.y=3.05; stemGroup.add(aGlow);
  stemGroup.add(edges(aBody.geometry,0.4).translateY(3.05));
  
  g.add(stemGroup);
  g.position.x=X.ctrlV; root.add(g);
})();
pipe(X.ctrlV+0.95, X.coolerA);

// COOLER (finned heat exchanger with hot glow)
(function cooler(){
  const g=new THREE.Group();
  const len=X.coolerB-X.coolerA, cx=(X.coolerA+X.coolerB)/2, R=1.28;
  flange(X.coolerA,1.0,0.32); flange(X.coolerB,1.0,0.32);
  const shell=addShadow(new THREE.Mesh(new THREE.CylinderGeometry(R,R,len,44), steel));
  shell.rotation.z=Math.PI/2; shell.position.x=cx; g.add(shell);
  // fins
  const nf=11;
  for(let i=0;i<nf;i++){
    const fx=X.coolerA+0.4+(len-0.8)*(i/(nf-1));
    const fin=addShadow(new THREE.Mesh(new THREE.CylinderGeometry(R+0.26,R+0.26,0.1,44), steelLite));
    fin.rotation.z=Math.PI/2; fin.position.x=fx; g.add(fin);
  }
  // hot inner glow (additive), brighter toward +X (outlet)
  const hotMat=new THREE.MeshBasicMaterial({ color:COL.hot, transparent:true, opacity:0.55, blending:THREE.AdditiveBlending, depthWrite:false });
  const hot=new THREE.Mesh(new THREE.CylinderGeometry(R-0.08,R-0.08,len-0.2,44, 1, true), hotMat);
  hot.rotation.z=Math.PI/2; hot.position.x=cx+0.2; g.add(hot);
  coolerHotMat = hotMat;
  // cool cyan ring at inlet end
  const coolRing=new THREE.Mesh(new THREE.TorusGeometry(R+0.27,0.05,10,56),
    new THREE.MeshBasicMaterial({color:COL.cyan, transparent:true, opacity:0.8, blending:THREE.AdditiveBlending, depthWrite:false}));
  coolRing.rotation.y=Math.PI/2; coolRing.position.x=X.coolerA+0.5; g.add(coolRing);
  root.add(g);
})();
coolerLight.position.set((X.coolerA+X.coolerB)/2+1, 0.4, 1.2);

// BYPASS PIPE
(function bypass(){
  const startX = X.coolerA - 0.7;
  const endX = X.coolerB + 0.7;
  const dropY = -3.2;
  const elbowR = 0.8; // sharp mechanical elbow radius

  const path = new THREE.CurvePath();
  path.add(new THREE.LineCurve3(new THREE.Vector3(startX, 0, 0), new THREE.Vector3(startX, dropY + elbowR, 0)));
  path.add(new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(startX, dropY + elbowR, 0),
    new THREE.Vector3(startX, dropY, 0),
    new THREE.Vector3(startX + elbowR, dropY, 0)
  ));
  path.add(new THREE.LineCurve3(new THREE.Vector3(startX + elbowR, dropY, 0), new THREE.Vector3(endX - elbowR, dropY, 0)));
  path.add(new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(endX - elbowR, dropY, 0),
    new THREE.Vector3(endX, dropY, 0),
    new THREE.Vector3(endX, dropY + elbowR, 0)
  ));
  path.add(new THREE.LineCurve3(new THREE.Vector3(endX, dropY + elbowR, 0), new THREE.Vector3(endX, 0, 0)));

  const r = RP; // Exact same size as main straight pipe
  const glassGeo = new THREE.TubeGeometry(path, 128, r, 40, false);
  const waterGeo = new THREE.TubeGeometry(path, 128, r*0.62, 32, false);

  const glassMesh = new THREE.Mesh(glassGeo, glassPipe);
  glassMesh.receiveShadow = true;
  root.add(glassMesh);

  // Add the cyan edge highlights to match straight pipes
  const rim = edges(glassGeo, 0.22);
  root.add(rim);

  const bFlow = flowTex.clone(); bFlow.needsUpdate = true;
  bFlow.rotation = -Math.PI/2;
  bFlow.repeat.set(18, 1); // Increased repeat to maintain flow density

  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x66ccff, emissive: 0x051a33, emissiveIntensity: 0.8,
    map: bFlow, transparent: true, opacity: 0.85,
    roughness: 0.1, metalness: 0.3, depthWrite: false, side: THREE.FrontSide
  });
  const waterMesh = new THREE.Mesh(waterGeo, waterMat);
  waterMesh.renderOrder = 2;
  root.add(waterMesh);
  
  // T-junction collars on the main line
  const t1 = new THREE.Mesh(new THREE.CylinderGeometry(RP*1.1, RP*1.1, 1.2, 32), steel);
  t1.rotation.z = Math.PI/2; t1.position.set(startX, 0, 0); root.add(t1);
  const t2 = new THREE.Mesh(new THREE.CylinderGeometry(RP*1.1, RP*1.1, 1.2, 32), steel);
  t2.rotation.z = Math.PI/2; t2.position.set(endX, 0, 0); root.add(t2);

  // Flange fittings where the drop begins
  const f1 = new THREE.Mesh(new THREE.CylinderGeometry(RP*1.25, RP*1.25, 0.25, 24), steelLite);
  f1.position.set(startX, -0.6, 0); root.add(f1);
  const f2 = new THREE.Mesh(new THREE.CylinderGeometry(RP*1.25, RP*1.25, 0.25, 24), steelLite);
  f2.position.set(endX, -0.6, 0); root.add(f2);

  waterLayers.push({ flowMap: bFlow, isTube: true });
})();

pipe(X.coolerB, 11.2); flange(11.2,0.8,0.26);    // spool joint
pipe(11.2, X.disch);

// DISCHARGE mouth + exit waves
mouth(X.disch, 1);
(function waves(){
  // three short cyan wavy arcs past discharge
  for(let k=0;k<3;k++){
    const pts=[];
    for(let i=0;i<=24;i++){ const t=i/24; pts.push(new THREE.Vector3(0.4+t*2.2, Math.sin(t*9+k)*0.16, 0)); }
    const geo=new THREE.BufferGeometry().setFromPoints(pts);
    const line=new THREE.Line(geo, new THREE.LineBasicMaterial({color:0xaaddff, transparent:true, opacity:0.6, depthWrite:false}));
    line.position.set(X.disch+0.4, 0.55-k*0.55, 0);
    root.add(line); dischargeWaves.push(line);
  }
})();



/* ---------------- blueprint backdrop texture ---------------- */
function makeBackdrop(){
  const c=document.createElement('canvas'); c.width=1024; c.height=1024;
  const x=c.getContext('2d');
  const g=x.createRadialGradient(512,420,80,512,512,760);
  g.addColorStop(0,'#143247'); g.addColorStop(0.5,'#0c2436'); g.addColorStop(1,'#071520');
  x.fillStyle=g; x.fillRect(0,0,1024,1024);
  // faint grid
  x.strokeStyle='rgba(95,214,239,0.05)'; x.lineWidth=1;
  for(let i=0;i<=1024;i+=42){ x.beginPath(); x.moveTo(i,0); x.lineTo(i,1024); x.stroke(); x.beginPath(); x.moveTo(0,i); x.lineTo(1024,i); x.stroke(); }
  // faint concentric arcs (technical)
  x.strokeStyle='rgba(95,214,239,0.06)';
  for(let r=120;r<560;r+=70){ x.beginPath(); x.arc(250,760,r,-0.2,1.4); x.stroke(); }
  // a couple bold corner ticks
  x.strokeStyle='rgba(95,214,239,0.10)'; x.lineWidth=2;
  [[120,120],[904,120],[120,904],[904,904]].forEach(([px,py])=>{ x.beginPath(); x.moveTo(px-16,py); x.lineTo(px+16,py); x.moveTo(px,py-16); x.lineTo(px,py+16); x.stroke(); });
  const t=new THREE.CanvasTexture(c); t.colorSpace=THREE.SRGBColorSpace; return t;
}

/* ---------------- ground grid ---------------- */
const grid=new THREE.GridHelper(80,40,0x2f6f86,0x1b4254);
grid.position.y=-4.2; grid.material.transparent=true; grid.material.opacity=0.28; scene.add(grid);
const ground=new THREE.Mesh(new THREE.PlaneGeometry(120,120), new THREE.ShadowMaterial({color:0x000000, opacity:0.28}));
ground.rotation.x=-Math.PI/2; ground.position.y=-4.21; ground.receiveShadow=true; scene.add(ground);

/* ---------------- labels ---------------- */
function label(html, x,y,z, cls=''){
  const el=document.createElement('div'); el.className='lbl '+cls; el.innerHTML=html;
  const o=new CSS2DObject(el); o.position.set(x,y,z); scene.add(o); return o;
}
label('SEA INLET<span class="sub">1.5 BAR</span>', X.inlet, -2.0, 0);
label('CHECK VALVE', X.checkV, -1.7, 0);
label('CONTROL VALVE<span class="sub">NOMINAL Δ DROP · 1.0 BAR</span>', X.ctrlV, -1.9, 0);
label('ACTUATOR', X.ctrlV, 5.0, 0);
label('COOLER<span class="sub">0.5 BAR DROP</span>', (X.coolerA+X.coolerB)/2, -1.2, 0);
label('COOLER BYPASS', (X.coolerA+X.coolerB)/2, -4.5, 0);
label('OVERBOARD<br>DISCHARGE', X.disch+1.0, 1.7, 0);
label('PRESSURE', -12.6, 1.5, 0, 'tag');
label('PRESSURE', (X.coolerA+X.coolerB)/2-2.4, 2.2, 0, 'tag');

const faultLabelObj = label('WARNING', X.ctrlV, 4.2, 0, 'fault-tag');

/* ---------------- postprocessing ---------------- */
const dpr=renderer.getPixelRatio();
const rtSize=renderer.getDrawingBufferSize(new THREE.Vector2());
const rt=new THREE.WebGLRenderTarget(rtSize.x, rtSize.y, { type:THREE.HalfFloatType, samples:4 });
const composer=new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene,camera));
const bloom=new UnrealBloomPass(new THREE.Vector2(W,H), 0.35, 0.55, 0.16);
composer.addPass(bloom);
composer.addPass(new OutputPass());
composer.setPixelRatio(dpr); composer.setSize(W,H);

/* ---------------- UI / interaction ---------------- */
const reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let flowOn=!reduceMotion, flowTime=0;
let userInteracted=false;
const clock=new THREE.Clock();

controls.addEventListener('start', ()=>{ userInteracted=true; if(controls.autoRotate){controls.autoRotate=false;btnSpin.classList.remove('active');} });

const btnFlow=document.getElementById('btnFlow'), btnSpin=document.getElementById('btnSpin'),
      btnReset=document.getElementById('btnReset');
if(reduceMotion) { flowOn=false; btnFlow.classList.remove('active'); }
btnFlow.onclick=()=>{ flowOn=!flowOn; btnFlow.classList.toggle('active', flowOn); };
btnSpin.onclick=()=>{ controls.autoRotate=!controls.autoRotate; btnSpin.classList.toggle('active', controls.autoRotate); };
btnReset.onclick=()=>{ userInteracted=false; controls.autoRotate=false; btnSpin.classList.remove('active'); fitCamera(); controls.target.copy(TARGET); controls.update(); };


/* ---------------- experiment logic ---------------- */
let valveSimOpen = 50; 
let currentFlow = 17.0;

const sensOpen = document.getElementById('sens-open');
const sensDp = document.getElementById('sens-dp');
const sensFlow = document.getElementById('sens-flow');
const lblOpen = document.getElementById('lbl-open');
const ctrlOpen = document.getElementById('ctrl-open');
const ctrlDp = document.getElementById('ctrl-dp');
const obsTable = document.getElementById('obs-table-body');

const btnRecord = document.getElementById('btn-record');
const btnRunStep1 = document.getElementById('btn-run-step1');
const btnDyn = document.getElementById('btn-dyn');
const btnResetTable = document.getElementById('btn-reset');

// Calibrated to match the lab manual's official Step 1 sample data table (§5.2.2)
const baseQ_eq = [
  0.0, 1.6, 3.1, 5.1, 7.0, 9.0, 11.5, 14.2, 17.2, 20.4,
  24.0, 29.0, 34.6, 41.0, 48.0, 56.0, 64.0, 72.0, 81.0, 90.0, 100.0
];
const baseQ_lin = [
  0.0, 5.0, 10.0, 15.0, 20.0, 25.0, 30.0, 35.0, 40.0, 45.0,
  50.0, 55.0, 60.0, 65.0, 70.0, 75.0, 80.0, 85.0, 90.0, 95.0, 100.0
];
const baseQ_qo = [
  0.0, 30.0, 60.0, 80.0, 90.0, 94.0, 96.0, 97.0, 98.0, 99.0,
  99.5, 99.7, 99.8, 99.9, 100.0, 100.0, 100.0, 100.0, 100.0, 100.0, 100.0
];

let isLinear = false;

let activeEngine = 'eq'; // 'eq' or 'lin'

let faultLeak = false;
let faultStic = false;
let faultAir = false;
let currentStuckOpen = 50;
let isAnimatingFault = false;

const chkLeak = document.getElementById('chk-fault-leak');
const chkStic = document.getElementById('chk-fault-stic');
const chkAir = document.getElementById('chk-fault-air');
const ctrlOpenF = document.getElementById('ctrl-open-f');
const lblOpenF = document.getElementById('lbl-open-f');
const lblActualPos = document.getElementById('lbl-actual-pos');
const sensFlowF = document.getElementById('sens-flow-f');

function setFault(fType, isChecked) {
  faultLeak = false; faultStic = false; faultAir = false;
  chkLeak.checked = false; chkStic.checked = false; chkAir.checked = false;
  document.getElementById('instr-fault-1').style.display = 'none';
  document.getElementById('instr-fault-2').style.display = 'none';
  document.getElementById('instr-fault-3').style.display = 'none';

  if (isChecked) {
     if (fType === 1) { faultLeak = true; chkLeak.checked = true; document.getElementById('instr-fault-1').style.display = 'block'; }
     if (fType === 2) { faultStic = true; chkStic.checked = true; document.getElementById('instr-fault-2').style.display = 'block'; }
     if (fType === 3) { faultAir = true; chkAir.checked = true; document.getElementById('instr-fault-3').style.display = 'block'; }
  }
  
  // Force reset the physical model state when toggling
  currentStuckOpen = parseInt(ctrlOpen.value);
  updateSystem();
}

if(chkLeak) chkLeak.onchange = () => setFault(1, chkLeak.checked);
if(chkStic) chkStic.onchange = () => setFault(2, chkStic.checked);
if(chkAir) chkAir.onchange = () => setFault(3, chkAir.checked);
if(ctrlOpenF) ctrlOpenF.oninput = () => { ctrlOpen.value = ctrlOpenF.value; updateSystem(); };

function updateSystem() {
  const openPct = parseInt(ctrlOpen.value);
  const dp = parseFloat(ctrlDp.value);
  const isLinear = (activeEngine === 'lin');
  
  if(faultStic) {
    if(Math.abs(openPct - currentStuckOpen) >= 10) {
      currentStuckOpen = openPct; // Broke static friction
    }
  } else if(!faultAir) {
    currentStuckOpen = openPct;
  }
  
  let isDrifting = false;
  if(faultAir) {
    // With 2 bar pilot air, the max opening is physically constrained by the system DP.
    // E.g. DP=0 -> 100%. DP=2.0 -> 10%.
    const maxHoldableOpen = Math.max(0, 100 - (dp * 45)); 
    const targetOpen = Math.min(openPct, maxHoldableOpen);
    
    // Instead of snapping, it bleeds out or struggles to open
    if(currentStuckOpen > targetOpen) {
      currentStuckOpen = Math.max(targetOpen, currentStuckOpen - (0.5 * dp)); // Drifts closed
      isDrifting = true;
    } else if(currentStuckOpen < targetOpen) {
      currentStuckOpen = Math.min(targetOpen, currentStuckOpen + 0.5); // Struggles open
      isDrifting = true;
    }
  }
  
  valveSimOpen = currentStuckOpen;
  
  // Update normal UI
  lblOpen.innerText = openPct + "%";
  sensOpen.innerText = currentStuckOpen + " %";
  sensDp.innerText = dp.toFixed(2) + " bar";

  // Update Fault UI
  if(lblOpenF) lblOpenF.innerText = openPct + "%";
  if(lblActualPos) {
    lblActualPos.innerText = Math.round(currentStuckOpen) + "%";
    lblActualPos.style.color = (Math.round(currentStuckOpen) !== openPct) ? "#ff5a00" : "#ff8a2a";
  }

  // 3D Visual Fault Warning
  let activeFaults = [];
  if(faultLeak) activeFaults.push("⚠ LEAKAGE: SEAT WORN");
  if(faultStic) activeFaults.push("⚠ STICTION: STEM JAMMED");
  if(faultAir) activeFaults.push("⚠ AIR FAIL: ACTUATOR WEAK");
  
  if(activeFaults.length > 0) {
    faultLabelObj.element.innerHTML = activeFaults.join("<br>");
    faultLabelObj.element.classList.add('active');
  } else {
    faultLabelObj.element.classList.remove('active');
  }

  // Prevent array out-of-bounds NaN bugs when drifting
  const step = Math.min(20, Math.max(0, Math.round(currentStuckOpen / 5)));
  let baseFlow = baseQ_eq[step];
  if(activeEngine === 'lin') baseFlow = baseQ_lin[step];
  if(activeEngine === 'qo') baseFlow = baseQ_qo[step];
  
  if(faultLeak) {
    // 10% baseline leakage of max flow
    baseFlow += 10.0;
    // Add hunting oscillation due to broken seat
    baseFlow += Math.sin(performance.now() * 0.005) * 2.0;
  }
  
  const mult = Math.sqrt(dp / 2.0); 
  const rawFlow = baseFlow * mult;
  const noise = (Math.random() - 0.5) * (faultLeak ? 0.8 : 0.1);
  currentFlow = Math.max(0, rawFlow + noise);

  // Power Calculation (P = dP * Q * factor)
  const powerW = dp * currentFlow * 1.667;

  sensFlow.innerText = currentFlow.toFixed(1) + " L/min";
  if(sensFlowF) sensFlowF.innerText = currentFlow.toFixed(1) + " L/min";
  
  const sensPower = document.getElementById('sens-power');
  const sensPowerF = document.getElementById('sens-power-f');
  if(sensPower) sensPower.innerText = powerW.toFixed(1) + " W";
  if(sensPowerF) sensPowerF.innerText = powerW.toFixed(1) + " W";
  
  if(faultLeak || (faultAir && isDrifting)) {
    if(!isAnimatingFault) {
      isAnimatingFault = true;
      requestAnimationFrame(() => {
        isAnimatingFault = false;
        updateSystem();
      });
    }
  }
}

ctrlOpen.addEventListener('input', updateSystem);
ctrlDp.addEventListener('change', updateSystem);

function initTable() {
  obsTable.innerHTML = "";
  for (let i = 0; i <= 20; i++) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${i * 5}</td>
      <td id="cell-${i}-05" style="color:#999;">--</td>
      <td id="cell-${i}-10" style="color:#999;">--</td>
      <td id="cell-${i}-20" style="color:#999;">--</td>
    `;
    obsTable.appendChild(row);
  }
}

// Initial table setup
initTable();

let step1Active = false;

btnRunStep1.onclick = () => {
  if (step1Active || dynActive) return;
  step1Active = true;
  initTable();
  
  const passes = [
    { dp: 0.5, id: "05", col: 1 },
    { dp: 1.0, id: "10", col: 2 },
    { dp: 2.0, id: "20", col: 3 }
  ];
  
  let passIdx = 0;
  let stepIdx = 0;
  
  function runStep1Seq() {
    if (passIdx >= passes.length) {
      step1Active = false;
      btnRunStep1.innerText = "Start Automated Step 1 Test";
      btnRunStep1.style.opacity = "1";
      return;
    }
    
    const p = passes[passIdx];
    ctrlDp.value = p.dp.toFixed(1);
    ctrlOpen.value = stepIdx * 5;
    updateSystem(); 
    
    btnRunStep1.innerText = `Running: Pass ${passIdx+1}/3 | ΔP ${p.dp} bar | ${stepIdx*5}%`;
    btnRunStep1.style.opacity = "0.7";
    
    setTimeout(() => {
      const cell = document.getElementById(`cell-${stepIdx}-${p.id}`);
      if (cell) {
        cell.innerText = currentFlow.toFixed(1);
        cell.style.color = "#b4441f";
        cell.style.fontWeight = "bold";
        cell.style.background = "rgba(95, 214, 239, 0.4)";
        setTimeout(() => cell.style.background = "transparent", 400);
        
        recordExp1Point(stepIdx, p.dp, currentFlow);
        
        obsTable.parentElement.scrollTo({ top: cell.parentElement.offsetTop - 30, behavior: 'smooth' });
      }
      
      stepIdx++;
      if (stepIdx > 20) {
        stepIdx = 0;
        passIdx++;
        setTimeout(runStep1Seq, 1000); 
      } else {
        setTimeout(runStep1Seq, 300); 
      }
    }, 300); 
  }
  
  runStep1Seq();
};

btnRecord.onclick = () => {
  const openPct = parseInt(ctrlOpen.value);
  const dp = parseFloat(ctrlDp.value);
  const step = openPct / 5;
  
  let dpId = "05";
  if (dp === 1.0) dpId = "10";
  else if (dp === 2.0) dpId = "20";
  
  const cell = document.getElementById(`cell-${step}-${dpId}`);
  if (cell) {
    cell.innerText = currentFlow.toFixed(1);
    cell.style.color = "#b4441f";
    cell.style.fontWeight = "bold";
    
    // Highlight flash to clearly show data entry
    cell.style.background = "rgba(95, 214, 239, 0.4)";
    setTimeout(() => cell.style.background = "transparent", 600);
    
    recordExp1Point(step, dp, currentFlow);
    
    // Auto-scroll the table down to the newly recorded row
    const row = cell.parentElement;
    obsTable.parentElement.scrollTo({
      top: row.offsetTop - 30,
      behavior: 'smooth'
    });
  }
};

btnResetTable.onclick = () => {
  const thead = document.getElementById('obs-table-head');
  thead.innerHTML = `
    <tr>
      <th>Valve Opening (%)</th>
      <th>ΔP = 0.5 bar</th>
      <th>ΔP = 1.0 bar</th>
      <th>ΔP = 2.0 bar</th>
    </tr>
  `;
  initTable();
};

const btnCsv = document.getElementById('btn-csv');
btnCsv.onclick = () => {
  let csv = [];
  // Parse Headers
  const thead = document.getElementById('obs-table-head');
  let headRow = [];
  for(let th of thead.querySelectorAll('th')) headRow.push(`"${th.innerText}"`);
  csv.push(headRow.join(","));
  
  // Parse Rows
  for(let tr of obsTable.querySelectorAll('tr')){
    let row = [];
    for(let td of tr.querySelectorAll('td')) row.push(`"${td.innerText}"`);
    csv.push(row.join(","));
  }
  
  // Trigger Download
  const blob = new Blob([csv.join("\n")], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.setAttribute('hidden', '');
  a.setAttribute('href', url);
  a.setAttribute('download', 'valve_experiment_data.csv');
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

// EXPERIMENT B: LINEAR PROCEDURES
const btnRunStep1B = document.getElementById('btn-run-step1-b');
const btnDynB = document.getElementById('btn-dyn-b');
const btnCsvB = document.getElementById('btn-csv-b');
const obsTableB = document.getElementById('obs-table-body-b');

function initTableB() {
  obsTableB.innerHTML = "";
  for (let i = 0; i <= 20; i++) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${i * 5}</td>
      <td id="cell-b-${i}-05" style="color:#999;">--</td>
      <td id="cell-b-${i}-10" style="color:#999;">--</td>
      <td id="cell-b-${i}-20" style="color:#999;">--</td>
    `;
    obsTableB.appendChild(row);
  }
}
initTableB();

btnRunStep1B.onclick = () => {
  if (step1Active || dynActive) return;
  step1Active = true;
  activeEngine = 'lin';
  initTableB();
  
  const passes = [
    { dp: "0.5", id: "05", col: 1 },
    { dp: "1.0", id: "10", col: 2 },
    { dp: "2.0", id: "20", col: 3 }
  ];
  
  let passIdx = 0;
  let stepIdx = 0;
  
  btnRunStep1B.innerText = "Running Linear Step 1...";
  btnRunStep1B.style.opacity = "0.7";
  
  function runSeq() {
    if (passIdx >= passes.length) {
      step1Active = false;
      activeEngine = 'eq'; // Reset to default
      btnRunStep1B.innerText = "Step 1: Steady-State";
      btnRunStep1B.style.opacity = "1";
      setTimeout(() => alert("Linear Experiment B: Step 1 Complete!"), 400);
      return;
    }
    
    const currentPass = passes[passIdx];
    const openPct = stepIdx * 5;
    
    ctrlOpen.value = openPct;
    ctrlDp.value = currentPass.dp;
    updateSystem();
    
    setTimeout(() => {
      const cell = document.getElementById(`cell-b-${stepIdx}-${currentPass.id}`);
      if (cell) {
        cell.innerText = currentFlow.toFixed(1);
        cell.style.color = "#b4441f";
        cell.style.fontWeight = "bold";
        cell.style.background = "rgba(95, 214, 239, 0.4)";
        setTimeout(() => cell.style.background = "transparent", 600);
        
        obsTableB.parentElement.scrollTo({
          top: cell.parentElement.offsetTop - 30,
          behavior: 'smooth'
        });

        recordExp1PointB(stepIdx, currentPass.dp, currentFlow);
      }

      stepIdx++;
      if (stepIdx > 20) {
        stepIdx = 0;
        passIdx++;
      }
      setTimeout(runSeq, 150);
    }, 150);
  }
  
  runSeq();
};

btnDynB.onclick = () => {
  if(dynActive || step1Active) return;
  dynActive = true;
  activeEngine = 'lin';
  
  ctrlOpen.value = 50;
  ctrlDp.value = "0.5";
  updateSystem();
  
  btnDynB.innerText = "Linear Stabilizing...";
  btnDynB.style.opacity = "0.7";
  
  const thead = document.getElementById('obs-table-head-b');
  thead.innerHTML = `<tr><th>Time (s)</th><th>ΔP (bar)</th><th>Flow (L/min)</th></tr>`;
  obsTableB.innerHTML = ""; 
  
  setTimeout(() => {
    ctrlDp.value = "2.0";
    btnDynB.innerText = "Linear Recording...";
    sensDp.innerText = "2.00 bar";
    
    let t = 0;
    const finalFlow = 50.0;
    const startFlow = 25.0;
    let peakFlow = startFlow, settledAt = null, prevSign = null, oscCount = 0;
    const band = finalFlow * 0.02;

    const initialRow = document.createElement('tr');
    initialRow.innerHTML = `<td style="font-family: monospace;">t=0s</td><td>0.5</td><td style="color:#b4441f; font-weight:bold;">${startFlow.toFixed(1)}</td>`;
    obsTableB.appendChild(initialRow);

    const interval = setInterval(() => {
      t += 5;
      let tempFlow = finalFlow;
      if (t < 50) {
        const dampening = Math.exp(-t / 10);
        const osc = Math.cos(t * 0.45 + Math.PI);
        tempFlow = finalFlow + (finalFlow - startFlow) * dampening * osc * 1.4;
      } else {
        tempFlow = finalFlow + (Math.random()-0.5)*0.2; 
      }
      
      currentFlow = Math.max(0, tempFlow);
      sensFlow.innerText = currentFlow.toFixed(1) + " L/min";

      if (currentFlow > peakFlow) peakFlow = currentFlow;
      const diff = currentFlow - finalFlow;
      if (Math.abs(diff) <= band) { if (settledAt === null) settledAt = t; }
      else { settledAt = null; }
      const sign = diff > band ? 1 : (diff < -band ? -1 : 0);
      if (sign !== 0) { if (prevSign !== null && sign !== prevSign) oscCount++; prevSign = sign; }

      const row = document.createElement('tr');
      row.innerHTML = `<td style="font-family: monospace;">t=${t}s</td><td>2.0</td><td style="color:#b4441f; font-weight:bold;">${currentFlow.toFixed(1)}</td>`;
      obsTableB.appendChild(row);
      obsTableB.parentElement.scrollTop = obsTableB.parentElement.scrollHeight;

      if(t >= 120) {
        clearInterval(interval);
        dynActive = false;
        activeEngine = 'eq';
        btnDynB.innerText = "Step 2: Dynamic Test";
        btnDynB.style.opacity = "1";

        setTimeout(() => {
          const overshootPct = ((peakFlow - finalFlow) / finalFlow * 100).toFixed(0);
          const summaryRow = document.createElement('tr');
          summaryRow.innerHTML = `<td colspan="3" style="text-align:left; background:var(--paper-2); padding:8px; border-top:2px solid var(--line);"><strong>Linear Metrics:</strong><br>Overshoot: ${peakFlow.toFixed(1)} L/min (+${overshootPct}%)<br>Settling Time: ${settledAt !== null ? settledAt : 120} s<br>Oscillations: ${Math.max(1, Math.round(oscCount / 2))}</td>`;
          obsTableB.appendChild(summaryRow);
          obsTableB.parentElement.scrollTop = obsTableB.parentElement.scrollHeight;
          alert("Linear Dynamic Test Complete!");
        }, 400);
      }
    }, 200);
  }, 1000);
};

btnCsvB.onclick = () => {
  let csv = [];
  const thead = document.getElementById('obs-table-head-b');
  let headRow = [];
  for(let th of thead.querySelectorAll('th')) headRow.push(`"${th.innerText}"`);
  csv.push(headRow.join(","));
  
  for(let tr of obsTableB.querySelectorAll('tr')){
    let row = [];
    for(let td of tr.querySelectorAll('td')) row.push(`"${td.innerText}"`);
    csv.push(row.join(","));
  }
  
  const blob = new Blob([csv.join("\n")], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.setAttribute('hidden', '');
  a.setAttribute('href', url);
  a.setAttribute('download', 'linear_experiment_data.csv');
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

let dynActive = false;
btnDyn.onclick = () => {
  if(dynActive || step1Active) return;
  dynActive = true;
  
  // Step 2 protocol: Constant 50%, start at 0.5 bar
  ctrlOpen.value = 50;
  ctrlDp.value = "0.5";
  updateSystem();
  
  btnDyn.innerText = "Stabilizing at 0.5 bar...";
  btnDyn.style.opacity = "0.7";
  
  // Temporarily morph the table into a Time-Series log for this test
  const thead = document.getElementById('obs-table-head');
  thead.innerHTML = `
    <tr>
      <th>Time (s)</th>
      <th>ΔP (bar)</th>
      <th>Flow (L/min)</th>
    </tr>
  `;
  obsTable.innerHTML = ""; 
  
  setTimeout(() => {
    // Step input from 0.5 -> 2.0 bar
    ctrlDp.value = "2.0";
    btnDyn.innerText = "Recording Response (120s)...";
    sensDp.innerText = "2.00 bar";
    
    activeEngine = 'eq';
    let t = 0;
    const finalFlow = baseQ_eq[10] * Math.sqrt(2.0 / 2.0); // Steady state at 50% open, 2.0 bar
    const startFlow = baseQ_eq[10] * Math.sqrt(0.5 / 2.0); // Initial state at 0.5 bar
    let peakFlow = startFlow, settledAt = null, prevSign = null, oscCount = 0;
    const band = finalFlow * 0.02;

    // Log initial baseline at 0.5 bar before the step
    const initialRow = document.createElement('tr');
    initialRow.innerHTML = `
      <td style="font-family: monospace;">t=0s</td>
      <td>0.5</td>
      <td style="color:#b4441f; font-weight:bold;">${startFlow.toFixed(1)}</td>
    `;
    obsTable.appendChild(initialRow);

    const interval = setInterval(() => {
      t += 5; // Simulate 5s leaps per tick
      
      // Simulate 2nd-order underdamped response (Overshoot & Settling)
      let tempFlow = finalFlow;
      if (t < 50) {
        // Underdamped formula with exp decay
        const dampening = Math.exp(-t / 15);
        const osc = Math.cos(t * 0.35 + Math.PI); // Phase shift so it jumps up
        tempFlow = finalFlow + (finalFlow - startFlow) * dampening * osc;
      } else {
        // Settled state with tiny noise
        tempFlow = finalFlow + (Math.random()-0.5)*0.2; 
      }
      
      currentFlow = Math.max(0, tempFlow);
      sensFlow.innerText = currentFlow.toFixed(1) + " L/min";

      if (currentFlow > peakFlow) peakFlow = currentFlow;
      const diff = currentFlow - finalFlow;
      if (Math.abs(diff) <= band) { if (settledAt === null) settledAt = t; }
      else { settledAt = null; }
      const sign = diff > band ? 1 : (diff < -band ? -1 : 0);
      if (sign !== 0) { if (prevSign !== null && sign !== prevSign) oscCount++; prevSign = sign; }

      const row = document.createElement('tr');
      row.innerHTML = `
        <td style="font-family: monospace;">t=${t}s</td>
        <td>2.0</td>
        <td style="color:#b4441f; font-weight:bold;">${currentFlow.toFixed(1)}</td>
      `;
      obsTable.appendChild(row);
      obsTable.parentElement.scrollTop = obsTable.parentElement.scrollHeight;

      if(t >= 120) {
        clearInterval(interval);
        dynActive = false;
        btnDyn.innerText = "Start Dynamic Test";
        btnDyn.style.opacity = "1";

        // Final Analysis Report
        setTimeout(() => {
          const overshootPct = ((peakFlow - finalFlow) / finalFlow * 100).toFixed(0);
          const summaryRow = document.createElement('tr');
          summaryRow.innerHTML = `
            <td colspan="3" style="text-align:left; background:var(--paper-2); padding:8px; border-top:2px solid var(--line);">
              <strong>System Metrics:</strong><br>
              Peak Flow (Overshoot): ${peakFlow.toFixed(1)} L/min (+${overshootPct}%)<br>
              Settling Time (±2%): ${settledAt !== null ? settledAt : 120} s<br>
              Oscillations: ${Math.max(1, Math.round(oscCount / 2))}
            </td>
          `;
          obsTable.appendChild(summaryRow);
          obsTable.parentElement.scrollTop = obsTable.parentElement.scrollHeight;

          alert("Dynamic Test Complete! (Equal % Valve)\n\nSystem Metrics have been appended to the table for CSV export.");
        }, 400);
      }
    }, 200); // 200ms real-time per 5s simulated time
  }, 1000);
};

let expCActive = false;
const btnRunExpC = document.getElementById('btn-run-exp-c');
const btnRunExpCLin = document.getElementById('btn-run-exp-c-lin');
const obsTableC = document.getElementById('obs-table-body-c');
const chartC = document.getElementById('chart-c');
const ctxC = null; // Removed legacy canvas

function initChart() {
  // Replaced by Chart.js chart3
}

function initTableC() {
  obsTableC.innerHTML = "";
  for(let i=1; i<=10; i++){
    const dpVal = (0.2 * i).toFixed(1);
    const row = document.createElement('tr');
    row.id = `row-c-${i}`;
    row.innerHTML = `
      <td>${dpVal}</td>
      <td id="cell-c-eq-${i}" style="color:#999;">--</td>
      <td id="cell-c-lin-${i}" style="color:#999;">--</td>
      <td id="cell-c-qo-${i}" style="color:#999;">--</td>
    `;
    obsTableC.appendChild(row);
  }
}
initTableC();

document.getElementById('btn-clear-c').onclick = () => {
  if(expCActive) return;
  initTableC();
  if(chart3) {
    chart3.data.datasets[0].data = [];
    chart3.data.datasets[1].data = [];
    chart3.data.datasets[2].data = [];
    chart3.update();
  }
};

document.getElementById('btn-csv-c').onclick = () => {
  let csv = [];
  const thead = document.getElementById('obs-table-head-c');
  let headRow = [];
  for(let th of thead.querySelectorAll('th')) headRow.push(`"${th.innerText}"`);
  csv.push(headRow.join(","));
  
  for(let tr of obsTableC.querySelectorAll('tr')){
    let row = [];
    for(let td of tr.querySelectorAll('td')) row.push(`"${td.innerText}"`);
    csv.push(row.join(","));
  }
  
  const blob = new Blob([csv.join("\n")], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.setAttribute('hidden', '');
  a.setAttribute('href', url);
  a.setAttribute('download', 'installed_characteristics_comparison.csv');
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

let lastPt = null;

const btnRunExpCQo = document.getElementById('btn-run-exp-c-qo');

function runSweepTest(testType) {
  if (step1Active || dynActive || expCActive) return;
  expCActive = true;
  activeEngine = testType;
  
  ctrlOpen.value = 50;
  updateSystem();
  
  let targetBtn = btnRunExpC;
  if(testType === 'lin') targetBtn = btnRunExpCLin;
  if(testType === 'qo') targetBtn = btnRunExpCQo;
  
  const originalText = targetBtn.innerText;
  targetBtn.innerText = "Running...";
  targetBtn.style.opacity = "0.7";
  
  let stepIdx = 1;
  let baseFlow = baseQ_eq[10];
  if(testType === 'lin') baseFlow = baseQ_lin[10];
  if(testType === 'qo') baseFlow = baseQ_qo[10];

  const interval = setInterval(() => {
    const dpVal = (0.2 * stepIdx);
    
    // Calculate Installed Flow: Q = Cv * sqrt(dP) applies to all valve types (5.1.1)
    const mult = Math.pow(dpVal / 2.0, 0.5);
    const rawFlow = baseFlow * mult;
    const noise = (Math.random() - 0.5) * 0.1;
    currentFlow = Math.max(0, rawFlow + noise);
    
    sensDp.innerText = dpVal.toFixed(1) + " bar";
    sensFlow.innerText = currentFlow.toFixed(1) + " L/min";
    
    // Update Specific Cell
    let cellId = `cell-c-eq-${stepIdx}`;
    if(testType === 'lin') cellId = `cell-c-lin-${stepIdx}`;
    if(testType === 'qo') cellId = `cell-c-qo-${stepIdx}`;
    
    const cell = document.getElementById(cellId);
    if(cell) {
      cell.innerText = currentFlow.toFixed(1);
      cell.style.color = "#b4441f";
      cell.style.fontWeight = "bold";
      cell.style.background = "rgba(95, 214, 239, 0.4)";
      setTimeout(() => cell.style.background = "transparent", 600);
      
      obsTableC.parentElement.scrollTo({
        top: cell.parentElement.offsetTop - 30,
        behavior: 'smooth'
      });
    }
    
    // Draw on chart
    if(chart3) {
      let targetDataset = 0;
      if(testType === 'lin') targetDataset = 1;
      if(testType === 'qo') targetDataset = 2;
      
      chart3.data.datasets[targetDataset].data.push({ x: dpVal, y: currentFlow });
      chart3.update();
    }
    
    stepIdx++;
    if (stepIdx > 10) {
      clearInterval(interval);
      expCActive = false;
      activeEngine = 'eq';
      targetBtn.innerText = originalText;
      targetBtn.style.opacity = "1";
    }
  }, 400);
}

if(btnRunExpC) btnRunExpC.onclick = () => runSweepTest('eq');
if(btnRunExpCLin) btnRunExpCLin.onclick = () => runSweepTest('lin');
if(btnRunExpCQo) btnRunExpCQo.onclick = () => runSweepTest('qo');

// TAB SWITCHING LOGIC
const tab1 = document.getElementById('tab-1');
const tab2 = document.getElementById('tab-2');
const tab3 = document.getElementById('tab-3');
const tab4 = document.getElementById('tab-4');
const content1 = document.getElementById('content-tab-1');
const content2 = document.getElementById('content-tab-2');
const content3 = document.getElementById('content-tab-3');

function resetTabs() {
  [tab1, tab2, tab3].forEach(t => {
    if(!t) return;
    t.style.background = 'var(--paper)';
    t.style.color = 'var(--text)';
  });
  [content1, content2, content3].forEach(c => {
    if(c) c.style.display = 'none';
  });
}

tab1.onclick = () => {
  resetTabs();
  tab1.style.background = 'var(--ink)';
  tab1.style.color = 'var(--paper)';
  content1.style.display = 'block';
  activeEngine = 'eq';
  updateSystem();
  if(chart1a) chart1a.resize();
  if(chart1b) chart1b.resize();
  if(chart1c) chart1c.resize();
};

tab2.onclick = () => {
  resetTabs();
  tab2.style.background = 'var(--ink)';
  tab2.style.color = 'var(--paper)';
  content2.style.display = 'block';
  activeEngine = 'lin';
  updateSystem();
  if(chart1cB) chart1cB.resize();
};

tab3.onclick = () => {
  resetTabs();
  tab3.style.background = 'var(--ink)';
  tab3.style.color = 'var(--paper)';
  content3.style.display = 'block';
  activeEngine = 'eq';
  faultLeak = false; faultStic = false; faultAir = false;
  if(chkLeak) chkLeak.checked = false;
  if(chkStic) chkStic.checked = false;
  if(chkAir) chkAir.checked = false;
  updateSystem();
  if(chart3) chart3.resize();
};

const exp1Data = { dp05: Array(21).fill(null), dp10: Array(21).fill(null), dp20: Array(21).fill(null) };
const exp1DataB = { dp05: Array(21).fill(null), dp10: Array(21).fill(null), dp20: Array(21).fill(null) };

// Project mixed-ΔP recordings onto the ΔP=2.0 bar reference curve (inherent), then
// derive the installed curve assuming valve ΔP falls from 2.5 bar (closed) to 2.0 bar (full open).
function deriveInherentInstalled(dataObj) {
  const derivedInherent = dataObj.dp05.map((_, i) => {
    if (dataObj.dp20[i] !== null) return dataObj.dp20[i];
    if (dataObj.dp10[i] !== null) return dataObj.dp10[i] * Math.SQRT2; // sqrt(2.0/1.0)
    if (dataObj.dp05[i] !== null) return dataObj.dp05[i] * 2.0;       // sqrt(2.0/0.5)
    return null;
  });
  const derivedInstalled = derivedInherent.map(q => q !== null ? q * Math.sqrt(Math.max(0, 2.5 - 0.5 * (q/100)) / 2.0) : null);
  return { derivedInherent, derivedInstalled };
}

function updateExp1Plots() {
  if(!chart1a || !chart1b) return;
  chart1a.data.datasets[0].data = exp1Data.dp05;
  chart1a.data.datasets[1].data = exp1Data.dp10;
  chart1a.data.datasets[2].data = exp1Data.dp20;
  chart1a.update();

  const max05 = Math.max(...exp1Data.dp05.filter(n => n!==null), 1);
  const max10 = Math.max(...exp1Data.dp10.filter(n => n!==null), 1);
  const max20 = Math.max(...exp1Data.dp20.filter(n => n!==null), 1);
  chart1b.data.datasets[0].data = exp1Data.dp05.map(v => v!==null ? v/max05 : null);
  chart1b.data.datasets[1].data = exp1Data.dp10.map(v => v!==null ? v/max10 : null);
  chart1b.data.datasets[2].data = exp1Data.dp20.map(v => v!==null ? v/max20 : null);
  chart1b.update();

  if(chart1c) {
    const { derivedInherent, derivedInstalled } = deriveInherentInstalled(exp1Data);
    chart1c.data.datasets[0].data = derivedInherent;
    chart1c.data.datasets[1].data = derivedInstalled;
    chart1c.update();
  }
}

function recordExp1Point(stepIdx, dp, flow) {
  if(dp === 0.5) exp1Data.dp05[stepIdx] = flow;
  else if(dp === 1.0) exp1Data.dp10[stepIdx] = flow;
  else if(dp === 2.0) exp1Data.dp20[stepIdx] = flow;
  updateExp1Plots();
}

function updateExp1PlotsB() {
  if(!chart1cB) return;
  const { derivedInherent, derivedInstalled } = deriveInherentInstalled(exp1DataB);
  chart1cB.data.datasets[0].data = derivedInherent;
  chart1cB.data.datasets[1].data = derivedInstalled;
  chart1cB.update();
}

function recordExp1PointB(stepIdx, dp, flow) {
  if(dp === "0.5") exp1DataB.dp05[stepIdx] = flow;
  else if(dp === "1.0") exp1DataB.dp10[stepIdx] = flow;
  else if(dp === "2.0") exp1DataB.dp20[stepIdx] = flow;
  updateExp1PlotsB();
}

let chart1a, chart1b, chart1c, chart1cB, chartRt, chart3;

function initCharts() {
  Chart.defaults.font.size = 10;
  Chart.defaults.color = '#333';
  
  const commonOptions = {
    responsive: true, maintainAspectRatio: false,
    animation: { duration: 0 },
    plugins: { legend: { display: true, position: 'top', labels: { boxWidth: 10 } } }
  };

  // Plot 1A
  const ctx1a = document.getElementById('canvas-1a').getContext('2d');
  chart1a = new Chart(ctx1a, {
    type: 'line',
    data: {
      labels: baseQ_eq.map((_, i) => i * 5),
      datasets: [0.5, 1.0, 2.0].map((dp, idx) => ({
        label: `ΔP = ${dp} bar`,
        data: Array(21).fill(null),
        borderColor: ['#e63946', '#457b9d', '#2a9d8f'][idx],
        backgroundColor: ['#e63946', '#457b9d', '#2a9d8f'][idx],
        borderWidth: 2, pointRadius: 3, tension: 0.2, spanGaps: true
      }))
    },
    options: { ...commonOptions, scales: { x: { title: { display: true, text: 'Opening (%)' } }, y: { min: 0, max: 100, title: { display: true, text: 'Flow (L/min)' } } } }
  });

  // Plot 1B
  const ctx1b = document.getElementById('canvas-1b').getContext('2d');
  chart1b = new Chart(ctx1b, {
    type: 'line',
    data: {
      labels: baseQ_eq.map((_, i) => i * 5),
      datasets: [0.5, 1.0, 2.0].map((dp, idx) => ({
        label: `ΔP = ${dp} bar`,
        data: Array(21).fill(null),
        borderColor: ['#e63946', '#457b9d', '#2a9d8f'][idx],
        backgroundColor: ['#e63946', '#457b9d', '#2a9d8f'][idx],
        borderWidth: 2, pointRadius: 3, tension: 0.2, spanGaps: true, borderDash: idx > 0 ? [5, 5] : []
      }))
    },
    options: { ...commonOptions, scales: { x: { title: { display: true, text: 'Opening (%)' } }, y: { min: 0, max: 1.1, title: { display: true, text: 'Q / Qmax' } } } }
  });

  // Plot 1C
  const ctx1c = document.getElementById('canvas-1c').getContext('2d');
  chart1c = new Chart(ctx1c, {
    type: 'line',
    data: {
      labels: baseQ_eq.map((_, i) => i * 5),
      datasets: [
        { label: 'Inherent (Derived, ΔP=2.0 ref)', data: Array(21).fill(null), borderColor: '#e63946', backgroundColor: '#e63946', borderWidth: 2, pointRadius: 3, tension: 0.2, spanGaps: true },
        { label: 'Installed (Derived)', data: Array(21).fill(null), borderColor: '#457b9d', backgroundColor: '#457b9d', borderWidth: 2, pointRadius: 3, tension: 0.2, spanGaps: true }
      ]
    },
    options: { ...commonOptions, scales: { x: { title: { display: true, text: 'Opening (%)' } }, y: { min: 0, max: 100, title: { display: true, text: 'Flow (L/min)' } } } }
  });

  // Plot 1C (Linear)
  const ctx1cB = document.getElementById('canvas-1c-b').getContext('2d');
  chart1cB = new Chart(ctx1cB, {
    type: 'line',
    data: {
      labels: baseQ_lin.map((_, i) => i * 5),
      datasets: [
        { label: 'Inherent (Derived, ΔP=2.0 ref)', data: Array(21).fill(null), borderColor: '#e63946', backgroundColor: '#e63946', borderWidth: 2, pointRadius: 3, tension: 0.2, spanGaps: true },
        { label: 'Installed (Derived)', data: Array(21).fill(null), borderColor: '#457b9d', backgroundColor: '#457b9d', borderWidth: 2, pointRadius: 3, tension: 0.2, spanGaps: true }
      ]
    },
    options: { ...commonOptions, scales: { x: { title: { display: true, text: 'Opening (%)' } }, y: { min: 0, max: 100, title: { display: true, text: 'Flow (L/min)' } } } }
  });

  // Plot 2: Real-time
  const ctxRt = document.getElementById('canvas-2').getContext('2d');
  
  const gradRed = ctxRt.createLinearGradient(0, 0, 0, 150);
  gradRed.addColorStop(0, 'rgba(230, 57, 70, 0.4)');
  gradRed.addColorStop(1, 'rgba(230, 57, 70, 0.0)');
  
  const gradBlue = ctxRt.createLinearGradient(0, 0, 0, 150);
  gradBlue.addColorStop(0, 'rgba(69, 123, 157, 0.4)');
  gradBlue.addColorStop(1, 'rgba(69, 123, 157, 0.0)');

  chartRt = new Chart(ctxRt, {
    type: 'line',
    data: {
      labels: Array(150).fill(''),
      datasets: [
        { label: 'Flow (L/min)', data: Array(150).fill(null), borderColor: '#e63946', backgroundColor: gradRed, fill: true, borderWidth: 2, pointRadius: 0, tension: 0 },
        { label: 'Stem Pos (%)', data: Array(150).fill(null), borderColor: '#457b9d', backgroundColor: gradBlue, fill: true, borderWidth: 2, pointRadius: 0, tension: 0 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      scales: { 
        x: { display: false, grid: { display: false } }, 
        y: { min: 0, max: 110, grid: { color: 'rgba(11,31,42,0.05)' } } 
      },
      plugins: { legend: { display: true, position: 'top', labels: { boxWidth: 10 } } }
    }
  });

  // Plot 3 (Scatter for accurate numeric X-axis)
  const ctx3 = document.getElementById('canvas-3').getContext('2d');
  chart3 = new Chart(ctx3, {
    type: 'scatter',
    data: {
      datasets: [
        { label: 'Equal %', data: [], borderColor: '#e63946', backgroundColor: '#e63946', borderWidth: 2, pointRadius: 3, showLine: true },
        { label: 'Linear', data: [], borderColor: '#457b9d', backgroundColor: '#457b9d', borderWidth: 2, pointRadius: 3, showLine: true },
        { label: 'Quick-Open', data: [], borderColor: '#2a9d8f', backgroundColor: '#2a9d8f', borderWidth: 2, pointRadius: 3, showLine: true }
      ]
    },
    options: { ...commonOptions, scales: { x: { type: 'linear', min: 0, max: 2.2, title: { display: true, text: 'System ΔP (bar)' } }, y: { min: 0, max: 105, title: { display: true, text: 'Flow (L/min)' } } } }
  });
}
initCharts();

// Real-time chart update loop
const maxRtPoints = 150;
const rtData = { flow: Array(maxRtPoints).fill(null), stem: Array(maxRtPoints).fill(null) };
setInterval(() => {
  if(!chartRt) return;
  rtData.flow.push(currentFlow);
  rtData.flow.shift();
  rtData.stem.push(currentStuckOpen);
  rtData.stem.shift();
  chartRt.data.datasets[0].data = rtData.flow;
  chartRt.data.datasets[1].data = rtData.stem;
  chartRt.update('none'); // Update without animation for a rigid, realistic strip-chart look
}, 50); // 20 FPS smooth update


// Initial update
updateSystem();

/* ---------------- resize ---------------- */
function onResize(){
  W=container.clientWidth; H=container.clientHeight;
  camera.aspect=W/H; camera.updateProjectionMatrix();
  renderer.setSize(W,H); labelRenderer.setSize(W,H);
  composer.setSize(W,H); bloom.setSize(W,H);
  if(!userInteracted) fitCamera();
}
window.addEventListener('resize', onResize);
if(window.ResizeObserver) new ResizeObserver(onResize).observe(container);

/* ---------------- animation ---------------- */
function animate(){
  requestAnimationFrame(animate);
  const dt=Math.min(clock.getDelta(),0.05);
  const t=clock.elapsedTime;
  
  // Flow speed scales with current physical flow. If flow is 0, water stops!
  const speedScale = currentFlow / 20.0; // Scaled up to make flow movement extremely clear
  if(flowOn){ flowTime += dt * speedScale; }
  const pulse=0.5+0.5*Math.sin(t*2.2);

  // scroll the water textures along the pipe to read as flowing liquid
  for(const w of waterLayers){
    if(w.bubbleMap) w.bubbleMap.offset.y = (flowTime*1.2) % 1;
    if(w.flowMap) {
      if(w.isTube) w.flowMap.offset.x = (flowTime*0.8) % 1;
      else w.flowMap.offset.y = (flowTime*0.8) % 1;
    }
  }
  // cooler heat shimmer
  if(coolerHotMat) coolerHotMat.opacity = 0.42+0.18*pulse;
  coolerLight.intensity = 8+5*pulse;
  
  // Actuator stem and casing position linked to manual slider
  const targetStemY = (valveSimOpen / 100) * 0.65; // Massive 0.65 unit lift stroke
  stemGroup.position.y += (targetStemY - stemGroup.position.y) * 0.15; // Smooth interpolate
  
  // Severe physical vibration (hunting) for Fault 1
  if(faultLeak) {
    stemGroup.position.y += Math.sin(t * 35.0) * 0.04;
    stemGroup.position.x += Math.cos(t * 40.0) * 0.01;
  } else if (!dynActive) {
    // Tiny idle vibration for the entire assembly
    stemGroup.position.y += Math.sin(t*1.3)*0.01;
  }
  
  // 3D Model Red Blinking when ANY fault is active
  if (valveFaultMat) {
    if (faultLeak || faultStic || faultAir) {
      const p = 0.5 + 0.5 * Math.sin(t * 8.0);
      valveFaultMat.emissive.setHex(0xff0000);
      valveFaultMat.emissiveIntensity = p * 0.7;
    } else {
      valveFaultMat.emissive.setHex(0x000000);
      valveFaultMat.emissiveIntensity = 0;
    }
  }

  // discharge waves bob
  dischargeWaves.forEach((l,k)=>{ l.position.x = X.disch+0.4 + ((flowTime*0.6+k*0.3)%1)*0.4; l.material.opacity=0.35+0.25*Math.sin(t*3+k); });
  controls.update();
  composer.render();
  labelRenderer.render(scene,camera);
}
animate();
