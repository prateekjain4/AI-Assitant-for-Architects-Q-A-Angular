import { Component, OnInit, AfterViewInit, ChangeDetectorRef, NgZone, Inject, PLATFORM_ID, ViewChild, ElementRef } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';

export interface HydChatMessage { role: 'user' | 'ai'; text: string; ts: string; }
export interface HydChatSession  { id: string; title: string; messages: HydChatMessage[]; createdAt: string; updatedAt: string; }

@Component({
  selector: 'app-hyderabad-planning',
  standalone: false,
  templateUrl: './hyderabad-planning.html',
  styleUrl: './hyderabad-planning.css',
})
export class HyderabadPlanningTool implements OnInit, AfterViewInit {

  @ViewChild('hydChatBody', { static: false }) chatBodyRef?: ElementRef;

  form: FormGroup = new FormGroup({});
  result: any = null;
  loading = false;
  errorMessage = '';

  // ── Chat ──────────────────────────────────────────────────────
  chatOpen      = false;
  historyOpen   = false;
  chatInput     = '';
  chatLoading   = false;
  chatSessions: HydChatSession[] = [];
  activeChatId  = '';
  private readonly CHAT_KEY = 'hyd_chat_sessions';

  get activeSession(): HydChatSession | undefined {
    return this.chatSessions.find(s => s.id === this.activeChatId);
  }
  get activeMessages(): HydChatMessage[] { return this.activeSession?.messages ?? []; }

  private map: any = null;
  private plotMarker: any = null;
  private readonly isBrowser: boolean;

  readonly HYD_CENTER = [17.3850, 78.4867];
  readonly STORAGE_KEY = 'hyd_planning_state';

  openSections: Record<string, boolean> = {
    metrics:       true,
    setbacks:      true,
    far:           false,
    staircase:     false,
    fire:          false,
    compliance:    false,
    parking:       false,
    scenarios:     false,
    basement:      false,
    accessibility: false,
    solar:         false,
    openSpace:     false,
    sanctions:     false,
  };

  readonly zones = [
    // Residential
    { value: 'R1',  label: 'R1  — Residential — Very Low Density (Individual Houses)' },
    { value: 'R2',  label: 'R2  — Residential — Low Density' },
    { value: 'R3',  label: 'R3  — Residential — Medium Density' },
    { value: 'R4',  label: 'R4  — Residential — High Density' },
    { value: 'R5',  label: 'R5  — Residential — Very High Density (Transit Corridors)' },
    // Commercial
    { value: 'C1',  label: 'C1  — Commercial — Neighbourhood / Local' },
    { value: 'C2',  label: 'C2  — Commercial — District / Community' },
    { value: 'C3',  label: 'C3  — Commercial — City / Regional (CBD)' },
    // Mixed Use
    { value: 'MU1', label: 'MU1 — Mixed Use — Low Intensity' },
    { value: 'MU2', label: 'MU2 — Mixed Use — High Intensity (Near Metro / ORR)' },
    // Industrial
    { value: 'I1',  label: 'I1  — Industrial — Cottage / Household / Service' },
    { value: 'I2',  label: 'I2  — Industrial — Light / IT Park / Hi-Tech' },
    { value: 'I3',  label: 'I3  — Industrial — General / Medium' },
    { value: 'I4',  label: 'I4  — Industrial — Heavy / Hazardous' },
    // Other
    { value: 'PSP', label: 'PSP — Public & Semi-Public / Institutional' },
    { value: 'T',   label: 'T   — Transportation Corridor / Hub' },
    { value: 'OS',  label: 'OS  — Open Space / Recreational / Green' },
    { value: 'AG',  label: 'AG  — Agriculture / Green Buffer' },
  ];

  constructor(
    private fb: FormBuilder,
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
    private router: Router,
    public  auth: AuthService,
    private toast: ToastService,
    @Inject(PLATFORM_ID) platformId: object,
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
    if (this.isBrowser) this.loadSessions();
  }

  ngOnInit(): void {
    this.form = this.fb.group({
      zone:           ['R2', Validators.required],
      plotLength:     ['', Validators.required],
      plotWidth:      ['', Validators.required],
      roadWidth:      ['', Validators.required],
      buildingHeight: ['', Validators.required],
      usage:          ['residential'],
      cornerPlot:     ['false'],
      basement:       ['false'],
      floorHeight:    [3.0],
    });
  }

