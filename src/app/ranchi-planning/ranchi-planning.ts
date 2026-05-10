import { Component, OnInit, AfterViewInit, ChangeDetectorRef, NgZone, Inject, PLATFORM_ID, ViewChild, ElementRef } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';

export interface RanchiChatMessage { role: 'user' | 'ai'; text: string; ts: string; }
export interface RanchiChatSession  { id: string; title: string; messages: RanchiChatMessage[]; createdAt: string; updatedAt: string; }

@Component({
  selector: 'app-ranchi-planning',
  standalone: false,
  templateUrl: './ranchi-planning.html',
  styleUrl: './ranchi-planning.css',
})
export class RanchiPlanningTool implements OnInit, AfterViewInit {

  @ViewChild('ranchiChatBody', { static: false }) chatBodyRef?: ElementRef;

  form: FormGroup = new FormGroup({});
  result: any = null;
  loading = false;
  errorMessage = '';

  // ── Chat ──────────────────────────────────────────────────────
  chatOpen      = false;
  historyOpen   = false;
  chatInput     = '';
  chatLoading   = false;
  chatSessions: RanchiChatSession[] = [];
  activeChatId  = '';
  private readonly CHAT_KEY = 'ranchi_chat_sessions';

  get activeSession(): RanchiChatSession | undefined {
    return this.chatSessions.find(s => s.id === this.activeChatId);
  }
  get activeMessages(): RanchiChatMessage[] { return this.activeSession?.messages ?? []; }

  private map: any = null;
  private plotMarker: any = null;
  private readonly isBrowser: boolean;

  readonly RANCHI_CENTER = [23.3441, 85.3096];
  readonly STORAGE_KEY   = 'ranchi_planning_state';

  openSections: Record<string, boolean> = {
    metrics:    true,
    setbacks:   true,
    far:        false,
    staircase:  false,
    fire:       false,
    compliance: false,
    parking:    false,
    basement:   false,
    scenarios:  true,
  };

