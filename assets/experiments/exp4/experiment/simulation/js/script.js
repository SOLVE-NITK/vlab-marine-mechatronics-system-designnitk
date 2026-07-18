/* ================= state ================= */
const S={
  mode:'rtd',
  tTrue:25, tProbe:25, filt:10, buf:[], noise:false, tPhase:0,
  stepArm:false, stepT0:0, tauRaw:null, tauFil:null,
  prCmd:2.5, prMeas:2.5, hyst:false, hystT:0, fault:0, // 0 none 1 open 2 short
  hRise:[], hFall:[],
  pStepArm:false, pStepT0:0, pTau:null, pSettle:null, pOver:0,
  cond:0, vf:0, vG:0, vRms:0, vPk:0, vOff:null, vBuf:[], vPhase:0, impT:0,
  injA:0, frPts:[],
};
const rtdTrace=[], prTrace=[], vibTrace=[];
const $=id=>document.getElementById(id);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

/* ================= three.js ================= */
const canvas=$('canvas3d');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const scene=new THREE.Scene();
scene.background=new THREE.Color(0x06141f);
scene.fog=new THREE.Fog(0x06141f, 30, 80);
const camera=new THREE.PerspectiveCamera(46,2,.1,100);

const orbit={theta:.55,phi:1.1,r:16,target:new THREE.Vector3(1.5,1.5,0)};
function applyCam(){const t=orbit.target;
  camera.position.set(
    t.x+orbit.r*Math.sin(orbit.phi)*Math.sin(orbit.theta),
    t.y+orbit.r*Math.cos(orbit.phi),
    t.z+orbit.r*Math.sin(orbit.phi)*Math.cos(orbit.theta));
  camera.lookAt(t)}
let drag=false,isPan=false,px=0,py=0,pinch=0,panX=0,panY=0,camLocked=false;
canvas.addEventListener('pointerdown',e=>{drag=true;camLocked=false;isPan=(e.button===2||e.shiftKey||e.ctrlKey);px=e.clientX;py=e.clientY;canvas.setPointerCapture(e.pointerId)});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('pointermove',e=>{if(!drag)return;
  camLocked=false;
  if(isPan){
    const right=new THREE.Vector3(Math.cos(orbit.theta),0,-Math.sin(orbit.theta));
    orbit.target.addScaledVector(right,-(e.clientX-px)*.01);
    orbit.target.y+=(e.clientY-py)*.01;
  }else{
    orbit.theta-=(e.clientX-px)*.008;
    orbit.phi=clamp(orbit.phi-(e.clientY-py)*.006,.15,1.45);
  }
  px=e.clientX;py=e.clientY});
addEventListener('pointerup',()=>drag=false);
canvas.addEventListener('wheel',e=>{e.preventDefault();camLocked=false;
  orbit.r=clamp(orbit.r+e.deltaY*.01, 1, 45)},{passive:false});
canvas.addEventListener('touchstart',e=>{if(e.touches.length===2){drag=false;camLocked=false;
  pinch=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
  panX=(e.touches[0].clientX+e.touches[1].clientX)/2;
  panY=(e.touches[0].clientY+e.touches[1].clientY)/2;
}},{passive:true});
canvas.addEventListener('touchmove',e=>{if(e.touches.length===2){e.preventDefault();
  const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
  orbit.r=clamp(orbit.r-(d-pinch)*.02, 1, 45);pinch=d;
  const nx=(e.touches[0].clientX+e.touches[1].clientX)/2;
  const ny=(e.touches[0].clientY+e.touches[1].clientY)/2;
  const right=new THREE.Vector3(Math.cos(orbit.theta),0,-Math.sin(orbit.theta));
  orbit.target.addScaledVector(right,-(nx-panX)*.01);
  orbit.target.y+=(ny-panY)*.01;
  panX=nx;panY=ny;
}},{passive:false});

scene.add(new THREE.AmbientLight(0x33404f, 1.2));
const key=new THREE.DirectionalLight(0xfff0dd, 1.2);
key.position.set(6, 10, 5); key.castShadow=true;
key.shadow.mapSize.set(2048,2048);
key.shadow.camera.left=-12;key.shadow.camera.right=12;
key.shadow.camera.top=10;key.shadow.camera.bottom=-10;scene.add(key);
const fill=new THREE.PointLight(0x5b8cff, 0.7, 30);fill.position.set(-7,6,-4);scene.add(fill);
const fill2=new THREE.PointLight(0x8cbaff, 0.6, 30);fill2.position.set(7,5,4);scene.add(fill2);
const spot=new THREE.SpotLight(0xffe2b0, 1.3, 20, 0.8, 0.5);
spot.position.set(2, 8, 2); spot.target.position.set(2, 1.5, 0); scene.add(spot, spot.target);

const M={
  steel:new THREE.MeshStandardMaterial({color:0x8b98a6,metalness:.75,roughness:.35}),
  darkMetal:new THREE.MeshStandardMaterial({color:0x2b333d,metalness:.6,roughness:.5}),
  engine:new THREE.MeshStandardMaterial({color:0x33502f,metalness:.45,roughness:.55}),
  pump:new THREE.MeshStandardMaterial({color:0x27424e,metalness:.5,roughness:.5}),
  pipe:new THREE.MeshStandardMaterial({color:0x51606f,metalness:.7,roughness:.4}),
  wood:new THREE.MeshStandardMaterial({color:0x6b4a2f,roughness:.85}),
  woodTop:new THREE.MeshStandardMaterial({color:0x7d5a3a,roughness:.8}),
  dial:new THREE.MeshStandardMaterial({color:0xe9e4d4,roughness:.9}),
  needle:new THREE.MeshStandardMaterial({color:0xcc2222,roughness:.4}),
  brass:new THREE.MeshStandardMaterial({color:0xc9a24b,metalness:.85,roughness:.3}),
  black:new THREE.MeshStandardMaterial({color:0x14181d,roughness:.6}),
  ledOn:new THREE.MeshBasicMaterial({color:0x5df08d}),
  ledOff:new THREE.MeshBasicMaterial({color:0x1d2a22}),
  ledRed:new THREE.MeshBasicMaterial({color:0xff5a5a}),
  wireR:new THREE.MeshStandardMaterial({color:0xb03030,roughness:.6}),
  wireB:new THREE.MeshStandardMaterial({color:0x2f5fb0,roughness:.6}),
  wireY:new THREE.MeshStandardMaterial({color:0xc9a227,roughness:.6}),
  floor:new THREE.MeshStandardMaterial({color:0x10161d,roughness:.95}),
  coolant:new THREE.MeshStandardMaterial({color:0x2a7ec4,transparent:true,opacity:.85,roughness:.2}),
  probe:new THREE.MeshStandardMaterial({color:0xd8dee6,metalness:.9,roughness:.25}),
  braided:new THREE.MeshStandardMaterial({color:0xdddddd,metalness:.2,roughness:.8}),
  wireRed:new THREE.MeshStandardMaterial({color:0xcc2222,roughness:.6}),
  wireBlue:new THREE.MeshStandardMaterial({color:0x2255cc,roughness:.6}),
};
function mesh(g,m,x=0,y=0,z=0,shadow=true){const o=new THREE.Mesh(g,m);
  o.position.set(x,y,z);o.castShadow=shadow;o.receiveShadow=true;return o}

