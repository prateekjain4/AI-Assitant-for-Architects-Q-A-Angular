import { Component, Input, OnChanges, AfterViewInit, ViewChild, ElementRef, NgZone, ChangeDetectorRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
@Component({
  selector: 'app-parking-layout',
  standalone: false,
  templateUrl: './parking-layout.html',
  styleUrl: './parking-layout.css',
})
export class ParkingLayout implements OnChanges, AfterViewInit {
  @ViewChild('parkCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  @Input() usage:         string  = 'residential';
  @Input() builtUpSqft:   number  = 0;
  @Input() numUnits:      number  = 1;
  @Input() plotLengthM:   number  = 0;
  @Input() plotWidthM:    number  = 0;
  @Input() basement:      boolean = false;
  @Input() stilt:         boolean = false;

  parkingData: any    = null;
  loading:     boolean = false;
  activeTab:   string  = 'layout';
  private canvasReady = false;

  constructor(
    private http:  HttpClient,
    private ngZone: NgZone,
    private cdr:   ChangeDetectorRef
  ) {}

  ngAfterViewInit() {
    this.canvasReady = true;
    if (this.parkingData) this.drawLayout();
  }

  ngOnChanges() {
    if (this.builtUpSqft > 0 && this.usage) {
      this.loadParking();
    }
  }

  loadParking() {
    this.loading = true;
    this.http.post<any>('http://localhost:8000/parking', {
      usage:         this.usage,
      built_up_sqft: this.builtUpSqft,
      num_units:     this.numUnits,
      plot_length_m: this.plotLengthM || 20,
      plot_width_m:  this.plotWidthM  || 15,
      basement:      this.basement,
      stilt:         this.stilt,
    }).subscribe({
      next: (res) => {
        this.ngZone.run(() => {
          this.parkingData = res;
          this.loading     = false;
          this.cdr.detectChanges();
          setTimeout(() => this.drawLayout(), 100);
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

  setTab(tab: string) {
    this.activeTab = tab;
    if (tab === 'layout') setTimeout(() => this.drawLayout(), 50);
  }

  drawLayout() {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas || !this.parkingData?.layout) return;

    const layout = this.parkingData.layout;
    const DPR    = window.devicePixelRatio || 1;
    const W      = canvas.offsetWidth  || 560;
    const PAD    = 32;

    const totalW = layout.total_width_m;
    const totalH = layout.total_height_m;
    const scaleX = (W - PAD * 2) / totalW;
    const scaleY = scaleX; // keep aspect ratio
    const H      = Math.ceil(totalH * scaleY + PAD * 2 + 60);

    canvas.width  = W  * DPR;
    canvas.height = H  * DPR;
    canvas.style.height = H + 'px';

    const ctx = canvas.getContext('2d')!;
    ctx.scale(DPR, DPR);
    ctx.clearRect(0, 0, W, H);

    // helpers
    const px  = (m: number) => PAD + m * scaleX;
    const py  = (m: number) => PAD + m * scaleY;
    const pw  = (m: number) => m * scaleX;
    const ph  = (m: number) => m * scaleY;

    // Background
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, W, H);

    // Outer plot boundary
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth   = 2;
    ctx.strokeRect(PAD, PAD, pw(totalW), ph(totalH));

    // Ramp
    if (layout.has_ramp && layout.ramp) {
      const r = layout.ramp;
      ctx.fillStyle   = '#fef3c7';
      ctx.fillRect(px(r.x_m), py(r.y_m), pw(r.w_m), ph(r.h_m));
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth   = 1;
      ctx.strokeRect(px(r.x_m), py(r.y_m), pw(r.w_m), ph(r.h_m));
      ctx.fillStyle   = '#92400e';
      ctx.font        = `${Math.max(9, pw(0.8))}px sans-serif`;
      ctx.textAlign   = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('RAMP', px(r.x_m) + pw(r.w_m)/2, py(r.y_m) + ph(r.h_m)/2);
    }

    // Drive aisles
    layout.aisles.forEach((a: any) => {
      ctx.fillStyle   = '#e0f2fe';
      ctx.fillRect(px(a.x_m), py(a.y_m), pw(a.w_m), ph(a.h_m));
      ctx.strokeStyle = '#7dd3fc';
      ctx.lineWidth   = 0.5;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(px(a.x_m), py(a.y_m), pw(a.w_m), ph(a.h_m));
      ctx.setLineDash([]);
      // Direction arrows
      const ay = py(a.y_m) + ph(a.h_m) / 2;
      const ax1 = px(a.x_m) + 10, ax2 = px(a.x_m) + pw(a.w_m) - 10;
      ctx.strokeStyle = '#0369a1'; ctx.lineWidth = 1;
      this.drawArrow(ctx, ax1, ay, ax2, ay);
      this.drawArrow(ctx, ax2, ay, ax1, ay);
    });

    // Car spaces
    layout.car_spaces.forEach((s: any) => {
      ctx.fillStyle   = s.visitor ? '#fef9c3' : '#dcfce7';
      ctx.fillRect(px(s.x_m), py(s.y_m), pw(s.w_m), ph(s.h_m));
      ctx.strokeStyle = s.visitor ? '#ca8a04' : '#16a34a';
      ctx.lineWidth   = 1;
      ctx.strokeRect(px(s.x_m), py(s.y_m), pw(s.w_m), ph(s.h_m));
      // Car icon (simplified rectangle)
      const cx = px(s.x_m) + pw(s.w_m)/2;
      const cy = py(s.y_m) + ph(s.h_m)/2;
      const cw = pw(s.w_m) * 0.55, ch = ph(s.h_m) * 0.45;
      ctx.fillStyle   = s.visitor ? '#fde047' : '#4ade80';
      ctx.fillRect(cx - cw/2, cy - ch/2, cw, ch);
      // Space number
      if (pw(s.w_m) > 16) {
        ctx.fillStyle    = s.visitor ? '#854d0e' : '#166534';
        ctx.font         = `bold ${Math.max(8, Math.min(11, pw(0.9)))}px sans-serif`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(
          s.visitor ? 'V' : `${s.row * layout.cars_per_row + s.col + 1}`,
          cx, py(s.y_m) + ph(s.h_m) - 2
        );
      }
    });

    // Bike spaces
    layout.bike_spaces.forEach((s: any) => {
      ctx.fillStyle   = '#ede9fe';
      ctx.fillRect(px(s.x_m), py(s.y_m), pw(s.w_m), ph(s.h_m));
      ctx.strokeStyle = '#7c3aed';
      ctx.lineWidth   = 0.8;
      ctx.strokeRect(px(s.x_m), py(s.y_m), pw(s.w_m), ph(s.h_m));
    });

    // Bike zone label
    if (layout.bike_spaces.length > 0) {
      const by = layout.bike_spaces[0];
      ctx.fillStyle    = '#6d28d9';
      ctx.font         = `bold ${Math.max(9, pw(0.6))}px sans-serif`;
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('TWO-WHEELER ZONE', px(by.x_m), py(by.y_m) - 14);
    }

    // Dimension lines
    this.drawDimH(ctx, PAD, PAD + ph(totalH) + 18, PAD + pw(totalW), `${totalW.toFixed(1)}m`);
    this.drawDimV(ctx, PAD - 18, PAD, PAD + ph(totalH), `${totalH.toFixed(1)}m`);

    // Legend
    const ly  = PAD + ph(totalH) + 36;
    const lx  = PAD;
    const items = [
      { color: '#dcfce7', stroke: '#16a34a', label: 'Resident parking' },
      { color: '#fef9c3', stroke: '#ca8a04', label: 'Visitor (V)' },
      { color: '#ede9fe', stroke: '#7c3aed', label: 'Two-wheeler' },
      { color: '#e0f2fe', stroke: '#7dd3fc', label: 'Drive aisle' },
    ];
    items.forEach((item, i) => {
      const ix = lx + i * 140;
      ctx.fillStyle = item.color;
      ctx.fillRect(ix, ly, 14, 10);
      ctx.strokeStyle = item.stroke; ctx.lineWidth = 0.8;
      ctx.strokeRect(ix, ly, 14, 10);
      ctx.fillStyle    = '#374151';
      ctx.font         = '10px sans-serif';
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(item.label, ix + 18, ly + 5);
    });
  }

  private drawArrow(ctx: CanvasRenderingContext2D, x1:number, y1:number, x2:number, y2:number) {
    const al = 7;
    const dx = x2-x1, dy = y2-y1;
    const len = Math.sqrt(dx*dx+dy*dy);
    if (len < 1) return;
    const nx = dx/len, ny = dy/len;
    ctx.beginPath();
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - al*nx + al*0.4*ny, y2 - al*ny - al*0.4*nx);
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - al*nx - al*0.4*ny, y2 - al*ny + al*0.4*nx);
    ctx.stroke();
  }

  private drawDimH(ctx: CanvasRenderingContext2D, x1:number, y:number, x2:number, label:string) {
    ctx.strokeStyle = '#64748b'; ctx.fillStyle = '#64748b';
    ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(x1,y); ctx.lineTo(x2,y); ctx.stroke();
    [[x1,1],[x2,-1]].forEach(([x,d]:any) => {
      ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+d*6,y-3); ctx.moveTo(x,y); ctx.lineTo(x+d*6,y+3); ctx.stroke();
    });
    ctx.font='bold 10px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='bottom';
    ctx.fillText(label, (x1+x2)/2, y-4);
  }

  private drawDimV(ctx: CanvasRenderingContext2D, x:number, y1:number, y2:number, label:string) {
    ctx.strokeStyle = '#64748b'; ctx.fillStyle = '#64748b';
    ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(x,y1); ctx.lineTo(x,y2); ctx.stroke();
    [[y1,1],[y2,-1]].forEach(([y,d]:any) => {
      ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x-3,y+d*6); ctx.moveTo(x,y); ctx.lineTo(x+3,y+d*6); ctx.stroke();
    });
    ctx.save(); ctx.translate(x-4,(y1+y2)/2); ctx.rotate(-Math.PI/2);
    ctx.font='bold 10px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='bottom';
    ctx.fillText(label, 0, 0); ctx.restore();
  }

  exportPNG() {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = 'parking-layout.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  }
}
