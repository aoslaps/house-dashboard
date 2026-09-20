/* ============================================================================
 * model3d.js — Interactive 3D Orbital House Model using Three.js
 * ----------------------------------------------------------------------------
 * Renders the 3D walls, room floor slabs, doors, windows, staircase, equipment,
 * eggshell white vinyl siding, and landscaped grounds extracted from
 * Sweet Home 3D (data/model3d.json and data/model3d.js).
 * Supports orbit controls, room selection via raycasting, and live status tints.
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
  let labelSprites = [];
  let environmentGroup = null;
  let hoveredMesh = null;
  let isInitialized = false;
  let activeLevel = "all"; // "all" | "main" | "basement"
  let wallHeightMode = "cutaway"; // "cutaway" | "full"
  let labelsVisible = true;

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

  function createVinylSidingTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");

    // Eggshell white base: #F4F1EA
    ctx.fillStyle = "#F4F1EA";
    ctx.fillRect(0, 0, 128, 128);

    // 4 horizontal lap siding panels (each 32px, represents 4-5" reveal)
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
    camera.position.set(-15, 32, 28);

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
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xfff8ee, 0.85);
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

    const skyFillLight = new THREE.DirectionalLight(0xb0d0ff, 0.35);
    skyFillLight.position.set(-25, 25, -20);
    scene.add(skyFillLight);

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
    labelSprites.forEach((m) => scene.remove(m));
    if (environmentGroup) scene.remove(environmentGroup);

    roomMeshes = [];
    wallMeshes = [];
    doorMeshes = [];
    windowMeshes = [];
    stairMeshes = [];
    equipmentMeshes = [];
    labelSprites = [];
    environmentGroup = null;

    const H = window.HOUSE || { rooms: [] };
    const byId = (id) => H.rooms.find((r) => r.id === id);

    // 1. Build Landscaped Environment (Lawn, Driveway, Walkway, 3D Trees)
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
      geom.rotateX(Math.PI / 2); // rotate to horizontal X-Z plane

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
      mesh.position.y = r.elevation + 0.02; // slightly above level floor
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

    // 3. Build 3D Walls with Eggshell White Vinyl Siding on Exterior Walls
    const sidingTex = createVinylSidingTexture();

    const exteriorWallMat = new THREE.MeshStandardMaterial({
      color: 0xF4F1EA, // Warm eggshell white
      map: sidingTex,
      roughness: 0.65,
      metalness: 0.04
    });

    const interiorWallMat = new THREE.MeshStandardMaterial({
      color: 0xE2E8F0, // Clean interior drywall off-white
      roughness: 0.75,
      metalness: 0.02
    });

    const cutawayInteriorMat = new THREE.MeshStandardMaterial({
      color: 0x475569, // Charcoal slate for high contrast in cutaway mode
      roughness: 0.8,
      metalness: 0.05
    });

    modelData.walls.forEach((w) => {
      const dx = w.x2 - w.x1;
      const dz = w.y2 - w.y1;
      const length = Math.sqrt(dx * dx + dz * dz);
      if (length < 0.01) return;

      const origH = w.height || 2.44;
      const h = wallHeightMode === "cutaway" ? Math.min(1.15, origH) : origH;

      const geom = new THREE.BoxGeometry(w.thickness || 0.17, origH, length);
      const isExt = !!w.isExterior;
      const mat = isExt ? exteriorWallMat : (wallHeightMode === "cutaway" ? cutawayInteriorMat : interiorWallMat);
      const mesh = new THREE.Mesh(geom, mat);

      const midX = (w.x1 + w.x2) / 2;
      const midZ = (w.y1 + w.y2) / 2;
      const midY = w.elevation + (h / 2);

      mesh.scale.y = h / origH;
      mesh.position.set(midX, midY, midZ);
      mesh.rotation.y = Math.atan2(dx, dz);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = {
        type: "wall",
        level: w.level,
        elevation: w.elevation,
        originalHeight: origH,
        isExterior: isExt
      };

      scene.add(mesh);
      wallMeshes.push(mesh);
    });

    // 4. Build Exact 3D Doors from Sweet Home 3D
    buildDoors();

    // 5. Build Exact 3D Windows from Sweet Home 3D
    buildWindows();

    // 6. Build Accurate 3D Basement Staircase
    buildStairs();

    // 7. Build Accurate 3D Basement Mechanical Equipment
    buildEquipment();

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
    groundMesh.position.y = -0.06; // Just below main level slab
    groundMesh.receiveShadow = true;
    environmentGroup.add(groundMesh);

    // 2. Driveway Apron (positioned and angled matching the 30° garage wing)
    const driveGeom = new THREE.PlaneGeometry(13, 16);
    driveGeom.rotateX(-Math.PI / 2);
    const driveMat = new THREE.MeshStandardMaterial({
      color: 0x334155, // Clean asphalt / paver
      roughness: 0.82,
      metalness: 0.08
    });
    const driveMesh = new THREE.Mesh(driveGeom, driveMat);
    driveMesh.position.set(-14.8, -0.04, -8.2);
    driveMesh.rotation.y = -Math.PI / 6; // 30° alignment
    driveMesh.receiveShadow = true;
    environmentGroup.add(driveMesh);

    // 3. Front Walkway (leading towards front entrance at -6.14, 0.02)
    const walkGeom = new THREE.PlaneGeometry(1.6, 11);
    walkGeom.rotateX(-Math.PI / 2);
    const walkMat = new THREE.MeshStandardMaterial({
      color: 0x94A3B8, // Concrete / flagstone
      roughness: 0.75,
      metalness: 0.04
    });
    const walkMesh = new THREE.Mesh(walkGeom, walkMat);
    walkMesh.position.set(-6.14, -0.035, -5.5);
    walkMesh.receiveShadow = true;
    environmentGroup.add(walkMesh);

    // 4. Procedural Low-Poly 3D Trees
    const treePositions = [
      // Front yard corners
      { x: -16.5, z: 9.5,  h: 5.8, r: 1.8 },
      { x: -13.0, z: 13.5, h: 4.8, r: 1.5 },
      { x: -18.5, z: 3.0,  h: 6.2, r: 2.0 },
      { x: -21.0, z: -8.0, h: 5.5, r: 1.7 },
      // East side yard
      { x: 18.5,  z: 1.5,  h: 6.0, r: 1.9 },
      { x: 19.5,  z: 7.5,  h: 5.2, r: 1.6 },
      // Backyard perimeter
      { x: 13.0,  z: 17.5, h: 6.6, r: 2.2 },
      { x: 5.5,   z: 18.5, h: 5.6, r: 1.8 },
      { x: -2.5,  z: 18.5, h: 6.2, r: 2.0 },
      { x: -9.5,  z: 17.0, h: 5.0, r: 1.6 },
      // Small garden shrubs near foundation
      { x: -4.2,  z: -2.2, h: 1.6, r: 0.8, isBush: true },
      { x: -8.2,  z: -2.0, h: 1.5, r: 0.75, isBush: true },
      { x: 0.5,   z: -2.2, h: 1.7, r: 0.85, isBush: true }
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
        // Low-poly garden bush
        const bushGeom = new THREE.DodecahedronGeometry(pos.r, 1);
        const bush = new THREE.Mesh(bushGeom, folMat);
        bush.position.y = pos.r * 0.75;
        bush.scale.set(1.1, 0.8, 1.0);
        bush.castShadow = true;
        treeGroup.add(bush);
      } else {
        // Tree Trunk
        const trunkH = pos.h * 0.38;
        const trunkGeom = new THREE.CylinderGeometry(0.18, 0.28, trunkH, 8);
        const trunk = new THREE.Mesh(trunkGeom, trunkMat);
        trunk.position.y = trunkH / 2;
        trunk.castShadow = true;
        treeGroup.add(trunk);

        // Multi-tier Low-Poly Foliage
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

    // Clean compact pill with dark slate translucent background
    ctx.fillStyle = "rgba(15, 23, 42, 0.86)";
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(3, 3, 234, 50, 25);
    else ctx.rect(3, 3, 234, 50);
    ctx.fill();

    // Subtle 1.5px border
    ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Status dot
    ctx.fillStyle = colorHex || "#00E5FF";
    ctx.beginPath();
    ctx.arc(22, 28, 6, 0, Math.PI * 2);
    ctx.fill();

    // Crisp typography
    ctx.fillStyle = "#F8FAFC";
    ctx.font = "600 16px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textBaseline = "middle";
    const display = text.length > 15 ? text.substring(0, 14) + "…" : text;
    ctx.fillText(display, 36, 28);

    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    // Compact scale: 1.25m wide by 0.3m tall in 3D world (sleek and unobtrusive)
    sprite.scale.set(1.25, 0.3, 1.0);
    return sprite;
  }

  function buildDoors() {
    if (!modelData.doors) return;

    const frameMat = new THREE.MeshStandardMaterial({ color: 0x1E293B, roughness: 0.65, metalness: 0.1 });
    const woodDoorMat = new THREE.MeshStandardMaterial({ color: 0x8B5A2B, roughness: 0.55, metalness: 0.05 });
    const extDoorMat = new THREE.MeshStandardMaterial({ color: 0x0F172A, roughness: 0.4, metalness: 0.25 });
    const knobMat = new THREE.MeshStandardMaterial({ color: 0xD4AF37, roughness: 0.2, metalness: 0.9 });
    const garageDoorMat = new THREE.MeshStandardMaterial({ color: 0xF8FAFC, roughness: 0.5, metalness: 0.1 });
    const garageTrimMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.6, metalness: 0.2 });

    modelData.doors.forEach((d) => {
      const group = new THREE.Group();
      group.position.set(d.x, d.y, d.z);
      group.rotation.y = d.rotY || 0;

      const w = d.width || 0.85;
      const h = d.height || 2.05;
      const frameThick = 0.06;
      const depth = Math.max(d.depth || 0.16, 0.14);

      if (d.isGarage) {
        // Sectional overhead garage door with horizontal panels
        const panelCount = 4;
        const panelH = h / panelCount;
        for (let i = 0; i < panelCount; i++) {
          const panelGeom = new THREE.BoxGeometry(w - 0.06, panelH - 0.025, 0.045);
          const panelMesh = new THREE.Mesh(panelGeom, garageDoorMat);
          panelMesh.position.set(0, (i + 0.5) * panelH, 0);
          panelMesh.castShadow = true;
          panelMesh.receiveShadow = true;

          // Horizontal accent groove
          const grooveGeom = new THREE.BoxGeometry(w - 0.1, 0.015, 0.05);
          const groove = new THREE.Mesh(grooveGeom, garageTrimMat);
          groove.position.set(0, (i + 0.5) * panelH, 0.005);
          group.add(groove);

          group.add(panelMesh);
        }
        // Left/right frame jambs & lintel
        const jambL = new THREE.Mesh(new THREE.BoxGeometry(frameThick, h, depth), frameMat);
        jambL.position.set(-w / 2 + frameThick / 2, h / 2, 0);
        const jambR = new THREE.Mesh(new THREE.BoxGeometry(frameThick, h, depth), frameMat);
        jambR.position.set(w / 2 - frameThick / 2, h / 2, 0);
        const lintel = new THREE.Mesh(new THREE.BoxGeometry(w, frameThick, depth), frameMat);
        lintel.position.set(0, h - frameThick / 2, 0);
        group.add(jambL, jambR, lintel);
      } else {
        // Standard Door Frame
        const jambGeom = new THREE.BoxGeometry(frameThick, h, depth);
        const leftJamb = new THREE.Mesh(jambGeom, frameMat);
        leftJamb.position.set(-w / 2 + frameThick / 2, h / 2, 0);
        leftJamb.castShadow = true;

        const rightJamb = new THREE.Mesh(jambGeom, frameMat);
        rightJamb.position.set(w / 2 - frameThick / 2, h / 2, 0);
        rightJamb.castShadow = true;

        const headGeom = new THREE.BoxGeometry(w, frameThick, depth);
        const header = new THREE.Mesh(headGeom, frameMat);
        header.position.set(0, h - frameThick / 2, 0);
        header.castShadow = true;

        group.add(leftJamb, rightJamb, header);

        // Door slab (unless it's an open cased door frame)
        if (!d.isCased) {
          const slabW = w - frameThick * 2 - 0.02;
          const slabH = h - frameThick - 0.02;
          const slabThick = 0.045;
          const slabGeom = new THREE.BoxGeometry(slabW, slabH, slabThick);
          const doorMat = d.isExterior ? extDoorMat : woodDoorMat;
          const slab = new THREE.Mesh(slabGeom, doorMat);

          // Position door slightly ajar for interior doors (18 degrees), closed for exterior
          const ajarAngle = (d.isExterior ? 0 : 0.32);
          slab.position.set(-slabW / 2 + 0.015, slabH / 2, 0);
          slab.castShadow = true;

          const doorPivot = new THREE.Group();
          doorPivot.position.set(-w / 2 + frameThick + 0.01, 0, 0);
          doorPivot.rotation.y = ajarAngle;
          doorPivot.add(slab);

          // Brass door handle knob
          const knobGeom = new THREE.SphereGeometry(0.025, 12, 12);
          const knob = new THREE.Mesh(knobGeom, knobMat);
          knob.position.set(-slabW + 0.07, 0.95, slabThick / 2 + 0.03);
          doorPivot.add(knob);

          group.add(doorPivot);
        }
      }

      group.userData = { type: "door", id: d.id, level: d.level };
      scene.add(group);
      doorMeshes.push(group);
    });
  }

  function buildWindows() {
    if (!modelData.windows) return;

    const frameMat = new THREE.MeshStandardMaterial({ color: 0xF8FAFC, roughness: 0.35, metalness: 0.15 });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x93C5FD,
      roughness: 0.05,
      metalness: 0.85,
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide
    });
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

      // Outer Frame (Left, Right, Top)
      const leftFrame = new THREE.Mesh(new THREE.BoxGeometry(frameThick, height, depth), frameMat);
      leftFrame.position.set(-width / 2 + frameThick / 2, height / 2, 0);

      const rightFrame = new THREE.Mesh(new THREE.BoxGeometry(frameThick, height, depth), frameMat);
      rightFrame.position.set(width / 2 - frameThick / 2, height / 2, 0);

      const topFrame = new THREE.Mesh(new THREE.BoxGeometry(width, frameThick, depth), frameMat);
      topFrame.position.set(0, height - frameThick / 2, 0);

      // Window Sill (extends slightly outside on bottom)
      const sill = new THREE.Mesh(new THREE.BoxGeometry(width + 0.08, frameThick + 0.02, depth + 0.06), sillMat);
      sill.position.set(0, frameThick / 2, 0.02);

      // Glass Pane
      const glassGeom = new THREE.PlaneGeometry(width - frameThick * 2, height - frameThick * 2);
      const glass = new THREE.Mesh(glassGeom, glassMat);
      glass.position.set(0, height / 2, 0);

      // Center Mullion Divider
      const mullion = new THREE.Mesh(new THREE.BoxGeometry(frameThick * 0.7, height - frameThick * 2, depth * 0.35), frameMat);
      mullion.position.set(0, height / 2, 0);

      group.add(leftFrame, rightFrame, topFrame, sill, glass, mullion);
      group.userData = { type: "window", id: w.id, level: w.level };
      scene.add(group);
      windowMeshes.push(group);
    });
  }

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

        // Tread
        const treadGeom = new THREE.BoxGeometry(w, 0.035, stepL + 0.025);
        const tread = new THREE.Mesh(treadGeom, treadMat);
        tread.position.set(cx, cy + stepH / 2, cz);
        tread.rotation.y = angle;
        tread.castShadow = true;
        tread.receiveShadow = true;
        group.add(tread);

        // Riser
        const riserGeom = new THREE.BoxGeometry(w, stepH, 0.025);
        const riser = new THREE.Mesh(riserGeom, riserMat);
        riser.position.set(cx, cy, cz - stepL / 2);
        riser.rotation.y = angle;
        group.add(riser);
      }

      // Modern Handrail
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
        // Water Heater Tank or Storage Drum
        const r = eq.radius || 0.35;
        const h = eq.height || 1.8;
        const tankMat = new THREE.MeshStandardMaterial({ color: eq.color || 0xCBD5E1, roughness: 0.3, metalness: 0.75 });
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 24), tankMat);
        tank.position.y = h / 2;
        tank.castShadow = true;

        // Top copper pipe
        const pipeMat = new THREE.MeshStandardMaterial({ color: 0xB45309, roughness: 0.2, metalness: 0.9 });
        const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.3), pipeMat);
        pipe.position.set(0, h + 0.15, 0);

        group.add(tank, pipe);
      } else if (eq.type === "box") {
        // HVAC Furnace or Air Handler Unit
        const w = eq.width || 0.85;
        const d = eq.depth || 0.85;
        const h = eq.height || 1.85;
        const furnaceMat = new THREE.MeshStandardMaterial({ color: eq.color || 0x475569, roughness: 0.6, metalness: 0.3 });
        const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), furnaceMat);
        body.position.y = h / 2;
        body.castShadow = true;

        // Top flue vent
        const flueMat = new THREE.MeshStandardMaterial({ color: 0x94A3B8, roughness: 0.3, metalness: 0.7 });
        const flue = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.35), flueMat);
        flue.position.set(0, h + 0.17, 0);

        group.add(body, flue);
      } else if (eq.type === "panel") {
        // 3D Main Electrical Panel
        const w = eq.width || 0.45;
        const h = eq.height || 0.95;
        const d = eq.depth || 0.12;
        const panelMat = new THREE.MeshStandardMaterial({ color: 0x1E293B, roughness: 0.4, metalness: 0.6 });
        const enclosure = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), panelMat);
        enclosure.position.y = h / 2;

        // Yellow electrical warning badge
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

  function setWallHeight(mode) {
    wallHeightMode = mode;
    wallMeshes.forEach((mesh) => {
      const origH = mesh.userData.originalHeight || 2.44;
      const h = mode === "cutaway" ? Math.min(1.15, origH) : origH;
      mesh.scale.y = h / origH;
      mesh.position.y = mesh.userData.elevation + (h / 2);
    });
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
    labelSprites.forEach((m) => (m.visible = labelsVisible && checkLevel(m.userData.level)));

    // When viewing basement exclusively, hide environment ground plane so basement isn't obscured
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

  function highlightRoom(id) {
    roomMeshes.forEach((mesh) => {
      const isSel = (mesh.userData.id === id);
      mesh.material.emissive.setHex(isSel ? 0x2C6E9B : 0x000000);
      mesh.material.opacity = isSel ? 1.0 : 0.85;
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

  function onClick() {
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

  function animate() {
    requestAnimationFrame(animate);
    if (controls) controls.update();
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
    updateRoomTints,
    highlightRoom,
    highlightCircuit
  };
})();
