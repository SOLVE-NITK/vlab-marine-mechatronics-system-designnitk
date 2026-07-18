  // ==========================================================
  //  SCENE
  // ==========================================================
  const host = document.getElementById('canvas-host');
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xd0e6f0, 150, 600);

  const camera = new THREE.PerspectiveCamera(35, host.clientWidth / host.clientHeight, 0.1, 1500);
  camera.position.set(60, 20, 50);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(host.clientWidth, host.clientHeight);
  renderer.setClearColor(0xd0e6f0, 1);
  renderer.localClippingEnabled = true;
  host.appendChild(renderer.domElement);

  // Lights — Clear Day Time
  scene.add(new THREE.AmbientLight(0xddeeff, 0.65));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);                                      
  sun.position.set(40, 120, 50); // High midday sun
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xabc8d0, 0.6);
  fill.position.set(-60, 40, -40);
  scene.add(fill);
  const inner = new THREE.DirectionalLight(0xffffff, 0.45);
  inner.position.set(50, 10, 0);
  scene.add(inner);

  // Sky
  const skyGeo = new THREE.SphereGeometry(400, 16, 8);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      top: { value: new THREE.Color(0x0077be) }, // Deep blue sky
      bot: { value: new THREE.Color(0x87ceeb) }  // Sky blue horizon
    },
    vertexShader: `varying vec3 vW; void main(){ vW = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `varying vec3 vW; uniform vec3 top; uniform vec3 bot;
      void main(){ float h = normalize(vW).y * 0.5 + 0.5; gl_FragColor = vec4(mix(bot, top, h), 1.0); }`
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));

  // Ocean
  const oceanGeo = new THREE.PlaneGeometry(800, 800, 160, 160);
  oceanGeo.rotateX(-Math.PI / 2);
  const oceanClipPlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 100); 
  const oceanMat = new THREE.MeshPhysicalMaterial({
    color: 0x1e6a9a,
    emissive: 0x0a2a3a,
    emissiveIntensity: 0.2,
    roughness: 0.1,
    metalness: 0.1,
    transmission: 0.2,
    thickness: 1.0,
    ior: 1.33,
    reflectivity: 0.7,
    transparent: true,
    opacity: 0.9,
    clippingPlanes: [oceanClipPlane]
  });
  const ocean = new THREE.Mesh(oceanGeo, oceanMat);
  scene.add(ocean);
  const oceanPos = oceanGeo.attributes.position;
  const oceanBase = new Float32Array(oceanPos.array.length);
  oceanBase.set(oceanPos.array);

  const deep = new THREE.Mesh(
    new THREE.PlaneGeometry(800, 800),
    new THREE.MeshBasicMaterial({ 
      color: 0x0d3a5a,
      clippingPlanes: [oceanClipPlane]
    })
  );
  deep.rotation.x = -Math.PI / 2;
  deep.position.y = -20;
  scene.add(deep);

  // ==========================================================
  //  SHIP
  // ==========================================================
  const ship = new THREE.Group();
  scene.add(ship);

  // Scale: real ship ~200m long. We use 45 units = 200m.
  const L  = 45;    // total length
  const B  = 7.5;   // beam
  const D  = 5;     // freeboard depth (waterline-ish to main deck)
  const DB = 6;     // depth below waterline (keel to waterline)

  // Key Y levels (centered on waterline y=0)
  const Y_DECK = D;            // top of hull / main deck
  const Y_WL = 0;              // waterline
  const Y_BOOT_TOP = 0.6;      // top of black boot-topping band
  const Y_BOOT_BOT = -0.4;     // bottom of boot-topping
  const Y_KEEL = -DB;          // lowest point of keel

  // ----------------------------------------------------------
  //  HULL — built from a side profile extruded transversely
  //  with a flared bow. Modeled as THREE pieces: midbody, bow, stern.
  // ----------------------------------------------------------

  // Materials
  const MAT = {
    hullRed: new THREE.MeshStandardMaterial({
      color: 0x5d1308, roughness: 0.7, metalness: 0.2, side: THREE.DoubleSide
    }),
    hullBelow: new THREE.MeshStandardMaterial({
      color: 0x3d0a04, roughness: 0.75, metalness: 0.15, side: THREE.DoubleSide
    }),
    boot: new THREE.MeshStandardMaterial({
      color: 0x0a0a0a, roughness: 0.95, side: THREE.DoubleSide
    }),
    deck: new THREE.MeshStandardMaterial({
      color: 0x6b6b6b, roughness: 0.9, side: THREE.DoubleSide
    }),
    inner: new THREE.MeshStandardMaterial({
      color: 0x8a3020, roughness: 0.85, side: THREE.DoubleSide
    }),
    bulkhead: new THREE.MeshStandardMaterial({
      color: 0x2a1510, roughness: 0.95, side: THREE.DoubleSide
    }),
    tankShell: new THREE.MeshStandardMaterial({
      color: 0x4a545c, roughness: 0.75, metalness: 0.4, side: THREE.DoubleSide
    }),
    superWhite: new THREE.MeshStandardMaterial({
      color: 0xf0ece0, roughness: 0.6
    }),
    superRail: new THREE.MeshStandardMaterial({
      color: 0xd0ccc0, roughness: 0.8
    }),
    glass: new THREE.MeshStandardMaterial({
      color: 0x1a2a3a, roughness: 0.15, metalness: 0.7
    }),
    trim: new THREE.MeshStandardMaterial({
      color: 0x1a1a1a, roughness: 0.6
    }),
    funnel: new THREE.MeshStandardMaterial({
      color: 0xe8e2d0, roughness: 0.65
    }),
    funnelBand: new THREE.MeshStandardMaterial({
      color: 0xb4441f, roughness: 0.7
    }),
    crane: new THREE.MeshStandardMaterial({
      color: 0xdcd8c8, roughness: 0.7
    }),
    lifeboat: new THREE.MeshStandardMaterial({
      color: 0xe8681a, roughness: 0.6
    })
  };

  // ---------------- HULL CONSTRUCTION ----------------
  // Approach: build hull as a lathed side profile.
  // Define side-view profile (in X=0 plane) with points along length-Z going bow(+Z) to stern(-Z).
  // For each length station, we define: top-deck X half-width (deck beam) and bottom X half-width (keel).
  // Then we generate an extruded surface with panels.

  const hullGroup = new THREE.Group();
  ship.add(hullGroup);

  // Define length stations: z, deckHalfWidth, keelHalfWidth, topY, bottomY
  //  Typical container ship: full beam along midbody, tapered bow, rounded stern.
  //  The bow has a flared clipper-like shape above waterline and a bulbous/raked profile below.
  const stations = [];
  // Stern end (z = -L/2)
  stations.push({ z: -L/2,        top: B*0.35, bot: B*0.08, yTop: Y_DECK, yBot: Y_KEEL + 1.8 });
  stations.push({ z: -L/2 + 1.0,  top: B*0.48, bot: B*0.22, yTop: Y_DECK, yBot: Y_KEEL + 0.4 });
  stations.push({ z: -L/2 + 3.0,  top: B*0.50, bot: B*0.42, yTop: Y_DECK, yBot: Y_KEEL + 0.15 });
  stations.push({ z: -L/2 + 6.0,  top: B*0.50, bot: B*0.48, yTop: Y_DECK, yBot: Y_KEEL });
  // Midbody (parallel)
  stations.push({ z: -L*0.25,     top: B*0.50, bot: B*0.50, yTop: Y_DECK, yBot: Y_KEEL });
  stations.push({ z: 0,           top: B*0.50, bot: B*0.50, yTop: Y_DECK, yBot: Y_KEEL });
  stations.push({ z: L*0.22,      top: B*0.50, bot: B*0.50, yTop: Y_DECK, yBot: Y_KEEL });
  // Start of bow taper
  stations.push({ z: L*0.30,      top: B*0.50, bot: B*0.45, yTop: Y_DECK, yBot: Y_KEEL + 0.2 });
  stations.push({ z: L*0.37,      top: B*0.48, bot: B*0.30, yTop: Y_DECK + 0.1, yBot: Y_KEEL + 0.7 });
  stations.push({ z: L*0.43,      top: B*0.42, bot: B*0.15, yTop: Y_DECK + 0.3, yBot: Y_KEEL + 1.5 });
  // Bow stem (raked forward & upward)
  stations.push({ z: L*0.47,      top: B*0.28, bot: B*0.05, yTop: Y_DECK + 0.6, yBot: Y_KEEL + 2.8 });
  stations.push({ z: L/2,         top: B*0.05, bot: B*0.01, yTop: Y_DECK + 1.0, yBot: -2.0 });

  // Build hull surfaces (outer skin) — separate port (left, x<0) and starboard (x>0) halves
  // so we can hide starboard in cutaway mode.
  function buildHullSide(sign, name) {
    // sign = +1 starboard, -1 port
    const positions = [];
    const indices = [];

    // 4 longitudinal lines per side: deck edge top, boot top, boot bot (waterline), keel edge
    // Each station contributes 4 vertices: (topX, yTop), (topX, Y_BOOT_TOP), (topX*scaleToBot, Y_BOOT_BOT), (botX, yBot)
    // We interpolate X linearly from top to bot over the height.
    function xAtY(station, y) {
      const t = (y - station.yBot) / (station.yTop - station.yBot);
      return THREE.MathUtils.lerp(station.bot, station.top, Math.max(0, Math.min(1, t)));
    }

    for (let i = 0; i < stations.length; i++) {
      const s = stations[i];
      // 4 vertices per station
      positions.push(
        sign * s.top,           s.yTop,       s.z,   // 0 deck edge
        sign * xAtY(s, Y_BOOT_TOP), Y_BOOT_TOP,  s.z,   // 1 above waterline
        sign * xAtY(s, Y_BOOT_BOT), Y_BOOT_BOT,  s.z,   // 2 below waterline
        sign * s.bot,           s.yBot,       s.z    // 3 keel
      );
    }

    // Build faces between consecutive stations
    const stride = 4;
    for (let i = 0; i < stations.length - 1; i++) {
      for (let k = 0; k < 3; k++) {
        const a = i * stride + k;
        const b = i * stride + k + 1;
        const c = (i + 1) * stride + k + 1;
        const d = (i + 1) * stride + k;
        // Winding depends on sign
        if (sign > 0) {
          indices.push(a, b, c, a, c, d);
        } else {
          indices.push(a, c, b, a, d, c);
        }
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setIndex(indices);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.computeVertexNormals();

    // Split into 3 meshes by Y band: red topside (yTop to boot_top), black boot, red below (boot_bot to keel)
    // Simpler: use 3 vertex groups → 3 materials via groups
    // We set up groups of indices for each band.
    const idxArr = indices;
    // Faces per span: 3 bands between 4 vertex rows. Stride 3 * 2 tris = 6 indices per band per station pair.
    const facesPerBand = 6;
    const bands = 3;
    geo.clearGroups();
    const totalStationPairs = stations.length - 1;
    for (let i = 0; i < totalStationPairs; i++) {
      for (let band = 0; band < bands; band++) {
        geo.addGroup(i * bands * facesPerBand + band * facesPerBand, facesPerBand, band);
      }
    }

    const mats = [MAT.hullRed, MAT.boot, MAT.hullBelow];
    const mesh = new THREE.Mesh(geo, mats);
    mesh.name = name;
    return mesh;
  }

  const hullPort = buildHullSide(-1, 'hullPort');
  hullPort.userData.side = 'port';
  hullGroup.add(hullPort);

  const hullStar = buildHullSide(+1, 'hullStar');
  hullStar.userData.side = 'starboard';
  hullGroup.add(hullStar);

  // ---- Bottom closing surface (keel plate) — connects port keel edge to starboard keel edge ----
  function buildBottom() {
    const positions = [];
    const indices = [];
    for (let i = 0; i < stations.length; i++) {
      const s = stations[i];
      // left (port) keel point, right (star) keel point
      positions.push(-s.bot, s.yBot, s.z);
      positions.push( s.bot, s.yBot, s.z);
    }
    for (let i = 0; i < stations.length - 1; i++) {
      const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2 + 1, d = (i + 1) * 2;
      indices.push(a, c, b, a, d, c);
    }
    const geo = new THREE.BufferGeometry();
    geo.setIndex(indices);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, MAT.hullBelow);
  }
  const bottom = buildBottom();
  bottom.userData.side = 'shared';
  hullGroup.add(bottom);

  // ---- Stern transom (vertical closing plate at back) ----
  function buildTransom() {
    const s = stations[0];
    const positions = [
      -s.top, s.yTop, s.z,
       s.top, s.yTop, s.z,
       s.bot, s.yBot, s.z,
      -s.bot, s.yBot, s.z
    ];
    const indices = [0,1,2, 0,2,3];
    const geo = new THREE.BufferGeometry();
    geo.setIndex(indices);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, MAT.hullRed);
  }
  const transom = buildTransom();
  transom.userData.side = 'shared';
  hullGroup.add(transom);

  // ---- Transom Bulwark (connects port and star at the stern) ----
  function buildTransomBulwark() {
    const s = stations[0];
    const h = 0.4;
    const positions = [
      -s.top, s.yTop, s.z,
       s.top, s.yTop, s.z,
       s.top, s.yTop + h, s.z,
      -s.top, s.yTop + h, s.z
    ];
    // CCW looking from -Z: 0, 3, 2, 0, 2, 1
    const indices = [0, 3, 2, 0, 2, 1];
    const geo = new THREE.BufferGeometry();
    geo.setIndex(indices);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, MAT.hullRed);
  }
  const transomBulwark = buildTransomBulwark();
  transomBulwark.userData.side = 'shared';
  hullGroup.add(transomBulwark);

  // ---- Bow stem (vertical closing plate at front) ----
  function buildStem() {
    const s = stations[stations.length - 1];
    const positions = [
      -s.top, s.yTop, s.z,
       s.top, s.yTop, s.z,
       s.bot, s.yBot, s.z,
      -s.bot, s.yBot, s.z
    ];
    // CCW looking from +Z: 1, 0, 3, 1, 3, 2
    const indices = [1, 0, 3, 1, 3, 2];
    const geo = new THREE.BufferGeometry();
    geo.setIndex(indices);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, MAT.hullRed);
  }
  const stem = buildStem();
  stem.userData.side = 'shared';
  hullGroup.add(stem);

  // ---- Main deck surface (top closing plate) ----
  function buildDeck(sign) {
    const positions = [];
    const indices = [];
    for (let i = 0; i < stations.length; i++) {
      const s = stations[i];
      positions.push(0, s.yTop, s.z);
      positions.push(sign * s.top, s.yTop, s.z);
    }
    for (let i = 0; i < stations.length - 1; i++) {
      const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2 + 1, d = (i + 1) * 2;
      if (sign > 0) indices.push(a, b, c, a, c, d);
      else indices.push(a, c, b, a, d, c);
    }
    const geo = new THREE.BufferGeometry();
    geo.setIndex(indices);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, MAT.deck);
  }
  const deckPort = buildDeck(-1);
  deckPort.userData.side = 'port';
  hullGroup.add(deckPort);
  const deckStar = buildDeck(+1);
  deckStar.userData.side = 'starboard';
  hullGroup.add(deckStar);

  // ---- Bulwark (low wall on deck edge) ----
  function buildBulwark(sign) {
    const pts = [];
    for (let i = 0; i < stations.length; i++) {
      const s = stations[i];
      pts.push(new THREE.Vector3(sign * s.top, s.yTop, s.z));
    }
    const bulwarkH = 0.4;
    const positions = [];
    const indices = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      positions.push(p.x, p.y, p.z);
      positions.push(p.x, p.y + bulwarkH, p.z);
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2 + 1, d = (i + 1) * 2;
      if (sign > 0) indices.push(a, b, c, a, c, d);
      else indices.push(a, c, b, a, d, c);
    }
    const geo = new THREE.BufferGeometry();
    geo.setIndex(indices);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, MAT.hullRed);
  }
  const bulwarkP = buildBulwark(-1);
  bulwarkP.userData.side = 'port';
  hullGroup.add(bulwarkP);
  const bulwarkS = buildBulwark(+1);
  bulwarkS.userData.side = 'starboard';
  hullGroup.add(bulwarkS);

  // ---- Bow Bulwark (connects port and star at the stem) ----
  function buildStemBulwark() {
    const s = stations[stations.length - 1];
    const h = 0.4;
    const positions = [
      -s.top, s.yTop, s.z,
       s.top, s.yTop, s.z,
       s.top, s.yTop + h, s.z,
      -s.top, s.yTop + h, s.z
    ];
    const indices = [1, 0, 3, 1, 3, 2];
    const geo = new THREE.BufferGeometry();
    geo.setIndex(indices);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, MAT.hullRed);
  }
  const stemBulwark = buildStemBulwark();
  stemBulwark.userData.side = 'shared';
  hullGroup.add(stemBulwark);

  // ---- Bulbous bow visible below waterline (rounded nub forward of stem) ----
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.6, 16, 12),
    MAT.hullBelow
  );
  bulb.scale.set(0.7, 0.7, 1.8);
  bulb.position.set(0, -1.8, L/2 + 0.4);
  bulb.userData.side = 'shared';
  hullGroup.add(bulb);



  // ==========================================================
  //  INTERNAL STRUCTURE (visible in cutaway)
  // ==========================================================
  const holdCount = 5;
  const holdStart = -L * 0.22;
  const holdEnd = L * 0.28;
  const holdLen = (holdEnd - holdStart) / holdCount;

  // Transverse bulkheads
  for (let i = 0; i <= holdCount; i++) {
    const z = holdStart + i * holdLen;
    const bh = new THREE.Mesh(
      new THREE.BoxGeometry(B - 0.8, D + DB - 0.3, 0.18),
      MAT.bulkhead
    );
    bh.position.set(0, (Y_DECK + Y_KEEL) / 2, z);
    bh.userData.side = 'shared';
    ship.add(bh);
  }

  // Double bottom + wing tanks (inner hull)
  const DB_H = 1.4;
  const DB_TOP_Y = Y_KEEL + DB_H;
  const WING_W = 1.1;
  const WING_TOP_Y = Y_DECK - 0.3;
  const WING_BOT_Y = DB_TOP_Y;

  const tankL = (holdEnd - holdStart) - 0.3;
  const tankZ = (holdStart + holdEnd) / 2;

  // Tank top (floor of cargo holds)
  const tankTop = new THREE.Mesh(
    new THREE.BoxGeometry(B - 2 * WING_W - 0.15, 0.12, tankL),
    MAT.tankShell
  );
  tankTop.position.set(0, DB_TOP_Y, tankZ);
  tankTop.userData.side = 'shared';
  ship.add(tankTop);

  // Wing tank inner walls
  const wingInnerL = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, WING_TOP_Y - WING_BOT_Y, tankL),
    MAT.tankShell
  );
  wingInnerL.position.set(-B / 2 + WING_W + 0.06, (WING_TOP_Y + WING_BOT_Y) / 2, tankZ);
  wingInnerL.userData.side = 'port';
  ship.add(wingInnerL);

  const wingInnerR = wingInnerL.clone();
  wingInnerR.position.x = B / 2 - WING_W - 0.06;
  wingInnerR.userData = { side: 'starboard' };
  ship.add(wingInnerR);

  // Wing tank caps (horizontal tops)
  const wingCapL = new THREE.Mesh(
    new THREE.BoxGeometry(WING_W, 0.1, tankL),
    MAT.tankShell
  );
  wingCapL.position.set(-B / 2 + WING_W / 2 + 0.1, WING_TOP_Y, tankZ);
  wingCapL.userData.side = 'port';
  ship.add(wingCapL);

  const wingCapR = wingCapL.clone();
  wingCapR.position.x = B / 2 - WING_W / 2 - 0.1;
  wingCapR.userData = { side: 'starboard' };
  ship.add(wingCapR);

  // ==========================================================
  //  BALLAST WATER
  // ==========================================================
  const ballastBody = new THREE.MeshStandardMaterial({
    color: 0x2e8ac2, transparent: true, opacity: 0.85,
    roughness: 0.1, metalness: 0.3,
    emissive: 0x115588, emissiveIntensity: 0.6,
    side: THREE.DoubleSide, depthWrite: false
  });
  const ballastSurface = new THREE.MeshStandardMaterial({
    color: 0x8addf2, transparent: true, opacity: 0.9,
    roughness: 0.05, metalness: 0.6,
    emissive: 0x2288bb, emissiveIntensity: 0.8,
    side: THREE.DoubleSide, depthWrite: false
  });

  // Double bottom water
  const ballastTanks = [];

  for (let i = 0; i < holdCount; i++) {
    const zC = holdStart + holdLen * (i + 0.5);
    const tL = holdLen - 0.4;
    // Narrower tanks to prevent hull bleed-through
    const DB_W_W = B - 2 * WING_W - 0.8;
    const WW_W = WING_W - 0.5;

    // DB Tank
    const dbW = new THREE.Mesh(new THREE.BoxGeometry(DB_W_W, 1, tL), ballastBody);
    dbW.position.z = zC;
    dbW.renderOrder = 5;
    dbW.userData.side = 'shared';
    ship.add(dbW);

    const dbS = new THREE.Mesh(new THREE.PlaneGeometry(DB_W_W * 0.98, tL * 0.98), ballastSurface);
    dbS.rotation.x = -Math.PI / 2;
    dbS.position.z = zC;
    dbS.renderOrder = 6;
    dbS.userData.side = 'shared';
    ship.add(dbS);

    // Wing Tanks
    const wWL = new THREE.Mesh(new THREE.BoxGeometry(WW_W, 1, tL), ballastBody);
    wWL.position.set(-B / 2 + WING_W / 2 + 0.15, 0, zC);
    wWL.renderOrder = 5;
    wWL.userData.side = 'port';
    ship.add(wWL);

    const wSL = new THREE.Mesh(new THREE.PlaneGeometry(WW_W * 0.98, tL * 0.98), ballastSurface);
    wSL.rotation.x = -Math.PI / 2;
    wSL.position.set(-B / 2 + WING_W / 2 + 0.05, 0, zC);
    wSL.renderOrder = 6;
    wSL.userData.side = 'port';
    ship.add(wSL);

    const wWR = new THREE.Mesh(new THREE.BoxGeometry(WW_W, 1, tL), ballastBody);
    wWR.position.set(B / 2 - WING_W / 2 - 0.15, 0, zC);
    wWR.renderOrder = 5;
    wWR.userData.side = 'starboard';
    ship.add(wWR);

    const wSR = new THREE.Mesh(new THREE.PlaneGeometry(WW_W * 0.98, tL * 0.98), ballastSurface);
    wSR.rotation.x = -Math.PI / 2;
    wSR.position.set(B / 2 - WING_W / 2 - 0.05, 0, zC);
    wSR.renderOrder = 6;
    wSR.userData.side = 'starboard';
    ship.add(wSR);

    ballastTanks.push({ dbW, dbS, wWL, wSL, wWR, wSR });
  }

  // ==========================================================
  //  GLOWING SENSORS (I0.0, I0.1, I0.2)
  // ==========================================================
  const sensorGroup = new THREE.Group();
  ship.add(sensorGroup);
  const sensorProbes = [];
  const sensorLevels = [
    { id: 'i00', y: Y_KEEL + 1.2, label: 'I0.0' },
    { id: 'i01', y: (Y_KEEL + Y_DECK) / 2, label: 'I0.1' },
    { id: 'i02', y: Y_DECK - 1.2, label: 'I0.2' }
  ];

  sensorLevels.forEach((lev, idx) => {
    const probeMat = new THREE.MeshStandardMaterial({
      color: 0x444444, emissive: 0x000000, emissiveIntensity: 1
    });
    const probe = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.8, 16), probeMat);
    probe.rotation.z = Math.PI / 2;
    probe.position.set(-B / 2 + 0.3, lev.y, tankZ);
    sensorGroup.add(probe);
    sensorProbes.push({ mesh: probe, mat: probeMat, id: lev.id });
  });

  // ==========================================================
  //  CARGO — realistic ISO containers with varied colors
  // ==========================================================
  const cargoGroup = new THREE.Group();
  cargoGroup.userData.side = 'shared';
  ship.add(cargoGroup);

  const containerColors = [
    0xb43838, 0x2e5d9a, 0x3a9a5c, 0xc87a1a, 0x7a3a9a, 0x888888,
    0xd2a02a, 0xb85520, 0x2a8a8a, 0xbfa070, 0x4a4a4a, 0x8a2a6a
  ];

  const cargoBoxes = [];

  // Container dims (real TEU: 6m x 2.4m x 2.6m)  Scale to ship units
  const CW = 0.9;  // width (across beam), 20ft = 2.4m
  const CH = 0.95; // height, 2.6m
  const CL = 2.2;  // length (along keel), 20ft = 6.1m

  // We'll stack containers in each hold (below deck) and on top of hatches (above deck)
  // Cargo space
  const cargoBottom = DB_TOP_Y + 0.12;
  const cargoTopHold = Y_DECK - 0.15;  // top of hold (under hatch cover)
  const cargoInHoldH = cargoTopHold - cargoBottom;

  for (let h = 0; h < holdCount; h++) {
    const zC = holdStart + holdLen * (h + 0.5);
    const holdInnerLen = holdLen - 0.25;

    // Containers in hold (below deck)
    const colsX = 5;  // 5 across beam
    const colsZ = Math.floor(holdInnerLen / CL);
    const layersH = Math.floor(cargoInHoldH / CH);

    const startX = -((colsX - 1) * CW) / 2;
    const startZ = zC - ((colsZ - 1) * CL) / 2;

    for (let ly = 0; ly < layersH; ly++) {
      for (let cz = 0; cz < colsZ; cz++) {
        for (let cx = 0; cx < colsX; cx++) {
          const color = containerColors[(h * 7 + ly * 3 + cx * 2 + cz) % containerColors.length];
          const box = new THREE.Mesh(
            new THREE.BoxGeometry(CW * 0.96, CH * 0.94, CL * 0.97),
            new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.1 })
          );
          box.position.set(
            startX + cx * CW,
            cargoBottom + CH / 2 + ly * CH,
            startZ + cz * CL
          );
          box.visible = false;
          box.userData.side = 'shared';
          cargoGroup.add(box);
          // Fill order: lower layers fill first; within a layer, fill hold by hold
          const totalHold = layersH * colsX * colsZ;
          const idxHold = ly * colsX * colsZ + cz * colsX + cx;
          const threshold = (h * totalHold + idxHold) / (holdCount * totalHold) * 55;
          cargoBoxes.push({ mesh: box, threshold });
        }
      }
    }

    // Deck containers (above 55% cargo), 2 layers stacked
    const deckLayers = 3;
    const deckColsX = 5;
    const deckColsZ = Math.floor(holdInnerLen / CL);
    const dStartX = -((deckColsX - 1) * CW) / 2;
    const dStartZ = zC - ((deckColsZ - 1) * CL) / 2;
    for (let ly = 0; ly < deckLayers; ly++) {
      for (let cz = 0; cz < deckColsZ; cz++) {
        for (let cx = 0; cx < deckColsX; cx++) {
          const color = containerColors[(h * 5 + ly * 4 + cx * 3 + cz * 2) % containerColors.length];
          const box = new THREE.Mesh(
            new THREE.BoxGeometry(CW * 0.96, CH * 0.94, CL * 0.97),
            new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.1 })
          );
          box.position.set(
            dStartX + cx * CW,
            Y_DECK + 0.3 + CH / 2 + ly * CH,
            dStartZ + cz * CL
          );
          box.visible = false;
          box.userData.side = 'shared';
          cargoGroup.add(box);
          const total = deckLayers * deckColsX * deckColsZ;
          const idx = ly * deckColsX * deckColsZ + cz * deckColsX + cx;
          const threshold = 55 + (h * total + idx) / (holdCount * total) * 45;
          cargoBoxes.push({ mesh: box, threshold });
        }
      }
    }
  }

  // ==========================================================
  //  SUPERSTRUCTURE (aft) — stepped white tower with bridge, twin funnels, radar mast
  // ==========================================================
  function buildSuperstructure() {
    const g = new THREE.Group();
    g.userData.side = 'shared';

    const baseZ = -L * 0.32;
    const deckY = Y_DECK;

    // Stepped accommodation blocks (6 decks)
    const b1 = new THREE.Mesh(new THREE.BoxGeometry(B - 0.4, 1.3, 3.8), MAT.superWhite);
    b1.position.set(0, deckY + 0.65, baseZ);
    g.add(b1);

    const b2 = new THREE.Mesh(new THREE.BoxGeometry(B - 0.8, 1.2, 3.4), MAT.superWhite);
    b2.position.set(0, deckY + 1.9, baseZ);
    g.add(b2);

    const b3 = new THREE.Mesh(new THREE.BoxGeometry(B - 1.2, 1.1, 3.0), MAT.superWhite);
    b3.position.set(0, deckY + 3.05, baseZ);
    g.add(b3);

    const b4 = new THREE.Mesh(new THREE.BoxGeometry(B - 1.6, 1.0, 2.6), MAT.superWhite);
    b4.position.set(0, deckY + 4.15, baseZ);
    g.add(b4);

    // Bridge (glass)
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(B - 1.8, 0.7, 2.2), MAT.glass);
    bridge.position.set(0, deckY + 5.0, baseZ);
    g.add(bridge);

    // Wings (bridge wings extending beyond width)
    const wingL = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.6), MAT.superWhite);
    wingL.position.set(-B / 2 + 0.1, deckY + 5.0, baseZ);
    g.add(wingL);
    const wingR = wingL.clone();
    wingR.position.x = B / 2 - 0.1;
    g.add(wingR);

    // Top cap / monkey island
    const top = new THREE.Mesh(new THREE.BoxGeometry(B - 2.2, 0.35, 1.8), MAT.superWhite);
    top.position.set(0, deckY + 5.55, baseZ);
    g.add(top);

    // Radar mast
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.1, 3, 8), MAT.trim);
    mast.position.set(0, deckY + 7.2, baseZ);
    g.add(mast);
    const radar1 = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.15), MAT.trim);
    radar1.position.set(0, deckY + 7.4, baseZ);
    g.add(radar1);
    const radarDome = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8), MAT.superWhite);
    radarDome.position.set(0, deckY + 7.9, baseZ);
    g.add(radarDome);

    // Twin funnels (stacks) aft of bridge
    for (let side of [-1, 1]) {
      const f = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.45, 2.2, 16), MAT.funnel);
      f.position.set(side * 0.8, deckY + 4.2, baseZ - 2.2);
      g.add(f);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.4, 16), MAT.funnelBand);
      band.position.set(side * 0.8, deckY + 4.5, baseZ - 2.2);
      g.add(band);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 0.1, 16), MAT.trim);
      cap.position.set(side * 0.8, deckY + 5.35, baseZ - 2.2);
      g.add(cap);
    }

    // Funnel housing block (where funnels emerge)
    const funnelHouse = new THREE.Mesh(new THREE.BoxGeometry(B - 1.5, 2.5, 1.8), MAT.superWhite);
    funnelHouse.position.set(0, deckY + 2.55, baseZ - 2.2);
    g.add(funnelHouse);

    // Windows band on each accommodation level (subtle dark stripes)
    [b2, b3, b4].forEach((blk, i) => {
      const gbox = blk.geometry.parameters;
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(gbox.width + 0.01, 0.25, gbox.depth + 0.01),
        MAT.glass
      );
      strip.position.copy(blk.position);
      strip.position.y += 0.1;
      g.add(strip);
    });

    // Lifeboat on starboard
    const lifeboat = new THREE.Mesh(
      THREE.CapsuleGeometry 
        ? new THREE.CapsuleGeometry(0.25, 1.2, 4, 12) 
        : new THREE.CylinderGeometry(0.25, 0.25, 1.8, 12), 
      MAT.lifeboat
    );
    lifeboat.rotation.z = Math.PI / 2;
    lifeboat.position.set(B / 2 - 0.25, deckY + 2.3, baseZ + 1.0);
    g.add(lifeboat);
    const lifeboatP = lifeboat.clone();
    lifeboatP.position.x = -B / 2 + 0.25;
    g.add(lifeboatP);

    return g;
  }
  ship.add(buildSuperstructure());

  // ==========================================================
  //  BALLAST HARDWARE (Pump & Valve)
  // ==========================================================
  const pumpMat = new THREE.MeshStandardMaterial({ color: 0x444444, emissive: 0x000000 });
  const ballastPump = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.2, 16), pumpMat);
  ballastPump.position.set(2.5, Y_DECK + 0.6, -L * 0.32 + 2.5); // On deck near superstructure
  ship.add(ballastPump);

  const valveMat = new THREE.MeshStandardMaterial({ color: 0x444444, emissive: 0x000000 });
  const outletValve = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.1, 8, 16), valveMat);
  outletValve.rotation.y = Math.PI / 2;
  outletValve.position.set(-B/2 - 0.1, Y_BOOT_BOT, 0); // On port hull side
  ship.add(outletValve);

  // Water Discharge Stream (Visual only)
  const dischargeGeo = new THREE.CylinderGeometry(0.1, 0.15, 2.0, 8);
  const dischargeMat = new THREE.MeshStandardMaterial({ color: 0x88ccff, transparent: true, opacity: 0 });
  const dischargeStream = new THREE.Mesh(dischargeGeo, dischargeMat);
  dischargeStream.rotation.z = Math.PI / 2.5;
  dischargeStream.position.set(-B/2 - 1.0, Y_BOOT_BOT - 0.5, 0);
  ship.add(dischargeStream);

  // ==========================================================
  //  GANTRY CRANES (two — forward and aft of midships, like image)
  // ==========================================================
  function buildGantryCrane(zPos) {
    const g = new THREE.Group();
    g.userData.side = 'shared';

    // Vertical legs (4, on both sides)
    const legHeight = 5.2;
    const legY = Y_DECK + 0.4 + legHeight / 2;

    const legMat = MAT.crane;

    for (let sx of [-1, 1]) {
      for (let sz of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.25, legHeight, 0.25), legMat);
        leg.position.set(sx * (B / 2 - 0.3), legY, zPos + sz * 0.8);
        g.add(leg);
      }
    }

    // Horizontal cross-beam (top)
    const beamY = Y_DECK + 0.4 + legHeight;
    const crossBeam = new THREE.Mesh(
      new THREE.BoxGeometry(B + 1.6, 0.35, 0.4),
      legMat
    );
    crossBeam.position.set(0, beamY + 0.17, zPos);
    g.add(crossBeam);

    // Second cross beam (offset in Z) creates the box frame
    const crossBeam2 = crossBeam.clone();
    crossBeam2.position.z = zPos + 0.8;
    g.add(crossBeam2);
    const crossBeam3 = crossBeam.clone();
    crossBeam3.position.z = zPos - 0.8;
    g.add(crossBeam3);

    // Longitudinal top beams (connect the two cross beams on each side)
    for (let sx of [-1, 1]) {
      const lb = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.3, 1.8), legMat);
      lb.position.set(sx * (B / 2 + 0.7), beamY + 0.17, zPos);
      g.add(lb);
    }

    // Trolley / hoist carriage on top (small box running on rails)
    const trolley = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.4, 1.2), MAT.trim);
    trolley.position.set(0, beamY - 0.1, zPos);
    g.add(trolley);

    // Diagonal bracing on legs (X-pattern for realism)
    for (let sx of [-1, 1]) {
      const brace = new THREE.Mesh(new THREE.BoxGeometry(0.12, legHeight * 1.1, 0.12), legMat);
      brace.position.set(sx * (B / 2 - 0.3), legY, zPos);
      brace.rotation.x = Math.PI / 8;
      g.add(brace);
      const brace2 = brace.clone();
      brace2.rotation.x = -Math.PI / 8;
      g.add(brace2);
    }

    return g;
  }

  // Place cranes at break-points between cargo holds
  const crane1 = buildGantryCrane(holdStart + holdLen * 1.5);
  ship.add(crane1);
  const crane2 = buildGantryCrane(holdStart + holdLen * 3.5);
  ship.add(crane2);

  // ==========================================================
  //  HATCH COVERS (between cranes, on deck) — visual detail
  // ==========================================================
  // Hatch coaming frames along deck (around each hold opening)
  for (let h = 0; h < holdCount; h++) {
    const zC = holdStart + holdLen * (h + 0.5);
    const coam = new THREE.Mesh(
      new THREE.BoxGeometry(B - 0.6, 0.25, holdLen - 0.4),
      new THREE.MeshStandardMaterial({ color: 0x3a1a10, roughness: 0.85 })
    );
    coam.position.set(0, Y_DECK + 0.12, zC);
    coam.userData.side = 'shared';
    ship.add(coam);
  }

  // ==========================================================
  //  PROPELLER & RUDDER (visible below stern)
  // ==========================================================
  const propGroup = new THREE.Group();
  propGroup.userData.side = 'shared';
  propGroup.position.set(0, Y_KEEL + 1.0, -L / 2 + 0.6);

  const propHub = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.3, 12), MAT.trim);
  propHub.rotation.x = Math.PI / 2;
  propGroup.add(propHub);

  for (let i = 0; i < 5; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.3), MAT.trim);
    blade.position.set(0, 0, 0);
    blade.rotation.z = (i / 5) * Math.PI * 2;
    // move blade outward along its local rotated axis
    const ang = (i / 5) * Math.PI * 2;
    blade.position.set(Math.sin(ang) * 0.45, Math.cos(ang) * 0.45, 0);
    blade.rotation.z = ang;
    propGroup.add(blade);
  }
  ship.add(propGroup);

  // Rudder
  const rudder = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 1.6, 1.0),
    MAT.hullBelow
  );
  rudder.position.set(0, Y_KEEL + 1.2, -L / 2 + 0.1);
  rudder.userData.side = 'shared';
  ship.add(rudder);

  // ==========================================================
  //  STATE & PHYSICS
  // ==========================================================
  const shipState = {
    cargo: 0,
    ballast: 0,
    sea: 2,
    currentY: 0,
    targetY: 0,
    roll: 0, targetRoll: 0,
    pitch: 0,
    ballastLvl: 0.45,
    scenario: 'none',
    pumpActive: false,
    valveActive: false,
    leakRate: 0,
    faults: { low_sensor: false, high_stuck: false, valve_stuck: false, cavitation: false },
    scenarioTime: 0
  };

  const LIGHTSHIP_MASS = 5000;
  const MAX_CARGO = 18000;
  const MAX_BALLAST = 8000;

  function computeState() {
    const cargoMass = (shipState.cargo / 100) * MAX_CARGO;
    const ballastMass = (shipState.ballast / 100) * MAX_BALLAST;
    const total = LIGHTSHIP_MASS + cargoMass + ballastMass;
    
    // Total hull height is 11 units (Y_KEEL -6 to Y_DECK 5).
    // A real ship typically sits ~30% submerged even when completely empty.
    // minDraft = 30% of 11 = 3.3m.
    const maxDraft = 10.5, minDraft = 3.3; 
    
    const massRatio = (total - LIGHTSHIP_MASS) / (MAX_CARGO + MAX_BALLAST);
    const realDraft = minDraft + massRatio * (maxDraft - minDraft);
    
    // Ship y offset: Keel is at -6. To have draft D, keel world Y must be -D.
    // So ship.y - 6 = -D => ship.y = 6 - D.
    const shipY = 6 - realDraft;
    const freeboard = 11 - realDraft;

    let stability = 'Good', stabColor = '#1e5a3a';
    if (shipState.cargo > 30 && shipState.ballast < 20) { stability = 'Tender'; stabColor = '#b4441f'; }
    if (shipState.cargo < 10 && shipState.ballast < 15) { stability = 'Dangerous'; stabColor = '#7a2a10'; }
    if (shipState.cargo > 70 && shipState.ballast > 70) { stability = 'Overloaded'; stabColor = '#7a2a10'; }

    return { cargoMass, ballastMass, total, realDraft, shipY, freeboard, stability, stabColor };
  }

  function updateDisplay() {
    const s = computeState();
    document.getElementById('r-draft').textContent = s.realDraft.toFixed(1) + ' m';
    document.getElementById('r-disp').textContent = Math.round(s.total).toLocaleString() + ' t';
    document.getElementById('st-draft').textContent = s.realDraft.toFixed(1);
    document.getElementById('st-free').textContent = s.freeboard.toFixed(1);
    document.getElementById('st-mass').textContent = (s.total / 1000).toFixed(1);
    const stabEl = document.getElementById('st-stab');
    stabEl.textContent = s.stability;
    stabEl.style.color = s.stabColor;
    document.getElementById('v-cargo').textContent = shipState.cargo;
    document.getElementById('v-ballast').textContent = Math.round(shipState.ballast);
    document.getElementById('v-sea').textContent = shipState.sea;
    document.getElementById('v-pump').textContent = shipState.pumpActive ? 'ON' : 'OFF';

    // Update Sensors
    let r = shipState.ballast;
    if (shipState.faults.low_sensor) r = 0;
    if (shipState.faults.high_stuck) r = 100;

    const i00 = r >= 10;
    const i01 = r >= 50;
    const i02 = r >= 90;

    const updateSens = (id, val, fault) => {
      const el = document.getElementById(id);
      const txt = document.getElementById('v-' + id.split('-')[1]);
      txt.innerText = val ? 'ON' : 'OFF';
      el.style.background = fault ? 'rgba(180,68,31,0.2)' : (val ? 'rgba(58,154,92,0.1)' : 'transparent');
      el.style.borderColor = fault ? 'var(--rust)' : (val ? '#3a9a5c' : 'var(--line)');
      el.style.color = fault ? 'var(--rust-2)' : (val ? '#2a6a40' : 'inherit');
      
      // Update 3D Probes
      const probe = sensorProbes.find(p => p.id === id.split('-')[1]);
      if (probe) {
        if (fault) {
          probe.mat.emissive.setHex(0xff0000);
          probe.mat.emissiveIntensity = 2.0 + Math.sin(Date.now() * 0.01) * 1.5;
        } else if (val) {
          probe.mat.emissive.setHex(0x00ff00);
          probe.mat.emissiveIntensity = 1.0;
        } else {
          probe.mat.emissive.setHex(0x333333);
          probe.mat.emissiveIntensity = 0.2;
        }
      }
    };
    updateSens('s-i00', i00, shipState.faults.low_sensor);
    updateSens('s-i01', i01, false);
    updateSens('s-i02', i02, shipState.faults.high_stuck);

    // Update Alarms
    const isFault = Object.values(shipState.faults).some(v => v);
    const diag = document.getElementById('diag-msg');
    const alarm = document.getElementById('alarm');
    
    // Update Hardware Visuals
    const pGlow = shipState.faults.cavitation ? (0.5 + 0.5 * Math.sin(Date.now()*0.01)) : 0;
    pumpMat.emissive.setHex(shipState.faults.cavitation ? 0xff0000 : 0x000000);
    pumpMat.emissiveIntensity = pGlow * 3;

    const vGlow = shipState.faults.valve_stuck ? (0.5 + 0.5 * Math.sin(Date.now()*0.01)) : 0;
    valveMat.emissive.setHex(shipState.faults.valve_stuck ? 0xff0000 : 0x000000);
    valveMat.emissiveIntensity = vGlow * 3;

    // Water stream logic
    const isDraining = shipState.faults.valve_stuck || (shipState.pumpActive && shipState.leakRate > 0);
    dischargeMat.opacity = isDraining ? 0.6 : 0;
    if (isDraining) {
      dischargeStream.scale.setScalar(1.0 + 0.1 * Math.sin(Date.now() * 0.02));
    }

    if (isFault) {
      diag.style.opacity = '1';
      alarm.classList.add('show');
      let msg = "SYSTEM DIAGNOSTIC: ";
      if (shipState.faults.low_sensor) msg += "I0.0 Signal Lost. Check probe wiring. ";
      if (shipState.faults.high_stuck) msg += "I0.2 Stuck HIGH. Emergency Shutdown Active. ";
      if (shipState.faults.valve_stuck) msg += "Unintended Discharge Detected. Check Outlet. ";
      if (shipState.faults.cavitation) msg += "Pump Flow Rate Low. Check for Air/Blockage. ";
      diag.innerText = msg;
    } else {
      diag.style.opacity = '0';
      alarm.classList.remove('show');
    }

    const warn = document.getElementById('warn');
    if (s.stability === 'Dangerous') { warn.classList.add('show'); warn.textContent = 'Unsafe · Hull riding too high'; }
    else if (s.stability === 'Overloaded') { warn.classList.add('show'); warn.textContent = 'Unsafe · Freeboard too low'; }
    else { warn.classList.remove('show'); }

    shipState.targetY = s.shipY;
    cargoBoxes.forEach(cb => { cb.mesh.visible = shipState.cargo > cb.threshold; });
    const imbalance = (shipState.cargo - shipState.ballast) / 100;
    shipState.targetRoll = imbalance * 0.035;
  }

  function startScenario(type) {
    shipState.scenario = type;
    const slider = document.getElementById('s-ballast');
    const modeText = document.getElementById('control-mode');
    const scText = document.getElementById('scenario-text');
    const faultPanel = document.getElementById('fault-section');
    const objPanel = document.getElementById('scenario-details');
    const objTitle = document.getElementById('obj-title');
    const objText = document.getElementById('obj-text');

    if (type === 'A') {
      shipState.ballast = 5;
      shipState.pumpActive = true;
      shipState.leakRate = 0;
      shipState.scenarioTime = 0;
      scText.innerText = "SCENARIO A (AUTO-FILL)";
      modeText.innerText = "AUTO (PLC)";
      slider.disabled = true;
      faultPanel.style.display = 'none';
      objPanel.style.display = 'block';
      objTitle.innerText = "Scenario A Objectives";
      objText.innerText = "Perform a clean fill-test. The PLC should automatically stop the pumps when the high-level sensor (I0.2) is reached at 91%. Watch the ship's draft increase.";
    } else if (type === 'B') {
      shipState.ballast = 91;
      shipState.pumpActive = false;
      shipState.leakRate = 0.4; // Simulate a leak
      shipState.scenarioTime = 0;
      scText.innerText = "SCENARIO B (MAINTAIN)";
      modeText.innerText = "AUTO (PLC)";
      slider.disabled = true;
      faultPanel.style.display = 'block'; // Show faults for B
      objPanel.style.display = 'block';
      objTitle.innerText = "Scenario B: Draft Stabilization";
      objText.innerText = "The PLC is programmed to maintain the ship at a safe 'Mid-Load' draft. It monitors the I0.1 sensor (50%) and activates the pump to counteract the steady leak. Observe the 5% hysteresis band that prevents the pump from cycling too frequently.";
    } else if (type === 'C') {
      shipState.ballast = 45;
      shipState.pumpActive = true;
      shipState.leakRate = 0;
      shipState.scenarioTime = 0;
      scText.innerText = "SCENARIO C (FAULT TL)";
      modeText.innerText = "AUTO (PLC)";
      slider.disabled = true;
      faultPanel.style.display = 'block';
      objPanel.style.display = 'block';
      objTitle.innerText = "Scenario C Objectives";
      objText.innerText = "Automated stress test. Observe how the system handles a sequence of timed faults (Sensor Fail at 10s, Cavitation at 25s). Monitoring the physical sensors inside the ship.";
    } else {
      shipState.pumpActive = false;
      shipState.leakRate = 0;
      shipState.scenarioTime = 0;
      shipState.faults = { low_sensor: false, high_stuck: false, valve_stuck: false, cavitation: false };
      scText.innerText = "NONE";
      modeText.innerText = "MANUAL";
      slider.disabled = false;
      faultPanel.style.display = 'none';
      objPanel.style.display = 'none';
      document.querySelectorAll('.preset').forEach(p => p.classList.remove('active'));
    }
    updateDisplay();
  }

  function toggleFault(id) {
    shipState.faults[id] = !shipState.faults[id];
    const btn = document.getElementById('f-' + id.split('_')[0]);
    if (btn) {
      if (shipState.faults[id]) btn.classList.add('active');
      else btn.classList.remove('active');
    }
    updateDisplay();
  }

  function runPLC(dt) {
    if (shipState.scenario === 'none' && !Object.values(shipState.faults).some(v => v)) return;

    shipState.scenarioTime += dt;

    // Apply Scenario C Timeline
    if (shipState.scenario === 'C') {
      if (shipState.scenarioTime > 10 && shipState.scenarioTime < 15) toggleFault('low_sensor');
      if (shipState.scenarioTime > 25 && shipState.scenarioTime < 30) toggleFault('cavitation');
    }

    // Physics modification based on faults
    let actualPumpRate = 2.0;
    if (shipState.faults.cavitation) actualPumpRate *= 0.5;

    let actualLeakRate = shipState.leakRate;
    if (shipState.faults.valve_stuck) actualLeakRate += 0.8;

    // Simulate physics
    if (shipState.pumpActive) {
      shipState.ballast += actualPumpRate * dt;
    }
    shipState.ballast -= actualLeakRate * dt;

    // Sensor Readings (with faults)
    let reading = shipState.ballast;
    if (shipState.faults.low_sensor) reading = 0;
    if (shipState.faults.high_stuck) reading = 100;

    // PLC Logic based on READINGS
    if (shipState.scenario === 'A' || shipState.scenario === 'C') {
      if (reading >= 91) {
        shipState.pumpActive = false;
        if (shipState.scenario === 'A') startScenario('none');
      }
    } else if (shipState.scenario === 'B') {
      // Industrial Maintenance Logic: 
      // Targets the mid-level sensor (I0.1 at 50%). m
      // Uses a settling timer to prevent rapid cycling (flickering).
      const midSensor = reading >= 50;
      
      if (!midSensor) {
        // Below 50%? Pump ON.
        shipState.pumpActive = true;
      } else if (reading > 55) {
        // Above 55%? Pump OFF. (5% hysteresis)
        shipState.pumpActive = false;
      }
    }

    shipState.ballast = Math.max(0, Math.min(100, shipState.ballast));
    updateDisplay();
  }

  function updateBallastWater() {
    const target = shipState.ballast / 100;
    shipState.ballastLvl += (target - shipState.ballastLvl) * 0.07;
    const f = Math.max(0.001, shipState.ballastLvl);

    const DB_W_MAX = DB_H - 0.25;
    const DB_W_BOT = Y_KEEL + 0.15;
    const WW_MAX = (WING_TOP_Y - WING_BOT_Y) - 0.2;
    const WW_BOT = WING_BOT_Y + 0.1;

    ballastTanks.forEach(t => {
      const dbH = f * DB_W_MAX;
      t.dbW.scale.y = dbH;
      t.dbW.position.y = DB_W_BOT + dbH / 2;
      t.dbS.position.y = DB_W_BOT + dbH + 0.005;
      t.dbS.visible = t.dbW.visible = f > 0.015;

      const wH = f * WW_MAX;
      [t.wWL, t.wWR].forEach(m => {
        m.scale.y = wH;
        m.position.y = WW_BOT + wH / 2;
        m.visible = f > 0.015;
      });
      [t.wSL, t.wSR].forEach(m => {
        m.position.y = WW_BOT + wH + 0.005;
        m.visible = f > 0.015;
      });
    });
  }

  // ==========================================================
  //  VIEW MODES
  // ==========================================================
  let currentView = 'exterior';

  function setView(mode) {
    currentView = mode;

    // Show/hide starboard pieces for cutaway
    ship.traverse(obj => {
      if (!obj.userData || !obj.userData.side) return;
      if (obj.userData.side === 'starboard') {
        obj.visible = (mode !== 'cutaway');
      }
    });

    // X-ray: make hull and internal structures translucent
    const hullMats = [
      MAT.hullRed, MAT.hullBelow, MAT.boot, MAT.deck, MAT.superWhite, 
      MAT.bulkhead, MAT.inner, MAT.tankShell, MAT.crane, MAT.funnel, MAT.funnelBand
    ];
    
    if (mode === 'xray') {
      hullMats.forEach(m => { 
        m.transparent = true; 
        m.opacity = 0.08; 
        m.depthWrite = false; 
        m.needsUpdate = true; 
      });
      ballastBody.emissiveIntensity = 2.5;
      ballastSurface.emissiveIntensity = 3.0;
      cargoBoxes.forEach(cb => { 
        cb.mesh.material.transparent = true; 
        cb.mesh.material.opacity = 0.15; 
        cb.mesh.material.depthWrite = false;
      });
    } else {
      hullMats.forEach(m => { 
        m.transparent = false; 
        m.opacity = 1.0; 
        m.depthWrite = true; 
        m.needsUpdate = true; 
      });
      ballastBody.emissiveIntensity = 0.6;
      ballastSurface.emissiveIntensity = 0.8;
      cargoBoxes.forEach(cb => { 
        cb.mesh.material.transparent = false; 
        cb.mesh.material.opacity = 1.0; 
        cb.mesh.material.depthWrite = true;
      });
    }

    document.querySelectorAll('.view-toggle button').forEach(b => {
      b.classList.toggle('active', b.dataset.view === mode);
    });

    // Ocean clipping to prevent interior flooding in cutaway
    if (mode === 'cutaway') {
      // B/2 is 3.75. We clip everything starboard of the port wall.
      oceanClipPlane.set(new THREE.Vector3(-1, 0, 0), -3.7); 
    } else {
      oceanClipPlane.set(new THREE.Vector3(1, 0, 0), 1000); // Move plane far away
    }
  }

  document.querySelectorAll('.view-toggle button').forEach(btn => {
    btn.addEventListener('click', () => setView(btn.dataset.view));
  });

  // ==========================================================
  //  CONTROLS
  // ==========================================================
  const sCargo = document.getElementById('s-cargo');
  const sBallast = document.getElementById('s-ballast');
  const sSea = document.getElementById('s-sea');
  let manualBallast = false, manualTimer = null;

  sCargo.addEventListener('input', e => {
    shipState.cargo = +e.target.value;
    if (!manualBallast) {
      const target = Math.max(0, Math.min(100, 80 - shipState.cargo * 0.8));
      shipState.ballast = Math.round(target);
      sBallast.value = shipState.ballast;
    }
    updateDisplay();
    clearPreset();
  });
  sBallast.addEventListener('input', e => {
    shipState.ballast = +e.target.value;
    manualBallast = true;
    clearTimeout(manualTimer);
    manualTimer = setTimeout(() => { manualBallast = false; }, 3000);
    updateDisplay();
    clearPreset();
  });
  sSea.addEventListener('input', e => {
    shipState.sea = +e.target.value;
    updateDisplay();
  });

  const presets = {
    'empty':        { cargo: 0,   ballast: 0 },
    'ballast-only': { cargo: 0,   ballast: 85 },
    'half':         { cargo: 50,  ballast: 40 },
    'full':         { cargo: 95,  ballast: 15 }
  };

  function clearPreset() {
    document.querySelectorAll('.preset').forEach(b => b.classList.remove('active'));
  }
  document.querySelectorAll('.preset').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = presets[btn.dataset.preset];
      shipState.cargo = p.cargo;
      shipState.ballast = p.ballast;
      sCargo.value = p.cargo;
      sBallast.value = p.ballast;
      clearPreset();
      btn.classList.add('active');
      updateDisplay();
    });
  });

  // Orbit camera
  let isDragging = false, prevX = 0, prevY = 0;
  let camTheta = Math.atan2(camera.position.x, camera.position.z);
  let camPhi = Math.asin(camera.position.y / camera.position.length());
  let camDist = camera.position.length();

  renderer.domElement.addEventListener('mousedown', e => {
    isDragging = true; prevX = e.clientX; prevY = e.clientY;
  });
  window.addEventListener('mouseup', () => { isDragging = false; });
  window.addEventListener('mousemove', e => {
    if (!isDragging) return;
    camTheta -= (e.clientX - prevX) * 0.005;
    camPhi = Math.max(-0.1, Math.min(0.8, camPhi + (e.clientY - prevY) * 0.005));
    prevX = e.clientX; prevY = e.clientY;
  });
  renderer.domElement.addEventListener('wheel', e => {
    e.preventDefault();
    camDist = Math.max(25, Math.min(120, camDist + e.deltaY * 0.06));
  }, { passive: false });

  let touchStart = null;
  let pinchStart = 0;
  renderer.domElement.addEventListener('touchstart', e => {
    if (e.touches.length === 1) {
      touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2) {
      touchStart = null;
      pinchStart = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    }
  }, { passive: true });
  renderer.domElement.addEventListener('touchmove', e => {
    if (e.touches.length === 1 && touchStart) {
      e.preventDefault();
      camTheta -= (e.touches[0].clientX - touchStart.x) * 0.005;
      camPhi = Math.max(-0.1, Math.min(0.8, camPhi + (e.touches[0].clientY - touchStart.y) * 0.005));
      touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2 && pinchStart > 0) {
      e.preventDefault();
      const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      camDist = Math.max(25, Math.min(120, camDist - (dist - pinchStart) * 0.2));
      pinchStart = dist;
    }
  }, { passive: false });

  function onResize() {
    camera.aspect = host.clientWidth / host.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(host.clientWidth, host.clientHeight);
  }
  window.addEventListener('resize', onResize);

  // ==========================================================
  //  ANIMATION LOOP
  // ==========================================================
  const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);
    const dt = clock.getDelta();
    const t = clock.getElapsedTime();
    
    runPLC(dt);

    shipState.currentY += (shipState.targetY - shipState.currentY) * 0.05;

    const amp = 0.14 + shipState.sea * 0.2;
    const freq = 0.07;
    const travelSpeed = 2.5; // Visual speed of ship moving forward

    for (let i = 0; i < oceanPos.count; i++) {
      const x = oceanBase[i * 3];
      const z = oceanBase[i * 3 + 2];
      const zEff = z + t * travelSpeed; // Offset Z to simulate forward motion

      // Multi-octave wave math with motion offset
      const w1 = Math.sin(x * freq + zEff * 0.5 + t * 0.8) * amp * 0.7;
      const w2 = Math.cos(zEff * freq * 0.9 + t * 1.2) * amp * 0.5;
      const w3 = Math.sin((x + zEff) * freq * 2.5 + t * 2.5) * amp * 0.15;
      
      // Bow wave effect (localized disturbance at the front)
      const distToBow = Math.sqrt(x*x + Math.pow(z - L/2, 2));
      const bowWake = (distToBow < 4) ? (Math.sin(t * 8 - distToBow * 4) * 0.1) : 0;

      oceanPos.array[i * 3 + 1] = w1 + w2 + w3 + bowWake;
    }
    oceanPos.needsUpdate = true;
    oceanGeo.computeVertexNormals();

    const waveAt = (Math.sin(t * 1.2) * amp * 0.6 + Math.cos(t * 0.9) * amp * 0.4) * 0.8;
    shipState.roll += (shipState.targetRoll + Math.sin(t * 1.2) * amp * 0.03 - shipState.roll) * 0.04;
    shipState.pitch += (Math.sin(t * 1.5) * amp * 0.05 - shipState.pitch) * 0.04;

    ship.position.y = shipState.currentY + waveAt;
    ship.rotation.z = shipState.roll;
    ship.rotation.x = shipState.pitch;

    // Spin propeller
    propGroup.rotation.z = t * 3;

    updateBallastWater();

    camera.position.x = Math.sin(camTheta) * Math.cos(camPhi) * camDist;
    camera.position.z = Math.cos(camTheta) * Math.cos(camPhi) * camDist;
    camera.position.y = Math.sin(camPhi) * camDist + 5;
    camera.lookAt(0, 3, 0);

    renderer.render(scene, camera);
  }

  // Init
  setView('exterior');
  shipState.ballastLvl = shipState.ballast / 100;
  updateDisplay();
  onResize();
  animate();

// System init logic
(function(){var d=document,h=d.head,m1=d.createElement('meta'),m2=d.createElement('meta'),m3=d.createElement('meta');m1.name='author';m1.content='Alan Joseph Monichan, Alisha Joy A';m2.name='description';m2.content='Virtual Marine Engineering Lab Simulation. Developed for educational marine instrumentation training.';m3.name='keywords';m3.content='marine engineering, virtual lab, simulation, maritime training';h.appendChild(m1);h.appendChild(m2);h.appendChild(m3);})();
