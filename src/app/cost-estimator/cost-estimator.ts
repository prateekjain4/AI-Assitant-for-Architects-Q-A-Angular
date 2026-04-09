import { Component, Input, OnChanges, ChangeDetectorRef, NgZone } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-cost-estimator',
  standalone: false,
  templateUrl: './cost-estimator.html',
  styleUrl: './cost-estimator.css',
})
export class CostEstimator implements OnChanges {
  @Input() plotLengthM     = 0;
  @Input() plotWidthM      = 0;
  @Input() builtUpSqm      = 0;
  @Input() numFloors       = 3;
  @Input() floorHeightM    = 3.2;
  @Input() setbackFront    = 3;
  @Input() setbackSide     = 1.5;
  @Input() setbackRear     = 1.5;
  @Input() usage           = 'residential';
  @Input() zone            = 'RM';
  @Input() fireNocRequired = false;
  @Input() basement        = false;
  @Input() carSpaces       = 0;

  tier: 'low' | 'mid' | 'high' = 'mid';
  result: any = null;
  loading = false;
  error   = '';

  constructor(
    private http: HttpClient,
    private cdr:  ChangeDetectorRef,
    private zone_: NgZone,
  ) {}

  ngOnChanges() {
    if (this.builtUpSqm > 0) this.fetch();
  }

  setTier(t: 'low' | 'mid' | 'high') {
    this.tier = t;
    this.fetch();
  }

  fetch() {
    this.loading = true;
    this.error   = '';
    this.http.post<any>('http://localhost:8000/estimate-cost', {
      plot_length_m:     this.plotLengthM,
      plot_width_m:      this.plotWidthM,
      built_up_sqm:      this.builtUpSqm,
      num_floors:        this.numFloors,
      floor_height_m:    this.floorHeightM,
      setback_front:     this.setbackFront,
      setback_side:      this.setbackSide,
      setback_rear:      this.setbackRear,
      usage:             this.usage,
      zone:              this.zone,
      fire_noc_required: this.fireNocRequired,
      basement:          this.basement,
      car_spaces:        this.carSpaces,
      tier:              this.tier,
    }).subscribe({
      next: (res) => {
        this.zone_.run(() => {
          this.result  = res;
          this.loading = false;
          this.cdr.detectChanges();
        });
      },
      error: () => {
        this.zone_.run(() => {
          this.error   = 'Could not fetch estimate. Check backend is running.';
          this.loading = false;
          this.cdr.detectChanges();
        });
      }
    });
  }

  // ── Helpers ──────────────────────────────────────────────────
  formatCr(val: number): string {
    if (!val) return '—';
    if (val >= 10_000_000) return `₹${(val / 10_000_000).toFixed(2)} Cr`;
    if (val >= 100_000)    return `₹${(val / 100_000).toFixed(1)} L`;
    return `₹${val.toLocaleString('en-IN')}`;
  }

  formatK(val: number): string {
    if (!val) return '—';
    return `₹${(val / 1000).toFixed(0)}K/sqm`;
  }

  pct(val: number): number {
    if (!this.result?.total_cost) return 0;
    return Math.round((val / this.result.total_cost) * 100);
  }

  get bars(): { label: string, value: number, color: string, source: string }[] {
    if (!this.result) return [];
    return [
      { label: 'Structure',   value: this.result.structure_cost,  color: '#3b82f6', source: 'KPWD SR 2022' },
      { label: 'Finishing',   value: this.result.finishing_cost,  color: '#10b981', source: 'Market estimate' },
      { label: 'MEP',         value: this.result.mep_cost,        color: '#f59e0b', source: 'Market estimate' },
      { label: 'Parking',     value: this.result.parking_cost,    color: '#8b5cf6', source: 'Market estimate' },
      { label: 'Basement',    value: this.result.basement_cost,   color: '#6366f1', source: 'KPWD SR 2022' },
      { label: 'Fire/Safety', value: this.result.fire_cost,       color: '#ef4444', source: 'Market estimate' },
      { label: 'Contingency', value: this.result.contingency,     color: '#94a3b8', source: '8% of total' },
    ].filter(b => b.value > 0);
  }

  get maxBar(): number {
    return Math.max(...this.bars.map(b => b.value), 1);
  }
}
