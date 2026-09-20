window.Landscape = (function() {
  let landscapeGroup = null;

  // Simple stylized trees
  function createTree(type, x, z) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5C4033, roughness: 0.9 });
    
    if (type === "white_pine" || type === "spruce") {
      const foliageMat = new THREE.MeshStandardMaterial({ color: type === "white_pine" ? 0x2d4c3b : 0x1f3d28, roughness: 0.8 });
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 1.5, 5), trunkMat);
      trunk.position.y = 0.75;
      trunk.castShadow = true;
      
      const p1 = new THREE.Mesh(new THREE.ConeGeometry(1.2, 3, 5), foliageMat);
      p1.position.y = 2.5;
      p1.castShadow = true;
      
      const p2 = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.5, 5), foliageMat);
      p2.position.y = 4.0;
      p2.castShadow = true;
      
      group.add(trunk, p1, p2);
      
      // Random scale variation
      const scale = 0.8 + Math.random() * 0.6;
      group.scale.set(scale, scale, scale);
      group.rotation.y = Math.random() * Math.PI * 2;
    } else if (type === "apple" || type === "sugar_maple") {
      const foliageMat = new THREE.MeshStandardMaterial({ color: type === "apple" ? 0x6b8e23 : 0x8f973a, roughness: 0.8 });
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 2.0, 5), trunkMat);
      trunk.position.y = 1.0;
      trunk.castShadow = true;
      
      // Boxy/spherical canopy
      const canopy = new THREE.Mesh(new THREE.DodecahedronGeometry(1.5, 0), foliageMat);
      canopy.position.y = 3.0;
      canopy.castShadow = true;
      
      group.add(trunk, canopy);
      
      if (type === "apple") {
        // add some red dots
        const appleMat = new THREE.MeshStandardMaterial({ color: 0xc83a22, roughness: 0.4 });
        for(let i=0; i<8; i++) {
          const a = new THREE.Mesh(new THREE.SphereGeometry(0.15, 4, 4), appleMat);
          a.position.set(
            (Math.random() - 0.5) * 2.2,
            3.0 + (Math.random() - 0.5) * 2.2,
            (Math.random() - 0.5) * 2.2
          );
          group.add(a);
        }
      }
      
      const scale = 0.8 + Math.random() * 0.4;
      group.scale.set(scale, scale, scale);
      group.rotation.y = Math.random() * Math.PI * 2;
      group.rotation.z = (Math.random() - 0.5) * 0.1;
    } else if (type === "red_cedar") {
      const foliageMat = new THREE.MeshStandardMaterial({ color: 0x2e3b32, roughness: 0.9 });
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 1.0, 5), trunkMat);
      trunk.position.y = 0.5;
      trunk.castShadow = true;
      
      // Tall columnar
      const p1 = new THREE.Mesh(new THREE.CylinderGeometry(0.0, 0.8, 5.0, 5), foliageMat);
      p1.position.y = 3.0;
      p1.castShadow = true;
      
      group.add(trunk, p1);
      const scale = 0.9 + Math.random() * 0.3;
      group.scale.set(scale, scale, scale);
      group.rotation.y = Math.random() * Math.PI * 2;
    }
    
    return group;
  }

  function init(scene) {
    if (landscapeGroup) {
      scene.remove(landscapeGroup);
    }
    landscapeGroup = new THREE.Group();
    
    // Fun placements!
    const treeData = [
      { t: "spruce", x: -22, z: -25 },
      { t: "white_pine", x: -18, z: -28 },
      { t: "white_pine", x: -25, z: -18 },
      { t: "spruce", x: 14, z: -16 },
      { t: "red_cedar", x: 18, z: -5 },
      { t: "red_cedar", x: 18, z: -2 },
      { t: "red_cedar", x: 18, z: 1 },
      { t: "sugar_maple", x: -10, z: 12 },
      { t: "sugar_maple", x: 12, z: 14 },
      { t: "apple", x: -5, z: -24 },
      { t: "apple", x: -2, z: -26 },
      { t: "apple", x: 2, z: -25 },
      { t: "white_pine", x: 8, z: -28 },
      { t: "spruce", x: -28, z: 5 }
    ];

    treeData.forEach(td => {
      // Add slight random offset
      const rx = td.x + (Math.random() - 0.5) * 2;
      const rz = td.z + (Math.random() - 0.5) * 2;
      landscapeGroup.add(createTree(td.t, rx, rz));
    });

    scene.add(landscapeGroup);
  }

  return { init };
})();
