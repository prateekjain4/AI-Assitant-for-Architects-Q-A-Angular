import {
  Component, Input, OnChanges, AfterViewInit, OnDestroy,
  ViewChild, ElementRef, ChangeDetectorRef, SimpleChanges
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import Panzoom, { PanzoomObject } from '@panzoom/panzoom';

export interface FloorZone {
  label: string;
  x: number; y: number; w: number; h: number;
  color: string;
  type: 'circulation' | 'commercial' | 'residential' | 'core' | 'services' | 'parking' | 'open';
  area?: number;
  bylawRef?: string;
  compliance?: string[];
}

@Component({
  selector: 'app-site-plan',
  standalone: false,
  templateUrl: './site-plan.html',
  styleUrl:    './site-plan.css',
})
export class SitePlan implements OnChanges, AfterViewInit, OnDestroy {
  @ViewChild('svgWrap') svgWrap!: ElementRef<HTMLDivElement>;

  @Input() plotLengthM     = 20;
  @Input() plotWidthM      = 15;
  @Input() roadWidthM      = 6;
  @Input() buildingHeightM = 10;
  @Input() numFloors       = 3;
  @Input() floorHeightM    = 3.2;
  @Input() setbackFront    = 3;
  @Input() setbackSide     = 1.5;
  @Input() setbackRear     = 1.5;
  @Input() usage           = 'residential';
  @Input() cornerPlot      = false;
  @Input() groundCovPct    = 60;
  @Input() zone            = 'RM';
  @Input() aiZones: FloorZone[] = [];

  // ── Layer toggles ────────────────────────────────────────────
  layers = {
    setbacks:   true,
    dimensions: true,
    grid:       true,
    zones:      true,
    annotations:true,
  };

  activeTab: 'plan' | 'elevation' = 'plan';
  selectedZone: FloorZone | null = null;
  aiLoading   = false;
  aiError     = '';
  aiAnnotations: string[] = [];

  // ── SVG viewport constants ───────────────────────────────────
  readonly SCALE   = 8;          // px per metre
  readonly PAD     = 80;         // margin around drawing
  readonly NBR_W   = 12;         // neighbour strip width (m)
  readonly ROAD_EXTRA = 4;       // extra road shown (m)
  readonly TITLE_H = 56;         // title block height (px)

  private panzoom?: PanzoomObject;

  constructor(private cdr: ChangeDetectorRef, private http: HttpClient) {}

  ngAfterViewInit() {
    this.initPanzoom();
  }

  ngOnChanges(changes: SimpleChanges) {
    this.cdr.markForCheck();
  }

  ngOnDestroy() {
    this.panzoom?.destroy();
  }

  private initPanzoom() {
    const el = this.svgWrap?.nativeElement?.querySelector('.pz-target') as HTMLElement;
    if (!el) return;
    this.panzoom?.destroy();
    this.panzoom = Panzoom(el, {
      maxScale: 10,
      minScale: 0.3,
      contain: 'outside',
      canvas: true,
    });
    const wrap = this.svgWrap.nativeElement;
    wrap.addEventListener('wheel', (e: WheelEvent) => {
      this.panzoom?.zoomWithWheel(e);
    }, { passive: false });
  }

  setTab(tab: 'plan' | 'elevation') {
    this.activeTab = tab;
    setTimeout(() => this.initPanzoom(), 60);
  }

  zoomIn()    { this.panzoom?.zoomIn();  }
  zoomOut()   { this.panzoom?.zoomOut(); }
  resetZoom() { this.panzoom?.reset();   }

  selectZone(zone: FloorZone | null) {
    this.selectedZone = zone;
    this.cdr.markForCheck();
  }

  // ── Computed SVG dimensions ──────────────────────────────────
  get S() { return this.SCALE; }

  get effLength() { return Math.max(1, Number(this.plotLengthM) || 20); }
  get effWidth()  { return Math.max(1, Number(this.plotWidthM)  || 15); }

  get totalPlotW()  { return (this.NBR_W * 2 + this.effLength) * this.S; }
  get totalPlotH()  { return (this.NBR_W + this.effWidth + this.roadWidthM + this.ROAD_EXTRA) * this.S; }
  get svgW()        { return this.totalPlotW + this.PAD * 2; }
  get svgH()        { return this.totalPlotH + this.PAD * 2 + this.TITLE_H; }

  // Plot origin in SVG coords
  get plotX()  { return this.PAD + this.NBR_W * this.S; }
  get plotY()  { return this.PAD + this.NBR_W * this.S; }
  get plotW()  { return this.effLength * this.S; }
  get plotH()  { return this.effWidth  * this.S; }

  // Buildable area
  get bldX()   { return this.plotX + this.setbackSide  * this.S; }
  get bldY()   { return this.plotY + this.setbackRear  * this.S; }
  get bldW()   { return Math.max(0, this.effLength - 2 * this.setbackSide)  * this.S; }
  get bldH()   { return Math.max(0, this.effWidth - this.setbackFront - this.setbackRear) * this.S; }

  get buildableAreaM2() {
    return ((this.effLength - 2 * this.setbackSide) *
            (this.effWidth - this.setbackFront - this.setbackRear)).toFixed(0);
  }

  // Road
  get roadY()  { return this.plotY + this.plotH; }
  get roadH()  { return this.roadWidthM * this.S; }

  // Neighbours
  get nbrLeftX()  { return this.PAD; }
  get nbrRightX() { return this.plotX + this.plotW; }
  get nbrTopY()   { return this.PAD; }
  get nbrW()      { return this.NBR_W * this.S; }
  get nbrH()      { return this.plotH; }

  // Column grid lines (every 5m inside buildable)
  get gridLines(): { x1: number, y1: number, x2: number, y2: number, label: string, axis: 'x'|'y', idx: number }[] {
    const lines: any[] = [];
    const step = 5;
    const cols = Math.floor((this.effLength - 2 * this.setbackSide) / step);
    const rows = Math.floor((this.effWidth  - this.setbackFront - this.setbackRear) / step);
    const cols_letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

    for (let i = 0; i <= cols; i++) {
      const x = this.bldX + i * step * this.S;
      lines.push({ x1: x, y1: this.bldY, x2: x, y2: this.bldY + this.bldH, label: cols_letters[i] || `${i}`, axis: 'x', idx: i });
    }
    for (let j = 0; j <= rows; j++) {
      const y = this.bldY + j * step * this.S;
      lines.push({ x1: this.bldX, y1: y, x2: this.bldX + this.bldW, y2: y, label: `${j + 1}`, axis: 'y', idx: j });
    }
    return lines;
  }

  // Dimension strings
  get dimFront()  { return { x1: this.plotX, x2: this.plotX + this.plotW, y: this.plotY + this.plotH + this.roadH + 22, label: `${this.setbackFront}m front setback` }; }
  get dimPlotW()  { return { x1: this.plotX, x2: this.plotX + this.plotW, y: this.plotY + this.plotH + this.roadH + 42, label: `${this.effLength}m` }; }
  get dimPlotH()  { return { y1: this.plotY, y2: this.plotY + this.plotH, x: this.plotX + this.plotW + 22, label: `${this.effWidth}m` }; }
  get dimBldW()   { return { x1: this.bldX,  x2: this.bldX + this.bldW,  y: this.plotY + this.plotH + this.roadH + 8,  label: `${(this.plotLengthM - 2 * this.setbackSide).toFixed(1)}m buildable` }; }

  // AI zone helpers
  // y=0 from GPT = front/road = bottom of canvas (bldY + bldH), so flip vertically
  aiZoneX(z: FloorZone)  { return this.bldX + z.x * this.S; }
  aiZoneY(z: FloorZone)  { return this.bldY + this.bldH - (z.y + z.h) * this.S; }
  aiZoneW(z: FloorZone)  { return z.w * this.S; }
  aiZoneH(z: FloorZone)  { return z.h * this.S; }
  aiZoneCx(z: FloorZone) { return this.aiZoneX(z) + this.aiZoneW(z) / 2; }
  aiZoneCy(z: FloorZone) { return this.aiZoneY(z) + this.aiZoneH(z) / 2; }
  aiZoneArea(z: FloorZone) { return (z.w * z.h).toFixed(0); }
  aiZoneFontSize(z: FloorZone) { return Math.max(6, Math.min(11, z.w * this.S / 10)); }

  // Elevation helpers
  get elevSvgW()   { return this.svgW; }
  get elevSvgH()   { return 480 + this.TITLE_H; }
  get elevGroundY(){ return 400; }
  get elevScale()  { return Math.min((this.svgW - this.PAD * 2) / (this.effLength + this.NBR_W * 2), 30); }
  get elevNbrW()   { return this.NBR_W * this.elevScale; }
  get elevPlotX()  { return this.PAD + this.elevNbrW; }
  get elevBldX()   { return this.elevPlotX + this.setbackSide * this.elevScale; }
  get elevBldW()   { return (this.effLength - 2 * this.setbackSide) * this.elevScale; }
  get elevBldH()   { return this.buildingHeightM * this.elevScale; }
  get elevBldTopY(){ return this.elevGroundY - this.elevBldH; }
  get elevNbrH()   { return Math.min(this.buildingHeightM * 0.7, 8) * this.elevScale; }

  get floorLines(): { y: number, label: string }[] {
    const lines: any[] = [];
    for (let f = 0; f <= this.numFloors; f++) {
      const y = this.elevGroundY - f * this.floorHeightM * this.elevScale;
      lines.push({ y, label: f === 0 ? 'GF' : `F${f}` });
    }
    return lines;
  }

  get skyPlanePoints(): string {
    const es = this.elevScale;
    const leftX  = this.elevPlotX;
    const rightX = this.elevPlotX + this.effLength * es;
    const maxH   = this.buildingHeightM * 1.4 * es;
    const slope  = 1.25;
    const runL   = maxH / slope;
    return `${leftX},${this.elevGroundY} ${leftX},${this.elevGroundY} ${leftX + runL},${this.elevGroundY - maxH}`;
  }

  get skyPlanePointsRight(): string {
    const es = this.elevScale;
    const rightX = this.elevPlotX + this.effLength * es;
    const maxH   = this.buildingHeightM * 1.4 * es;
    const slope  = 1.25;
    const runR   = maxH / slope;
    return `${rightX},${this.elevGroundY} ${rightX},${this.elevGroundY} ${rightX - runR},${this.elevGroundY - maxH}`;
  }

  get windowRects(): { x: number, y: number, w: number, h: number }[] {
    const rects: any[] = [];
    const ww = Math.max(4, this.elevBldW * 0.07);
    const wh = Math.max(4, (this.elevBldH / this.numFloors) * 0.35);
    const cols = Math.max(1, Math.floor(this.elevBldW / (ww * 3)));
    const gapX = this.elevBldW / (cols + 1);
    for (let f = 0; f < this.numFloors; f++) {
      const wy = this.elevBldTopY + (f / this.numFloors) * this.elevBldH + (this.elevBldH / this.numFloors) * 0.28;
      for (let c = 0; c < cols; c++) {
        rects.push({ x: this.elevBldX + (c + 1) * gapX - ww / 2, y: wy, w: ww, h: wh });
      }
    }
    return rects;
  }

  // ── Title block values ───────────────────────────────────────
  get titleY()    { return this.svgH - this.TITLE_H; }
  get scaleLabel(){ return `1 : ${Math.round(1000 / this.SCALE) * 10}`; }
  get today()     {
    const d = new Date();
    return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
  }
  get usageLabel(){ return this.usage.charAt(0).toUpperCase() + this.usage.slice(1); }

  get elevTitleY()    { return this.elevSvgH - this.TITLE_H; }

  // ── AI Floor Plan ────────────────────────────────────────────
  generateFloorPlan() {
    this.aiLoading = true;
    this.aiError   = '';
    this.http.post<any>(environment.apiUrl + '/generate-floor-plan', {
      plot_length_m:       this.plotLengthM,
      plot_width_m:        this.plotWidthM,
      setback_front:       this.setbackFront,
      setback_side:        this.setbackSide,
      setback_rear:        this.setbackRear,
      building_height_m:   this.buildingHeightM,
      num_floors:          this.numFloors,
      floor_height_m:      this.floorHeightM,
      usage:               this.usage,
      zone:                this.zone,
      ground_coverage_pct: this.groundCovPct,
      road_width_m:        this.roadWidthM,
      corner_plot:         this.cornerPlot,
      basement:            false,
    }).subscribe({
      next: (res) => {
        this.aiZones       = res.zones       || [];
        this.aiAnnotations = res.annotations || [];
        this.layers.zones  = true;
        this.aiLoading     = false;
        this.activeTab     = 'plan';
        this.cdr.markForCheck();
        setTimeout(() => this.initPanzoom(), 60);
      },
      error: () => {
        this.aiError   = 'Could not generate floor plan. Check backend is running.';
        this.aiLoading = false;
        this.cdr.markForCheck();
      }
    });
  }

  clearFloorPlan() {
    this.aiZones       = [];
    this.aiAnnotations = [];
    this.selectedZone  = null;
    this.cdr.markForCheck();
  }

  // ── Export ───────────────────────────────────────────────────
  exportSVG() {
    const svgEl = this.svgWrap?.nativeElement?.querySelector('svg');
    if (!svgEl) return;
    const src  = new XMLSerializer().serializeToString(svgEl);
    const blob = new Blob([src], { type: 'image/svg+xml' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.download = `site-plan-${this.usage}.svg`;
    a.href = url; a.click();
    URL.revokeObjectURL(url);
  }

  exportDXF() {
    // Minimal valid DXF with plot boundary, buildable area, setback lines
    const S = this.SCALE;
    const toBldg = (px: number, py: number) => ({
      x: (px - this.bldX) / S,
      y: -(py - this.bldY) / S
    });

    const lines: string[] = [];
    const addLine = (x1:number,y1:number,x2:number,y2:number,layer:string) => {
      lines.push(`0\nLINE\n8\n${layer}\n10\n${x1.toFixed(3)}\n20\n${y1.toFixed(3)}\n30\n0.0\n11\n${x2.toFixed(3)}\n21\n${y2.toFixed(3)}\n31\n0.0`);
    };
    const rect = (x:number,y:number,w:number,h:number,layer:string) => {
      addLine(x,y,x+w,y,layer); addLine(x+w,y,x+w,y+h,layer);
      addLine(x+w,y+h,x,y+h,layer); addLine(x,y+h,x,y,layer);
    };

    rect(0, 0, this.effLength, -this.effWidth, 'PLOT_BOUNDARY');
    rect(this.setbackSide, -this.setbackRear,
         this.effLength - 2 * this.setbackSide,
         -(this.effWidth - this.setbackFront - this.setbackRear), 'BUILDABLE_AREA');

    const dxf = `0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n${lines.join('\n')}\n0\nENDSEC\n0\nEOF`;
    const blob = new Blob([dxf], { type: 'application/octet-stream' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.download = `site-plan-${this.usage}.dxf`;
    a.href = url; a.click();
    URL.revokeObjectURL(url);
  }

  exportPDF() {
    const svgEl = this.svgWrap?.nativeElement?.querySelector('svg');
    if (!svgEl) return;
    const src  = new XMLSerializer().serializeToString(svgEl);
    const blob = new Blob([src], { type: 'image/svg+xml' });
    const url  = URL.createObjectURL(blob);
    const win  = window.open(url, '_blank');
    if (win) { win.onload = () => win.print(); }
    URL.revokeObjectURL(url);
  }
}