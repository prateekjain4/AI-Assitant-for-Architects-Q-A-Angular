import { Component, AfterViewInit, Inject, PLATFORM_ID, ChangeDetectorRef } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
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

  constructor(@Inject(PLATFORM_ID) private platformId: Object, private mapData: MapData, private cdr: ChangeDetectorRef) {}

  async ngAfterViewInit() {

    if (isPlatformBrowser(this.platformId)) {
      await this.initMap();
    }

  }

  async initMap() {

    const L = await import('leaflet');
    await import('leaflet-draw');
    await import('leaflet-geometryutil');   // dynamic import

    this.map = L.map('map').setView([12.9716, 77.5946], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(this.map);


    const drawnItems = new L.FeatureGroup();
    this.map.addLayer(drawnItems);

    const drawControl = new L.Control.Draw({
    draw: {
      polygon: {
        allowIntersection: false,
        showArea: false
      },
      rectangle: {
        showArea: false
      },
      circle: false,
      marker: false,
      polyline: false,
      circlemarker: false
      },
      edit: {
      featureGroup: drawnItems
      }
    });

    this.map.addControl(drawControl);

    this.map.on('draw:created', (event:any) => {

      const layer = event.layer;

      drawnItems.clearLayers();
      drawnItems.addLayer(layer);

      const latlngs = layer.getLatLngs()[0];

      const coordinates = latlngs.map((p:any) => ({
        lat: p.lat,
        lng: p.lng
      }));
      const turfCoords = latlngs.map((p:any) => [p.lng, p.lat]);
      turfCoords.push(turfCoords[0]);
      const polygon = turf.polygon([turfCoords]);
      const area = turf.area(polygon);
      const plotArea = Math.round(area * 10.7639);
      this.cdr.detectChanges(); // Force change detection to update the UI
      // store in service
      this.mapData.setPlotData(coordinates, plotArea);
      console.log("Plot area:", this.plotArea);

      console.log("Coordinates:", coordinates);

    });

  }
}
