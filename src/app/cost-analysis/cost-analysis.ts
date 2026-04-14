import { Component, OnInit, ChangeDetectorRef, NgZone } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { CostDataService, CostAnalysisInput } from '../services/cost-data.service';

@Component({
  selector: 'app-cost-analysis',
  standalone: false,
  templateUrl: './cost-analysis.html',
  styleUrl: './cost-analysis.css',
})
export class CostAnalysisPage implements OnInit {

  input: CostAnalysisInput | null = null;

  tier: 'low' | 'mid' | 'high' = 'mid';
  result: any = null;
  loading = false;
  error = '';

  // 3-tier comparison
  tierResults: { low: any; mid: any; high: any } = { low: null, mid: null, high: null };
  tierLoading = false;

  // Scenario cost results keyed by scenario label
  scenarioCosts: { [label: string]: any } = {};
  scenarioCostLoading: { [label: string]: boolean } = {};

  expandedPhase: string = '';

  constructor(
    private http: HttpClient,
    private router: Router,
    private costData: CostDataService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
  ) {}

  ngOnInit() {
    this.input = this.costData.get();
    if (!this.input) {
      this.router.navigate(['/planning']);
      return;
    }
    this.fetchMain();
    this.fetchAllTiers();
    // Pre-fetch cost for all scenarios
    if (this.input.scenarios?.length) {
      this.input.scenarios.forEach(s => this.fetchScenarioCost(s));
    }
  }

  // ── Main estimate ─────────────────────────────────────────────
  fetchMain() {
    this.loading = true;
    this.error = '';
    this.http.post<any>('http://localhost:8000/estimate-cost', this.buildPayload(this.tier))
      .subscribe({
        next: (res) => this.ngZone.run(() => { this.result = res; this.loading = false; this.cdr.detectChanges(); }),
        error: ()  => this.ngZone.run(() => { this.error = 'Could not fetch estimate.'; this.loading = false; this.cdr.detectChanges(); }),
      });
  }

  setTier(t: 'low' | 'mid' | 'high') {
    this.tier = t;
    this.fetchMain();
  }

  // ── 3-tier comparison ─────────────────────────────────────────
  fetchAllTiers() {
    this.tierLoading = true;
    const reqs = (['low', 'mid', 'high'] as const).map(t =>
      this.http.post<any>('http://localhost:8000/estimate-cost', this.buildPayload(t)).toPromise()
    );
    Promise.all(reqs).then(([low, mid, high]) => {
      this.ngZone.run(() => {
        this.tierResults = { low, mid, high };
        this.tierLoading = false;
        this.cdr.detectChanges();
      });
    }).catch(() => {
      this.ngZone.run(() => { this.tierLoading = false; this.cdr.detectChanges(); });
    });
  }

