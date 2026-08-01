/**
 * Three.js 3D Scene for Maudai Premium Plots
 * Creates interactive 3D visualization of the plot layout on satellite imagery.
 */

class PlotScene {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.container = canvas.parentElement;
    this.isAdmin = options.isAdmin || false;
    this.onPlotClick = options.onPlotClick || (() => {});
    this.onPlotHover = options.onPlotHover || (() => {});
    this.onObjectSelected = options.onObjectSelected || (() => {});
    this.onInfrastructureClick = options.onInfrastructureClick || (() => {});
    this.onLayoutChanged = options.onLayoutChanged || (() => {});
    
    this.plotMeshes = {};
    this.plotsData = {};
    this.roadMeshes = [];
    this.wallMeshes = [];
    this.treeMeshes = [];
    this.amenityMeshes = [];
    this.selectedMesh = null;
    this.selectedObject = null;
    this.selectedPlotId = null;
    this.hoveredPlotId = null;
    this.isEditMode = false;
    this.currentTransformMode = 'translate';
    
    // Overlay Settings
    this.overlaySettings = {
      x: 0,
      z: 0,
      scale: 1,
      rotation: 0,
      opacity: 0.7
    };
    
    this.showLabels = true;
    this.gmapSettings = null;
    this.gmapTilesGroup = new THREE.Group();
    
