/**
 * Google Maps Manager for Maudai Property Plot Layout (No API Key Required)
 * Integrates real Google Maps satellite imagery with interactive 2D CAD layout overlay,
 * status color-coding, plot selection, filtering, and admin drag/scale/rotate placement.
 */

class GMapManager {
  constructor(containerId, options = {}) {
    this.containerId = containerId;
    this.container = document.getElementById(containerId);
    this.isAdmin = options.isAdmin || false;
    this.onPlotClick = options.onPlotClick || (() => {});
    this.onPlotHover = options.onPlotHover || (() => {});
    this.onLayoutChanged = options.onLayoutChanged || (() => {});
    
    // Default GMap Placement Settings for Maudai Land Location
    this.baseLat = 22.088368;
    this.baseLng = 78.863390;
    this.zoom = 18;
    this.rotation = 0; // degrees
    this.scale = 1.0;  // multiplier
    this.mapType = 'hybrid'; // satellite, hybrid, roadmap, esri
    
    this.map = null;
    this.tileLayer = null;
    this.plotPolygons = {};
    this.plotLabels = {};
    this.wallPolylines = [];
    this.roadPolygons = [];
    this.centerMarker = null;
    this.plotsData = {};
    this.selectedPlotId = null;
    this.filterStatus = 'all';
    this.searchQuery = '';
    
    this.init();
  }