/* floor + bench */
scene.add(mesh(new THREE.PlaneGeometry(60,60),M.floor,0,0,0,false).rotateX(-Math.PI/2));
const bench=new THREE.Group();
bench.add(mesh(new THREE.BoxGeometry(14,.28,5.4),M.woodTop,0,1.1,0));
[[-6.5,-2.3],[6.5,-2.3],[-6.5,2.3],[6.5,2.3]].forEach(([x,z])=>
  bench.add(mesh(new THREE.BoxGeometry(.28,1.1,.28),M.darkMetal,x,.55,z)));
bench.add(mesh(new THREE.BoxGeometry(13.4,.14,4.8),M.wood,0,.5,0));
scene.add(bench);
scene.add(mesh(new THREE.BoxGeometry(14,2.2,.18),M.darkMetal,0,2.4,-2.6));

/* ---------- Station A: engine block + coolant pipe + RTD (left) ---------- */
const rtdSt=new THREE.Group(); rtdSt.position.set(-4.6,1.24,0.2); scene.add(rtdSt);
/* engine block */
const engBlock=new THREE.Group(); rtdSt.add(engBlock);
// 1. Oil pan (black, slightly smaller footprint)
engBlock.add(mesh(new THREE.BoxGeometry(2.0, 0.4, 1.3), M.black, 0, 0.2, 0));
// 2. Crankcase (dark metal)
engBlock.add(mesh(new THREE.BoxGeometry(2.2, 0.4, 1.5), M.darkMetal, 0, 0.6, 0));
// 3. Cylinder Block (green)
engBlock.add(mesh(new THREE.BoxGeometry(2.1, 0.8, 1.4), M.engine, 0, 1.2, 0));
// 4. Vertical Cooling / Structural Ribs on the block
for(let i=0; i<6; i++) {
  engBlock.add(mesh(new THREE.BoxGeometry(0.08, 0.8, 1.45), M.engine, -1.0 + i*0.4, 1.2, 0));
}
engBlock.add(mesh(new THREE.BoxGeometry(2.15, 0.08, 1.45), M.engine, 0, 1.2, 0)); // Horizontal rib
// 5. Head Gasket
engBlock.add(mesh(new THREE.BoxGeometry(2.15, 0.05, 1.45), M.steel, 0, 1.625, 0));
// 6. Cylinder Head (dark metal base)
engBlock.add(mesh(new THREE.BoxGeometry(2.2, 0.2, 1.5), M.darkMetal, 0, 1.75, 0));
// 7. Individual Valve Covers (4 cylinders)
for(let i=0; i<4; i++) {
  const cx = -0.75 + i*0.5;
  engBlock.add(mesh(new THREE.BoxGeometry(0.4, 0.2, 0.8), M.engine, cx, 1.95, 0));
  const top = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.8, 16), M.engine, cx, 2.05, 0);
  top.rotation.x = Math.PI/2; engBlock.add(top);
  // Fuel Injector (Brass & Steel)
  engBlock.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.15), M.brass, cx, 2.1, 0.2));
  engBlock.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.2), M.steel, cx, 2.2, 0.2));
  // Head bolts
  for (let z of [-0.4, 0.4]) {
    engBlock.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.1), M.steel, cx - 0.25, 1.85, z));
    engBlock.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.1), M.steel, cx + 0.25, 1.85, z));
  }
}
// 8. Coolant Outlet Flange
const flange = mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.1, 16), M.darkMetal, 1.05, 1.3, 0);
flange.rotation.z = Math.PI/2; engBlock.add(flange);
for(let i=0; i<4; i++) {
  const a = i * Math.PI/2 + Math.PI/4;
  const bolt = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.15), M.steel, 1.05, 1.3 + Math.sin(a)*0.18, Math.cos(a)*0.18);
  bolt.rotation.z = Math.PI/2; engBlock.add(bolt);
}
// 9. Exhaust Manifold (back side)
const exhaust = new THREE.Group(); exhaust.position.set(0, 1.3, -0.7); engBlock.add(exhaust);
exhaust.add(mesh(new THREE.BoxGeometry(2.0, 0.4, 0.1), M.darkMetal, 0, 0, 0));
for(let i=0; i<4; i++) {
  const runner = mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.3), M.darkMetal, -0.75 + i*0.5, 0, -0.15);
  runner.rotation.x = Math.PI/2; exhaust.add(runner);
}
exhaust.add(mesh(new THREE.CylinderGeometry(0.18, 0.18, 2.1), M.darkMetal, 0, -0.1, -0.3).rotateZ(Math.PI/2));
exhaust.add(mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.3), M.darkMetal, -1.05, -0.1, -0.3).rotateZ(Math.PI/2));

/* coolant pipe out of engine */
const pipe=mesh(new THREE.CylinderGeometry(.16,.16,2.1,18),M.pipe,2.1,1.3,0);
pipe.rotation.z=Math.PI/2; rtdSt.add(pipe);
rtdSt.add(mesh(new THREE.SphereGeometry(.16,18,18),M.pipe,3.15,1.3,0)); // perfectly rounded elbow joint
const pipeUp=mesh(new THREE.CylinderGeometry(.16,.16,1.3,18),M.pipe,3.15,.65,0);rtdSt.add(pipeUp);
/* sight-glass with coolant colour */
const sight=mesh(new THREE.CylinderGeometry(.19,.19,.5,18),M.coolant,1.4,1.3,0);
sight.rotation.z=Math.PI/2; rtdSt.add(sight);
/* RTD probe screwed into pipe (thermowell) */
const rtdProbe=new THREE.Group(); rtdProbe.position.set(2.3,1.48,0); rtdSt.add(rtdProbe);
rtdProbe.add(mesh(new THREE.CylinderGeometry(.09,.09,.28,10),M.brass,0,.1,0));
rtdProbe.add(mesh(new THREE.CylinderGeometry(.05,.05,.6,10),M.probe,0,.5,0));
rtdProbe.add(mesh(new THREE.CylinderGeometry(.06,.06,.3,10),M.black,0,.9,0)); // Heat shrink
/* heat shimmer glow under engine */
const heatGlow=new THREE.PointLight(0xff5522,0,6);heatGlow.position.set(-4.6,2.2,.2);scene.add(heatGlow);

/* ---------- Station B: Pump discharge pipe + Pressure Transducer (middle) ---------- */
const prSt=new THREE.Group(); prSt.position.set(0.4,1.24,0.2); scene.add(prSt);
// Pump Base
prSt.add(mesh(new THREE.BoxGeometry(1.6,.2,1.2),M.darkMetal,-0.1,.1,0));

// Motor body
const motor = mesh(new THREE.CylinderGeometry(.32, .32, .5, 24), M.darkMetal, -0.55, .45, 0);
motor.rotation.z = Math.PI/2; prSt.add(motor);
for(let i=0; i<6; i++) {
  const fin = mesh(new THREE.CylinderGeometry(.36, .36, 0.04, 24), M.darkMetal, -0.75 + i*0.08, .45, 0);
  fin.rotation.z = Math.PI/2; prSt.add(fin);
}

