import { Component, AfterViewInit, Inject, PLATFORM_ID, ChangeDetectorRef, NgZone } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import * as turf from '@turf/turf';
import { MapData } from '../services/map-data';

@Component({
  selector: 'app-map',
  standalone: false,
  templateUrl: './map.html',
  styleUrl: './map.css',
})
export class Map implements AfterViewInit {
  map: any;
  plotCoordinates: any[] = [];
  plotArea: number = 0;

  detecting: boolean = false;
  detectedZone: any = null;
  zoneError: string = '';
  searchQuery: string = '';
  searchResults: any[] = [];   
  showDropdown: boolean = false;

  private clickMarker: any = null;
  private setbackLayer: any = null;
  private L: any = null;
  private isDrawingActive: boolean = false;
  private searchTimeout: any = null;

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private mapData: MapData,
    private cdr: ChangeDetectorRef,
    private http: HttpClient,
    private ngZone: NgZone
  ) {}

  async ngAfterViewInit() {
    if (isPlatformBrowser(this.platformId)) {
      await this.initMap();
    }
  }

  async initMap() {
    const L = await import('leaflet');
    await import('leaflet-draw');
    await import('leaflet-geometryutil');
    this.L = L;

    this.map = L.map('map').setView([12.9716, 77.5946], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(this.map);

    // ── Zone GeoJSON overlay (display-optimised, ~5MB) ────────────
    const canvasRenderer = L.canvas({ padding: 0.5 });
    this.http.get<any>('assets/bangalore_zones_display.geojson').subscribe({
      next: (geojson) => {
        const options: any = {
          renderer: canvasRenderer,
          style: (feature: any) => this.getZoneStyle(feature?.properties?.zone_code),
          onEachFeature: (feature: any, layer: any) => {
            const p = feature.properties;
            layer.bindTooltip(
              `<b>${p.zone_code}</b> — ${p.zone_name}` +
              (p.locality ? `<br><span style="font-size:11px">${p.locality}</span>` : ''),
              { sticky: true }
            );
          }
        };
        L.geoJSON(geojson, options).addTo(this.map);
      },
      error: (err) => console.error('Failed to load zone GeoJSON:', err)
    });

    // ── Leaflet Draw setup ─────────────────────────────────────────
    const drawnItems = new L.FeatureGroup();
    this.map.addLayer(drawnItems);

    const drawControl = new L.Control.Draw({
      draw: {
        polygon:      { allowIntersection: false, showArea: false },
        rectangle:    { showArea: false },
        circle:       false,
        marker:       false,
        polyline:     false,
        circlemarker: false
      },
      edit: { featureGroup: drawnItems }
    });
    this.map.addControl(drawControl);

    // ── Track draw mode ON/OFF reliably ───────────────────────────
    this.map.on('draw:drawstart', () => {
      this.isDrawingActive = true;
    });
    this.map.on('draw:drawstop', () => {
      this.isDrawingActive = false;
    });
    this.map.on('draw:editstart', () => {
      this.isDrawingActive = true;
    });
    this.map.on('draw:editstop', () => {
      this.isDrawingActive = false;
    });

    // ── draw:created → area calculation + zone from centroid ───────
    this.map.on('draw:created', (event: any) => {
      const layer = event.layer;
      drawnItems.clearLayers();
      drawnItems.addLayer(layer);

      const latlngs = layer.getLatLngs()[0];

      // ── 1. Calculate plot area ───────────────────────────────────
      const turfCoords = latlngs.map((p: any) => [p.lng, p.lat]);
      turfCoords.push([...turfCoords[0]]);  // close ring
      const polygon  = turf.polygon([turfCoords]);
      const areaSqM  = turf.area(polygon);
      const plotArea = Math.round(areaSqM * 10.7639);

      // ── 2. Store coordinates + area ──────────────────────────────
      const coordinates = latlngs.map((p: any) => ({ lat: p.lat, lng: p.lng }));
      this.mapData.setPlotData(coordinates, plotArea);

      // ── 3. Update template ───────────────────────────────────────
      this.ngZone.run(() => {
        this.plotArea = plotArea;
        this.cdr.detectChanges();
      });

      // ── 4. Detect zone from polygon centroid ─────────────────────
      const centroid = turf.centroid(polygon);
      const [cLng, cLat] = centroid.geometry.coordinates;
      this.detectZone(cLat, cLng);

      // ── 5. Watch for planning result → draw setbacks ─────────────
      this.mapData.setPlanningResult(null);  // reset previous result
      const checkResult = setInterval(() => {
        const result = this.mapData.getPlanningResult();
        if (result?.setbacks) {
          clearInterval(checkResult);
          this.drawSetbackPolygon(latlngs, result.setbacks, L);
        }
      }, 500);
    });

    // ── Plain map click → zone detection only ─────────────────────
    this.map.on('click', (e: any) => {
      // Block if draw tool is active
      if (this.isDrawingActive) return;

      const { lat, lng } = e.latlng;

      // Move pin
      if (this.clickMarker) this.map.removeLayer(this.clickMarker);
      this.clickMarker = L.circleMarker([lat, lng], {
        radius:      7,
        color:       '#1d4ed8',
        fillColor:   '#3b82f6',
        fillOpacity: 0.9,
        weight:      2
      }).addTo(this.map);

      this.detectZone(lat, lng);
    });
  }

  onSearchInput() {
    const query = this.searchQuery.trim();

    // Clear previous timer
    if (this.searchTimeout) clearTimeout(this.searchTimeout);

    if (query.length < 3) {
      this.searchResults = [];
      this.showDropdown = false;
      return;
    }

    // Debounce 400ms — don't fire on every keystroke
    this.searchTimeout = setTimeout(() => {
      this.fetchSearchResults(query);
    }, 400);
  }

  private fetchSearchResults(query: string) {
    // Nominatim search — restricted to Bangalore bounding box
    // viewbox: SW corner to NE corner of Bangalore
    const url = `https://nominatim.openstreetmap.org/search`
      + `?q=${encodeURIComponent(query + ', Bangalore')}`
      + `&format=json`
      + `&limit=6`
      + `&viewbox=77.4601,12.7342,77.7814,13.1399`  // Bangalore bbox
      + `&bounded=1`                                   // restrict to bbox
      + `&addressdetails=1`;

    this.http.get<any[]>(url, {
      headers: { 'Accept-Language': 'en' }
    }).subscribe({
      next: (results) => {
        this.ngZone.run(() => {
          this.searchResults = results.map(r => ({
            display_name: this.formatDisplayName(r.display_name),
            full_name:    r.display_name,
            lat:          parseFloat(r.lat),
            lng:          parseFloat(r.lon),
            type:         r.type,
            class:        r.class
          }));
          this.showDropdown = this.searchResults.length > 0;
          this.cdr.detectChanges();
        });
      },
      error: () => {
        this.ngZone.run(() => {
          this.searchResults = [];
          this.showDropdown = false;
        });
      }
    });
  }

  // Shorten display name — remove country/state clutter
  private formatDisplayName(fullName: string): string {
    const parts = fullName.split(',');
    // Return first 2-3 meaningful parts
    return parts.slice(0, 3).join(',').trim();
  }

  // ── User selects a search result ──────────────────────────────
  selectResult(result: any) {
    const { lat, lng } = result;
    // Close dropdown
    this.showDropdown  = false;
    this.searchQuery   = result.display_name;
    this.searchResults = [];

    // Fly map to location
    this.map.flyTo([lat, lng], 16, { duration: 1.2 });

    // Drop pin and detect zone
    if (this.clickMarker) this.map.removeLayer(this.clickMarker);
    this.clickMarker = this.L.circleMarker([lat, lng], {
      radius:      9,
      color:       '#1d4ed8',
      fillColor:   '#3b82f6',
      fillOpacity: 0.9,
      weight:      2
    }).addTo(this.map);

    // Add popup with name
    this.clickMarker.bindPopup(
      `<b>${result.display_name}</b>`,
      { closeButton: false }
    ).openPopup();

    // Detect zone at this location
    this.detectZone(lat, lng);

    this.cdr.detectChanges();
  }

  // Close dropdown when clicking outside
  onSearchBlur() {
    // Delay so click on result registers first
    setTimeout(() => {
      this.showDropdown = false;
      this.cdr.detectChanges();
    }, 200);
  }

  clearSearch() {
    this.searchQuery   = '';
    this.searchResults = [];
    this.showDropdown  = false;

    // Remove pin
    if (this.clickMarker) {
      this.map.removeLayer(this.clickMarker);
      this.clickMarker = null;
    }

    // Reset zone
    this.ngZone.run(() => {
      this.detectedZone = null;
      this.zoneError    = '';
      this.mapData.setDetectedZone(null);
      this.cdr.detectChanges();
    });
  }


  // ── Shared zone detection method ─────────────────────────────────
  private detectZone(lat: number, lng: number) {
    this.ngZone.run(() => {
      this.detecting  = true;
      this.zoneError  = '';
      this.detectedZone = null;
      this.cdr.detectChanges();
    });

    this.http.post<any>('http://localhost:8000/detect-zone', { lat, lng })
      .subscribe({
        next: (res) => {
          this.ngZone.run(() => {
            this.detecting = false;
            if (res.found) {
              this.detectedZone = res;
              this.mapData.setDetectedZone(res);
            } else {
              this.zoneError = 'Outside mapped zones — enter zone manually.';
            }
            this.cdr.detectChanges();
          });
        },
        error: () => {
          this.ngZone.run(() => {
            this.detecting = false;
            this.zoneError = 'Zone detection failed. Please try again.';
            this.cdr.detectChanges();
          });
        }
      });
  }

  // ── Setback visualisation ─────────────────────────────────────────
  private drawSetbackPolygon(
    latlngs: any[],
    setbacks: { front: number; rear: number; side: number },
    L: any
  ) {
    if (this.setbackLayer) {
      this.map.removeLayer(this.setbackLayer);
      this.setbackLayer = null;
    }

    const turfCoords = latlngs.map((p: any) => [p.lng, p.lat]);
    turfCoords.push([...turfCoords[0]]);
    const plotPolygon = turf.polygon([turfCoords]);

    const minSetback = Math.min(setbacks.front, setbacks.rear, setbacks.side);

    // turf.buffer negative value = inset/shrink
    const inset = turf.buffer(plotPolygon, -(minSetback / 1000), { units: 'kilometers' });

    if (!inset || !inset.geometry) {
      console.warn('Plot too small for setback visualisation');
      return;
    }

    const buildableCoords = inset.geometry.coordinates[0].map(
      (c) => [c[1], c[0]] as [number, number]
    );

    this.setbackLayer = L.layerGroup();

    const buildablePoly = L.polygon(buildableCoords, {
      color:       '#16a34a',
      fillColor:   '#16a34a',
      fillOpacity: 0.15,
      weight:      2,
      dashArray:   '6 4'
    });

    buildablePoly.bindTooltip('Buildable area (after setbacks)', { sticky: true });
    buildablePoly.addTo(this.setbackLayer);
    this.setbackLayer.addTo(this.map);
  }

  private getZoneStyle(zoneCode: string) {
    const colours: Record<string, string> = {
      'R':   '#3b82f6',  // blue       — Residential
      'RM':  '#8b5cf6',  // violet     — Residential Mixed
      'C1':  '#f97316',  // orange     — Commercial C1
      'C2':  '#ef4444',  // red        — Commercial C2
      'C3':  '#dc2626',  // dark red   — Commercial C3
      'IT':  '#06b6d4',  // cyan       — IT / ITES
      'PSP': '#22c55e',  // green      — Public Semi-Public
      'I':   '#a16207',  // amber      — Industrial
      'T':   '#64748b',  // slate      — Transportation
      'P':   '#16a34a',  // dark green — Parks & Open Space
      'GB':  '#166534',  // forest     — Green Belt
      'AG':  '#ca8a04',  // yellow     — Agricultural
    };
    return {
      color:       colours[zoneCode] ?? '#6b7280',
      fillColor:   colours[zoneCode] ?? '#6b7280',
      weight:      1,
      opacity:     0.7,
      fillOpacity: 0.15
    };
  }
}