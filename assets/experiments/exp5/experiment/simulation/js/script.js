/* ================= state ================= */
const S = {
  mode:'synchro',
  tx:0, rx:0, rxVel:0, load:0, sweeping:false, sweepT:0,
  rpm:0, dir:1, encAngle:0, pulses:0, revs:0, lastZ:0,
  sp:90, kp:.5, ki:.01, kd:.1, run:false, pv:0, pvVel:0,
  iSum:0, prevErr:0, pwm:0, dist:0, tracking:false, trackT:0,
};
const pidTrace=[];
let task2Samples=[]; // frozen snapshot of the last completed Task 2 run (time-based, not a live rolling buffer)
const $=id=>document.getElementById(id);

/* ================= three.js scene ================= */
const canvas=$('canvas3d');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const scene=new THREE.Scene();
scene.background=new THREE.Color(0x06141f);
scene.fog=new THREE.Fog(0x06141f, 30, 80);
const camera=new THREE.PerspectiveCamera(46,2,.1,100);

/* orbit (manual, r128-safe) */
const orbit={theta:.62,phi:1.12,r:16,target:new THREE.Vector3(1.5,1.5,0)};
function applyCam(){
  const t=orbit.target;
  camera.position.set(
    t.x+orbit.r*Math.sin(orbit.phi)*Math.sin(orbit.theta),
    t.y+orbit.r*Math.cos(orbit.phi),
    t.z+orbit.r*Math.sin(orbit.phi)*Math.cos(orbit.theta));
  camera.lookAt(t);
}
let drag=false,isPan=false,px=0,py=0,pinch=0,panX=0,panY=0,camLocked=false;
canvas.addEventListener('pointerdown',e=>{drag=true;camLocked=false;isPan=(e.button===2||e.shiftKey||e.ctrlKey);px=e.clientX;py=e.clientY;canvas.setPointerCapture(e.pointerId)});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('pointermove',e=>{
  if(!drag)return;
  camLocked=false;
  if(isPan){
    const right=new THREE.Vector3(Math.cos(orbit.theta),0,-Math.sin(orbit.theta));
    orbit.target.addScaledVector(right,-(e.clientX-px)*.01);
    orbit.target.y+=(e.clientY-py)*.01;
  }else{
    orbit.theta-=(e.clientX-px)*.008;
    orbit.phi=Math.max(.15,Math.min(1.45,orbit.phi-(e.clientY-py)*.006));
  }
  px=e.clientX;py=e.clientY;
});
addEventListener('pointerup',()=>drag=false);
canvas.addEventListener('wheel',e=>{e.preventDefault();camLocked=false;
  orbit.r=Math.max(1,Math.min(45,orbit.r+e.deltaY*.01))},{passive:false});
canvas.addEventListener('touchstart',e=>{if(e.touches.length===2){drag=false;camLocked=false;
  pinch=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
  panX=(e.touches[0].clientX+e.touches[1].clientX)/2;
  panY=(e.touches[0].clientY+e.touches[1].clientY)/2;
}},{passive:true});
canvas.addEventListener('touchmove',e=>{if(e.touches.length===2){e.preventDefault();
  const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
  orbit.r=Math.max(1,Math.min(45,orbit.r-(d-pinch)*.02));pinch=d;
  const nx=(e.touches[0].clientX+e.touches[1].clientX)/2;
  const ny=(e.touches[0].clientY+e.touches[1].clientY)/2;
  const right=new THREE.Vector3(Math.cos(orbit.theta),0,-Math.sin(orbit.theta));
  orbit.target.addScaledVector(right,-(nx-panX)*.01);
  orbit.target.y+=(ny-panY)*.01;
  panX=nx;panY=ny;
}},{passive:false});

/* lights */
scene.add(new THREE.AmbientLight(0x33404f, 1.2));
const key=new THREE.DirectionalLight(0xfff0dd, 1.2);
key.position.set(6, 10, 5); key.castShadow=true;
key.shadow.mapSize.set(2048,2048);
key.shadow.camera.left=-12;key.shadow.camera.right=12;
key.shadow.camera.top=10;key.shadow.camera.bottom=-10;
scene.add(key);
const fill=new THREE.PointLight(0x5b8cff, 0.7, 30);fill.position.set(-7,6,-4);scene.add(fill);
const fill2=new THREE.PointLight(0x8cbaff, 0.6, 30);fill2.position.set(7,5,4);scene.add(fill2);
const lampSpot=new THREE.SpotLight(0xffe2b0, 1.3, 20, 0.8, 0.5);
lampSpot.position.set(2, 8, 2); lampSpot.target.position.set(2, 1.5, 0);
scene.add(lampSpot, lampSpot.target);

