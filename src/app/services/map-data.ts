import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class MapData {
  plotCoordinates: any[] = [];
  plotArea: number = 0;

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
}
