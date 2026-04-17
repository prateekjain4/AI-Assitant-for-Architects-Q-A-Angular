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
    metrics:    true,
    setbacks:   true,
    far:        true,
    staircase:  true,
    fire:       true,
    compliance: true,
    parking:    true,
    basement:   false,
  };

  readonly zones = [
    { value: 'R1', label: 'R1 — Residential (Low Density, FAR 1.5)' },
    { value: 'R2', label: 'R2 — Residential (Medium Density, FAR 2.0)' },
    { value: 'R3', label: 'R3 — Residential (High Density, FAR 2.5)' },
    { value: 'C1', label: 'C1 — Commercial Local (FAR 2.0)' },
    { value: 'C2', label: 'C2 — Commercial Intermediate (FAR 2.5)' },
    { value: 'MU', label: 'MU — Mixed Use (FAR 2.5)' },
    { value: 'I',  label: 'I  — Industrial (FAR 1.5)' },
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
            metrics:    true,
            setbacks:   true,
            far:        true,
            staircase:  true,
            fire:       true,
            compliance: true,
            parking:    true,
            basement:   res.basement?.requested ?? false,
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
      { doc: 'GHMC Building Permissions Rules 2012', clause: 'Rule 5, Table II (GO Ms.No.168)', desc: 'Zone-based FAR. R1: 1.5, R2: 2.0, R3: 2.5, C1: 2.0, C2/MU: 2.5, Industrial: 1.5.' },
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