/* materials */
const M={
  steel:new THREE.MeshStandardMaterial({color:0x8b98a6,metalness:.75,roughness:.35}),
  darkMetal:new THREE.MeshStandardMaterial({color:0x2b333d,metalness:.6,roughness:.5}),
  navy:new THREE.MeshStandardMaterial({color:0x1e3a30,metalness:.4,roughness:.6}),
  navy2:new THREE.MeshStandardMaterial({color:0x27424e,metalness:.4,roughness:.6}),
  wood:new THREE.MeshStandardMaterial({color:0x6b4a2f,roughness:.85}),
  woodTop:new THREE.MeshStandardMaterial({color:0x7d5a3a,roughness:.8}),
  dial:new THREE.MeshStandardMaterial({color:0xe9e4d4,roughness:.9}),
  needle:new THREE.MeshStandardMaterial({color:0xcc2222,roughness:.4}),
  needleC:new THREE.MeshStandardMaterial({color:0x1177cc,roughness:.4}),
  brass:new THREE.MeshStandardMaterial({color:0xc9a24b,metalness:.85,roughness:.3}),
  black:new THREE.MeshStandardMaterial({color:0x14181d,roughness:.6}),
  discM:new THREE.MeshStandardMaterial({color:0x11151a,metalness:.3,roughness:.4}),
  slot:new THREE.MeshBasicMaterial({color:0xdfe8f0}),
  ledOn:new THREE.MeshBasicMaterial({color:0x5df08d}),
  ledOff:new THREE.MeshBasicMaterial({color:0x1d2a22}),
  wireR:new THREE.MeshStandardMaterial({color:0xb03030,roughness:.6}),
  wireY:new THREE.MeshStandardMaterial({color:0xc9a227,roughness:.6}),
  wireB:new THREE.MeshStandardMaterial({color:0x2f5fb0,roughness:.6}),
  floor:new THREE.MeshStandardMaterial({color:0x10161d,roughness:.95}),
  prop:new THREE.MeshStandardMaterial({color:0xb08d3e,metalness:.8,roughness:.35}),
};
function mesh(g,m,x=0,y=0,z=0,shadow=true){const o=new THREE.Mesh(g,m);
  o.position.set(x,y,z);o.castShadow=shadow;o.receiveShadow=true;return o}

/* floor + bench */
scene.add(mesh(new THREE.PlaneGeometry(60,60),M.floor,0,0,0,false).rotateX(-Math.PI/2));
const bench=new THREE.Group();
bench.add(mesh(new THREE.BoxGeometry(13,.28,5.2),M.woodTop,0,1.1,0));
[[-6,-2.2],[6,-2.2],[-6,2.2],[6,2.2]].forEach(([x,z])=>
  bench.add(mesh(new THREE.BoxGeometry(.28,1.1,.28),M.darkMetal,x,.55,z)));
bench.add(mesh(new THREE.BoxGeometry(12.4,.14,4.6),M.wood,0,.5,0));
scene.add(bench);
/* back rail with panel */
const rail=mesh(new THREE.BoxGeometry(13,2.2,.18),M.darkMetal,0,2.4,-2.5);
scene.add(rail);
for(let i=0;i<5;i++){
  const led=mesh(new THREE.SphereGeometry(.05,10,10),i<3?M.ledOn:M.ledOff,-5.6+i*.3,3.1,-2.38,false);
  scene.add(led);
}

