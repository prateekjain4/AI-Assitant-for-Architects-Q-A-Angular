import { Component, Input, NgZone, ChangeDetectorRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-scenario-comparison',
  standalone: false,
  templateUrl: './scenario-comparison.html',
  styleUrl: './scenario-comparison.css',
})
export class ScenarioComparison {

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

  scenarioData: any    = null;
  loading:      boolean = false;
  selectedTab:  string  = '';
  expandedFloor: string = '';

  constructor(
    private http: HttpClient,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnChanges() {
    if (this.zone && this.plotAreaSqft > 0) {
      this.loadScenarios();
    }
  }

  loadScenarios() {
    this.loading = true;
    const payload = {
      zone:               this.zone,
      road_width:         this.roadWidth,
      plot_area_sqft:     this.plotAreaSqft,
      plot_length_m:      this.plotLengthM || Math.sqrt(this.plotAreaSqft / 10.7639),
      plot_width_m:       this.plotWidthM  || Math.sqrt(this.plotAreaSqft / 10.7639),
      usage:              this.usage,
      corner_plot:        this.cornerPlot,
      basement:           this.basement,
      scenarios:          this.buildScenarios(),
      floor_height_m:     this.floorHeightM    || 3.2,
      building_height_m:  this.buildingHeightM || 0,
    };

    this.http.post<any>('http://localhost:8000/scenarios', payload)
      .subscribe({
        next: (res) => {
          this.ngZone.run(() => {
            // Override backend recommendation with the ideal floor label
            // Backend prefers no-NOC which may be below ideal — use planning result instead
            const idealLabel = `G+${(this.idealFloors || 3) - 1}`;
            const hasIdeal   = res.scenarios?.some((s: any) => s.label === idealLabel);
            res.recommended  = hasIdeal ? idealLabel : res.recommended;
            this.scenarioData = res;
            this.selectedTab  = res.recommended;
            this.loading      = false;
            this.cdr.detectChanges();
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

  buildScenarios(): number[] {
    // ideal = feasible floors from planning result, fallback to 3
    const ideal = this.idealFloors > 0 ? this.idealFloors : 3;
    // Show: one below ideal, ideal, one above, two above
    // Minimum floor count = 1 (G+0), cap at 15
    const s = [
      Math.max(1, ideal - 1),
      ideal,
      Math.min(15, ideal + 1),
      Math.min(15, ideal + 2),
    ];
    // Deduplicate (e.g. if ideal=1, ideal-1 also=1)
    return [...new Set(s)];
  }

  get selectedScenario(): any {
    return this.scenarioData?.scenarios?.find(
      (s: any) => s.label === this.selectedTab
    );
  }

  selectTab(label: string) {
    this.selectedTab = label;
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
