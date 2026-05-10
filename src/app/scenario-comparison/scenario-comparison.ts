import { Component, Input, NgZone, ChangeDetectorRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { CostDataService } from '../services/cost-data.service';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-scenario-comparison',
  standalone: false,
  templateUrl: './scenario-comparison.html',
  styleUrl: './scenario-comparison.css',
})
export class ScenarioComparison {

  @Input() city:             string  = 'bengaluru';   // 'bengaluru' | 'hyderabad' | 'ranchi'
  @Input() authority:        string  = 'rmc';          // ranchi: 'rmc' | 'rrda'
  @Input() zone:             string  = '';
  @Input() roadWidth:        number  = 9;
  @Input() plotAreaSqft:     number  = 0;
  @Input() plotLengthM:      number  = 0;
  @Input() plotWidthM:       number  = 0;
  @Input() usage:            string  = 'residential';
  @Input() cornerPlot:       boolean = false;
  @Input() basement:         boolean = false;
  @Input() floorHeightM:     number  = 3.2;
  @Input() buildingHeightM:  number  = 0;
  @Input() idealFloors:      number  = 0;  // feasible floors from planning result
  @Input() carSpaces:        number  = 0;

  scenarioData: any    = null;
  aiAdvice:     any    = null;
  loading:      boolean = false;
  selectedTab:  string  = '';
  expandedFloor: string = '';

  // Per-scenario cost estimates
  scenarioCosts:        { [label: string]: any }     = {};
  scenarioCostLoading:  { [label: string]: boolean } = {};

  constructor(
    private http: HttpClient,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef,
    private router: Router,
    private costData: CostDataService,
  ) {}

  ngOnChanges() {
    const hasPlot = this.plotAreaSqft > 0 || (this.plotLengthM > 0 && this.plotWidthM > 0);
    if (this.zone && hasPlot) {
      this.loadScenarios();
    }
  }

  loadScenarios() {
    this.loading = true;
    const isHyderabad = (this.city || '').toLowerCase() === 'hyderabad';
    const fallbackSide = this.plotAreaSqft > 0 ? Math.sqrt(this.plotAreaSqft / 10.7639) : 0;
    const plotLen = this.plotLengthM || fallbackSide;
    const plotWd  = this.plotWidthM  || fallbackSide;

    const bengaluruPayload = {
      zone:               this.zone,
      road_width:         this.roadWidth,
      plot_area_sqft:     this.plotAreaSqft,
      plot_length_m:      plotLen,
      plot_width_m:       plotWd,
      usage:              this.usage,
      corner_plot:        this.cornerPlot,
      basement:           this.basement,
      // scenarios field omitted — backend derives from BBMP bylaw height thresholds
      floor_height_m:     this.floorHeightM    || 3.2,
      building_height_m:  this.buildingHeightM || 0,
    };

    // /scenarios-hyderabad uses plot_length / plot_width / building_height keys
    const hyderabadPayload = {
      zone:             this.zone,
      road_width:       this.roadWidth,
      plot_length:      plotLen,
      plot_width:       plotWd,
      usage:            this.usage,
      corner_plot:      this.cornerPlot,
      basement:         this.basement,
      floor_height:     this.floorHeightM    || 3.0,
      building_height:  this.buildingHeightM || 0,
      locality:         'Hyderabad',
    };

    const isRanchi = (this.city || '').toLowerCase() === 'ranchi';

    const ranchiPayload = {
      zone:             this.zone,
      road_width:       this.roadWidth,
      plot_length:      plotLen,
      plot_width:       plotWd,
      usage:            this.usage,
      corner_plot:      this.cornerPlot,
      basement:         this.basement,
      floor_height:     this.floorHeightM    || 3.2,
      building_height:  this.buildingHeightM || 0,
      authority:        (this as any).authority || 'rmc',
    };

    const url     = isHyderabad ? environment.apiUrl + '/scenarios-hyderabad'
                  : isRanchi    ? environment.apiUrl + '/scenarios-ranchi'
                  :               environment.apiUrl + '/scenarios';
    const payload = isHyderabad ? hyderabadPayload
                  : isRanchi    ? ranchiPayload
                  :               bengaluruPayload;

    this.http.post<any>(url, payload)
      .subscribe({
        next: (res) => {
          this.ngZone.run(() => {
            this.scenarioData = res;
            this.aiAdvice     = res.ai_advice ?? null;
            this.selectedTab  = res.recommended;
            this.loading      = false;
            this.cdr.detectChanges();
            // Pre-fetch cost for the recommended scenario
            this.fetchScenarioCost(this.selectedScenario);
          });
        },
        error: () => {
          this.ngZone.run(() => {
            this.loading = false;
            this.cdr.detectChanges();
          });
        }
      });
  }

