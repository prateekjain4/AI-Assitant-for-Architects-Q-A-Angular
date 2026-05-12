import { Injectable } from '@angular/core';

export interface ValuationInput {
  city:                   string;
  zone:                   string;
  usage:                  string;
  maxBuiltSqm:            number;
  numFloors:              number;
  plotAreaSqm:            number;
  totalConstructionCost:  number;
  lat:                    number | null;
  lng:                    number | null;
  // Display context
  plotLengthM:            number;
  plotWidthM:             number;
  roadWidth:              number;
  planningZone:           string;
  far:                    number;
  locality:               string;
}

@Injectable({ providedIn: 'root' })
export class ValuationDataService {
  private _data: ValuationInput | null = null;

  set(d: ValuationInput) { this._data = d; }
  get(): ValuationInput | null { return this._data; }
  has(): boolean { return !!this._data; }
  clear() { this._data = null; }
}