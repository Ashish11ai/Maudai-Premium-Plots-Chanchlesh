/**
 * Admin Panel Logic
 * Handles login, plot status management, overlay controls, and bulk operations.
 */

(function() {
  'use strict';
  
  let scene;
  let gmapManager;
  let plotsData = {};
  let editingPlotId = null;
  let currentViewMode = 'gmap'; // 'gmap', 'top', '3d'
  let autoSaveTimer = null;

  let currentUserRole = 'admin';
  let currentUsername = 'admin';

  async function persistLayout(options = {}) {
    if (currentUserRole === 'accountant') return { success: false };
    const { keepalive = false, silent = true } = options;
    if (!scene) return { success: false };

    const data = scene.getLayoutData();
    const res = await fetch('/api/save-layout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      keepalive
    });

    return await res.json();
  }

  function flushPendingLayoutSave() {
    if (currentUserRole === 'accountant') return;
    if (!scene) return;
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
      autoSaveTimer = null;
    }

    const data = JSON.stringify(scene.getLayoutData());

    if (navigator.sendBeacon) {
      const payload = new Blob([data], { type: 'application/json' });
      navigator.sendBeacon('/api/save-layout', payload);
      return;
    }

    fetch('/api/save-layout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: data,
      keepalive: true
    }).catch(() => {});
  }

  function autoSaveLayout() {
    if (currentUserRole === 'accountant') return;
    if (!scene) return;
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(async () => {
      autoSaveTimer = null;
      try {
        const result = await persistLayout({ keepalive: true, silent: true });
        if (result.success) {
          showToast('⚡ Auto-saved plot & asset layout!', 'success');
        }
      } catch (err) {
        console.error('Auto-save failed:', err);
      }
    }, 120);
  }
  
  // --- Init ---
  async function init() {
    // Check auth status first
    const authRes = await fetch('/api/auth-status');
    const authData = await authRes.json();
    
    if (authData.isAdmin) {
      currentUserRole = authData.role || 'admin';
      currentUsername = authData.username || 'admin';
      showDashboard();
    } else {
      showLoginForm();
    }
  }
  
  // --- Login ---
  function showLoginForm() {
    document.getElementById('login-modal').classList.remove('hidden');
    document.getElementById('admin-dashboard').classList.add('hidden');
    
    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const username = document.getElementById('login-username').value;
      const password = document.getElementById('login-password').value;
      
      try {
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        
        const data = await res.json();
        
        if (data.success) {
          currentUserRole = data.user?.role || 'admin';
          currentUsername = data.user?.username || 'admin';
          showDashboard();
        } else {
          document.getElementById('login-error').classList.remove('hidden');
          document.getElementById('login-error').textContent = data.message || 'Invalid credentials';
        }
      } catch (err) {
        document.getElementById('login-error').classList.remove('hidden');
        document.getElementById('login-error').textContent = 'Connection error. Please try again.';
      }
    });
  }
  
  function applyRolePermissions() {
    const isAccountant = (currentUserRole === 'accountant');

    // Subtitle badge
    const subtitleEl = document.querySelector('.header-subtitle');
    if (subtitleEl) {
      if (isAccountant) {
        subtitleEl.innerHTML = `<span style="background: rgba(34,197,94,0.2); color: #4ade80; border: 1px solid rgba(34,197,94,0.4); padding: 2px 8px; border-radius: 12px; font-weight: 700; font-size: 0.78rem;">Accountant View (${currentUsername})</span>`;
      } else {
        subtitleEl.textContent = 'Plot Management Dashboard';
      }
    }

    // Password change button
    const pwdBtn = document.getElementById('btn-open-password-modal');
    if (pwdBtn) {
      pwdBtn.style.display = isAccountant ? 'none' : 'inline-block';
    }

    // 3D Edit Mode toggle button
    const editToggleBtn = document.getElementById('btn-toggle-edit');
    if (editToggleBtn) {
      editToggleBtn.style.display = isAccountant ? 'none' : 'inline-block';
    }

    // Google Map Placement Controls toggle button & panel
    const gmapToggleBtn = document.getElementById('btn-toggle-gmap-placement-panel');
    if (gmapToggleBtn) {
      gmapToggleBtn.style.display = isAccountant ? 'none' : 'inline-block';
    }
    const gmapControls = document.getElementById('gmap-admin-controls');
    if (gmapControls && isAccountant) {
      gmapControls.classList.add('hidden');
    }

    // 3D Layout Editor Tools panel
    const layoutTools = document.getElementById('layout-editor-tools');
    if (layoutTools && isAccountant) {
      layoutTools.classList.add('hidden');
    }
  }

  // --- Dashboard ---
  async function showDashboard() {
    document.getElementById('login-modal').classList.add('hidden');
    document.getElementById('admin-dashboard').classList.remove('hidden');
    
    applyRolePermissions();

    // Fetch data
    plotsData = await fetchPlots();

    // Initialize GMap Manager for Admin Layout Placement
    gmapManager = new GMapManager('admin-gmap-container', {
      isAdmin: true,
      onPlotClick: (plotId) => editPlot(plotId),
      onPlotHover: (plotId) => highlightListItem(plotId),
      onLayoutChanged: () => syncGMapUI()
    });
    gmapManager.loadLayout(plotsData);
    
    // Initialize 3D scene
    const canvas = document.getElementById('scene-canvas');
    scene = new PlotScene(canvas, {
      isAdmin: true,
      onPlotClick: (plotId) => editPlot(plotId),
      onPlotHover: (plotId) => highlightListItem(plotId),
      onObjectSelected: (info) => updateSelectedAssetUI(info),
      onLayoutChanged: () => autoSaveLayout()
    });
    
    scene.createPlots(plotsData);
    renderPlotList(plotsData);
    updateCounts(plotsData);
    setupEventListeners();
    setupGMapAdminControls();
    populateAssetDropdown();
    loadOverlaySettings();

    if (!window.__layoutSaveFlushBound) {
      window.__layoutSaveFlushBound = true;
      window.addEventListener('pagehide', flushPendingLayoutSave);
      window.addEventListener('beforeunload', flushPendingLayoutSave);
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) flushPendingLayoutSave();
      });
    }

    // Default to 2D Google Map View in Admin
    setViewMode('gmap');
  }
  
  // --- API Calls ---
  async function fetchPlots() {
    const res = await fetch('/api/plots');
    return await res.json();
  }
  
  async function updatePlotOnServer(plotId, data) {
    const res = await fetch(`/api/plots/${plotId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return await res.json();
  }
  
  async function loadOverlaySettings() {
    try {
      const res = await fetch('/api/settings');
      const settings = await res.json();
      if (settings.gmap && scene) {
        scene.setGMapPlacement(settings.gmap);
      }
      if (settings.overlay && scene) {
        const o = settings.overlay;
        const x = o.x || 0;
        const z = o.z !== undefined ? o.z : (o.y || 0);
        const scale = o.scale !== undefined ? o.scale : 1;
        const rotation = o.rotation || 0;
        const opacity = o.opacity !== undefined ? o.opacity : 0.7;
        
        scene.setOverlayPosition(x, z);
        scene.setOverlayScale(scale);
        scene.setOverlayRotation(rotation);
        scene.setOverlayOpacity(opacity);
      }
      if (settings.gmap && gmapManager) {
        gmapManager.setPlacementSettings(settings.gmap);
        syncGMapUI();
      }
      if (settings.gmap && settings.gmap.defaultView) {
        const mode = settings.gmap.defaultView === '2d' ? 'gmap' : settings.gmap.defaultView;
        setViewMode(mode);
        if (mode === '3d' && scene) {
          scene.set3DView();
        }
      }
      if (settings.titleBadge) {
        applyTitleBadgeSettings(settings.titleBadge);
        populateTitleBadgeForm(settings.titleBadge);
      }
    } catch (e) {
      console.error('Failed to load overlay settings:', e);
    }
  }

  function setupGMapAdminControls() {
    const rotSlider = document.getElementById('gmap-rot-slider');
    const rotVal = document.getElementById('gmap-rot-val');
    const scaleSlider = document.getElementById('gmap-scale-slider');
    const scaleVal = document.getElementById('gmap-scale-val');
    const typeSelect = document.getElementById('gmap-type-select');
    const searchInput = document.getElementById('gmap-search-input');
    const searchBtn = document.getElementById('btn-gmap-search');
    const saveGMapBtn = document.getElementById('btn-save-gmap-layout');

    if (rotSlider) {
      rotSlider.addEventListener('input', (e) => {
        const rot = parseFloat(e.target.value);
        if (rotVal) rotVal.textContent = rot + '°';
        if (gmapManager) {
          gmapManager.rotation = rot;
          gmapManager.refreshAllLayers();
          if (scene) scene.setGMapPlacement(gmapManager.getPlacementSettings());
        }
      });
    }

    if (scaleSlider) {
      scaleSlider.addEventListener('input', (e) => {
        const scale = parseFloat(e.target.value);
        if (scaleVal) scaleVal.textContent = scale.toFixed(2) + 'x';
        if (gmapManager) {
          gmapManager.scale = scale;
          gmapManager.refreshAllLayers();
          if (scene) scene.setGMapPlacement(gmapManager.getPlacementSettings());
        }
      });
    }

    if (typeSelect) {
      typeSelect.addEventListener('change', (e) => {
        if (gmapManager) gmapManager.setMapType(e.target.value);
      });
    }

    if (searchBtn && searchInput) {
      searchBtn.addEventListener('click', async () => {
        const q = searchInput.value.trim();
        if (!q) return;
        showToast('Searching Google Map location...', 'info');
        const res = await gmapManager.searchAddress(q);
        if (res) {
          showToast(`Located: ${res.displayName || q}`, 'success');
          syncGMapUI();
          if (scene) scene.setGMapPlacement(gmapManager.getPlacementSettings());
        } else {
          showToast('Location not found. Try searching lat,lng or town name.', 'error');
        }
      });
    }

    if (saveGMapBtn) {
      saveGMapBtn.addEventListener('click', async () => {
        if (!gmapManager) return;
        try {
          const res = await fetch('/api/settings');
          const currentSettings = await res.json();
          currentSettings.gmap = gmapManager.getPlacementSettings();

          const saveRes = await fetch('/api/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(currentSettings)
          });
          const result = await saveRes.json();
          if (result.success) {
            if (scene) scene.setGMapPlacement(currentSettings.gmap);
            showToast('🗺️ Saved Google Map layout position & settings!', 'success');
          } else {
            showToast('Failed to save Google Map layout position.', 'error');
          }
        } catch (err) {
          console.error('Error saving gmap settings:', err);
          showToast('Server error while saving Google Map layout.', 'error');
        }
      });
    }
  }

  function syncGMapUI() {
    if (!gmapManager) return;
    const settings = gmapManager.getPlacementSettings();

    const rotSlider = document.getElementById('gmap-rot-slider');
    const rotVal = document.getElementById('gmap-rot-val');
    const scaleSlider = document.getElementById('gmap-scale-slider');
    const scaleVal = document.getElementById('gmap-scale-val');
    const scaleNumInput = document.getElementById('gmap-scale-number-input');
    const latInput = document.getElementById('gmap-lat-input');
    const lngInput = document.getElementById('gmap-lng-input');
    const typeSelect = document.getElementById('gmap-type-select');

    if (rotSlider) rotSlider.value = settings.rotation || 0;
    if (rotVal) rotVal.innerHTML = (settings.rotation || 0).toFixed(1) + '&deg;';

    if (scaleSlider) scaleSlider.value = settings.scale || 1.0;
    if (scaleVal) scaleVal.textContent = (settings.scale || 1.0).toFixed(2) + 'x';
    if (scaleNumInput && document.activeElement !== scaleNumInput) {
      scaleNumInput.value = (settings.scale || 1.0).toFixed(2);
    }

    if (latInput && document.activeElement !== latInput) latInput.value = (settings.lat || 22.088368).toFixed(6);
    if (lngInput && document.activeElement !== lngInput) lngInput.value = (settings.lng || 78.863390).toFixed(6);

    if (typeSelect && settings.mapType) typeSelect.value = settings.mapType;
  }

  function syncPlacementTo3D() {
    if (scene && gmapManager) {
      scene.setGMapPlacement(gmapManager.getPlacementSettings());
    }
  }

  function nudgePlacementByLocal(deltaX, deltaZ) {
    if (!gmapManager) return;

    const settings = gmapManager.getPlacementSettings();
    const baseLat = settings.lat || 22.088368;
    const baseLng = settings.lng || 78.863390;
    const rotation = settings.rotation || 0;
    const scale = settings.scale || 1.0;

    const rad = (rotation * Math.PI) / 180;
    const rx = deltaX * Math.cos(rad) - deltaZ * Math.sin(rad);
    const rz = deltaX * Math.sin(rad) + deltaZ * Math.cos(rad);

    const meterScale = 0.52 * scale;
    const dLat = (-rz * meterScale) / 111320;
    const dLng = (rx * meterScale) / (111320 * Math.cos((baseLat * Math.PI) / 180));

    gmapManager.setPlacementSettings({
      lat: baseLat + dLat,
      lng: baseLng + dLng
    });
    syncGMapUI();
    syncPlacementTo3D();
  }

  function setupGMapAdminControls() {
    const rotSlider = document.getElementById('gmap-rot-slider');
    const scaleSlider = document.getElementById('gmap-scale-slider');
    const scaleNumInput = document.getElementById('gmap-scale-number-input');
    const moveStepInput = document.getElementById('gmap-move-step-input');
    const latInput = document.getElementById('gmap-lat-input');
    const lngInput = document.getElementById('gmap-lng-input');
    const typeSelect = document.getElementById('gmap-type-select');
    const searchInput = document.getElementById('gmap-search-input');
    const searchBtn = document.getElementById('btn-gmap-search');
    const saveBtn = document.getElementById('btn-save-gmap-layout');
    const resetBtn = document.getElementById('btn-reset-gmap-layout');

    if (rotSlider) {
      rotSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (gmapManager) {
          gmapManager.setPlacementSettings({ rotation: val });
          syncGMapUI();
          syncPlacementTo3D();
        }
      });
    }

    if (scaleSlider) {
      scaleSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (gmapManager) {
          gmapManager.setPlacementSettings({ scale: val });
          syncGMapUI();
          syncPlacementTo3D();
        }
      });
    }

    if (scaleNumInput) {
      const handleScaleNum = () => {
        const val = parseFloat(scaleNumInput.value);
        if (gmapManager && !isNaN(val) && val > 0) {
          gmapManager.setPlacementSettings({ scale: val });
          syncGMapUI();
          syncPlacementTo3D();
        }
      };
      scaleNumInput.addEventListener('change', handleScaleNum);
      scaleNumInput.addEventListener('input', handleScaleNum);
    }

    // Scale Preset Buttons
    document.querySelectorAll('.scale-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!gmapManager) return;
        const val = parseFloat(btn.dataset.scaleVal);
        if (!isNaN(val)) {
          gmapManager.setPlacementSettings({ scale: val });
          syncGMapUI();
          syncPlacementTo3D();
          showToast(`Scale set to ${val.toFixed(1)}x`, 'info');
        }
      });
    });

    // Nudge buttons for Rotation and Scale
    document.querySelectorAll('.nudge-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!gmapManager) return;
        if (btn.dataset.nudgeRot) {
          const delta = parseFloat(btn.dataset.nudgeRot);
          const current = gmapManager.rotation || 0;
          let newRot = Number((current + delta).toFixed(1));
          if (newRot < 0) newRot += 360;
          if (newRot >= 360) newRot -= 360;
          gmapManager.setPlacementSettings({ rotation: newRot });
          syncGMapUI();
          syncPlacementTo3D();
        }
        if (btn.dataset.nudgeScale) {
          const delta = parseFloat(btn.dataset.nudgeScale);
          const current = gmapManager.scale || 1.0;
          const newScale = Number(Math.max(0.1, Math.min(50.0, current + delta)).toFixed(2));
          gmapManager.setPlacementSettings({ scale: newScale });
          syncGMapUI();
          syncPlacementTo3D();
        }
        if (btn.dataset.moveAxis === 'x' || btn.dataset.moveAxis === 'z') {
          const step = parseFloat(moveStepInput ? moveStepInput.value : '1') || 1;
          const dir = parseFloat(btn.dataset.moveDir || '0') || 0;
          const deltaX = btn.dataset.moveAxis === 'x' ? dir * step : 0;
          const deltaZ = btn.dataset.moveAxis === 'z' ? dir * step : 0;
          nudgePlacementByLocal(deltaX, deltaZ);
        }
      });
    });

    const handleCoordsChange = () => {
      const lat = parseFloat(latInput ? latInput.value : null);
      const lng = parseFloat(lngInput ? lngInput.value : null);
      if (gmapManager && !isNaN(lat) && !isNaN(lng)) {
        gmapManager.setPlacementSettings({ lat, lng });
        syncGMapUI();
        syncPlacementTo3D();
      }
    };

    if (latInput) latInput.addEventListener('change', handleCoordsChange);
    if (lngInput) lngInput.addEventListener('change', handleCoordsChange);

    if (typeSelect) {
      typeSelect.addEventListener('change', (e) => {
        if (gmapManager) gmapManager.setMapType(e.target.value);
      });
    }

    const performSearch = async () => {
      if (!searchInput || !gmapManager) return;
      const query = searchInput.value;
      if (!query) return;
      searchBtn.textContent = 'Searching...';
      const result = await gmapManager.searchAddress(query);
      if (result) {
        syncGMapUI();
        syncPlacementTo3D();
        showToast(`Located: ${result.displayName || 'Target Location'}`, 'success');
      } else {
        showToast('Location not found. Try entering lat,lng coordinates directly.', 'error');
      }
      searchBtn.textContent = 'Search';
    };

    if (searchBtn) searchBtn.addEventListener('click', performSearch);
    if (searchInput) {
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') performSearch();
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (!gmapManager) return;
        gmapManager.setPlacementSettings({
          lat: 22.088368,
          lng: 78.863390,
          zoom: 18,
          rotation: 0,
          scale: 1.0,
          mapType: 'satellite'
        });
        syncGMapUI();
        syncPlacementTo3D();
        showToast('Reset placement to Maudai default center', 'info');
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        if (!gmapManager) return;
        saveBtn.textContent = 'Saving...';
        try {
          const placement = gmapManager.getPlacementSettings();
          const res = await fetch('/api/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gmap: placement })
          });
          const data = await res.json();
          if (data.success) {
            showToast('💾 Google Map Layout Placement saved successfully!', 'success');
          } else {
            showToast('Failed to save placement settings', 'error');
          }
        } catch (err) {
          showToast('Error saving placement settings', 'error');
        }
        saveBtn.textContent = '💾 Save Placement';
      });
    }

    // Panel collapse & close toggles
    const toggleGMapBtn = document.getElementById('btn-toggle-gmap-panel');
    if (toggleGMapBtn) {
      toggleGMapBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const panel = document.getElementById('gmap-admin-controls');
        if (panel) {
          panel.classList.toggle('collapsed');
          toggleGMapBtn.textContent = panel.classList.contains('collapsed') ? '▲' : '▼';
        }
      });
    }

    const closeGMapBtn = document.getElementById('btn-close-gmap-panel');
    if (closeGMapBtn) {
      closeGMapBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const panel = document.getElementById('gmap-admin-controls');
        if (panel) panel.classList.add('hidden');
      });
    }

    const toggleGMapPlacementBtn = document.getElementById('btn-toggle-gmap-placement-panel');
    if (toggleGMapPlacementBtn) {
      toggleGMapPlacementBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const panel = document.getElementById('gmap-admin-controls');
        if (panel) {
          panel.classList.toggle('hidden');
          if (panel.classList.contains('collapsed')) {
            panel.classList.remove('collapsed');
            if (toggleGMapBtn) toggleGMapBtn.textContent = '▼';
          }
        }
      });
    }

    const toggleEditorBtn = document.getElementById('btn-toggle-editor-panel');
    if (toggleEditorBtn) {
      toggleEditorBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const panel = document.getElementById('layout-editor-tools');
        if (panel) {
          panel.classList.toggle('collapsed');
          toggleEditorBtn.textContent = panel.classList.contains('collapsed') ? '▲' : '▼';
        }
      });
    }

    // Save Title Badge button handler
    const saveTitleBadgeBtn = document.getElementById('btn-save-title-badge');
    if (saveTitleBadgeBtn) {
      saveTitleBadgeBtn.addEventListener('click', async () => {
        const enabled = document.getElementById('badge-enable-toggle')?.checked ?? true;
        const tag = document.getElementById('badge-tag-input')?.value || '';
        const title = document.getElementById('badge-title-input')?.value || '';
        const address = document.getElementById('badge-address-input')?.value || '';

        const titleBadge = { enabled, tag, title, address };
        saveTitleBadgeBtn.textContent = '⏳ Saving...';
        try {
          const res = await fetch('/api/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ titleBadge })
          });
          const data = await res.json();
          if (data.success) {
            applyTitleBadgeSettings(titleBadge);
            showToast('🏷️ Grand Layout Title Badge text saved successfully!', 'success');
          } else {
            showToast('Failed to save title badge settings', 'error');
          }
        } catch (err) {
          showToast('Error saving title badge settings', 'error');
        }
        saveTitleBadgeBtn.textContent = '✏️ Save Title Badge Text';
      });
    }

    syncGMapUI();
  }

  function applyTitleBadgeSettings(badgeData) {
    const badgeEl = document.getElementById('grand-layout-title-badge');
    if (!badgeEl) return;

    const data = badgeData || {
      enabled: true,
      tag: 'Approved Maudai Layout',
      title: 'Maudai Premium Plots',
      address: 'Village Maudai, Tehsil & District Chhindwara'
    };

    if (data.enabled === false) {
      badgeEl.style.display = 'none';
      return;
    }
    badgeEl.style.display = 'block';

    // Tag
    const tagContainer = badgeEl.querySelector('.grand-badge-header');
    const tagEl = badgeEl.querySelector('.grand-badge-tag');
    if (tagEl && tagContainer) {
      if (badgeData.tag && badgeData.tag.trim()) {
        tagEl.textContent = badgeData.tag.trim();
        tagContainer.style.display = 'flex';
      } else {
        tagContainer.style.display = 'none';
      }
    }

    // Main Title
    const titleEl = badgeEl.querySelector('.grand-badge-main-title');
    if (titleEl) {
      if (badgeData.title && badgeData.title.trim()) {
        titleEl.textContent = badgeData.title.trim();
        titleEl.style.display = 'block';
      } else {
        titleEl.style.display = 'none';
      }
    }

    // Address
    const addrEl = badgeEl.querySelector('.grand-badge-address span');
    const addrContainer = badgeEl.querySelector('.grand-badge-address');
    if (addrEl && addrContainer) {
      if (badgeData.address && badgeData.address.trim()) {
        addrEl.textContent = badgeData.address.trim();
        addrContainer.style.display = 'flex';
      } else {
        addrContainer.style.display = 'none';
      }
    }
  }

  function populateTitleBadgeForm(badgeData) {
    if (!badgeData) return;
    const toggle = document.getElementById('badge-enable-toggle');
    const tagInput = document.getElementById('badge-tag-input');
    const titleInput = document.getElementById('badge-title-input');
    const addrInput = document.getElementById('badge-address-input');

    if (toggle) toggle.checked = badgeData.enabled !== false;
    if (tagInput && badgeData.tag !== undefined) tagInput.value = badgeData.tag;
    if (titleInput && badgeData.title !== undefined) titleInput.value = badgeData.title;
    if (addrInput && badgeData.address !== undefined) addrInput.value = badgeData.address;
  }

  function setViewMode(mode) {
    currentViewMode = mode;
    const gmapContainer = document.getElementById('admin-gmap-container');
    const gmapControls = document.getElementById('gmap-admin-controls');
    const sceneCanvas = document.getElementById('scene-canvas');
    const editorTools = document.getElementById('layout-editor-tools');

    if (mode === 'gmap') {
      if (gmapContainer) gmapContainer.classList.remove('hidden');
      if (gmapControls) gmapControls.classList.remove('hidden');
      if (sceneCanvas) sceneCanvas.style.display = 'none';
      if (editorTools) editorTools.classList.add('hidden');
      setActiveViewBtn('btn-view-gmap');
      if (gmapManager && gmapManager.map) {
        setTimeout(() => gmapManager.map.invalidateSize(), 50);
      }
    } else {
      if (gmapContainer) gmapContainer.classList.add('hidden');
      if (gmapControls) gmapControls.classList.add('hidden');
      if (sceneCanvas) sceneCanvas.style.display = 'block';
      setActiveViewBtn(mode === 'top' ? 'btn-view-top' : 'btn-view-3d');
    }
  }
  
  // --- Plot List ---
  function renderPlotList(plots, filter = 'all', search = '') {
    if (gmapManager) {
      gmapManager.filterPlots(filter);
      gmapManager.searchPlots(search);
    }

    const list = document.getElementById('plot-list');
    list.innerHTML = '';
    
    const sortedKeys = Object.keys(plots).sort((a, b) => parseInt(a) - parseInt(b));
    
    sortedKeys.forEach(id => {
      const plot = plots[id];
      
      if (filter !== 'all' && plot.status !== filter) return;
      if (search && !id.toString().includes(search)) return;
      
      const item = document.createElement('div');
      item.className = 'plot-list-item';
      item.dataset.plotId = id;
      
      const priceStr = plot.price > 0 ? ` | \u20B9${plot.price.toLocaleString()}` : '';
      const dimStr = plot.dimensions_str ? ` (${plot.dimensions_str})` : '';
      
      item.innerHTML = `
        <div class="plot-number-badge ${plot.status}">${id}</div>
        <div class="plot-list-info">
          <div class="plot-list-title">Plot ${id}${dimStr}</div>
          <div class="plot-list-area">${plot.area.toLocaleString()} sq.ft.${priceStr}</div>
        </div>
        <span class="plot-list-status ${plot.status}">${plot.status}</span>
      `;
      
      item.addEventListener('click', () => {
        const plotId = parseInt(id);
        if (scene && scene.isEditMode && scene.plotMeshes && scene.plotMeshes[plotId]) {
          scene.selectObject(scene.plotMeshes[plotId]);
          return;
        }

        editPlot(plotId);
        scene.selectPlot(plotId);
      });
      
      list.appendChild(item);
    });
  }
  
  function highlightListItem(plotId) {
    document.querySelectorAll('.plot-list-item').forEach(el => {
      el.classList.toggle('highlight', parseInt(el.dataset.plotId) === plotId);
    });
  }
  
  // --- Edit Plot ---
  function editPlot(plotId) {
    const plot = plotsData[plotId];
    if (!plot) return;
    
    editingPlotId = plotId;
    
    const editPanel = document.getElementById('edit-plot-panel');
    const listPanel = document.getElementById('plot-list-panel');
    const sidebar = document.getElementById('sidebar');
    
    if (sidebar) sidebar.style.display = 'flex';
    if (editPanel) editPanel.classList.remove('hidden');
    if (listPanel) listPanel.classList.add('hidden');
    
    document.getElementById('edit-plot-title').textContent = `Edit Plot ${plotId}`;
    document.getElementById('edit-plot-number').textContent = plotId;
    
    if (document.getElementById('edit-width')) {
      document.getElementById('edit-width').value = plot.width_ft !== undefined ? plot.width_ft : '';
    }
    if (document.getElementById('edit-depth')) {
      document.getElementById('edit-depth').value = plot.depth_ft !== undefined ? plot.depth_ft : '';
    }
    if (document.getElementById('edit-area')) {
      document.getElementById('edit-area').value = plot.area !== undefined ? plot.area : '';
    }
    if (document.getElementById('edit-dimensions-str')) {
      document.getElementById('edit-dimensions-str').value = plot.dimensions_str || '';
    }

    document.getElementById('edit-price').value = plot.price || '';
    document.getElementById('edit-notes').value = plot.notes || '';
    
    // Set active status button
    document.querySelectorAll('.status-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.status === plot.status);
    });
    
    // Highlight in list
    document.querySelectorAll('.plot-list-item').forEach(el => {
      el.classList.toggle('selected', parseInt(el.dataset.plotId) === plotId);
    });
  }

  // Auto-calculation helper for width & depth inputs
  const widthInput = document.getElementById('edit-width');
  const depthInput = document.getElementById('edit-depth');
  const areaInput = document.getElementById('edit-area');
  const dimStrInput = document.getElementById('edit-dimensions-str');

  function autoUpdateAreaAndDimensions() {
    const w = parseFloat(widthInput?.value);
    const d = parseFloat(depthInput?.value);
    if (!isNaN(w) && !isNaN(d) && w > 0 && d > 0) {
      if (areaInput && (!areaInput.value || areaInput.dataset.autoCalculated === 'true')) {
        areaInput.value = (w * d).toFixed(2);
        areaInput.dataset.autoCalculated = 'true';
      }
      if (dimStrInput && (!dimStrInput.value || dimStrInput.dataset.autoCalculated === 'true')) {
        dimStrInput.value = `${Math.round(w)}'-0" \u00d7 ${Math.round(d)}'-0"`;
        dimStrInput.dataset.autoCalculated = 'true';
      }
    }
  }

  if (widthInput) widthInput.addEventListener('input', autoUpdateAreaAndDimensions);
  if (depthInput) depthInput.addEventListener('input', autoUpdateAreaAndDimensions);
  if (areaInput) areaInput.addEventListener('input', () => { if (areaInput.dataset) delete areaInput.dataset.autoCalculated; });
  if (dimStrInput) dimStrInput.addEventListener('input', () => { if (dimStrInput.dataset) delete dimStrInput.dataset.autoCalculated; });

  function closeEditPanel() {
    document.getElementById('edit-plot-panel').classList.add('hidden');
    document.getElementById('plot-list-panel').classList.remove('hidden');
    editingPlotId = null;
    scene.selectPlot(null);
    document.querySelectorAll('.plot-list-item').forEach(el => el.classList.remove('selected'));
  }
  
  async function savePlotChanges() {
    if (!editingPlotId) return;
    
    const activeStatusBtn = document.querySelector('.status-btn.active');
    const status = activeStatusBtn ? activeStatusBtn.dataset.status : 'available';
    const price = parseInt(document.getElementById('edit-price').value) || 0;
    const notes = document.getElementById('edit-notes').value.trim();
    
    const widthVal = document.getElementById('edit-width') ? parseFloat(document.getElementById('edit-width').value) : NaN;
    const depthVal = document.getElementById('edit-depth') ? parseFloat(document.getElementById('edit-depth').value) : NaN;
    const areaVal = document.getElementById('edit-area') ? parseFloat(document.getElementById('edit-area').value) : NaN;
    const dimStrVal = document.getElementById('edit-dimensions-str') ? document.getElementById('edit-dimensions-str').value.trim() : '';

    const payload = { status, price, notes };
    if (!isNaN(widthVal)) payload.width_ft = widthVal;
    if (!isNaN(depthVal)) payload.depth_ft = depthVal;
    if (!isNaN(areaVal)) payload.area = areaVal;
    if (dimStrVal) payload.dimensions_str = dimStrVal;

    try {
      const result = await updatePlotOnServer(editingPlotId, payload);
      
      if (result.success) {
        // Update local data
        plotsData[editingPlotId].status = status;
        plotsData[editingPlotId].price = price;
        plotsData[editingPlotId].notes = notes;
        if (!isNaN(widthVal)) plotsData[editingPlotId].width_ft = widthVal;
        if (!isNaN(depthVal)) plotsData[editingPlotId].depth_ft = depthVal;
        if (!isNaN(areaVal)) plotsData[editingPlotId].area = areaVal;
        if (dimStrVal) plotsData[editingPlotId].dimensions_str = dimStrVal;

        if (window.PLOT_DIM_BADGES && dimStrVal) {
          window.PLOT_DIM_BADGES[editingPlotId] = dimStrVal;
        }
        if (window.PLOT_AREAS && !isNaN(areaVal)) {
          window.PLOT_AREAS[editingPlotId] = areaVal;
        }
        
        // Update 3D scene & 2D GMap
        scene.updatePlot(editingPlotId, plotsData[editingPlotId]);
        if (gmapManager) {
          gmapManager.loadLayout(plotsData);
        }
        
        // Refresh list
        const activeFilter = document.querySelector('.filter-btn.active').dataset.filter;
        const search = document.getElementById('search-input').value.trim();
        renderPlotList(plotsData, activeFilter, search);
        
        // Update counts
        updateCounts(plotsData);
        
        showToast('Plot ' + editingPlotId + ' updated successfully!', 'success');
      } else {
        showToast('Failed to update plot', 'error');
      }
    } catch (err) {
      showToast('Server error. Please try again.', 'error');
    }
  }
  
  // --- Counts ---
  function updateCounts(plots) {
    let available = 0, sold = 0, reserved = 0;
    
    Object.values(plots).forEach(p => {
      if (p.status === 'available') available++;
      else if (p.status === 'sold') sold++;
      else if (p.status === 'reserved') reserved++;
    });
    
    const setCount = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    
    setCount('admin-count-available', available);
    setCount('admin-count-sold', sold);
    setCount('admin-count-reserved', reserved);
  }
  
  // --- Overlay Controls ---
  function setupOverlayControls() {
    const posXSlider = document.getElementById('overlay-pos-x');
    const posZSlider = document.getElementById('overlay-pos-z');
    const scSlider = document.getElementById('overlay-scale');
    const rotSlider = document.getElementById('overlay-rotation');
    const opSlider = document.getElementById('overlay-opacity');
    
    const updatePosition = () => {
      const x = parseFloat(posXSlider ? posXSlider.value : 0);
      const z = parseFloat(posZSlider ? posZSlider.value : 0);
      if (document.getElementById('overlay-pos-x-val')) {
        document.getElementById('overlay-pos-x-val').textContent = x;
      }
      if (document.getElementById('overlay-pos-z-val')) {
        document.getElementById('overlay-pos-z-val').textContent = z;
      }
      scene.setOverlayPosition(x, z);
    };
    
    if (posXSlider) posXSlider.addEventListener('input', updatePosition);
    if (posZSlider) posZSlider.addEventListener('input', updatePosition);
    
    // Nudge buttons
    const nudge = (element, delta) => {
      if (!element) return;
      const current = parseFloat(element.value);
      const min = parseFloat(element.min);
      const max = parseFloat(element.max);
      element.value = Math.max(min, Math.min(max, current + delta));
      updatePosition();
    };
    
    const btnLeft = document.getElementById('nudge-x-left');
    const btnRight = document.getElementById('nudge-x-right');
    const btnUp = document.getElementById('nudge-z-up');
    const btnDown = document.getElementById('nudge-z-down');
    
    if (btnLeft) btnLeft.addEventListener('click', () => nudge(posXSlider, -1));
    if (btnRight) btnRight.addEventListener('click', () => nudge(posXSlider, 1));
    if (btnUp) btnUp.addEventListener('click', () => nudge(posZSlider, -1));
    if (btnDown) btnDown.addEventListener('click', () => nudge(posZSlider, 1));
    
    if (scSlider) {
      scSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        document.getElementById('overlay-scale-val').textContent = val + '%';
        scene.setOverlayScale(val / 100);
      });
    }
    
    if (rotSlider) {
      rotSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        document.getElementById('overlay-rotation-val').innerHTML = val + '&deg;';
        scene.setOverlayRotation(val);
      });
    }
    
    if (opSlider) {
      opSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        document.getElementById('overlay-opacity-val').textContent = val + '%';
        scene.setOverlayOpacity(val / 100);
      });
    }
    
    // Reset overlay position
    const resetOverlayBtn = document.getElementById('reset-overlay-btn');
    if (resetOverlayBtn) {
      resetOverlayBtn.addEventListener('click', () => {
        if (posXSlider) posXSlider.value = 0;
        if (posZSlider) posZSlider.value = 0;
        if (scSlider) scSlider.value = 100;
        if (rotSlider) rotSlider.value = 0;
        if (opSlider) opSlider.value = 70;
        
        if (document.getElementById('overlay-pos-x-val')) document.getElementById('overlay-pos-x-val').textContent = 0;
        if (document.getElementById('overlay-pos-z-val')) document.getElementById('overlay-pos-z-val').textContent = 0;
        if (document.getElementById('overlay-scale-val')) document.getElementById('overlay-scale-val').textContent = '100%';
        if (document.getElementById('overlay-rotation-val')) document.getElementById('overlay-rotation-val').innerHTML = '0&deg;';
        if (document.getElementById('overlay-opacity-val')) document.getElementById('overlay-opacity-val').textContent = '70%';
        
        scene.setOverlayPosition(0, 0);
        scene.setOverlayScale(1);
        scene.setOverlayRotation(0);
        scene.setOverlayOpacity(0.7);
      });
    }
    
    // Save overlay button
    const saveOverlayBtn = document.getElementById('save-overlay-btn');
    if (saveOverlayBtn) {
      saveOverlayBtn.addEventListener('click', async () => {
        try {
          const settings = {
            overlay: {
              x: scene.overlaySettings.x,
              z: scene.overlaySettings.z,
              y: scene.overlaySettings.z,
              scale: scene.overlaySettings.scale,
              rotation: scene.overlaySettings.rotation,
              opacity: scene.overlaySettings.opacity
            }
          };
          
          await fetch('/api/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
          });
          
          showToast('Overlay position saved successfully!', 'success');
        } catch (err) {
          showToast('Failed to save overlay settings', 'error');
        }
      });
    }
  }
  
  // --- Event Listeners ---
  function setupEventListeners() {
    // Close edit panel
    document.getElementById('close-edit-panel').addEventListener('click', closeEditPanel);
    
    // Save plot changes
    document.getElementById('save-plot-btn').addEventListener('click', savePlotChanges);
    
    // Status toggle buttons
    document.querySelectorAll('.status-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.status-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
    
    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const filter = btn.dataset.filter;
        const search = document.getElementById('search-input').value.trim();
        renderPlotList(plotsData, filter, search);
      });
    });
    
    // Search
    document.getElementById('search-input').addEventListener('input', (e) => {
      const activeFilter = document.querySelector('.filter-btn.active').dataset.filter;
      renderPlotList(plotsData, activeFilter, e.target.value.trim());
    });
    
    // View controls
    const btnGmap = document.getElementById('btn-view-gmap');
    if (btnGmap) {
      btnGmap.addEventListener('click', () => {
        setViewMode('gmap');
      });
    }

    document.getElementById('btn-view-top').addEventListener('click', () => {
      setViewMode('top');
      if (scene) scene.setTopView();
    });
    
    document.getElementById('btn-view-3d').addEventListener('click', () => {
      setViewMode('3d');
      if (scene) scene.set3DView();
    });
    
    const toggleLabelsBtn = document.getElementById('btn-toggle-labels');
    if (toggleLabelsBtn) {
      toggleLabelsBtn.addEventListener('click', () => {
        if (scene) {
          const active = scene.toggleLabels();
          toggleLabelsBtn.classList.toggle('active', active);
        }
      });
    }
    
    // Logout
    document.getElementById('logout-btn').addEventListener('click', async () => {
      await fetch('/api/logout', { method: 'POST' });
      window.location.reload();
    });
    
    // Overlay controls
    setupOverlayControls();
    
    // Layout Editor controls
    setupLayoutEditorControls();
    
    // Bulk actions
    const bulkSelect = document.getElementById('bulk-status-select');
    if (bulkSelect) {
      bulkSelect.addEventListener('change', async (e) => {
        const newStatus = e.target.value;
        if (!newStatus) return;
        
        // Get currently visible/filtered plot IDs
        const visibleItems = document.querySelectorAll('.plot-list-item');
        const updates = [];
        
        visibleItems.forEach(item => {
          updates.push({ id: item.dataset.plotId, status: newStatus });
        });
        
        if (updates.length === 0) return;
        
        if (!confirm(`Mark ${updates.length} plots as "${newStatus}"?`)) {
          e.target.value = '';
          return;
        }
        
        try {
          const res = await fetch('/api/plots-bulk', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ updates })
          });
          
          const result = await res.json();
          
          if (result.success) {
            // Reload data
            plotsData = result.plots;
            scene.createPlots(plotsData);
            if (gmapManager) {
              gmapManager.loadLayout(plotsData);
            }
            
            const activeFilter = document.querySelector('.filter-btn.active').dataset.filter;
            renderPlotList(plotsData, activeFilter);
            updateCounts(plotsData);
            
            showToast(`${updates.length} plots marked as ${newStatus}`, 'success');
          }
        } catch (err) {
          showToast('Bulk update failed', 'error');
        }
        
        e.target.value = '';
      });
    }
  }
  
  function setActiveViewBtn(activeId) {
    document.querySelectorAll('.view-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(activeId).classList.add('active');
  }
  
  // --- Toast Notifications ---
  function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      ${type === 'success' ? '&#10003;' : '&#10007;'}
      ${message}
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  function renderPlacedAssetsList() {
    const listContainer = document.getElementById('placed-assets-list');
    const badgeEl = document.getElementById('asset-count-badge');
    if (!listContainer || !scene) return;

    const layoutItems = scene.getAllPlacedAssets();
    if (badgeEl) badgeEl.textContent = `${layoutItems.length} Items`;

    if (layoutItems.length === 0) {
      listContainer.innerHTML = '<div style="padding: 10px; text-align: center; color: #64748b; font-size: 0.78rem;">No roads, walls, or amenities placed yet</div>';
      return;
    }

    listContainer.innerHTML = '';
    layoutItems.forEach((ast) => {
      const item = document.createElement('div');
      const isSelected = scene.selectedMesh === ast.mesh;
      item.style.cssText = `
        display: flex; justify-content: space-between; align-items: center;
        padding: 5px 8px; margin-bottom: 3px; border-radius: 4px;
        background: ${isSelected ? 'rgba(59,130,246,0.3)' : 'rgba(30,41,59,0.5)'};
        border: 1px solid ${isSelected ? 'rgba(59,130,246,0.8)' : 'rgba(255,255,255,0.05)'};
        cursor: pointer; transition: all 0.15s ease;
      `;

      const icon = ast.type === 'Amenity' ? '🏛️' : ast.type === 'Wall' ? '🧱' : '🛣️';

      item.innerHTML = `
        <div style="display: flex; align-items: center; gap: 6px; overflow: hidden; font-size: 0.78rem; color: #f1f5f9; white-space: nowrap; text-overflow: ellipsis;">
          <span>${icon}</span>
          <span style="font-weight: 500;">${ast.name}</span>
        </div>
        <button class="asset-item-delete" style="background: rgba(239,68,68,0.2); color: #f87171; border: 1px solid rgba(239,68,68,0.4); border-radius: 4px; padding: 2px 6px; font-size: 0.7rem; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 3px;" title="Delete Item">
          🗑️ Delete
        </button>
      `;

      item.addEventListener('click', (e) => {
        if (e.target.closest('.asset-item-delete')) return;
        scene.selectObject(ast.mesh);
        renderPlacedAssetsList();
      });

      item.querySelector('.asset-item-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        scene.selectObject(ast.mesh);
        const deleted = scene.deleteSelectedObject();
        if (deleted) {
          showToast(`Deleted ${deleted.name}`, 'success');
          populateAssetDropdown();
        }
        renderPlacedAssetsList();
      });

      listContainer.appendChild(item);
    });
  }

  function populateAssetDropdown() {
    const dropdown = document.getElementById('select-asset-dropdown');
    if (!dropdown) return;

    dropdown.innerHTML = '<option value="" style="background:#0f172a; color:#38bdf8;">🎯 Select Plot / Road / Wall / Amenity...</option>';

    // Add Plots 1 to 96 directly for bulletproof cross-browser rendering
    for (let i = 1; i <= 96; i++) {
      const opt = document.createElement('option');
      opt.value = 'plot_' + i;
      opt.textContent = `Plot ${i}`;
      opt.style.background = '#0f172a';
      opt.style.color = '#ffffff';
      dropdown.appendChild(opt);
    }

    // Add Roads, Walls, and Amenities
    if (scene) {
      const assets = scene.getAllPlacedAssets();
      assets.forEach(ast => {
        const opt = document.createElement('option');
        opt.value = ast.type.toLowerCase() + '_' + ast.id;
        opt.textContent = `${ast.type}: ${ast.name}`;
        opt.style.background = '#0f172a';
        opt.style.color = '#60a5fa';
        dropdown.appendChild(opt);
      });
    }
  }

  function updateSelectedAssetUI(info) {
    const nameEl = document.getElementById('selected-asset-name');
    const deleteBtn = document.getElementById('btn-delete-asset');
    const dropdown = document.getElementById('select-asset-dropdown');
    const textGroup = document.getElementById('text-label-editor-group');
    const inputLabelText = document.getElementById('input-label-text');
    const inputLabelBgColor = document.getElementById('input-label-bgcolor');
    const inputLabelTextColor = document.getElementById('input-label-textcolor');

    if (dropdown && dropdown.options.length <= 1) {
      populateAssetDropdown();
    }

    if (nameEl && deleteBtn) {
      if (info) {
        nameEl.textContent = `${info.type}: ${info.name}`;
        deleteBtn.disabled = false;
        deleteBtn.style.opacity = '1';
        deleteBtn.style.cursor = 'pointer';

        if (info.mesh?.userData?.isTextLabel) {
          if (textGroup) textGroup.classList.remove('hidden');
          const lData = info.mesh.userData.labelData || {};
          if (inputLabelText) inputLabelText.value = lData.text || '';
          if (inputLabelBgColor) inputLabelBgColor.value = lData.bgColor || '#0284c7';
          if (inputLabelTextColor) inputLabelTextColor.value = lData.textColor || '#ffffff';
        } else {
          if (textGroup) textGroup.classList.add('hidden');
        }

        if (dropdown) {
          if (info.type === 'Plot') {
            const plotId = info.name.replace('Plot ', '').trim();
            dropdown.value = 'plot_' + plotId;
          } else {
            const astKey = info.type.toLowerCase() + '_' + (info.mesh?.userData?.roadData?.id || info.mesh?.userData?.amenityId || info.mesh?.userData?.wallData?.id || info.mesh?.userData?.labelData?.id || '');
            dropdown.value = astKey;
          }
        }
      } else {
        nameEl.textContent = 'None (Click an asset in 3D or select below)';
        deleteBtn.disabled = true;
        deleteBtn.style.opacity = '0.5';
        deleteBtn.style.cursor = 'not-allowed';
        if (textGroup) textGroup.classList.add('hidden');
        if (dropdown) dropdown.value = '';
      }
    }
    renderPlacedAssetsList();
  }

  // --- Layout Editor Controls ---
  function setupLayoutEditorControls() {
    const toggleBtn = document.getElementById('btn-toggle-edit');
    const editorPanel = document.getElementById('layout-editor-tools');
    const dropdown = document.getElementById('select-asset-dropdown');
    
    if (!toggleBtn || !editorPanel) return;
    
    const activateTransformButton = (buttonId) => {
      document.querySelectorAll('.transform-modes .action-btn').forEach(b => b.classList.remove('active'));
      const btn = document.getElementById(buttonId);
      if (btn) btn.classList.add('active');
    };

    let isEditMode = false;

    // Global 3D Editor Keyboard Hotkeys: W (Move), E (Scale), R (Rotate), T (Vertices)
    window.addEventListener('keydown', (e) => {
      const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') return;
      if (!isEditMode) return;

      const key = e.key.toLowerCase();
      if (key === 'w') {
        scene.setTransformMode('translate');
        activateTransformButton('btn-mode-translate');
        showToast('Mode: Move (W)', 'info');
      } else if (key === 'e') {
        scene.setTransformMode('scale');
        activateTransformButton('btn-mode-scale');
        showToast('Mode: Scale (E)', 'info');
      } else if (key === 'r') {
        scene.setTransformMode('rotate');
        activateTransformButton('btn-mode-rotate');
        showToast('Mode: Rotate (R)', 'info');
      } else if (key === 't') {
        const btnVertex = document.getElementById('btn-mode-vertex');
        if (btnVertex) btnVertex.click();
      }
    });
    
    toggleBtn.addEventListener('click', () => {
      isEditMode = !isEditMode;
      toggleBtn.classList.toggle('active', isEditMode);
      editorPanel.classList.toggle('hidden', !isEditMode);
      scene.setEditMode(isEditMode);
      if (isEditMode) {
        activateTransformButton('btn-mode-translate');
        populateAssetDropdown();
        showToast('3D Layout Editor Enabled', 'success');
        renderPlacedAssetsList();
      } else {
        updateSelectedAssetUI(null);
      }
    });

    if (dropdown) {
      dropdown.addEventListener('change', (e) => {
        const val = e.target.value;
        if (!val) {
          scene.selectObject(null);
          return;
        }

        if (val.startsWith('plot_')) {
          const plotId = parseInt(val.replace('plot_', ''));
          if (scene.plotMeshes && scene.plotMeshes[plotId]) {
            scene.selectObject(scene.plotMeshes[plotId]);
          }
        } else {
          const assets = scene.getAllPlacedAssets();
          const found = assets.find(a => (a.type.toLowerCase() + '_' + a.id) === val);
          if (found && found.mesh) {
            scene.selectObject(found.mesh);
          }
        }
      });
    }
    
    const deleteBtn = document.getElementById('btn-delete-asset');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        const deleted = scene.deleteSelectedObject();
        if (deleted) {
          showToast(`Deleted ${deleted.name} successfully!`, 'success');
          populateAssetDropdown();
        }
        renderPlacedAssetsList();
      });
    }

    const drawPolygonToolbar = document.getElementById('draw-polygon-toolbar');

    const drawPolygonBtn = document.getElementById('btn-draw-polygon');
    if (drawPolygonBtn) {
      drawPolygonBtn.addEventListener('click', () => {
        if (!scene) return;
        scene.startPolygonDrawing();
        if (drawPolygonToolbar) drawPolygonToolbar.classList.remove('hidden');
        showToast('Polygon Line-by-Line Drawing Mode active. Click points on map to draw boundary lines.', 'info');
      });
    }

    const finishPolygonBtn = document.getElementById('btn-finish-polygon');
    if (finishPolygonBtn) {
      finishPolygonBtn.addEventListener('click', () => {
        if (!scene || !scene.drawingPoints) return;
        const num = prompt(`Closing polygon loop with ${scene.drawingPoints.length} points!\nEnter Plot Number:`, '');
        const newMesh = scene.finishPolygonDrawing(num);
        if (drawPolygonToolbar) drawPolygonToolbar.classList.add('hidden');
        if (newMesh) {
          showToast(`Plot ${newMesh.userData.plotId} polygon created & auto-saved!`, 'success');
          populateAssetDropdown();
          renderPlacedAssetsList();
        }
      });
    }

    const cancelPolygonBtn = document.getElementById('btn-cancel-polygon');
    if (cancelPolygonBtn) {
      cancelPolygonBtn.addEventListener('click', () => {
        if (!scene) return;
        scene.cancelPolygonDrawing();
        if (drawPolygonToolbar) drawPolygonToolbar.classList.add('hidden');
        showToast('Polygon drawing cancelled', 'info');
      });
    }

    const addPlotBtn = document.getElementById('btn-add-plot');
    if (addPlotBtn) {
      addPlotBtn.addEventListener('click', () => {
        const num = prompt('Enter Plot Number (leave empty to auto-number):', '');
        const newMesh = scene.addNewPlot(num);
        if (newMesh) {
          const plotId = newMesh.userData.plotId;
          showToast(`Plot ${plotId} created! Drag handle to position, or type dimensions.`, 'success');
          populateAssetDropdown();
          renderPlacedAssetsList();
        }
      });
    }

    const addTextLabelBtn = document.getElementById('btn-add-text-label');
    if (addTextLabelBtn) {
      addTextLabelBtn.addEventListener('click', () => {
        const text = prompt('Enter Custom Text Label Content:', 'Main Entrance 30 Ft Road');
        if (text && text.trim()) {
          const newGroup = scene.addTextLabel(text.trim(), 0, 0);
          showToast(`🏷️ Text Label "${text.trim()}" created! Drag handle or use controls to position/resize.`, 'success');
          populateAssetDropdown();
          renderPlacedAssetsList();
          autoSaveLayout();
        }
      });
    }

    const approvePlotBtn = document.getElementById('btn-approve-plot');
    if (approvePlotBtn) {
      approvePlotBtn.addEventListener('click', () => {
        if (!scene || !scene.selectedMesh) {
          alert('Please select a plot on the layout map first!');
          return;
        }
        const plotId = scene.selectedMesh.userData.plotId;
        if (!plotId) {
          alert('Selected object is not a plot!');
          return;
        }

        if (!plotsData[plotId]) plotsData[plotId] = { number: plotId, area: 1500, status: 'available' };
        plotsData[plotId].approved = true;

        scene.createPlots(plotsData);
        scene.selectPlot(plotId);
        autoSaveLayout();

        showToast(`✓ Plot ${plotId} boundary APPROVED! 3D Polygon created!`, 'success');
      });
    }

    const approveAllBtn = document.getElementById('btn-approve-all-plots');
    if (approveAllBtn) {
      approveAllBtn.addEventListener('click', () => {
        if (!confirm('Approve boundaries and build 3D polygons for ALL 96 plots?')) return;
        
        for (let i = 1; i <= 96; i++) {
          const strId = String(i);
          if (!plotsData[strId]) plotsData[strId] = { number: i, area: 1500, status: 'available' };
          plotsData[strId].approved = true;
        }

        scene.createPlots(plotsData);
        autoSaveLayout();

        showToast('✓ All 96 plots APPROVED! 3D polygons generated successfully!', 'success');
      });
    }

    const addAmenityBtn = document.getElementById('btn-add-amenity');
    if (addAmenityBtn) {
      addAmenityBtn.addEventListener('click', () => {
        const type = prompt('Select Amenity Type to Add:\n• park (Park & Floral Garden)\n• gate (Grand Entrance Gate)\n• clubhouse (Community Clubhouse)\n• watertower (Overhead Water Tank)\n• fountain (Water Fountain)\n• streetlight (Street Light Pole)', 'park');
        if (type) {
          const cleanType = type.toLowerCase().trim();
          scene.addAmenity(cleanType, 0, 0);
          showToast(`New ${cleanType} amenity added. Drag handles to move/scale/rotate.`, 'success');
          populateAssetDropdown();
          renderPlacedAssetsList();
        }
      });
    }

    const addRoadBtn = document.getElementById('btn-add-road');
    if (addRoadBtn) {
      addRoadBtn.addEventListener('click', () => {
        const choice = prompt('Select Road Width to Add:\n• 20 (20 Feet Internal Road)\n• 30 (30 Feet Main Road)\n• 40 (40 Feet Avenue)\n• 50 (50 Feet Ring Road)', '20');
        if (choice) {
          const widthFeet = parseInt(choice) || 20;
          scene.addNewRoad(widthFeet);
          showToast(`🛣️ New ${widthFeet} Feet Road added! Drag/Move/Scale/Rotate to position.`, 'success');
          populateAssetDropdown();
          renderPlacedAssetsList();
        }
      });
    }

    const addWallBtn = document.getElementById('btn-add-wall');
    if (addWallBtn) {
      addWallBtn.addEventListener('click', () => {
        scene.addNewWall();
        showToast('🧱 New 3D Layout Covered Boundary Wall added! Drag/Move/Scale/Rotate to enclose layout.', 'success');
        populateAssetDropdown();
        renderPlacedAssetsList();
      });
    }
    
    document.getElementById('btn-mode-translate').addEventListener('click', (e) => {
      scene.setTransformMode('translate');
      activateTransformButton(e.target.id);
    });
    
    document.getElementById('btn-mode-scale').addEventListener('click', (e) => {
      scene.setTransformMode('scale');
      activateTransformButton(e.target.id);
    });
    
    document.getElementById('btn-mode-rotate').addEventListener('click', (e) => {
      scene.setTransformMode('rotate');
      activateTransformButton(e.target.id);
    });

    const btnVertex = document.getElementById('btn-mode-vertex');
    if (btnVertex) {
      btnVertex.addEventListener('click', (e) => {
        scene.setTransformMode('vertex');
        activateTransformButton(e.target.id);
        showToast('Vertex Corner Handles active. Adjust corner handles or type exact dimensions.', 'info');
      });
    }

    const inputW = document.getElementById('input-asset-w');
    const inputD = document.getElementById('input-asset-d');
    const inputH = document.getElementById('input-asset-h');
    const inputRot = document.getElementById('input-asset-rot');
    const inputX = document.getElementById('input-asset-x');
    const inputZ = document.getElementById('input-asset-z');
    const inputLabelText = document.getElementById('input-label-text');
    const inputLabelBgColor = document.getElementById('input-label-bgcolor');
    const inputLabelTextColor = document.getElementById('input-label-textcolor');

    const handleTextLabelInputChange = () => {
      if (scene && scene.selectedMesh && scene.selectedMesh.userData?.isTextLabel) {
        scene.updateTextLabel(
          scene.selectedMesh,
          inputLabelText?.value,
          inputLabelBgColor?.value,
          inputLabelTextColor?.value
        );
        const nameEl = document.getElementById('selected-asset-name');
        if (nameEl) nameEl.textContent = `Text Label: ${inputLabelText?.value || 'Label'}`;
        autoSaveLayout();
      }
    };

    if (inputLabelText) inputLabelText.addEventListener('input', handleTextLabelInputChange);
    if (inputLabelBgColor) inputLabelBgColor.addEventListener('input', handleTextLabelInputChange);
    if (inputLabelTextColor) inputLabelTextColor.addEventListener('input', handleTextLabelInputChange);

    const handleDimInputChange = () => {
      const w = parseFloat(inputW?.value);
      const d = parseFloat(inputD?.value);
      const h = parseFloat(inputH?.value);
      const rot = parseFloat(inputRot?.value);
      const posX = parseFloat(inputX?.value);
      const posZ = parseFloat(inputZ?.value);
      scene.setMeshDimensions({ w, d, h, rotDeg: rot, posX, posZ });
    };

    if (inputW) inputW.addEventListener('input', handleDimInputChange);
    if (inputD) inputD.addEventListener('input', handleDimInputChange);
    if (inputH) inputH.addEventListener('input', handleDimInputChange);
    if (inputRot) inputRot.addEventListener('input', handleDimInputChange);
    if (inputX) inputX.addEventListener('input', handleDimInputChange);
    if (inputZ) inputZ.addEventListener('input', handleDimInputChange);
    
    document.getElementById('btn-save-layout').addEventListener('click', async () => {
      const btn = document.getElementById('btn-save-layout');
      btn.textContent = 'Saving...';
      try {
        const result = await persistLayout({ keepalive: true, silent: false });
        if (result.success) {
          showToast('Layout & Asset changes saved successfully!', 'success');
          renderPlacedAssetsList();
        } else {
          showToast('Failed to save layout', 'error');
        }
      } catch (err) {
        showToast('Error saving layout', 'error');
      }
      btn.textContent = '💾 Save Layout Changes';
    });
  }
  
  function setActiveViewBtn(activeId) {
    document.querySelectorAll('.view-btn').forEach(btn => btn.classList.remove('active'));
    const btn = document.getElementById(activeId);
    if (btn) btn.classList.add('active');
  }

  function setupPasswordModal() {
    const openBtn = document.getElementById('btn-open-password-modal');
    const modal = document.getElementById('change-password-modal');
    const closeBtn = document.getElementById('close-password-modal');
    const cancelBtn = document.getElementById('cancel-password-btn');
    const form = document.getElementById('change-password-form');

    if (!modal) return;

    const openModal = () => modal.classList.remove('hidden');
    const closeModal = () => {
      modal.classList.add('hidden');
      if (form) form.reset();
    };

    if (openBtn) openBtn.addEventListener('click', openModal);
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const currentPassword = document.getElementById('current-password-input')?.value || '';
        const newUsername = document.getElementById('new-username-input')?.value || '';
        const newPassword = document.getElementById('new-password-input')?.value || '';
        const confirmPassword = document.getElementById('confirm-password-input')?.value || '';

        if (newPassword !== confirmPassword) {
          showToast('New passwords do not match!', 'error');
          return;
        }

        if (newPassword.length < 4) {
          showToast('New password must be at least 4 characters long.', 'error');
          return;
        }

        const submitBtn = document.getElementById('save-password-btn');
        if (submitBtn) submitBtn.textContent = '⏳ Updating...';

        try {
          const res = await fetch('/api/change-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ currentPassword, newUsername, newPassword })
          });
          const data = await res.json();
          if (data.success) {
            showToast('🔑 ' + data.message, 'success');
            closeModal();
          } else {
            showToast(data.message || 'Failed to change password', 'error');
          }
        } catch (err) {
          showToast('Server error changing password', 'error');
        }

        if (submitBtn) submitBtn.textContent = 'Update Credentials';
      });
    }
  }

  // --- Start ---
  document.addEventListener('DOMContentLoaded', () => {
    init();
    setupPasswordModal();
    document.querySelectorAll('.btn-share-action').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        handleAdminShareAction();
      });
    });
  });

  async function handleAdminShareAction() {
    const shareData = {
      title: 'Maudai Premium Plots - 3D Site Layout',
      text: 'Explore Maudai Premium Plots 3D Interactive Layout & Plot Availability!',
      url: window.location.origin
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch (err) {
        if (err.name !== 'AbortError') console.warn('Share error:', err);
        else return;
      }
    }

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(window.location.origin);
      } else {
        const input = document.createElement('input');
        input.value = window.location.origin;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
      }
      showToast('🔗 Website link copied to clipboard!', 'info');
    } catch (e) {
      showToast('🔗 Website URL: ' + window.location.origin, 'info');
    }
  }
  
})();
