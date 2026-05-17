import {
  Component, OnInit, AfterViewInit, OnDestroy,
  ChangeDetectorRef, NgZone, Inject, PLATFORM_ID, ViewChild, ElementRef
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { environment } from '../../environments/environment';
import { GlobalWorkerOptions } from 'pdfjs-dist';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Subject, combineLatest } from 'rxjs';
import { debounceTime, distinctUntilChanged, filter, takeUntil, startWith } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';
import { CostDataService } from '../services/cost-data.service';
import { ValuationDataService } from '../services/valuation-data.service';
import { ScenarioComparison } from '../scenario-comparison/scenario-comparison';
import { ProjectService, ProjectSummary } from '../services/project.service';

export interface ChatMessage { role: 'user' | 'ai'; text: string; ts: string; }
export interface ChatSession  { id: string; title: string; messages: ChatMessage[]; createdAt: string; updatedAt: string; }
export interface UsageOption  { value: string; label: string; group: string; requires_space_standards: boolean; }

@Component({
  selector: 'app-bengaluru-planning',
  standalone: false,
  templateUrl: './bengaluru-planning.html',
  styleUrl: './bengaluru-planning.css',
})
export class BengaluruPlanningTool implements OnInit, AfterViewInit, OnDestroy {

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

  // ── Map marker (for zone detection + valuation page) ─────────
  markerLat: number | null = null;
  markerLng: number | null = null;

  readonly BLR_CENTER  = [12.9716, 77.5946];
  readonly STORAGE_KEY = 'blr_planning_state';

  openSections: Record<string, boolean> = {
    metrics:             true,
    sitePlan:            false,
    setbacks:            false,
    far:                 false,
    staircase:           false,
    fire:                false,
    compliance:          false,
    parking:             false,
    basement:            false,
    accessibility:       false,
    compoundWall:        false,
    scenarios:           false,
    compliance_dash:     false,
    waterProximity:      false,
    rajkaluveProximity:  false,
    bmrdaMetrics:        true,
    bmrdaSetbacks:       false,
    bmrdaFire:           false,
    bmrdaCompliance:     false,
  };

  detectedZone     = '';
  planningZone     = 'zone_A';   // 'zone_A' inside ORR, 'zone_B' outside
  bbmpWardName     = '';
  bbmpWardNo       = '';
  bbmpZone         = '';
  bbmpZoneOffice   = '';

  // ── Authority selector (BDA vs BMRDA sub-authorities) ─────────
  selectedAuthority = '';
  bmrdaResult: any  = null;

  readonly BMRDA_AUTHORITIES = [
    { value: 'anekal', label: 'Anekal LPA', endpoint: '/planning-anekal', areas: 'Anekal, Chandapura, Jigani, Bommasandra', isStub: false },
    // Hoskote, Nelamangala, Kanakapura, Ramanagara, BIAAPA — enabled when bylaws are extracted
  ];

  get selectedAuthorityInfo() {
    return this.BMRDA_AUTHORITIES.find(a => a.value === this.selectedAuthority);
  }

  onAuthorityChange(value: string): void {
    this.selectedAuthority = value;
    this.bmrdaResult = null;
    this.result = null;
    // Reset zone to the first valid option for the chosen authority set
    const defaultZone = value ? 'R' : 'R';
    this.form.patchValue({ zone: defaultZone });
  }

  // ── Dynamic usage dropdown ─────────────────────────────────────
  allowedUsages: UsageOption[] = [];
  usagesLoading = false;
  private readonly destroy$ = new Subject<void>();

  get usageGroups(): { name: string; options: UsageOption[] }[] {
    const map = new Map<string, UsageOption[]>();
    for (const opt of this.allowedUsages) {
      if (!map.has(opt.group)) map.set(opt.group, []);
      map.get(opt.group)!.push(opt);
    }
    return Array.from(map.entries()).map(([name, options]) => ({ name, options }));
  }

  get hasSpaceStdUsages(): boolean {
    return this.allowedUsages.some(u => u.requires_space_standards);
  }

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

