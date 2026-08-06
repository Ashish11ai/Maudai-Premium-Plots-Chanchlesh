/**
 * Main Application Logic - Customer View
 * Handles data fetching, plot list rendering, and 3D scene interaction.
 */

(function() {
  'use strict';
  
  let scene;
  let gmapManager;
  let locationMapInstance = null;
  let plotsData = {};
  let currentViewMode = '2d'; // '2d', '3d'
  let locationPanelOpen = false;
  
  // --- Init ---
  async function init() {
    const hideLoader = () => {
      const loader = document.getElementById('loading-screen');
      if (loader) {
        loader.classList.add('hidden');
        setTimeout(() => {
          loader.style.display = 'none';
        }, 500);
      }
    };

    try {
      // 1. Fetch plots data
      try {
        plotsData = await fetchPlots();
      } catch (e) {
        console.warn('Failed to fetch plots API, fallback:', e);
      }

      // 2. Initialize Google Map Manager
      try {
        const gmapElem = document.getElementById('gmap-container');
        if (gmapElem && typeof GMapManager !== 'undefined') {
          gmapManager = new GMapManager('gmap-container', {
            isAdmin: false,
            onPlotClick: (plotId) => showPlotInfo(plotId),
            onPlotHover: (plotId) => highlightListItem(plotId)
          });
          if (plotsData && Object.keys(plotsData).length > 0) {
            gmapManager.loadLayout(plotsData);
          }
        }
      } catch (e) {
        console.warn('GMapManager init warning:', e);
      }
      
      // 3. Initialize 3D scene
      try {
        const canvas = document.getElementById('scene-canvas');
        if (canvas && typeof PlotScene !== 'undefined') {
          scene = new PlotScene(canvas, {
            isAdmin: false,
            onPlotClick: (plotId) => showPlotInfo(plotId),
            onPlotHover: (plotId) => highlightListItem(plotId),
            onInfrastructureClick: (info) => showInfraInfo(info)
          });
          if (plotsData && Object.keys(plotsData).length > 0) {
            scene.createPlots(plotsData);
          }
        }
      } catch (e) {
        console.warn('PlotScene init warning:', e);
      }
      
      // 4. Render plot list & counts
      try {
        if (plotsData && Object.keys(plotsData).length > 0) {
          renderPlotList(plotsData);
          updateCounts(plotsData);
        }
      } catch (e) {
        console.warn('Plot list render warning:', e);
      }
      
      // 5. Setup event listeners
      try {
        setupEventListeners();
      } catch (e) {
        console.warn('Event listeners setup warning:', e);
      }
      
      // 6. Load overlay settings
      try {
        await loadOverlaySettings();
      } catch (e) {
        console.warn('Overlay settings load warning:', e);
      }

      // 7. Setup location panel
      try {
        setupLocationPanel();
      } catch (e) {
        console.warn('Location panel setup warning:', e);
      }

      // 8. Start with 3D layout view, then auto-switch to 2D Google Map after 5 seconds
      try {
        setViewMode('3d');
        setTimeout(() => {
          setViewMode('2d');
        }, 5000);
      } catch (e) {
        console.warn('setViewMode warning:', e);
      }
      
      // Hide loading screen
      setTimeout(hideLoader, 400);
      
    } catch (err) {
      console.error('Initialization error:', err);
      setTimeout(hideLoader, 600);
    }
  }
  
  // --- API Calls ---
  async function fetchPlots() {
    try {
      const res = await fetch('/api/plots');
      if (res.ok) return await res.json();
    } catch (e) {}
    const resStatic = await fetch('/data/plots.json');
    if (!resStatic.ok) throw new Error('HTTP error ' + resStatic.status);
    return await resStatic.json();
  }
  
  async function loadOverlaySettings() {
    try {
      let settings;
      try {
        const res = await fetch('/api/settings');
        if (res.ok) settings = await res.json();
      } catch (e) {}
      if (!settings) {
        const resStatic = await fetch('/data/settings.json');
        if (resStatic.ok) settings = await resStatic.json();
      }
      if (settings && settings.gmap && scene) {
        scene.setGMapPlacement(settings.gmap);
      }
      if (settings && settings.gmap && gmapManager) {
        gmapManager.setPlacementSettings(settings.gmap);
      }
      // defaultView from settings is ignored — startup handles 3D→2D auto-switch
    } catch (e) {
      console.error('Failed to load overlay settings:', e);
    }
  }
  
  // --- Plot List ---
  function renderPlotList(plots, filter = 'all', search = '') {
    if (gmapManager) {
      gmapManager.filterPlots(filter);
      gmapManager.searchPlots(search);
    }

    const list = document.getElementById('plot-list');
    if (!list) return;
    list.innerHTML = '';
    
    const sortedKeys = Object.keys(plots).sort((a, b) => parseInt(a) - parseInt(b));
    let visibleCount = 0;
    
    sortedKeys.forEach(id => {
      const plot = plots[id];
      if (!plot) return;
      
      // Apply filter
      if (filter !== 'all' && plot.status !== filter) return;
      
      // Apply search
      if (search && !id.toString().includes(search)) return;
      
      visibleCount++;
      
      const dimStr = plot.dimensions_str ? ` | ${plot.dimensions_str}` : '';
      
      const item = document.createElement('div');
      item.className = 'plot-list-item';
      item.dataset.plotId = id;
      item.innerHTML = `
        <div class="plot-number-badge ${plot.status}">${id}</div>
        <div class="plot-list-info">
          <div class="plot-list-title">Plot ${id}</div>
          <div class="plot-list-area">${plot.area.toLocaleString()} sq.ft.${dimStr}</div>
        </div>
        <span class="plot-list-status ${plot.status}">${plot.status}</span>
      `;
      
      item.addEventListener('click', () => {
        showPlotInfo(parseInt(id));
        if (scene) scene.selectPlot(parseInt(id));
        if (gmapManager) gmapManager.selectPlot(parseInt(id));
        
        document.querySelectorAll('.plot-list-item').forEach(el => el.classList.remove('selected'));
        item.classList.add('selected');
      });
      
      list.appendChild(item);
    });
    
    if (visibleCount === 0) {
      list.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">No plots found</div>';
    }
  }
  
  function highlightListItem(plotId) {
    document.querySelectorAll('.plot-list-item').forEach(el => {
      el.classList.toggle('highlight', parseInt(el.dataset.plotId) === plotId);
    });
  }
  
  // --- Plot Info Panel ---
  function showPlotInfo(plotId) {
    const plot = plotsData[plotId];
    if (!plot) return;
    
    const panel = document.getElementById('plot-info-panel');
    const listPanel = document.getElementById('plot-list-panel');
    
    if (panel) panel.classList.remove('hidden');
    if (listPanel) listPanel.classList.add('hidden');
    
    const titleEl = document.getElementById('plot-info-title');
    if (titleEl) titleEl.textContent = `Plot ${plotId}`;
    
    const numEl = document.getElementById('info-plot-number');
    if (numEl) numEl.textContent = plotId;
    
    const areaEl = document.getElementById('info-plot-area');
    if (areaEl) areaEl.textContent = `${plot.area.toLocaleString()} sq.ft.`;
    
    const dimEl = document.getElementById('info-plot-dimensions');
    if (dimEl) dimEl.textContent = plot.dimensions_str || '-';
    
    const roadEl = document.getElementById('info-plot-road');
    if (roadEl) roadEl.textContent = plot.facing_road || 'Standard Access Road';
    
    const statusEl = document.getElementById('info-plot-status');
    if (statusEl) {
      statusEl.textContent = plot.status.charAt(0).toUpperCase() + plot.status.slice(1);
      statusEl.className = 'info-value status-badge ' + plot.status;
    }
    
    // Price
    const priceContainer = document.getElementById('info-price-container');
    const priceEl = document.getElementById('info-plot-price');
    if (plot.price && plot.price > 0) {
      if (priceContainer) priceContainer.style.display = 'block';
      if (priceEl) priceEl.textContent = '\u20B9 ' + plot.price.toLocaleString();
    } else {
      if (priceContainer) priceContainer.style.display = 'none';
    }
    
    // Notes
    const notesEl = document.getElementById('info-plot-notes');
    if (notesEl) {
      if (plot.notes && plot.notes.trim()) {
        notesEl.textContent = plot.notes;
        notesEl.classList.add('visible');
      } else {
        notesEl.classList.remove('visible');
      }
    }
    
    // WhatsApp link
    const waLink = document.getElementById('info-whatsapp-link');
    if (waLink) {
      const dimInfo = plot.dimensions_str ? ` [${plot.dimensions_str}]` : '';
      const WHATSAPP = typeof WHATSAPP_NUMBER !== 'undefined' ? WHATSAPP_NUMBER : '919340153055';
      const message = `Hi, I am interested in Plot ${plotId}${dimInfo} (${plot.area.toLocaleString()} sq.ft., ${plot.facing_road || 'Road facing'}) in Maudai Premium Plots. Please share more details.`;
      waLink.href = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(message)}`;
    }
    
    document.querySelectorAll('.plot-list-item').forEach(el => {
      el.classList.toggle('selected', parseInt(el.dataset.plotId) === plotId);
    });
  }
  
  function showInfraInfo(info) {
    if (!info) {
      closePlotInfo();
      return;
    }

    const panel = document.getElementById('plot-info-panel');
    const listPanel = document.getElementById('plot-list-panel');
    
    if (panel) panel.classList.remove('hidden');
    if (listPanel) listPanel.classList.add('hidden');

    if (info.type === 'Road') {
      const roadData = info.data || {};
      const roadName = roadData.name || info.name || 'Road Asset';
      const titleEl = document.getElementById('plot-info-title');
      if (titleEl) titleEl.textContent = `Road Specifications`;
      
      const numEl = document.getElementById('info-plot-number');
      if (numEl) numEl.textContent = roadName;
      
      const dimEl = document.getElementById('info-plot-dimensions');
      if (dimEl) dimEl.textContent = `${roadData.w || 30} ft Wide Road`;
      
      const areaEl = document.getElementById('info-plot-area');
      if (areaEl) areaEl.textContent = `${roadData.d ? Math.round(roadData.d * 3.28) + ' ft Length' : 'Asphalt Surface'}`;
      
      const roadEl = document.getElementById('info-plot-road');
      if (roadEl) roadEl.textContent = roadData.type ? (roadData.type.toUpperCase() + ' SECTOR ROAD') : 'SITE ROAD NETWORK';
      
      const statusEl = document.getElementById('info-plot-status');
      if (statusEl) {
        statusEl.textContent = 'Active Road';
        statusEl.className = 'info-value status-badge available';
      }
      
      const priceContainer = document.getElementById('info-price-container');
      if (priceContainer) priceContainer.style.display = 'none';

      const notesEl = document.getElementById('info-plot-notes');
      if (notesEl) {
        notesEl.textContent = `Scanned CAD Infrastructure: ${roadName} (${roadData.w || 30}ft wide paved layout road).`;
        notesEl.classList.add('visible');
      }

      const waLink = document.getElementById('info-whatsapp-link');
      if (waLink) {
        const WHATSAPP = typeof WHATSAPP_NUMBER !== 'undefined' ? WHATSAPP_NUMBER : '919340153055';
        const message = `Hi, I am inquiring about the ${roadName} road specification in Maudai Layout project.`;
        waLink.href = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(message)}`;
      }
    } else if (info.type === 'Wall') {
      const wallData = info.data || {};
      const titleEl = document.getElementById('plot-info-title');
      if (titleEl) titleEl.textContent = `Boundary Wall`;
      
      const numEl = document.getElementById('info-plot-number');
      if (numEl) numEl.textContent = wallData.id || 'Perimeter Wall';
      
      const dimEl = document.getElementById('info-plot-dimensions');
      if (dimEl) dimEl.textContent = `Height: ${wallData.height || 0.8}m | Thickness: ${wallData.thickness || 0.24}m`;
      
      const areaEl = document.getElementById('info-plot-area');
      if (areaEl) areaEl.textContent = `Length: ${Math.round((wallData.len || 1) * 3.28)} ft`;
      
      const roadEl = document.getElementById('info-plot-road');
      if (roadEl) roadEl.textContent = 'Site Outer Boundary';
      
      const statusEl = document.getElementById('info-plot-status');
      if (statusEl) {
        statusEl.textContent = 'Secured Wall';
        statusEl.className = 'info-value status-badge available';
      }

      const priceContainer = document.getElementById('info-price-container');
      if (priceContainer) priceContainer.style.display = 'none';

      const notesEl = document.getElementById('info-plot-notes');
      if (notesEl) {
        notesEl.textContent = `3D Covered Site Red Perimeter Wall Segment (Brick masonry with white concrete cap).`;
        notesEl.classList.add('visible');
      }

      const waLink = document.getElementById('info-whatsapp-link');
      if (waLink) {
        const WHATSAPP = typeof WHATSAPP_NUMBER !== 'undefined' ? WHATSAPP_NUMBER : '919340153055';
        const message = `Hi, I am inquiring about the Maudai Layout site boundary and perimeter security.`;
        waLink.href = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(message)}`;
      }
    }
  }

  function closePlotInfo() {
    const infoPanel = document.getElementById('plot-info-panel');
    const listPanel = document.getElementById('plot-list-panel');
    if (infoPanel) infoPanel.classList.add('hidden');
    if (listPanel) listPanel.classList.remove('hidden');
    if (scene) {
      scene.selectPlot(null);
      if (scene.selectObject) scene.selectObject(null);
    }
    if (gmapManager) gmapManager.selectPlot(null);
    document.querySelectorAll('.plot-list-item').forEach(el => el.classList.remove('selected'));
  }
  
  // --- Counts ---
  function updateCounts(plots) {
    if (!plots) return;
    let available = 0, sold = 0, reserved = 0;
    
    Object.values(plots).forEach(p => {
      if (p.status === 'available') available++;
      else if (p.status === 'sold') sold++;
      else if (p.status === 'reserved') reserved++;
    });
    
    document.querySelectorAll('#count-available').forEach(el => el.textContent = available);
    document.querySelectorAll('#count-sold').forEach(el => el.textContent = sold);
    document.querySelectorAll('#count-reserved').forEach(el => el.textContent = reserved);
    
    const filterCountAll = document.getElementById('filter-count-all');
    if (filterCountAll) filterCountAll.textContent = Object.keys(plots).length;
  }
  
  // --- Location Panel ---
  function setupLocationPanel() {
    const closeBtn = document.getElementById('close-location-panel');
    if (closeBtn && !closeBtn.dataset.bound) {
      closeBtn.dataset.bound = 'true';
      closeBtn.addEventListener('click', () => toggleLocationPanel(false));
    }

    const dirBtn = document.getElementById('btn-get-directions');
    if (dirBtn) {
      dirBtn.href = `https://www.google.com/maps/dir/?api=1&destination=22.088368,78.863390&travelmode=driving`;
    }

    const myLocBtn = document.getElementById('btn-show-my-location');
    if (myLocBtn && !myLocBtn.dataset.bound) {
      myLocBtn.dataset.bound = 'true';
      myLocBtn.addEventListener('click', () => calculateDistanceFromUser());
    }
  }

  function focusSiteLocation() {
    const lat = (gmapManager && gmapManager.baseLat) ? gmapManager.baseLat : 22.088368;
    const lng = (gmapManager && gmapManager.baseLng) ? gmapManager.baseLng : 78.863390;
    
    if (gmapManager && gmapManager.map) {
      gmapManager.map.flyTo([lat, lng], 18, { animate: true, duration: 0.8 });
    }
    if (scene) {
      scene.resetView();
    }
  }

  function toggleLocationPanel(forceState) {
    let panel = document.getElementById('location-panel');
    if (!panel) {
      setupLocationPanel();
      panel = document.getElementById('location-panel');
    }
    if (!panel) return;
    
    locationPanelOpen = forceState !== undefined ? forceState : !locationPanelOpen;
    
    const btn = document.getElementById('btn-view-location');
    const headerBtn = document.getElementById('btn-header-location');

    if (locationPanelOpen) {
      focusSiteLocation();
      panel.classList.remove('hidden');
      panel.style.display = 'flex';
      if (btn) btn.classList.add('active');
      if (headerBtn) headerBtn.classList.add('active');
      initLocationMap();
      calculateDistanceFromUser();
    } else {
      panel.classList.add('hidden');
      panel.style.display = 'none';
      if (btn) btn.classList.remove('active');
      if (headerBtn) headerBtn.classList.remove('active');
    }
  }

  function initLocationMap() {
    const container = document.getElementById('location-map-container');
    if (!container) return;

    container.innerHTML = `
      <div class="mapouter" style="position:relative;width:100%;height:100%;min-height:220px;border-radius:12px;overflow:hidden;">
        <div class="gmap_canvas" style="overflow:hidden;background:none!important;width:100%;height:100%;min-height:220px;">
          <iframe class="gmap_iframe" width="100%" height="100%" style="min-height:220px;border:0;" frameborder="0" scrolling="no" marginheight="0" marginwidth="0" src="https://maps.google.com/maps?width=600&amp;height=400&amp;hl=en&amp;q=22.088368,78.863390+(Maudai+Premium+Plots)&amp;t=k&amp;z=15&amp;ie=UTF8&amp;iwloc=B&amp;output=embed"></iframe>
        </div>
      </div>
    `;
  }

  function calculateDistanceFromUser() {
    const distContainer = document.getElementById('location-distance');
    const distText = document.getElementById('distance-text');
    const dirBtn = document.getElementById('btn-get-directions');
    if (!distContainer || !distText) return;

    if (!navigator.geolocation) {
      distContainer.classList.remove('hidden');
      distText.textContent = 'Location not supported by browser';
      return;
    }

    distContainer.classList.remove('hidden');
    distText.textContent = 'Getting your location...';

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const userLat = position.coords.latitude;
        const userLng = position.coords.longitude;
        const siteLat = 22.088368;
        const siteLng = 78.863390;

        const R = 6371; // km
        const dLat = (siteLat - userLat) * Math.PI / 180;
        const dLon = (siteLng - userLng) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(userLat * Math.PI / 180) * Math.cos(siteLat * Math.PI / 180) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c;

        if (distance < 1) {
          distText.textContent = `${Math.round(distance * 1000)} meters from your location`;
        } else {
          distText.textContent = `${distance.toFixed(1)} km from your location`;
        }

        if (dirBtn) {
          dirBtn.href = `https://www.google.com/maps/dir/?api=1&origin=${userLat},${userLng}&destination=${siteLat},${siteLng}&travelmode=driving`;
        }
      },
      (error) => {
        distText.textContent = 'Could not get your location';
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function setViewMode(mode) {
    currentViewMode = mode;
    const gmapEl = document.getElementById('gmap-container');
    const canvasEl = document.getElementById('scene-canvas');
    const labelsEl = document.getElementById('plot-labels-container');
    const toggleBtn = document.getElementById('btn-toggle-view');

    if (mode === '2d') {
      if (gmapEl) gmapEl.classList.remove('hidden');
      if (canvasEl) canvasEl.style.display = 'none';
      if (labelsEl) labelsEl.style.display = 'none';
      if (toggleBtn) {
        toggleBtn.classList.add('active');
        toggleBtn.title = 'Switch to 3D Layout View';
      }
      if (gmapManager && gmapManager.map) {
        setTimeout(() => gmapManager.map.invalidateSize(), 100);
      }
    } else {
      if (gmapEl) gmapEl.classList.add('hidden');
      if (canvasEl) canvasEl.style.display = 'block';
      if (labelsEl) labelsEl.style.display = 'block';
      if (toggleBtn) {
        toggleBtn.classList.remove('active');
        toggleBtn.title = 'Switch to 2D Google Map View';
      }
      if (scene && typeof scene.onResize === 'function') scene.onResize();
    }
  }

  // --- Event Listeners ---
  function openGoogleMapsNavigation() {
    const siteLat = (gmapManager && gmapManager.baseLat) ? gmapManager.baseLat : 22.088368;
    const siteLng = (gmapManager && gmapManager.baseLng) ? gmapManager.baseLng : 78.863390;

    focusSiteLocation();

    const defaultNavUrl = `https://www.google.com/maps/dir/?api=1&destination=${siteLat},${siteLng}&travelmode=driving`;

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const userLat = position.coords.latitude;
          const userLng = position.coords.longitude;
          const userNavUrl = `https://www.google.com/maps/dir/?api=1&origin=${userLat},${userLng}&destination=${siteLat},${siteLng}&travelmode=driving`;
          window.open(userNavUrl, '_blank');
        },
        () => {
          window.open(defaultNavUrl, '_blank');
        },
        { enableHighAccuracy: true, timeout: 3000 }
      );
    } else {
      window.open(defaultNavUrl, '_blank');
    }
  }

  function setupEventListeners() {
    const closeBtn = document.getElementById('close-plot-info');
    if (closeBtn) closeBtn.addEventListener('click', closePlotInfo);
    
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const filter = btn.dataset.filter || 'all';
        const searchInput = document.getElementById('search-input');
        const search = searchInput ? searchInput.value.trim() : '';
        renderPlotList(plotsData, filter, search);
      });
    });

    const btnToggle = document.getElementById('btn-toggle-view');
    if (btnToggle) {
      btnToggle.addEventListener('click', () => {
        setViewMode(currentViewMode === '3d' ? '2d' : '3d');
      });
    }

    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const activeBtn = document.querySelector('.filter-btn.active');
        const activeFilter = activeBtn ? activeBtn.dataset.filter : 'all';
        renderPlotList(plotsData, activeFilter, e.target.value.trim());
      });
    }
    
    const btnLocation = document.getElementById('btn-view-location');
    if (btnLocation) {
      btnLocation.addEventListener('click', () => {
        openGoogleMapsNavigation();
        toggleLocationPanel();
      });
    }

    const btnHeaderLoc = document.getElementById('btn-header-location');
    if (btnHeaderLoc) {
      btnHeaderLoc.addEventListener('click', () => {
        openGoogleMapsNavigation();
        toggleLocationPanel();
      });
    }

    const resetBtn = document.getElementById('btn-view-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (gmapManager) {
          gmapManager.setPlacementSettings();
        }
        if (scene) {
          scene.resetView();
        }
      });
    }
    
    const zoomInBtn = document.getElementById('btn-zoom-in');
    const zoomOutBtn = document.getElementById('btn-zoom-out');
    if (zoomInBtn) {
      zoomInBtn.addEventListener('click', () => {
        if (gmapManager && gmapManager.map) gmapManager.map.zoomIn();
        if (scene) scene.zoomIn();
      });
    }
    const toggleLabelsBtn = document.getElementById('btn-toggle-labels');
    if (toggleLabelsBtn) {
      toggleLabelsBtn.addEventListener('click', () => {
        if (scene) {
          const active = scene.toggleLabels();
          toggleLabelsBtn.classList.toggle('active', active);
        }
      });
    }

    // Share buttons listener (including dynamic header share buttons)
    document.addEventListener('click', (e) => {
      const shareBtn = e.target.closest('.btn-share-action');
      if (shareBtn) {
        e.preventDefault();
        e.stopPropagation();
        handleShareAction();
      }
    });
  }

  // --- Share Layout Feature ---
  async function handleShareAction() {
    const shareUrl = window.location.origin || window.location.href;
    const shareData = {
      title: 'Maudai Premium Plots - 3D Site Layout',
      text: 'Explore Maudai Premium Plots 3D Interactive Layout & Plot Availability!',
      url: shareUrl
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.warn('Share error:', err);
        } else {
          return;
        }
      }
    }

    // Fallback clipboard copy
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        const input = document.createElement('input');
        input.value = shareUrl;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
      }
      showShareToast('🔗 Website link copied to clipboard!');
    } catch (e) {
      showShareToast('🔗 URL: ' + shareUrl);
    }
  }

  function showShareToast(msg) {
    let toast = document.getElementById('share-toast-notification');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'share-toast-notification';
      toast.className = 'share-toast-notification';
      document.body.appendChild(toast);
    }
    toast.innerHTML = msg;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 2800);
  }
  
  function initMarqueeTicker() {
    const track = document.getElementById('ticker-marquee-track');
    if (!track || track.dataset.marqueeInitialized) return;
    track.dataset.marqueeInitialized = 'true';
    const clone = document.createElement('div');
    clone.className = 'marquee-clone';
    clone.innerHTML = track.innerHTML;
    track.appendChild(clone);
  }

  // --- Start ---
  document.addEventListener('DOMContentLoaded', () => {
    init();
    initMarqueeTicker();
  });
  
})();