/* ---------- synchro station (left) ---------- */
function synchroUnit(mat){
  const g=new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(.62,.62,1.2,32),mat,0,0,0).rotateX(Math.PI/2));
  g.add(mesh(new THREE.CylinderGeometry(.66,.66,.1,32),M.darkMetal,0,0,.62).rotateX(Math.PI/2));
  // cooling ribs
  for(let i=0;i<5;i++)
    g.add(mesh(new THREE.TorusGeometry(.63,.02,8,32),M.darkMetal,0,0,-.4+i*.2));
  // dial face
  g.add(mesh(new THREE.CylinderGeometry(.5,.5,.05,32),M.dial,0,0,.68).rotateX(Math.PI/2));
  // tick marks
  for(let i=0;i<12;i++){
    const a=i*Math.PI/6;
    g.add(mesh(new THREE.BoxGeometry(.02,.09,.02),M.black,
      Math.sin(a)*.42,Math.cos(a)*.42,.72,false).rotateZ(-a));
  }
  // terminal box
  g.add(mesh(new THREE.BoxGeometry(.5,.3,.5),M.darkMetal,0,.72,-.2));
  ['brass','brass','brass'].forEach((_,i)=>
    g.add(mesh(new THREE.CylinderGeometry(.04,.04,.14,10),M.brass,-.14+i*.14,.9,-.2)));
  // mount base
  g.add(mesh(new THREE.BoxGeometry(1.5,.16,1),M.steel,0,-.75,0));
  return g;
}
function needleMesh(mat){
  const n=new THREE.Group();
  n.add(mesh(new THREE.BoxGeometry(.045,.42,.03),mat,0,.19,0,false));
  n.add(mesh(new THREE.CylinderGeometry(.06,.06,.06,16),M.brass,0,0,0).rotateX(Math.PI/2));
  return n;
}
const txUnit=synchroUnit(M.navy); txUnit.position.set(-4.6,2.05,0.4); scene.add(txUnit);
const rxUnit=synchroUnit(M.navy2);rxUnit.position.set(-1.6,2.05,0.4); scene.add(rxUnit);
const txNeedle=needleMesh(M.needle); txNeedle.position.set(0,0,.74); txUnit.add(txNeedle);
const rxNeedle=needleMesh(M.needleC);rxNeedle.position.set(0,0,.74); rxUnit.add(rxNeedle);
/* TX input handwheel + shaft toward propeller */
const txWheel=new THREE.Group();
txWheel.add(mesh(new THREE.TorusGeometry(.4,.05,10,28),M.brass));
txWheel.add(mesh(new THREE.CylinderGeometry(.05,.05,.8,10),M.steel).rotateZ(Math.PI/2));
txWheel.add(mesh(new THREE.CylinderGeometry(.05,.05,.8,10),M.steel));
txWheel.position.set(-4.6,2.05,-1.1); scene.add(txWheel);
scene.add(mesh(new THREE.CylinderGeometry(.05,.05,.8,12),M.steel,-4.6,2.05,-.6).rotateX(Math.PI/2));
/* S1 S2 S3 stator wires: catmull tubes, one per brass terminal on each unit */
/* S1 S2 S3 stator wires: catmull tubes, one per brass terminal on each unit */
function wire(mat,i){
  const dx=-.14+i*.14;
  const pts=[
    new THREE.Vector3(-4.6+dx, 2.90, 0.2),          // P0: TX brass terminal deep inside
    new THREE.Vector3(-4.6+dx, 3.10, 0.2),          // P1: Straight up above terminal
    new THREE.Vector3(-4.6+dx, 3.30, -0.1),         // P2: Arch up and backward
    new THREE.Vector3(-4.6+dx, 2.00, -0.4),         // P3: Drop down behind TX cylinder
    new THREE.Vector3(-3.8, 1.26, -0.4 - i*0.03),   // P4: Touch desk
    new THREE.Vector3(-3.1, 1.26, -0.5 - i*0.03),   // P5: Center of desk, spaced out
    new THREE.Vector3(-2.4, 1.26, -0.4 - i*0.03),   // P6: Touch desk
    new THREE.Vector3(-1.6+dx, 2.00, -0.4),         // P7: Drop down behind RX cylinder
    new THREE.Vector3(-1.6+dx, 3.30, -0.1),         // P8: Arch up and backward
    new THREE.Vector3(-1.6+dx, 3.10, 0.2),          // P9: Straight up above terminal
    new THREE.Vector3(-1.6+dx, 2.90, 0.2)           // P10: RX brass terminal deep inside
  ];
  const c=new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  return mesh(new THREE.TubeGeometry(c,64,.022,8),mat,0,0,0,false);
}
scene.add(wire(M.wireR,0),wire(M.wireY,1),wire(M.wireB,2));
/* labels: little plates */
function plate(w,x,z,mat){const p=mesh(new THREE.BoxGeometry(w,.22,.04),mat,x,1.35,z,false);scene.add(p)}
plate(1.2,-4.6,2.1,M.brass); plate(1.2,-1.6,2.1,M.steel);

