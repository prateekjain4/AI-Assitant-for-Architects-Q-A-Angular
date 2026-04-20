import { Component, OnInit, AfterViewInit, ChangeDetectorRef, NgZone, Inject, PLATFORM_ID, ViewChild, ElementRef } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
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
    far:           true,
    staircase:     true,
    fire:          true,
    compliance:    true,
    parking:       true,
    scenarios:     true,
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
    const L = await import('leaflet');
    setTimeout(() => {
      try {
        this.map = L.map('hyderabad-map', { zoomControl: true })
          .setView([this.HYD_CENTER[0], this.HYD_CENTER[1]], 13);
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

    this.http.post<any>('http://localhost:8000/planning-hyderabad', payload)
      .subscribe({
        next: (res) => this.ngZone.run(() => {
          this.result = res;
          this.openSections = {
            metrics:       true,
            setbacks:      true,
            far:           true,
            staircase:     true,
            fire:          true,
            compliance:    true,
            parking:       true,
            scenarios:     true,
            basement:      res.basement?.requested ?? false,
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

  readonly SOURCES: Record<string, Array<{ doc: string; clause: string; desc: string; pdf?: string }>> = {
    metrics: [
      { doc: 'GHMC Building Permissions Rules 2012', clause: 'Rule 5 & GO Ms.No.168', desc: 'Plot area and maximum built-up area derived from zone-based FAR. Ground coverage limits: 60% for plots ≤ 750 sqm; 55% above 750 sqm.' },
    ],
    setbacks: [
      { doc: 'GHMC Building Permissions Rules 2012', clause: 'Rule 7, Table IV', desc: 'Setbacks by plot area and building height. Front: road-width dependent. Side and rear: height-progressive.' },
    ],
    far: [
      { doc: 'AP Building Rules 2012 / GHMC Master Plan 2031', clause: 'Rule 5, Table II (GO Ms.No.168)', desc: 'Zone-based FAR per GHMC/HMDA Master Plan 2031 Zoning Regulations. Residential: R1–R5 (1.5–3.5), Commercial: C1–C3 (2.0–3.5), Mixed Use: MU1/MU2 (2.5/3.5), Industrial: I1–I4 (1.0–2.0), PSP: 1.5.' },
    ],
    staircase: [
      { doc: 'GHMC Building Permissions Rules 2012', clause: 'Rule 11', desc: 'Staircase minimum width 1.5m. Lift mandatory for buildings above 15m (G+4 and above).' },
    ],
    fire: [
      { doc: 'GHMC Building Permissions Rules 2012', clause: 'Rule 13 & NBC 2016 Part IV', desc: 'Fire NOC from GHMC mandatory for buildings above 18m height or BUA > 500 sqm for commercial.' },
    ],
    parking: [
      { doc: 'GHMC Building Permissions Rules 2012', clause: 'Rule 9, Table VI', desc: 'Parking: Residential — 1 car per unit (> 75 sqm). Commercial — 1 car per 50 sqm.' },
    ],
    basement: [
      { doc: 'GHMC Building Permissions Rules 2012', clause: 'Rule 10', desc: 'Basement not counted in FAR if used for parking only. Max 2 levels. Setback 3m from boundary.' },
    ],
    compliance: [
      { doc: 'GHMC Building Permissions Rules 2012', clause: 'Full Rules 2012', desc: 'Compliance checklist based on GHMC Building Permissions Rules 2012 and GO Ms.No.168 covering setbacks, FAR, coverage, parking, fire, and staircase.' },
    ],
    scenarios: [
      { doc: 'AP Building Rules 2012 — G.O.Ms.No.168', clause: 'Rules 5 & 7 — Tables II / III / IV', desc: 'Scenario heights anchored to AP Building Rules thresholds: 15 m (lift mandatory + commercial fire NOC), 18 m (high-rise setback table + residential fire NOC), plus a Max-FAR scenario derived from zone FAR and road-width height cap.' },
    ],
    accessibility: [
      { doc: 'AP Building Rules 2012 — Annexure-V (Rule 15.a.v)', clause: 'NBC 2005, Part-III, Clause 12.21 — pages 312–321', desc: 'Special requirements for public buildings for physically challenged. Access path min 1200mm, max gradient 1:20. Ramp max slope 1:12 (up to 9000mm). Door min clear width 900mm. Stair tread 300mm, riser max 150mm. WC min 900×1500mm, seat height 500mm. Handrail 900mm high, 40mm dia.' },
    ],
    solar: [
      { doc: 'AP Building Rules 2012', clause: 'Rule 15.a.xi (page 21) and Rule 22 (page 26)', desc: 'Solar Water Heating and Lighting mandatory for Group Housing ≥ 100 units, Hospitals, Nursing Homes, Hotels. Bank guarantee required. 10% property tax rebate for solar adoption. Rainwater harvesting mandatory for ALL buildings (G.O.Ms.No.350 MA, Dt.09.06.2000). 10% property tax rebate when BOTH water recycling and rainwater harvesting are provided.' },
    ],
    openSpace: [
      { doc: 'AP Building Rules 2012', clause: 'Rules 5.f.v, 7.a.vii, 8.g, 15.a.x', desc: 'Non-high-rise plots >750 sqm: 5% of site as organised open space (tot lot). High Rise and Group Development ≥ 4000 sqm: 10% of site open to sky + 2m green strip on all sides. Chowk/inner courtyard: min 25 sqm, 3m side. Group Housing ≥ 100 units: 3% of BUA for common amenities (shop, club, crèche, gym) per NBC 2005.' },
    ],
    sanctions: [
      { doc: 'AP Building Rules 2012', clause: 'Rules 19, 24, 25, 26 (pages 24–29)', desc: 'Building permit fee: 2% of licence fee (max Rs.10,000); no fee for parking floors. Non-high-rise valid 3 years; High Rise/GDS 5 years. Construction must commence within 18 months. OC mandatory for all buildings (except individual plots ≤100 sqm, height ≤7m). Penalties without OC: 3× utility tariff + 2× property tax annually.' },
    ],
  };

  openSource(section: string, event: Event): void {
    event.stopPropagation();
    this.sourceSection   = section;
    this.showSourceModal = true;
  }

  closeSourceModal(): void { this.showSourceModal = false; }

  get currentSources() { return this.SOURCES[this.sourceSection] ?? []; }

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

    this.http.post<any>('http://localhost:8000/chat', {
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