// Coupling (Steel shaft/seal between motor and volute)
const coupling = mesh(new THREE.CylinderGeometry(.25, .25, .15, 16), M.steel, -0.225, .45, 0);
coupling.rotation.z = Math.PI/2; prSt.add(coupling);

// Pump Volute (Casing)
const volute = mesh(new THREE.CylinderGeometry(.45, .45, .3, 24), M.pump, 0, .45, 0);
volute.rotation.z = Math.PI/2; prSt.add(volute);
const suction = mesh(new THREE.CylinderGeometry(.15, .15, .1, 16), M.pump, 0.2, .45, 0);
suction.rotation.z = Math.PI/2; prSt.add(suction);

// Discharge Flange
prSt.add(mesh(new THREE.CylinderGeometry(.2, .2, .1, 16), M.steel, 0, .9, 0));

/* discharge pipe up & Tee */
const dGroup = new THREE.Group(); dGroup.position.set(0, 0.9, 0); prSt.add(dGroup);
const dpipe=mesh(new THREE.CylinderGeometry(.13,.13,1.4,16),M.pipe,0,0.6,0); dGroup.add(dpipe);
dGroup.add(mesh(new THREE.SphereGeometry(.16,18,18),M.pipe,0,1.3,0)); // perfectly rounded tee junction
const hpipeL = mesh(new THREE.CylinderGeometry(.13,.13,0.4,16),M.pipe,-0.2,1.3,0); hpipeL.rotation.z = Math.PI/2; dGroup.add(hpipeL);

// Right side with axial back-mounted gauge
const hpipeR = mesh(new THREE.CylinderGeometry(.13,.13,0.45,16),M.pipe,0.225,1.3,0); hpipeR.rotation.z = Math.PI/2; dGroup.add(hpipeR);
dGroup.add(mesh(new THREE.SphereGeometry(.13,16,16),M.pipe,0.45,1.3,0)); // gauge elbow
const fpipe = mesh(new THREE.CylinderGeometry(.13,.13,0.15,16),M.pipe,0.45,1.3,0.075); fpipe.rotation.x = Math.PI/2; dGroup.add(fpipe);
dGroup.add(mesh(new THREE.CylinderGeometry(.05,.05,.08,12),M.brass,0.45,1.3,0.19).rotateX(Math.PI/2)); // brass fitting

/* analog pressure gauge */
const gauge=new THREE.Group(); gauge.position.set(.45,1.3,0.31); dGroup.add(gauge);
gauge.add(mesh(new THREE.CylinderGeometry(.35,.35,.16,28),M.darkMetal).rotateX(Math.PI/2));
gauge.add(mesh(new THREE.CylinderGeometry(.31,.31,.05,28),M.white,0,0,.08).rotateX(Math.PI/2));
for(let i=0;i<8;i++){
  const a=Math.PI/4*i;
  gauge.add(mesh(new THREE.BoxGeometry(.02,.08,.02),M.black,Math.sin(a)*.25,Math.cos(a)*.25,.11,false).rotateZ(a));
}
const gNeedle=new THREE.Group(); gNeedle.position.set(0,0,.13); gauge.add(gNeedle);
gNeedle.add(mesh(new THREE.BoxGeometry(.025,.25,.02),M.needle,0,.1,0,false));
gNeedle.add(mesh(new THREE.CylinderGeometry(.04,.04,.05,10),M.brass).rotateX(Math.PI/2));

/* transducer on tee */
const xdcr=new THREE.Group(); xdcr.position.set(-.4,1.3,0); dGroup.add(xdcr);
xdcr.add(mesh(new THREE.CylinderGeometry(.11,.11,.15,12),M.steel, .07,0,0).rotateZ(Math.PI/2));
xdcr.add(mesh(new THREE.CylinderGeometry(.16,.16,.4,16),M.darkMetal,-.15,0,0).rotateZ(Math.PI/2));
xdcr.add(mesh(new THREE.CylinderGeometry(.08,.08,.1,10),M.black,-.4,0,0).rotateZ(Math.PI/2));
const xdcrLed=mesh(new THREE.SphereGeometry(.04,8,8),M.ledOn,-.45,0.08,0,false);xdcr.add(xdcrLed);

/* ---------- Station C: engine bearing + accelerometer (right) ---------- */
const vibSt=new THREE.Group(); vibSt.position.set(4.7,1.24,0.2); scene.add(vibSt);
const vibBody=new THREE.Group(); vibSt.add(vibBody);
vibBody.add(mesh(new THREE.BoxGeometry(1.9,1.2,1.3),M.engine,0,.6,0));
/* bearing pedestal + shaft */
vibBody.add(mesh(new THREE.BoxGeometry(.5,.55,.8),M.pump,1.15,.35,0));
vibBody.add(mesh(new THREE.TorusGeometry(.17,.08,10,22),M.steel,1.15,.75,0).rotateY(Math.PI/2));
const vShaft=mesh(new THREE.CylinderGeometry(.08,.08,1.6,12),M.steel,1.5,.75,0);
vShaft.rotation.z=Math.PI/2; vibBody.add(vShaft);
const flyw=mesh(new THREE.CylinderGeometry(.4,.4,.12,26),M.darkMetal,2.1,.75,0);
flyw.rotation.z=Math.PI/2; vibBody.add(flyw);
const flySpokes=new THREE.Group();flySpokes.position.set(2.1,.75,0);vibBody.add(flySpokes);
for(let i=0;i<4;i++){const s=mesh(new THREE.BoxGeometry(.03,.6,.05),M.steel,0,0,0,false);
  s.rotation.x=i*Math.PI/4;flySpokes.add(s)}
/* accelerometer puck on bearing housing */
const accel=new THREE.Group(); accel.position.set(1.15,1.0,0); vibBody.add(accel);
accel.add(mesh(new THREE.CylinderGeometry(.1, .1, .04, 6), M.steel, 0, .02, 0)); // Hex mounting stud
accel.add(mesh(new THREE.CylinderGeometry(.12, .12, .14, 24), M.steel, 0, .11, 0)); // Main body
accel.add(mesh(new THREE.CylinderGeometry(.07, .12, .06, 24), M.steel, 0, .21, 0)); // Tapered neck
accel.add(mesh(new THREE.CylinderGeometry(.06, .06, .08, 16), M.steel, 0, .28, 0)); // Top connector base
accel.add(mesh(new THREE.CylinderGeometry(.08, .08, .08, 16), M.darkMetal, 0, .36, 0)); // Knurled ring
accel.add(mesh(new THREE.CylinderGeometry(.04, .04, .08, 16), M.black, 0, .43, 0)); // Rubber boot base
accel.add(mesh(new THREE.CylinderGeometry(.035, .035, .15, 12), M.black, -.05, .45, 0).rotateZ(Math.PI/2)); // Rubber boot elbow
const accLed=mesh(new THREE.SphereGeometry(.015,8,8),M.ledOn,0,.11,.12,false);accel.add(accLed); // Status LED
/* alarm beacon */
const beacon=mesh(new THREE.CylinderGeometry(.1,.13,.22,12),
  new THREE.MeshStandardMaterial({color:0x661111,emissive:0x000000,roughness:.4}),-.6,1.35,0);
