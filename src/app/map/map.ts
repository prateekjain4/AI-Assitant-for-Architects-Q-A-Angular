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

  // Zone detection state
  detecting: boolean = false;
  detectedZone: any = null;
  zoneError: string = '';

  private clickMarker: any = null;
  private L: any = null;

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

    // ── Zone polygon overlay from GeoJSON ──────────────────────────
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

    // ── Leaflet Draw (existing — unchanged) ────────────────────────
    const drawnItems = new L.FeatureGroup();
    this.map.addLayer(drawnItems);

    const drawControl = new L.Control.Draw({
      draw: {
        polygon: { allowIntersection: false, showArea: false },
        rectangle: { showArea: false },
        circle: false,
        marker: false,
        polyline: false,
        circlemarker: false
      },
      edit: { featureGroup: drawnItems }
    });

    this.map.addControl(drawControl);

    this.map.on('draw:created', (event: any) => {
      const layer = event.layer;
      drawnItems.clearLayers();
      drawnItems.addLayer(layer);

      const latlngs = layer.getLatLngs()[0];
      const coordinates = latlngs.map((p: any) => ({ lat: p.lat, lng: p.lng }));

      const turfCoords = latlngs.map((p: any) => [p.lng, p.lat]);
      turfCoords.push(turfCoords[0]);
      const polygon = turf.polygon([turfCoords]);
      const area = turf.area(polygon);
      const plotArea = Math.round(area * 10.7639);

      this.mapData.setPlotData(coordinates, plotArea);
      this.cdr.detectChanges();
      console.log('Plot area:', plotArea, 'Coordinates:', coordinates);
    });

    // ── Single click → detect zone ─────────────────────────────────
    // Only fires on plain clicks, not during draw operations
    this.map.on('click', (e: any) => {

      // Ignore clicks during draw mode
      if (this.isDrawing()) return;

      const { lat, lng } = e.latlng;

      // Drop a pin at clicked point
      if (this.clickMarker) this.map.removeLayer(this.clickMarker);
      this.clickMarker = L.circleMarker([lat, lng], {
        radius: 7,
        color: '#1d4ed8',
        fillColor: '#3b82f6',
        fillOpacity: 0.9,
        weight: 2
      }).addTo(this.map);

      this.ngZone.run(() => {
        this.detecting = true;
        this.zoneError = '';
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
                this.mapData.setDetectedZone(res);  // → planning-tool picks this up
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
    });
  }

  // Prevents zone detection click firing while draw toolbar is active
  private isDrawing(): boolean {
    return document.querySelector('.leaflet-draw-toolbar-used') !== null;
  }

  private getZoneStyle(zoneCode: string) {
    const colours: Record<string, string> = {
      'R':   '#3b82f6',   // blue
      'RM':  '#8b5cf6',   // purple
      'C1':  '#f97316',   // orange
      'C2':  '#ef4444',   // red
      'C3':  '#dc2626',   // dark red
      'IT':  '#06b6d4',   // cyan
      'PSP': '#22c55e',   // green
    };
    return {
      color:       colours[zoneCode] ?? '#6b7280',
      weight:      1.5,
      opacity:     0.8,
      fillOpacity: 0.12
    };
  }
}