/* ---------- encoder + motor station (right) ---------- */
const encSt=new THREE.Group(); encSt.position.set(2.2,2.0,0.3); scene.add(encSt);
/* motor */
encSt.add(mesh(new THREE.CylinderGeometry(.55,.55,1.4,28),M.darkMetal,0,0,0).rotateZ(Math.PI/2));
encSt.add(mesh(new THREE.BoxGeometry(1.5,.2,1),M.steel,0,-.62,0));
encSt.add(mesh(new THREE.BoxGeometry(.6,.35,.6),M.black,0,.6,0));
/* shaft */
const shaft=new THREE.Group(); shaft.position.set(0,0,0); encSt.add(shaft);
shaft.add(mesh(new THREE.CylinderGeometry(.07,.07,4.6,14),M.steel,1.6,0,0).rotateZ(Math.PI/2));
/* encoder code disc with slots */
const disc=new THREE.Group(); disc.position.set(1.1,0,0); shaft.add(disc);
disc.add(mesh(new THREE.CylinderGeometry(.55,.55,.04,48),M.discM).rotateZ(Math.PI/2));
for(let i=0;i<48;i++){
  const a=i*Math.PI*2/48;
  const s=mesh(new THREE.BoxGeometry(.012,.02,.09),M.slot,
    0, Math.cos(a)*.46, Math.sin(a)*.46, false);
  s.rotation.x=-a; disc.add(s);
}
const idxMark=mesh(new THREE.BoxGeometry(.014,.03,.14),new THREE.MeshBasicMaterial({color:0xffb454}),0,.33,0,false);
disc.add(idxMark);
/* optical read head fork */
const fork=new THREE.Group(); fork.position.set(1.1,.62,0); encSt.add(fork);
fork.add(mesh(new THREE.BoxGeometry(.16,.3,.5),M.black,0,0,0));
fork.add(mesh(new THREE.BoxGeometry(.06,.3,.1),M.black,-.09,-.18,.18));
fork.add(mesh(new THREE.BoxGeometry(.06,.3,.1),M.black,.09,-.18,.18));
const encLed=mesh(new THREE.SphereGeometry(.04,8,8),M.ledOn,0,.18,.22,false);fork.add(encLed);
encSt.add(mesh(new THREE.BoxGeometry(.2,.7,.2),M.steel,1.1,.95,-.35));
/* pillow-block bearing */
const brg=new THREE.Group(); brg.position.set(2.6,0,0); encSt.add(brg);
brg.add(mesh(new THREE.BoxGeometry(.3,.5,.6),M.navy2,0,-.35,0));
brg.add(mesh(new THREE.TorusGeometry(.16,.07,10,20),M.steel).rotateY(Math.PI/2));
/* propeller */
const prop=new THREE.Group(); prop.position.set(3.9,0,0); shaft.add(prop);
prop.add(mesh(new THREE.SphereGeometry(.14,16,16),M.prop));
for(let i=0;i<3;i++){
  const b=mesh(new THREE.BoxGeometry(.06,0.6,.26),M.prop,0,0,0);
  b.geometry.translate(0,0.35,0);
  b.rotation.set(i*Math.PI*2/3, 0.5, 0, 'YXZ');
  prop.add(b);
}
/* arduino board */
const ard=new THREE.Group(); ard.position.set(4.9,1.27,1.5); scene.add(ard);
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
/* signal wires encoder→arduino: spread across the fork housing and the header pins */
[[M.wireY,0],[M.wireB,1],[M.wireR,2]].forEach(([mat,i])=>{
  const dx = (i-1)*0.02; // tight bundle inside fork
  const ex = 5.35, ey = 1.40, ez = 1.625 + i*0.05;
  const c = new THREE.CatmullRomCurve3([
    new THREE.Vector3(3.35, 2.62, 0.15 + dx),        // P0: Inside right face of fork
    new THREE.Vector3(3.41, 2.58, 0.15 + dx),        // P1: Exit rightwards and immediately droop!
    new THREE.Vector3(3.45, 1.95, 0.15 + dx),        // P2: Drop straight down, clearing the shaft!
    new THREE.Vector3(3.55, 1.35, 0.25 + dx),        // P3: Arrest the downward momentum
    new THREE.Vector3(3.70, 1.28, 0.45 + dx),        // P4: Touch desk (raised slightly to prevent dip)
    new THREE.Vector3(4.10, 1.28, 1.00 + dx),        // P5: Snake across desk
    new THREE.Vector3(4.50, 1.45, 1.40 + i*0.02),    // P6: Arch over Arduino board
    new THREE.Vector3(5.00, 1.50, ez),               // P7: Float over ATmega
    new THREE.Vector3(ex, ey + 0.25, ez + 0.001),    // P8: Vertical approach (offset slightly to prevent normal flip)
    new THREE.Vector3(ex, ey, ez)                    // P9: Pin insert
  ], false, 'centripetal');
  scene.add(mesh(new THREE.TubeGeometry(c, 64, .018, 8), mat, 0, 0, 0, false));
});

/* focus targets per mode */
const FOCUS={
  synchro:{t:new THREE.Vector3(-3.1,2.1,.3),r:8.5},
  encoder:{t:new THREE.Vector3(2.6,2,.3),r:9},
  pid:{t:new THREE.Vector3(2.6,2,.3),r:9},
};

/* ================= simulation ================= */
function angDiff(a,b){let d=(a-b)%360;if(d>180)d-=360;if(d<-180)d+=360;return d}

function stepSynchro(dt){
  if(S.sweeping){S.sweepT+=dt;S.tx=Math.min(360,S.sweepT*36);
    $('sAngle').value=S.tx;fill$('sAngle');$('oAngle').textContent=S.tx.toFixed(0)+'°';
    if(S.tx>=360){S.sweeping=false;$('bSweep').classList.remove('on')}}
  const err=angDiff(S.tx,S.rx);
  const load=S.load/100;
  const K=300*(1-load*.55), C=10*(1-load*.72);          // load → less damping, weaker torque
  S.rxVel+=(K*err-C*S.rxVel)*dt;
  // coulomb friction from load causes dead-band / residual error
  const fr=load*14;
  if(Math.abs(S.rxVel)<fr*dt&&Math.abs(err)<load*3.2)S.rxVel=0;
  else S.rxVel-=Math.sign(S.rxVel)*fr*dt;
  S.rx=(S.rx+S.rxVel*dt+360)%360;
}

function stepEncoder(dt){
  const dps=S.rpm/60*360*S.dir;
  const prev=S.encAngle;
  S.encAngle+=dps*dt;
  S.pulses+=Math.round((S.encAngle-prev)/360*1024);
  if(Math.floor(Math.abs(S.encAngle)/360)>Math.floor(Math.abs(prev)/360))S.revs++;
}