vibSt.add(beacon);
const beaconLight=new THREE.PointLight(0xff3333,0,5);beaconLight.position.set(4.1,2.8,.2);scene.add(beaconLight);

/* ---------- shared: Arduino DAQ board on bench ---------- */
const ard=new THREE.Group(); ard.position.set(0,1.27,1.75); scene.add(ard);
ard.add(mesh(new THREE.BoxGeometry(1.1,.04,.85),new THREE.MeshStandardMaterial({color:0x005a78,roughness:.8})));
ard.add(mesh(new THREE.BoxGeometry(.22,.2,.25),M.black,-.35,.12,-.3)); // Power
ard.add(mesh(new THREE.BoxGeometry(.25,.2,.25),M.steel,.35,.12,-.3)); // USB
ard.add(mesh(new THREE.BoxGeometry(.18,.08,.6),M.black,0,.06,.15)); // ATmega328P
for(let i=0;i<14;i++) ard.add(mesh(new THREE.BoxGeometry(.22,.04,.02),M.steel,0,.04,-.11+i*.04));
ard.add(mesh(new THREE.BoxGeometry(.08,.12,.6),M.black,.45,.08,0.1)); // Digital Header
ard.add(mesh(new THREE.BoxGeometry(.08,.12,.25),M.black,-.45,.08,-0.05)); // Power Header
ard.add(mesh(new THREE.BoxGeometry(.08,.12,.3),M.black,-.45,.08,0.25)); // Analog Header
for(let i=0; i<6; i++) ard.add(mesh(new THREE.BoxGeometry(.04,.121,.02),M.steel,-.45,.08,0.125 + i*0.05));
ard.add(mesh(new THREE.BoxGeometry(.12,.04,.06),M.steel,-.15,.04,-.15)); // Crystal
const cap = new THREE.CylinderGeometry(.04,.04,.12,12);
ard.add(mesh(cap,M.steel,-.25,.1,-.1)); ard.add(mesh(cap,M.steel,-.25,.1,0));
ard.add(mesh(new THREE.BoxGeometry(.08,.04,.08),M.steel,.25,.04,-.1));
ard.add(mesh(new THREE.BoxGeometry(.04,.05,.04),M.needle,.25,.05,-.1)); // Reset
const ardLed=mesh(new THREE.SphereGeometry(.025,8,8),M.ledOn,.25,.05,0.1,false); ard.add(ardLed); // L
const txLed=mesh(new THREE.SphereGeometry(.025,8,8),M.ledOn,.25,.05,0.18,false); ard.add(txLed); // TX
const rxLed=mesh(new THREE.SphereGeometry(.025,8,8),M.ledOn,.25,.05,0.23,false); ard.add(rxLed); // RX

/* signal wires: directly into Analog In header (A0-A4) */
const TERM={
  press:new THREE.Vector3(-0.45, 1.41, 1.875), // A0
  vib:  new THREE.Vector3(-0.45, 1.41, 1.925), // A1
};
function sigWire(from, to, mat, dirFrom, dirTo, length) {
  const numPoints = 60;
  const pos = [];
  const old = [];
  for (let i = 0; i < numPoints; i++) {
    const p = from.clone().lerp(to, i / (numPoints - 1));
    const t = i / (numPoints - 1);
    p.y -= (length - from.distanceTo(to)) * t * (1 - t) * 2;
    pos.push(p);
    old.push(p.clone());
  }
  const segDist = length / (numPoints - 1);
  const p1 = from.clone().add(dirFrom.clone().normalize().multiplyScalar(segDist));
  const pN_1 = to.clone().add(dirTo.clone().normalize().multiplyScalar(segDist));
  
  for (let iter = 0; iter < 400; iter++) {
    for (let i = 2; i < numPoints - 2; i++) {
      const v = pos[i].clone().sub(old[i]).multiplyScalar(0.7);
      old[i].copy(pos[i]);
      pos[i].add(v);
      pos[i].y -= 0.0025; // gravity
      if (pos[i].y < 1.265) pos[i].y = 1.265; // desk collision
      
      // pipe collision (specifically for the RTD wire)
      if (pos[i].x < -1.0 && pos[i].x > -4.0) {
        const dy = pos[i].y - 2.54;
        const dz = pos[i].z - 0.2;
        const dSq = dy*dy + dz*dz;
        if (dSq < 0.05) { // ~0.22^2
          const d = Math.sqrt(dSq);
          pos[i].y = 2.54 + (dy/d)*0.22;
          pos[i].z = 0.2 + (dz/d)*0.22;
        }
      }
      
      // Engine block collision (Vibration station)
      if (pos[i].x > 3.7 && pos[i].x < 5.7 && pos[i].z > -0.5 && pos[i].z < 0.9) {
        if (pos[i].y < 2.47) pos[i].y = 2.47;
      }
    }
    pos[0].copy(from);
    pos[1].copy(p1);
    pos[numPoints-1].copy(to);
    pos[numPoints-2].copy(pN_1);
    for (let c = 0; c < 8; c++) {
      for (let i = 0; i < numPoints - 1; i++) {
        const delta = pos[i+1].clone().sub(pos[i]);
        const dist = Math.max(delta.length(), 0.0001);
        const diff = (dist - segDist) / dist;
        const move = delta.multiplyScalar(0.5 * diff);
        if (i > 1) pos[i].add(move);
        if (i < numPoints - 2) pos[i+1].sub(move);
      }
      for (let i = 2; i < numPoints - 2; i++) {
        const target = pos[i-1].clone().add(pos[i+1]).multiplyScalar(0.5);
        pos[i].lerp(target, 0.04); // stiffness
      }
    }
  }
  const curve = new THREE.CatmullRomCurve3(pos);
  scene.add(mesh(new THREE.TubeGeometry(curve, 64, 0.022, 10), mat, 0, 0, 0, true));
}

// from, to, mat, dirFrom, dirTo, length
const rtdEnd = new THREE.Vector3(-0.75, 1.45, 1.95);
sigWire(new THREE.Vector3(-2.3, 3.77, .2), rtdEnd, M.braided, new THREE.Vector3(0, 1, 1.5), new THREE.Vector3(0, 1, 0), 3.6); // RTD

// Draw the 3-wire pigtail (Red, Red, Blue) into Analog pins A2, A3, A4
scene.add(mesh(new THREE.CylinderGeometry(.04,.04,.15,10), M.black, -0.75, 1.4, 1.95)); // heat shrink
function pigtail(mat, destZ) {
  const c = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.75, 1.35, 1.95),
    new THREE.Vector3(-0.6, 1.4, destZ),
    new THREE.Vector3(-0.45, 1.41, destZ)
  ]);
  scene.add(mesh(new THREE.TubeGeometry(c, 12, .008, 6), mat, 0, 0, 0, false));
}
pigtail(M.wireRed, 1.975); // A2
pigtail(M.wireRed, 2.025); // A3
pigtail(M.wireBlue, 2.075); // A4
sigWire(new THREE.Vector3(-0.4, 3.44, .2), TERM.press, M.wireRed, new THREE.Vector3(-1, 0, 0), new THREE.Vector3(-1, 1, 0), 2.8); // Transducer
sigWire(new THREE.Vector3(5.75, 2.69, 0.2), TERM.vib, M.wireB, new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0), 8.5); // Accel