  init() {
    if (!this.container) return;
    
    // Create Leaflet Map instance
    this.map = L.map(this.containerId, {
      center: [this.baseLat, this.baseLng],
      zoom: this.zoom,
      maxZoom: 22,
      minZoom: 5,
      zoomControl: false,
      attributionControl: false
    });

    // Add Zoom Control to bottom right (so it doesn't overlap top floating panels)
    L.control.zoom({ position: 'bottomright' }).addTo(this.map);

    // Google Maps Tile Layers (No API Key Required!)
    this.tileLayers = {
      satellite: L.tileLayer('https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
        subdomains: ['0', '1', '2', '3'],
        maxNativeZoom: 20,
        maxZoom: 22,
        attribution: '&copy; Google Maps Satellite'
      }),
      hybrid: L.tileLayer('https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
        subdomains: ['0', '1', '2', '3'],
        maxNativeZoom: 20,
        maxZoom: 22,
        attribution: '&copy; Google Maps Hybrid'
      }),
      roadmap: L.tileLayer('https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
        subdomains: ['0', '1', '2', '3'],
        maxNativeZoom: 20,
        maxZoom: 22,
        attribution: '&copy; Google Maps Streets'
      }),
      esri: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxNativeZoom: 19,
        maxZoom: 22,
        attribution: '&copy; Esri World Imagery'
      })
    };

    // Set initial map tile layer
    this.setMapType(this.mapType);

    // Save map center/zoom on move end & toggle label visibility
    this.map.on('moveend', () => {
      this.zoom = this.map.getZoom();
      this.updateLabelVisibility();
      if (this.isAdmin && this.onLayoutChanged) {
        this.onLayoutChanged();
      }
    });

    this.map.on('zoomend', () => {
      this.updateLabelVisibility();
    });

    // Admin Draggable Center Anchor Marker
    if (this.isAdmin) {
      this.createAdminCenterMarker();
    }
  }

  setMapType(type) {
    if (!this.tileLayers[type]) type = 'hybrid';
    if (this.tileLayer) {
      this.map.removeLayer(this.tileLayer);
    }
    this.mapType = type;
    this.tileLayer = this.tileLayers[type];
    this.tileLayer.addTo(this.map);
  }

  updateLabelVisibility() {
    const currentZoom = this.map ? this.map.getZoom() : this.zoom;
    const showLabels = currentZoom >= 17;
    Object.values(this.plotLabels).forEach(label => {
      if (label && label._icon) {
        label._icon.style.display = showLabels ? 'block' : 'none';
      }
    });
  }

  // --- Projection Math: CAD 2D Local (x, z) to Geo (Lat, Lng) ---
  localToLatLng(x, z) {
    const rad = (this.rotation * Math.PI) / 180;
    // Apply layout rotation around anchor center
    const rx = x * Math.cos(rad) - z * Math.sin(rad);
    const rz = x * Math.sin(rad) + z * Math.cos(rad);
    
    // Convert meters to lat/lng degrees
    // Scale factor tuned for layout dimensions (0.52 meters per CAD unit)
    const meterScale = 0.52 * this.scale;
    const dLat = (-rz * meterScale) / 111320;
    const dLng = (rx * meterScale) / (111320 * Math.cos((this.baseLat * Math.PI) / 180));
    
    return [this.baseLat + dLat, this.baseLng + dLng];
  }

  latLngToLocal(lat, lng) {
    const dLat = lat - this.baseLat;
    const dLng = lng - this.baseLng;
    
    const meterScale = 0.52 * this.scale;
    const rz = (-dLat * 111320) / meterScale;
    const rx = (dLng * 111320 * Math.cos((this.baseLat * Math.PI) / 180)) / meterScale;
    
    const rad = (-this.rotation * Math.PI) / 180;
    const x = rx * Math.cos(rad) - rz * Math.sin(rad);
    const z = rx * Math.sin(rad) + rz * Math.cos(rad);
    
    return { x, z };
  }

  // --- Layout Render & Refresh ---
  loadLayout(plotsData) {
    this.plotsData = plotsData || {};
    this.refreshAllLayers();
  }

  setPlacementSettings(settings = {}) {
    if (settings.lat !== undefined && !isNaN(parseFloat(settings.lat))) this.baseLat = parseFloat(settings.lat);
    if (settings.lng !== undefined && !isNaN(parseFloat(settings.lng))) this.baseLng = parseFloat(settings.lng);
    if (settings.zoom !== undefined && !isNaN(parseInt(settings.zoom))) this.zoom = parseInt(settings.zoom);
    if (settings.rotation !== undefined && !isNaN(parseFloat(settings.rotation))) this.rotation = parseFloat(settings.rotation);
    if (settings.scale !== undefined && !isNaN(parseFloat(settings.scale))) this.scale = parseFloat(settings.scale);
    if (settings.mapType) this.setMapType(settings.mapType);

    // #region debug-point B:placement-settings
    fetch('http://127.0.0.1:7777/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: 'layout-wall-placement', runId: 'post-fix', hypothesisId: 'B', location: 'public/js/gmap.js:setPlacementSettings', msg: '[DEBUG] Applied map placement settings', data: { lat: this.baseLat, lng: this.baseLng, zoom: this.zoom, rotation: this.rotation, scale: this.scale, mapType: this.mapType }, ts: Date.now() }) }).catch(() => {});
    // #endregion

    if (this.map) {
      this.map.setView([this.baseLat, this.baseLng], this.zoom, { animate: false });
    }

    if (this.centerMarker && this.isAdmin) {
      this.centerMarker.setLatLng([this.baseLat, this.baseLng]);
    }

    this.refreshAllLayers();
  }

  getPlacementSettings() {
    return {
      lat: this.baseLat,
      lng: this.baseLng,
      zoom: this.map ? this.map.getZoom() : this.zoom,
      rotation: this.rotation,
      scale: this.scale,
      mapType: this.mapType
    };
  }

  refreshAllLayers() {
    this.clearAllLayers();
    this.renderSiteRoads();
    this.renderSiteWall();
    this.renderPlots();
    this.renderCustomAssets();
  }

  async renderCustomAssets() {
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
          const latLng = this.localToLatLng(ast.x || 0, ast.z || 0);
          const rawBg = ast.bgColor || '#0284c7';
          let glassBg = 'rgba(2, 132, 199, 0.4)';
          if (rawBg.startsWith('#')) {
            let hex = rawBg.slice(1);
            if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
            const r = parseInt(hex.substring(0, 2), 16) || 2;
            const g = parseInt(hex.substring(2, 4), 16) || 132;
            const b = parseInt(hex.substring(4, 6), 16) || 199;
            glassBg = `rgba(${r}, ${g}, ${b}, 0.4)`;
          } else if (rawBg.startsWith('rgba')) {
            glassBg = rawBg.replace(/[\d\.]+\)$/, '0.4)');
          }

          const icon = L.divIcon({
            className: 'gmap-text-label-marker',
            iconSize: [0, 0],
            iconAnchor: [0, 0],
            html: `<div style="transform: translate(-50%, -50%); display: flex; align-items: center; justify-content: center; pointer-events: none;"><div style="background: ${glassBg}; color: ${ast.textColor || '#ffffff'}; border: 1.5px solid rgba(255, 255, 255, 0.7); border-radius: 10px; padding: 6px 14px; font-family: Outfit, Inter, sans-serif; font-weight: 800; font-size: 0.85rem; text-align: center; width: max-content; max-width: 280px; min-width: 100px; white-space: normal; overflow-wrap: break-word; word-wrap: break-word; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); box-shadow: 0 4px 16px rgba(0,0,0,0.3); line-height: 1.3;">${ast.text || ast.name || 'Text Label'}</div></div>`
          });
          const marker = L.marker(latLng, { icon, interactive: false }).addTo(this.map);
          this.roadPolygons.push(marker);
        }
      });
    } catch (e) {}
  }

  clearAllLayers() {
    // Clear plot polygons & labels
    Object.keys(this.plotPolygons).forEach(id => {
      if (this.plotPolygons[id]) this.map.removeLayer(this.plotPolygons[id]);
      if (this.plotLabels[id]) this.map.removeLayer(this.plotLabels[id]);
    });
    this.plotPolygons = {};
    this.plotLabels = {};

    // Clear wall polylines
    this.wallPolylines.forEach(layer => this.map.removeLayer(layer));
    this.wallPolylines = [];

    // Clear road polygons
    this.roadPolygons.forEach(layer => this.map.removeLayer(layer));
    this.roadPolygons = [];
  }

  // --- Render Plots ---
  renderPlots() {
    if (typeof PLOT_POSITIONS === 'undefined') return;

    Object.keys(PLOT_POSITIONS).forEach(id => {
      const p = PLOT_POSITIONS[id];
      const plotMeta = this.plotsData[id] || {};
      const status = plotMeta.status || 'available';

      // Check filter
      if (this.filterStatus !== 'all' && status !== this.filterStatus) return;
      if (this.searchQuery && !id.toString().includes(this.searchQuery)) return;

      let latLngs = [];

      if (p.polygon && Array.isArray(p.polygon) && p.polygon.length >= 3) {
        latLngs = p.polygon.map(pt => this.localToLatLng(pt[0], pt[1]));
      } else if (typeof PLOT_POLYGONS_EXACT !== 'undefined' && PLOT_POLYGONS_EXACT[id]) {
        latLngs = PLOT_POLYGONS_EXACT[id].map(pt => this.localToLatLng(pt[0], pt[1]));
      } else {
        // Fallback rectangle
        const cx = p.x || 0;
        const cz = p.z || 0;
        const hw = (p.w || 1.48) / 2;
        const hd = (p.h || 2.97) / 2;
        const rot = p.rot || 0;
        
        const cos = Math.cos(rot);
        const sin = Math.sin(rot);

        const offsets = [
          [-hw, -hd], // Top-Left
          [ hw, -hd], // Top-Right
          [ hw,  hd], // Bottom-Right
          [-hw,  hd]  // Bottom-Left
        ];

        const localCorners = offsets.map(([dx, dz]) => {
          const rx = dx * cos + dz * sin;
          const rz = -dx * sin + dz * cos;
          return [cx + rx, cz + rz];
        });
        latLngs = localCorners.map(pt => this.localToLatLng(pt[0], pt[1]));
      }

      // #region debug-point D:plot-reference-transform
      if (id === '1' && latLngs.length > 0) {
        fetch('http://127.0.0.1:7777/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: 'layout-wall-placement', runId: 'post-fix', hypothesisId: 'D', location: 'public/js/gmap.js:renderPlots', msg: '[DEBUG] Plot 1 transformed reference polygon', data: { plotId: id, localPolygon: p.polygon || null, latLngs }, ts: Date.now() }) }).catch(() => {});
      }
      // #endregion

      // Status Colors & 3D Styling
      const colorMap = {
        available: { fill: '#10b981', stroke: '#059669', opacity: 0.65 },
        sold: { fill: '#ef4444', stroke: '#991b1b', opacity: 0.85 },
        reserved: { fill: '#f59e0b', stroke: '#d97706', opacity: 0.75 }
      };
      const colors = colorMap[status] || colorMap.available;
      const isSelected = parseInt(id) === parseInt(this.selectedPlotId);

      // Create 3D Elevated Leaflet Polygon
      const polygon = L.polygon(latLngs, {
        color: isSelected ? '#38bdf8' : colors.stroke,
        weight: isSelected ? 3.8 : 2.0,
        fillColor: isSelected ? '#38bdf8' : colors.fill,
        fillOpacity: isSelected ? 0.9 : colors.opacity,
        smoothFactor: 1.0,
        interactive: true,
        className: `gmap-3d-polygon ${status}`
      }).addTo(this.map);

      // Add Detailed Tooltip
      const areaStr = plotMeta.area ? `${plotMeta.area.toLocaleString()} sq.ft.` : '';
      const dimStr = plotMeta.dimensions_str ? ` | ${plotMeta.dimensions_str}` : '';
      const priceTooltipStr = (plotMeta.price && Number(plotMeta.price) > 0) ? ` | <b style="color:#34d399;">₹${Number(plotMeta.price).toLocaleString('en-IN')}</b>` : '';
      const statusText = status === 'sold' ? '<b style="color:#ef4444;">SOLD</b>' : status.toUpperCase();

      polygon.bindTooltip(`
        <div style="font-family: Outfit, Inter, sans-serif; padding: 4px 8px; text-align: center;">
          <b style="font-size: 14px; color: #fff;">Plot ${id}</b><br/>
          <span style="font-size: 11.5px;">${statusText} ${areaStr} ${dimStr}${priceTooltipStr}</span>
        </div>
      `, {
        permanent: false,
        direction: 'center',
        className: 'gmap-plot-tooltip'
      });

      // Click event
      polygon.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        this.selectPlot(id);
        this.onPlotClick(parseInt(id));
      });

      // Hover event - 3D Elevation Rise
      polygon.on('mouseover', () => {
        if (parseInt(id) !== parseInt(this.selectedPlotId)) {
          polygon.setStyle({ fillOpacity: 0.92, weight: 3.0, color: '#38bdf8' });
        }
        this.onPlotHover(parseInt(id));
      });
      polygon.on('mouseout', () => {
        if (parseInt(id) !== parseInt(this.selectedPlotId)) {
          polygon.setStyle({ fillOpacity: colors.opacity, weight: 2.0, color: colors.stroke });
        }
        this.onPlotHover(null);
      });

      this.plotPolygons[id] = polygon;

      // Centroid Calculation for 100% Dead-Center Label Alignment
      let centerLat = 0, centerLng = 0;
      if (latLngs.length > 0) {
        latLngs.forEach(pt => {
          centerLat += pt[0];
          centerLng += pt[1];
        });
        centerLat /= latLngs.length;
        centerLng /= latLngs.length;
      } else {
        const boundsCenter = polygon.getBounds().getCenter();
        centerLat = boundsCenter.lat;
        centerLng = boundsCenter.lng;
      }

      // Plot Number & Status Badge on Map
      let labelHtml = '';
      const priceBadge = (plotMeta.price && Number(plotMeta.price) > 0) 
        ? `<span class="plot-price-badge" style="color:#34d399; font-size:10px; font-weight:800; margin-left:3px; padding-left:3px; border-left:1px solid rgba(255,255,255,0.3);">₹${Number(plotMeta.price).toLocaleString('en-IN')}</span>` 
        : '';

      if (status === 'sold') {
        labelHtml = `
          <div class="gmap-label-inner sold ${isSelected ? 'selected' : ''}">
            <span class="plot-num-text">${id}</span>
            <span class="sold-badge-text">SOLD</span>
          </div>
        `;
      } else {
        labelHtml = `
          <div class="gmap-label-inner ${status} ${isSelected ? 'selected' : ''}">
            <span class="plot-num-text">${id}</span>
            ${priceBadge}
          </div>
        `;
      }

      const labelIcon = L.divIcon({
        className: 'gmap-plot-number-label',
        html: labelHtml,
        iconSize: status === 'sold' ? [42, 28] : [26, 26],
        iconAnchor: status === 'sold' ? [21, 14] : [13, 13]
      });

      const labelMarker = L.marker([centerLat, centerLng], {
        icon: labelIcon,
        interactive: false
      }).addTo(this.map);

      this.plotLabels[id] = labelMarker;
    });
    this.updateLabelVisibility();
  }

  // --- Render Site Perimeter Wall ---
  renderSiteWall() {
    if (typeof SITE_WALL_SEGMENTS === 'undefined') return;

    // #region debug-point A:wall-segment-summary
    fetch('http://127.0.0.1:7777/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: 'layout-wall-placement', runId: 'post-fix', hypothesisId: 'A', location: 'public/js/gmap.js:renderSiteWall', msg: '[DEBUG] Rendering wall segments', data: { segmentCount: SITE_WALL_SEGMENTS.length, firstSegment: SITE_WALL_SEGMENTS[0] || null, midSegment: SITE_WALL_SEGMENTS[Math.floor(SITE_WALL_SEGMENTS.length / 2)] || null, lastSegment: SITE_WALL_SEGMENTS[SITE_WALL_SEGMENTS.length - 1] || null }, ts: Date.now() }) }).catch(() => {});
    // #endregion

    SITE_WALL_SEGMENTS.forEach((seg, index) => {
      const isArraySegment = Array.isArray(seg) && seg.length >= 4;
      const isObjectSegment = !!seg && typeof seg === 'object' && !Array.isArray(seg);
      if (!isArraySegment && !isObjectSegment) return;

      let latLngs = [];
      if (isArraySegment) {
        latLngs = [
          this.localToLatLng(seg[0], seg[1]),
          this.localToLatLng(seg[2], seg[3])
        ];
      } else if (seg.polygon && Array.isArray(seg.polygon)) {
        latLngs = seg.polygon.map(pt => this.localToLatLng(pt[0], pt[1]));
      } else if (seg.start && seg.end) {
        latLngs = [
          this.localToLatLng(seg.start[0], seg.start[1]),
          this.localToLatLng(seg.end[0], seg.end[1])
        ];
      } else if (Number.isFinite(Number(seg.x)) && Number.isFinite(Number(seg.z))) {
        const cx = Number(seg.x);
        const cz = Number(seg.z);
        const len = Number(seg.len || seg.length || 0);
        const rot = Number(seg.rot || 0);

        if (len <= 0.05) return;

        const halfLen = len / 2;
        const sinRot = Math.sin(rot);
        const cosRot = Math.cos(rot);
        const start = [cx - (halfLen * sinRot), cz - (halfLen * cosRot)];
        const end = [cx + (halfLen * sinRot), cz + (halfLen * cosRot)];

        latLngs = [
          this.localToLatLng(start[0], start[1]),
          this.localToLatLng(end[0], end[1])
        ];
      }

      if (latLngs.length < 2) return;

      const polyline = L.polyline(latLngs, {
        color: '#ef4444',
        weight: 3.5,
        opacity: 0.95,
        dashArray: seg.type === 'gate' ? '6, 6' : null
      }).addTo(this.map);

      // #region debug-point C:wall-transformed-samples
      if (index === 0 || index === Math.floor(SITE_WALL_SEGMENTS.length / 2) || index === SITE_WALL_SEGMENTS.length - 1) {
        fetch('http://127.0.0.1:7777/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: 'layout-wall-placement', runId: 'post-fix', hypothesisId: 'C', location: 'public/js/gmap.js:renderSiteWall', msg: '[DEBUG] Wall segment transformed sample', data: { index, rawSegment: seg, latLngs }, ts: Date.now() }) }).catch(() => {});
      }
      // #endregion

      polyline.bindTooltip(seg.name || 'Covered Boundary Wall', { permanent: false });
      this.wallPolylines.push(polyline);
    });
  }

  // --- Render Site Roads ---
  renderSiteRoads() {
    if (typeof SITE_ROADS_EXACT === 'undefined') return;

    SITE_ROADS_EXACT.forEach(road => {
      const cx = road.x || 0;
      const cz = road.z || 0;
      const hw = (road.w || 2) / 2;
      const hd = (road.d || 10) / 2;
      const rot = road.rot || 0;

      const cos = Math.cos(rot);
      const sin = Math.sin(rot);

      const offsets = [
        [-hw, -hd], // Top-Left
        [ hw, -hd], // Top-Right
        [ hw,  hd], // Bottom-Right
        [-hw,  hd]  // Bottom-Left
      ];

      const localCorners = offsets.map(([dx, dz]) => {
        const rx = dx * cos + dz * sin;
        const rz = -dx * sin + dz * cos;
        return [cx + rx, cz + rz];
      });

      const latLngs = localCorners.map(pt => this.localToLatLng(pt[0], pt[1]));
      const roadColor = road.type === 'ring' ? '#f59e0b' : (road.type === 'main' ? '#38bdf8' : '#94a3b8');

      const polygon = L.polygon(latLngs, {
        color: roadColor,
        weight: 1.2,
        fillColor: '#1e293b',
        fillOpacity: 0.45,
        interactive: true
      }).addTo(this.map);

      polygon.bindTooltip(`${road.name} (${road.type.toUpperCase()})`, { permanent: false });
      this.roadPolygons.push(polygon);
    });
  }

  // --- Select & Focus Plot ---
  selectPlot(plotId) {
    this.selectedPlotId = plotId;
    this.refreshAllLayers();

    if (plotId && this.plotPolygons[plotId]) {
      const bounds = this.plotPolygons[plotId].getBounds();
      this.map.panTo(bounds.getCenter(), { animate: true, duration: 0.5 });
    }
  }

  filterPlots(status) {
    this.filterStatus = status || 'all';
    this.refreshAllLayers();
  }

  searchPlots(query) {
    this.searchQuery = (query || '').trim().toLowerCase();
    this.refreshAllLayers();

    if (this.searchQuery && this.plotPolygons[this.searchQuery]) {
      this.selectPlot(this.searchQuery);
    }
  }

  // --- Admin Placement Center Anchor Marker ---
  createAdminCenterMarker() {
    const icon = L.divIcon({
      className: 'gmap-admin-anchor-marker',
      html: `<div style="background: #ef4444; color: #ffffff; border: 2.5px solid #ffffff; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 16px; box-shadow: 0 4px 14px rgba(0,0,0,0.6); cursor: move;" title="Drag to align layout position">📍</div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });

    this.centerMarker = L.marker([this.baseLat, this.baseLng], {
      icon: icon,
      draggable: true,
      zIndexOffset: 1000
    }).addTo(this.map);

    this.centerMarker.on('drag', (e) => {
      const latLng = e.target.getLatLng();
      this.baseLat = latLng.lat;
      this.baseLng = latLng.lng;
      this.refreshAllLayers();
      if (this.onLayoutChanged) this.onLayoutChanged();
    });

    this.centerMarker.on('dragend', () => {
      if (this.onLayoutChanged) this.onLayoutChanged();
    });
  }

  // --- Geocoder Search (Address or Lat,Lng to Location) ---
  async searchAddress(query) {
    if (!query) return null;
    const cleanQuery = query.trim();

    // Check if query is lat,lng format e.g. "22.088368, 78.863390"
    const coordsMatch = cleanQuery.match(/^(-?\d+(\.\d+)?)\s*,\s*(-?\d+(\.\d+)?)$/);
    if (coordsMatch) {
      const lat = parseFloat(coordsMatch[1]);
      const lng = parseFloat(coordsMatch[3]);
      this.baseLat = lat;
      this.baseLng = lng;
      this.map.setView([lat, lng], 18);
      if (this.centerMarker) this.centerMarker.setLatLng([lat, lng]);
      this.refreshAllLayers();
      if (this.onLayoutChanged) this.onLayoutChanged();
      return { lat, lng, displayName: `${lat.toFixed(6)}, ${lng.toFixed(6)}` };
    }

    // Otherwise use OpenStreetMap Nominatim Geocoding API
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cleanQuery)}`);
      const results = await res.json();
      if (results && results.length > 0) {
        const first = results[0];
        const lat = parseFloat(first.lat);
        const lng = parseFloat(first.lon);
        this.baseLat = lat;
        this.baseLng = lng;
        this.map.setView([lat, lng], 18);
        if (this.centerMarker) this.centerMarker.setLatLng([lat, lng]);
        this.refreshAllLayers();
        if (this.onLayoutChanged) this.onLayoutChanged();
        return { lat, lng, displayName: first.display_name };
      }
    } catch (err) {
      console.error('Geocoding error:', err);
    }
    return null;
  }
}