function stepPID(dt){
  if(S.tracking){S.trackT+=dt;S.sp=Math.min(360,S.trackT*12);
    $('sSp').value=S.sp;fill$('sSp');$('oSp').textContent=S.sp.toFixed(0)+'°'}
  if(!S.run){pidTrace.push([S.sp,S.pv]);if(pidTrace.length>260)pidTrace.shift();return}
  const err=S.sp-S.pv;
  S.iSum+=err*dt*20; S.iSum=Math.max(-1000,Math.min(1000,S.iSum));
  const d=(err-S.prevErr)/Math.max(dt,1e-3); S.prevErr=err;
  let u=S.kp*err*2.8 + S.ki*S.iSum + S.kd*d*.09;
  S.pwm=Math.max(-255,Math.min(255,Math.round(u*2.5)));
  // motor+inertia plant
  const torque=S.pwm/255*950 - S.dist;
  S.pvVel+=(torque - 6.5*S.pvVel)*dt;
  S.pv+=S.pvVel*dt;
  S.dist*=Math.pow(.5,dt*.4); // disturbance persists then decays slowly
  pidTrace.push([S.sp,S.pv]); if(pidTrace.length>260)pidTrace.shift();
}

/* ================= scopes ================= */
function fitScope(c){const r=c.getBoundingClientRect();
  if(c.width!==r.width*2){c.width=r.width*2;c.height=220}}
function grid(x){x.strokeStyle='rgba(11,31,42,.15)';x.lineWidth=1;x.beginPath();
  for(let i=1;i<6;i++){x.moveTo(0,i*220/6);x.lineTo(x.canvas.width,i*220/6)}
  for(let i=1;i<10;i++){x.moveTo(i*x.canvas.width/10,0);x.lineTo(i*x.canvas.width/10,220)}
  x.stroke()}
function trace(x,data,idx,color){
  x.strokeStyle=color;x.lineWidth=2;x.beginPath();
  const n=data.length,W=x.canvas.width;
  for(let i=0;i<n;i++){
    const y=220-(data[i][idx]/400)*200-10;
    i?x.lineTo(i/(n-1)*W,y):x.moveTo(0,y)}
  x.stroke()}
function drawSyn(){
  const c=$('scopeSyn');fitScope(c);const x=c.getContext('2d');
  x.clearRect(0,0,c.width,220);grid(x);
  if(task2Samples.length>1){
    const W=c.width,T=task2Samples[task2Samples.length-1].t||1;
    function traceT(pick,color){
      x.strokeStyle=color;x.lineWidth=2;x.beginPath();
      task2Samples.forEach((s,i)=>{
        const px=(s.t/T)*W,y=220-(pick(s)/400)*200-10;
        i?x.lineTo(px,y):x.moveTo(px,y);
      });
      x.stroke();
    }
    traceT(s=>s.tx,'#b4441f');traceT(s=>s.rx,'#1f7a4d');
  }else{
    x.fillStyle='rgba(11,31,42,.5)';x.font='14px Georgia, serif';
    x.fillText('Run Task 2 to record a trace',16,30);
  }
}
function drawPid(){const c=$('scopePid');fitScope(c);const x=c.getContext('2d');
  x.clearRect(0,0,c.width,220);grid(x);
  if(pidTrace.length>1){trace(x,pidTrace,0,'#b4441f');trace(x,pidTrace,1,'#1f7a4d')}}
function drawEnc(){const c=$('scopeEnc');fitScope(c);const x=c.getContext('2d');
  x.clearRect(0,0,c.width,220);grid(x);
  const W=c.width, cyc=6, ph=(S.encAngle/360*1024)%1; // pulse phase
  function sq(y0,color,shift,duty){
    x.strokeStyle=color;x.lineWidth=2.5;x.beginPath();
    for(let px=0;px<=W;px++){
      const t=(px/W*cyc - ph*S.dir + shift)%1;
      const hi=((t%1)+1)%1<duty;
      const y=y0+(hi?-24:24);
      px?x.lineTo(px,y):x.moveTo(px,y);
    } x.stroke();
  }
  if(S.rpm>0){sq(48,'#1f7a4d',0,.5);sq(110,'#1d7a94',.25,.5);
    // index: one narrow pulse per rev — show as phase of rev
    const revPh=((S.encAngle/360)%1+1)%1;
    x.strokeStyle='#b4441f';x.lineWidth=2.5;x.beginPath();
    for(let px=0;px<=W;px++){
      const t=(px/W + revPh)%1;
      const y=172+((t<.04)?-24:24);
      px?x.lineTo(px,y):x.moveTo(px,y);
    } x.stroke();
  } else {
    x.strokeStyle='rgba(11,31,42,.3)';x.setLineDash([6,6]);
    [48,110,172].forEach(y=>{x.beginPath();x.moveTo(0,y+24);x.lineTo(W,y+24);x.stroke()});
    x.setLineDash([]);
    x.fillStyle='rgba(11,31,42,.6)';x.font='22px monospace';
    x.fillText('SHAFT STOPPED — set RPM',20,30);
  }
}

