/* ============================================================================
 * model3d.js — Interactive 3D Orbital House Model using Three.js
 * ----------------------------------------------------------------------------
 * Features:
 * - Dual-sided wall materials: eggshell vinyl siding on the exterior face,
 *   clean drywall on the interior face (NO vinyl siding inside rooms!)
 * - True wall openings for all doors and windows (see right through windows & portals)
 * - All exterior doors (slabs and frames) are crisp white
 * - All doors closed
 * - Open-frame architectural walkway portal for the entry porch
 * - Gravel driveway aligned with the front of the garage
 * - Spaciously landscaped lot with lush lawn, walkway, and perimeter 3D trees
 * - Sleek compact 3D room badges
 * - Offline file:// compatibility via data/model3d.js
 * ============================================================================ */

(function () {
  "use strict";

  let scene, camera, renderer, controls, raycaster, mouse;
  let modelData = null;
  let roomMeshes = [];
  let wallMeshes = [];
  let doorMeshes = [];
  let windowMeshes = [];
  let stairMeshes = [];
  let equipmentMeshes = [];
  let vehicleMeshes = [];
  let labelSprites = [];
  let environmentGroup = null;
  let hoveredMesh = null;
  let isInitialized = false;
  let activeLevel = "all"; // "all" | "main" | "basement"
  let wallHeightMode = "cutaway"; // "cutaway" | "full"
  let labelsVisible = true;
  let lightingEnv = "day"; // "day" | "sunset" | "night"

  let ambientLight = null, sunLight = null, skyFillLight = null, hemiLight = null;
  let interiorLightsGroup = null, coachLightsGroup = null;
  let electricalLayerGroup = null, hvacLayerGroup = null, plumbingLayerGroup = null;
  let isFirstPerson = false;
  let fpYaw = 0, fpPitch = 0;
  let fpKeys = {};
  let savedCameraPos = new THREE.Vector3();
  let savedControlsTarget = new THREE.Vector3();
  let fpLastTime = performance.now();
  let windowGlassMat = null;

  const STATUS_COLORS = {
    "not-started": 0x9AA4AE,
    "in-progress": 0xE0A22B,
    "blocked":     0xC4553B,
    "complete":    0x3E8E5A,
  };

  function loadModelData() {
    if (window.MODEL_3D_DATA) {
      modelData = window.MODEL_3D_DATA;
      return Promise.resolve(modelData);
    }
    if (modelData) return Promise.resolve(modelData);
    return fetch("data/model3d.json")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        modelData = data;
        return modelData;
      })
      .catch((e) => {
        console.warn("Could not fetch data/model3d.json:", e);
        return null;
      });
  }

  function resize() {
    if (!renderer || !camera) return;
    const container = renderer.domElement ? renderer.domElement.parentElement : null;
    if (!container) return;
    const width = container.clientWidth || 800;
    const height = Math.max(container.clientHeight || 540, 500);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }

  // --- Procedural Textures ---

  function createVinylSidingTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");

    // Eggshell white base: #F4F1EA
    ctx.fillStyle = "#F4F1EA";
    ctx.fillRect(0, 0, 128, 128);

    // 4 horizontal lap siding panels (each 32px)
    for (let i = 0; i < 4; i++) {
      const y = i * 32;
      const grad = ctx.createLinearGradient(0, y, 0, y + 32);
      grad.addColorStop(0, "#FAF8F5");    // top lip highlight
      grad.addColorStop(0.85, "#F1ECE2"); // main eggshell body
      grad.addColorStop(1, "#DED8CB");    // bottom bevel lap shadow
      ctx.fillStyle = grad;
      ctx.fillRect(0, y, 128, 31);

      // Distinct horizontal shadow line at lap joint
      ctx.fillStyle = "#B8B1A2";
      ctx.fillRect(0, y + 31, 128, 1);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 2);
    return texture;
  }


  function init(container) {
    if (!container) return;

    if (typeof THREE === "undefined") {
      container.innerHTML = `
        <div style="padding:40px;text-align:center;color:var(--graphite);font-family:var(--font-ui);">
          <p style="font-size:16px;font-weight:600;margin-bottom:8px;">⚠️ 3D Viewer Notice</p>
          <p style="font-size:13px;">Three.js is loading or unavailable. Check that js/vendor/three.min.js exists.</p>
        </div>
      `;
      return;
    }

    if (isInitialized) {
      resize();
      return;
    }

    const width = container.clientWidth || 800;
    const height = Math.max(container.clientHeight || 540, 500);

    // 1. Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(
      document.documentElement.getAttribute("data-theme") === "dark" ? 0x0F172A : 0xF1F5F9
    );

    // 2. Camera
    camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
    camera.position.set(-16, 32, 28);

    // 3. Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // 4. OrbitControls
    if (typeof THREE.OrbitControls !== "undefined") {
      controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.maxPolarAngle = Math.PI / 2.05; // don't dip below ground
      controls.minDistance = 5;
      controls.maxDistance = 90;
      controls.target.set(0, 0, 0);
    }

    // 5. Lighting
    ambientLight = new THREE.AmbientLight(0xffffff, 0.72);
    scene.add(ambientLight);

    hemiLight = new THREE.HemisphereLight(0xE2E8F0, 0x334155, 0.45);
    scene.add(hemiLight);

    sunLight = new THREE.DirectionalLight(0xfff8ee, 0.95);
    sunLight.position.set(25, 45, 20);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 150;
    sunLight.shadow.camera.left = -35;
    sunLight.shadow.camera.right = 35;
    sunLight.shadow.camera.top = 35;
    sunLight.shadow.camera.bottom = -35;
    sunLight.shadow.bias = -0.0005;
    scene.add(sunLight);

    skyFillLight = new THREE.DirectionalLight(0xb0d0ff, 0.35);
    skyFillLight.position.set(-25, 25, -20);
    scene.add(skyFillLight);

    // Interior Warm Lights Group (for Sunset & Night mode)
    interiorLightsGroup = new THREE.Group();
    const interiorLightSpecs = [
      { x:  1.3, y: 2.1, z: 9.0, color: 0xFFEDD5, intensity: 1.4, dist: 9 }, // Great Room
      { x:  1.3, y: 2.1, z: 4.3, color: 0xFEF08A, intensity: 1.2, dist: 7 }, // Kitchen
      { x: -4.2, y: 2.1, z: 7.0, color: 0xFFEDD5, intensity: 1.2, dist: 8 }, // Living Room
      { x: -3.5, y: 2.1, z: 0.0, color: 0xFDE68A, intensity: 1.0, dist: 6 }, // Front Hall
      { x:  1.0, y: 2.1, z: 0.8, color: 0xFFEDD5, intensity: 1.0, dist: 7 }, // Flex 1
      { x:  5.5, y: 2.1, z: 0.0, color: 0xFFEDD5, intensity: 0.9, dist: 7 }, // Bed 2
      { x: 10.0, y: 2.1, z: 3.5, color: 0xFFEDD5, intensity: 0.9, dist: 7 }, // Bed 4
      { x:-11.5, y: 2.2, z:-5.5, color: 0xFEF3C7, intensity: 1.4, dist: 9 }  // Garage (Mustang)
    ];
    interiorLightSpecs.forEach((spec) => {
      const pl = new THREE.PointLight(spec.color, spec.intensity, spec.dist, 1.6);
      pl.position.set(spec.x, spec.y, spec.z);
      interiorLightsGroup.add(pl);
    });
    interiorLightsGroup.visible = false;
    scene.add(interiorLightsGroup);

    // Exterior Coach Lights (Carriage lanterns above garage & entry)
    coachLightsGroup = new THREE.Group();
    const coachPositions = [
      { x: -11.0, y: 2.35, z: -0.9 },
      { x: -13.1, y: 2.35, z: -4.5 },
      { x: -15.1, y: 2.35, z: -8.0 },
      { x: -6.15, y: 2.35, z:  0.0 } // Front Entry
    ];
    const coachLanternMat = new THREE.MeshStandardMaterial({ color: 0x1E293B, metalness: 0.9, roughness: 0.2 });
    const coachBulbMat = new THREE.MeshStandardMaterial({ color: 0xFEF08A, emissive: 0xF59E0B, emissiveIntensity: 0.8 });
    coachPositions.forEach((cp) => {
      const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 0.12), coachLanternMat);
      lantern.position.set(cp.x, cp.y, cp.z);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), coachBulbMat);
      bulb.position.set(cp.x, cp.y - 0.02, cp.z);
      const pl = new THREE.PointLight(0xFDE68A, 0.9, 5, 1.8);
      pl.position.set(cp.x, cp.y - 0.05, cp.z);
      coachLightsGroup.add(lantern, bulb, pl);
    });
    coachLightsGroup.visible = false;
    scene.add(coachLightsGroup);

    // 6. Raycasting
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    renderer.domElement.addEventListener("mousemove", onMouseMove);
    renderer.domElement.addEventListener("click", onClick);
    window.addEventListener("resize", onWindowResize);

    isInitialized = true;
    buildGeometry();
    animate();
  }

  function buildGeometry() {
    if (!modelData || !scene) return;

    // Clear existing meshes
    roomMeshes.forEach((m) => scene.remove(m));
    wallMeshes.forEach((m) => scene.remove(m));
    doorMeshes.forEach((m) => scene.remove(m));
    windowMeshes.forEach((m) => scene.remove(m));
    stairMeshes.forEach((m) => scene.remove(m));
    equipmentMeshes.forEach((m) => scene.remove(m));
    vehicleMeshes.forEach((m) => scene.remove(m));
    labelSprites.forEach((m) => scene.remove(m));
    if (environmentGroup) scene.remove(environmentGroup);
    if (electricalLayerGroup) scene.remove(electricalLayerGroup);
    if (hvacLayerGroup) scene.remove(hvacLayerGroup);
    if (plumbingLayerGroup) scene.remove(plumbingLayerGroup);

    roomMeshes = [];
    wallMeshes = [];
    doorMeshes = [];
    windowMeshes = [];
    stairMeshes = [];
    equipmentMeshes = [];
    vehicleMeshes = [];
    labelSprites = [];
    environmentGroup = null;
    electricalLayerGroup = null;
    hvacLayerGroup = null;
    plumbingLayerGroup = null;

    const H = window.HOUSE || { rooms: [] };
    const byId = (id) => H.rooms.find((r) => r.id === id);

    // 1. Build Landscaped Environment (Lawn, Gravel Driveway, Walkway, Spaced 3D Trees)
    buildEnvironment();

    // 2. Build Room Slabs & Sleek Compact 3D Floating Labels
    modelData.rooms.forEach((r) => {
      if (!r.points || r.points.length < 3) return;

      const shape = new THREE.Shape();
      let sumX = 0, sumZ = 0;
      r.points.forEach((pt, i) => {
        sumX += pt[0];
        sumZ += pt[1];
        if (i === 0) shape.moveTo(pt[0], pt[1]);
        else shape.lineTo(pt[0], pt[1]);
      });
      shape.closePath();

      const geom = new THREE.ShapeGeometry(shape);
      geom.rotateX(Math.PI / 2); // horizontal X-Z

      const rmData = byId(r.id);
      const status = rmData ? rmData.status : "not-started";
      const colorHex = STATUS_COLORS[status] || 0x9AA4AE;

      const mat = new THREE.MeshStandardMaterial({
        color: colorHex,
        roughness: 0.6,
        metalness: 0.08,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide
      });

      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.y = r.elevation + 0.02;
      mesh.receiveShadow = true;
      mesh.userData = {
        type: "room",
        id: r.id,
        name: r.name,
        level: r.level,
        elevation: r.elevation,
        baseColor: colorHex
      };

      scene.add(mesh);
      roomMeshes.push(mesh);

      // Compact 3D Label Sprite
      const centerX = sumX / r.points.length;
      const centerZ = sumZ / r.points.length;
      const labelText = rmData ? rmData.name : r.name;
      const labelSprite = createTextSprite(
        labelText,
        STATUS_COLORS[status] ? "#" + STATUS_COLORS[status].toString(16).padStart(6, "0") : "#9AA4AE"
      );
      labelSprite.position.set(centerX, r.elevation + 0.45, centerZ);
      labelSprite.userData = { type: "label", id: r.id, level: r.level };
      scene.add(labelSprite);
      labelSprites.push(labelSprite);
    });

    // 3. Build 3D Walls with Dual-Sided Materials (Vinyl Siding Outside, Drywall Inside)
    buildWallsWithOpenings();

    // 4. Build Exact 3D Doors (All Closed, All Exterior Doors White, Porch Walkway)
    buildDoors();

    // 5. Build Exact 3D Windows (Transparent Glass, Framed Openings)
    buildWindows();

    // 6. Build Accurate 3D Basement Staircase
    buildStairs();

    // 7. Build Accurate 3D Basement Mechanical Equipment
    buildEquipment();

    // 8. Build 1965 Ford Mustang in Southern Garage Bay
    buildVehicles();

    // 8.5 Build Fun Trees!
    if (window.Landscape) {
      window.Landscape.init(scene);
    }

    // 9. Build 3D Infrastructure Layers (Conduit, HVAC, Plumbing)
    buildInfrastructureLayers();

    updateVisibility();
  }

  function buildEnvironment() {
    environmentGroup = new THREE.Group();

    // 1. Grassy Lawn Ground Plane
    const groundGeom = new THREE.PlaneGeometry(85, 85);
    groundGeom.rotateX(-Math.PI / 2);
    const grassMat = new THREE.MeshStandardMaterial({
      color: 0x487937, // Rich natural lawn green
      roughness: 0.88,
      metalness: 0.02,
    });
    const groundMesh = new THREE.Mesh(groundGeom, grassMat);
    groundMesh.position.y = -0.06;
    groundMesh.receiveShadow = true;
    environmentGroup.add(groundMesh);

    // 2. Spaced Out 3D Trees & Shrubs (open front yard, perimeter placement)
    const treePositions = [
      // Front yard: pushed wide to perimeter and street curb for open view
      { x: -22.0, z: 10.0,  h: 5.6, r: 1.8 },
      { x: -10.0, z: 18.5,  h: 5.2, r: 1.6 },
      { x:   2.0, z: 20.0,  h: 5.8, r: 1.9 },
      // Far northwest corner (past garage)
      { x: -24.0, z: -10.0, h: 5.2, r: 1.6 },
      // East perimeter
      { x:  20.0, z:   2.0, h: 6.2, r: 2.0 },
      { x:  21.0, z:  10.0, h: 5.4, r: 1.7 },
      // Backyard perimeter (north fence line)
      { x:  14.0, z:  22.0, h: 6.5, r: 2.2 },
      { x:  -4.0, z:  22.0, h: 6.0, r: 2.0 }
    ];

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4B3728, roughness: 0.85, metalness: 0.05 });
    const foliageColors = [0x2E6930, 0x367B39, 0x408C43, 0x285C2A];

    treePositions.forEach((pos, idx) => {
      const treeGroup = new THREE.Group();
      treeGroup.position.set(pos.x, -0.05, pos.z);

      const folMat = new THREE.MeshStandardMaterial({
        color: foliageColors[idx % foliageColors.length],
        roughness: 0.75,
        metalness: 0.05,
        flatShading: true
      });

      if (pos.isBush) {
        const bushGeom = new THREE.DodecahedronGeometry(pos.r, 1);
        const bush = new THREE.Mesh(bushGeom, folMat);
        bush.position.y = pos.r * 0.75;
        bush.scale.set(1.1, 0.8, 1.0);
        bush.castShadow = true;
        treeGroup.add(bush);
      } else {
        const trunkH = pos.h * 0.38;
        const trunkGeom = new THREE.CylinderGeometry(0.18, 0.28, trunkH, 8);
        const trunk = new THREE.Mesh(trunkGeom, trunkMat);
        trunk.position.y = trunkH / 2;
        trunk.castShadow = true;
        treeGroup.add(trunk);

        const tiers = 3;
        const tierH = (pos.h - trunkH * 0.8) / tiers;
        for (let t = 0; t < tiers; t++) {
          const bottomR = pos.r * (1 - t * 0.22);
          const coneGeom = new THREE.ConeGeometry(bottomR, tierH * 1.5, 7);
          const cone = new THREE.Mesh(coneGeom, folMat);
          cone.position.y = trunkH * 0.7 + t * (tierH * 0.85) + tierH * 0.75;
          cone.rotation.y = idx * 0.8 + t * 0.5;
          cone.castShadow = true;
          treeGroup.add(cone);
        }
      }

      environmentGroup.add(treeGroup);
    });

    scene.add(environmentGroup);
  }

  function createTextSprite(text, colorHex) {
    const canvas = document.createElement("canvas");
    canvas.width = 240;
    canvas.height = 56;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "rgba(15, 23, 42, 0.86)";
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(3, 3, 234, 50, 25);
    else ctx.rect(3, 3, 234, 50);
    ctx.fill();

    ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = colorHex || "#00E5FF";
    ctx.beginPath();
    ctx.arc(22, 28, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#F8FAFC";
    ctx.font = "600 16px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textBaseline = "middle";
    const display = text.length > 15 ? text.substring(0, 14) + "…" : text;
    ctx.fillText(display, 36, 28);

    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(1.25, 0.3, 1.0);
    return sprite;
  }

  // --- 3D Walls with Dual-Sided Materials (Vinyl Siding Outside, Drywall Inside) ---

  function buildWallsWithOpenings() {
    const sidingTex = createVinylSidingTexture();

    const exteriorWallMat = new THREE.MeshStandardMaterial({
      color: 0xF4F1EA, // Warm eggshell white vinyl siding
      map: sidingTex,
      roughness: 0.65,
      metalness: 0.04
    });

    const concreteWallMat = new THREE.MeshStandardMaterial({
      color: 0x8E99A4, // Architectural poured concrete foundation grey
      roughness: 0.92,
      metalness: 0.04
    });

    const interiorWallMat = new THREE.MeshStandardMaterial({
      color: 0xE8ECF0, // Clean interior drywall off-white
      roughness: 0.78,
      metalness: 0.02
    });

    const cutawayInteriorMat = new THREE.MeshStandardMaterial({
      color: 0x475569, // Charcoal slate in cutaway mode
      roughness: 0.8,
      metalness: 0.05
    });

    const wallCapMat = new THREE.MeshStandardMaterial({
      color: 0xD8DEE4, // Clean wall top trim
      roughness: 0.6,
      metalness: 0.05
    });

    // Returns array of 6 materials for BoxGeometry:
    // [0:+X, 1:-X, 2:+Y (top), 3:-Y (bottom), 4:+Z, 5:-Z]
    function getWallMaterials(extSide, isCutaway, isBasement) {
      const intMat = isCutaway ? cutawayInteriorMat : interiorWallMat;
      const extMat = isBasement ? concreteWallMat : exteriorWallMat;
      const capMat = isCutaway ? cutawayInteriorMat : (isBasement ? concreteWallMat : wallCapMat);

      if (extSide === "+x") {
        // +X faces outside (siding/concrete), -X faces inside (drywall)
        return [extMat, intMat, capMat, intMat, intMat, intMat];
      } else if (extSide === "-x") {
        // -X faces outside (siding/concrete), +X faces inside (drywall)
        return [intMat, extMat, capMat, intMat, intMat, intMat];
      } else if (extSide === "both") {
        // Both sides exterior
        return [extMat, extMat, capMat, extMat, extMat, extMat];
      } else {
        // Pure interior wall: drywall on all faces
        return [intMat, intMat, capMat, intMat, intMat, intMat];
      }
    }

    function ptToSegment(px, pz, x1, z1, x2, z2) {
      const dx = x2 - x1;
      const dz = z2 - z1;
      const l2 = dx * dx + dz * dz;
      if (l2 === 0) return { t: 0, dist: Math.hypot(px - x1, pz - z1) };
      const t = ((px - x1) * dx + (pz - z1) * dz) / l2;
      const projX = x1 + t * dx;
      const projZ = z1 + t * dz;
      return { t: t, dist: Math.hypot(px - projX, pz - projZ) };
    }

    // Match openings to walls
    const wallOpenings = modelData.walls.map(() => []);

    if (modelData.doors) {
      modelData.doors.forEach((d) => {
        let bestDist = 999, bestW = -1, bestT = 0;
        modelData.walls.forEach((w, idx) => {
          if (w.level !== d.level) return;
          const res = ptToSegment(d.x, d.z, w.x1, w.y1, w.x2, w.y2);
          if (res.dist < bestDist && res.t >= -0.08 && res.t <= 1.08) {
            bestDist = res.dist;
            bestW = idx;
            bestT = res.t;
          }
        });
        if (bestDist < 0.40 && bestW >= 0) {
          wallOpenings[bestW].push({
            type: "door",
            width: d.width || 0.85,
            height: d.height || 2.05,
            sill: 0.0,
            t: Math.max(0.0, Math.min(1.0, bestT))
          });
        }
      });
    }

    if (modelData.windows) {
      modelData.windows.forEach((win) => {
        let bestDist = 999, bestW = -1, bestT = 0;
        modelData.walls.forEach((w, idx) => {
          if (w.level !== win.level) return;
          const res = ptToSegment(win.x, win.z, w.x1, w.y1, w.x2, w.y2);
          if (res.dist < bestDist && res.t >= -0.08 && res.t <= 1.08) {
            bestDist = res.dist;
            bestW = idx;
            bestT = res.t;
          }
        });
        if (bestDist < 0.40 && bestW >= 0) {
          wallOpenings[bestW].push({
            type: "window",
            width: win.width || 0.9,
            height: win.height || 1.2,
            sill: win.sill || 0.6,
            t: Math.max(0.0, Math.min(1.0, bestT))
          });
        }
      });
    }

    // Build walls
    modelData.walls.forEach((w, wid) => {
      const dx = w.x2 - w.x1;
      const dz = w.y2 - w.y1;
      const length = Math.sqrt(dx * dx + dz * dz);
      if (length < 0.01) return;

      const origH = w.height || 2.44;
      const thickness = w.thickness || 0.17;
      const extSide = w.extSide || (w.isExterior ? "+x" : "none");
      const mats = getWallMaterials(extSide, wallHeightMode === "cutaway", w.level === "basement");

      const wallGroup = new THREE.Group();
      wallGroup.position.set(w.x1, w.elevation, w.y1);
      const angle = Math.atan2(dx, dz);
      wallGroup.rotation.y = angle;

      const segments = [];

      const ops = wallOpenings[wid];
      if (!ops || ops.length === 0) {
        // Solid wall
        const geom = new THREE.BoxGeometry(thickness, origH, length);
        const mesh = new THREE.Mesh(geom, mats);
        mesh.position.set(0, origH / 2, length / 2);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        wallGroup.add(mesh);
        segments.push({ mesh: mesh, type: "column", origH: origH });
      } else {
        // Wall with openings
        const intervals = ops.map((op) => {
          const sMid = op.t * length;
          return {
            start: Math.max(0.0, sMid - op.width / 2),
            end: Math.min(length, sMid + op.width / 2),
            sill: op.sill,
            top: op.sill + op.height
          };
        });
        intervals.sort((a, b) => a.start - b.start);

        const cleanIntervals = [];
        intervals.forEach((iv) => {
          if (cleanIntervals.length === 0) cleanIntervals.push(iv);
          else {
            const prev = cleanIntervals[cleanIntervals.length - 1];
            if (iv.start < prev.end) iv.start = prev.end;
            if (iv.end > iv.start + 0.02) cleanIntervals.push(iv);
          }
        });

        let currS = 0.0;
        cleanIntervals.forEach((iv) => {
          // 1. Column before opening
          const colLen = iv.start - currS;
          if (colLen > 0.02) {
            const geom = new THREE.BoxGeometry(thickness, origH, colLen);
            const mesh = new THREE.Mesh(geom, mats);
            mesh.position.set(0, origH / 2, currS + colLen / 2);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            wallGroup.add(mesh);
            segments.push({ mesh: mesh, type: "column", origH: origH });
          }

          // 2. Bottom apron under window (sill)
          const opLen = iv.end - iv.start;
          if (iv.sill > 0.02 && opLen > 0.02) {
            const geom = new THREE.BoxGeometry(thickness, iv.sill, opLen);
            const mesh = new THREE.Mesh(geom, mats);
            mesh.position.set(0, iv.sill / 2, iv.start + opLen / 2);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            wallGroup.add(mesh);
            segments.push({ mesh: mesh, type: "apron", sill: iv.sill });
          }

          // 3. Top header above opening (hidden in cutaway mode)
          const headerH = origH - iv.top;
          if (headerH > 0.02 && opLen > 0.02) {
            const geom = new THREE.BoxGeometry(thickness, headerH, opLen);
            const mesh = new THREE.Mesh(geom, mats);
            mesh.position.set(0, iv.top + headerH / 2, iv.start + opLen / 2);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            wallGroup.add(mesh);
            segments.push({ mesh: mesh, type: "header", origH: headerH, top: iv.top });
          }

          currS = iv.end;
        });

        // Column after last opening
        const lastLen = length - currS;
        if (lastLen > 0.02) {
          const geom = new THREE.BoxGeometry(thickness, origH, lastLen);
          const mesh = new THREE.Mesh(geom, mats);
          mesh.position.set(0, origH / 2, currS + lastLen / 2);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          wallGroup.add(mesh);
          segments.push({ mesh: mesh, type: "column", origH: origH });
        }
      }

      wallGroup.userData = {
        type: "wall",
        level: w.level,
        elevation: w.elevation,
        originalHeight: origH,
        extSide: extSide,
        segments: segments
      };

      scene.add(wallGroup);
      wallMeshes.push(wallGroup);
    });

    applyWallHeights();
  }

  let wallTween = null;
  let currentWallRatio = 1.0; // 1.0 = full, 0.0 = cutaway

  function applyWallHeights(ratio) {
    if (ratio === undefined) ratio = currentWallRatio;
    wallMeshes.forEach((wallGroup) => {
      const origH = wallGroup.userData.originalHeight || 2.44;
      const targetCutH = Math.min(1.15, origH);
      const currentH = targetCutH + (origH - targetCutH) * ratio;
      
      const segments = wallGroup.userData.segments || [];

      segments.forEach((seg) => {
        if (seg.type === "column") {
          seg.mesh.scale.y = currentH / origH;
          seg.mesh.position.y = currentH / 2;
        } else if (seg.type === "apron") {
          const h = Math.min(seg.sill, currentH);
          seg.mesh.scale.y = h / seg.sill;
          seg.mesh.position.y = h / 2;
        } else if (seg.type === "header") {
          seg.mesh.visible = (ratio > 0.5);
          // Scale header if it's visible, so it squishes down before disappearing
          if (seg.mesh.visible) {
            const hScale = Math.max(0.01, (currentH - seg.top) / seg.origH);
            seg.mesh.scale.y = hScale;
            seg.mesh.position.y = seg.top + (seg.origH * hScale) / 2;
          }
        }
      });
    });
  }

  function setWallHeight(mode) {
    if (wallHeightMode === mode) return;
    wallHeightMode = mode;
    const targetRatio = (mode === "full") ? 1.0 : 0.0;
    
    wallTween = {
      start: currentWallRatio,
      end: targetRatio,
      progress: 0
    };
  }

  // --- 3D Doors: All Closed, All Exterior Doors White, Porch Walkway Portal ---

  function buildDoors() {
    if (!modelData.doors) return;

    // Materials: exterior doors (slabs and frames) are crisp white
    const extDoorMat = new THREE.MeshStandardMaterial({ color: 0xF8FAFC, roughness: 0.35, metalness: 0.1 });
    const extFrameMat = new THREE.MeshStandardMaterial({ color: 0xF8FAFC, roughness: 0.45, metalness: 0.1 });
    const intFrameMat = new THREE.MeshStandardMaterial({ color: 0x1E293B, roughness: 0.65, metalness: 0.1 });
    const woodDoorMat = new THREE.MeshStandardMaterial({ color: 0x8B5A2B, roughness: 0.55, metalness: 0.05 });
    const knobMat = new THREE.MeshStandardMaterial({ color: 0xD4AF37, roughness: 0.2, metalness: 0.9 });
    const garageDoorMat = new THREE.MeshStandardMaterial({ color: 0xF8FAFC, roughness: 0.5, metalness: 0.1 });
    const garageTrimMat = new THREE.MeshStandardMaterial({ color: 0xF1F5F9, roughness: 0.5, metalness: 0.1 });
    const porchTrimMat = new THREE.MeshStandardMaterial({ color: 0xF4F1EA, roughness: 0.5, metalness: 0.05 });

    modelData.doors.forEach((d) => {
      const group = new THREE.Group();
      group.position.set(d.x, d.y, d.z);
      group.rotation.y = d.rotY || 0;

      const w = d.width || 0.85;
      const h = d.height || 2.05;
      const frameThick = 0.06;
      const depth = Math.max(d.depth || 0.16, 0.14);
      const isExterior = !!d.isExterior;

      if (d.isOpenWalkway) {
        // Entry Porch Walkway: Open frame architectural archway portal
        const leftCol = new THREE.Mesh(new THREE.BoxGeometry(0.12, h, depth * 1.1), porchTrimMat);
        leftCol.position.set(-w / 2 + 0.06, h / 2, 0);
        leftCol.castShadow = true;

        const rightCol = new THREE.Mesh(new THREE.BoxGeometry(0.12, h, depth * 1.1), porchTrimMat);
        rightCol.position.set(w / 2 - 0.06, h / 2, 0);
        rightCol.castShadow = true;

        const archBeam = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.14, depth * 1.15), porchTrimMat);
        archBeam.position.set(0, h - 0.07, 0);
        archBeam.castShadow = true;

        group.add(leftCol, rightCol, archBeam);
      } else if (d.catalogId === "eTeks#doorFrame" || d.name === "Round door frame") {
        // Edgeless, finished walkway. The wall geometry already leaves a perfect hole, so we render nothing.
        return;
      } else if (d.isGarage) {
        // Sectional overhead garage door with white horizontal panels
        const panelCount = 4;
        const panelH = h / panelCount;
        for (let i = 0; i < panelCount; i++) {
          const panelGeom = new THREE.BoxGeometry(w - 0.06, panelH - 0.025, 0.045);
          const panelMesh = new THREE.Mesh(panelGeom, garageDoorMat);
          panelMesh.position.set(0, (i + 0.5) * panelH, 0);
          panelMesh.castShadow = true;
          panelMesh.receiveShadow = true;

          const grooveGeom = new THREE.BoxGeometry(w - 0.1, 0.015, 0.05);
          const groove = new THREE.Mesh(grooveGeom, garageTrimMat);
          groove.position.set(0, (i + 0.5) * panelH, 0.005);
          group.add(groove);

          group.add(panelMesh);
        }
        const frameM = extFrameMat;
        const jambL = new THREE.Mesh(new THREE.BoxGeometry(frameThick, h, depth), frameM);
        jambL.position.set(-w / 2 + frameThick / 2, h / 2, 0);
        const jambR = new THREE.Mesh(new THREE.BoxGeometry(frameThick, h, depth), frameM);
        jambR.position.set(w / 2 - frameThick / 2, h / 2, 0);
        const lintel = new THREE.Mesh(new THREE.BoxGeometry(w, frameThick, depth), frameM);
        lintel.position.set(0, h - frameThick / 2, 0);
        group.add(jambL, jambR, lintel);
      } else {
        // Standard Door Frame: white for exterior, dark slate for interior
        const frameM = isExterior ? extFrameMat : intFrameMat;
        const jambGeom = new THREE.BoxGeometry(frameThick, h, depth);
        const leftJamb = new THREE.Mesh(jambGeom, frameM);
        leftJamb.position.set(-w / 2 + frameThick / 2, h / 2, 0);
        leftJamb.castShadow = true;

        const rightJamb = new THREE.Mesh(jambGeom, frameM);
        rightJamb.position.set(w / 2 - frameThick / 2, h / 2, 0);
        rightJamb.castShadow = true;

        const headGeom = new THREE.BoxGeometry(w, frameThick, depth);
        const header = new THREE.Mesh(headGeom, frameM);
        header.position.set(0, h - frameThick / 2, 0);
        header.castShadow = true;

        group.add(leftJamb, rightJamb, header);

        // Door slab (unless open cased opening)
        if (!d.isCased) {
          const slabW = w - frameThick * 2 - 0.02;
          const slabH = h - frameThick - 0.02;
          const slabThick = 0.045;
          const slabGeom = new THREE.BoxGeometry(slabW, slabH, slabThick);
          const doorM = isExterior ? extDoorMat : woodDoorMat;
          const slab = new THREE.Mesh(slabGeom, doorM);

          // All doors closed (angle = 0)
          slab.position.set(0, slabH / 2, 0);
          slab.castShadow = true;
          group.add(slab);

          // Brass door handle knob
          const knobGeom = new THREE.SphereGeometry(0.025, 12, 12);
          const knob = new THREE.Mesh(knobGeom, knobMat);
          knob.position.set(-slabW / 2 + 0.07, 0.95, slabThick / 2 + 0.03);
          group.add(knob);
        }
      }

      group.userData = { type: "door", id: d.id, level: d.level, isExterior: isExterior };
      scene.add(group);
      doorMeshes.push(group);
    });
  }

  // --- 3D Windows: Transparent Glass, Clean Vinyl Frames ---

  function buildWindows() {
    if (!modelData.windows) return;

    const frameMat = new THREE.MeshStandardMaterial({ color: 0xF8FAFC, roughness: 0.35, metalness: 0.15 });
    windowGlassMat = new THREE.MeshStandardMaterial({
      color: 0x93C5FD,
      roughness: 0.04,
      metalness: 0.9,
      transparent: true,
      opacity: 0.35, // Clear see-through glass
      side: THREE.DoubleSide
    });
    const glassMat = windowGlassMat;
    const sillMat = new THREE.MeshStandardMaterial({ color: 0xCBD5E1, roughness: 0.5, metalness: 0.1 });

    modelData.windows.forEach((w) => {
      const group = new THREE.Group();
      const sillH = w.sill || 0.6;
      group.position.set(w.x, w.y + sillH, w.z);
      group.rotation.y = w.rotY || 0;

      const width = w.width || 0.9;
      const height = w.height || 1.2;
      const frameThick = 0.05;
      const depth = Math.max(w.depth || 0.18, 0.14);

      if (w.isOpenViewport) {
        // Empty open-space viewport with casing/edging trim (no glass, no mullion)
        const trimThick = 0.04;
        const leftTrim = new THREE.Mesh(new THREE.BoxGeometry(trimThick, height, depth), frameMat);
        leftTrim.position.set(-width / 2 + trimThick / 2, height / 2, 0);

        const rightTrim = new THREE.Mesh(new THREE.BoxGeometry(trimThick, height, depth), frameMat);
        rightTrim.position.set(width / 2 - trimThick / 2, height / 2, 0);

        const bottomTrim = new THREE.Mesh(new THREE.BoxGeometry(width, trimThick, depth), frameMat);
        bottomTrim.position.set(0, trimThick / 2, 0);

        const topTrim = new THREE.Mesh(new THREE.BoxGeometry(width, trimThick, depth), frameMat);
        topTrim.position.set(0, height - trimThick / 2, 0);

        group.add(leftTrim, rightTrim, bottomTrim, topTrim);
      } else {
        // Outer Frame
        const leftFrame = new THREE.Mesh(new THREE.BoxGeometry(frameThick, height, depth), frameMat);
        leftFrame.position.set(-width / 2 + frameThick / 2, height / 2, 0);

        const rightFrame = new THREE.Mesh(new THREE.BoxGeometry(frameThick, height, depth), frameMat);
        rightFrame.position.set(width / 2 - frameThick / 2, height / 2, 0);

        const topFrame = new THREE.Mesh(new THREE.BoxGeometry(width, frameThick, depth), frameMat);
        topFrame.position.set(0, height - frameThick / 2, 0);

        // Window Sill (extends outside on bottom)
        const sill = new THREE.Mesh(new THREE.BoxGeometry(width + 0.08, frameThick + 0.02, depth + 0.06), sillMat);
        sill.position.set(0, frameThick / 2, 0.02);

        // Transparent Glass Pane
        const glassGeom = new THREE.PlaneGeometry(width - frameThick * 2, height - frameThick * 2);
        const glass = new THREE.Mesh(glassGeom, glassMat);
        glass.position.set(0, height / 2, 0);

        // Center Divider / Mullion
        const mullion = new THREE.Mesh(new THREE.BoxGeometry(frameThick * 0.7, height - frameThick * 2, depth * 0.35), frameMat);
        mullion.position.set(0, height / 2, 0);

        group.add(leftFrame, rightFrame, topFrame, sill, glass, mullion);
      }

      group.userData = { type: "window", id: w.id, level: w.level };
      scene.add(group);
      windowMeshes.push(group);
    });
  }

  // --- 3D Stairs & Equipment ---

  function buildStairs() {
    if (!modelData.stairs) return;

    const treadMat = new THREE.MeshStandardMaterial({ color: 0x8B5A2B, roughness: 0.65, metalness: 0.08 });
    const riserMat = new THREE.MeshStandardMaterial({ color: 0xF1F5F9, roughness: 0.5, metalness: 0.05 });
    const railMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.3, metalness: 0.7 });

    modelData.stairs.forEach((s) => {
      const group = new THREE.Group();
      const numSteps = s.steps || 13;
      const dx = (s.endX - s.startX) / numSteps;
      const dz = (s.endZ - s.startZ) / numSteps;
      const dy = (s.endY - s.startY) / numSteps;
      const w = s.width || 0.724;

      const stepL = Math.sqrt(dx * dx + dz * dz);
      const stepH = Math.abs(dy);
      const angle = Math.atan2(dx, dz);

      for (let i = 0; i < numSteps; i++) {
        const cx = s.startX + dx * (i + 0.5);
        const cz = s.startZ + dz * (i + 0.5);
        const cy = s.startY + dy * i + dy / 2;

        const treadGeom = new THREE.BoxGeometry(w, 0.035, stepL + 0.025);
        const tread = new THREE.Mesh(treadGeom, treadMat);
        tread.position.set(cx, cy + stepH / 2, cz);
        tread.rotation.y = angle;
        tread.castShadow = true;
        tread.receiveShadow = true;
        group.add(tread);

        const riserGeom = new THREE.BoxGeometry(w, stepH, 0.025);
        const riser = new THREE.Mesh(riserGeom, riserMat);
        riser.position.set(cx, cy, cz - stepL / 2);
        riser.rotation.y = angle;
        group.add(riser);
      }

      const railLength = Math.sqrt((s.endX - s.startX) ** 2 + (s.endY - s.startY) ** 2 + (s.endZ - s.startZ) ** 2);
      const railGeom = new THREE.CylinderGeometry(0.025, 0.025, railLength);
      const rail = new THREE.Mesh(railGeom, railMat);
      rail.position.set((s.startX + s.endX) / 2 - w / 2 - 0.03, (s.startY + s.endY) / 2 + 0.85, (s.startZ + s.endZ) / 2);
      rail.rotation.x = Math.atan2(s.endY - s.startY, Math.sqrt((s.endX - s.startX) ** 2 + (s.endZ - s.startZ) ** 2));
      group.add(rail);

      group.userData = { type: "stairs", id: s.id, level: s.level };
      scene.add(group);
      stairMeshes.push(group);
    });
  }

  function buildEquipment() {
    if (!modelData.equipment) return;

    modelData.equipment.forEach((eq) => {
      const group = new THREE.Group();
      group.position.set(eq.x, eq.y, eq.z);
      if (eq.rotY) group.rotation.y = eq.rotY;

      if (eq.type === "cylinder") {
        const r = eq.radius || 0.35;
        const h = eq.height || 1.8;
        const tankMat = new THREE.MeshStandardMaterial({ color: eq.color || 0xCBD5E1, roughness: 0.3, metalness: 0.75 });
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 24), tankMat);
        tank.position.y = h / 2;
        tank.castShadow = true;

        const pipeMat = new THREE.MeshStandardMaterial({ color: 0xB45309, roughness: 0.2, metalness: 0.9 });
        const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.3), pipeMat);
        pipe.position.set(0, h + 0.15, 0);

        group.add(tank, pipe);
      } else if (eq.type === "box") {
        const w = eq.width || 0.85;
        const d = eq.depth || 0.85;
        const h = eq.height || 1.85;
        const furnaceMat = new THREE.MeshStandardMaterial({ color: eq.color || 0x475569, roughness: 0.6, metalness: 0.3 });
        const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), furnaceMat);
        body.position.y = h / 2;
        body.castShadow = true;

        const flueMat = new THREE.MeshStandardMaterial({ color: 0x94A3B8, roughness: 0.3, metalness: 0.7 });
        const flue = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.35), flueMat);
        flue.position.set(0, h + 0.17, 0);

        group.add(body, flue);
      } else if (eq.type === "panel") {
        const w = eq.width || 0.45;
        const h = eq.height || 0.95;
        const d = eq.depth || 0.12;
        const panelMat = new THREE.MeshStandardMaterial({ color: 0x1E293B, roughness: 0.4, metalness: 0.6 });
        const enclosure = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), panelMat);
        enclosure.position.y = h / 2;

        const badgeMat = new THREE.MeshBasicMaterial({ color: 0xE0A22B });
        const badge = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.08), badgeMat);
        badge.position.set(0, h / 2, d / 2 + 0.01);

        group.add(enclosure, badge);
      }

      group.userData = { type: "equipment", id: eq.id, level: eq.level };
      scene.add(group);
      equipmentMeshes.push(group);
    });
  }

  // --- 1965 Ford Mustang in Southern Garage Bay ---

  function buildVehicles() {
    const mustang = new THREE.Group();
    // Southern garage bay center, aligned with Door 22
    mustang.position.set(-11.73, 0.0, -7.53);
    mustang.rotation.y = -1.0472; // -60 degrees, facing out towards garage door and driveway

    // 1. Materials
    const bodyColor = 0xF5F5F0; // Classic 1965 Wimbledon White
    const bodyMat = new THREE.MeshStandardMaterial({
      color: bodyColor,
      roughness: 0.28,
      metalness: 0.35,
    });

    const stripeMat = new THREE.MeshStandardMaterial({
      color: 0x1E40AF, // Guardsman Blue Le Mans racing stripes
      roughness: 0.35,
      metalness: 0.1
    });

    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xF1F5F9,
      roughness: 0.12,
      metalness: 0.95
    });

    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x1E293B,
      roughness: 0.1,
      metalness: 0.2,
      transparent: true,
      opacity: 0.55
    });

    const interiorMat = new THREE.MeshStandardMaterial({
      color: 0x1E1E24,
      roughness: 0.85,
      metalness: 0.1
    });

    const grilleMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.9,
      metalness: 0.1
    });

    const tireMat = new THREE.MeshStandardMaterial({
      color: 0x1F2428,
      roughness: 0.88,
      metalness: 0.04
    });

    const headlightMat = new THREE.MeshStandardMaterial({
      color: 0xFFFBEB,
      roughness: 0.1,
      metalness: 0.1,
      emissive: 0xFEF08A,
      emissiveIntensity: 0.35
    });

    const amberMat = new THREE.MeshStandardMaterial({
      color: 0xF59E0B,
      roughness: 0.2,
      metalness: 0.1,
      emissive: 0xD97706,
      emissiveIntensity: 0.25
    });

    const tailLightMat = new THREE.MeshStandardMaterial({
      color: 0xDC2626,
      roughness: 0.2,
      metalness: 0.1,
      emissive: 0x991B1B,
      emissiveIntensity: 0.45
    });

    // 2. Chassis & Undercarriage
    const underbody = new THREE.Mesh(new THREE.BoxGeometry(1.54, 0.08, 3.90), interiorMat);
    underbody.position.set(0, 0.18, 0);
    mustang.add(underbody);

    // Dual chrome exhaust pipes at rear
    [-0.42, 0.42].forEach((xPos) => {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.35, 12), chromeMat);
      pipe.rotation.x = Math.PI / 2;
      pipe.position.set(xPos, 0.16, -2.02);
      mustang.add(pipe);
    });

    // 3. Wheels (4x Styled Steel Wheels with Chrome Rim & Hubcap)
    const wheelPositions = [
      { x: -0.78, z:  1.30 }, // Front Driver
      { x:  0.78, z:  1.30 }, // Front Passenger
      { x: -0.78, z: -1.35 }, // Rear Driver
      { x:  0.78, z: -1.35 }, // Rear Passenger
    ];

    wheelPositions.forEach((wp) => {
      const wheelGroup = new THREE.Group();
      wheelGroup.position.set(wp.x, 0.30, wp.z);

      // Rubber tire
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.30, 0.18, 24), tireMat);
      tire.rotation.z = Math.PI / 2;
      tire.castShadow = true;
      wheelGroup.add(tire);

      // Chrome outer rim lip
      const rimLip = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.20, 0.184, 16), chromeMat);
      rimLip.rotation.z = Math.PI / 2;
      wheelGroup.add(rimLip);

      // Chrome center hubcap
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.19, 12), chromeMat);
      hub.rotation.z = Math.PI / 2;
      wheelGroup.add(hub);

      // 5 chrome spokes
      for (let s = 0; s < 5; s++) {
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.186, 0.024, 0.18), chromeMat);
        spoke.rotation.x = (s * Math.PI * 2) / 5;
        wheelGroup.add(spoke);
      }

      mustang.add(wheelGroup);
    });

    // 4. Main Body Lower Shell (Fenders, Doors, Quarter Panels)
    const lowerBody = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.32, 4.10), bodyMat);
    lowerBody.position.set(0, 0.34, 0);
    lowerBody.castShadow = true;
    mustang.add(lowerBody);

    // Chrome rocker panel moldings along bottom sides
    [-0.85, 0.85].forEach((xPos) => {
      const rocker = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 2.50), chromeMat);
      rocker.position.set(xPos, 0.20, -0.02);
      mustang.add(rocker);
    });

    // Iconic 1965 Mustang Side Scoops / C-Scallops (in front of rear wheels)
    [-0.85, 0.85].forEach((xPos) => {
      const scoop = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.12, 0.22), chromeMat);
      scoop.position.set(xPos, 0.36, -0.80);
      mustang.add(scoop);
    });

    // Chrome door handles
    [-0.85, 0.85].forEach((xPos) => {
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.10), chromeMat);
      handle.position.set(xPos, 0.46, -0.20);
      mustang.add(handle);
    });

    // Chrome side mirror (driver door)
    const mirrorStem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.06), chromeMat);
    mirrorStem.position.set(-0.76, 0.60, 0.35);
    mirrorStem.rotation.z = -0.4;
    const mirrorHead = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.02, 12), chromeMat);
    mirrorHead.rotation.z = Math.PI / 2;
    mirrorHead.position.set(-0.80, 0.63, 0.35);
    mustang.add(mirrorStem, mirrorHead);

    // 5. Hood & Front Nose (Classic Long Hood)
    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.64, 0.08, 1.65), bodyMat);
    hood.position.set(0, 0.52, 1.15);
    hood.castShadow = true;
    mustang.add(hood);

    // Hood power bulge / center ridge
    const hoodBulge = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.03, 1.55), bodyMat);
    hoodBulge.position.set(0, 0.56, 1.15);
    mustang.add(hoodBulge);

    // Dual Le Mans racing stripes on hood
    [-0.11, 0.11].forEach((xPos) => {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.006, 1.66), stripeMat);
      stripe.position.set(xPos, 0.565, 1.15);
      mustang.add(stripe);
    });

    // 6. Trunk / Rear Deck (Classic Short Deck)
    const trunk = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.08, 0.90), bodyMat);
    trunk.position.set(0, 0.52, -1.55);
    trunk.castShadow = true;
    mustang.add(trunk);

    // Dual Le Mans racing stripes on trunk
    [-0.11, 0.11].forEach((xPos) => {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.006, 0.91), stripeMat);
      stripe.position.set(xPos, 0.565, -1.55);
      mustang.add(stripe);
    });

    // 7. Cabin / Greenhouse (1965 Notchback Coupe)
    // Roof Panel
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.04, 1.38), bodyMat);
    roof.position.set(0, 1.02, -0.32);
    roof.castShadow = true;
    mustang.add(roof);

    // Dual Le Mans racing stripes on roof
    [-0.11, 0.11].forEach((xPos) => {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.006, 1.39), stripeMat);
      stripe.position.set(xPos, 1.045, -0.32);
      mustang.add(stripe);
    });

    // Sloped Windshield
    const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.50, 0.02), glassMat);
    windshield.position.set(0, 0.77, 0.44);
    windshield.rotation.x = -0.62; // ~35 degree rake
    mustang.add(windshield);

    // Chrome A-Pillars
    [-0.66, 0.66].forEach((xPos) => {
      const aPillar = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.52, 0.03), chromeMat);
      aPillar.position.set(xPos, 0.77, 0.44);
      aPillar.rotation.x = -0.62;
      mustang.add(aPillar);
    });

    // Sloped Rear Window
    const rearWindow = new THREE.Mesh(new THREE.BoxGeometry(1.28, 0.48, 0.02), glassMat);
    rearWindow.position.set(0, 0.76, -1.06);
    rearWindow.rotation.x = 0.58;
    mustang.add(rearWindow);

    // C-Pillars / Sail Panels
    [-0.66, 0.66].forEach((xPos) => {
      const cPillar = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.50, 0.08), bodyMat);
      cPillar.position.set(xPos, 0.76, -1.04);
      cPillar.rotation.x = 0.58;
      mustang.add(cPillar);
    });

    // Side Windows
    [-0.68, 0.68].forEach((xPos) => {
      const sideGlass = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.36, 1.25), glassMat);
      sideGlass.position.set(xPos, 0.74, -0.32);
      mustang.add(sideGlass);

      // Chrome upper window drip molding
      const dripMold = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.02, 1.36), chromeMat);
      dripMold.position.set(xPos, 0.99, -0.32);
      mustang.add(dripMold);
    });

    // 8. Interior (Dashboard, 3-Spoke Steering Wheel, Bucket Seats)
    const dash = new THREE.Mesh(new THREE.BoxGeometry(1.30, 0.14, 0.22), interiorMat);
    dash.position.set(0, 0.60, 0.32);
    mustang.add(dash);

    // 3-Spoke Chrome Steering Wheel
    const steerGroup = new THREE.Group();
    steerGroup.position.set(-0.38, 0.66, 0.18);
    steerGroup.rotation.x = -0.45;
    const steerRing = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.014, 8, 20), interiorMat);
    const steerHub = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 12), chromeMat);
    steerHub.rotation.x = Math.PI / 2;
    steerGroup.add(steerRing, steerHub);
    for (let sp = 0; sp < 3; sp++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.13, 0.015), chromeMat);
      spoke.rotation.z = (sp * Math.PI * 2) / 3;
      steerGroup.add(spoke);
    }
    mustang.add(steerGroup);

    // Front Low-Back Bucket Seats
    [-0.38, 0.38].forEach((xPos) => {
      const seatGroup = new THREE.Group();
      seatGroup.position.set(xPos, 0.40, -0.22);
      const cushion = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.42), interiorMat);
      const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.40, 0.12), interiorMat);
      seatBack.position.set(0, 0.24, -0.16);
      seatBack.rotation.x = -0.12;
      seatGroup.add(cushion, seatBack);
      mustang.add(seatGroup);
    });

    // Rear Bench Seat
    const rearSeat = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.20, 0.42), interiorMat);
    rearSeat.position.set(0, 0.42, -0.74);
    mustang.add(rearSeat);

    // 9. Front Fascia (Recessed Grille, Pony Emblem, Round Headlights, Bumper)
    // Dark Recessed Honeycomb Grille
    const grille = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.24, 0.06), grilleMat);
    grille.position.set(0, 0.38, 2.05);
    mustang.add(grille);

    // Chrome Grille Surround Trim
    const grilleTrim = new THREE.Mesh(new THREE.BoxGeometry(1.28, 0.28, 0.03), chromeMat);
    grilleTrim.position.set(0, 0.38, 2.03);
    mustang.add(grilleTrim);

    // Center Chrome Mustang "Running Horse" Pony Emblem
    const crossBar = new THREE.Mesh(new THREE.BoxGeometry(0.60, 0.025, 0.04), chromeMat);
    crossBar.position.set(0, 0.38, 2.08);
    const ponyEmblem = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.07, 0.05), chromeMat);
    ponyEmblem.position.set(0, 0.38, 2.09);
    mustang.add(crossBar, ponyEmblem);

    // Iconic Round Headlights with Chrome Bezels
    [-0.68, 0.68].forEach((xPos) => {
      // Chrome Bezel Bucket
      const bezel = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.06, 16), chromeMat);
      bezel.rotation.x = Math.PI / 2;
      bezel.position.set(xPos, 0.40, 2.05);
      // Bright Glass Lens
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.062, 16), headlightMat);
      lens.rotation.x = Math.PI / 2;
      lens.position.set(xPos, 0.40, 2.06);
      mustang.add(bezel, lens);
    });

    // Amber Turn Signals / Parking Lights in lower valance
    [-0.48, 0.48].forEach((xPos) => {
      const amber = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.045, 0.03), amberMat);
      amber.position.set(xPos, 0.24, 2.06);
      mustang.add(amber);
    });

    // Deep Chrome Front Bumper with Vertical Bumperettes
    const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.08, 0.09), chromeMat);
    frontBumper.position.set(0, 0.27, 2.12);
    frontBumper.castShadow = true;
    mustang.add(frontBumper);

    [-0.40, 0.40].forEach((xPos) => {
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.15, 0.11), chromeMat);
      guard.position.set(xPos, 0.27, 2.14);
      mustang.add(guard);
    });

    // 10. Rear Fascia (Iconic Tri-Bar Taillights, Round Chrome Gas Cap, Rear Bumper)
    const rearPanel = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.24, 0.05), bodyMat);
    rearPanel.position.set(0, 0.38, -2.04);
    mustang.add(rearPanel);

    // Iconic 1965 Tri-Bar Taillights (3 vertical red bars on each side)
    [-1, 1].forEach((side) => {
      const baseX = side * 0.58;
      // Chrome backing plate
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.15, 0.02), chromeMat);
      plate.position.set(baseX, 0.40, -2.055);
      mustang.add(plate);

      // 3 vertical lens bars
      [-0.065, 0.0, 0.065].forEach((offset) => {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.13, 0.03), tailLightMat);
        bar.position.set(baseX + offset, 0.40, -2.07);
        mustang.add(bar);
      });
    });

    // Famous Center Round Chrome Gas Cap with Pony Emblem
    const gasCap = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.03, 16), chromeMat);
    gasCap.rotation.x = Math.PI / 2;
    gasCap.position.set(0, 0.40, -2.065);
    const capCenter = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.032, 12), bodyMat);
    capCenter.rotation.x = Math.PI / 2;
    capCenter.position.set(0, 0.40, -2.066);
    mustang.add(gasCap, capCenter);

    // Chrome Rear Bumper with Bumperettes
    const rearBumper = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.08, 0.09), chromeMat);
    rearBumper.position.set(0, 0.27, -2.10);
    rearBumper.castShadow = true;
    mustang.add(rearBumper);

    [-0.40, 0.40].forEach((xPos) => {
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.15, 0.11), chromeMat);
      guard.position.set(xPos, 0.27, -2.12);
      mustang.add(guard);
    });

    // License Plate
    const plateMat = new THREE.MeshStandardMaterial({ color: 0xF8FAFC, roughness: 0.4 });
    const plateMesh = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.12, 0.015), plateMat);
    plateMesh.position.set(0, 0.27, -2.06);
    mustang.add(plateMesh);

    mustang.userData = {
      type: "vehicle",
      name: "1965 Ford Mustang",
      description: "1965 Ford Mustang in Southern Garage Bay",
      level: "main"
    };

    scene.add(mustang);
    vehicleMeshes.push(mustang);
  }

  function setLabelsVisible(visible) {
    labelsVisible = visible;
    updateVisibility();
  }

  function updateVisibility() {
    const showAll = (activeLevel === "all");
    const checkLevel = (lvl) => showAll || lvl === "all" || lvl === activeLevel;

    roomMeshes.forEach((m) => (m.visible = checkLevel(m.userData.level)));
    wallMeshes.forEach((m) => (m.visible = checkLevel(m.userData.level)));
    doorMeshes.forEach((m) => (m.visible = checkLevel(m.userData.level)));
    windowMeshes.forEach((m) => (m.visible = checkLevel(m.userData.level)));
    stairMeshes.forEach((m) => (m.visible = showAll || activeLevel === "main" || activeLevel === "basement"));
    equipmentMeshes.forEach((m) => (m.visible = checkLevel(m.userData.level)));
    vehicleMeshes.forEach((m) => (m.visible = (activeLevel !== "basement")));
    labelSprites.forEach((m) => (m.visible = labelsVisible && checkLevel(m.userData.level)));

    if (environmentGroup) {
      environmentGroup.visible = (activeLevel !== "basement");
    }
  }

  function setLevel(lvl) {
    activeLevel = lvl;
    updateVisibility();
  }

  function updateRoomTints() {
    const H = window.HOUSE || { rooms: [] };
    const byId = (id) => H.rooms.find((r) => r.id === id);

    roomMeshes.forEach((mesh) => {
      const r = byId(mesh.userData.id);
      if (r) {
        const hex = STATUS_COLORS[r.status] || 0x9AA4AE;
        mesh.userData.baseColor = hex;
        mesh.material.color.setHex(hex);
      }
    });
  }

  let flyTween = null;
  function flyToRoom(mesh) {
    if (isFirstPerson || !camera || !controls) return;
    
    // Calculate bounding box centroid of the room
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox;
    const center = new THREE.Vector3();
    box.getCenter(center);
    center.applyMatrix4(mesh.matrixWorld);

    const startTarget = controls.target.clone();
    const endTarget = center.clone();
    
    const startPos = camera.position.clone();
    // Offset camera above and slightly south
    const offset = new THREE.Vector3(0, 18, 14);
    const endPos = endTarget.clone().add(offset);
    
    flyTween = {
      startTarget, endTarget, startPos, endPos, progress: 0
    };
  }

  function highlightRoom(id) {
    roomMeshes.forEach((mesh) => {
      const isSel = (mesh.userData.id === id);
      mesh.material.emissive.setHex(isSel ? 0x2C6E9B : 0x000000);
      mesh.material.opacity = isSel ? 1.0 : 0.85;
      
      if (isSel) flyToRoom(mesh);
    });
  }

  function highlightCircuit(circuitId) {
    const H = window.HOUSE || { circuits: [] };
    const c = H.circuits.find((item) => item.id === circuitId);
    const roomIds = c ? new Set(c.rooms || []) : null;

    roomMeshes.forEach((mesh) => {
      if (roomIds) {
        const isAct = roomIds.has(mesh.userData.id);
        mesh.material.emissive.setHex(isAct ? 0x00E5FF : 0x000000);
        mesh.material.opacity = isAct ? 1.0 : 0.25;
      } else {
        mesh.material.emissive.setHex(0x000000);
        mesh.material.opacity = 0.85;
      }
    });

    if (electricalLayerGroup) {
      electricalLayerGroup.traverse((obj) => {
        if (obj.userData && obj.userData.circuitId) {
          if (!circuitId) {
            if (obj.material && obj.material.emissiveIntensity !== undefined) {
              obj.material.emissiveIntensity = 0.55;
              obj.material.opacity = 0.9;
            }
          } else if (obj.userData.circuitId === circuitId) {
            if (obj.material && obj.material.emissiveIntensity !== undefined) {
              obj.material.emissiveIntensity = 1.0;
              obj.material.opacity = 1.0;
            }
          } else {
            if (obj.material && obj.material.emissiveIntensity !== undefined) {
              obj.material.emissiveIntensity = 0.08;
              obj.material.opacity = 0.15;
            }
          }
        }
      });
    }
  }

  function onMouseMove(e) {
    if (!renderer) return;
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(roomMeshes.filter((m) => m.visible));

    if (intersects.length > 0) {
      const first = intersects[0].object;
      if (hoveredMesh !== first) {
        if (hoveredMesh && !hoveredMesh.userData.isSelected) {
          hoveredMesh.material.emissive.setHex(0x000000);
        }
        hoveredMesh = first;
        hoveredMesh.material.emissive.setHex(0x00E5FF);
        renderer.domElement.style.cursor = "pointer";
      }
    } else {
      if (hoveredMesh && !hoveredMesh.userData.isSelected) {
        hoveredMesh.material.emissive.setHex(0x000000);
      }
      hoveredMesh = null;
      renderer.domElement.style.cursor = "default";
    }
  }

  function onClick(e) {
    if (isPlaceVentMode || isPlaceFixtureMode || isPlaceOutletMode) {
      // Raycast against visible room floors
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(roomMeshes.filter((m) => m.visible));
      if (intersects.length > 0) {
        const hit = intersects[0];
        const hitX = Math.round(hit.point.x * 100) / 100;
        const hitY = Math.round(hit.point.y * 100) / 100;
        const hitZ = Math.round(hit.point.z * 100) / 100;
        const detectedRoom = detectRoomAtPoint(hitX, hitZ, activeLevel) || (hit.object.userData && hit.object.userData.id) || "livingroom";

        if (isPlaceVentMode && window.App && typeof window.App.addRegisterFrom3D === "function") {
          window.App.addRegisterFrom3D({
            room: detectedRoom,
            anchor: { x: hitX, y: hitY + 0.02, z: hitZ }
          });
        } else if (isPlaceFixtureMode && window.App && typeof window.App.addFixtureFrom3D === "function") {
          const sel = document.getElementById("selFixtureType");
          const type = sel ? sel.value : "sink";
          window.App.addFixtureFrom3D({
            room: detectedRoom,
            type: type,
            anchor: { x: hitX, y: hitY + 0.02, z: hitZ }
          });
        } else if (isPlaceOutletMode && window.App && typeof window.App.addOutletFrom3D === "function") {
          window.App.addOutletFrom3D({
            room: detectedRoom,
            anchor: { x: hitX, y: hitY + 0.3, z: hitZ } // outlets typically ~12" off the floor
          });
        }
      }
      return;
    }

    // Check if clicked an existing register in normal mode
    if (hvacLayerGroup && hvacLayerGroup.visible) {
      raycaster.setFromCamera(mouse, camera);
      const regIntersects = raycaster.intersectObjects(hvacLayerGroup.children.filter((c) => c.userData && c.userData.isRegister));
      if (regIntersects.length > 0) {
        const regObj = regIntersects[0].object;
        if (window.App && typeof window.App.selectRegister === "function") {
          window.App.selectRegister(regObj.userData.registerId);
          return;
        }
      }
    }

    if (hoveredMesh && hoveredMesh.userData.id) {
      if (window.App && typeof window.App.selectRoom === "function") {
        window.App.selectRoom(hoveredMesh.userData.id);
      }
    }
  }

  function onWindowResize() {
    if (!renderer || !camera) return;
    const container = renderer.domElement.parentElement;
    if (!container) return;
    const width = container.clientWidth;
    const height = Math.max(container.clientHeight, 500);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }

  // --- 3D Lighting Environments (Day / Sunset / Night) ---

  function setLightingEnvironment(env) {
    lightingEnv = env;
    if (!scene || !sunLight) return;

    if (env === "sunset") {
      scene.background = new THREE.Color(0x38283E);
      sunLight.color.setHex(0xF59E0B);
      sunLight.intensity = 1.7;
      sunLight.position.set(38, 12, -22);
      if (skyFillLight) {
        skyFillLight.color.setHex(0x818CF8);
        skyFillLight.intensity = 0.4;
      }
      if (hemiLight) {
        hemiLight.color.setHex(0xFDBA74);
        hemiLight.groundColor.setHex(0x431407);
        hemiLight.intensity = 0.5;
      }
      if (interiorLightsGroup) interiorLightsGroup.visible = true;
      if (coachLightsGroup) coachLightsGroup.visible = true;
      if (windowGlassMat) {
        windowGlassMat.emissive.setHex(0xFDE68A);
        windowGlassMat.emissiveIntensity = 0.35;
      }
    } else if (env === "night") {
      scene.background = new THREE.Color(0x090D16);
      sunLight.color.setHex(0x818CF8);
      sunLight.intensity = 0.22;
      sunLight.position.set(-15, 25, -15);
      if (skyFillLight) {
        skyFillLight.color.setHex(0x312E81);
        skyFillLight.intensity = 0.15;
      }
      if (hemiLight) {
        hemiLight.color.setHex(0x1E1B4B);
        hemiLight.groundColor.setHex(0x0F172A);
        hemiLight.intensity = 0.2;
      }
      if (interiorLightsGroup) interiorLightsGroup.visible = true;
      if (coachLightsGroup) coachLightsGroup.visible = true;
      if (windowGlassMat) {
        windowGlassMat.emissive.setHex(0xFEF3C7);
        windowGlassMat.emissiveIntensity = 0.75;
      }
    } else {
      // Day (default)
      const isDark = document.documentElement.getAttribute("data-theme") === "dark";
      scene.background = new THREE.Color(isDark ? 0x0F172A : 0xF1F5F9);
      sunLight.color.setHex(0xFFF8EE);
      sunLight.intensity = 0.95;
      sunLight.position.set(25, 45, 20);
      if (skyFillLight) {
        skyFillLight.color.setHex(0xB0D0FF);
        skyFillLight.intensity = 0.35;
      }
      if (hemiLight) {
        hemiLight.color.setHex(0xE2E8F0);
        hemiLight.groundColor.setHex(0x334155);
        hemiLight.intensity = 0.55;
      }
      if (interiorLightsGroup) interiorLightsGroup.visible = false;
      if (coachLightsGroup) coachLightsGroup.visible = false;
      if (windowGlassMat) {
        windowGlassMat.emissive.setHex(0x000000);
        windowGlassMat.emissiveIntensity = 0;
      }
    }
  }

  // --- 3D Infrastructure Layers (Conduit, HVAC, Plumbing) ---

  function roomAnchor(roomId, targetHeight) {
    if (!modelData || !modelData.rooms) return null;
    const r = modelData.rooms.find((rm) => rm.id === roomId);
    if (!r) return null;

    let cx = 0, cz = 0;
    if (r.points && r.points.length > 0) {
      r.points.forEach((p) => { cx += p[0]; cz += p[1]; });
      cx /= r.points.length;
      cz /= r.points.length;
    }

    const isBasement = (r.level === "basement" || (r.elevation !== undefined && r.elevation < -0.5));
    const defaultH = isBasement ? -0.28 : 2.38;
    const y = (typeof targetHeight === "number") ? targetHeight : defaultH;

    return {
      x: Math.round(cx * 1000) / 1000,
      y,
      z: Math.round(cz * 1000) / 1000,
      level: r.level || (isBasement ? "basement" : "main"),
      elevation: r.elevation || (isBasement ? -2.13 : 0)
    };
  }

  function generateElectricalSchematic() {
    if (!electricalLayerGroup) {
      electricalLayerGroup = new THREE.Group();
      scene.add(electricalLayerGroup);
    }

    // Dispose & clear existing geometry
    while (electricalLayerGroup.children.length > 0) {
      const child = electricalLayerGroup.children[0];
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
        else child.material.dispose();
      }
      electricalLayerGroup.remove(child);
    }

    const H = window.HOUSE || { circuits: [] };
    const meta = H.meta || {};
    const pAnchor = meta.panelAnchor || { x: 0.6, y: -0.9, z: 2.25 };
    const ceilingY = 2.38;

    const jboxMat = new THREE.MeshStandardMaterial({
      color: 0x0284C7,
      metalness: 0.7,
      roughness: 0.3
    });

    const panelEnclosureMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.85,
      roughness: 0.25
    });

    // Main Service Panel Enclosure at panelAnchor
    const panelBox = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.52, 0.14), panelEnclosureMat);
    panelBox.position.set(pAnchor.x, pAnchor.y, pAnchor.z);
    panelBox.userData = { isPanel: true };
    electricalLayerGroup.add(panelBox);

    // Main Riser from panelAnchor up to ceiling
    const riserHeight = ceilingY - pAnchor.y;
    if (riserHeight > 0.1) {
      const riserGeom = new THREE.CylinderGeometry(0.035, 0.035, riserHeight, 8);
      const riserMat = new THREE.MeshStandardMaterial({
        color: 0x94A3B8,
        metalness: 0.8,
        roughness: 0.3
      });
      const riserMesh = new THREE.Mesh(riserGeom, riserMat);
      riserMesh.position.set(pAnchor.x, pAnchor.y + riserHeight / 2, pAnchor.z);
      electricalLayerGroup.add(riserMesh);
    }

    // Main junction box at ceiling
    const mainJBox = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.10), jboxMat);
    mainJBox.position.set(pAnchor.x, ceilingY, pAnchor.z);
    electricalLayerGroup.add(mainJBox);

    // Amperage color map (standard NEC / wire jacket styling)
    const AMP_COLORS = {
      15: 0x38BDF8, // Cyan / Sky blue (14 AWG)
      20: 0xFACC15, // Yellow (12 AWG)
      30: 0xFB923C, // Orange (10 AWG)
      50: 0xEF4444  // Red (Heavy feed)
    };

    // Verified Outlet Material
    const verifiedOutletMat = new THREE.MeshStandardMaterial({
      color: 0x3E8E5A,
      emissive: 0x2B6946,
      emissiveIntensity: 0.25,
      roughness: 0.2
    });
    const outletMat = new THREE.MeshStandardMaterial({
      color: 0xE2E8F0,
      roughness: 0.2
    });

    function addSchematicRun(x1, y1, z1, x2, y2, z2, mat, circuitId) {
      const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
      const len = Math.hypot(dx, dy, dz);
      if (len < 0.01) return;
      const geom = new THREE.CylinderGeometry(0.02, 0.02, len, 8);
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, dy, dz).normalize());
      mesh.userData = { circuitId, isConduit: true };
      electricalLayerGroup.add(mesh);
    }

    // Generate runs for each circuit
    const circuits = H.circuits || [];
    circuits.forEach((c, i) => {
      const colorHex = (c.color && parseInt(c.color.replace("#", "0x"), 16)) || AMP_COLORS[c.amps] || 0x38BDF8;
      const mat = new THREE.MeshStandardMaterial({
        color: colorHex,
        emissive: colorHex,
        emissiveIntensity: 0.15,
        roughness: 0.5,
        metalness: 0.5
      });

      const cOutlets = (H.outlets || []).filter(o => o.circuit === c.id);
      
      if (cOutlets.length > 0) {
        cOutlets.forEach((out, outIdx) => {
          if (!out.anchor) return;
          const spread = 0.015;
          const ox = ((i + outIdx) % 6 - 2.5) * spread;
          const oz = ((i * 2 + outIdx) % 6 - 2.5) * spread;
          const targetY = (out.anchor.y < 1.0) ? -0.28 : ceilingY; // Basement uses under-floor runs

          addSchematicRun(pAnchor.x + ox, targetY, pAnchor.z + oz, out.anchor.x + ox, targetY, pAnchor.z + oz, mat, c.id);
          addSchematicRun(out.anchor.x + ox, targetY, pAnchor.z + oz, out.anchor.x + ox, targetY, out.anchor.z + oz, mat, c.id);
          
          const roomJBox = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.10, 0.08), jboxMat);
          roomJBox.position.set(out.anchor.x + ox, targetY, out.anchor.z + oz);
          roomJBox.userData = { circuitId: c.id };
          electricalLayerGroup.add(roomJBox);
          
          addSchematicRun(out.anchor.x + ox, targetY, out.anchor.z + oz, out.anchor.x + ox, out.anchor.y, out.anchor.z + oz, mat, c.id);

          // Draw the outlet
          const oMat = out.verified ? verifiedOutletMat : outletMat;
          const outletMesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.04), oMat);
          outletMesh.position.set(out.anchor.x, out.anchor.y, out.anchor.z);
          outletMesh.userData = { isOutlet: true, circuitId: c.id, outletId: out.id };
          electricalLayerGroup.add(outletMesh);
        });
      } else {
        const rooms = c.rooms || [];
        rooms.forEach((roomId, roomIdx) => {
          const anchor = roomAnchor(roomId);
          if (!anchor) return;

          const spread = 0.015;
          const ox = ((i + roomIdx) % 6 - 2.5) * spread;
          const oz = ((i * 2 + roomIdx) % 6 - 2.5) * spread;

          const targetY = (anchor.level === "basement") ? -0.28 : ceilingY;

          addSchematicRun(pAnchor.x + ox, targetY, pAnchor.z + oz, anchor.x + ox, targetY, pAnchor.z + oz, mat, c.id);
          addSchematicRun(anchor.x + ox, targetY, pAnchor.z + oz, anchor.x + ox, targetY, anchor.z + oz, mat, c.id);

          const roomJBox = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.10, 0.08), jboxMat);
          roomJBox.position.set(anchor.x + ox, targetY, anchor.z + oz);
          roomJBox.userData = { circuitId: c.id };
          electricalLayerGroup.add(roomJBox);

          const dropBottomY = anchor.elevation + 0.6;
          addSchematicRun(anchor.x + ox, targetY, anchor.z + oz, anchor.x + ox, dropBottomY, anchor.z + oz, mat, c.id);

          // Receptacle box at drop bottom
          const outletBox = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.05), jboxMat);
          outletBox.position.set(anchor.x, dropBottomY, anchor.z);
          outletBox.userData = { circuitId: c.id };
          electricalLayerGroup.add(outletBox);
        });
      }
    });
  }

  // --- Point-in-Polygon & Field Capture Helpers ---

  function pointInPolygon(pt, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], zi = poly[i][1];
      const xj = poly[j][0], zj = poly[j][1];
      const intersect = ((zi > pt[1]) !== (zj > pt[1])) &&
        (pt[0] < (xj - xi) * (pt[1] - zi) / (zj - zi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function detectRoomAtPoint(x, z, level) {
    if (!modelData || !modelData.rooms) return null;
    const targetLevel = level || activeLevel;
    const candidateRooms = modelData.rooms.filter((r) => {
      if (targetLevel === "all") return true;
      return (r.level || "main") === targetLevel;
    });

    for (let i = 0; i < candidateRooms.length; i++) {
      const rm = candidateRooms[i];
      if (rm.points && rm.points.length >= 3) {
        if (pointInPolygon([x, z], rm.points)) {
          return rm.id;
        }
      }
    }
    return null;
  }

  let isPlaceVentMode = false;
  let isPlaceFixtureMode = false;
  let isPlaceOutletMode = false;

  function setPlaceVentMode(active) {
    isPlaceVentMode = !!active;
    if (renderer && renderer.domElement) {
      renderer.domElement.style.cursor = isPlaceVentMode ? "crosshair" : "default";
    }
    const btn = document.getElementById("btnPlaceVent");
    if (btn) btn.classList.toggle("is-active", isPlaceVentMode);
    
    // Auto-disable others
    if (active && isPlaceFixtureMode) setPlaceFixtureMode(false);
    if (active && isPlaceOutletMode) setPlaceOutletMode(false);
  }

  function setPlaceFixtureMode(active) {
    isPlaceFixtureMode = !!active;
    if (renderer && renderer.domElement) {
      renderer.domElement.style.cursor = isPlaceFixtureMode ? "crosshair" : "default";
    }
    const btn = document.getElementById("btnPlaceFixture");
    if (btn) btn.classList.toggle("is-active", isPlaceFixtureMode);
    
    const palette = document.getElementById("fixturePalette");
    if (palette) palette.hidden = !isPlaceFixtureMode;

    // Auto-disable others
    if (active && isPlaceVentMode) setPlaceVentMode(false);
    if (active && isPlaceOutletMode) setPlaceOutletMode(false);
  }

  function setPlaceOutletMode(active) {
    isPlaceOutletMode = !!active;
    if (renderer && renderer.domElement) {
      renderer.domElement.style.cursor = isPlaceOutletMode ? "crosshair" : "default";
    }
    const btn = document.getElementById("btnPlaceOutlet");
    if (btn) btn.classList.toggle("is-active", isPlaceOutletMode);
    
    // Auto-disable others
    if (active && isPlaceVentMode) setPlaceVentMode(false);
    if (active && isPlaceFixtureMode) setPlaceFixtureMode(false);
  }

  function generateHVACSchematic() {
    if (!hvacLayerGroup) {
      hvacLayerGroup = new THREE.Group();
      scene.add(hvacLayerGroup);
    }

    // Dispose & clear existing geometry
    while (hvacLayerGroup.children.length > 0) {
      const child = hvacLayerGroup.children[0];
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
        else child.material.dispose();
      }
      hvacLayerGroup.remove(child);
    }

    const H = window.HOUSE || { registers: [] };
    const meta = H.meta || {};
    const fAnchor = meta.furnaceAnchor || { x: 1.55, y: -1.18, z: 3.27 };
    const basementCeilingY = -0.28;

    const ductMat = new THREE.MeshStandardMaterial({
      color: 0x94A3B8,
      metalness: 0.85,
      roughness: 0.25
    });

    const registerMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      metalness: 0.6,
      roughness: 0.4
    });

    const verifiedRegisterMat = new THREE.MeshStandardMaterial({
      color: 0x3E8E5A,
      emissive: 0x2B6946,
      emissiveIntensity: 0.25,
      metalness: 0.6,
      roughness: 0.35
    });

    // Furnace Equipment Box
    const furnaceBox = new THREE.Mesh(new THREE.BoxGeometry(0.65, 1.2, 0.65), ductMat);
    furnaceBox.position.set(fAnchor.x, fAnchor.y, fAnchor.z);
    furnaceBox.userData = { isFurnace: true };
    hvacLayerGroup.add(furnaceBox);

    // Vertical riser from furnace to supply trunk
    const riserHeight = basementCeilingY - fAnchor.y;
    if (riserHeight > 0.1) {
      const riser = new THREE.Mesh(new THREE.BoxGeometry(0.48, riserHeight, 0.48), ductMat);
      riser.position.set(fAnchor.x, fAnchor.y + riserHeight / 2, fAnchor.z);
      hvacLayerGroup.add(riser);
    }

    // Calculate trunk Z range from registers
    const registers = H.registers || [];
    let minZ = fAnchor.z - 2, maxZ = fAnchor.z + 6;
    registers.forEach((reg) => {
      const a = reg.anchor || roomAnchor(reg.room);
      if (a) {
        if (a.z < minZ) minZ = a.z - 0.5;
        if (a.z > maxZ) maxZ = a.z + 0.5;
      }
    });

    const trunkLen = Math.max(maxZ - minZ, 4.0);
    const trunkCenterZ = (minZ + maxZ) / 2;
    const supplyTrunk = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.28, trunkLen), ductMat);
    supplyTrunk.position.set(fAnchor.x, basementCeilingY, trunkCenterZ);
    hvacLayerGroup.add(supplyTrunk);

    // Return air trunk & drop
    const returnTrunk = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.26, Math.max(trunkLen * 0.7, 5.0)), ductMat);
    returnTrunk.position.set(fAnchor.x - 0.9, basementCeilingY, trunkCenterZ);
    const returnDrop = new THREE.Mesh(new THREE.BoxGeometry(0.38, 1.8, 0.38), ductMat);
    returnDrop.position.set(fAnchor.x - 0.9, fAnchor.y, fAnchor.z);
    hvacLayerGroup.add(returnTrunk, returnDrop);

    // Registers and branches
    registers.forEach((reg) => {
      const anchor = reg.anchor || roomAnchor(reg.room);
      if (!anchor) return;

      const isReturn = (reg.kind === "return");
      const trunkX = isReturn ? (fAnchor.x - 0.9) : fAnchor.x;
      const dx = anchor.x - trunkX;
      const branchLen = Math.abs(dx);

      if (branchLen > 0.05) {
        const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, branchLen, 10), ductMat);
        branch.rotation.z = Math.PI / 2;
        branch.position.set(trunkX + dx / 2, basementCeilingY, anchor.z);
        branch.userData = { registerId: reg.id, isBranch: true };
        hvacLayerGroup.add(branch);
      }

      // Vertical boot from ceiling up to floor (or register height)
      const targetY = (typeof anchor.y === "number") ? anchor.y : 0.02;
      const bootHeight = Math.max(targetY - basementCeilingY, 0.2);
      const boot = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, bootHeight, 10), ductMat);
      boot.position.set(anchor.x, basementCeilingY + bootHeight / 2, anchor.z);
      boot.userData = { registerId: reg.id, isBoot: true };
      hvacLayerGroup.add(boot);

      // Floor / Wall Grille
      const gMat = reg.verified ? verifiedRegisterMat : registerMat;
      const grille = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.02, 0.14), gMat);
      grille.position.set(anchor.x, targetY, anchor.z);
      grille.userData = { registerId: reg.id, isRegister: true, registerData: reg };
      hvacLayerGroup.add(grille);
    });
  }

  function addPipeRun(x1, y1, z1, x2, y2, z2, mat, fixtureId) {
    const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.01) return;
    const geom = new THREE.CylinderGeometry(0.016, 0.016, len, 8);
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, dy, dz).normalize());
    mesh.userData = { fixtureId, isPipe: true };
    plumbingLayerGroup.add(mesh);
  }

  function generatePlumbingSchematic() {
    if (!plumbingLayerGroup) {
      plumbingLayerGroup = new THREE.Group();
      scene.add(plumbingLayerGroup);
    }

    while (plumbingLayerGroup.children.length > 0) {
      const child = plumbingLayerGroup.children[0];
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
        else child.material.dispose();
      }
      plumbingLayerGroup.remove(child);
    }

    const H = window.HOUSE || { fixtures: [] };
    const meta = H.meta || {};
    const manifoldAnchor = meta.manifoldAnchor || { x: 1.2, y: -1.18, z: 3.27 };
    const drainStackAnchor = meta.drainStackAnchor || { x: 1.4, y: -1.18, z: 3.27 };
    const basementCeilingY = -0.15; // slightly below HVAC

    const pexHotMat = new THREE.MeshStandardMaterial({ color: 0xEF4444, emissive: 0xB91C1C, emissiveIntensity: 0.35, roughness: 0.35 });
    const pexColdMat = new THREE.MeshStandardMaterial({ color: 0x3B82F6, emissive: 0x1D4ED8, emissiveIntensity: 0.35, roughness: 0.35 });
    const drainMat = new THREE.MeshStandardMaterial({ color: 0x9CA3AF, metalness: 0.1, roughness: 0.8 });
    const fixtureMat = new THREE.MeshStandardMaterial({ color: 0xE5E7EB, roughness: 0.2 });
    const verifiedFixtureMat = new THREE.MeshStandardMaterial({ color: 0x3E8E5A, emissive: 0x2B6946, emissiveIntensity: 0.25, roughness: 0.2 });

    // Manifold and Stack roots
    const manifold = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.6, 0.3), pexColdMat);
    manifold.position.set(manifoldAnchor.x, manifoldAnchor.y + 0.3, manifoldAnchor.z);
    plumbingLayerGroup.add(manifold);

    const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 12), drainMat);
    stack.position.set(drainStackAnchor.x, drainStackAnchor.y + 0.6, drainStackAnchor.z);
    plumbingLayerGroup.add(stack);

    const fixtures = H.fixtures || [];
    fixtures.forEach((fix, i) => {
      const anchor = fix.anchor;
      if (!anchor) return;

      const fMat = fix.verified ? verifiedFixtureMat : fixtureMat;
      const fixtureMesh = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.2), fMat);
      fixtureMesh.position.set(anchor.x, anchor.y || 0.02, anchor.z);
      fixtureMesh.userData = { fixtureId: fix.id, isFixture: true, fixtureData: fix };
      plumbingLayerGroup.add(fixtureMesh);

      // Routing offsets to prevent z-fighting
      const offset = (i % 5) * 0.03;
      const rY = basementCeilingY + offset;

      if (fix.cold) {
        addPipeRun(manifoldAnchor.x, rY, manifoldAnchor.z, anchor.x - 0.04, rY, manifoldAnchor.z, pexColdMat, fix.id);
        addPipeRun(anchor.x - 0.04, rY, manifoldAnchor.z, anchor.x - 0.04, rY, anchor.z, pexColdMat, fix.id);
        addPipeRun(anchor.x - 0.04, rY, anchor.z, anchor.x - 0.04, anchor.y, anchor.z, pexColdMat, fix.id);
      }
      if (fix.hot) {
        addPipeRun(manifoldAnchor.x, rY + 0.02, manifoldAnchor.z, anchor.x + 0.04, rY + 0.02, manifoldAnchor.z, pexHotMat, fix.id);
        addPipeRun(anchor.x + 0.04, rY + 0.02, manifoldAnchor.z, anchor.x + 0.04, rY + 0.02, anchor.z, pexHotMat, fix.id);
        addPipeRun(anchor.x + 0.04, rY + 0.02, anchor.z, anchor.x + 0.04, anchor.y, anchor.z, pexHotMat, fix.id);
      }
      if (fix.drain) {
        // Drains use larger pipe and route to drainStackAnchor
        const rYd = basementCeilingY - 0.1 - offset;
        const dx = anchor.x - drainStackAnchor.x;
        const dz = anchor.z - drainStackAnchor.z;
        const len = Math.hypot(dx, dz);
        if (len > 0.01) {
            const dxMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, len, 8), drainMat);
            dxMesh.position.set((drainStackAnchor.x + anchor.x)/2, rYd, (drainStackAnchor.z + anchor.z)/2);
            dxMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), new THREE.Vector3(dx, 0, dz).normalize());
            plumbingLayerGroup.add(dxMesh);
        }
        addPipeRun(anchor.x, rYd, anchor.z, anchor.x, anchor.y, anchor.z, drainMat, fix.id);
        addPipeRun(drainStackAnchor.x, drainStackAnchor.y, drainStackAnchor.z, drainStackAnchor.x, rYd, drainStackAnchor.z, drainMat, fix.id);
      }
    });
  }

  function buildInfrastructureLayers() {
    // 1. Electrical Conduit Layer (Data-Driven Generator)
    generateElectricalSchematic();
    electricalLayerGroup.visible = false;

    // 2. HVAC Ductwork Layer (Data-Driven Generator)
    generateHVACSchematic();
    hvacLayerGroup.visible = false;
    scene.add(hvacLayerGroup);

    // 3. Plumbing Layer (PEX Hot Red & Cold Blue)
    generatePlumbingSchematic();
    plumbingLayerGroup.visible = false;
  }

  function updateSchematicBadge() {
    const isConduitOn = !!(electricalLayerGroup && electricalLayerGroup.visible);
    const isHvacOn = !!(hvacLayerGroup && hvacLayerGroup.visible);
    const isPlumbingOn = !!(plumbingLayerGroup && plumbingLayerGroup.visible);
    const isAnyVisible = isConduitOn || isHvacOn || isPlumbingOn;

    let badge = document.getElementById("schematicHonestyBadge");
    if (!badge && renderer && renderer.domElement && renderer.domElement.parentElement) {
      badge = document.createElement("div");
      badge.id = "schematicHonestyBadge";
      badge.className = "schematic-honesty-badge";
      renderer.domElement.parentElement.appendChild(badge);
    }
    if (badge) {
      badge.hidden = !isAnyVisible;
      if (isAnyVisible) {
        const H = window.HOUSE || {};
        const stats = [];

        if (isConduitOn) {
          const circs = H.circuits || [];
          const vCircs = circs.filter((c) => !c.placeholder).length;
          const outs = H.outlets || [];
          const vOuts = outs.filter(o => o.verified).length;
          const cPct = circs.length ? Math.round((vCircs / circs.length) * 100) : 0;
          stats.push(`Electrical: ${vCircs}/${circs.length} circuits (${cPct}%), ${vOuts}/${outs.length} outlets verified`);
        }

        if (isHvacOn) {
          const regs = H.registers || [];
          const vRegs = regs.filter((r) => r.verified).length;
          const pct = regs.length ? Math.round((vRegs / regs.length) * 100) : 0;
          stats.push(`HVAC: ${vRegs}/${regs.length} verified (${pct}%)`);
        }

        if (isPlumbingOn) {
          const fixes = H.fixtures || [];
          const vFixes = fixes.filter((f) => f.verified).length;
          const pct = fixes.length ? Math.round((vFixes / fixes.length) * 100) : 0;
          stats.push(`Plumbing: ${vFixes}/${fixes.length} verified (${pct}%)`);
        }

        const statsHtml = stats.length
          ? `<span class="badge-stats-divider">·</span><span class="badge-stats">${stats.join(" · ")}</span>`
          : "";

        badge.innerHTML = `<span class="badge-routing">Schematic — shows what connects to what, not where it runs. Not as-built.</span>${statsHtml}`;
      }
    }
  }

  function toggleInfrastructureLayer(name, visible) {
    if (name === "conduit" && electricalLayerGroup) electricalLayerGroup.visible = visible;
    if (name === "hvac" && hvacLayerGroup) hvacLayerGroup.visible = visible;
    if (name === "plumbing" && plumbingLayerGroup) plumbingLayerGroup.visible = visible;
    updateSchematicBadge();
  }

  // --- First-Person Walkthrough Mode ("Walk Inside") ---

  let isFPDagging = false;
  let fpLastMouseX = 0, fpLastMouseY = 0;

  function enterFirstPersonMode(roomId) {
    if (isFirstPerson || !camera || !renderer) return;

    isFirstPerson = true;
    savedCameraPos.copy(camera.position);
    savedControlsTarget.copy(controls.target);
    controls.enabled = false;

    // Determine start position
    let startX = -3.5, startZ = 0.0; // Default Front Hall
    let eyeY = (activeLevel === "basement") ? -0.48 : 1.65;

    if (roomId && modelData && modelData.rooms) {
      const r = modelData.rooms.find((rm) => rm.id === roomId);
      if (r && r.points && r.points.length > 0) {
        let sx = 0, sz = 0;
        r.points.forEach((p) => { sx += p[0]; sz += p[1]; });
        startX = sx / r.points.length;
        startZ = sz / r.points.length;
        eyeY = (r.elevation || 0) + 1.65;
      }
    }

    camera.position.set(startX, eyeY, startZ);
    fpYaw = 0;
    fpPitch = 0;
    fpKeys = {};
    fpLastTime = performance.now();

    // Create HUD overlay
    let hud = document.getElementById("fpWalkthroughHUD");
    if (!hud) {
      hud = document.createElement("div");
      hud.id = "fpWalkthroughHUD";
      hud.className = "fp-hud-overlay";
      hud.innerHTML = `
        <div class="fp-hud-card">
          <div class="fp-hud-title">🚶 Walkthrough Mode</div>
          <div class="fp-hud-sub">WASD / Arrows: Walk · Drag Mouse: Look around</div>
          <button class="fp-btn-exit" id="btnExitFP" title="Exit Walkthrough (Esc)">✕ Exit Walkthrough</button>
        </div>
      `;
      renderer.domElement.parentElement.appendChild(hud);
      document.getElementById("btnExitFP").onclick = exitFirstPersonMode;
    }
    hud.hidden = false;

    window.addEventListener("keydown", onFPKeyDown);
    window.addEventListener("keyup", onFPKeyUp);
    renderer.domElement.addEventListener("mousedown", onFPMouseDown);
    window.addEventListener("mousemove", onFPMouseMove);
    window.addEventListener("mouseup", onFPMouseUp);
  }

  function onFPKeyDown(e) {
    if (e.key === "Escape") {
      exitFirstPersonMode();
      return;
    }
    fpKeys[e.key.toLowerCase()] = true;
    fpKeys[e.code] = true;
  }

  function onFPKeyUp(e) {
    fpKeys[e.key.toLowerCase()] = false;
    fpKeys[e.code] = false;
  }

  function onFPMouseDown(e) {
    if (!isFirstPerson) return;
    isFPDagging = true;
    fpLastMouseX = e.clientX;
    fpLastMouseY = e.clientY;
  }

  function onFPMouseMove(e) {
    if (!isFirstPerson || !isFPDagging) return;
    const dx = e.clientX - fpLastMouseX;
    const dy = e.clientY - fpLastMouseY;
    fpLastMouseX = e.clientX;
    fpLastMouseY = e.clientY;

    fpYaw -= dx * 0.0035;
    fpPitch -= dy * 0.0035;
    fpPitch = Math.max(-1.3, Math.min(1.3, fpPitch));
  }

  function onFPMouseUp() {
    isFPDagging = false;
  }

  function exitFirstPersonMode() {
    if (!isFirstPerson) return;
    isFirstPerson = false;
    isFPDagging = false;

    const hud = document.getElementById("fpWalkthroughHUD");
    if (hud) hud.hidden = true;

    window.removeEventListener("keydown", onFPKeyDown);
    window.removeEventListener("keyup", onFPKeyUp);
    if (renderer) renderer.domElement.removeEventListener("mousedown", onFPMouseDown);
    window.removeEventListener("mousemove", onFPMouseMove);
    window.removeEventListener("mouseup", onFPMouseUp);

    camera.position.copy(savedCameraPos);
    controls.target.copy(savedControlsTarget);
    controls.enabled = true;
  }

  function animate() {
    requestAnimationFrame(animate);

    const now = performance.now();
    const dt = Math.min((now - fpLastTime) / 1000, 0.1);
    fpLastTime = now;

    if (isFirstPerson && camera) {
      const speed = 3.4; // m/s
      const forward = new THREE.Vector3(-Math.sin(fpYaw), 0, -Math.cos(fpYaw));
      const right = new THREE.Vector3(Math.cos(fpYaw), 0, -Math.sin(fpYaw));
      const move = new THREE.Vector3();

      if (fpKeys["w"] || fpKeys["arrowup"] || fpKeys["KeyW"]) move.add(forward);
      if (fpKeys["s"] || fpKeys["arrowdown"] || fpKeys["KeyS"]) move.sub(forward);
      if (fpKeys["d"] || fpKeys["arrowright"] || fpKeys["KeyD"]) move.add(right);
      if (fpKeys["a"] || fpKeys["arrowleft"] || fpKeys["KeyA"]) move.sub(right);

      if (move.lengthSq() > 0) {
        move.normalize().multiplyScalar(speed * dt);
        camera.position.add(move);
      }

      // Maintain eye level height
      const targetEyeY = (activeLevel === "basement") ? -0.48 : 1.65;
      camera.position.y = targetEyeY;

      // Apply camera rotation
      const euler = new THREE.Euler(fpPitch, fpYaw, 0, "YXZ");
      camera.quaternion.setFromEuler(euler);
    } else if (controls) {
      if (flyTween) {
        flyTween.progress += 0.04; // roughly 25 frames ~ 400ms
        if (flyTween.progress >= 1) {
          camera.position.copy(flyTween.endPos);
          controls.target.copy(flyTween.endTarget);
          flyTween = null;
        } else {
          // ease in out smoothstep
          const t = flyTween.progress;
          const ease = t * t * (3 - 2 * t);
          camera.position.lerpVectors(flyTween.startPos, flyTween.endPos, ease);
          controls.target.lerpVectors(flyTween.startTarget, flyTween.endTarget, ease);
        }
      }
      if (wallTween) {
        wallTween.progress += 0.05; // 20 frames ~ 330ms
        if (wallTween.progress >= 1) {
          currentWallRatio = wallTween.end;
          applyWallHeights(currentWallRatio);
          wallTween = null;
        } else {
          const t = wallTween.progress;
          const ease = t * t * (3 - 2 * t);
          currentWallRatio = wallTween.start + (wallTween.end - wallTween.start) * ease;
          applyWallHeights(currentWallRatio);
        }
      }
      controls.update();
    }

    if (renderer && scene && camera) {
      renderer.render(scene, camera);
    }
  }

  window.Model3D = {
    loadModelData,
    init,
    resize,
    setLevel,
    setWallHeight,
    setLabelsVisible,
    setLightingEnvironment,
    enterFirstPersonMode,
    exitFirstPersonMode,
    toggleInfrastructureLayer,
    isFirstPersonMode: () => isFirstPerson,
    updateRoomTints,
    highlightRoom,
    highlightCircuit,
    generateElectricalSchematic,
    generateHVACSchematic,
    generatePlumbingSchematic,
    roomAnchor,
    detectRoomAtPoint,
    setPlaceVentMode,
    isPlaceVentMode: () => isPlaceVentMode,
    setPlaceFixtureMode,
    isPlaceFixtureMode: () => isPlaceFixtureMode,
    setPlaceOutletMode,
    isPlaceOutletMode: () => isPlaceOutletMode,
    updateSchematicBadge
  };
})();