  readonly bmrdaZones = [
    { value: 'R',   label: 'R   — Residential Zone' },
    { value: 'C',   label: 'C   — Commercial Zone' },
    { value: 'I',   label: 'I   — Industrial Zone' },
    { value: 'PSP', label: 'PSP — Public and Semi-Public Zone' },
    { value: 'PU',  label: 'PU  — Public Utilities Zone' },
    { value: 'OS',  label: 'OS  — Open Space, Parks & Playgrounds' },
    { value: 'TC',  label: 'TC  — Transport and Communication Zone' },
    { value: 'AG',  label: 'AG  — Agricultural Zone' },
  ];

  get activeZones() {
    return this.selectedAuthority ? this.bmrdaZones : this.zones;
  }

  // ── Regulatory source references ─────────────────────────────
  showSourceModal   = false;
  sourceSection     = '';

  readonly SOURCES: Record<string, Array<{ doc: string; clause: string; desc: string; pdf?: string; page?: number; searchText?: string }>> = {
    metrics: [
      { doc: 'BDA RMP 2031', clause: 'Tables 6 & 7 (Residential), Tables 12 & 13 (Commercial), Table 17 (Industrial)', desc: 'Plot area, maximum built-up area, and permissible ground coverage derived from FAR tables keyed by zone, plot size bracket, and road width bracket.', pdf: 'BDA_Zoning_Regulations.pdf', page: 18, searchText: 'Floor Area Ratio' },
    ],
    setbacks: [
      { doc: 'Bangalore Building Bye-Laws', clause: 'Rule 8', desc: 'Marginal open space (setback) regulations and relaxation provisions for corner plots.', pdf: 'Bangalore-Building-Byelaws.pdf', page: 18, searchText: 'marginal open space' },
      { doc: 'BDA RMP 2031', clause: 'Section 4.5, Table 2', desc: 'Progressive setback requirements by building height tier — front, side, and rear margins increase with height. Applies to all zones.', pdf: 'BDA_Zoning_Regulations.pdf', page: 22, searchText: 'All-round setbacks' },
    ],
    far: [
      { doc: 'BDA RMP 2031', clause: 'Tables 6 & 7', desc: 'Base FAR and TDR FAR for Residential zones (R/RM) by plot size × road width, split by Planning Zone A (within ORR) and Zone B (outside ORR).', pdf: 'BDA_Zoning_Regulations.pdf', page: 20, searchText: 'Floor Area Ratio' },
      { doc: 'BDA RMP 2031', clause: 'Tables 12 & 13', desc: 'FAR and ground coverage for Commercial zones C1–C5 by road width, for Planning Zone A and Zone B.', pdf: 'BDA_Zoning_Regulations.pdf', page: 28, searchText: 'Commercial Zone' },
      { doc: 'BDA RMP 2031', clause: 'Table 17', desc: 'FAR and coverage for Industrial zones I1–I5.', pdf: 'BDA_Zoning_Regulations.pdf', page: 34, searchText: 'Industrial Zone' },
    ],
    staircase: [
      { doc: 'Bangalore Building Bye-Laws', clause: 'Section 20.6', desc: 'Staircase width and count requirements by floor count and occupancy type.', pdf: 'Bangalore-Building-Byelaws.pdf', page: 68, searchText: 'staircase width' },
      { doc: 'BDA RMP 2031', clause: 'Section 4.9.6', desc: 'Lift mandatory above G+3. High-rise buildings must provide at least one dedicated service lift. Buildings with fewer than 24 units or < 2,400 sqm BUA may use a combined passenger + service lift.', pdf: 'BDA_Zoning_Regulations.pdf', page: 30, searchText: 'lift' },
    ],
    fire: [
      { doc: 'Bangalore Building Bye-Laws 2003', clause: 'Section 23', desc: 'Fire safety provisions — fire exits, emergency lighting, fire extinguisher placement, and firefighting shaft requirements per BBMP Bye-Laws 2003.', pdf: 'Bangalore-Building-Byelaws.pdf', page: 82, searchText: 'fire safety' },
      { doc: 'NBC 2016 Part IV', clause: 'Fire & Life Safety — Chapter 4', desc: 'Fire NOC trigger heights and built-up area thresholds by occupancy. Tender access road width (7m min), height clearance, turning radius. Refuge area every 15th floor.', pdf: 'NBC2016_Fire_Safety.pdf', page: 12, searchText: 'Fire NOC' },
      { doc: 'BDA RMP 2031', clause: 'Section 4.11', desc: 'Non-residential buildings with BUA above 5,000 sqm require firefighting arrangements per Authority directions, irrespective of height.', pdf: 'BDA_Zoning_Regulations.pdf', page: 35, searchText: 'firefighting' },
    ],
    parking: [
      { doc: 'Bangalore Building Bye-Laws', clause: 'Table 23 (BBMP)', desc: 'Detailed parking space standards, drive aisle widths, and EV charging mandate (5% of spaces).', pdf: 'Bangalore-Building-Byelaws.pdf', page: 85, searchText: 'parking space' },
      { doc: 'BDA RMP 2031', clause: 'Section 4.13, Table 4', desc: 'Parking requirements by use: Residential — 1 car/DU (50–120 sqm) to 1 car + extra per 120 sqm. Office — 1 car/50 sqm. Retail — 1 car/50 sqm. Hospital — 1 car/75 sqm.', pdf: 'BDA_Zoning_Regulations.pdf', page: 38, searchText: 'Parking' },
    ],
    basement: [
      { doc: 'Bangalore Building Bye-Laws 2003', clause: 'Section 18', desc: 'Basement floor regulations — permitted uses, ventilation requirements (6 ACH mechanical), fire safety provisions, and setback from boundaries.', pdf: 'Bangalore-Building-Byelaws.pdf', page: 60, searchText: 'basement' },
      { doc: 'BDA RMP 2031', clause: 'Section 4.9.2', desc: 'Basement regulations: max height above avg GL = 1.2m, max overall depth = 4.5m, up to 5 levels permitted. Setback from boundary minimum 2m. Not counted in FAR.', pdf: 'BDA_Zoning_Regulations.pdf', page: 30, searchText: 'Basement' },
    ],
    compliance: [
      { doc: 'Bangalore Building Bye-Laws', clause: 'All applicable rules', desc: 'BBMP Building Bye-Laws (amended) for structural, occupancy, and marginal open space compliance.', pdf: 'Bangalore-Building-Byelaws.pdf', page: 1, searchText: 'building' },
      { doc: 'BDA RMP 2031', clause: 'Multiple Sections (4.5, 4.9, 4.11, 4.13)', desc: 'Compliance checklist derived from BDA RMP 2031 zoning regulations covering setbacks, height, basement, lifts, parking, and fire safety.', pdf: 'BDA_Zoning_Regulations.pdf', page: 14, searchText: 'compliance' },
    ],
    accessibility: [
      { doc: 'Bangalore Building Bye-Laws 2003', clause: 'Schedule XI · Bye-law 31.0', desc: 'Mandatory for public/semi-public buildings ≥ 300 sqm covered area. Covers accessible ramps (1.80m wide, 1:10 slope), corridors (1.80m), lift cage (1100×2000mm), wheelchair toilet (1.50×1.75m), handrails at 800mm, Braille signage, and guiding floor material.', pdf: 'Bangalore-Building-Byelaws.pdf', page: 112, searchText: 'accessibility' },
    ],
    compoundWall: [
      { doc: 'Bangalore Building Bye-Laws 2003', clause: 'Section 20.8', desc: 'Front and side boundary walls max 1.5m above ground level. Rear walls max 2.0m. Corner plot walls restricted to 0.75m for 5m from intersection on each side, with rounded/chamfered corners. Barbed wire and prickly hedge prohibited on all boundaries.', pdf: 'Bangalore-Building-Byelaws.pdf', page: 72, searchText: 'compound wall' },
    ],
    scenarios: [
      { doc: 'BDA RMP 2031', clause: 'Tables 6, 7, 12, 13, 17', desc: 'Scenario comparison runs alternative height and floor configurations against the same FAR and setback tables from BDA RMP 2031.', pdf: 'BDA_Zoning_Regulations.pdf', page: 18, searchText: 'Floor Area Ratio' },
    ],
  };

