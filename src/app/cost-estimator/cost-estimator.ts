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
      { label: 'Structure',    value: this.result.structure_cost,  color: '#3b82f6', source: 'KPWD SR 2022' },
      { label: 'Finishing',    value: this.result.finishing_cost,  color: '#10b981', source: 'Mixed (KPWD + Market)' },
      { label: 'MEP',          value: this.result.mep_cost,        color: '#f59e0b', source: 'Market estimate' },
      { label: 'Site Dev',     value: this.result.site_dev_cost,   color: '#0ea5e9', source: 'KPWD SR 2022' },
      { label: 'Parking',      value: this.result.parking_cost,    color: '#8b5cf6', source: 'Market estimate' },
      { label: 'Basement',     value: this.result.basement_cost,   color: '#6366f1', source: 'KPWD SR 2022' },
      { label: 'Fire/Safety',  value: this.result.fire_cost,       color: '#ef4444', source: 'Market estimate' },
      { label: 'Contingency',  value: this.result.contingency,     color: '#94a3b8', source: '8% of total' },
    ].filter(b => b.value > 0);
  }

  get maxBar(): number {
    return Math.max(...this.bars.map(b => b.value), 1);
  }

  // ── Payment Milestone Schedule ────────────────────────────────
  get milestones(): { stage: number, name: string, pct: number, amount: number, note: string, cumulative: number }[] {
    if (!this.result?.total_cost) return [];
    const total = this.result.total_cost;
    const stages = [
      { stage: 1, name: 'Mobilisation & Foundation', pct: 15, note: 'Site clearing, excavation, PCC, footing concrete. Paid before work starts.' },
      { stage: 2, name: 'Plinth & Ground Floor Slab', pct: 25, note: 'After foundation completion. Bank releases first tranche on engineer inspection.' },
      { stage: 3, name: 'Structure & Brickwork',      pct: 20, note: 'Columns, beams, upper floor slabs, brick masonry complete.' },
      { stage: 4, name: 'Finishing & Interiors',      pct: 30, note: 'Plastering, flooring, tiles, doors, windows, paint, MEP rough-in.' },
      { stage: 5, name: 'Handover & Completion',      pct: 10, note: 'Final snag clearance, OC application, utility connections.' },
    ];
    let cumulative = 0;
    return stages.map(m => {
      cumulative += m.pct;
      return { ...m, amount: total * m.pct / 100, cumulative };
    });
  }

  // ── Material Rate Card ────────────────────────────────────────
  showRates = false;

  rateCard = [
    // Structure
    { item: 'Concrete M20 (slabs / beams)',       unit: 'm³',    base: 6471,   surcharge: 647,  final: 7118,   group: 'Structure' },
    { item: 'Concrete M25 (columns)',             unit: 'm³',    base: 6492,   surcharge: 649,  final: 7141,   group: 'Structure' },
    { item: 'Concrete M30 (foundations / raft)',  unit: 'm³',    base: 7022,   surcharge: 702,  final: 7724,   group: 'Structure' },
    { item: 'Steel Fe500D (reinforcement)',        unit: 'tonne', base: 69357,  surcharge: 6936, final: 76293,  group: 'Structure' },
    { item: 'Shuttering (timber, 3 uses)',         unit: 'm²',    base: 320,    surcharge: 32,   final: 352,    group: 'Structure' },
    // Excavation
    { item: 'Excavation 0–3m (mechanical)',        unit: 'm³',    base: 49,     surcharge: 5,    final: 54,     group: 'Excavation' },
    { item: 'Excavation 3–6m (mechanical)',        unit: 'm³',    base: 56,     surcharge: 6,    final: 62,     group: 'Excavation' },
    // Masonry & Finishing
    { item: 'Brick masonry 230mm (CM 1:6)',        unit: 'm³',    base: 4200,   surcharge: 420,  final: 4620,   group: 'Masonry' },
    { item: '12mm cement plaster (CM 1:6)',        unit: 'm²',    base: 195,    surcharge: 20,   final: 215,    group: 'Masonry' },
    { item: '20mm cement plaster (CM 1:4)',        unit: 'm²',    base: 240,    surcharge: 24,   final: 264,    group: 'Masonry' },
    { item: 'Waterproofing – brick bat coba',      unit: 'm²',    base: 620,    surcharge: 62,   final: 682,    group: 'Masonry' },
    { item: 'Waterproofing – hot bitumen 2-coat',  unit: 'm²',    base: 380,    surcharge: 38,   final: 418,    group: 'Masonry' },
    // Site Development
    { item: 'Compound wall (230mm brick, 1.8m ht)',unit: 'r.m.', base: 2800,   surcharge: 280,  final: 3080,   group: 'Site Dev' },
    { item: 'Underground sump – 10KL',             unit: 'lump',  base: 85000,  surcharge: 8500, final: 93500,  group: 'Site Dev' },
    { item: 'Underground sump – 20KL',             unit: 'lump',  base: 140000, surcharge: 14000,final: 154000, group: 'Site Dev' },
    { item: 'Septic tank + soak pit',              unit: 'lump',  base: 45000,  surcharge: 4500, final: 49500,  group: 'Site Dev' },
    { item: 'Approach road (50mm WBM)',            unit: 'm²',    base: 380,    surcharge: 38,   final: 418,    group: 'Site Dev' },
  ];
}