  // ── Per-scenario cost ─────────────────────────────────────────
  fetchScenarioCost(scenario: any) {
    const label = scenario.label;
    if (this.scenarioCosts[label] || this.scenarioCostLoading[label]) return;
    this.scenarioCostLoading[label] = true;
    const payload = this.buildPayload(this.tier);
    payload['built_up_sqm']      = scenario.total_built_sqm;
    payload['num_floors']        = scenario.num_floors;
    payload['setback_front']     = scenario.setbacks?.front   ?? payload['setback_front'];
    payload['setback_side']      = scenario.setbacks?.side    ?? payload['setback_side'];
    payload['setback_rear']      = scenario.setbacks?.rear    ?? payload['setback_rear'];
    payload['fire_noc_required'] = !!scenario.fire_noc_required;

    this.http.post<any>('http://localhost:8000/estimate-cost', payload).subscribe({
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

  // ── Helpers ───────────────────────────────────────────────────
  private buildPayload(t: string): any {
    const inp = this.input!;
    return {
      plot_length_m:     inp.plotLengthM,
      plot_width_m:      inp.plotWidthM,
      built_up_sqm:      inp.builtUpSqm,
      num_floors:        inp.numFloors,
      floor_height_m:    inp.floorHeightM,
      setback_front:     inp.setbackFront,
      setback_side:      inp.setbackSide,
      setback_rear:      inp.setbackRear,
      usage:             inp.usage,
      zone:              inp.zone,
      fire_noc_required: inp.fireNocRequired,
      basement:          inp.basement,
      car_spaces:        inp.carSpaces,
      tier:              t,
    };
  }

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

  pctScenario(val: number, total: number): number {
    if (!total) return 0;
    return Math.round((val / total) * 100);
  }

  togglePhase(phase: string) {
    this.expandedPhase = this.expandedPhase === phase ? '' : phase;
  }

  get bars(): { label: string; value: number; color: string; source: string }[] {
    if (!this.result) return [];
    return [
      { label: 'Structure',   value: this.result.structure_cost,  color: '#3b82f6', source: 'KPWD SR 2022' },
      { label: 'Finishing',   value: this.result.finishing_cost,  color: '#10b981', source: 'Mixed (KPWD + Market)' },
      { label: 'MEP',         value: this.result.mep_cost,        color: '#f59e0b', source: 'Market estimate' },
      { label: 'Site Dev',    value: this.result.site_dev_cost,   color: '#0ea5e9', source: 'KPWD SR 2022' },
      { label: 'Parking',     value: this.result.parking_cost,    color: '#8b5cf6', source: 'Market estimate' },
      { label: 'Basement',    value: this.result.basement_cost,   color: '#6366f1', source: 'KPWD SR 2022' },
      { label: 'Fire/Safety', value: this.result.fire_cost,       color: '#ef4444', source: 'Market estimate' },
      { label: 'Contingency', value: this.result.contingency,     color: '#94a3b8', source: '8% of subtotal' },
    ].filter(b => b.value > 0);
  }

  get maxBar(): number {
    return Math.max(...this.bars.map(b => b.value), 1);
  }

  tierPhases = [
    { key: 'structure_cost',  label: 'Structure',   color: '#3b82f6' },
    { key: 'finishing_cost',  label: 'Finishing',   color: '#10b981' },
    { key: 'mep_cost',        label: 'MEP',         color: '#f59e0b' },
    { key: 'site_dev_cost',   label: 'Site Dev',    color: '#0ea5e9' },
    { key: 'parking_cost',    label: 'Parking',     color: '#8b5cf6' },
    { key: 'basement_cost',   label: 'Basement',    color: '#6366f1' },
    { key: 'fire_cost',       label: 'Fire/Safety', color: '#ef4444' },
    { key: 'total_cost',      label: 'TOTAL',       color: '#1e293b' },
  ];

  finishingKeys = ['brickwork','plastering','waterproofing_terrace','flooring','doors_windows','painting'];
  siteDevKeys   = ['compound_wall','underground_sump','septic_tank','approach_road','gate'];
  basementKeys  = ['excavation','raft_slab','waterproofing','retaining_walls'];

  finishLabel(k: string): string {
    const m: any = {
      brickwork: 'Brickwork', plastering: 'Plastering',
      waterproofing_terrace: 'Waterproofing (terrace)', flooring: 'Flooring',
      doors_windows: 'Doors & Windows', painting: 'Painting',
    };
    return m[k] || k;
  }

  siteLabel(k: string): string {
    const m: any = {
      compound_wall: 'Compound Wall', underground_sump: 'Underground Sump',
      septic_tank: 'Septic Tank + Soak Pit', approach_road: 'Approach Road', gate: 'Gate',
    };
    return m[k] || k;
  }

  basementLabel(k: string): string {
    const m: any = {
      excavation: 'Excavation', raft_slab: 'Raft Slab (M30)',
      waterproofing: 'Waterproofing (bitumen)', retaining_walls: 'Retaining Walls',
    };
    return m[k] || k;
  }

  goBack() {
    this.router.navigate(['/planning']);
  }
}