const FOCUS={
  rtd:{t:new THREE.Vector3(-3.3,2.0,.2),r:8.5},
  press:{t:new THREE.Vector3(0.4,2.4,.2),r:8},
  vib:{t:new THREE.Vector3(5.4,1.9,.2),r:8},
};

/* ================= simulation ================= */
let adcRaw=102, tCalc=0, tFil=0, noiseWin=[], noiseWinF=[];
function stepRTD(dt){
  // first-order probe with tau=15s (sim accelerated to match manual's 1.2s total expected timing)
  const visualTau = 1.2;
  S.tProbe+=(S.tTrue-S.tProbe)*dt/visualTau;
  
  // sensor voltage 0.5V to 3.5V over 0-100C (3V span = 614 counts), plus noise
  let v = 0.5 + (S.tProbe/100 * 3.0);
  if(S.noise){
    S.tPhase+=dt*2*Math.PI*50;
    v+=Math.sin(S.tPhase)*0.06+(Math.random()-.5)*.04;
  } else {
    v+=(Math.random()-.5)*.006;
  }
  
  adcRaw=clamp(Math.round(v/5*1023),0,1023);
  const volt=adcRaw/1023*5;
  tCalc=(adcRaw-102)/614*100;
  // moving average
  S.buf.push(tCalc); while(S.buf.length>S.filt)S.buf.shift();
  tFil=S.buf.reduce((a,b)=>a+b,0)/S.buf.length;
  noiseWin.push(tCalc); if(noiseWin.length>90)noiseWin.shift();
  noiseWinF.push(tFil); if(noiseWinF.length>90)noiseWinF.shift();
  // Task 3: time to 63.2% of 50->75 step (65.8 °C)
  if(S.stepArm){
    const ms=performance.now()-S.stepT0;
    if(S.tauRaw==null&&tCalc>=65.8)S.tauRaw=ms;
    if(S.tauFil==null&&tFil>=65.8)S.tauFil=ms;
    if(S.tauRaw!=null&&S.tauFil!=null){
      S.stepArm=false;
      $('bStep').classList.remove('on');
      $('bStep').innerHTML = 'Step 50&rarr;75 &deg;C';
    }
    $('tauNote').innerHTML=`63.2&nbsp;% point of 50&rarr;75 step = <b>65.8 °C</b> · raw: <b>${S.tauRaw==null?'—':(S.tauRaw/1000).toFixed(2)+' s'}</b> · filtered: <b>${S.tauFil==null?'—':(S.tauFil/1000).toFixed(2)+' s'}</b>`;
  }
  rtdTrace.push([S.tTrue,tCalc,tFil]); if(rtdTrace.length>260)rtdTrace.shift();
}
let hDir=1;
function hystDone(){
  let rows='',hMax=0;
  for(let i=0;i<=20;i++){
    const r=S.hRise[i],f=S.hFall[i];
    if(r===undefined&&f===undefined)continue;
    const h=(r!==undefined&&f!==undefined)?Math.abs(r-f):null;
    if(h!=null)hMax=Math.max(hMax,h);
    rows+=`<tr><td>${(i*0.5).toFixed(1)}</td><td>${r===undefined?'—':r.toFixed(2)}</td><td>${f===undefined?'—':f.toFixed(2)}</td><td>${h==null?'—':h.toFixed(2)}</td></tr>`;
  }
  $('hystBody').innerHTML=rows;
  $('pHyst').innerHTML=hMax.toFixed(2)+'<span class="unit"> bar</span>';
  $('hystRes').innerHTML=`H = max&nbsp;|P&uarr; &minus; P&darr;| = <b>${hMax.toFixed(2)} bar</b> (${(hMax/10*100).toFixed(1)}&nbsp;% FS) — typical spec &plusmn;0.1 bar (&plusmn;1&nbsp;% FS).`;
}
function stepPress(dt){
  if(S.hyst){S.hystT+=dt;
    const p=S.hystT*1.4;
    S.prCmd = p<10? p : clamp(20-p,0,10);
    hDir=p<10?1:-1;
    // Task 1: log measured pressure at each 0.5 bar boundary, rising and falling
    if(hDir<0&&S.hRise[20]===undefined)S.hRise[20]=S.prMeas; // top endpoint at turnaround
    for(let i=0;i<=20;i++){
      if(hDir>0){if(S.hRise[i]===undefined&&S.prCmd>=i*0.5)S.hRise[i]=S.prMeas}
      else if(S.hFall[i]===undefined&&S.prCmd<=i*0.5)S.hFall[i]=S.prMeas;
    }
    if(p>=20){S.hyst=false;$('bHyst').classList.remove('on');$('bHyst').innerHTML='&#9654; Hysteresis sweep 0&rarr;10&rarr;0';hystDone()}
    $('sPr').value=S.prCmd.toFixed(1);fillR($('sPr'));$('oPr').textContent=S.prCmd.toFixed(1)+' bar';
  }
  // first-order 80ms + hysteresis band 0.1 bar
  const target=S.prCmd + hDir*0.05;
  S.prMeas+=(target-S.prMeas)*dt/0.08;
  // Task 2: step 5->7 bar response metrics
  if(S.pStepArm){
    const ms=performance.now()-S.pStepT0;
    S.pOver=Math.max(S.pOver,S.prMeas);
    if(S.pTau==null&&S.prMeas>=6.264){S.pTau=ms;
      $('pTau').innerHTML=ms.toFixed(0)+'<span class="unit"> ms</span>'}
    if(S.pSettle==null&&Math.abs(S.prMeas-7.05)<=0.04)S.pSettle=ms; // steady state incl. +0.05 hysteresis band
    if(S.pSettle!=null||ms>3000){S.pStepArm=false;
      $('bPStep').classList.remove('on');
      $('bPStep').innerHTML = 'Step 5&rarr;7 bar';
      const ov=Math.max(0,S.pOver-7);
      $('pStepRes').innerHTML=`Task 2 — step 5&rarr;7 bar: 63.2&nbsp;% time <b>${S.pTau==null?'—':S.pTau.toFixed(0)+' ms'}</b> · settle &plusmn;2&nbsp;% <b>${S.pSettle==null?'—':S.pSettle.toFixed(0)+' ms'}</b> · overshoot <b>${ov.toFixed(2)} bar</b>`;
    }
  }
  // Calculate apparent pressure based on 4-20mA loop current (to reflect faults on the graph)
  let mA=4+S.prMeas/10*16;
  if(S.fault===1)mA=2.1+Math.random()*.4;
  if(S.fault===2)mA=22.5+Math.random()*.5;
  let apparentP = ((mA - 4) / 16) * 10;
  
  prTrace.push([S.prCmd, apparentP]); if(prTrace.length>260)prTrace.shift();
}
function stepVib(dt){
  S.vPhase+=dt;
  let g=(Math.random()-.5)*1.6;                       // normal random <2g rms-ish
  g += 3.5;                                           // HARDWARE DEFECT: +3.5g static bias
  if(S.cond>=1){S.impT+=dt;
    if(S.impT>.5){S.impT=0;S.imp=1}
    if(S.imp>0){g+=Math.sin(S.imp*40)*6.5*Math.exp(-S.imp*9)*(S.cond===2?1.5:1);
      S.imp+=dt}}
  if(S.cond===2)g+=(Math.random()-.5)*5;
  if(S.vf>0){const att=1/Math.sqrt(1+Math.pow(S.vf/1000,4)); // anti-alias 1kHz
    S.injA=2*att;
    g+=2*att*Math.sin(S.vPhase*2*Math.PI*Math.min(S.vf,120))} // visual freq capped
  else S.injA=0;
  g=clamp(g,-10,10);
  
  if (S.vOff !== null) g = g - (S.vOff / 0.1);        // Software calibration applies correction
  
  S.vG=g;
  S.vBuf.push(g); if(S.vBuf.length>100)S.vBuf.shift();
  S.vRms=Math.sqrt(S.vBuf.reduce((a,b)=>a+b*b,0)/S.vBuf.length);
  S.vPk=Math.max(S.vPk,Math.abs(g));
  vibTrace.push(g); if(vibTrace.length>320)vibTrace.shift();
}