/* ================= UI wiring ================= */
function fill$(el){if(typeof el==='string')el=$(el);
  el.style.setProperty('--fill',((el.value-el.min)/(el.max-el.min)*100)+'%')}
document.querySelectorAll('input[type=range]').forEach(r=>{fill$(r);
  r.addEventListener('input',()=>fill$(r))});

document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>{
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.pane').forEach(x=>x.classList.remove('active'));
  t.classList.add('active');$('pane-'+t.dataset.pane).classList.add('active');
  S.mode=t.dataset.pane;
  camLocked=true;
  $('hudSub').textContent=({
    synchro:'Synchro shaft-angle transmission — 115 V · 50 Hz',
    encoder:'Incremental optical encoder — 1024 PPR quadrature',
    pid:'Closed-loop PID position control with encoder feedback'})[S.mode];
  $('lampTxt').textContent=({synchro:'EXCITATION 115V 50Hz',
    encoder:'OPTICAL PICKUP ACTIVE',pid:'SERVO LOOP '+(S.run?'RUNNING':'IDLE')})[S.mode];
});

$('sAngle').oninput=e=>{if(taskBusy)return;S.tx=+e.target.value;$('oAngle').textContent=S.tx+'°';S.sweeping=false;$('bSweep').classList.remove('on')};
$('bStep30').onclick=()=>{if(taskBusy)return;S.tx=(S.tx+30)%360;$('sAngle').value=S.tx;fill$('sAngle');$('oAngle').textContent=S.tx+'°'};
$('bSweep').onclick=()=>{if(taskBusy)return;S.sweeping=!S.sweeping;S.sweepT=0;if(S.sweeping){S.tx=0}
  $('bSweep').classList.toggle('on',S.sweeping)};
$('sLoad').oninput=e=>{if(taskBusy)return;S.load=+e.target.value;$('oLoad').textContent=S.load+' %'};

/* ================= Virtual Experiment Procedure 8.2.1 — automated tasks ================= */
/* Shared lock: Task 1/2/3 all drive S.tx / S.load / S.sweeping asynchronously, so only
   one may run at a time — otherwise two loops fighting over the same state would corrupt
   both sets of measurements. */
