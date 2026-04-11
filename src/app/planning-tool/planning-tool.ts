import { Component, OnInit, ChangeDetectorRef, ViewChild, ElementRef, NgZone, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {FormBuilder, FormGroup, Validators} from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { MapData } from '../services/map-data';
import { CostEstimator } from '../cost-estimator/cost-estimator';
import { ScenarioComparison } from '../scenario-comparison/scenario-comparison';

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
export class PlanningTool implements OnInit {
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
  
  // ── Accordion state for result sections ───────────────────────
  openSections: Record<string, boolean> = {
    metrics:       true,
    setbacks:      true,
    far:           true,
    staircase:     true,
    projections:   false,
    basement:      false,
    fire:          true,
    compliance:    true,
    designOptions: true,
    tdr:           false,
    approval:      true,
    watchOut:      true,
    scenarios:     true,
    parking:       true,
    sitePlan:      true,
    cost:          true,
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
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
    if (this.isBrowser) this.loadSessions();
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

    this.http.post('http://localhost:8000/generate-report', payload, {
      responseType: 'blob'
    }).subscribe(blob => {
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `planning-report-${payload.locality || 'bangalore'}-${Date.now()}.pdf`;
      anchor.click();
      window.URL.revokeObjectURL(url);
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
      planning_data: this.result || null,
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
              far:        true,
              staircase:  true,
              projections:false,
              basement:   response.basement?.requested ?? false,
              fire:       true,
              compliance: true,
              scenarios:  true,
              parking:    true,
              sitePlan:   true,
              cost:       true,
            };
            
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