  // ── PDF viewer state ──────────────────────────────────────────
  showPdfViewer  = false;
  pdfViewerUrl   = '';
  pdfCurrentPage = 1;   // physical page sent to [page] binding
  pdfPrintedPage = 1;   // document-printed page shown in badge
  pdfSearchText  = '';
  pdfDocLabel    = '';

  // Front-matter page counts per PDF (physical page 1 = printed page 1 + offset)
  // BDA: 4 blank + 6 roman-numeral + 2 unnumbered = 12 pages before printed "1"
  // BBMP: no front matter, physical matches printed
  private readonly PDF_PAGE_OFFSETS: Record<string, number> = {
    'BDA_Zoning_Regulations.pdf':     12,
    'Bangalore-Building-Byelaws.pdf':  0,
    'NBC2016_Fire_Safety.pdf':         0,
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
    const printedPage    = src.page ?? 1;
    const offset         = this.PDF_PAGE_OFFSETS[src.pdf] ?? 0;
    this.pdfViewerUrl    = this.docUrl(src.pdf);
    this.pdfPrintedPage  = printedPage;
    this.pdfCurrentPage  = printedPage + offset;
    this.pdfSearchText   = src.searchText ?? '';
    this.pdfDocLabel     = src.doc ? `${src.doc}${src.clause ? ' — ' + src.clause : ''}` : src.pdf;
    this.showPdfViewer   = true;
  }

