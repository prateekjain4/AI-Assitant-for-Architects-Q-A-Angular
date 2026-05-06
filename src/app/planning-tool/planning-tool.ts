import { Component, OnInit, AfterViewInit, ChangeDetectorRef, ViewChild, ElementRef, NgZone, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {FormBuilder, FormGroup, Validators} from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { MapData } from '../services/map-data';
import { CostEstimator } from '../cost-estimator/cost-estimator';
import { ScenarioComparison } from '../scenario-comparison/scenario-comparison';
import { ProjectService, ProjectSummary } from '../services/project.service';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';
import { CostDataService, PlanningState } from '../services/cost-data.service';

// ── Chat session types ────────────────────────────────────────────
export interface ChatMessage {
  role: 'user' | 'ai';
  text: string;
  ts:   string; // ISO timestamp
}

export interface ChatSession {
  id:        string;
  title:     string;  // first user message (truncated)
  messages:  ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

@Component({
  selector: 'app-planning-tool',
  standalone: false,
  templateUrl: './planning-tool.html',
  styleUrl: './planning-tool.css',
})
export class PlanningTool implements OnInit, AfterViewInit {
  @ViewChild('chatBody', { static: false }) chatBody?: ElementRef;
  @ViewChild('costEstimatorRef') costEstimatorRef?: CostEstimator;
  @ViewChild('scenarioCompRef') scenarioCompRef?: ScenarioComparison;

  plotCalculator: FormGroup = new FormGroup({});

  result: any = null;
  loading: boolean = false;
  errorMessage: string = '';
  chatInput: string = '';
  chatLoading: boolean = false;
  chatOpen: boolean = false;

  // ── Chat session state ────────────────────────────────────────
  chatSessions:  ChatSession[] = [];
  activeChatId:  string = '';
  historyOpen:   boolean = false;

  private readonly SESSIONS_KEY = 'bylaw_chat_sessions';
  private readonly isBrowser: boolean;

  get activeSession(): ChatSession | undefined {
    return this.chatSessions.find(s => s.id === this.activeChatId);
  }

  get activeMessages(): ChatMessage[] {
    return this.activeSession?.messages ?? [];
  }
  
  // ── Saved projects ────────────────────────────────────────────
  projectsOpen     = false;
  saveModalOpen    = false;
  projectName      = '';
  projectSaving    = false;
  projectSaveMsg   = '';
  savedProjects:   ProjectSummary[] = [];
  projectsLoading  = false;

  toggleProjects() {
    this.projectsOpen = !this.projectsOpen;
    if (this.projectsOpen) this.loadProjects();
  }

  openSaveModal() {
    const locality = this.mapData.getDetectedZone()?.locality || '';
    const zone     = this.plotCalculator.value.zoneDetails || '';
    this.projectName  = locality ? `${locality} — ${zone}` : zone;
    this.projectSaveMsg = '';
    this.saveModalOpen  = true;
  }

  closeSaveModal() { this.saveModalOpen = false; }

  saveProject() {
    if (!this.projectName.trim() || !this.result) return;
    this.projectSaving = true;
    this.projectService.save({
      name:            this.projectName.trim(),
      zone:            this.plotCalculator.value.zoneDetails || '',
      locality:        this.mapData.getDetectedZone()?.locality || '',
      plot_inputs:     this.plotCalculator.value,
      planning_result: this.result,
      cost_estimate:   this.costEstimatorRef?.result ?? {},
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

  loadProjects() {
    this.projectsLoading = true;
    this.projectService.list().subscribe({
      next:  (list) => { this.savedProjects = list; this.projectsLoading = false; },
      error: ()     => { this.projectsLoading = false; },
    });
  }

  loadProject(id: number) {
    this.projectService.get(id).subscribe({
      next: (p) => {
        this.result = p.planning_result;
        this.plotCalculator.patchValue(p.plot_inputs);
        this.projectsOpen = false;
        this.cdr.detectChanges();
      },
    });
  }

  deleteProject(id: number, event: Event) {
    event.stopPropagation();
    this.projectService.delete(id).subscribe(() => {
      this.savedProjects = this.savedProjects.filter(p => p.id !== id);
    });
  }

  // ── Indian cities drawer ──────────────────────────────────────
  cityDrawerOpen = false;
  toggleCityDrawer() { this.cityDrawerOpen = !this.cityDrawerOpen; }

  navigateCity(city: { name: string; active: boolean }) {
    if (!city.active) return;
    this.cityDrawerOpen = false;
    if (city.name === 'Bengaluru') {
      this.router.navigate(['/bengaluru']);
    } else if (city.name === 'Ranchi') {
      this.router.navigate(['/ranchi']);
    } else if (city.name === 'Hyderabad') {
      this.router.navigate(['/hyderabad']);
    }
  }

  readonly cities = [
    { name: 'Bengaluru',       state: 'Karnataka',       active: true  },
    { name: 'Ranchi',          state: 'Jharkhand',       active: true  },
    { name: 'Mumbai',          state: 'Maharashtra',     active: false },
    { name: 'Delhi',           state: 'Delhi',           active: false },
    { name: 'Chennai',         state: 'Tamil Nadu',      active: false },
    { name: 'Hyderabad',       state: 'Telangana',       active: true  },
    { name: 'Pune',            state: 'Maharashtra',     active: false },
    { name: 'Kolkata',         state: 'West Bengal',     active: false },
    { name: 'Ahmedabad',       state: 'Gujarat',         active: false },
    { name: 'Jaipur',          state: 'Rajasthan',       active: false },
    { name: 'Surat',           state: 'Gujarat',         active: false },
    { name: 'Lucknow',         state: 'Uttar Pradesh',   active: false },
    { name: 'Kanpur',          state: 'Uttar Pradesh',   active: false },
    { name: 'Nagpur',          state: 'Maharashtra',     active: false },
    { name: 'Indore',          state: 'Madhya Pradesh',  active: false },
    { name: 'Thane',           state: 'Maharashtra',     active: false },
    { name: 'Bhopal',          state: 'Madhya Pradesh',  active: false },
    { name: 'Visakhapatnam',   state: 'Andhra Pradesh',  active: false },
    { name: 'Patna',           state: 'Bihar',           active: false },
    { name: 'Vadodara',        state: 'Gujarat',         active: false },
    { name: 'Ludhiana',        state: 'Punjab',          active: false },
    { name: 'Agra',            state: 'Uttar Pradesh',   active: false },
    { name: 'Nashik',          state: 'Maharashtra',     active: false },
    { name: 'Faridabad',       state: 'Haryana',         active: false },
    { name: 'Meerut',          state: 'Uttar Pradesh',   active: false },
    { name: 'Rajkot',          state: 'Gujarat',         active: false },
    { name: 'Varanasi',        state: 'Uttar Pradesh',   active: false },
    { name: 'Srinagar',        state: 'J & K',           active: false },
    { name: 'Aurangabad',      state: 'Maharashtra',     active: false },
    { name: 'Amritsar',        state: 'Punjab',          active: false },
    { name: 'Navi Mumbai',     state: 'Maharashtra',     active: false },
    { name: 'Prayagraj',       state: 'Uttar Pradesh',   active: false },
    { name: 'Howrah',          state: 'West Bengal',     active: false },
    { name: 'Guwahati',        state: 'Assam',           active: false },
    { name: 'Chandigarh',      state: 'Punjab',          active: false },
    { name: 'Coimbatore',      state: 'Tamil Nadu',      active: false },
    { name: 'Kochi',           state: 'Kerala',          active: false },
    { name: 'Thiruvananthapuram', state: 'Kerala',       active: false },
    { name: 'Mysuru',          state: 'Karnataka',       active: false },
    { name: 'Gurgaon',         state: 'Haryana',         active: false },
    { name: 'Noida',           state: 'Uttar Pradesh',   active: false },
  ];

  // ── Accordion state for result sections ───────────────────────
  openSections: Record<string, boolean> = {
    metrics:       true,
    setbacks:      true,
    far:           false,
    staircase:     false,
    projections:   false,
    basement:      false,
    fire:          false,
    compliance:    false,
    designOptions: false,
    tdr:           false,
    approval:      false,
    watchOut:      false,
    scenarios:     false,
    parking:       false,
    sitePlan:      false,
    cost:          false,
  };
 
  toggleSection(key: string) {
    this.openSections[key] = !this.openSections[key];
  }

  private scrollToBottom() {
    const body = this.chatBody?.nativeElement;
    if (!body) {
      return;
    }

    setTimeout(() => {
      body.scrollTop = body.scrollHeight;
    }, 25);
  }

  constructor(
    private fb: FormBuilder,
    private http: HttpClient,
    public mapData: MapData,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
    @Inject(PLATFORM_ID) platformId: object,
    private projectService: ProjectService,
    public auth: AuthService,
    private toast: ToastService,
    private router: Router,
    private costData: CostDataService,
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
    if (this.isBrowser) this.loadSessions();
  }

  openCostAnalysis() {
    if (!this.result) return;
    const v = this.plotCalculator.value;
    this.costData.set({
      plotLengthM:     +(v.plotLength  || 20),
      plotWidthM:      +(v.plotWidth   || 15),
      builtUpSqm:      +(this.result.max_built_area / 10.764),
      numFloors:        this.result.staircase?.num_floors || 3,
      floorHeightM:    +(v.floorHeight  || 3.2),
      setbackFront:     this.result.setbacks?.front  || 3,
      setbackSide:      this.result.setbacks?.side   || 1.5,
      setbackRear:      this.result.setbacks?.rear   || 1.5,
      usage:            v.usage || 'residential',
      zone:             v.zoneDetails || 'RM',
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

  // ── Chat session management ───────────────────────────────────

  toggleChat(): void {
    this.chatOpen = !this.chatOpen;
    if (this.chatOpen) {
      if (!this.activeChatId || !this.activeSession) this.createNewSession();
    }
  }

  toggleHistory(): void {
    this.historyOpen = !this.historyOpen;
  }

  newChat(): void {
    this.createNewSession();
    this.historyOpen = false;
  }

  switchSession(id: string): void {
    this.activeChatId = id;
    this.historyOpen  = false;
    setTimeout(() => this.scrollToBottom(), 50);
  }

  deleteSession(id: string, event?: Event): void {
    event?.stopPropagation();
    this.chatSessions = this.chatSessions.filter(s => s.id !== id);
    this.saveSessions();
    if (this.activeChatId === id) {
      if (this.chatSessions.length > 0) {
        this.activeChatId = this.chatSessions[0].id;
      } else {
        this.createNewSession();
      }
    }
  }

  deleteCurrentChat(): void {
    if (this.activeChatId) this.deleteSession(this.activeChatId);
  }

  private createNewSession(): void {
    const session: ChatSession = {
      id:        crypto.randomUUID(),
      title:     'New Chat',
      messages:  [{
        role: 'ai',
        text: 'Hi! I\'m your Planning Assistant. Ask me anything about zoning, setbacks, FAR, or your project.',
        ts:   new Date().toISOString(),
      }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.chatSessions.unshift(session);
    this.activeChatId = session.id;
    this.saveSessions();
  }

  private saveSessions(): void {
    if (!this.isBrowser) return;
    // Keep only last 20 sessions
    this.chatSessions = this.chatSessions.slice(0, 20);
    localStorage.setItem(this.SESSIONS_KEY, JSON.stringify(this.chatSessions));
  }

  private loadSessions(): void {
    try {
      const raw = localStorage.getItem(this.SESSIONS_KEY);
      this.chatSessions = raw ? JSON.parse(raw) : [];
    } catch {
      this.chatSessions = [];
    }
  }

  private pushMessage(msg: ChatMessage): void {
    const session = this.activeSession;
    if (!session) return;
    session.messages.push(msg);
    session.updatedAt = new Date().toISOString();
    // Use first user message as title
    if (msg.role === 'user' && session.title === 'New Chat') {
      session.title = msg.text.length > 40 ? msg.text.slice(0, 40) + '…' : msg.text;
    }
    this.saveSessions();
  }
  
  ngOnInit(): void {
    this.plotCalculator = this.fb.group({
      zoneDetails: ['', Validators.required],
      plotLength: [''],
      plotWidth: [''],
      roadWidth: ['', Validators.required],
      buildingHeight: ['', Validators.required],
      usage: [''],
      // new fields
      cornerPlot:     ['false'],
      basement:       ['false'],
      floorHeight:    [3.2],
    });



    setInterval(() => {
      const zone = this.mapData.getDetectedZone();
      if (zone?.zone_code && zone.zone_code !== this.plotCalculator.value.zoneDetails) {
        this.ngZone.run(() => {
        this.plotCalculator.patchValue({ zoneDetails: zone.zone_code });
        this.cdr.detectChanges();
        });
      }
    }, 500);

  }

  ngAfterViewInit(): void {
    // Restore last planning result after the view is fully initialized
    try {
      const raw = localStorage.getItem("bylaw_planning_state");
      if (raw) {
        const saved = JSON.parse(raw);
        this.plotCalculator.patchValue(saved.formValues);
        this.result = saved.result;
        this.openSections = saved.openSections;
        this.cdr.detectChanges();
      }
    } catch (_) {}
  }

  downloadReport() {
    const payload = {
      ...this.result,
      zone: this.plotCalculator.value.zoneDetails,
      road_width: this.plotCalculator.value.roadWidth,
      building_height: Number(this.plotCalculator.value.buildingHeight),
      locality: this.mapData.getDetectedZone()?.locality || '',
      ward: this.mapData.getDetectedZone()?.ward || '',
      confidence: this.mapData.getDetectedZone()?.confidence || 'approximate',
      cost_estimate: this.costEstimatorRef?.result ?? null,
      scenarios: this.scenarioCompRef?.scenarioData ?? null,
    };

    this.toast.info('Generating PDF report…');
    this.http.post('http://localhost:8000/generate-report', payload, {
      responseType: 'blob'
    }).subscribe({
      next: blob => {
        const url = window.URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `planning-report-${payload.locality || 'bangalore'}-${Date.now()}.pdf`;
        anchor.click();
        window.URL.revokeObjectURL(url);
        this.toast.success('Report downloaded!');
      },
      error: () => this.toast.error('Failed to generate report. Please try again.'),
    });
  }

  sendMessage() {
    const text = this.chatInput.trim();
    if (!text || this.chatLoading) return;

    this.pushMessage({ role: 'user', text, ts: new Date().toISOString() });
    this.chatInput  = '';
    this.chatLoading = true;
    this.scrollToBottom();

    this.http.post<any>('http://localhost:8000/chat', {
      question:      text,
      planning_data:   this.result || null,
      scenario_data:   this.scenarioCompRef?.scenarioData || null,
      cost_estimate:   this.costEstimatorRef?.result || null,
    }).subscribe({
      next: (res) => {
        this.ngZone.run(() => {
          const aiText = res?.answer ?? res?.text ?? JSON.stringify(res);
          this.pushMessage({ role: 'ai', text: aiText, ts: new Date().toISOString() });
          this.chatLoading = false;
          this.cdr.detectChanges();
          this.scrollToBottom();
        });
      },
      error: () => {
        this.ngZone.run(() => {
          this.pushMessage({ role: 'ai', text: 'Sorry, I could not reach the server. Please try again.', ts: new Date().toISOString() });
          this.chatLoading = false;
          this.cdr.detectChanges();
          this.scrollToBottom();
        });
      },
    });
  }

  onSubmit() {

    if (this.plotCalculator.invalid) {
      this.plotCalculator.markAllAsTouched();
      return;
    }

    this.loading = true;
    this.result = null;

    const coordinates = this.mapData.getPlotCoordinates();
    const detectedZone = this.mapData.getDetectedZone();
    const payload = {
      zone: this.plotCalculator.value.zoneDetails,
      plot_length: Number(this.plotCalculator.value.plotLength),
      plot_width: Number(this.plotCalculator.value.plotWidth),
      coordinates: coordinates,
      road_width: Number(this.plotCalculator.value.roadWidth),
      building_height: Number(this.plotCalculator.value.buildingHeight),
      usage: this.plotCalculator.value.usage,
      corner_plot:     this.plotCalculator.value.cornerPlot === 'true',
      basement:        this.plotCalculator.value.basement === 'true',
      floor_height:    Number(this.plotCalculator.value.floorHeight) || 3.2,
      locality:        detectedZone?.locality || '',
      ward:            detectedZone?.ward || '',
    };
    console.log(payload);
    this.http.post('http://localhost:8000/planning', payload)
      .subscribe({
        next: (response: any) => {
          this.ngZone.run(() => {
            this.result = { ...response };
            this.mapData.setPlanningResult(response);
            // Open key sections by default
            this.openSections = {
              metrics:    true,
              setbacks:   true,
              far:        false,
              staircase:  false,
              projections:false,
              basement:   false,
              fire:       false,
              compliance: false,
              scenarios:  false,
              parking:    false,
              sitePlan:   false,
              cost:       false,
            };
            // Persist so state survives navigation to /cost-analysis and back
            try {
              localStorage.setItem("bylaw_planning_state", JSON.stringify({
                formValues:   this.plotCalculator.value,
                result:       this.result,
                openSections: this.openSections,
              }));
            } catch (_) {}
            this.loading = false;
            this.errorMessage = '';
            this.cdr.detectChanges();
            console.log('Planning response:', this.result);
          });
        },
        error: (error) => {
          this.ngZone.run(() => {
            console.error('Planning API error:', error);
            this.errorMessage = 'Failed to calculate regulations.';
            this.toast.error('Failed to calculate regulations. Check your inputs and try again.');
            this.loading = false;
            this.cdr.detectChanges();
          });
        },
        complete: () => {
          this.ngZone.run(() => {
            if (this.loading) {
              this.loading = false;
              this.cdr.detectChanges();
            }
            console.log('Planning request completed.');
          });
        }
      });

  }

}