  get selectedScenario(): any {
    return this.scenarioData?.scenarios?.find(
      (s: any) => s.label === this.selectedTab
    );
  }

  selectTab(label: string) {
    this.selectedTab = label;
    this.fetchScenarioCost(this.selectedScenario);
  }

  fetchScenarioCost(scenario: any) {
    if (!scenario) return;
    const label = scenario.label;
    if (this.scenarioCosts[label] || this.scenarioCostLoading[label]) return;
    this.scenarioCostLoading[label] = true;

    const plotLenM = this.plotLengthM || Math.sqrt(this.plotAreaSqft / 10.7639);
    const plotWdM  = this.plotWidthM  || Math.sqrt(this.plotAreaSqft / 10.7639);

    this.http.post<any>(environment.apiUrl + '/estimate-cost', {
      plot_length_m:     plotLenM,
      plot_width_m:      plotWdM,
      built_up_sqm:      scenario.total_built_sqm,
      num_floors:        scenario.num_floors,
      floor_height_m:    this.floorHeightM || 3.2,
      setback_front:     scenario.setbacks?.front  ?? 3,
      setback_side:      scenario.setbacks?.side   ?? 1.5,
      setback_rear:      scenario.setbacks?.rear   ?? 1.5,
      usage:             this.usage,
      zone:              this.zone,
      fire_noc_required: !!scenario.fire_noc_required,
      basement:          this.basement,
      car_spaces:        scenario.parking_car || this.carSpaces,
      tier:              'mid',
    }).subscribe({
      next: (res) => this.ngZone.run(() => {
        this.scenarioCosts[label] = res;
        this.scenarioCostLoading[label] = false;
        this.cdr.detectChanges();
      }),
      error: () => this.ngZone.run(() => {
        this.scenarioCostLoading[label] = false;
        this.cdr.detectChanges();
      }),
    });
  }

  openCostAnalysis() {
    if (!this.scenarioData) return;
    const plotLenM = this.plotLengthM || Math.sqrt(this.plotAreaSqft / 10.7639);
    const plotWdM  = this.plotWidthM  || Math.sqrt(this.plotAreaSqft / 10.7639);
    const rec = this.selectedScenario || this.scenarioData.scenarios[0];
    this.costData.set({
      plotLengthM:     plotLenM,
      plotWidthM:      plotWdM,
      builtUpSqm:      rec?.total_built_sqm ?? this.plotAreaSqft * this.scenarioData.far / 10.7639,
      numFloors:        rec?.num_floors ?? 3,
      floorHeightM:    this.floorHeightM || 3.2,
      setbackFront:    rec?.setbacks?.front  ?? 3,
      setbackSide:     rec?.setbacks?.side   ?? 1.5,
      setbackRear:     rec?.setbacks?.rear   ?? 1.5,
      usage:           this.usage,
      zone:            this.zone,
      fireNocRequired: !!rec?.fire_noc_required,
      basement:        this.basement,
      carSpaces:       rec?.parking_car || this.carSpaces,
      plotAreaSqft:    this.plotAreaSqft,
      far:             this.scenarioData.far,
      farBase:         this.scenarioData.far_base,
      farTdr:          this.scenarioData.far_tdr,
      maxBuiltSqft:    this.scenarioData.max_built_sqft,
      planningZone:    this.scenarioData.planning_zone || 'zone_A',
      roadWidth:       this.roadWidth,
      groundCovPct:    rec?.ground_coverage_pct ?? 60,
      scenarios:       this.scenarioData.scenarios,
    });
    this.router.navigate(['/cost-analysis']);
  }

  toggleFloor(label: string) {
    this.expandedFloor = this.expandedFloor === label ? '' : label;
  }

  efficiencyColor(pct: number): string {
    if (pct >= 90) return '#16a34a';
    if (pct >= 70) return '#d97706';
    return '#dc2626';
  }

  barWidth(value: number, max: number): number {
    return Math.round((value / (max || 1)) * 100);
  }

}
