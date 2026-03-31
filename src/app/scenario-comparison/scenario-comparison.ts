import { Component, Input, OnChanges, NgZone, ChangeDetectorRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-scenario-comparison',
  standalone: false,
  templateUrl: './scenario-comparison.html',
  styleUrl: './scenario-comparison.css',
})
export class ScenarioComparison {

  @Input() zone:          string  = '';
  @Input() roadWidth:     number  = 9;
  @Input() plotAreaSqft:  number  = 0;
  @Input() plotLengthM:   number  = 0;
  @Input() plotWidthM:    number  = 0;
  @Input() usage:         string  = 'residential';
  @Input() cornerPlot:    boolean = false;
  @Input() basement:      boolean = false;

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
      zone:           this.zone,
      road_width:     this.roadWidth,
      plot_area_sqft: this.plotAreaSqft,
      plot_length_m:  this.plotLengthM || Math.sqrt(this.plotAreaSqft / 10.7639),
      plot_width_m:   this.plotWidthM  || Math.sqrt(this.plotAreaSqft / 10.7639),
      usage:          this.usage,
      corner_plot:    this.cornerPlot,
      basement:       this.basement,
      scenarios:      [2, 3, 4, 5],
    };

    this.http.post<any>('http://localhost:8000/scenarios', payload)
      .subscribe({
        next: (res) => {
          this.ngZone.run(() => {
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
