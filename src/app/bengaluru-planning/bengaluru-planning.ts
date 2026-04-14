import {
  Component, OnInit, AfterViewInit,
  ChangeDetectorRef, NgZone, Inject, PLATFORM_ID, ViewChild, ElementRef
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';
import { CostDataService } from '../services/cost-data.service';
import { ScenarioComparison } from '../scenario-comparison/scenario-comparison';
import { ProjectService, ProjectSummary } from '../services/project.service';

export interface ChatMessage { role: 'user' | 'ai'; text: string; ts: string; }
export interface ChatSession  { id: string; title: string; messages: ChatMessage[]; createdAt: string; updatedAt: string; }

@Component({
  selector: 'app-bengaluru-planning',
  standalone: false,
  templateUrl: './bengaluru-planning.html',
  styleUrl: './bengaluru-planning.css',
})
export class BengaluruPlanningTool implements OnInit, AfterViewInit {

  @ViewChild('scenarioCompRef') scenarioCompRef?: ScenarioComparison;
  @ViewChild('blrChatBody', { static: false }) chatBodyRef?: ElementRef;

  // ── Chat ──────────────────────────────────────────────────────
  chatOpen      = false;
  historyOpen   = false;
  chatInput     = '';
  chatLoading   = false;
  chatSessions: ChatSession[] = [];
  activeChatId  = '';
  private readonly CHAT_KEY = 'blr_chat_sessions';

  get activeSession(): ChatSession | undefined {
    return this.chatSessions.find(s => s.id === this.activeChatId);
  }
  get activeMessages(): ChatMessage[] { return this.activeSession?.messages ?? []; }

  form: FormGroup = new FormGroup({});
  result: any     = null;
  loading         = false;
  errorMessage    = '';

  // ── Map search ────────────────────────────────────────────────
  searchQuery   = '';
  searchResults: any[] = [];
  showDropdown  = false;
  private searchTimeout: any = null;

  private map:        any = null;
  private plotMarker: any = null;
  private readonly isBrowser: boolean;

  readonly BLR_CENTER  = [12.9716, 77.5946];
  readonly STORAGE_KEY = 'blr_planning_state';

  openSections: Record<string, boolean> = {
    metrics:    true,
    setbacks:   true,
    far:        true,
    staircase:  true,
    fire:       true,
    compliance: true,
    parking:    true,
    basement:   false,
    watchOut:   true,
    scenarios:  true,
  };

  detectedZone = '';

  readonly zones = [
    { value: 'R',   label: 'R   — Residential' },
    { value: 'RM',  label: 'RM  — Residential Mixed' },
    { value: 'C1',  label: 'C1  — Commercial (neighbourhood)' },
    { value: 'C2',  label: 'C2  — Commercial (local)' },
    { value: 'C3',  label: 'C3  — Commercial (district)' },
    { value: 'C4',  label: 'C4  — Commercial (city)' },
    { value: 'C5',  label: 'C5  — Commercial (metropolitan)' },
    { value: 'I1',  label: 'I1  — Industrial (service)' },
    { value: 'I2',  label: 'I2  — Industrial (light)' },
    { value: 'I3',  label: 'I3  — Industrial (medium)' },
    { value: 'IT',  label: 'IT  — IT / Hi-Tech Park' },
    { value: 'PSP', label: 'PSP — Public Semi-Public' },
    { value: 'T',   label: 'T   — Transportation' },
  ];

  // ── My Projects ───────────────────────────────────────────────
  projectsOpen    = false;
  saveModalOpen   = false;
  projectName     = '';
  projectSaving   = false;
  projectSaveMsg  = '';
  savedProjects:  ProjectSummary[] = [];
  projectsLoading = false;

  toggleProjects(): void {
    this.projectsOpen = !this.projectsOpen;
    if (this.projectsOpen) this.loadProjects();
  }

  openSaveModal(): void {
    if (!this.result) return;
    this.projectName   = `Bengaluru — ${this.form.value.zone || ''}`;
    this.projectSaveMsg = '';
    this.saveModalOpen  = true;
  }

  closeSaveModal(): void { this.saveModalOpen = false; }

  saveProject(): void {
    if (!this.projectName.trim() || !this.result) return;
    this.projectSaving = true;
    this.projectService.save({
      name:            this.projectName.trim(),
      zone:            this.form.value.zone || '',
      locality:        'Bengaluru',
      plot_inputs:     this.form.value,
      planning_result: this.result,
      cost_estimate:   {},
      scenarios:       this.scenarioCompRef?.scenarioData ?? {},
    }).subscribe({
      next: () => {
        this.projectSaving  = false;
        this.projectSaveMsg = 'saved';
        this.toast.success('Project saved successfully!');
        setTimeout(() => { this.saveModalOpen = false; this.projectSaveMsg = ''; }, 1200);
      },
      error: () => {
        this.projectSaving  = false;
        this.projectSaveMsg = 'error';
        this.toast.error('Failed to save project. Please try again.');
      },
    });
  }

  loadProjects(): void {
    this.projectsLoading = true;
    this.projectService.list().subscribe({
      next:  (list) => { this.savedProjects = list; this.projectsLoading = false; },
      error: ()     => { this.projectsLoading = false; },
    });
  }

  loadProject(id: number): void {
    this.projectService.get(id).subscribe({
      next: (p) => {
        this.result = p.planning_result;
        this.form.patchValue(p.plot_inputs);
        this.projectsOpen = false;
        this.cdr.detectChanges();
      },
    });
  }

  deleteProject(id: number, event: Event): void {
    event.stopPropagation();
    this.projectService.delete(id).subscribe(() => {
      this.savedProjects = this.savedProjects.filter(p => p.id !== id);
    });
  }

  downloadReport(): void {
    if (!this.result) return;
    const payload = {
      ...this.result,
      zone:            this.form.value.zone,
      road_width:      this.form.value.roadWidth,
      building_height: Number(this.form.value.buildingHeight),
      locality:        'Bengaluru',
      scenarios:       this.scenarioCompRef?.scenarioData ?? null,
    };
    this.toast.info('Generating PDF report…');
    this.http.post('http://localhost:8000/generate-report', payload, { responseType: 'blob' })
      .subscribe({
        next: blob => {
          const url    = window.URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href     = url;
          anchor.download = `planning-report-bengaluru-${Date.now()}.pdf`;
          anchor.click();
          window.URL.revokeObjectURL(url);
          this.toast.success('Report downloaded!');
        },
        error: () => this.toast.error('Failed to generate report. Please try again.'),
      });
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
    const s: ChatSession = {
      id: crypto.randomUUID(), title: 'New Chat',
      messages: [{ role: 'ai', text: 'Hi! I\'m your Bengaluru Planning Assistant. Ask me anything about BDA zones, setbacks, FAR, fire NOC, or your calculated results.', ts: new Date().toISOString() }],
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

  private pushMessage(msg: ChatMessage): void {
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
      scenario_data: this.scenarioCompRef?.scenarioData || null,
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

  constructor(
    private fb:             FormBuilder,
    private http:           HttpClient,
    private cdr:            ChangeDetectorRef,
    private ngZone:         NgZone,
    private router:         Router,
    public  auth:           AuthService,
    private toast:          ToastService,
    private costData:       CostDataService,
    private projectService: ProjectService,
    @Inject(PLATFORM_ID) platformId: object,
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
    if (this.isBrowser) this.loadSessions();
  }

  ngOnInit(): void {
    this.form = this.fb.group({
      zone:           ['R', Validators.required],
      plotLength:     ['', Validators.required],
      plotWidth:      ['', Validators.required],
      roadWidth:      ['', Validators.required],
      buildingHeight: ['', Validators.required],
      usage:          ['residential'],
      cornerPlot:     ['false'],
      basement:       ['false'],
      floorHeight:    [3.2],
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
        this.map = L.map('blr-map', { zoomControl: true })
          .setView([this.BLR_CENTER[0], this.BLR_CENTER[1]], 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
          maxZoom: 19,
        }).addTo(this.map);

        this.map.on('click', (e: any) => {
          const { lat, lng } = e.latlng;
          this.setMapMarker(lat, lng, L);
          this.detectZone(lat, lng);
        });
      } catch (err) {
        console.warn('Map init failed:', err);
      }
    }, 100);
  }

  private setMapMarker(lat: number, lng: number, L: any): void {
    if (!this.map) return;
    if (this.plotMarker) this.plotMarker.remove();
    this.plotMarker = L.marker([lat, lng] as [number, number])
      .addTo(this.map)
      .bindPopup(`Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}`)
      .openPopup();
  }

  private detectZone(lat: number, lng: number): void {
    this.http.post<any>('http://localhost:8000/detect-zone', { lat, lng })
      .subscribe({
        next: (res) => this.ngZone.run(() => {
          if (res?.found && res.zone_code) {
            this.detectedZone = res.zone_code;
            this.form.patchValue({ zone: res.zone_code });
            this.cdr.detectChanges();
          }
        }),
        error: () => {},
      });
  }

  toggleSection(key: string): void {
    this.openSections[key] = !this.openSections[key];
  }

  // ── Map search ────────────────────────────────────────────────
  onSearchInput(): void {
    const query = this.searchQuery.trim();
    if (this.searchTimeout) clearTimeout(this.searchTimeout);
    if (query.length < 3) {
      this.searchResults = [];
      this.showDropdown  = false;
      return;
    }
    this.searchTimeout = setTimeout(() => this.fetchSearchResults(query), 400);
  }

  private fetchSearchResults(query: string): void {
    const url = `https://nominatim.openstreetmap.org/search`
      + `?q=${encodeURIComponent(query + ', Bangalore')}`
      + `&format=json&limit=6`
      + `&viewbox=77.4601,12.7342,77.7814,13.1399`
      + `&bounded=1&addressdetails=1`;

    this.http.get<any[]>(url, { headers: { 'Accept-Language': 'en' } }).subscribe({
      next: (results) => this.ngZone.run(() => {
        this.searchResults = results.map(r => ({
          display_name: r.display_name.split(',').slice(0, 3).join(',').trim(),
          lat: parseFloat(r.lat),
          lng: parseFloat(r.lon),
        }));
        this.showDropdown = this.searchResults.length > 0;
        this.cdr.detectChanges();
      }),
      error: () => this.ngZone.run(() => {
        this.searchResults = [];
        this.showDropdown  = false;
      }),
    });
  }

  selectResult(result: any): void {
    this.showDropdown  = false;
    this.searchQuery   = result.display_name;
    this.searchResults = [];
    if (!this.map) return;
    this.map.flyTo([result.lat, result.lng], 16, { duration: 1.2 });
    import('leaflet').then(L => {
      this.setMapMarker(result.lat, result.lng, L);
      this.detectZone(result.lat, result.lng);
    });
  }

  onSearchBlur(): void {
    setTimeout(() => { this.showDropdown = false; this.cdr.detectChanges(); }, 200);
  }

  clearSearch(): void {
    this.searchQuery   = '';
    this.searchResults = [];
    this.showDropdown  = false;
    if (this.plotMarker && this.map) { this.plotMarker.remove(); this.plotMarker = null; }
  }

  onSubmit(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }

    this.loading = true;
    this.result  = null;
    const v = this.form.value;

    const payload = {
      zone:             v.zone,
      plot_length:      Number(v.plotLength),
      plot_width:       Number(v.plotWidth),
      coordinates:      [],
      road_width:       Number(v.roadWidth),
      building_height:  Number(v.buildingHeight),
      usage:            v.usage || 'residential',
      corner_plot:      v.cornerPlot === 'true',
      basement:         v.basement  === 'true',
      floor_height:     Number(v.floorHeight) || 3.2,
      locality:         'Bengaluru',
    };

    this.http.post<any>('http://localhost:8000/planning', payload)
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
            watchOut:   true,
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

  openCostAnalysis(): void {
    if (!this.result) return;
    const v = this.form.value;
    this.costData.set({
      plotLengthM:     +(v.plotLength  || 20),
      plotWidthM:      +(v.plotWidth   || 15),
      builtUpSqm:      +(this.result.max_built_area / 10.764),
      numFloors:        this.result.staircase?.num_floors || 3,
      floorHeightM:    +(v.floorHeight || 3.2),
      setbackFront:     this.result.setbacks?.front  || 3,
      setbackSide:      this.result.setbacks?.side   || 1.5,
      setbackRear:      this.result.setbacks?.rear   || 1.5,
      usage:            v.usage || 'residential',
      zone:             v.zone  || 'RM',
      fireNocRequired: !!this.result.fire_data?.noc_required,
      basement:         v.basement === 'true',
      carSpaces:        this.result.parking?.required?.cars || 0,
      plotAreaSqft:     this.result.plot_area,
      far:              this.result.far,
      farBase:          this.result.far_base,
      farTdr:           this.result.far_tdr,
      maxBuiltSqft:     this.result.max_built_area,
      planningZone:     this.result.planning_zone || 'zone_A',
      roadWidth:        +(v.roadWidth || 9),
      groundCovPct:     this.result.ground_coverage_pct,
      scenarios:        this.scenarioCompRef?.scenarioData?.scenarios || [],
    });
    this.router.navigate(['/cost-analysis']);
  }

  goToCities(): void {
    this.router.navigate(['/planning']);
  }
}