  ngAfterViewInit(): void {
    if (this.isBrowser) {
      this.initMap();
      try {
        const raw = localStorage.getItem(this.STORAGE_KEY);
        if (raw) {
          const saved = JSON.parse(raw);
          this.form.patchValue(saved.formValues);
          this.result       = saved.result;
          this.openSections = saved.openSections;
          this.cdr.detectChanges();
        }
      } catch (_) {}
    }
  }

  private async initMap(): Promise<void> {
    if (this.map) return;
    const leafletModule = await import('leaflet');
    const L: any = (leafletModule as any).default ?? leafletModule;
    setTimeout(() => {
      try {
        this.map = L.map('hyderabad-map', { zoomControl: true })
          .setView([this.HYD_CENTER[0], this.HYD_CENTER[1]], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
          maxZoom: 19,
        }).addTo(this.map);

        // ── HMDA Zone GeoJSON overlay ──────────────────────────────
        const canvasRenderer = L.canvas({ padding: 0.5 });
        this.http.get<any>('assets/hyderabad_zones_display.geojson').subscribe({
          next: (geojson) => {
            const options: any = {
              renderer: canvasRenderer,
              style: (feature: any) => this.getZoneStyle(feature?.properties?.zone_code),
              onEachFeature: (feature: any, layer: any) => {
                const p = feature.properties;
                layer.bindTooltip(
                  `<b>${p.zone_code}</b> — ${p.zone_name}` +
                  (p.locality ? `<br><span style="font-size:11px">${p.locality}</span>` : ''),
                  { sticky: true }
                );
              }
            };
            L.geoJSON(geojson, options).addTo(this.map);
          },
          error: (err) => console.error('Zone overlay failed:', err)
        });

        this.map.on('click', (e: any) => {
          this.ngZone.run(() => {
            const { lat, lng } = e.latlng;
            this.setMapMarker(lat, lng, L);
          });
        });
      } catch (err) {
        console.warn('Leaflet map init failed:', err);
      }
    }, 100);
  }

  private getZoneStyle(zoneCode: string) {
    const colours: Record<string, string> = {
      'R1':  '#3b82f6',  // blue        — Residential R1
      'R2':  '#60a5fa',  // light blue  — Residential R2
      'C1':  '#ef4444',  // red         — Commercial C1
      'C2':  '#dc2626',  // dark red    — Commercial C2
      'MX':  '#8b5cf6',  // violet      — Mixed Use
      'IT':  '#06b6d4',  // cyan        — IT / ITES
      'I1':  '#a16207',  // amber       — Industrial I1
      'I2':  '#92400e',  // dark amber  — Industrial I2
      'PSP': '#22c55e',  // green       — Public Semi-Public
      'T':   '#64748b',  // slate       — Transportation
      'P':   '#16a34a',  // dark green  — Parks & Open Space
      'GB':  '#166534',  // forest      — Green Belt
      'AG':  '#ca8a04',  // yellow      — Agricultural
    };
    return {
      color:       colours[zoneCode] ?? '#6b7280',
      fillColor:   colours[zoneCode] ?? '#6b7280',
      weight:      1,
      opacity:     0.7,
      fillOpacity: 0.15,
    };
  }

  private setMapMarker(lat: number, lng: number, L: any): void {
    if (!this.map) return;
    if (this.plotMarker) this.plotMarker.remove();
    this.plotMarker = L.marker([lat, lng] as [number, number], {
      title: 'Plot location',
    }).addTo(this.map)
      .bindPopup(`<b>Plot location</b><br>Lat: ${lat.toFixed(5)}<br>Lng: ${lng.toFixed(5)}`)
      .openPopup();
  }

  toggleSection(key: string): void {
    this.openSections[key] = !this.openSections[key];
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading = true;
    this.result  = null;
    const v = this.form.value;

    const payload = {
      zone:            v.zone,
      plot_length:     Number(v.plotLength),
      plot_width:      Number(v.plotWidth),
      road_width:      Number(v.roadWidth),
      building_height: Number(v.buildingHeight),
      usage:           v.usage || 'residential',
      corner_plot:     v.cornerPlot === 'true',
      basement:        v.basement  === 'true',
      floor_height:    Number(v.floorHeight) || 3.0,
      locality:        'Hyderabad',
    };

    this.http.post<any>(environment.apiUrl + '/planning-hyderabad', payload)
      .subscribe({
        next: (res) => this.ngZone.run(() => {
          this.result = res;
          this.openSections = {
            metrics:       true,
            setbacks:      true,
            far:           false,
            staircase:     false,
            fire:          false,
            compliance:    false,
            parking:       false,
            scenarios:     false,
            basement:      false,
            accessibility: false,
            solar:         false,
            openSpace:     false,
            sanctions:     false,
          };
          try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify({
              formValues:   this.form.value,
              result:       this.result,
              openSections: this.openSections,
            }));
          } catch (_) {}
          this.loading      = false;
          this.errorMessage = '';
          this.cdr.detectChanges();
        }),
        error: () => this.ngZone.run(() => {
          this.loading = false;
          this.errorMessage = 'Failed to calculate — check inputs and try again.';
          this.toast.error(this.errorMessage);
          this.cdr.detectChanges();
        }),
      });
  }

  goToCities(): void {
    this.router.navigate(['/planning']);
  }

  // ── Regulatory source references ─────────────────────────────
  showSourceModal = false;
  sourceSection   = '';

  // PDF viewer state
  showPdfViewer  = false;
  pdfViewerUrl   = '';
  pdfCurrentPage = 1;
  pdfPrintedPage = 1;
  pdfSearchText  = '';
  pdfDocLabel    = '';

  // Hyderabad_Bylaws.pdf: physical page 1 = printed page 1 (no front matter offset)
  private readonly PDF_PAGE_OFFSETS: Record<string, number> = {
    'Hyderabad_Bylaws.pdf': 0,
  };

  readonly SOURCES: Record<string, Array<{
    doc: string; clause: string; desc: string; pdf?: string; page?: number; searchText?: string;
  }>> = {
    metrics: [
      { doc: 'AP Building Rules 2012 (GHMC)', clause: 'Rule 5, Table II — GO Ms.No.168', desc: 'Plot area and maximum built-up area derived from zone-based FAR. Ground coverage: 60% for plots ≤ 750 sqm; 55% above 750 sqm.', pdf: 'Hyderabad_Bylaws.pdf', page: 7, searchText: 'Floor Area Ratio' },
    ],
    setbacks: [
      { doc: 'AP Building Rules 2012 (GHMC)', clause: 'Rule 5 — Table IV, Section 5', desc: 'Setbacks by plot area and building height. Front: road-width dependent (Table III). Side and rear: height-progressive. High-rise additional setbacks above 18m.', pdf: 'Hyderabad_Bylaws.pdf', page: 9, searchText: 'PERMISSIBLE SETBACKS' },
    ],
    far: [
      { doc: 'AP Building Rules 2012 (GHMC)', clause: 'Rule 5, Table II — GO Ms.No.168', desc: 'Zone-based FAR: R1–R5 (1.5–3.5), C1–C3 (2.0–3.5), MU1/MU2 (2.5/3.5), I1–I4 (1.0–2.0), PSP: 1.5. Road-width and plot-area constraints apply.', pdf: 'Hyderabad_Bylaws.pdf', page: 7, searchText: 'Floor Area Ratio' },
    ],
    staircase: [
      { doc: 'AP Building Rules 2012 (GHMC)', clause: 'Rule 11 — Staircase & Lift', desc: 'Staircase minimum width 1.5 m. Lift mandatory for buildings above 15 m height (G+4 and above). Service lift for high-rise above 24 m.', pdf: 'Hyderabad_Bylaws.pdf', page: 20, searchText: 'staircase' },
    ],
    fire: [
      { doc: 'AP Building Rules 2012 (GHMC)', clause: 'Rule 13 — High Rise Buildings', desc: 'Fire NOC from GHMC mandatory for buildings above 18 m height. Commercial BUA > 500 sqm also requires Fire NOC. Firefighting lift and sprinklers mandatory above 24 m.', pdf: 'Hyderabad_Bylaws.pdf', page: 13, searchText: 'High Rise building' },
    ],
    parking: [
      { doc: 'AP Building Rules 2012 (GHMC)', clause: 'Rule 9, Table VI (Parking Rates)', desc: 'Parking: Residential — 1 car per unit > 75 sqm. Commercial — 1 car per 50 sqm. Shopping Malls — as per Table VI. EV charging provision mandatory for new buildings.', pdf: 'Hyderabad_Bylaws.pdf', page: 18, searchText: 'Shopping Malls' },
    ],
    basement: [
      { doc: 'AP Building Rules 2012 (GHMC)', clause: 'Rule 10 — Cellar / Basement Parking', desc: 'Basement not counted in FAR if used for parking only. Common and continuous cellar parking allowed between adjoining buildings subject to structural safety. Setback 3 m from boundary.', pdf: 'Hyderabad_Bylaws.pdf', page: 19, searchText: 'cellar parking' },
    ],
    compliance: [
      { doc: 'AP Building Rules 2012 (GHMC)', clause: 'Rules 5, 7, 9, 11, 13 — Full Rules', desc: 'Compliance checklist based on GHMC Building Permissions Rules 2012 (GO Ms.No.168) covering setbacks, FAR, ground coverage, parking, fire NOC, and staircase requirements.', pdf: 'Hyderabad_Bylaws.pdf', page: 1, searchText: 'building permission' },
    ],
    scenarios: [
      { doc: 'AP Building Rules 2012 — GO Ms.No.168', clause: 'Rules 5 & 7 — Tables II / III / IV', desc: 'Scenario heights anchored to AP Building Rules thresholds: 15 m (lift mandatory + commercial fire NOC), 18 m (high-rise setbacks + residential fire NOC), plus Max-FAR scenario derived from zone FAR and road-width height cap.', pdf: 'Hyderabad_Bylaws.pdf', page: 7, searchText: 'Floor Area Ratio' },
    ],
    accessibility: [
      { doc: 'AP Building Rules 2012 — Annexure-V (Rule 15.a.v)', clause: 'NBC 2005, Part-III, Clause 12.21', desc: 'Special requirements for public buildings. Access path min 1200 mm, gradient ≤ 1:20. Ramp slope 1:12 (runs ≤ 9000 mm). Door clear width 900 mm. Stair tread 300 mm, riser ≤ 150 mm. WC 900 × 1500 mm, seat height 500 mm. Handrail 900 mm high, 40 mm dia.', pdf: 'Hyderabad_Bylaws.pdf', page: 312, searchText: 'physically challenged' },
    ],
    solar: [
      { doc: 'AP Building Rules 2012', clause: 'Rule 15.a.xi & Rule 22', desc: 'Solar Water Heating mandatory for Group Housing ≥ 100 units, Hospitals, Nursing Homes, Hotels. Bank guarantee required. 10% property tax rebate for solar adoption. Rainwater harvesting mandatory for ALL buildings — GO Ms.No.350 MA.', pdf: 'Hyderabad_Bylaws.pdf', page: 21, searchText: 'Group Housing' },
    ],
    openSpace: [
      { doc: 'AP Building Rules 2012', clause: 'Rules 5.f.v, 7.a.vii, 8.g, 15.a.x', desc: 'Non-high-rise plots > 750 sqm: 5% of site as organised open space. High-rise ≥ 4000 sqm: 10% open to sky + 2 m green strip on all sides. Chowk: min 25 sqm, 3 m side. Group Housing ≥ 100 units: 3% of BUA for common amenities.', pdf: 'Hyderabad_Bylaws.pdf', page: 21, searchText: 'open space' },
    ],
    sanctions: [
      { doc: 'AP Building Rules 2012', clause: 'Rules 19, 24, 25, 26', desc: 'Building permit fee: 2% of licence fee (max Rs. 10,000); parking floors exempt. Non-high-rise valid 3 years; High-Rise/GDS 5 years. Construction must commence within 18 months. OC mandatory for all buildings except plots ≤ 200 sqm, height ≤ 7 m.', pdf: 'Hyderabad_Bylaws.pdf', page: 25, searchText: 'Built Up Area' },
    ],
  };

  openSource(section: string, event: Event): void {
    event.stopPropagation();
    this.sourceSection   = section;
    this.showSourceModal = true;
  }

  closeSourceModal(): void { this.showSourceModal = false; }

  get currentSources() { return this.SOURCES[this.sourceSection] ?? []; }

  docUrl(pdf: string): string {
    return `${environment.apiUrl}/docs/${pdf}`;
  }

  openPdf(src: { pdf?: string; page?: number; searchText?: string; doc?: string; clause?: string }): void {
    if (!src.pdf) return;
    const printedPage   = src.page ?? 1;
    const offset        = this.PDF_PAGE_OFFSETS[src.pdf] ?? 0;
    this.pdfViewerUrl   = this.docUrl(src.pdf);
    this.pdfPrintedPage = printedPage;
    this.pdfCurrentPage = printedPage + offset;
    this.pdfSearchText  = src.searchText ?? '';
    this.pdfDocLabel    = src.doc ? `${src.doc}${src.clause ? ' — ' + src.clause : ''}` : src.pdf;
    this.showPdfViewer  = true;
  }

  closePdfViewer(): void {
    this.showPdfViewer = false;
    this.pdfSearchText = '';
  }

  onPdfLoaded(pdfProxy: any): void {
    if (!this.pdfSearchText) return;
    try {
      const bus = (pdfProxy as any)?.eventBus ?? (pdfProxy as any)?._pdfInfo?.eventBus;
      if (bus) {
        bus.dispatch('find', {
          query: this.pdfSearchText, type: 'again',
          caseSensitive: false, findPrevious: false,
          highlightAll: true, phraseSearch: true,
        });
      }
    } catch { /* graceful no-op */ }
  }

  // ── Chat methods ──────────────────────────────────────────────
  toggleChat(): void {
    this.chatOpen = !this.chatOpen;
    if (this.chatOpen && !this.activeChatId) this.createNewSession();
  }

  toggleHistory(): void { this.historyOpen = !this.historyOpen; }
  newChat(): void { this.createNewSession(); this.historyOpen = false; }

  switchSession(id: string): void {
    this.activeChatId = id;
    this.historyOpen  = false;
    setTimeout(() => this.scrollToBottom(), 50);
  }

  deleteSession(id: string, e?: Event): void {
    e?.stopPropagation();
    this.chatSessions = this.chatSessions.filter(s => s.id !== id);
    this.saveSessions();
    if (this.activeChatId === id) {
      this.chatSessions.length ? this.activeChatId = this.chatSessions[0].id : this.createNewSession();
    }
  }

  private createNewSession(): void {
    const s: HydChatSession = {
      id: crypto.randomUUID(), title: 'New Chat',
      messages: [{ role: 'ai', text: 'Hi! I\'m your Hyderabad Planning Assistant. Ask me anything about GHMC zones, setbacks, FAR, fire NOC, or your calculated results.', ts: new Date().toISOString() }],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    this.chatSessions.unshift(s);
    this.activeChatId = s.id;
    this.saveSessions();
  }

  private saveSessions(): void {
    if (!this.isBrowser) return;
    this.chatSessions = this.chatSessions.slice(0, 20);
    localStorage.setItem(this.CHAT_KEY, JSON.stringify(this.chatSessions));
  }

  private loadSessions(): void {
    try {
      const raw = localStorage.getItem(this.CHAT_KEY);
      this.chatSessions = raw ? JSON.parse(raw) : [];
    } catch { this.chatSessions = []; }
  }

  private pushMessage(msg: HydChatMessage): void {
    const s = this.activeSession;
    if (!s) return;
    s.messages.push(msg);
    s.updatedAt = new Date().toISOString();
    if (msg.role === 'user' && s.title === 'New Chat')
      s.title = msg.text.length > 40 ? msg.text.slice(0, 40) + '…' : msg.text;
    this.saveSessions();
  }

  private scrollToBottom(): void {
    setTimeout(() => {
      const el = this.chatBodyRef?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    }, 25);
  }

  sendMessage(): void {
    const text = this.chatInput.trim();
    if (!text || this.chatLoading) return;
    this.pushMessage({ role: 'user', text, ts: new Date().toISOString() });
    this.chatInput   = '';
    this.chatLoading = true;
    this.scrollToBottom();

    this.http.post<any>(environment.apiUrl + '/chat', {
      question:      text,
      planning_data: this.result || null,
      scenario_data: null,
      cost_estimate: null,
    }).subscribe({
      next: (res) => this.ngZone.run(() => {
        this.pushMessage({ role: 'ai', text: res?.answer ?? res?.text ?? JSON.stringify(res), ts: new Date().toISOString() });
        this.chatLoading = false;
        this.cdr.detectChanges();
        this.scrollToBottom();
      }),
      error: () => this.ngZone.run(() => {
        this.pushMessage({ role: 'ai', text: 'Sorry, I could not reach the server. Please try again.', ts: new Date().toISOString() });
        this.chatLoading = false;
        this.cdr.detectChanges();
        this.scrollToBottom();
      }),
    });
  }

  onChatKey(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.sendMessage(); }
  }
}