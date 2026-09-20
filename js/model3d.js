/* ============================================================================
 * model3d.js — Interactive 3D Orbital House Model using Three.js
 * ----------------------------------------------------------------------------
 * Renders the 3D walls, room floor slabs, and elevations extracted from
 * Sweet Home 3D (data/model3d.json).
 * Supports orbit controls, room selection via raycasting, and live status tints.
 * ============================================================================ */

(function () {
  "use strict";

  let scene, camera, renderer, controls, raycaster, mouse;
  let modelData = null;
  let roomMeshes = [];
  let wallMeshes = [];
  let hoveredMesh = null;
  let isInitialized = false;
  let activeLevel = "all"; // "all" | "main" | "basement"

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
      document.documentElement.getAttribute("data-theme") === "dark" ? 0x12171D : 0xFBFAF7
    );

    // 2. Camera
    camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 1000);
    camera.position.set(0, 35, 30);

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
      controls.maxPolarAngle = Math.PI / 2.05; // don't go below ground
      controls.minDistance = 5;
      controls.maxDistance = 80;
      controls.target.set(0, 0, 0);
    }

    // 5. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xfff7ea, 0.75);
    dirLight.position.set(20, 40, 20);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0xbad7f2, 0.35);
    fillLight.position.set(-20, 20, -20);
    scene.add(fillLight);

    // Ground plane grid
    const gridHelper = new THREE.GridHelper(60, 60, 0xD8DCE0, 0xEBECEF);
    gridHelper.position.y = -2.2;
    scene.add(gridHelper);

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

    // Clear existing
    roomMeshes.forEach((m) => scene.remove(m));
    wallMeshes.forEach((m) => scene.remove(m));
    roomMeshes = [];
    wallMeshes = [];

    const H = window.HOUSE || { rooms: [] };
    const byId = (id) => H.rooms.find((r) => r.id === id);

    // 1. Build Room Slabs
    modelData.rooms.forEach((r) => {
      if (r.points.length < 3) return;

      const shape = new THREE.Shape();
      r.points.forEach((pt, i) => {
        // In 3D: X is right, Z is forward (from Y in 2D)
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
        metalness: 0.1,
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
    });

    // 2. Build 3D Walls
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x4B5563,
      roughness: 0.8,
      metalness: 0.05
    });

    modelData.walls.forEach((w) => {
      const dx = w.x2 - w.x1;
      const dz = w.y2 - w.y1;
      const length = Math.sqrt(dx * dx + dz * dz);
      if (length < 0.01) return;

      const geom = new THREE.BoxGeometry(w.thickness || 0.18, w.height || 2.44, length);
      const mesh = new THREE.Mesh(geom, wallMat);

      // Position center of wall
      const midX = (w.x1 + w.x2) / 2;
      const midZ = (w.y1 + w.y2) / 2;
      const midY = w.elevation + (w.height / 2);

      mesh.position.set(midX, midY, midZ);
      mesh.rotation.y = Math.atan2(dx, dz);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = { type: "wall", level: w.level };

      scene.add(mesh);
      wallMeshes.push(mesh);
    });

    updateVisibility();
  }

  function updateVisibility() {
    roomMeshes.forEach((m) => {
      m.visible = (activeLevel === "all" || m.userData.level === activeLevel);
    });
    wallMeshes.forEach((m) => {
      m.visible = (activeLevel === "all" || m.userData.level === activeLevel);
    });
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
    updateRoomTints,
    highlightRoom,
    highlightCircuit
  };
})();