/* ================= scopes ================= */
function fitScope(c){const r=c.getBoundingClientRect();
  if(c.width!==r.width*2){c.width=r.width*2;c.height=220}}
function grid(x){x.strokeStyle='rgba(11,31,42,.15)';x.lineWidth=1;x.beginPath();
  for(let i=1;i<6;i++){x.moveTo(0,i*220/6);x.lineTo(x.canvas.width,i*220/6)}
  for(let i=1;i<10;i++){x.moveTo(i*x.canvas.width/10,0);x.lineTo(i*x.canvas.width/10,220)}
  x.stroke()}
function line(x,data,idx,color,scale,off){
  x.strokeStyle=color;x.lineWidth=2;x.beginPath();
  const n=data.length,W=x.canvas.width;
  for(let i=0;i<n;i++){
    const v=idx==null?data[i]:data[i][idx];
    const y=220-(v*scale+off);
    i?x.lineTo(i/(n-1)*W,y):x.moveTo(0,y)}
  x.stroke()}
function drawRtd(){const c=$('scopeRtd');fitScope(c);const x=c.getContext('2d');
  x.clearRect(0,0,c.width,220);grid(x);
  if(rtdTrace.length>1){line(x,rtdTrace,0,'#b4441f',1.9,15);
    line(x,rtdTrace,1,'#1d7a94',1.9,15);line(x,rtdTrace,2,'#1f7a4d',1.9,15)}}
function drawPr(){const c=$('scopePr');fitScope(c);const x=c.getContext('2d');
  x.clearRect(0,0,c.width,220);grid(x);
  if(prTrace.length>1){line(x,prTrace,0,'#b4441f',19,15);line(x,prTrace,1,'#1f7a4d',19,15)}}
function drawFr(){const c=$('scopeFr');fitScope(c);const x=c.getContext('2d');
  x.clearRect(0,0,c.width,220);grid(x);
  const W=c.width,fx=f=>(Math.log10(f)-1)/2.7*W,fy=a=>220-(a*80+8);
  // reference: 2 g injected & -3 dB (1.41 g)
  x.setLineDash([8,8]);x.lineWidth=1.5;
  x.strokeStyle='rgba(11,31,42,.35)';x.beginPath();x.moveTo(0,fy(2));x.lineTo(W,fy(2));x.stroke();
  x.strokeStyle='#b4441f';x.beginPath();x.moveTo(0,fy(2/Math.SQRT2));x.lineTo(W,fy(2/Math.SQRT2));x.stroke();
  x.setLineDash([]);
  if(S.frPts.length>1){x.strokeStyle='#1f7a4d';x.lineWidth=2;x.beginPath();
    S.frPts.forEach((p,i)=>i?x.lineTo(fx(p.f),fy(p.a)):x.moveTo(fx(p.f),fy(p.a)));x.stroke()}
  x.fillStyle='#1f7a4d';
  S.frPts.forEach(p=>{x.beginPath();x.arc(fx(p.f),fy(p.a),5,0,Math.PI*2);x.fill()});
  // freq labels 10/100/1000/5000
  x.fillStyle='rgba(11,31,42,.55)';x.font='20px Arial';
  [10,100,1000,5000].forEach(f=>x.fillText(f>=1000?(f/1000)+'k':f,clamp(fx(f)+6,6,W-30),212));}
function drawVib(){const c=$('scopeVib');fitScope(c);const x=c.getContext('2d');
  x.clearRect(0,0,c.width,220);grid(x);
  // alarm lines ±8g
  x.strokeStyle='#b4441f';x.setLineDash([8,8]);x.lineWidth=1.5;
  [8,-8].forEach(v=>{const y=110-v*10;x.beginPath();x.moveTo(0,y);x.lineTo(c.width,y);x.stroke()});
  x.setLineDash([]);
  if(vibTrace.length>1)line(x,vibTrace,null,'#1f7a4d',10,110);}

/* ================= UI ================= */
function fillR(el){el.style.setProperty('--fill',((el.value-el.min)/(el.max-el.min)*100)+'%')}
document.querySelectorAll('input[type=range]').forEach(r=>{fillR(r);
  r.addEventListener('input',()=>fillR(r))});

document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>{
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.pane').forEach(x=>x.classList.remove('active'));
  t.classList.add('active');$('pane-'+t.dataset.pane).classList.add('active');
  S.mode=t.dataset.pane;
  camLocked=true;
  $('hudSub').textContent=({
    rtd:'RTD Pt100 — main-engine cooling-water temperature',
    press:'4–20 mA loop — ballast pump discharge pressure',
    vib:'Accelerometer ±10 g — main-bearing condition monitoring'})[S.mode];
});

/* RTD */
$('sTemp').oninput=e=>{S.tTrue=+e.target.value;$('oTemp').textContent=S.tTrue+' °C'};
document.querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>{
  S.tTrue=+b.dataset.t;$('sTemp').value=S.tTrue;fillR($('sTemp'));
  $('oTemp').textContent=S.tTrue+' °C'});
$('bStep').onclick=()=>{
  $('bStep').classList.add('on');
  $('bStep').textContent='Running...';
  S.tTrue=50;S.tProbe=50;$('sTemp').value=50;fillR($('sTemp'));
  $('oTemp').textContent='50 °C';S.stepArm=false;
  setTimeout(()=>{S.tTrue=75;$('sTemp').value=75;fillR($('sTemp'));
    $('oTemp').textContent='75 °C';
    S.stepArm=true;S.stepT0=performance.now();S.tauRaw=S.tauFil=null},700)};