  closePdfViewer(): void {
    this.showPdfViewer = false;
    this.pdfSearchText = '';
  }

  // Trigger PDF.js find/highlight after document loads
  onPdfLoaded(pdfProxy: any): void {
    if (!this.pdfSearchText) return;
    // PDF.js eventBus available on the pdfProxy via ng2-pdf-viewer
    try {
      const bus = (pdfProxy as any)?.eventBus ?? (pdfProxy as any)?._pdfInfo?.eventBus;
      if (bus) {
        bus.dispatch('find', {
          query: this.pdfSearchText,
          type: 'again',
          caseSensitive: false,
          findPrevious: false,
          highlightAll: true,
          phraseSearch: true,
        });
      }
    } catch { /* graceful no-op if eventBus unavailable */ }
  }

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
      city:            'bengaluru',
      zone:            this.form.value.zone,
      road_width:      this.form.value.roadWidth,
      building_height: Number(this.form.value.buildingHeight),
      locality:        'Bengaluru',
      scenarios:       this.scenarioCompRef?.scenarioData ?? null,
    };
    this.toast.info('Generating PDF report…');
    this.http.post(environment.apiUrl + '/generate-report', payload, { responseType: 'blob' })
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

    this.http.post<any>(environment.apiUrl + '/chat', {
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
    private valData:        ValuationDataService,
    private projectService: ProjectService,
    @Inject(PLATFORM_ID) platformId: object,
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
    GlobalWorkerOptions.workerSrc = 'assets/pdf.worker.min.mjs';
    if (this.isBrowser) this.loadSessions();
  }

  ngOnInit(): void {
    this.form = this.fb.group({
      zone:           ['R', Validators.required],
      plotLength:     [''],
      plotWidth:      [''],
      plotAreaSqm:    [''],
      roadWidth:      ['', Validators.required],
      buildingHeight: [''],
      usage:          ['residential'],
      cornerPlot:     ['false'],
      basement:       ['false'],
      floorHeight:    [3.2],
    });

    // ── Dynamic usage dropdown: reload when zone or road width changes ──
    const zone$      = this.form.get('zone')!.valueChanges.pipe(
      startWith(this.form.value.zone),
      distinctUntilChanged(),
    );
    const roadWidth$ = this.form.get('roadWidth')!.valueChanges.pipe(
      startWith(this.form.value.roadWidth),
      debounceTime(400),
      distinctUntilChanged(),
    );

    combineLatest([zone$, roadWidth$])
      .pipe(
        filter(([zone, road]) => !!zone && !!road && Number(road) > 0),
        takeUntil(this.destroy$),
      )
      .subscribe(([zone, road]) => this.loadAllowedUsages(zone, Number(road)));
  }

  private loadAllowedUsages(zone: string, roadWidth: number): void {
    this.usagesLoading = true;
    this.http
      .get<{ usages: UsageOption[] }>(
        `${environment.apiUrl}/permissible-usages?zone=${zone}&road_width=${roadWidth}`
      )
      .subscribe({
        next: (res) => {
          this.allowedUsages = res.usages;
          // If the currently selected usage is no longer allowed, reset to first option
          const current = this.form.value.usage;
          const stillValid = this.allowedUsages.some(u => u.value === current);
          if (!stillValid && this.allowedUsages.length) {
            this.form.patchValue({ usage: this.allowedUsages[0].value }, { emitEvent: false });
          }
          this.usagesLoading = false;
          this.cdr.detectChanges();
        },
        error: () => {
          // On API error fall back to showing all options silently
          this.usagesLoading = false;
        },
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
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
          this.openSections = { ...this.openSections, ...saved.openSections };
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
        this.map = L.map('blr-map', { zoomControl: true })
          .setView([this.BLR_CENTER[0], this.BLR_CENTER[1]], 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
          maxZoom: 19,
        }).addTo(this.map);

        // ── Zone GeoJSON overlay ───────────────────────────────────
        const canvasRenderer = L.canvas({ padding: 0.5 });
        this.http.get<any>('assets/bangalore_zones_display.geojson').subscribe({
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
          const { lat, lng } = e.latlng;
          this.markerLat = lat;
          this.markerLng = lng;
          this.setMapMarker(lat, lng, L);
          this.detectZone(lat, lng);
        });
      } catch (err) {
        console.warn('Map init failed:', err);
      }
    }, 100);
  }

  private getZoneStyle(zoneCode: string) {
    const colours: Record<string, string> = {
      'R':   '#3b82f6',
      'RM':  '#8b5cf6',
      'C1':  '#f97316',
      'C2':  '#ef4444',
      'C3':  '#dc2626',
      'IT':  '#06b6d4',
      'PSP': '#22c55e',
      'I':   '#a16207',
      'T':   '#64748b',
      'P':   '#16a34a',
      'GB':  '#166534',
      'AG':  '#ca8a04',
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
    this.plotMarker = L.marker([lat, lng] as [number, number])
      .addTo(this.map)
      .bindPopup(`Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}`)
      .openPopup();
  }

  private detectZone(lat: number, lng: number): void {
    this.http.post<any>(environment.apiUrl + '/detect-zone', { lat, lng })
      .subscribe({
        next: (res) => this.ngZone.run(() => {
          if (res?.found && res.zone_code) {
            this.detectedZone = res.zone_code;
            this.form.patchValue({ zone: res.zone_code });
            this.selectedAuthority = '';  // BDA zone detected — clear BMRDA authority
            this.bmrdaResult = null;
          }
          this.planningZone   = res?.planning_zone   ?? 'zone_A';
          this.bbmpWardName   = res?.bbmp_ward_name   ?? '';
          this.bbmpWardNo     = res?.bbmp_ward_no     ?? '';
          this.bbmpZone       = res?.bbmp_zone        ?? '';
          this.bbmpZoneOffice = res?.bbmp_zone_office ?? '';
          this.cdr.detectChanges();
        }),
        error: () => {},
      });
  }

  toggleSection(key: string): void {
    this.openSections[key] = !this.openSections[key];
  }

  // ── Compliance dashboard ───────────────────────────────────────
  get complianceItems(): { label: string; status: 'ok' | 'warn' | 'error'; note: string }[] {
    if (!this.result) return [];
    const r = this.result;
    const floors = r.staircase?.num_floors ?? 0;
    const cars   = r.parking?.required?.cars ?? 0;
    return [
      {
        label: 'Setbacks',
        status: 'ok',
        note: `Front ${r.setbacks?.front}m · Side ${r.setbacks?.side}m · Rear ${r.setbacks?.rear}m`,
      },
      {
        label: 'Fire NOC',
        status: r.fire_data?.noc_required ? 'warn' : 'ok',
        note: r.fire_data?.noc_required
          ? 'Required — file with BBMP Fire Wing before construction'
          : 'Not required at this height / area',
      },
      {
        label: 'Lift / Elevator',
        status: r.staircase?.lift_mandatory ? 'warn' : 'ok',
        note: r.staircase?.lift_mandatory
          ? `Mandatory above G+3 (${floors} floors)`
          : 'Not mandatory at this floor count',
      },
      {
        label: 'Accessibility',
        status: r.accessibility?.required ? 'warn' : 'ok',
        note: r.accessibility?.required
          ? 'Ramp, accessible toilet & guiding floor required'
          : 'Not mandatory for this usage/area',
      },
      {
        label: 'Progressive Setbacks',
        status: floors > 4 ? 'warn' : 'ok',
        note: floors > 4
          ? 'BDA Table 2 applies — setbacks increase above 15 m'
          : 'Standard setbacks apply at this height',
      },
      {
        label: 'Parking',
        status: 'ok',
        note: `${cars} car space${cars !== 1 ? 's' : ''} required`,
      },
    ];
  }

  // ── FAR utilised at current floor count ───────────────────────
  get farUtilisedPct(): string {
    if (!this.result) return '0';
    const floors    = this.result.staircase?.num_floors ?? 0;
    const maxBuilt  = this.result.max_built_area ?? 0;
    const far       = this.result.far ?? 1;
    const plotArea  = this.result.plot_area ?? 0;
    const footprint = (this.result.ground_coverage_pct / 100) * plotArea;
    const actual    = Math.min(floors * footprint, maxBuilt);
    return Math.round((actual / maxBuilt) * 100).toString();
  }

  onPlotAreaInput(): void {
    if (Number(this.form.value.plotAreaSqm) > 0) {
      this.form.patchValue({ plotLength: '', plotWidth: '' }, { emitEvent: false });
    }
  }

  onPlotDimInput(): void {
    if (Number(this.form.value.plotLength) > 0 || Number(this.form.value.plotWidth) > 0) {
      this.form.patchValue({ plotAreaSqm: '' }, { emitEvent: false });
    }
  }

  // ── Site plan dimensions — fall back to area-derived estimate when only sqm is entered ──
  get sitePlanLength(): number {
    const l = Number(this.form.value.plotLength);
    if (l > 0) return l;
    const area = Number(this.form.value.plotAreaSqm);
    if (area > 0) return +Math.sqrt(area * 1.333).toFixed(1);
    return 20;
  }

  get sitePlanWidth(): number {
    const w = Number(this.form.value.plotWidth);
    if (w > 0) return w;
    const area = Number(this.form.value.plotAreaSqm);
    if (area > 0) return +Math.sqrt(area * 0.75).toFixed(1);
    return 15;
  }

  // ── Setback SVG scale helpers ──────────────────────────────────
  get frontPx(): number { return Math.min(58, (this.result?.setbacks?.front ?? 0) * 8); }
  get rearPx():  number { return Math.min(38, (this.result?.setbacks?.rear  ?? 0) * 8); }
  get sidePx():  number { return Math.min(38, (this.result?.setbacks?.side  ?? 0) * 8); }

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
    this.markerLat = result.lat;
    this.markerLng = result.lng;
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

    const v = this.form.value;
    const hasDims  = Number(v.plotLength) > 0 && Number(v.plotWidth) > 0;
    const hasSqm   = Number(v.plotAreaSqm) > 0;
    if (!hasDims && !hasSqm) {
      this.errorMessage = 'Enter Plot Length & Width, or Plot Area in sqm.';
      return;
    }

    this.loading = true;
    this.result  = null;
    this.bmrdaResult = null;

    if (this.selectedAuthority) {
      this._submitBmrda(v, hasDims, hasSqm);
    } else {
      this._submitBda(v, hasDims, hasSqm);
    }
  }

  private _submitBda(v: any, hasDims: boolean, hasSqm: boolean): void {
    const payload: any = {
      zone:             v.zone,
      plot_length:      hasSqm ? null : (Number(v.plotLength) || null),
      plot_width:       hasSqm ? null : (Number(v.plotWidth)  || null),
      plot_area_sqft:   hasSqm ? Number(v.plotAreaSqm) * 10.764 : null,
      coordinates:      (this.markerLat != null && this.markerLng != null)
                          ? [{ lat: this.markerLat, lng: this.markerLng }]
                          : [],
      road_width:       Number(v.roadWidth),
      building_height:  Number(v.buildingHeight),
      usage:            v.usage || 'residential',
      corner_plot:      v.cornerPlot === 'true',
      basement:         v.basement  === 'true',
      floor_height:     Number(v.floorHeight) || 3.2,
      locality:         'Bengaluru',
      planning_zone:    this.planningZone,
    };

    this.http.post<any>(environment.apiUrl + '/planning', payload)
      .subscribe({
        next: (res) => this.ngZone.run(() => {
          this.result = res;
          this.openSections = {
            metrics:             true,
            sitePlan:            false,
            setbacks:            false,
            far:                 false,
            staircase:           false,
            fire:                false,
            compliance:          false,
            parking:             false,
            basement:            false,
            accessibility:       false,
            compoundWall:        false,
            scenarios:           false,
            compliance_dash:     false,
            waterProximity:      !!res.water_proximity?.in_buffer_zone,
            rajkaluveProximity:  !!res.rajkaluve_proximity?.in_buffer_zone,
            bmrdaMetrics:        true,
            bmrdaSetbacks:       false,
            bmrdaFire:           false,
            bmrdaCompliance:     false,
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

  private _submitBmrda(v: any, hasDims: boolean, hasSqm: boolean): void {
    // BMRDA endpoints require plot_length + plot_width (no sqft / coordinates)
    let plotLength = hasDims ? Number(v.plotLength) : Math.sqrt(Number(v.plotAreaSqm) * 1.333);
    let plotWidth  = hasDims ? Number(v.plotWidth)  : Math.sqrt(Number(v.plotAreaSqm) * 0.75);
    plotLength = +plotLength.toFixed(2);
    plotWidth  = +plotWidth.toFixed(2);

    const authority = this.selectedAuthorityInfo!;
    const payload: any = {
      zone:             v.zone,
      plot_length:      plotLength,
      plot_width:       plotWidth,
      road_width:       Number(v.roadWidth),
      building_height:  Number(v.buildingHeight),
      usage:            v.usage || 'residential',
      corner_plot:      v.cornerPlot === 'true',
      basement:         v.basement  === 'true',
      floor_height:     Number(v.floorHeight) || 3.2,
      locality:         authority.label.split('(')[0].trim(),
    };

    this.http.post<any>(environment.apiUrl + authority.endpoint, payload)
      .subscribe({
        next: (res) => this.ngZone.run(() => {
          this.bmrdaResult = res;
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
      builtUpSqm:      +(this.result.max_built_area),
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
      plotAreaSqft:     +(this.result.plot_area * 10.764),
      far:              this.result.far,
      farBase:          this.result.far_base,
      farTdr:           this.result.far_tdr,
      maxBuiltSqft:     +(this.result.max_built_area * 10.764),
      planningZone:     this.result.planning_zone || 'zone_A',
      roadWidth:        +(v.roadWidth || 9),
      groundCovPct:     this.result.ground_coverage_pct,
      scenarios:        this.scenarioCompRef?.scenarioData?.scenarios || [],
    });
    this.router.navigate(['/cost-analysis']);
  }

  openMarketValuation(): void {
    if (!this.result) return;
    const v = this.form.value;
    this.valData.set({
      city:                  'bengaluru',
      zone:                  v.zone  || 'R',
      usage:                 v.usage || 'residential',
      maxBuiltSqm:           +(this.result.max_built_area || 0),
      numFloors:              this.result.staircase?.num_floors || 1,
      plotAreaSqm:           +(this.result.plot_area || 0),
      totalConstructionCost:  0,
      lat:                    this.markerLat,
      lng:                    this.markerLng,
      plotLengthM:           +(v.plotLength || 0),
      plotWidthM:            +(v.plotWidth  || 0),
      roadWidth:             +(v.roadWidth  || 0),
      planningZone:           this.planningZone,
      far:                    this.result.far || 0,
      locality:               'Bengaluru',
    });
    this.router.navigate(['/market-valuation']);
  }

  goToCities(): void {
    this.router.navigate(['/planning']);
  }
}