import { Injectable } from '@angular/core';

export interface CostAnalysisInput {
  // Cost estimation inputs
  plotLengthM:     number;
  plotWidthM:      number;
  builtUpSqm:      number;
  numFloors:       number;
  floorHeightM:    number;
  setbackFront:    number;
  setbackSide:     number;
  setbackRear:     number;
  usage:           string;
  zone:            string;
  fireNocRequired: boolean;
  basement:        boolean;
  carSpaces:       number;
  // Display context (from planning result)
  plotAreaSqft:    number;
  far:             number;
  farBase:         number;
  farTdr:          number;
  maxBuiltSqft:    number;
  planningZone:    string;
  roadWidth:       number;
  groundCovPct:    number;
  // Scenarios (from scenario comparison result)
  scenarios?:      any[];
}

export interface PlanningState {
  formValues:   any;
  result:       any;
  openSections: Record<string, boolean>;
}

@Injectable({ providedIn: 'root' })
export class CostDataService {
  private _data:          CostAnalysisInput | null = null;
  private _planningState: PlanningState     | null = null;

  set(d: CostAnalysisInput) { this._data = d; }
  get(): CostAnalysisInput | null { return this._data; }
  has(): boolean { return !!this._data; }

  savePlanningState(s: PlanningState) { this._planningState = s; }
  getPlanningState(): PlanningState | null { return this._planningState; }
  clearPlanningState() { this._planningState = null; }
}