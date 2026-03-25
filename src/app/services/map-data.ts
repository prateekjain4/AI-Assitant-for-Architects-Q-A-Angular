import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class MapData {
  plotCoordinates: any[] = [];
  plotArea: number = 0;
  detectedZone: any = null;

  private planningResult: any = null;
  setPlanningResult(result: any) { this.planningResult = result; }
  getPlanningResult() { return this.planningResult; }

  setPlotData(coords: any[], area: number) {
    this.plotCoordinates = coords;
    this.plotArea = area;
  }

  getPlotCoordinates() {
    return this.plotCoordinates;
  }

  getPlotArea() {
    return this.plotArea;
  }

  setDetectedZone(zone: any) {
    this.detectedZone = zone;
  }

  getDetectedZone() {
    return this.detectedZone;
  }
}