  readonly zones = [
    { value: 'district_and_commercial_centre', label: 'District & Commercial Centre (FAR 3.0)' },
    { value: 'core_inner_zone',                label: 'Core / Inner Zone (FAR 2.5)' },
    { value: 'general_zone',                   label: 'General Zone (FAR 2.0)' },
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
      authority:       ['rmc', Validators.required],
      zone:            ['general_zone', Validators.required],
      plotLength:      ['', Validators.required],
      plotWidth:       ['', Validators.required],
      roadWidth:       ['', Validators.required],
      buildingHeight:  ['', Validators.required],
      usage:           ['residential'],
      cornerPlot:      ['false'],
      basement:        ['false'],
      floorHeight:     [3.2],
    });
  }

  ngAfterViewInit(): void {
    if (this.isBrowser) {
      this.initMap();
      // Restore saved state
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
        this.map = L.map('ranchi-map', { zoomControl: true })
          .setView([this.RANCHI_CENTER[0], this.RANCHI_CENTER[1]], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
          maxZoom: 19,
        }).addTo(this.map);

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
      authority:        v.authority || 'rmc',
      zone:             v.zone,
      plot_length:      Number(v.plotLength),
      plot_width:       Number(v.plotWidth),
      road_width:       Number(v.roadWidth),
      building_height:  Number(v.buildingHeight),
      usage:            v.usage || 'residential',
      corner_plot:      v.cornerPlot === 'true',
      basement:         v.basement  === 'true',
      floor_height:     Number(v.floorHeight) || 3.2,
      locality:         'Ranchi',
    };

    this.http.post<any>(environment.apiUrl + '/planning-ranchi', payload)
      .subscribe({
        next: (res) => this.ngZone.run(() => {
          this.result = res;
          this.openSections = {
            metrics:    true,
            setbacks:   true,
            far:        false,
            staircase:  false,
            fire:       false,
            compliance: false,
            parking:    false,
            basement:   false,
            scenarios:  true,
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

  goToBengaluru(): void {
    this.router.navigate(['/planning']);
  }

  // ── Regulatory source references ─────────────────────────────
  showSourceModal = false;
  sourceSection   = '';

  private readonly RMC_PDF  = 'https://ranchimunicipal.com/docs/buildingbylaws.pdf';
  private readonly JBBL_PDF = 'https://udhd.jharkhand.gov.in/Handlers/Acts.ashx?id=BL06042016060406PM.pdf';
  private readonly JBBL_10TH_PDF = 'https://udhd.jharkhand.gov.in/Handlers/Acts.ashx?id=BL18042024030409PM.pdf';
  private readonly JBBL_PAGE = 'https://udhd.jharkhand.gov.in/Other/byLaws.aspx';

  private readonly RMC_SOURCES: Record<string, Array<{ doc: string; clause: string; desc: string; pdf?: string }>> = {
    metrics: [
      { doc: 'RMC Bye-Laws 2009', clause: 'Section 20.1.5 · Section 21.1, Table 4', desc: 'Plot area and maximum built-up area derived from zone-based FAR (Section 21.1, Table 4, p.35). Ground coverage: 60% for plots ≤ 1,000 sqm and height ≤ 16 m; 50% for larger/taller buildings (Section 20.1.5, p.32).', pdf: this.RMC_PDF },
    ],
    setbacks: [
      { doc: 'RMC Bye-Laws 2009', clause: 'Section 20.1.1, Tables 2A-I & 2A-II (Residential) · Section 20.2.1, Tables 2B-I & 2B-II (Commercial)', desc: 'Setbacks determined by a 2D lookup: plot depth bracket (front/rear) × plot width bracket (sides), tiered by height (≤ 12 m / 12–16 m / > 16 m). Residential tables on pp. 28–29; Commercial tables on pp. 32–33.', pdf: this.RMC_PDF },
    ],
    far: [
      { doc: 'RMC Bye-Laws 2009', clause: 'Section 21.1, Table 4 (p.35)', desc: 'Zone-based FAR — no road-width multiplier. District & Commercial Centre: FAR 3.0 · Core / Inner Zone: FAR 2.5 · General Zone: FAR 2.0. Maximum permissible built-up area = FAR × plot area.', pdf: this.RMC_PDF },
    ],
    staircase: [
      { doc: 'RMC Bye-Laws 2009', clause: 'Section 25 (p.45) · Section 26.5(iii) (p.47)', desc: 'Staircase minimum width and count by floor number and occupancy (Section 25). Lift is mandatory for buildings above G+3 (i.e., more than 4 total floors including ground) per Section 26.5(iii).', pdf: this.RMC_PDF },
    ],
    fire: [
      { doc: 'RMC Bye-Laws 2009', clause: 'Section 5.3.2 (p.16) · Section 27 (p.48)', desc: 'Special Building threshold: height above 16 m OR ground coverage exceeding 500 sqm (Section 5.3.2). Special Buildings require a Fire NOC from the RMC Fire Officer before plan sanction (Section 27).', pdf: this.RMC_PDF },
      { doc: 'NBC 2016 Part IV', clause: 'Fire & Life Safety — Chapter 4', desc: 'National Building Code fire and life safety standards applicable to all Special Buildings. Governs firefighting shaft, hose reel, refuge area, and detection system requirements.' },
    ],
    parking: [
      { doc: 'RMC Bye-Laws 2009', clause: 'Section 23, Table 7 (pp.38–39)', desc: 'Parking requirements per Table 7: Residential — 1 car + 1 two-wheeler per dwelling unit. Commercial — 2 cars per 100 sqm + 4 two-wheelers per 100 sqm. Parking area is excluded from FAR calculation.', pdf: this.RMC_PDF },
    ],
    basement: [
      { doc: 'RMC Bye-Laws 2009', clause: 'Section 24.1.10 (pp.41–42)', desc: 'Basement is NOT counted towards FAR but IS counted for fee calculation. Setback from boundary must be maintained within the basement footprint. Only one basement level is permitted without special approval.', pdf: this.RMC_PDF },
    ],
    compliance: [
      { doc: 'RMC Bye-Laws 2009', clause: 'Full Bye-Laws 2009 (76 pp.)', desc: 'Compliance checklist based on Ranchi Municipal Corporation Planning Standards and Building Bye-Laws 2009 (amended), covering setbacks, height restrictions, ground coverage, FAR, parking, staircase, lift, fire safety, and basement provisions.', pdf: this.RMC_PDF },
    ],
  };

  private readonly RRDA_SOURCES: Record<string, Array<{ doc: string; clause: string; desc: string; pdf?: string }>> = {
    metrics: [
      { doc: 'JBBL 2016 + 10th Amendment 2024', clause: 'Schedule III — RRDA Jurisdiction · FAR & Coverage Table', desc: 'Plot area and maximum built-up area derived from plot-size-based FAR. District & Commercial Centre: FAR 2.25 · Core / Inner Zone: FAR 2.0 · General Zone: FAR 1.75. Ground coverage: 55% for plots ≤ 1,000 sqm; 45% for larger plots. Lower than RMC urban norms — peri-urban density controls apply.', pdf: this.JBBL_PDF },
      { doc: 'JBBL 10th Amendment 2024', clause: 'RRDA Peri-Urban Controls', desc: '10th Amendment (April 2024) updated FAR and coverage norms for RRDA jurisdiction to reflect peri-urban land use.', pdf: this.JBBL_10TH_PDF },
    ],
    setbacks: [
      { doc: 'JBBL 2016', clause: 'Schedule III — RRDA Setback Tables (Residential & Commercial)', desc: 'Setbacks for RRDA peri-urban jurisdiction: simplified plot-size-based lookup × height tier (≤ 12 m / 12–16 m / > 16 m). Lower minimums on small plots than RMC urban. All values per JBBL Schedule III.', pdf: this.JBBL_PDF },
    ],
    far: [
      { doc: 'JBBL 2016 + 10th Amendment 2024', clause: 'Schedule III — FAR Table · RRDA Jurisdiction', desc: 'Zone-based FAR for RRDA peri-urban area. District & Commercial Centre: 2.25 · Core / Inner Zone: 2.0 · General Zone: 1.75. No TDR or road-width multiplier applied in RRDA jurisdiction.', pdf: this.JBBL_PDF },
    ],
    staircase: [
      { doc: 'JBBL 2016', clause: 'Part IV — Staircase & Vertical Circulation', desc: 'Staircase minimum width and count by occupancy. Lift mandatory for buildings above G+3 (more than 4 floors including ground). Same thresholds as RMC under JBBL common provisions.', pdf: this.JBBL_PDF },
    ],
    fire: [
      { doc: 'JBBL 2016', clause: 'Part V — Fire Safety · Special Building Threshold', desc: 'Special Building: height > 16 m OR ground coverage > 500 sqm. Fire Services consent required before RRDA plan sanction for Special Buildings. High-rise discouraged in peri-urban RRDA zones.', pdf: this.JBBL_PDF },
      { doc: 'NBC 2016 Part IV', clause: 'Fire & Life Safety — Chapter 4', desc: 'National Building Code fire and life safety standards applicable to all Special Buildings in RRDA jurisdiction.' },
    ],
    parking: [
      { doc: 'JBBL 2016 + 10th Amendment 2024', clause: 'Schedule III — Parking Norms · RRDA', desc: 'Parking: Residential — 1 car + 2 two-wheelers per dwelling unit (du < 50 sqm: 0.5 car). Commercial — 1.5 cars per 100 sqm + 4 two-wheelers. Parking area excluded from FAR.', pdf: this.JBBL_PDF },
    ],
    basement: [
      { doc: 'JBBL 2016', clause: 'Part III — Basement Provisions', desc: 'Basement is NOT counted towards FAR but IS counted for fee calculation. Setback from boundary must be maintained within basement footprint. One basement level permitted; additional levels require RRDA special approval.', pdf: this.JBBL_PDF },
    ],
    compliance: [
      { doc: 'JBBL 2016 + 10th Amendment 2024', clause: 'Full JBBL 2016 + Amendments', desc: 'Compliance checklist for RRDA peri-urban jurisdiction per Jharkhand Building Bye-Laws 2016 (10th Amendment 2024): setbacks, height, FAR, coverage, parking, staircase, fire safety, low-risk exemptions, agricultural land conversion, and open-space requirements.', pdf: this.JBBL_PDF },
      { doc: 'JBBL Bye-Laws Index', clause: 'All 7 PDFs', desc: 'Complete set of JBBL PDFs (2016 base + amendments 2017–2024) available on UDHD Jharkhand portal.', pdf: this.JBBL_PAGE },
    ],
  };

  openSource(section: string, event: Event): void {
    event.stopPropagation();
    this.sourceSection   = section;
    this.showSourceModal = true;
  }

  closeSourceModal(): void { this.showSourceModal = false; }

  get currentSources() {
    const map = this.form?.value?.authority === 'rrda' ? this.RRDA_SOURCES : this.RMC_SOURCES;
    return map[this.sourceSection] ?? [];
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
    const s: RanchiChatSession = {
      id: crypto.randomUUID(), title: 'New Chat',
      messages: [{ role: 'ai', text: 'Hi! I\'m your Ranchi Planning Assistant. Ask me anything about RMC zones, setbacks, FAR, fire NOC, or your calculated results.', ts: new Date().toISOString() }],
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

  private pushMessage(msg: RanchiChatMessage): void {
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