    this.init();
    this.setupKeyboardListeners();
    this.animate();
  }

  toggleLabels() {
    this.showLabels = !this.showLabels;
    if (this.labelContainer) this.updateLabels();
    return this.showLabels;
  }
  
  init() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    
    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false
    });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x3a3024);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    // Scene with warm atmospheric earth fog (blends seamless into satellite horizon)
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x3a3024, 0.0025);
    
    // Camera (perspective for 3D view) framing layout matching exact customer framing in screenshot
    this.camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 800);
    this.camera.position.set(-35, 110, -90);
    this.camera.lookAt(0, 0, 0);
    
    // Controls with 360-degree slow automatic rotation
    this.controls = new THREE.OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI / 2.05;
    this.controls.minDistance = 15;
    this.controls.maxDistance = 450;
    this.controls.target.set(0, 0, 0);

    // Auto-rotate setup (Slow speed 360 degree rotation until user interacts)
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.8;
    this.controls.update();

    // Auto-stop rotation when user clicks, drags, or scrolls camera
    const stopAutoRotate = () => {
      this.controls.autoRotate = false;
    };
    this.canvas.addEventListener('pointerdown', stopAutoRotate);
    this.canvas.addEventListener('mousedown', stopAutoRotate);
    this.canvas.addEventListener('touchstart', stopAutoRotate);
    this.canvas.addEventListener('wheel', stopAutoRotate);
    
    // Master layout group for overlay + plot boxes + site wall + roads
    this.layoutGroup = new THREE.Group();
    this.scene.add(this.layoutGroup);
    
    // Add dynamic Google Maps tiles group
    this.scene.add(this.gmapTilesGroup);
    
    this.plotContainer = new THREE.Group();
    this.layoutGroup.add(this.plotContainer);
    
    this.infraContainer = new THREE.Group();
    this.layoutGroup.add(this.infraContainer);
    
    // Lighting
    this.setupLights();
    
    // Ground satellite image & extended earth terrain
    this.createGround();
    
    // Transparent Plan overlay image
    this.createPlanOverlay();
    
    // Grid helper disabled
    this.gridHelper = new THREE.GridHelper(250, 50, 0x1a2236, 0x111827);
    this.gridHelper.position.y = -0.05;
    this.gridHelper.visible = false;
    this.scene.add(this.gridHelper);
    
    // Raycaster for picking
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    
    // Event listeners
    this.canvas.addEventListener('click', (e) => this.onClick(e));
    this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    window.addEventListener('resize', () => this.onResize());
    
    // Label renderer (CSS overlay)
    this.createLabelContainer();
    
    // Load exact CAD site boundary wall & scanned road network
    this.loadInfrastructure();
    
    // Setup TransformControls for Admin Edit Mode
    if (typeof THREE.TransformControls !== 'undefined' && this.isAdmin) {
      this.transformControl = new THREE.TransformControls(this.camera, this.renderer.domElement);
      this.transformControl.addEventListener('dragging-changed', (event) => {
        this.controls.enabled = !event.value;
        if (!event.value) {
          if (this.selectedMesh) {
            this.syncMeshUserData(this.selectedMesh);
            this.updateAssetCardDims(this.selectedMesh);
          }
          if (this.onLayoutChanged) this.onLayoutChanged();
        }
      });
      this.transformControl.addEventListener('objectChange', () => {
        this.constrainSelectedObjectToLayoutPlane();
        if (this.selectedMesh) {
          this.syncMeshUserData(this.selectedMesh);
          this.updateAssetCardDims(this.selectedMesh);
        }
      });
      this.scene.add(this.transformControl);
    }
  }
  
  setupLights() {
    const ambient = new THREE.AmbientLight(0xffeedd, 0.85);
    this.scene.add(ambient);
    
    const dirLight = new THREE.DirectionalLight(0xfffaed, 1.2);
    dirLight.position.set(40, 70, 30);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 400;
    dirLight.shadow.camera.left = -150;
    dirLight.shadow.camera.right = 150;
    dirLight.shadow.camera.top = 150;
    dirLight.shadow.camera.bottom = -150;
    this.scene.add(dirLight);
    
    const fillLight = new THREE.DirectionalLight(0xdbeafe, 0.45);
    fillLight.position.set(-30, 50, -20);
    this.scene.add(fillLight);
    
    const hemiLight = new THREE.HemisphereLight(0xfffbeb, 0x453523, 0.4);
    this.scene.add(hemiLight);
  }
  
  createGround() {
    // 1. Infinite Surround Earth Terrain Base Plane (3000x3000 units)
    const earthCanvas = document.createElement('canvas');
    earthCanvas.width = 256; earthCanvas.height = 256;
    const eCtx = earthCanvas.getContext('2d');
    eCtx.fillStyle = '#4a3d2c';
    eCtx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 4000; i++) {
      eCtx.fillStyle = Math.random() > 0.5 ? 'rgba(92, 75, 54, 0.15)' : 'rgba(54, 43, 30, 0.2)';
      eCtx.fillRect(Math.random() * 256, Math.random() * 256, 4, 4);
    }
    const earthTex = new THREE.CanvasTexture(earthCanvas);
    earthTex.wrapS = THREE.RepeatWrapping;
    earthTex.wrapT = THREE.RepeatWrapping;
    earthTex.repeat.set(80, 80);

    const baseGeom = new THREE.PlaneGeometry(3000, 3000);
    const baseMat = new THREE.MeshStandardMaterial({
      map: earthTex,
      roughness: 0.95,
      metalness: 0.0
    });
    this.outerGround = new THREE.Mesh(baseGeom, baseMat);
    this.outerGround.rotation.x = -Math.PI / 2;
    this.outerGround.position.set(0, -0.2, 0);
    this.outerGround.receiveShadow = true;
    this.scene.add(this.outerGround);

    // 2. Main High-Res Satellite Map Plane (Expanded 450x380 units with Mirrored Satellite Edges)
    const loader = new THREE.TextureLoader();
    loader.load('/assets/gmap.jpg', (texture) => {
      texture.wrapS = THREE.MirrorRepeatWrapping;
      texture.wrapT = THREE.MirrorRepeatWrapping;
      texture.repeat.set(2.4, 2.4);
      texture.offset.set(-0.7, -0.7);
      
      const groundGeom = new THREE.PlaneGeometry(480, 400);
      const groundMat = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.9,
        metalness: 0.0
      });
      
      this.ground = new THREE.Mesh(groundGeom, groundMat);
      this.ground.rotation.x = -Math.PI / 2;
      this.ground.position.set(0, -0.1, 0);
      this.ground.receiveShadow = true;
      if (this.gmapSettings) this.ground.visible = false;
      this.scene.add(this.ground);
    }, undefined, () => {
      const groundGeom = new THREE.PlaneGeometry(500, 500);
      const groundMat = new THREE.MeshStandardMaterial({
        color: 0x4a3d2c,
        roughness: 0.95
      });
      this.ground = new THREE.Mesh(groundGeom, groundMat);
      this.ground.rotation.x = -Math.PI / 2;
      this.ground.position.set(0, -0.1, 0);
      this.ground.receiveShadow = true;
      if (this.gmapSettings) this.ground.visible = false;
      this.scene.add(this.ground);
    });
  }
  
  createPlanOverlay() {
    const loader = new THREE.TextureLoader();
    loader.load('/assets/plan_transparent.png', (texture) => {
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      
      const aspect = 1191 / 1684;
      const height = 100;
      const width = height * aspect;
      
      const planeGeom = new THREE.PlaneGeometry(width, height);
      const planeMat = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: this.overlaySettings.opacity,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      
      this.planOverlay = new THREE.Mesh(planeGeom, planeMat);
      this.planOverlay.rotation.x = -Math.PI / 2;
      this.planOverlay.position.set(0, 0.02, 0);
      this.layoutGroup.add(this.planOverlay);
      
      this.applyOverlayTransform();
    });
  }
  
  // Create 3D Rounded Box Geometry for all plot meshes
  createRoundedBoxGeometry(width, height, depth, radius = 0.12, bevel = 0.04) {
    const shape = new THREE.Shape();
    const w = width / 2;
    const d = depth / 2;
    const r = Math.min(radius, width / 4, depth / 4);
    
    shape.moveTo(-w + r, -d);
    shape.lineTo(w - r, -d);
    shape.quadraticCurveTo(w, -d, w, -d + r);
    shape.lineTo(w, d - r);
    shape.quadraticCurveTo(w, d, w - r, d);
    shape.lineTo(-w + r, d);
    shape.quadraticCurveTo(-w, d, -w, d - r);
    shape.lineTo(-w, -d + r);
    shape.quadraticCurveTo(-w, -d, -w + r, -d);
    
    const extrudeSettings = {
      depth: height,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: bevel,
      bevelThickness: bevel
    };
    
    const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geom.rotateX(Math.PI / 2);
    geom.center();
    return geom;
  }
  
  // Load 3D Covered Site Red Wall & Render Every Single Scanned CAD Road (Plots 1 to 96)
  loadInfrastructure() {
    if (!this.infraContainer) return;

    this.roadMeshes = [];
    this.wallMeshes = [];
    
    // Clear previous
    while (this.infraContainer.children.length > 0) {
      const child = this.infraContainer.children[0];
      this.infraContainer.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    }
    
    // 1. Render Each Individual Scanned CAD Road One-by-One from SITE_ROADS_EXACT
    const roads = (typeof SITE_ROADS_EXACT !== 'undefined') ? SITE_ROADS_EXACT : [];
    
    // Add noise texture to roads
    const roadCanvas = document.createElement('canvas');
    roadCanvas.width = 128; roadCanvas.height = 128;
    const rCtx = roadCanvas.getContext('2d');
    rCtx.fillStyle = '#222736'; // dark asphalt
    rCtx.fillRect(0,0,128,128);
    for(let i=0; i<1000; i++) {
      rCtx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.05)';
      rCtx.fillRect(Math.random()*128, Math.random()*128, 2, 2);
    }
    const roadTex = new THREE.CanvasTexture(roadCanvas);
    roadTex.wrapS = THREE.RepeatWrapping; roadTex.wrapT = THREE.RepeatWrapping;
    
    const roadMat = new THREE.MeshPhongMaterial({
      map: roadTex,
      specular: 0x222222,
      shininess: 10,
      side: THREE.DoubleSide
    });
    
    // Dashed line texture
    const dashCanvas = document.createElement('canvas');
    dashCanvas.width = 16; dashCanvas.height = 128;
    const dCtx = dashCanvas.getContext('2d');
    dCtx.fillStyle = 'rgba(255, 255, 255, 0)'; dCtx.fillRect(0,0,16,128);
    dCtx.fillStyle = '#ffffff'; dCtx.fillRect(6, 16, 4, 64);
    const dashTex = new THREE.CanvasTexture(dashCanvas);
    dashTex.wrapS = THREE.RepeatWrapping; dashTex.wrapT = THREE.RepeatWrapping;
    const lineMat = new THREE.MeshBasicMaterial({ map: dashTex, transparent: true, opacity: 0.8 });
    
    // Trees
    const treeTex = this.generateTreeTexture();
    const treeMat = new THREE.SpriteMaterial({ map: treeTex, color: 0xffffff });
    
    roads.forEach(r => {
      // Create Paved Road Mesh matching exact drawing width
      const geom = new THREE.PlaneGeometry(r.w, r.d);
      
      // clone material so we can set individual repeats
      const mat = roadMat.clone();
      mat.map = roadTex.clone();
      mat.map.repeat.set(Math.ceil(r.w/4), Math.ceil(r.d/4));
      mat.map.needsUpdate = true;
      
      const mesh = new THREE.Mesh(geom, mat);
      mesh.rotation.x = -Math.PI / 2;
      if (r.rot) mesh.rotation.z = r.rot;
      mesh.position.set(r.x, 0.04, r.z);
      mesh.userData = { isRoad: true, roadData: { ...r, id: r.id || ('road_' + this.roadMeshes.length) } };
      this.infraContainer.add(mesh);
      this.roadMeshes.push(mesh);
      
      // Add Dashed Centerline for main roads, ring road, and avenue
      if (r.type === 'main' || r.type === 'avenue' || r.type === 'ring') {
        const lineW = 0.4;
        const lineD = r.d;
        const lineGeom = new THREE.PlaneGeometry(lineW, lineD);
        const lMat = lineMat.clone();
        lMat.map = dashTex.clone();
        lMat.map.repeat.set(1, Math.ceil(r.d/6));
        lMat.map.needsUpdate = true;
        const lineMesh = new THREE.Mesh(lineGeom, lMat);
        lineMesh.position.set(0, 0, 0.01); // Local coordinates relative to road!
        mesh.add(lineMesh); // Add as child of road mesh so it inherits rotation perfectly
        
      }
    });

    // 2. Render 3D Covered Site Red Perimeter Small Wall from exact CAD red vector lines (Y = 0.4 to 0.9)
    const wallSegments = (typeof SITE_WALL_SEGMENTS !== 'undefined') ? SITE_WALL_SEGMENTS : [];
    const wallMat = new THREE.MeshPhongMaterial({
      color: 0xef4444,
      emissive: 0xdc2626,
      emissiveIntensity: 0.5,
      shininess: 60
    });
    
    const capMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.2
    });
    
    wallSegments.forEach((entry, index) => {
      const wallData = this.normalizeWallSegment(entry, index);
      if (!wallData) return;

      const group = new THREE.Group();
      group.position.set(wallData.x, 0, wallData.z);
      group.rotation.y = wallData.rot;
      group.userData = { isWall: true, wallData };

      const wallGeom = new THREE.BoxGeometry(wallData.thickness, wallData.height, wallData.len + 0.04);
      const wallMesh = new THREE.Mesh(wallGeom, wallMat.clone());
      wallMesh.position.y = wallData.height / 2;
      wallMesh.castShadow = true;
      wallMesh.receiveShadow = true;
      group.add(wallMesh);

      const capGeom = new THREE.BoxGeometry(wallData.capWidth, wallData.capHeight, wallData.len + 0.04);
      const capMesh = new THREE.Mesh(capGeom, capMat.clone());
      capMesh.position.y = wallData.height + (wallData.capHeight / 2);
      capMesh.castShadow = true;
      capMesh.receiveShadow = true;
      group.add(capMesh);

      const wallLineMat = new THREE.LineBasicMaterial({ color: 0xff0000 });
      const wallLineGeom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, wallData.height + wallData.capHeight + 0.02, -(wallData.len / 2)),
        new THREE.Vector3(0, wallData.height + wallData.capHeight + 0.02, wallData.len / 2)
      ]);
      const wallLine = new THREE.Line(wallLineGeom, wallLineMat);
      group.add(wallLine);

      const hitGeom = new THREE.BoxGeometry(Math.max(wallData.capWidth, 0.5), wallData.height + wallData.capHeight + 0.08, wallData.len + 0.12);
      const hitMat = new THREE.MeshBasicMaterial({ visible: true, transparent: true, opacity: 0.001, depthWrite: false });
      const hitBox = new THREE.Mesh(hitGeom, hitMat);
      hitBox.position.y = (wallData.height + wallData.capHeight) / 2;
      hitBox.userData = { isHitBox: true };
      group.add(hitBox);

      this.infraContainer.add(group);
      this.wallMeshes.push(group);
    });
    
    // Load any saved custom trees & amenities
    this.loadCustomAssets();
  }
  
  getDimensionsFromArea(area) {
    if (!area) return '30x40';
    if (area >= 3000) return '50x60';
    if (area >= 2400) return '40x60';
    if (area >= 1500) return '30x50';
    if (area >= 1200) return '30x40';
    if (area >= 1000) return '25x40';
    return '20x40';
  }

  formatAreaSqFt(area) {
    if (!Number.isFinite(area) || area <= 0) return '';
    const hasDecimals = Math.abs(area % 1) > 0.0001;
    return `${area.toLocaleString('en-IN', {
      minimumFractionDigits: hasDecimals ? 2 : 0,
      maximumFractionDigits: 2
    })} Sq.Ft.`;
  }

  getExactPlotDimensionText(plotId) {
    const plotData = this.plotsData[plotId] || {};
    if (plotData.dimensions_str) {
      return plotData.dimensions_str;
    }

    const dimBadge = typeof PLOT_DIM_BADGES !== 'undefined' && PLOT_DIM_BADGES[plotId] ? PLOT_DIM_BADGES[plotId] : '';
    if (dimBadge.includes('(')) {
      return dimBadge.split('(')[0].trim();
    }
    if (dimBadge.includes('x')) {
      const parts = dimBadge.split('x');
      return `${parts[0]}' × ${parts[1]}'`;
    }
    return dimBadge || 'CAD Dimensions';
  }

  getExactPlotAreaText(plotId) {
    const plotData = this.plotsData[plotId] || {};
    if (Number.isFinite(Number(plotData.area))) {
      return this.formatAreaSqFt(Number(plotData.area));
    }

    const rawArea = typeof PLOT_AREAS !== 'undefined' ? PLOT_AREAS[plotId] : null;
    return rawArea ? this.formatAreaSqFt(Number(rawArea)) : '';
  }

  generatePlotTexture(plotId, status) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    
    const isSold = status === 'sold';
    const isReserved = status === 'reserved';
    
    const bgColor = isSold ? '#fee2e2' : isReserved ? '#fef3c7' : '#e2e8f0';
    const borderColor = isSold ? '#dc2626' : isReserved ? '#d97706' : '#2563eb';
    
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, 256, 256);

    // Subtle texture noise grain for premium 3D look
    for (let i = 0; i < 1200; i++) {
      ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)';
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 3, 3);
    }

    // Crisp outer border
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, 246, 246);

    // Subtle inner accent border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 4;
    ctx.strokeRect(12, 12, 232, 232);

    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    return texture;
  }

  generateTreeTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const cx = 64, cy = 64;
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = '#1a4314';
    ctx.beginPath(); ctx.arc(cx, cy, 45, 0, Math.PI*2); ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = '#2c5e23';
    for(let i=0; i<5; i++) {
      const angle = (i/5) * Math.PI * 2;
      ctx.beginPath(); ctx.arc(cx + Math.cos(angle)*16, cy + Math.sin(angle)*16, 26, 0, Math.PI*2); ctx.fill();
    }
    ctx.fillStyle = '#448a33';
    for(let i=0; i<4; i++) {
      const angle = (i/4) * Math.PI * 2;
      ctx.beginPath(); ctx.arc(cx + Math.cos(angle)*10, cy + Math.sin(angle)*10, 16, 0, Math.PI*2); ctx.fill();
    }
    return new THREE.CanvasTexture(canvas);
  }

  normalizeWallSegment(entry, index = 0) {
    if (Array.isArray(entry) && entry.length >= 4) {
      const dx = entry[2] - entry[0];
      const dz = entry[3] - entry[1];
      const len = Math.sqrt(dx * dx + dz * dz);
      if (len <= 0.05) return null;
      return {
        id: 'wall_' + index,
        x: (entry[0] + entry[2]) / 2,
        z: (entry[1] + entry[3]) / 2,
        len,
        rot: Math.atan2(dx, dz),
        thickness: 0.24,
        height: 0.8,
        capWidth: 0.30,
        capHeight: 0.1
      };
    }

    if (!entry || typeof entry !== 'object') return null;

    const len = Number(entry.len || entry.length || 0);
    if (len <= 0.05) return null;

    return {
      id: entry.id || ('wall_' + index),
      x: Number(entry.x || 0),
      z: Number(entry.z || 0),
      len,
      rot: Number(entry.rot || 0),
      thickness: Number(entry.thickness || 0.24),
      height: Number(entry.height || 0.8),
      capWidth: Number(entry.capWidth || 0.30),
      capHeight: Number(entry.capHeight || 0.1)
    };
  }

  // Create uniform 3D rounded plot meshes for all 96 plots (zero overlap)
  createPlots(plotsData) {
    this.plotsData = plotsData || {};
    Object.values(this.plotMeshes).forEach(mesh => {
      this.plotContainer.remove(mesh);
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) mesh.material.dispose();
    });
    this.plotMeshes = {};
    
    for (let i = 1; i <= 96; i++) {
      const pos3d = plotTo3D(i);
      if (!pos3d) continue;
      
      const plotData = (plotsData && (plotsData[i] || plotsData[String(i)])) || { status: 'available' };
      const statusColors = STATUS_COLORS[plotData.status] || STATUS_COLORS.available;
      
      // Uniform plot block heights across all plots (decreased by 80%)
      const height = (plotData.status === 'sold' ? 0.6 : 
                      plotData.status === 'reserved' ? 1.0 : 1.4) * 0.2;
      
      let geometry;
      const pts = pos3d.polygon;
      if (pts && Array.isArray(pts) && pts.length >= 3) {
        const shape = new THREE.Shape();
        shape.moveTo(pts[0][0], pts[0][1]);
        for (let k = 1; k < pts.length; k++) {
          shape.lineTo(pts[k][0], pts[k][1]);
        }
        shape.lineTo(pts[0][0], pts[0][1]);
        
        const extrudeSettings = {
          depth: height,
          bevelEnabled: true,
          bevelSegments: 2,
          steps: 1,
          bevelSize: Math.min(0.015, height * 0.15),
          bevelThickness: Math.min(0.015, height * 0.15)
        };
        geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        geometry.rotateX(Math.PI / 2);
        geometry.center();
      } else {
        // 0.85 scale guarantees 15% spacing channel so NO plot boxes overlap!
        const boxW = Math.max(0.4, pos3d.width * 0.85);
        const boxD = Math.max(0.4, pos3d.depth * 0.85);
        geometry = this.createRoundedBoxGeometry(boxW, height, boxD, 0.08, 0.015);
      }

      // Orient texture UVs correctly so mesh text is un-mirrored and right-side up to camera view
      geometry.computeBoundingBox();
      const box = geometry.boundingBox;
      const sizeX = box.max.x - box.min.x;
      const sizeZ = box.max.z - box.min.z;
      const uvAttr = geometry.attributes.uv;
      const posAttr = geometry.attributes.position;
      if (uvAttr && posAttr) {
        for (let v = 0; v < posAttr.count; v++) {
          const px = posAttr.getX(v);
          const pz = posAttr.getZ(v);
          const u = sizeX > 0 ? 1 - (px - box.min.x) / sizeX : 0.5;
          const vUv = sizeZ > 0 ? 1 - (pz - box.min.z) / sizeZ : 0.5;
          uvAttr.setXY(v, u, vUv);
        }
        uvAttr.needsUpdate = true;
      }
      
      const topTex = this.generatePlotTexture(i, plotData.status);
      const topMat = new THREE.MeshPhongMaterial({
        map: topTex,
        color: 0xffffff,
        transparent: true,
        opacity: statusColors.opacity,
        shininess: 20,
        side: THREE.DoubleSide
      });
      
      const sideMat = new THREE.MeshPhongMaterial({
        color: statusColors.color,
        transparent: true,
        opacity: statusColors.opacity,
        emissive: statusColors.emissive,
        emissiveIntensity: 0.25,
        shininess: 80,
        specular: 0x444444,
        side: THREE.DoubleSide
      });
      
      const material = [topMat, sideMat];
      
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(pos3d.x, height / 2 + 0.05, pos3d.z);
      if (pos3d.rotation) {
        mesh.rotation.y = -pos3d.rotation;
      }
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = { plotId: i };
      if (pts && Array.isArray(pts) && pts.length >= 3) {
        mesh.userData.localPolygon = pts.map(pt => [pt[0] - pos3d.x, pt[1] - pos3d.z]);
      }
      
      // Crisp white wireframe edge outline for rounded boxes
      const edges = new THREE.EdgesGeometry(geometry);
      const lineMat = new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.45
      });
      const wireframe = new THREE.LineSegments(edges, lineMat);
      mesh.add(wireframe);
      
      this.plotContainer.add(mesh);
      this.plotMeshes[i] = mesh;
    }
    
    this.updateLabels();
  }
  
  updatePlot(plotId, plotData) {
    const mesh = this.plotMeshes[plotId];
    if (!mesh) return;
    
    if (plotData) {
      this.plotsData[plotId] = { ...(this.plotsData[plotId] || {}), ...plotData };
    }
    
    const statusColors = STATUS_COLORS[plotData.status] || STATUS_COLORS.available;
    const height = plotData.status === 'sold' ? 0.6 : 
                   plotData.status === 'reserved' ? 1.0 : 1.4;
    
    const sideMat = mesh.material[1];
    const topMat = mesh.material[0];
    
    sideMat.color.setHex(statusColors.color);
    sideMat.emissive.setHex(statusColors.emissive);
    sideMat.opacity = statusColors.opacity;
    topMat.opacity = statusColors.opacity;
    
    // Regenerate texture for new status color
    if (topMat.map) topMat.map.dispose();
    topMat.map = this.generatePlotTexture(plotId, plotData.status);
    topMat.needsUpdate = true;
    
    const targetY = height / 2 + 0.05;
    mesh.scale.y = height / mesh.geometry.parameters.options.depth;
    mesh.position.y = targetY;
    
    this.updateLabels();
  }
  
  selectPlot(plotId) {
    if (this.selectedPlotId && this.plotMeshes[this.selectedPlotId]) {
      const prevMesh = this.plotMeshes[this.selectedPlotId];
      prevMesh.material[1].emissiveIntensity = 0.25;
      prevMesh.scale.set(1, prevMesh.scale.y, 1);
    }
    
    this.selectedPlotId = plotId;
    
    if (plotId && this.plotMeshes[plotId]) {
      const mesh = this.plotMeshes[plotId];
      mesh.material[1].emissiveIntensity = 0.6;
      mesh.scale.set(1.08, mesh.scale.y, 1.08);
      
      const worldPos = new THREE.Vector3();
      mesh.getWorldPosition(worldPos);
      this.smoothLookAt(worldPos.x, worldPos.z);
    }

    this.updateLabels();
  }
  
  smoothLookAt(x, z) {
    const target = this.controls.target;
    const dx = x - target.x;
    const dz = z - target.z;
    
    if (Math.abs(dx) > 10 || Math.abs(dz) > 10) {
      const startX = target.x;
      const startZ = target.z;
      const duration = 600;
      const startTime = Date.now();
      
      const animateTarget = () => {
        const elapsed = Date.now() - startTime;
        const t = Math.min(elapsed / duration, 1);
        const ease = t * (2 - t);
        
        this.controls.target.x = startX + dx * ease;
        this.controls.target.z = startZ + dz * ease;
        
        if (t < 1) {
          requestAnimationFrame(animateTarget);
        }
      };
      animateTarget();
    }
  }
  
  createLabelContainer() {
    this.labelContainer = document.createElement('div');
    this.labelContainer.id = 'plot-labels-container';
    this.labelContainer.style.cssText = `
      position: absolute; top: 0; left: 0; width: 100%; height: 100%;
      pointer-events: none; z-index: 5; overflow: hidden;
    `;
    this.container.appendChild(this.labelContainer);
  }
  
  updateLabels() {
    if (!this.labelContainer) return;
    if (this.canvas && this.canvas.style.display === 'none') {
      this.labelContainer.style.display = 'none';
      return;
    }
    this.labelContainer.style.display = 'block';
    this.labelContainer.innerHTML = '';
    if (this.showLabels === false) return;
    
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const worldPos = new THREE.Vector3();
    const cameraPos = this.camera.position;
    
    const isMobile = w <= 768;
    const benchmarkPlotIds = new Set([1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 96]);

    // Render plot labels dynamically based on camera distance
    for (const [id, mesh] of Object.entries(this.plotMeshes)) {
      mesh.getWorldPosition(worldPos);
      worldPos.y += 1.8;
      worldPos.project(this.camera);
      
      const screenX = (worldPos.x * 0.5 + 0.5) * w;
      const screenY = (-worldPos.y * 0.5 + 0.5) * h;
      
      if (worldPos.z > 0 && worldPos.z < 1 &&
          screenX > 0 && screenX < w &&
          screenY > 0 && screenY < h) {
        
        const currentWorldPos = new THREE.Vector3();
        mesh.getWorldPosition(currentWorldPos);
        const dist = cameraPos.distanceTo(currentWorldPos);
        
        const isSelected = (id == this.selectedPlotId || parseInt(id) === parseInt(this.selectedPlotId));
        const numId = parseInt(id);
        const isFar = isMobile ? dist > 45 : dist > 75;

        // Skip non-benchmark labels when zoomed far out on mobile overview
        if (isFar && !isSelected && !benchmarkPlotIds.has(numId)) {
          continue;
        }

        const detailDistThreshold = isMobile ? 30 : 45;

        if (dist < 160 || isSelected) {
          const label = document.createElement('div');
          const plotData = this.plotsData[id] || {};
          const isSold = plotData.status === 'sold';
          const isReserved = plotData.status === 'reserved';
          
          const dimStr = this.getExactPlotDimensionText(id);
          const areaStr = this.getExactPlotAreaText(id);

          const zIndex = isSelected ? 99999 : 10;
          const labelTransform = isSelected ? 'translate(-50%, -50%) scale(1.15)' : 'translate(-50%, -50%)';

          if (dist < detailDistThreshold || isSelected) {
            // CLOSE-UP ZOOM or SELECTED PLOT: Glassmorphic Semi-transparent Full Card
            let bgStyle = isSold 
              ? 'background: rgba(254, 226, 226, 0.82); border: 1.5px solid #dc2626; box-shadow: 0 4px 14px rgba(220, 38, 38, 0.3);' 
              : isReserved
              ? 'background: rgba(254, 243, 199, 0.82); border: 1.5px solid #f59e0b; box-shadow: 0 4px 14px rgba(245, 158, 11, 0.3);'
              : 'background: rgba(15, 23, 42, 0.65); border: 1px solid rgba(56, 189, 248, 0.6); box-shadow: 0 4px 14px rgba(0,0,0,0.5);';

            if (isSelected) {
              bgStyle = 'background: rgba(15, 23, 42, 0.94); border: 2px solid #38bdf8; box-shadow: 0 0 25px rgba(56, 189, 248, 0.95), 0 8px 22px rgba(0,0,0,0.85);';
            }

            label.style.cssText = `
              position: absolute;
              left: ${screenX}px;
              top: ${screenY}px;
              transform: ${labelTransform};
              ${bgStyle}
              backdrop-filter: blur(6px);
              -webkit-backdrop-filter: blur(6px);
              color: white;
              font-family: 'Outfit', 'Segoe UI', sans-serif;
              font-weight: 700;
              font-size: ${isMobile ? '9.5px' : '10.5px'};
              line-height: 1.25;
              padding: ${isMobile ? '3px 6px' : '5px 9px'};
              border-radius: 8px;
              pointer-events: none;
              white-space: nowrap;
              text-align: center;
              z-index: ${zIndex};
              transition: transform 0.15s ease, box-shadow 0.15s ease;
            `;

            if (isSold) {
              const priceStr = (plotData.price && Number(plotData.price) > 0)
                ? `<div style="color:#dc2626; font-weight:800; font-size:${isMobile ? '9px' : '10px'}; margin-top:1px;">₹ ${Number(plotData.price).toLocaleString('en-IN')}</div>`
                : '';
              label.innerHTML = `
                <div style="font-weight:900; color:${isSelected ? '#38bdf8' : '#991b1b'}; font-size:${isMobile ? '10px' : '11.5px'};">Plot ${id} ${isSelected ? '★' : ''}</div>
                <div style="font-weight:900; color:#dc2626; font-size:${isMobile ? '9.5px' : '11px'}; background:rgba(254, 226, 226, 0.9); border:1px solid #fca5a5; padding:1px 5px; border-radius:4px; margin-top:2px;">SOLD</div>
                ${priceStr}
              `;
            } else if (isReserved) {
              const priceStr = (plotData.price && Number(plotData.price) > 0)
                ? `<div style="color:#d97706; font-weight:800; font-size:${isMobile ? '9px' : '10px'}; margin-top:1px;">₹ ${Number(plotData.price).toLocaleString('en-IN')}</div>`
                : '';
              label.innerHTML = `
                <div style="font-weight:900; color:${isSelected ? '#38bdf8' : '#78350f'}; font-size:${isMobile ? '10px' : '11.5px'};">Plot ${id} ${isSelected ? '★' : ''}</div>
                <div style="font-weight:900; color:#d97706; font-size:${isMobile ? '9px' : '10.5px'}; background:rgba(254, 243, 199, 0.9); border:1px solid #fcd34d; padding:1px 5px; border-radius:4px; margin-top:2px;">RESERVED</div>
                ${priceStr}
              `;
            } else {
              const priceStr = (plotData.price && Number(plotData.price) > 0)
                ? `<div style="color:#22c55e; font-weight:800; font-size:${isMobile ? '9.5px' : '10.5px'}; margin-top:1px; background: rgba(34, 197, 94, 0.15); border: 1px solid rgba(34, 197, 94, 0.4); padding: 1px 5px; border-radius: 4px;">₹ ${Number(plotData.price).toLocaleString('en-IN')}</div>`
                : '';
              label.innerHTML = `
                <div style="font-weight:900; color:#38bdf8; font-size:${isMobile ? '10px' : '11.5px'};">Plot ${id} ${isSelected ? ' (Selected)' : ''}</div>
                <div style="color:#f8fafc; font-weight:600; font-size:${isMobile ? '9px' : '10px'}; margin-top:1px;">${dimStr ? dimStr : 'CAD Specs'}</div>
                <div style="color:#f43f5e; font-weight:800; font-size:${isMobile ? '9px' : '10px'}; margin-top:1px;">${areaStr}</div>
                ${priceStr}
              `;
            }
          } else {
            // OVERVIEW / UNSELECTED: Sleek Glassmorphic Semi-transparent Compact Pill Badge
            const bgStyle = isSold 
              ? 'background: rgba(220, 38, 38, 0.7); border-color: rgba(239, 68, 68, 0.8); color: #ffffff;' 
              : isReserved
              ? 'background: rgba(245, 158, 11, 0.7); border-color: rgba(251, 191, 36, 0.8); color: #ffffff;'
              : 'background: rgba(15, 23, 42, 0.55); border-color: rgba(56, 189, 248, 0.6); color: #38bdf8;';

            label.style.cssText = `
              position: absolute;
              left: ${screenX}px;
              top: ${screenY}px;
              transform: ${labelTransform};
              ${bgStyle}
              backdrop-filter: blur(4px);
              -webkit-backdrop-filter: blur(4px);
              font-family: 'Outfit', 'Segoe UI', sans-serif;
              font-weight: 800;
              font-size: ${isMobile ? '9px' : '10px'};
              padding: ${isMobile ? '1.5px 5px' : '2px 6px'};
              border-radius: 6px;
              border: 1px solid;
              box-shadow: 0 2px 6px rgba(0,0,0,0.4);
              pointer-events: none;
              white-space: nowrap;
              z-index: ${zIndex};
            `;
            const priceSuffix = (plotData.price && Number(plotData.price) > 0) ? ` · ₹${Number(plotData.price).toLocaleString('en-IN')}` : '';
            label.textContent = isSold ? `${id}` : (isReserved ? `${id}` : `${id}${priceSuffix}`);
          }
          this.labelContainer.appendChild(label);
        }
      }
    }
    
    // Render 3D Road Specification Badges only when camera is close (dist < 80)
    if (this.roadMeshes.length > 0) {
      this.roadMeshes.forEach(mesh => {
        const currentWorldPos = new THREE.Vector3();
        mesh.getWorldPosition(currentWorldPos);
        const dist = cameraPos.distanceTo(currentWorldPos);
        
        // Hide road badges when zoomed out to prevent crowding
        if (dist > 80) return;
        
        worldPos.set(0, 0.4, 0);
        mesh.localToWorld(worldPos);
        worldPos.project(this.camera);
        
        const screenX = (worldPos.x * 0.5 + 0.5) * w;
        const screenY = (-worldPos.y * 0.5 + 0.5) * h;
        
        if (worldPos.z > 0 && worldPos.z < 1 &&
            screenX > 20 && screenX < w - 20 &&
            screenY > 20 && screenY < h - 20) {
          
          const label = document.createElement('div');
          const roadData = mesh.userData?.roadData || {};
          const bgGradient = roadData.type === 'ring' ? 'linear-gradient(135deg, rgba(239,68,68,0.9) 0%, rgba(245,158,11,0.9) 100%)' :
                             roadData.type === 'main' ? 'linear-gradient(135deg, rgba(59,130,246,0.9) 0%, rgba(139,92,246,0.9) 100%)' :
                             roadData.type === 'avenue' ? 'linear-gradient(135deg, rgba(16,185,129,0.9) 0%, rgba(59,130,246,0.9) 100%)' :
                             'linear-gradient(135deg, rgba(30,41,59,0.9) 0%, rgba(51,65,85,0.9) 100%)';
          
          label.style.cssText = `
            position: absolute;
            left: ${screenX}px;
            top: ${screenY}px;
            transform: translate(-50%, -50%);
            background: ${bgGradient};
            color: #ffffff;
            font-family: 'Outfit', sans-serif;
            font-weight: 700;
            font-size: 10px;
            padding: 3px 8px;
            border-radius: 12px;
            border: 1px solid rgba(255,255,255,0.6);
            box-shadow: 0 2px 8px rgba(0,0,0,0.6);
            pointer-events: none;
            white-space: nowrap;
          `;
          label.textContent = roadData.name || 'Road';
          this.labelContainer.appendChild(label);
        }
      });
    }

  }
  
  applyOverlayTransform() {
    if (!this.layoutGroup) return;
    
    if (this.gmapSettings) {
      this.layoutGroup.position.set(0, 0, 0);
      this.layoutGroup.scale.set(1, 1, 1);
      this.layoutGroup.rotation.set(0, 0, 0);
      return;
    }
    
    const x = this.overlaySettings.x || 0;
    const z = this.overlaySettings.z !== undefined ? this.overlaySettings.z : (this.overlaySettings.y || 0);
    const scale = this.overlaySettings.scale !== undefined ? this.overlaySettings.scale : 1;
    const rotation = this.overlaySettings.rotation || 0;
    
    this.layoutGroup.position.x = x;
    this.layoutGroup.position.z = z;
    this.layoutGroup.scale.set(scale, scale, scale);
    this.layoutGroup.rotation.y = (rotation * Math.PI) / 180;
  }
  
  setOverlayPosition(x, z) {
    this.overlaySettings.x = x;
    this.overlaySettings.z = z;
    this.overlaySettings.y = z;
    this.applyOverlayTransform();
  }
  
  setOverlayScale(value) {
    this.overlaySettings.scale = value;
    this.applyOverlayTransform();
  }
  
  setOverlayRotation(degrees) {
    this.overlaySettings.rotation = degrees;
    this.applyOverlayTransform();
  }
  
  setOverlayOpacity(value) {
    this.overlaySettings.opacity = value;
    if (this.planOverlay) {
      this.planOverlay.material.opacity = value;
    }
  }

  latLngToLocal(lat, lng) {
    const baseLat = this.gmapSettings?.lat || 22.088368;
    const baseLng = this.gmapSettings?.lng || 78.863390;
    const rotation = this.gmapSettings?.rotation || 0;
    const scale = this.gmapSettings?.scale || 1.0;
    
    const dLat = lat - baseLat;
    const dLng = lng - baseLng;
    
    const meterScale = 0.52 * scale;
    const rz = (-dLat * 111320) / meterScale;
    const rx = (dLng * 111320 * Math.cos((baseLat * Math.PI) / 180)) / meterScale;
    
    const rad = (-rotation * Math.PI) / 180;
    const x = rx * Math.cos(rad) - rz * Math.sin(rad);
    const z = rx * Math.sin(rad) + rz * Math.cos(rad);
    
    return { x, z };
  }

  setGMapPlacement(settings) {
    if (!settings) return;
    this.gmapSettings = settings;
    
    // When using Google Map placement, reset layoutGroup to defaults to prevent offset issues
    if (this.layoutGroup) {
      this.layoutGroup.position.set(0, 0, 0);
      this.layoutGroup.scale.set(1, 1, 1);
      this.layoutGroup.rotation.set(0, 0, 0);
    }
    
    // Hide static ground texture & base earth plane to avoid overlaps & black borders
    if (this.ground) this.ground.visible = false;
    if (this.outerGround) this.outerGround.visible = false;
    if (this.planOverlay) this.planOverlay.visible = false; // Hide PDF blueprint overlay
    
    this.loadGMapTiles();
  }

  loadGMapTiles() {
    if (!this.gmapSettings) return;
    
    // Clear any existing tiles
    while (this.gmapTilesGroup.children.length > 0) {
      const child = this.gmapTilesGroup.children[0];
      this.gmapTilesGroup.remove(child);
      if (child.children && child.children.length > 0) {
        child.children.forEach(mesh => {
          if (mesh.geometry) mesh.geometry.dispose();
          if (mesh.material) {
            if (Array.isArray(mesh.material)) {
              mesh.material.forEach(m => m.dispose());
            } else {
              mesh.material.dispose();
            }
          }
        });
      }
    }
    
    const baseLat = this.gmapSettings.lat || 22.088368;
    const baseLng = this.gmapSettings.lng || 78.863390;
    const rotation = this.gmapSettings.rotation || 0;
    const scale = this.gmapSettings.scale || 1.0;
    
    const z = 18; // Zoom level 18
    
    const lng2tile = (lon, zoom) => Math.floor((lon + 180) / 360 * Math.pow(2, zoom));
    const lat2tile = (lat, zoom) => Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
    const tile2lng = (x, zoom) => (x / Math.pow(2, zoom) * 360 - 180);
    const tile2lat = (y, zoom) => {
      const n = Math.PI - 2 * Math.PI * y / Math.pow(2, zoom);
      return (180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))));
    };
    
    const centerTileX = lng2tile(baseLng, z);
    const centerTileY = lat2tile(baseLat, z);
    
    const radius = 6; // 13x13 grid covers ~2km x 2km
    const textureLoader = new THREE.TextureLoader();
    
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        const tx = centerTileX + dx;
        const ty = centerTileY + dy;
        
        const lngLeft = tile2lng(tx, z);
        const lngRight = tile2lng(tx + 1, z);
        const latTop = tile2lat(ty, z);
        const latBottom = tile2lat(ty + 1, z);
        
        // Project all four tile corners with the same geo->local math used by 2D view.
        // This keeps 3D satellite tiles aligned with the saved map placement exactly.
        const topLeft = this.latLngToLocal(latTop, lngLeft);
        const topRight = this.latLngToLocal(latTop, lngRight);
        const bottomLeft = this.latLngToLocal(latBottom, lngLeft);
        const bottomRight = this.latLngToLocal(latBottom, lngRight);

        const geom = new THREE.BufferGeometry();
        const tileY = -0.08;
        const vertices = new Float32Array([
          topLeft.x, tileY, topLeft.z,
          bottomLeft.x, tileY, bottomLeft.z,
          topRight.x, tileY, topRight.z,
          bottomRight.x, tileY, bottomRight.z
        ]);
        const uvs = new Float32Array([
          0, 1,
          0, 0,
          1, 1,
          1, 0
        ]);
        const indices = [0, 1, 2, 2, 1, 3];

        geom.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        geom.setIndex(indices);
        geom.computeVertexNormals();
        
        const sub = Math.floor(Math.random() * 4);
        const mapType = this.gmapSettings?.mapType || 'hybrid';
        const lyrs = mapType === 'satellite' ? 's' : (mapType === 'roadmap' ? 'm' : 'y');
        const url = `https://mt${sub}.google.com/vt/lyrs=${lyrs}&x=${tx}&y=${ty}&z=${z}`;
        
        textureLoader.load(url, (texture) => {
          const mat = new THREE.MeshStandardMaterial({
            map: texture,
            roughness: 0.9,
            metalness: 0.0,
            side: THREE.DoubleSide
          });
          
          const mesh = new THREE.Mesh(geom, mat);
          mesh.receiveShadow = true;
          this.gmapTilesGroup.add(mesh);
        }, undefined, (err) => {
          console.error("Failed to load Google Map satellite tile:", url, err);
        });
      }
    }
  }
  
  setTopView() {
    const targetX = this.layoutGroup ? this.layoutGroup.position.x : 0;
    const targetZ = this.layoutGroup ? this.layoutGroup.position.z : 0;
    this.animateCamera(
      { x: targetX, y: 110, z: targetZ + 0.1 },
      { x: targetX, y: 0, z: targetZ }
    );
  }
  
  set3DView() {
    const targetX = this.layoutGroup ? this.layoutGroup.position.x : 0;
    const targetZ = this.layoutGroup ? this.layoutGroup.position.z : 0;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.8;
    this.animateCamera(
      { x: targetX - 50, y: 55, z: targetZ - 45 },
      { x: targetX, y: 0, z: targetZ }
    );
  }
  
  resetView() {
    const targetX = this.layoutGroup ? this.layoutGroup.position.x : 0;
    const targetZ = this.layoutGroup ? this.layoutGroup.position.z : 0;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.8;
    this.animateCamera(
      { x: targetX - 50, y: 55, z: targetZ - 45 },
      { x: targetX, y: 0, z: targetZ }
    );
  }
  
  zoomIn() {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    this.camera.position.addScaledVector(dir, 12);
  }
  
  zoomOut() {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    this.camera.position.addScaledVector(dir, -12);
  }
  
  animateCamera(targetPos, targetLook) {
    const startPos = {
      x: this.camera.position.x,
      y: this.camera.position.y,
      z: this.camera.position.z
    };
    const startLook = {
      x: this.controls.target.x,
      y: this.controls.target.y,
      z: this.controls.target.z
    };
    
    const duration = 800;
    const startTime = Date.now();
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const t = Math.min(elapsed / duration, 1);
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      
      this.camera.position.set(
        startPos.x + (targetPos.x - startPos.x) * ease,
        startPos.y + (targetPos.y - startPos.y) * ease,
        startPos.z + (targetPos.z - startPos.z) * ease
      );
      
      this.controls.target.set(
        startLook.x + (targetLook.x - startLook.x) * ease,
        startLook.y + (targetLook.y - startLook.y) * ease,
        startLook.z + (targetLook.z - startLook.z) * ease
      );
      
      if (t < 1) {
        requestAnimationFrame(animate);
      }
    };
    animate();
  }
  
  create3DTreeMesh(x = 0, z = 0, treeId = null, name = 'Tree Asset') {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    
    // 1. Tapered Natural Trunk (Dark Bark)
    const trunkGeom = new THREE.CylinderGeometry(0.2, 0.45, 2.2, 10);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3d2616, roughness: 0.95 });
    const trunk = new THREE.Mesh(trunkGeom, trunkMat);
    trunk.position.y = 1.1;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    group.add(trunk);
    
    // 2. Realistic Organic Multi-Lobed Foliage Crown (Layered Geodesic Clusters)
    const crownGroup = new THREE.Group();
    crownGroup.position.y = 2.4;
    
    const foliageColors = [0x1e4620, 0x2d6a4f, 0x40916c, 0x52b788, 0x1b4332];
    const clusterPositions = [
      { x: 0, y: 1.2, z: 0, r: 1.4 },
      { x: -0.7, y: 0.6, z: 0.5, r: 1.1 },
      { x: 0.8, y: 0.7, z: -0.4, r: 1.1 },
      { x: 0.4, y: 0.5, z: 0.8, r: 1.0 },
      { x: -0.6, y: 0.8, z: -0.6, r: 1.0 },
      { x: 0, y: 1.8, z: 0, r: 0.9 }
    ];
    
    clusterPositions.forEach((pos, idx) => {
      const geom = new THREE.DodecahedronGeometry(pos.r, 1);
      const mat = new THREE.MeshStandardMaterial({
        color: foliageColors[idx % foliageColors.length],
        roughness: 0.7,
        metalness: 0.05,
        flatShading: true
      });
      const blob = new THREE.Mesh(geom, mat);
      blob.position.set(pos.x, pos.y, pos.z);
      blob.rotation.set(idx, idx * 0.5, idx * 0.3);
      blob.castShadow = true;
      blob.receiveShadow = true;
      crownGroup.add(blob);
    });
    
    group.add(crownGroup);
    
    // 3. Invisible Hit Box (Generous 4.4-unit diameter volume for effortless 1-click selection in 3D!)
    const hitGeom = new THREE.CylinderGeometry(2.2, 2.2, 4.5, 12);
    const hitMat = new THREE.MeshBasicMaterial({
      visible: true,
      transparent: true,
      opacity: 0.001,
      depthWrite: false
    });
    const hitBox = new THREE.Mesh(hitGeom, hitMat);
    hitBox.position.y = 2.25;
    hitBox.userData = { isHitBox: true };
    group.add(hitBox);
    
    group.userData = {
      isTree: true,
      treeId: treeId || ('tree_custom_' + Date.now()),
      name: name
    };
    
    return group;
  }

  setSelectionHighlight(mesh) {
    if (this.selectionBoxHelper) {
      this.scene.remove(this.selectionBoxHelper);
      if (this.selectionBoxHelper.geometry) this.selectionBoxHelper.geometry.dispose();
      this.selectionBoxHelper = null;
    }
    
    if (!mesh) return;
    
    mesh.updateMatrixWorld(true);
    
    const boxHelper = new THREE.BoxHelper(mesh, 0x38bdf8); // Bright neon cyan selection box
    boxHelper.material.linewidth = 3;
    boxHelper.material.depthTest = false;
    boxHelper.material.transparent = true;
    boxHelper.material.opacity = 0.95;
    
    this.selectionBoxHelper = boxHelper;
    this.scene.add(this.selectionBoxHelper);
  }

  createVertexHandles(mesh) {
    this.clearVertexHandles();
    if (!mesh) return;

    mesh.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(mesh);
    const min = box.min;
    const max = box.max;
    const y = max.y + 0.1;

    const corners = [
      new THREE.Vector3(min.x, y, min.z), // Top-Left
      new THREE.Vector3(max.x, y, min.z), // Top-Right
      new THREE.Vector3(max.x, y, max.z), // Bottom-Right
      new THREE.Vector3(min.x, y, max.z)  // Bottom-Left
    ];

    this.vertexHandlesGroup = new THREE.Group();

    corners.forEach((pos, idx) => {
      const sphereGeom = new THREE.SphereGeometry(0.5, 16, 16);
      const sphereMat = new THREE.MeshStandardMaterial({
        color: 0xfacc15,
        emissive: 0x854d0e,
        roughness: 0.2,
        metalness: 0.8
      });
      const handle = new THREE.Mesh(sphereGeom, sphereMat);
      handle.position.copy(pos);
      handle.userData = { isVertexHandle: true, cornerIndex: idx, targetMesh: mesh };
      this.vertexHandlesGroup.add(handle);
    });

    this.scene.add(this.vertexHandlesGroup);
  }

  clearVertexHandles() {
    if (this.vertexHandlesGroup) {
      this.vertexHandlesGroup.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
      this.scene.remove(this.vertexHandlesGroup);
      this.vertexHandlesGroup = null;
    }
  }

  selectObject(obj) {
    if (!obj) {
      if (this.transformControl) this.transformControl.detach();
      this.setSelectionHighlight(null);
      this.clearVertexHandles();
      this.selectedMesh = null;
      this.selectedObject = null;
      this.onObjectSelected(null);
      this.updateAssetCardDims(null);
      return;
    }
    
    obj.updateMatrixWorld(true);
    this.selectedMesh = obj;
    this.selectedObject = obj;
    
    if (this.transformControl) {
      this.transformControl.attach(obj);
      this.transformControl.size = 0.9;
    }
    
    this.setSelectionHighlight(obj);
    
    if (this.currentTransformMode === 'vertex') {
      this.createVertexHandles(obj);
    } else {
      this.clearVertexHandles();
    }
    
    let info = null;
    if (obj.userData?.isTextLabel) {
      info = { type: 'Text Label', name: obj.userData.labelData?.text || 'Custom Text Label', mesh: obj };
    } else if (obj.userData?.isAmenity) {
      info = { type: 'Amenity', name: obj.userData.name || 'Amenity Asset', mesh: obj };
    } else if (obj.userData?.isWall || obj.userData?.wallData) {
      info = { type: 'Wall', name: obj.userData.wallData?.id || 'Wall Segment', mesh: obj };
    } else if (obj.userData?.isRoad || obj.userData?.roadData) {
      info = { type: 'Road', name: obj.userData.roadData?.name || 'Road Asset', mesh: obj };
    } else if (obj.userData?.plotId) {
      info = { type: 'Plot', name: `Plot ${obj.userData.plotId}`, mesh: obj };
    } else {
      info = { type: '3D Object', name: obj.name || 'Custom 3D Object', mesh: obj };
    }
    
    this.onObjectSelected(info);
    this.updateAssetCardDims(obj);
  }

  updateAssetCardDims(mesh) {
    const cardDims = document.getElementById('selected-asset-dims');
    const areaVal = document.getElementById('asset-area-val');
    const dimStr = document.getElementById('asset-dim-str');
    const inputW = document.getElementById('input-asset-w');
    const inputD = document.getElementById('input-asset-d');
    const inputH = document.getElementById('input-asset-h');
    const inputRot = document.getElementById('input-asset-rot');
    const inputX = document.getElementById('input-asset-x');
    const inputZ = document.getElementById('input-asset-z');

    if (!cardDims) return;

    if (!mesh) {
      if (areaVal) areaVal.textContent = '-';
      if (dimStr) dimStr.textContent = '-';
      if (inputW && document.activeElement !== inputW) inputW.value = '';
      if (inputD && document.activeElement !== inputD) inputD.value = '';
      if (inputH && document.activeElement !== inputH) inputH.value = '';
      if (inputRot && document.activeElement !== inputRot) inputRot.value = '';
      if (inputX && document.activeElement !== inputX) inputX.value = '';
      if (inputZ && document.activeElement !== inputZ) inputZ.value = '';
      return;
    }

    const dims = this.getEditableDimensions(mesh);
    if (!dims) {
      if (areaVal) areaVal.textContent = '-';
      if (dimStr) dimStr.textContent = '-';
      return;
    }

    const wFt = dims.width * 3.28084;
    const dFt = dims.depth * 3.28084;
    const areaSqFt = Math.round(wFt * dFt);
    const rotDeg = Math.round(dims.rotationDeg);

    if (areaVal) areaVal.textContent = areaSqFt.toLocaleString();
    if (dimStr) dimStr.textContent = `${wFt.toFixed(0)}ft × ${dFt.toFixed(0)}ft`;
    if (inputW && document.activeElement !== inputW) inputW.value = parseFloat(dims.width.toFixed(2));
    if (inputD && document.activeElement !== inputD) inputD.value = parseFloat(dims.depth.toFixed(2));
    if (inputH && document.activeElement !== inputH) inputH.value = parseFloat((mesh.scale.y || 1).toFixed(2));
    if (inputRot && document.activeElement !== inputRot) inputRot.value = rotDeg;
    if (inputX && document.activeElement !== inputX) inputX.value = parseFloat(mesh.position.x.toFixed(2));
    if (inputZ && document.activeElement !== inputZ) inputZ.value = parseFloat(mesh.position.z.toFixed(2));
  }

  rebuildWallGeometry(group, wallData) {
    if (!group) return;

    group.children.forEach(child => {
      if (child.geometry) child.geometry.dispose();
    });
    while (group.children.length > 0) {
      group.remove(group.children[0]);
    }

    const wallMat = new THREE.MeshPhongMaterial({
      color: 0xef4444,
      emissive: 0xdc2626,
      emissiveIntensity: 0.5,
      shininess: 60
    });

    const capMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.2
    });

    const wallGeom = new THREE.BoxGeometry(wallData.thickness, wallData.height, wallData.len + 0.04);
    const wallMesh = new THREE.Mesh(wallGeom, wallMat);
    wallMesh.position.y = wallData.height / 2;
    wallMesh.castShadow = true;
    wallMesh.receiveShadow = true;
    group.add(wallMesh);

    const capGeom = new THREE.BoxGeometry(wallData.capWidth, wallData.capHeight, wallData.len + 0.04);
    const capMesh = new THREE.Mesh(capGeom, capMat);
    capMesh.position.y = wallData.height + (wallData.capHeight / 2);
    capMesh.castShadow = true;
    capMesh.receiveShadow = true;
    group.add(capMesh);

    const wallLineMat = new THREE.LineBasicMaterial({ color: 0xff0000 });
    const wallLineGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, wallData.height + wallData.capHeight + 0.02, -(wallData.len / 2)),
      new THREE.Vector3(0, wallData.height + wallData.capHeight + 0.02, wallData.len / 2)
    ]);
    const wallLine = new THREE.Line(wallLineGeom, wallLineMat);
    group.add(wallLine);

    const hitGeom = new THREE.BoxGeometry(Math.max(wallData.capWidth, 0.5), wallData.height + wallData.capHeight + 0.08, wallData.len + 0.12);
    const hitMat = new THREE.MeshBasicMaterial({ visible: true, transparent: true, opacity: 0.001, depthWrite: false });
    const hitBox = new THREE.Mesh(hitGeom, hitMat);
    hitBox.position.y = (wallData.height + wallData.capHeight) / 2;
    hitBox.userData = { isHitBox: true };
    group.add(hitBox);
  }

  syncMeshUserData(mesh) {
    if (!mesh) return;
    const kind = this.getObjectKind(mesh);

    if (kind === 'wall') {
      const wallData = mesh.userData.wallData || {};
      wallData.x = mesh.position.x;
      wallData.z = mesh.position.z;
      wallData.rot = mesh.rotation.y;
      
      let changed = false;
      if (Math.abs(mesh.scale.z - 1) > 0.001) {
        wallData.len = Math.max(0.2, (wallData.len || 1) * mesh.scale.z);
        mesh.scale.z = 1;
        changed = true;
      }
      if (Math.abs(mesh.scale.x - 1) > 0.001) {
        wallData.thickness = Math.max(0.1, (wallData.thickness || 0.24) * mesh.scale.x);
        mesh.scale.x = 1;
        changed = true;
      }
      if (Math.abs(mesh.scale.y - 1) > 0.001) {
        wallData.height = Math.max(0.2, (wallData.height || 0.8) * mesh.scale.y);
        mesh.scale.y = 1;
        changed = true;
      }
      mesh.userData.wallData = wallData;
      if (changed) {
        this.rebuildWallGeometry(mesh, wallData);
      }
    } else if (kind === 'road') {
      const roadData = mesh.userData.roadData || {};
      roadData.x = mesh.position.x;
      roadData.z = mesh.position.z;
      roadData.rot = mesh.rotation.z;
      if (Math.abs(mesh.scale.x - 1) > 0.001) {
        roadData.w = Math.max(0.5, (roadData.w || 4) * mesh.scale.x);
      }
      if (Math.abs(mesh.scale.y - 1) > 0.001) {
        roadData.d = Math.max(1, (roadData.d || 15) * mesh.scale.y);
      }
    } else if (kind === 'textlabel') {
      const labelData = mesh.userData.labelData || {};
      labelData.x = mesh.position.x;
      labelData.y = mesh.position.y;
      labelData.z = mesh.position.z;
      
      const sx = mesh.scale.x;
      const sy = mesh.scale.y;
      const sz = mesh.scale.z;
      
      const oldS = labelData.scaleY || 1;
      let newS = sx;
      if (Math.abs(sy - oldS) > 0.001) newS = sy;
      else if (Math.abs(sz - oldS) > 0.001) newS = sz;
      
      if (Math.abs(sx - newS) > 0.001 || Math.abs(sy - newS) > 0.001 || Math.abs(sz - newS) > 0.001) {
        mesh.scale.set(newS, newS, newS);
      }
      labelData.scaleX = newS;
      labelData.scaleY = newS;
      labelData.scaleZ = newS;
    }
  }

  setMeshDimensions(dims = {}) {
    if (!this.selectedMesh) return;
    const mesh = this.selectedMesh;
    const kind = this.getObjectKind(mesh);

    if (dims.posX !== undefined && !isNaN(dims.posX)) mesh.position.x = dims.posX;
    if (dims.posZ !== undefined && !isNaN(dims.posZ)) mesh.position.z = dims.posZ;

    if (dims.rotDeg !== undefined && !isNaN(dims.rotDeg)) {
      const rad = dims.rotDeg * (Math.PI / 180);
      if (kind === 'road') mesh.rotation.z = rad;
      else mesh.rotation.y = rad;
    }

    const currentDims = this.getEditableDimensions(mesh);
    if (!currentDims) return;

    if (dims.w !== undefined && !isNaN(dims.w) && dims.w > 0 && currentDims.baseWidth > 0) {
      const scaleX = dims.w / currentDims.baseWidth;
      mesh.scale.x = scaleX;
    }

    if (dims.d !== undefined && !isNaN(dims.d) && dims.d > 0 && currentDims.baseDepth > 0) {
      if (kind === 'road') {
        mesh.scale.y = dims.d / currentDims.baseDepth;
      } else {
        mesh.scale.z = dims.d / currentDims.baseDepth;
      }
    }

    if (dims.h !== undefined && !isNaN(dims.h) && dims.h > 0) {
      mesh.scale.y = dims.h;
    }

    mesh.updateMatrixWorld(true);
    this.syncMeshUserData(mesh);
    if (this.selectionBoxHelper) this.selectionBoxHelper.update();
    if (this.onLayoutChanged) this.onLayoutChanged();
  }

  getObjectBaseY(obj) {
    const kind = this.getObjectKind(obj);
    if (kind === 'road') return 0.04;
    if (kind === 'plot') {
      const height = obj.geometry?.parameters?.options?.depth || 0;
      return (height * obj.scale.y) / 2 + 0.05;
    }
    if (kind === 'wall') return 0;
    return obj.position.y;
  }

  constrainSelectedObjectToLayoutPlane() {
    if (!this.selectedMesh) return;

    const kind = this.getObjectKind(this.selectedMesh);
    if (kind === 'plot' || kind === 'road' || kind === 'wall') {
      this.selectedMesh.position.y = this.getObjectBaseY(this.selectedMesh);
      this.selectedMesh.updateMatrixWorld(true);
      if (this.selectionBoxHelper) {
        this.selectionBoxHelper.update();
      }
    }
  }

  getObjectKind(obj) {
    if (!obj) return 'object';
    if (obj.userData?.isTextLabel) return 'textlabel';
    if (obj.userData?.plotId) return 'plot';
    if (obj.userData?.isRoad || obj.userData?.roadData) return 'road';
    if (obj.userData?.isWall || obj.userData?.wallData) return 'wall';
    if (obj.userData?.isAmenity) return 'amenity';
    return 'object';
  }

  getEditableDimensions(obj) {
    const kind = this.getObjectKind(obj);

    if (kind === 'plot' && obj.geometry) {
      obj.geometry.computeBoundingBox();
      const box = obj.geometry.boundingBox;
      const baseWidth = (box.max.x - box.min.x) || 1;
      const baseDepth = (box.max.z - box.min.z) || 1;
      return {
        baseWidth,
        baseDepth,
        width: baseWidth * obj.scale.x,
        depth: baseDepth * obj.scale.z,
        rotationDeg: (-obj.rotation.y) * (180 / Math.PI)
      };
    }

    if (kind === 'road' && obj.geometry?.parameters) {
      const baseWidth = obj.geometry.parameters.width || 1;
      const baseDepth = obj.geometry.parameters.height || 1;
      return {
        baseWidth,
        baseDepth,
        width: baseWidth * obj.scale.x,
        depth: baseDepth * obj.scale.y,
        rotationDeg: obj.rotation.z * (180 / Math.PI)
      };
    }

    if (kind === 'wall') {
      const wallData = obj.userData?.wallData || {};
      const baseWidth = wallData.thickness || 0.24;
      const baseDepth = wallData.len || 1;
      return {
        baseWidth,
        baseDepth,
        width: baseWidth * obj.scale.x,
        depth: baseDepth * obj.scale.z,
        rotationDeg: obj.rotation.y * (180 / Math.PI)
      };
    }

    const box = new THREE.Box3().setFromObject(obj);
    const size = new THREE.Vector3();
    box.getSize(size);
    if (!obj.userData.baseFootprint) {
      obj.userData.baseFootprint = {
        width: (size.x || 1) / (obj.scale.x || 1),
        depth: (size.z || 1) / (obj.scale.z || 1)
      };
    }

    return {
      baseWidth: obj.userData.baseFootprint.width || 1,
      baseDepth: obj.userData.baseFootprint.depth || 1,
      width: size.x || 1,
      depth: size.z || 1,
      rotationDeg: obj.rotation.y * (180 / Math.PI)
    };
  }
  
  onClick(event) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    // Customer mode: ONLY plot polygons are clickable candidate meshes
    let candidateMeshes = this.isEditMode ? [
      ...Object.values(this.plotMeshes),
      ...this.roadMeshes,
      ...this.wallMeshes,
      ...this.amenityMeshes
    ] : Object.values(this.plotMeshes);
    
    const intersects = this.raycaster.intersectObjects(candidateMeshes, true);
    
    if (intersects.length > 0) {
      let obj = intersects[0].object;
      
      while (obj && !obj.userData?.plotId && !obj.userData?.isRoad && !obj.userData?.isWall && !obj.userData?.isAmenity && !obj.userData?.isTextLabel && obj.parent && obj.parent !== this.infraContainer && obj.parent !== this.plotContainer && obj.parent !== this.layoutGroup && obj.parent !== this.scene) {
        obj = obj.parent;
      }
      
      if (this.isEditMode) {
        this.selectObject(obj);
        return;
      }
      
      // Customer Mode: strictly handle Plot Polygons
      if (obj.userData && obj.userData.plotId) {
        const plotId = obj.userData.plotId;
        this.selectPlot(plotId);
        this.onPlotClick(plotId);
      } else {
        this.selectPlot(null);
        this.selectObject(null);
        if (this.onInfrastructureClick) {
          this.onInfrastructureClick(null);
        }
      }
    } else {
      if (this.isEditMode) {
        this.selectObject(null);
      } else {
        this.selectPlot(null);
        this.selectObject(null);
        if (this.onInfrastructureClick) {
          this.onInfrastructureClick(null);
        }
      }
    }
  }
  
  onMouseMove(event) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    this.raycaster.setFromCamera(this.mouse, this.camera);

    // Customer mode: ONLY plot polygons trigger hover & pointer cursor
    let candidateMeshes = this.isEditMode ? [
      ...Object.values(this.plotMeshes),
      ...this.roadMeshes,
      ...this.wallMeshes,
      ...this.amenityMeshes
    ] : Object.values(this.plotMeshes);
    
    const intersects = this.raycaster.intersectObjects(candidateMeshes, true);
    
    if (this.isEditMode) {
      if (intersects.length > 0) {
        this.canvas.style.cursor = 'pointer';
      } else {
        this.canvas.style.cursor = 'grab';
      }
      return;
    }
    
    if (this.hoveredPlotId && this.plotMeshes[this.hoveredPlotId]) {
      const prevMesh = this.plotMeshes[this.hoveredPlotId];
      if (this.hoveredPlotId !== this.selectedPlotId) {
        prevMesh.material[1].emissiveIntensity = 0.25;
      }
      this.canvas.style.cursor = 'grab';
    }
    
    if (intersects.length > 0) {
      let obj = intersects[0].object;
      while (obj && !obj.userData?.plotId && obj.parent && obj.parent !== this.plotContainer && obj.parent !== this.layoutGroup && obj.parent !== this.scene) {
        obj = obj.parent;
      }

      if (obj && obj.userData && obj.userData.plotId) {
        this.canvas.style.cursor = 'pointer';
        const plotId = obj.userData.plotId;
        this.hoveredPlotId = plotId;
        const mesh = this.plotMeshes[plotId];
        if (mesh && plotId !== this.selectedPlotId) {
          mesh.material[1].emissiveIntensity = 0.45;
        }
        this.onPlotHover(plotId);
      } else {
        this.canvas.style.cursor = 'grab';
        this.hoveredPlotId = null;
        this.onPlotHover(null);
      }
    } else {
      this.canvas.style.cursor = 'grab';
      this.hoveredPlotId = null;
      this.onPlotHover(null);
    }
  }

  getAllPlacedAssets() {
    const list = [];
    
    this.amenityMeshes.forEach((mesh, index) => {
      if (mesh.parent) {
        const isTextLabel = mesh.userData?.isTextLabel;
        list.push({
          type: isTextLabel ? 'TextLabel' : 'Amenity',
          id: isTextLabel ? (mesh.userData.labelData?.id || ('label_' + index)) : (mesh.userData.amenityId || ('amenity_' + index)),
          name: isTextLabel ? (mesh.userData.labelData?.text || `Text Label #${index + 1}`) : (mesh.userData.name || `Amenity #${index + 1}`),
          mesh: mesh
        });
      }
    });

    this.roadMeshes.forEach((mesh, index) => {
      if (mesh.parent) {
        list.push({
          type: 'Road',
          id: mesh.userData.roadData?.id || ('road_' + index),
          name: mesh.userData.roadData?.name || `Road #${index + 1}`,
          mesh: mesh
        });
      }
    });

    this.wallMeshes.forEach((mesh, index) => {
      if (mesh.parent) {
        list.push({
          type: 'Wall',
          id: mesh.userData.wallData?.id || ('wall_' + index),
          name: mesh.userData.wallData?.id || `Wall Segment #${index + 1}`,
          mesh: mesh
        });
      }
    });

    return list;
  }
  
  resetView() {
    this.camera.position.set(-35, 110, -90);
    this.controls.target.set(0, 0, 0);
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.6;
    this.controls.update();
    if (this.labelContainer) this.updateLabels();
  }

  set3DView() {
    this.resetView();
  }

  zoomIn() {
    this.controls.autoRotate = false;
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    this.camera.position.addScaledVector(dir, 15);
    this.controls.update();
  }

  zoomOut() {
    this.controls.autoRotate = false;
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    this.camera.position.addScaledVector(dir, -15);
    this.controls.update();
  }

  onResize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }
  
  animate() {
    requestAnimationFrame(() => this.animate());
    
    this.controls.update();

    if (this.selectionBoxHelper) {
      this.selectionBoxHelper.update();
    }
    
    if (this.selectedMesh) {
      this.updateAssetCardDims(this.selectedMesh);
    }
    
    if (this.labelContainer && Object.keys(this.plotMeshes).length > 0) {
      this.updateLabels();
    }
    
    const time = Date.now() * 0.001;
    for (const [id, mesh] of Object.entries(this.plotMeshes)) {
      if (mesh.userData.plotId && mesh.userData.plotId === this.selectedPlotId) {
        mesh.material.emissiveIntensity = 0.3 + Math.sin(time * 3) * 0.2;
      }
    }
    
    this.renderer.render(this.scene, this.camera);
  }
  
  dispose() {
    this.renderer.dispose();
    this.controls.dispose();
    if (this.transformControl) {
      this.transformControl.dispose();
    }
    if (this.selectionBoxHelper) {
      this.scene.remove(this.selectionBoxHelper);
    }
    Object.values(this.plotMeshes).forEach(mesh => {
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) mesh.material.dispose();
    });
  }

  // --- Admin Edit Mode Methods ---
  setupKeyboardListeners() {
    window.addEventListener('keydown', (e) => {
      if (!this.isEditMode || !this.selectedMesh) return;
      const tag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        this.deleteSelectedObject();
      }
    });
  }

  // --- Admin Edit Mode Methods ---
  setEditMode(enabled) {
    this.isEditMode = enabled;
    if (enabled) {
      this.setTransformMode('translate');
    } else {
      this.selectObject(null);
    }
  }

  setTransformMode(mode) {
    this.currentTransformMode = mode;
    if (this.transformControl) {
      if (mode === 'vertex') {
        this.transformControl.setMode('scale');
        if (this.selectedMesh) {
          this.createVertexHandles(this.selectedMesh);
        }
      } else {
        this.transformControl.setMode(mode);
        this.clearVertexHandles();
      }
    }
  }

  addNewRoad() {
    if (!this.infraContainer) return;
    const geom = new THREE.PlaneGeometry(3, 10);
    const roadMat = new THREE.MeshPhongMaterial({ color: 0x1e293b, specular: 0x334155, shininess: 30, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geom, roadMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(0, 0.04, 0);
    mesh.userData = { isRoad: true, roadData: { name: 'New Road', type: 'access', w: 3, d: 10, rot: 0 } };
    this.infraContainer.add(mesh);
    this.roadMeshes.push(mesh);
    this.selectObject(mesh);
  }

  addNewPlot(num) {
    if (!this.plotContainer) return null;
    
    let plotId = parseInt(num);
    if (isNaN(plotId) || plotId <= 0) {
      for (let i = 1; i <= 96; i++) {
        if (!this.plotMeshes[i]) {
          plotId = i;
          break;
        }
      }
    }
    
    if (!plotId) {
      alert("No available plot slots left (Max 96 plots)!");
      return null;
    }
    
    const w = 1.48;
    const d = 2.97;
    const height = 0.3;
    
    const boxW = w * 0.85;
    const boxD = d * 0.85;
    const geometry = this.createRoundedBoxGeometry(boxW, height, boxD, 0.12, 0.04);
    
    const statusColors = STATUS_COLORS.available;
    const topTex = this.generatePlotTexture(plotId, 'available');
    const topMat = new THREE.MeshPhongMaterial({
      map: topTex,
      color: 0xffffff,
      transparent: true,
      opacity: statusColors.opacity,
      shininess: 20
    });
    
    const sideMat = new THREE.MeshPhongMaterial({
      color: statusColors.color,
      transparent: true,
      opacity: statusColors.opacity,
      emissive: statusColors.emissive,
      emissiveIntensity: 0.25,
      shininess: 80,
      specular: 0x444444
    });
    
    const material = [topMat, sideMat];
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(0, height / 2 + 0.05, 0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { plotId: plotId };
    
    const edges = new THREE.EdgesGeometry(geometry);
    const lineMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.45
    });
    const wireframe = new THREE.LineSegments(edges, lineMat);
    mesh.add(wireframe);
    
    this.plotContainer.add(mesh);
    this.plotMeshes[plotId] = mesh;
    this.selectObject(mesh);
    this.updateLabels();
    
    return mesh;
  }

  addNewWall() {
    if (!this.infraContainer) return null;
    
    const wallId = 'wall_' + Date.now();
    const wallData = {
      id: wallId,
      x: 0,
      z: 0,
      thickness: 0.24,
      len: 5.0,
      height: 0.8,
      rot: 0,
      capWidth: 0.30,
      capHeight: 0.1
    };
    
    const group = new THREE.Group();
    group.position.set(0, 0, 0);
    group.userData = { isWall: true, wallData };
    
    const wallMat = new THREE.MeshPhongMaterial({
      color: 0x9f1239,
      specular: 0x334155,
      shininess: 30
    });
    
    const wallGeom = new THREE.BoxGeometry(wallData.thickness, wallData.height, wallData.len + 0.04);
    const wallMesh = new THREE.Mesh(wallGeom, wallMat);
    wallMesh.position.y = wallData.height / 2;
    wallMesh.castShadow = true;
    wallMesh.receiveShadow = true;
    group.add(wallMesh);
    
    const capMat = new THREE.MeshPhongMaterial({
      color: 0xbe123c,
      specular: 0x475569,
      shininess: 40
    });
    const capGeom = new THREE.BoxGeometry(wallData.capWidth, wallData.capHeight, wallData.len + 0.04);
    const capMesh = new THREE.Mesh(capGeom, capMat);
    capMesh.position.y = wallData.height + (wallData.capHeight / 2);
    capMesh.castShadow = true;
    capMesh.receiveShadow = true;
    group.add(capMesh);
    
    const wallLineMat = new THREE.LineBasicMaterial({ color: 0xff0000 });
    const wallLineGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, wallData.height + wallData.capHeight + 0.02, -(wallData.len / 2)),
      new THREE.Vector3(0, wallData.height + wallData.capHeight + 0.02, wallData.len / 2)
    ]);
    const wallLine = new THREE.Line(wallLineGeom, wallLineMat);
    group.add(wallLine);
    
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    const hitGeom = new THREE.BoxGeometry(Math.max(wallData.capWidth, 0.5), wallData.height + wallData.capHeight + 0.08, wallData.len + 0.12);
    const hitBox = new THREE.Mesh(hitGeom, hitMat);
    hitBox.position.y = (wallData.height + wallData.capHeight) / 2;
    group.add(hitBox);
    
    this.infraContainer.add(group);
    this.wallMeshes.push(group);
    this.selectObject(group);
    
    return group;
  }

  addAmenity(type = 'park', x = 0, z = 0) {
    if (!this.infraContainer) return null;
    
    const group = new THREE.Group();
    group.position.set(x, 0.1, z);
    
    const amenityId = 'amenity_' + Date.now();
    let name = 'Park Amenity';
    
    if (type === 'park') {
      name = 'Green Park & Floral Garden';
      const lawnGeom = new THREE.BoxGeometry(10, 0.2, 10);
      const lawnMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.8 });
      const lawn = new THREE.Mesh(lawnGeom, lawnMat);
      lawn.position.y = 0.1;
      group.add(lawn);

      // Floral garden bed clusters & stone path
      const flowerColors = [0xf43f5e, 0xeab308, 0xa855f7, 0x38bdf8];
      for (let i = 0; i < 8; i++) {
        const fx = (Math.random() - 0.5) * 7;
        const fz = (Math.random() - 0.5) * 7;
        const flowerGeom = new THREE.DodecahedronGeometry(0.4, 0);
        const flowerMat = new THREE.MeshStandardMaterial({ color: flowerColors[i % flowerColors.length], roughness: 0.4 });
        const flower = new THREE.Mesh(flowerGeom, flowerMat);
        flower.position.set(fx, 0.35, fz);
        group.add(flower);
      }
    } else if (type === 'gate') {
      name = 'Grand Entrance Gate';
      const p1Geom = new THREE.BoxGeometry(0.8, 4, 0.8);
      const pMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.3 });
      const p1 = new THREE.Mesh(p1Geom, pMat); p1.position.set(-4, 2, 0); group.add(p1);
      const p2 = new THREE.Mesh(p1Geom, pMat); p2.position.set(4, 2, 0); group.add(p2);
      const archGeom = new THREE.BoxGeometry(9, 0.8, 0.8);
      const archMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.3 });
      const arch = new THREE.Mesh(archGeom, archMat); arch.position.set(0, 4.2, 0); group.add(arch);
    } else if (type === 'clubhouse') {
      name = 'Community Clubhouse';
      const buildingGeom = new THREE.BoxGeometry(12, 4, 8);
      const bMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.2, metalness: 0.1 });
      const b = new THREE.Mesh(buildingGeom, bMat); b.position.y = 2; group.add(b);
      const roofGeom = new THREE.ConeGeometry(8, 2, 4);
      const rMat = new THREE.MeshStandardMaterial({ color: 0xef4444 });
      const roof = new THREE.Mesh(roofGeom, rMat); roof.position.y = 5; roof.rotation.y = Math.PI/4; group.add(roof);
    } else if (type === 'watertower') {
      name = 'Overhead Water Tank';
      const tankGeom = new THREE.CylinderGeometry(2.5, 2.5, 3, 16);
      const tMat = new THREE.MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.4 });
      const tank = new THREE.Mesh(tankGeom, tMat); tank.position.y = 6.5; group.add(tank);
      for(let i=0; i<4; i++) {
        const px = (i % 2 === 0 ? -1.5 : 1.5);
        const pz = (i < 2 ? -1.5 : 1.5);
        const colGeom = new THREE.CylinderGeometry(0.2, 0.2, 5, 8);
        const colMat = new THREE.MeshStandardMaterial({ color: 0x64748b });
        const col = new THREE.Mesh(colGeom, colMat); col.position.set(px, 2.5, pz); group.add(col);
      }
    } else if (type === 'fountain') {
      name = 'Water Fountain';
      const poolGeom = new THREE.CylinderGeometry(4, 4, 0.6, 24);
      const poolMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.1 });
      const pool = new THREE.Mesh(poolGeom, poolMat); pool.position.y = 0.3; group.add(pool);
      const jetGeom = new THREE.ConeGeometry(0.6, 2.5, 12);
      const jetMat = new THREE.MeshBasicMaterial({ color: 0xe0f2fe, transparent: true, opacity: 0.85 });
      const jet = new THREE.Mesh(jetGeom, jetMat); jet.position.y = 1.8; group.add(jet);
    } else {
      name = 'Street Light Pole';
      const poleGeom = new THREE.CylinderGeometry(0.1, 0.15, 5, 8);
      const pMat = new THREE.MeshStandardMaterial({ color: 0x475569 });
      const pole = new THREE.Mesh(poleGeom, pMat); pole.position.y = 2.5; group.add(pole);
      const lampGeom = new THREE.SphereGeometry(0.4, 12, 12);
      const lMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
      const lamp = new THREE.Mesh(lampGeom, lMat); lamp.position.set(0, 5, 0.3); group.add(lamp);
    }
    
    // Invisible hit box volume for 1-click selection
    const hitGeom = new THREE.BoxGeometry(10, 6, 10);
    const hitMat = new THREE.MeshBasicMaterial({ visible: true, transparent: true, opacity: 0.001, depthWrite: false });
    const hitBox = new THREE.Mesh(hitGeom, hitMat);
    hitBox.position.y = 3;
    hitBox.userData = { isHitBox: true };
    group.add(hitBox);
    
    group.userData = { isAmenity: true, amenityId: amenityId, type: type, name: name };
    
    this.infraContainer.add(group);
    this.amenityMeshes.push(group);
    
    if (this.isEditMode) {
      this.selectObject(group);
    }
    
    if (this.onLayoutChanged) this.onLayoutChanged();
    return group;
  }

  addNewWall(x = 0, z = 0, len = 10, rot = 0) {
    const wallId = 'wall_' + Date.now();
    const entry = {
      id: wallId,
      x: x,
      z: z,
      len: len,
      rot: rot,
      thickness: 0.24,
      height: 0.8,
      capWidth: 0.30,
      capHeight: 0.1
    };

    const wallData = this.normalizeWallSegment(entry, this.wallMeshes.length);
    if (!wallData) return null;

    const group = new THREE.Group();
    group.position.set(wallData.x, 0, wallData.z);
    group.rotation.y = wallData.rot;
    group.userData = { isWall: true, wallData };

    this.rebuildWallGeometry(group, wallData);

    this.infraContainer.add(group);
    this.wallMeshes.push(group);

    if (this.isEditMode) {
      this.selectObject(group);
    }

    if (this.onLayoutChanged) this.onLayoutChanged();
    return group;
  }

  addNewRoad(name = 'New Road', w = 4.0, d = 15.0) {
    let roadName = name;
    let roadWidth = w;
    let roadDepth = d;
    let roadType = 'main';

    if (typeof name === 'number') {
      const widthFeet = Math.round(name);
      const preset = {
        20: { name: '20 Feet Road', type: 'access', w: 1.5, d: 10.0 },
        30: { name: '30 Feet Road', type: 'main', w: 2.2, d: 12.0 },
        40: { name: '40 Feet Road', type: 'avenue', w: 3.0, d: 14.0 },
        50: { name: '50 Feet Road', type: 'ring', w: 3.7, d: 16.0 }
      }[widthFeet] || {
        name: `${widthFeet} Feet Road`,
        type: 'access',
        w: Math.max(1.4, widthFeet / 14),
        d: 12.0
      };

      roadName = preset.name;
      roadType = preset.type;
      roadWidth = preset.w;
      roadDepth = preset.d;
    }

    const roadId = 'road_' + Date.now();
    const r = {
      id: roadId,
      name: roadName,
      type: roadType,
      x: 0,
      z: 0,
      w: roadWidth,
      d: roadDepth,
      rot: 0
    };

    const roadCanvas = document.createElement('canvas');
    roadCanvas.width = 128; roadCanvas.height = 128;
    const rCtx = roadCanvas.getContext('2d');
    rCtx.fillStyle = '#222736';
    rCtx.fillRect(0, 0, 128, 128);
    for(let i = 0; i < 1000; i++) {
      rCtx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.05)';
      rCtx.fillRect(Math.random()*128, Math.random()*128, 2, 2);
    }
    const roadTex = new THREE.CanvasTexture(roadCanvas);
    roadTex.wrapS = THREE.RepeatWrapping; roadTex.wrapT = THREE.RepeatWrapping;
    roadTex.repeat.set(Math.ceil(r.w / 4), Math.ceil(r.d / 4));
    roadTex.needsUpdate = true;

    const roadMat = new THREE.MeshPhongMaterial({
      map: roadTex,
      specular: 0x222222,
      shininess: 10,
      side: THREE.DoubleSide
    });

    const geom = new THREE.PlaneGeometry(r.w, r.d);
    const mesh = new THREE.Mesh(geom, roadMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(r.x, 0.04, r.z);
    mesh.userData = { isRoad: true, roadData: r };

    if (r.type === 'main' || r.type === 'avenue' || r.type === 'ring') {
      const dashCanvas = document.createElement('canvas');
      dashCanvas.width = 16;
      dashCanvas.height = 128;
      const dCtx = dashCanvas.getContext('2d');
      dCtx.fillStyle = 'rgba(255, 255, 255, 0)';
      dCtx.fillRect(0, 0, 16, 128);
      dCtx.fillStyle = '#ffffff';
      dCtx.fillRect(6, 16, 4, 64);

      const dashTex = new THREE.CanvasTexture(dashCanvas);
      dashTex.wrapS = THREE.RepeatWrapping;
      dashTex.wrapT = THREE.RepeatWrapping;
      dashTex.repeat.set(1, Math.ceil(r.d / 6));
      dashTex.needsUpdate = true;

      const lineGeom = new THREE.PlaneGeometry(0.4, r.d);
      const lineMat = new THREE.MeshBasicMaterial({
        map: dashTex,
        transparent: true,
        opacity: 0.8
      });
      const lineMesh = new THREE.Mesh(lineGeom, lineMat);
      lineMesh.position.set(0, 0, 0.01);
      mesh.add(lineMesh);
    }

    this.infraContainer.add(mesh);
    this.roadMeshes.push(mesh);

    if (this.isEditMode) {
      this.selectObject(mesh);
    }

    if (this.onLayoutChanged) this.onLayoutChanged();
    return mesh;
  }

  deleteSelectedObject() {
    if (!this.selectedMesh) return null;
    
    const obj = this.selectedMesh;
    let deletedName = 'Asset';
    
    if (obj.userData?.isAmenity) {
      deletedName = obj.userData.name || 'Amenity';
      const idx = this.amenityMeshes.indexOf(obj);
      if (idx !== -1) this.amenityMeshes.splice(idx, 1);
    } else if (obj.userData?.isRoad || obj.userData?.roadData) {
      deletedName = obj.userData.roadData?.name || 'Road';
      const idx = this.roadMeshes.indexOf(obj);
      if (idx !== -1) this.roadMeshes.splice(idx, 1);
    } else if (obj.userData?.isWall || obj.userData?.wallData) {
      deletedName = obj.userData.wallData?.id || 'Wall Segment';
      const idx = this.wallMeshes.indexOf(obj);
      if (idx !== -1) this.wallMeshes.splice(idx, 1);
    } else if (obj.userData?.plotId) {
      deletedName = `Plot ${obj.userData.plotId}`;
      const plotId = obj.userData.plotId;
      delete this.plotMeshes[plotId];
    } else {
      deletedName = obj.name || '3D Object';
    }
    
    if (this.transformControl) {
      this.transformControl.detach();
    }
    
    this.setSelectionHighlight(null);
    
    if (obj.parent) {
      obj.parent.remove(obj);
    }
    
    if (obj.traverse) {
      obj.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
          else child.material.dispose();
        }
      });
    }
    
    this.selectedMesh = null;
    this.selectedObject = null;
    this.onObjectSelected(null);
    this.updateLabels();
    if (this.onLayoutChanged) this.onLayoutChanged();
    
    return { name: deletedName };
  }

  addTextLabel(text = 'Custom Label', x = 0, z = 0, options = {}) {
    const id = options.id || ('label_' + Date.now());
    const labelData = {
      id,
      text: text || 'Custom Label',
      w: Number(options.w || options.scaleX || 6),
      h: Number(options.h || options.scaleZ || 2.5),
      bgColor: options.bgColor || '#0284c7',
      textColor: options.textColor || '#ffffff',
      x: Number(x || 0),
      z: Number(z || 0),
      rot: Number(options.rot || options.rotY || 0)
    };

    const group = new THREE.Group();
    group.position.set(labelData.x, options.y || 0.12, labelData.z);
    group.rotation.y = labelData.rot;

    const mesh = this.create3DTextLabelMesh(labelData);
    group.add(mesh);
    group.userData = { isTextLabel: true, isAsset: true, assetType: 'textLabel', labelData };

    this.infraContainer.add(group);
    this.amenityMeshes.push(group);

    if (this.isAdmin) {
      this.selectObject(group);
    }
    return group;
  }

  create3DTextLabelMesh(labelData) {
    const textStr = (labelData.text || 'Custom Label').trim();
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    ctx.font = '900 64px "Segoe UI", Arial, sans-serif';
    
    const words = textStr.split(' ');
    let line = '';
    let lines = [];
    const maxTextWidth = 800; 
    let actualMaxWidth = 0;

    for(let n = 0; n < words.length; n++) {
      let testLine = line + words[n] + ' ';
      let metrics = ctx.measureText(testLine);
      let testWidth = metrics.width;
      
      if (testWidth > maxTextWidth && n > 0) {
        lines.push(line);
        line = words[n] + ' ';
      } else {
        line = testLine;
        if (testWidth > actualMaxWidth) actualMaxWidth = testWidth;
      }
    }
    lines.push(line);
    let finalMetrics = ctx.measureText(line);
    if (finalMetrics.width > actualMaxWidth) actualMaxWidth = finalMetrics.width;

    const lineHeight = 76;
    const paddingX = 64;
    const paddingY = 48;
    
    canvas.width = Math.max(256, actualMaxWidth + paddingX * 2);
    canvas.height = Math.max(128, lines.length * lineHeight + paddingY * 2);

    const cw = canvas.width;
    const ch = canvas.height;

    // Rounded background box
    ctx.fillStyle = labelData.bgColor || '#0284c7';
    ctx.beginPath();
    ctx.roundRect(8, 8, cw - 16, ch - 16, 24);
    ctx.fill();

    // Crisp white border
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.roundRect(14, 14, cw - 28, ch - 28, 18);
    ctx.stroke();

    // Label text
    ctx.fillStyle = labelData.textColor || '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 8;
    
    ctx.font = '900 64px "Segoe UI", Arial, sans-serif';
    
    let startY = (ch / 2) - ((lines.length - 1) * lineHeight) / 2;
    
    lines.forEach((l) => {
      ctx.fillText(l.trim(), cw / 2, startY);
      startY += lineHeight;
    });

    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();

    const spriteMat = new THREE.SpriteMaterial({
      map: texture,
      color: 0xffffff,
      transparent: true,
      depthTest: true
    });

    const sprite = new THREE.Sprite(spriteMat);
    
    const baseW = canvas.width / 100;
    const baseH = canvas.height / 100;
    
    // Normalize scale safely for old saves which might have extreme ratios
    let uniformScale = labelData.scaleY || 1;
    if (!labelData.scaleY && labelData.w) {
      uniformScale = Math.max(1, labelData.w / baseW);
    }
    
    sprite.scale.set(baseW * uniformScale, baseH * uniformScale, 1);
    sprite.position.y = (baseH * uniformScale) / 2 + 0.1; 
    
    sprite.castShadow = true;
    sprite.receiveShadow = true;
    
    return sprite;
  }

  updateTextLabel(group, newText, newBgColor, newTextColor) {
    if (!group || !group.userData?.isTextLabel) return;
    const labelData = group.userData.labelData;
    if (newText !== undefined) labelData.text = newText;
    if (newBgColor !== undefined) labelData.bgColor = newBgColor;
    if (newTextColor !== undefined) labelData.textColor = newTextColor;

    // Clear old mesh children
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (child.material.map) child.material.map.dispose();
        child.material.dispose();
      }
    }

    const newMesh = this.create3DTextLabelMesh(labelData);
    group.add(newMesh);
  }

  async loadCustomAssets() {
    try {
      let res;
      try {
        res = await fetch('/api/assets');
      } catch (e) {}
      if (!res || !res.ok) {
        res = await fetch('/data/custom_assets.json');
      }
      if (!res || !res.ok) return;
      const assets = await res.json();
      if (!Array.isArray(assets)) return;
      
      assets.forEach(ast => {
        if (ast.assetType === 'textLabel' || ast.subType === 'textLabel') {
          const l = this.addTextLabel(ast.text || ast.name || 'Custom Label', ast.x || 0, ast.z || 0, {
            id: ast.id,
            w: ast.w || ast.scaleX || 6,
            h: ast.h || ast.scaleZ || 2.5,
            bgColor: ast.bgColor || '#0284c7',
            textColor: ast.textColor || '#ffffff',
            rot: ast.rot || ast.rotY || 0,
            y: ast.y || 0.12
          });
          if (l) {
            l.position.set(ast.x || 0, ast.y || 0.12, ast.z || 0);
            if (ast.scaleX) l.scale.set(ast.scaleX, ast.scaleY || 1, ast.scaleZ || ast.scaleX);
            if (ast.rot || ast.rotY) l.rotation.y = ast.rot || ast.rotY;
          }
        } else if (ast.assetType === 'amenity') {
          const a = this.addAmenity(ast.subType || 'park', ast.x, ast.z);
          if (a) {
            a.userData.amenityId = ast.id;
            a.position.set(ast.x, ast.y || 0.1, ast.z);
            if (ast.scaleX) a.scale.set(ast.scaleX, ast.scaleY || 1, ast.scaleZ || ast.scaleX);
            if (ast.rotY) a.rotation.y = ast.rotY;
          }
        }
      });
    } catch (e) {
      console.log('No custom assets loaded:', e);
    }
  }

  getLayoutData() {
    const updatedPlots = {};
    for (const [id, mesh] of Object.entries(this.plotMeshes)) {
      mesh.geometry.computeBoundingBox();
      const box = mesh.geometry.boundingBox;
      const baseW = box.max.x - box.min.x;
      const baseD = box.max.z - box.min.z;
      
      let w, d;
      if (mesh.userData.localPolygon) {
        w = baseW * mesh.scale.x;
        d = baseD * mesh.scale.z;
      } else {
        w = (baseW * mesh.scale.x) / 0.85;
        d = (baseD * mesh.scale.z) / 0.85;
      }
      
      updatedPlots[id] = {
        x: parseFloat(mesh.position.x.toFixed(4)),
        z: parseFloat(mesh.position.z.toFixed(4)),
        w: parseFloat(w.toFixed(4)),
        h: parseFloat(d.toFixed(4)),
        rot: parseFloat((-mesh.rotation.y).toFixed(4))
      };

      if (mesh.userData.localPolygon) {
        const theta = mesh.rotation.y;
        const cos = Math.cos(theta);
        const sin = Math.sin(theta);
        
        updatedPlots[id].polygon = mesh.userData.localPolygon.map(pt => {
          const sx = pt[0] * mesh.scale.x;
          const sz = pt[1] * mesh.scale.z;
          const rx = sx * cos - sz * sin;
          const rz = sx * sin + sz * cos;
          return [
            parseFloat((rx + mesh.position.x).toFixed(4)),
            parseFloat((rz + mesh.position.z).toFixed(4))
          ];
        });
      }
    }

    const updatedRoads = [];
    this.roadMeshes.forEach(mesh => {
      if (!mesh.parent) return;
      this.syncMeshUserData(mesh);
      const roadData = mesh.userData?.roadData || {};
      updatedRoads.push({
        id: roadData.id || ('road_' + updatedRoads.length),
        name: roadData.name || 'Road',
        type: roadData.type || 'access',
        x: parseFloat(mesh.position.x.toFixed(4)),
        z: parseFloat(mesh.position.z.toFixed(4)),
        w: parseFloat(Number(roadData.w || 4).toFixed(4)),
        d: parseFloat(Number(roadData.d || 15).toFixed(4)),
        rot: parseFloat(mesh.rotation.z.toFixed(4))
      });
    });

    const customAssets = [];
    this.amenityMeshes.forEach(mesh => {
      if (!mesh.parent) return;
      if (mesh.userData?.isTextLabel) {
        const labelData = mesh.userData.labelData || {};
        customAssets.push({
          id: labelData.id || ('label_' + customAssets.length),
          assetType: 'textLabel',
          subType: 'textLabel',
          name: labelData.text || 'Custom Text Label',
          text: labelData.text || 'Custom Text Label',
          bgColor: labelData.bgColor || '#0284c7',
          textColor: labelData.textColor || '#ffffff',
          w: parseFloat((labelData.w * mesh.scale.x).toFixed(4)),
          h: parseFloat((labelData.h * Math.max(mesh.scale.y, mesh.scale.z)).toFixed(4)),
          x: parseFloat(mesh.position.x.toFixed(4)),
          y: parseFloat(mesh.position.y.toFixed(4)),
          z: parseFloat(mesh.position.z.toFixed(4)),
          scaleX: parseFloat(mesh.scale.x.toFixed(4)),
          scaleY: parseFloat(mesh.scale.y.toFixed(4)),
          scaleZ: parseFloat(mesh.scale.z.toFixed(4)),
          rot: parseFloat(mesh.rotation.y.toFixed(4)),
          rotY: parseFloat(mesh.rotation.y.toFixed(4))
        });
      } else {
        customAssets.push({
          id: mesh.userData.amenityId || ('amenity_' + Math.random()),
          assetType: 'amenity',
          subType: mesh.userData.type || 'park',
          name: mesh.userData.name || 'Amenity',
          x: parseFloat(mesh.position.x.toFixed(4)),
          y: parseFloat(mesh.position.y.toFixed(4)),
          z: parseFloat(mesh.position.z.toFixed(4)),
          scaleX: parseFloat(mesh.scale.x.toFixed(4)),
          scaleY: parseFloat(mesh.scale.y.toFixed(4)),
          scaleZ: parseFloat(mesh.scale.z.toFixed(4)),
          rotY: parseFloat(mesh.rotation.y.toFixed(4))
        });
      }
    });

    const updatedWalls = [];
    this.wallMeshes.forEach(mesh => {
      if (!mesh.parent) return;
      this.syncMeshUserData(mesh);
      const wallData = mesh.userData?.wallData || {};
      updatedWalls.push({
        id: wallData.id || ('wall_' + updatedWalls.length),
        x: parseFloat(mesh.position.x.toFixed(4)),
        z: parseFloat(mesh.position.z.toFixed(4)),
        len: parseFloat(Number(wallData.len || 1).toFixed(4)),
        rot: parseFloat(mesh.rotation.y.toFixed(4)),
        thickness: parseFloat(Number(wallData.thickness || 0.24).toFixed(4)),
        height: parseFloat(Number(wallData.height || 0.8).toFixed(4)),
        capWidth: parseFloat(Number(wallData.capWidth || 0.30).toFixed(4)),
        capHeight: parseFloat(Number(wallData.capHeight || 0.1).toFixed(4))
      });
    });

    return { plots: updatedPlots, roads: updatedRoads, walls: updatedWalls, assets: customAssets };
  }
}