document.querySelectorAll('#segFilt button').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('#segFilt button').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');S.filt=+b.dataset.f;S.buf=[]});
$('bNoise').onclick=()=>{S.noise=!S.noise;$('bNoise').classList.toggle('on',S.noise);
  $('bNoise').textContent=S.noise?'50 Hz noise ON':'Inject 50 Hz mains noise'};
const calPts=[];
$('bCal').onclick=()=>{
  $('bCal').classList.add('on');
  $('bCal').textContent='Recorded!';
  setTimeout(()=>{
    $('bCal').classList.remove('on');
    $('bCal').innerHTML='&#65291; Record point';
  }, 500);
  calPts.push({t:S.tTrue,adc:adcRaw,calc:tFil});
  const tb=$('calBody');
  tb.innerHTML=calPts.map(p=>`<tr><td>${p.t}</td><td>${p.adc}</td><td>${p.calc.toFixed(1)}</td><td>${(p.calc-p.t>=0?'+':'')+(p.calc-p.t).toFixed(1)}</td></tr>`).join('');
  if(calPts.length>=2){ // least squares T = a*V + b, V = adc/1023*5
    const xs=calPts.map(p=>p.adc/1023*5),ys=calPts.map(p=>p.t),n=xs.length;
    const sx=xs.reduce((a,b)=>a+b),sy=ys.reduce((a,b)=>a+b),
      sxy=xs.reduce((a,x,i)=>a+x*ys[i],0),sxx=xs.reduce((a,x)=>a+x*x,0);
    const a=(n*sxy-sx*sy)/(n*sxx-sx*sx),b2=(sy-a*sx)/n;
    $('calFit').innerHTML=`Fit: <b>T = ${a.toFixed(2)}·V ${b2>=0?'+':'−'} ${Math.abs(b2).toFixed(2)}</b> °C (least squares, ${n} pts)`;
  }};
$('bCalClr').onclick=()=>{calPts.length=0;$('calBody').innerHTML='';
  $('calFit').textContent='Fit: record ≥ 2 points → T = a·V + b'};

/* Pressure */
$('sPr').oninput=e=>{const v=+e.target.value;hDir=v>S.prCmd?1:-1;S.prCmd=v;
  $('oPr').textContent=v.toFixed(1)+' bar';S.hyst=false;$('bHyst').classList.remove('on')};
$('bHyst').onclick=()=>{S.hyst=true;S.hystT=0;S.hRise=[];S.hFall=[];
  S.prCmd=0;S.prMeas=0;hDir=1;$('hystBody').innerHTML='';
  $('pHyst').innerHTML='—<span class="unit"> bar</span>';
  $('hystRes').innerHTML='Sweeping 0&rarr;10&rarr;0 bar — logging every <b>0.5 bar</b> rising and falling&hellip;';
  $('bHyst').classList.add('on');
  $('bHyst').textContent='Sweeping...';};
$('bPStep').onclick=()=>{
  $('bPStep').classList.add('on');
  $('bPStep').textContent='Running...';
  S.prCmd=5;S.prMeas=5;$('sPr').value=5;fillR($('sPr'));
  $('oPr').textContent='5.0 bar';hDir=1;S.pStepArm=false;S.pTau=null;
  $('pTau').innerHTML='—<span class="unit"> ms</span>';
  setTimeout(()=>{S.prCmd=7;$('sPr').value=7;fillR($('sPr'));$('oPr').textContent='7.0 bar';
    S.pStepArm=true;S.pStepT0=performance.now();S.pSettle=null;S.pOver=5},600)};
$('bOpen').onclick=()=>{S.fault=1;$('bOpen').classList.add('on');$('bShort').classList.remove('on')};
$('bShort').onclick=()=>{S.fault=2;$('bShort').classList.add('on');$('bOpen').classList.remove('on')};
$('bClear').onclick=()=>{S.fault=0;$('bOpen').classList.remove('on');$('bShort').classList.remove('on')};

/* Vibration */
document.querySelectorAll('#segCond button').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('#segCond button').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');S.cond=+b.dataset.c;S.imp=0;S.impT=0});
document.querySelectorAll('#segFreq button').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('#segFreq button').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');S.vf=+b.dataset.f;
  $('sVf').value=S.vf; fillR($('sVf'));
  $('oVf').textContent=S.vf?S.vf+' Hz':'off';
  $('vF').innerHTML=S.vf+'<span class="unit"> Hz</span>'});
$('sVf').oninput=e=>{
  document.querySelectorAll('#segFreq button').forEach(x=>x.classList.remove('active'));
  S.vf=+e.target.value;$('oVf').textContent=S.vf?S.vf+' Hz':'off';
  $('vF').innerHTML=S.vf+'<span class="unit"> Hz</span>'};
$('bZeroCal').onclick=()=>{
  $('bZeroCal').classList.add('on');
  $('bZeroCal').textContent='Calibrating...';
  setTimeout(()=>{
    const avgG=S.vBuf.length?S.vBuf.reduce((a,b)=>a+b)/S.vBuf.length:0;
    S.vOff = (S.vOff||0) + (avgG * 0.1);
    $('vOff').innerHTML=(S.vOff>=0?'+':'')+S.vOff.toFixed(3)+'<span class="unit"> V</span>';
    $('bZeroCal').classList.remove('on');
    $('bZeroCal').innerHTML='&#8960; Calibrate 0g (Horizontal)';
  }, 1000);
};
$('bPkReset').onclick=()=>{
  S.vPk=0;
  $('bPkReset').textContent='Reset!';
  setTimeout(()=>$('bPkReset').textContent='Reset peak', 500);
};
$('bFrRec').onclick=()=>{
  if(!S.vf)return;
  $('bFrRec').classList.add('on');
  $('bFrRec').textContent='Recorded!';
  setTimeout(()=>{
    $('bFrRec').classList.remove('on');
    $('bFrRec').innerHTML='&#65291; Record point @ freq';
  }, 500);
  const a=S.injA*(1+(Math.random()-.5)*.04); // small measurement scatter
  const i=S.frPts.findIndex(p=>p.f===S.vf);
  i>=0?S.frPts[i].a=a:S.frPts.push({f:S.vf,a});
  S.frPts.sort((p,q)=>p.f-q.f)};
$('bFrClr').onclick=()=>{
  S.frPts.length=0;
  $('bFrClr').textContent='Cleared!';
  setTimeout(()=>$('bFrClr').textContent='Clear', 500);
};

/* ================= main loop ================= */
let last=performance.now(),uiT=0,shakeT=0;
function resize(){const w=canvas.clientWidth,h=canvas.clientHeight;
  if(canvas.width!==w*renderer.getPixelRatio()){
    renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()}}
