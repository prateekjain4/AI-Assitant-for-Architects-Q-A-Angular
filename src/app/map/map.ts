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

  private clickMarker: any = null;
  private setbackLayer: any = null;
  private L: any = null;
  private isDrawingActive: boolean = false;  // ← reliable draw state flag

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

    // ── Zone GeoJSON overlay ───────────────────────────────────────
    this.http.get<any>('assets/bangalore_zones.geojson').subscribe(geojson => {
      L.geoJSON(geojson, {
        style: (feature: any) => this.getZoneStyle(feature?.properties?.zone_code),
        onEachFeature: (feature: any, layer: any) => {
          layer.bindTooltip(
            `<b>${feature.properties.zone_code}</b> — ${feature.properties.zone_name}<br>
             <span style="font-size:11px">${feature.properties.locality}</span>`,
            { sticky: true }
          );
        }
      }).addTo(this.map);
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
      this.detectZone(cLat, cLng, L);

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

      this.detectZone(lat, lng, L);
    });
  }

  // ── Shared zone detection method ─────────────────────────────────
  private detectZone(lat: number, lng: number, L: any) {
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
      'R':   '#3b82f6',
      'RM':  '#8b5cf6',
      'C1':  '#f97316',
      'C2':  '#ef4444',
      'C3':  '#dc2626',
      'IT':  '#06b6d4',
      'PSP': '#22c55e',
    };
    return {
      color:       colours[zoneCode] ?? '#6b7280',
      fillColor:   colours[zoneCode] ?? '#6b7280',
      weight:      1.5,
      opacity:     0.8,
      fillOpacity: 0.12
    };
  }
}