let taskBusy=false;
function setTaskButtonsDisabled(disabled){
  ['bTask1','bTask1Clear','bTask2','bTask3','bSweep','bStep30','sAngle','sLoad'].forEach(id=>{
    const el=$(id); if(el) el.disabled=disabled;
  });
}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
function waitForSync(timeoutMs=3000,thresh=0.35){
  return new Promise(resolve=>{
    const t0=performance.now();
    (function poll(){
      const err=Math.abs(angDiff(S.tx,S.rx));
      const elapsed=performance.now()-t0;
      if(err<thresh)resolve({synced:true,time:elapsed/1000,err});
      else if(elapsed>=timeoutMs)resolve({synced:false,time:elapsed/1000,err});
      else setTimeout(poll,50);
    })();
  });
}
function setShaftAngle(a){
  S.tx=((a%360)+360)%360;S.sweeping=false;$('bSweep').classList.remove('on');
  $('sAngle').value=S.tx;fill$('sAngle');$('oAngle').textContent=Math.round(S.tx)+'°';
}
function setLoadPct(l){
  S.load=l;$('sLoad').value=l;fill$('sLoad');$('oLoad').textContent=l+' %';
}
function downloadCsv(csv,filename){
  const blob=new Blob([csv],{type:'text/csv'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=filename;
  document.body.appendChild(a);a.click();a.remove();
  URL.revokeObjectURL(url);
}
function tableRows(id){return[...document.querySelectorAll('#'+id+' tr')].map(tr=>[...tr.children].map(td=>td.textContent))}

/* ---- Task 1: Steady-State Angle Measurement ---- */
async function runTask1(){
  if(taskBusy)return;taskBusy=true;setTaskButtonsDisabled(true);
  $('bTask1').textContent='Running…';
  $('task1Body').innerHTML='';
  $('task1Status').textContent='Task 1 running — stepping through 12 discrete angles…';
  setLoadPct(0);
  for(let a=0;a<360;a+=30){
    setShaftAngle(a);
    await sleep(150);
    const res=await waitForSync(3000);
    await sleep(150);
    const err=Math.abs(angDiff(S.tx,S.rx));
    const row=document.createElement('tr');
    row.innerHTML=`<td>${a.toFixed(0)}</td><td>${S.rx.toFixed(2)}</td><td>${err.toFixed(2)}</td><td>${res.time.toFixed(2)}${res.synced?'':' (timeout)'}</td>`;
    $('task1Body').appendChild(row);
  }
  $('task1Status').textContent='Task 1 complete — 12/12 points recorded.';
  $('bTask1').textContent='▶ Run Task 1 (12 points)';
  taskBusy=false;setTaskButtonsDisabled(false);
}
$('bTask1').onclick=runTask1;
$('bTask1Clear').onclick=()=>{if(taskBusy)return;$('task1Body').innerHTML='';$('task1Status').textContent=''};
$('bTask1Csv').onclick=()=>{
  let csv='Shaft (deg),Receiver (deg),Error (deg),Sync time (s)\n';
  tableRows('task1Body').forEach(r=>csv+=r.join(',')+'\n');
  downloadCsv(csv,'task1_steady_state.csv');
};

/* ---- Task 2: Dynamic Tracking ---- */
async function runTask2(){
  if(taskBusy)return;taskBusy=true;setTaskButtonsDisabled(true);
  $('bTask2').textContent='Running…';
  $('task2Status').textContent='Task 2 running — sweeping 0→360° over 10 s, sampling every 100 ms…';
  $('task2Lag').textContent='—';$('task2MaxErr').textContent='—';
  setLoadPct(0);
  setShaftAngle(0);
  await sleep(400);
  const samples=[];
  S.sweeping=true;S.sweepT=0;S.tx=0;
  $('bSweep').classList.add('on');
  const t0=performance.now();
  await new Promise(resolve=>{
    const iv=setInterval(()=>{
      samples.push({t:(performance.now()-t0)/1000,tx:S.tx,rx:S.rx});
      if((!S.sweeping&&S.tx>=359.5)||(performance.now()-t0)>11000){clearInterval(iv);resolve()}
    },100);
  });
  $('bSweep').classList.remove('on');
  const mid=samples.filter(s=>s.t>1&&s.t<9);
  const errs=mid.map(s=>Math.abs(angDiff(s.tx,s.rx)));
  const maxErr=errs.length?Math.max(...errs):0;
  const avgErr=errs.length?errs.reduce((a,b)=>a+b,0)/errs.length:0;
  const lagMs=(avgErr/36)*1000;
  $('task2Lag').textContent=lagMs.toFixed(0)+' ms';
  $('task2MaxErr').textContent=maxErr.toFixed(2)+'°';
  $('task2Status').textContent=`Task 2 complete — ${samples.length} samples logged over ${samples.length?samples[samples.length-1].t.toFixed(1):0} s.`;
  task2Samples=samples;drawSyn();
  $('bTask2').textContent='▶ Run Task 2 (10 s sweep)';
  taskBusy=false;setTaskButtonsDisabled(false);
}
$('bTask2').onclick=runTask2;

/* ---- Task 3: Receiver Load Effect ---- */
async function runTask3(){
  if(taskBusy)return;taskBusy=true;setTaskButtonsDisabled(true);
  $('bTask3').textContent='Running…';
  $('task3Body').innerHTML='';
  $('task3Status').textContent='Task 3 running — sweeping load 0→100% at a fixed 180° step…';
  const loads=[0,20,40,60,80,100];
  let maxGoodLoad=null;
  for(const l of loads){
    setLoadPct(l);
    setShaftAngle(0);
    await sleep(200);
    setShaftAngle(180);
    const res=await waitForSync(4000);
    await sleep(150);
    const err=Math.abs(angDiff(S.tx,S.rx));
    const status=res.synced?(err<0.35?'SYNCED':'HUNTING'):'FAILED';
    if(status==='SYNCED')maxGoodLoad=l;
    const row=document.createElement('tr');
    row.innerHTML=`<td>${l}</td><td>${res.time.toFixed(2)}</td><td>${err.toFixed(2)}</td><td>${status}</td>`;
    $('task3Body').appendChild(row);
  }
  $('task3Status').textContent=maxGoodLoad!==null
    ?`Task 3 complete — maximum load holding sync: ${maxGoodLoad}%.`
    :'Task 3 complete — receiver could not maintain sync at any tested load.';
  setLoadPct(0);
  $('bTask3').textContent='▶ Run Task 3 (load sweep)';
  taskBusy=false;setTaskButtonsDisabled(false);
}
$('bTask3').onclick=runTask3;
$('bTask3Csv').onclick=()=>{
  let csv='Load (%),Sync time (s),Residual error (deg),Status\n';
  tableRows('task3Body').forEach(r=>csv+=r.join(',')+'\n');
  downloadCsv(csv,'task3_load_effect.csv');
};

$('sRpm').oninput=e=>{S.rpm=+e.target.value;$('oRpm').textContent=S.rpm+' rpm'};
document.querySelectorAll('[data-rpm]').forEach(b=>b.onclick=()=>{
  S.rpm=+b.dataset.rpm;$('sRpm').value=S.rpm;fill$('sRpm');$('oRpm').textContent=S.rpm+' rpm'});
$('dirF').onclick=()=>{S.dir=1;$('dirF').classList.add('active');$('dirR').classList.remove('active')};
$('dirR').onclick=()=>{S.dir=-1;$('dirR').classList.add('active');$('dirF').classList.remove('active')};
$('bZero').onclick=()=>{S.pulses=0;S.revs=0;S.encAngle=0};

$('sSp').oninput=e=>{S.sp=+e.target.value;$('oSp').textContent=S.sp+'°';S.tracking=false};
$('sKp').oninput=e=>{S.kp=+e.target.value;$('oKp').textContent=S.kp.toFixed(2)};
$('sKi').oninput=e=>{S.ki=+e.target.value;$('oKi').textContent=S.ki.toFixed(3)};
$('sKd').oninput=e=>{S.kd=+e.target.value;$('oKd').textContent=S.kd.toFixed(2)};
$('bRun').onclick=()=>{S.run=!S.run;S.iSum=0;S.prevErr=S.sp-S.pv;
  $('bRun').textContent=S.run?'⏸ Stop loop':'▶ Run loop';
  $('bRun').classList.toggle('on',S.run);
  if(S.mode==='pid')$('lampTxt').textContent='SERVO LOOP '+(S.run?'RUNNING':'IDLE')};
$('bDisturb').onclick=()=>{S.dist=520};
$('bTrack').onclick=()=>{S.tracking=true;S.trackT=0;S.sp=0;S.run=true;
  $('bRun').textContent='⏸ Stop loop';$('bRun').classList.add('on')};

/* ================= main loop ================= */
let last=performance.now(), uiT=0;
function resize(){
  const w=canvas.clientWidth,h=canvas.clientHeight;
  if(canvas.width!==w*renderer.getPixelRatio()){
    renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()}
}
function animate(now){
  requestAnimationFrame(animate);
  const dt=Math.min(.05,(now-last)/1000); last=now;
  resize();

  stepSynchro(dt); stepEncoder(dt); stepPID(dt);

  /* drive 3D */
  txNeedle.rotation.z=-S.tx*Math.PI/180;
  txWheel.rotation.z=-S.tx*Math.PI/180;
  rxNeedle.rotation.z=-S.rx*Math.PI/180;
  const shaftDeg=(S.mode==='pid')?S.pv:S.encAngle;
  shaft.rotation.x=shaftDeg*Math.PI/180;
  encLed.material=(Math.floor(shaftDeg/360*1024)%2===0)?M.ledOn:M.ledOff;
  ardLed.material=(Math.floor(now/300)%2)?M.ledOn:M.ledOff;

  /* camera glide toward mode focus */
  if(camLocked){
    const f=FOCUS[S.mode];
    orbit.target.lerp(f.t,dt*2.2);
    orbit.r+= (f.r-orbit.r)*dt*1.2*(drag?0:1);
  }
  applyCam();
  renderer.render(scene,camera);

  /* UI @ ~15 Hz */
  uiT+=dt;
  if(uiT>.066){
    uiT=0;
    const err=Math.abs(angDiff(S.tx,S.rx));
    $('roTx').innerHTML=S.tx.toFixed(1)+'<span class="unit">°</span>';
    $('roRx').innerHTML=S.rx.toFixed(1)+'<span class="unit">°</span>';
    $('roErr').innerHTML=err.toFixed(2)+'<span class="unit">°</span>';
    const syncEl=$('roSync');
    if(err<.35){syncEl.textContent='SYNCED';syncEl.className='val'}
    else if(err<3){syncEl.textContent='HUNTING';syncEl.className='val amber'}
    else{syncEl.textContent='SLEWING';syncEl.className='val red'}

    const freq=S.rpm*1024/60;
    $('roRpm').innerHTML=S.rpm+'<span class="unit"> rpm</span>';
    $('roFreq').innerHTML=(freq>=1000?(freq/1000).toFixed(2)+'<span class="unit"> kHz</span>':freq.toFixed(0)+'<span class="unit"> Hz</span>');
    $('roPulse').textContent=S.pulses.toLocaleString();
    $('roRev').textContent=S.revs;
    $('roAng').innerHTML=((S.encAngle%360+360)%360).toFixed(3)+'<span class="unit">°</span>';
    $('roDir').textContent=S.dir>0?'+1 FWD':'−1 REV';
    $('roDir').className='val '+(S.dir>0?'cyan':'red');

    $('roSp').innerHTML=S.sp.toFixed(1)+'<span class="unit">°</span>';
    $('roPv').innerHTML=S.pv.toFixed(1)+'<span class="unit">°</span>';
    $('roPerr').innerHTML=(S.sp-S.pv).toFixed(1)+'<span class="unit">°</span>';
    $('roPwm').innerHTML=S.pwm+'<span class="unit"> /255</span>';

    if(S.mode==='encoder')drawEnc();
    if(S.mode==='pid')drawPid();
  }
}
applyCam();
drawSyn();
requestAnimationFrame(animate);

// System init logic
(function(){var d=document,h=d.head,m1=d.createElement('meta'),m2=d.createElement('meta'),m3=d.createElement('meta');m1.name='author';m1.content='Alan Joseph Monichan, Alisha Joy A';m2.name='description';m2.content='Virtual Marine Engineering Lab: Synchro & Encoder Position Measurement Simulation. Developed for educational marine instrumentation training.';m3.name='keywords';m3.content='marine engineering, virtual lab, synchro system, optical encoder, PID control, simulation, maritime training';h.appendChild(m1);h.appendChild(m2);h.appendChild(m3);})();