function animate(now){
  requestAnimationFrame(animate);
  const dt=Math.min(.05,(now-last)/1000);last=now;
  resize();
  stepRTD(dt);stepPress(dt);stepVib(dt);

  /* --- drive 3D --- */
  // coolant colour: blue→red with temperature
  const t01=clamp(S.tProbe/100,0,1);
  M.coolant.color.setRGB(.16+t01*.75,.5-t01*.28,.77-t01*.6);
  heatGlow.intensity=t01*1.1;
  // removed rtdLed
  // pressure gauge needle: 0 bar at -135°, 10 bar at +135°
  gNeedle.rotation.z=(0.75-(S.prMeas/10)*1.5)*Math.PI - Math.PI/2 + Math.PI*0.0;
  gNeedle.rotation.z=(0.75*Math.PI)-(S.prMeas/10)*1.5*Math.PI;
  // High-frequency, realistic mechanical vibration (multi-axis, high RPM)
  const vibZ = Math.sin(now * 0.15) + Math.cos(now * 0.37) * 0.5 + (Math.random() - 0.5) * 0.3;
  const vibX = Math.sin(now * 0.11) + (Math.random() - 0.5) * 0.2;
  dGroup.rotation.z = vibZ * 0.0008 * S.prMeas;
  dGroup.rotation.x = vibX * 0.0004 * S.prMeas;
  xdcrLed.material=S.fault?M.ledRed:M.ledOn;
  // vibration station shake (decoupled from sensor measurement bias)
  shakeT+=dt;
  let physAmp = 0.004; // base engine mechanical vibration
  if(S.cond === 1) physAmp += 0.002;
  if(S.cond === 2) physAmp += 0.025; // heavy spall shaking
  if(S.vf > 0) physAmp += (S.injA / 2) * 0.015; // physical sine injection
  vibBody.position.y=Math.sin(shakeT*55)*physAmp;
  vibBody.position.x=Math.sin(shakeT*41)*physAmp*.6;
  flySpokes.rotation.x+=dt*9;flyw.rotation.x+=dt*9;
  accLed.material=(S.vRms>5||S.vPk>8)?M.ledRed:M.ledOn;
  const alarmOn=(S.vPk>8)&&(Math.floor(now/280)%2===0);
  beacon.material.emissive.setHex(alarmOn?0xff2222:0x000000);
  beaconLight.intensity=alarmOn?2.4:0;
  ardLed.material=(Math.floor(now/300)%2)?M.ledOn:M.ledOff;

  if(camLocked){
    const f=FOCUS[S.mode];
    orbit.target.lerp(f.t,dt*2.2);
    orbit.r+=(f.r-orbit.r)*dt*1.2*(drag?0:1);
  }
  applyCam();
  renderer.render(scene,camera);

  /* --- UI --- */
  uiT+=dt;
  if(uiT>.066){uiT=0;
    // RTD
    $('rAdc').textContent=adcRaw;
    $('rVolt').innerHTML=(adcRaw/1023*5).toFixed(2)+'<span class="unit"> V</span>';
    $('rRawT').innerHTML=tCalc.toFixed(1)+'<span class="unit"> °C</span>';
    $('rFilT').innerHTML=tFil.toFixed(1)+'<span class="unit"> °C</span>';
    $('rRes').innerHTML=(100*(1+.00385*S.tProbe)).toFixed(1)+'<span class="unit"> Ω</span>';
    const npp=noiseWin.length?Math.max(...noiseWin)-Math.min(...noiseWin):0;
    $('rNoise').innerHTML=npp.toFixed(2)+'<span class="unit"> °C</span>';
    const nppF=noiseWinF.length?Math.max(...noiseWinF)-Math.min(...noiseWinF):0;
    $('rNoiseF').innerHTML=nppF.toFixed(2)+'<span class="unit"> °C</span>';
    $('rSnr').innerHTML=(nppF>0.001?(20*Math.log10(npp/nppF)).toFixed(1):'—')+'<span class="unit"> dB</span>';
    // Pressure
    let mA=4+S.prMeas/10*16;
    if(S.fault===1)mA=2.1+Math.random()*.4;
    if(S.fault===2)mA=22.5+Math.random()*.5;
    const bv=mA/1000*250, padc=clamp(Math.round(bv/5*1023),0,1023);
    $('pmA').innerHTML=mA.toFixed(2)+'<span class="unit"> mA</span>';
    $('pV').innerHTML=bv.toFixed(2)+'<span class="unit"> V</span>';
    $('pAdc').textContent=padc;
    const pa=$('pAlarm');
    if(mA<3.5){pa.textContent='⚠ ERROR: OPEN CIRCUIT — SENSOR/WIRING FAULT';pa.className='alarmbar alarm';
      $('pBar').innerHTML='−1.0<span class="unit"> bar</span>';$('pBar').className='val red'}
    else if(mA>21){pa.textContent='⚠ ERROR: SHORT CIRCUIT — LOOP OVERCURRENT';pa.className='alarmbar alarm';
      $('pBar').innerHTML='−1.0<span class="unit"> bar</span>';$('pBar').className='val red'}
    else{pa.textContent='LOOP OK — 4–20 mA HEALTHY';pa.className='alarmbar';
      $('pBar').innerHTML=S.prMeas.toFixed(2)+'<span class="unit"> bar</span>';$('pBar').className='val'}
    // Vibration
    $('vG').innerHTML=S.vG.toFixed(2)+'<span class="unit"> g</span>';
    $('vRms').innerHTML=S.vRms.toFixed(2)+'<span class="unit"> g</span>';
    $('vRms').className='val '+(S.vRms>5?'red':'');
    $('vPk').innerHTML=S.vPk.toFixed(2)+'<span class="unit"> g</span>';
    $('vV').innerHTML=(2.5 + (S.vG + (S.vOff||0)/0.1)*0.1).toFixed(3)+'<span class="unit"> V</span>';
    const va=$('vAlarm');
    if(S.vOff===null){va.textContent='⚠ SENSOR UNCALIBRATED — PERFORM 0g STATIC CALIBRATION';va.className='alarmbar warn'}
    else if(S.vPk>8){va.textContent='🔴 ALARM: BEARING SPALL DETECTED — |peak| > 8 g';va.className='alarmbar alarm'}
    else if(S.vRms>5){va.textContent='⚠ WARNING: HIGH VIBRATION LEVEL — RMS > 5 g';va.className='alarmbar warn'}
    else{va.textContent='BEARING NORMAL — RMS < 2 g';va.className='alarmbar'}
    // lamp
    const lamp=$('sysLamp');
    const anyAlarm=(S.mode==='press'&&S.fault)||(S.mode==='vib'&&(S.vPk>8||S.vRms>5));
    lamp.className='lamp-dot '+(anyAlarm?'alarm':'on');
    $('lampTxt').textContent=anyAlarm?'FAULT ACTIVE — CHECK ALARM PANEL':'LOOP HEALTHY · ADC 10-BIT';

    if(S.mode==='rtd')drawRtd();
    if(S.mode==='press')drawPr();
    if(S.mode==='vib'){drawVib();drawFr()}
  }
}
applyCam();
requestAnimationFrame(animate);

// System init logic
(function(){var d=document,h=d.head,m1=d.createElement('meta'),m2=d.createElement('meta'),m3=d.createElement('meta');m1.name='author';m1.content='Alan Joseph Monichan, Alisha Joy A';m2.name='description';m2.content='Virtual Marine Engineering Lab Simulation. Developed for educational marine instrumentation training.';m3.name='keywords';m3.content='marine engineering, virtual lab, simulation, maritime training';h.appendChild(m1);h.appendChild(m2);h.appendChild(m3);})();
