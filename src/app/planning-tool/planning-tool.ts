import { Component, OnInit, ChangeDetectorRef, ViewChild, ElementRef, NgZone } from '@angular/core';
import {FormBuilder, FormGroup, Validators} from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { MapData } from '../services/map-data';
@Component({
  selector: 'app-planning-tool',
  standalone: false,
  templateUrl: './planning-tool.html',
  styleUrl: './planning-tool.css',
})
export class PlanningTool implements OnInit {
  @ViewChild('chatBody', { static: false }) chatBody?: ElementRef;

  plotCalculator: FormGroup = new FormGroup({});

  result: any = null;
  loading: boolean = false;
  errorMessage: string = '';
  messages: any[] = [];
  chatInput: string = '';
  chatLoading: boolean = false;
  chatOpen: boolean = false;
  
  private scrollToBottom() {
    const body = this.chatBody?.nativeElement;
    if (!body) {
      return;
    }

    setTimeout(() => {
      body.scrollTop = body.scrollHeight;
    }, 25);
  }

  constructor(private fb: FormBuilder, private http: HttpClient, public mapData: MapData, private cdr: ChangeDetectorRef, private ngZone: NgZone) {}
  
  toggleChat(): void {
    this.chatOpen = !this.chatOpen;

    if (this.chatOpen && this.messages.length === 0) {
      this.messages.push({
        role: 'AI',
        text: 'Hi! I am your Planning Assistant. Ask anything about zoning, setbacks, FAR, or your current calculated results.'
      });
    }
  }
  
  ngOnInit(): void {
    const detectedZone = this.mapData.getDetectedZone();
    this.plotCalculator = this.fb.group({
      zoneDetails: ['', Validators.required],
      plotLength: [''],
      plotWidth: [''],
      roadWidth: ['', Validators.required],
      buildingHeight: ['', Validators.required],
      usage: [''],
      // new fields
      locality:        detectedZone?.locality ?? '',
      ward:            detectedZone?.ward ?? '',
      corner_plot:     this.plotCalculator.value.cornerPlot === 'true',
      basement:        this.plotCalculator.value.basement === 'true',
      number_of_units: Number(this.plotCalculator.value.numberOfUnits) || 1,
      property_type:   this.plotCalculator.value.propertyType || 'residential',
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
      locality: this.mapData.getDetectedZone()?.locality || '',
      ward: this.mapData.getDetectedZone()?.ward || '',
      confidence: this.mapData.getDetectedZone()?.confidence || 'approximate',
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
    if (!this.chatInput.trim()) return;
    const userMessage = this.chatInput;
    // Add user message
    this.messages.push({
      role: 'User',
      text: userMessage
    });

    this.chatInput = '';
    this.chatLoading = true;

    const payload = {
      question: userMessage,
      planning_data: this.result || null
    };

    this.http.post('http://localhost:8000/chat', payload)
      .subscribe({
        next: (res: any) => {
          this.ngZone.run(() => {
            const aiText = res?.answer ?? res?.text ?? JSON.stringify(res) ?? 'No response from server';
            this.messages.push({
              role: 'AI',
              text: aiText
            });
            console.log('Received AI response:', aiText);
            this.chatLoading = false;
            this.cdr.detectChanges();
            this.scrollToBottom();
          });
        },
        error: (err) => {
          this.ngZone.run(() => {
            console.error('Chat API error:', err);
            this.messages.push({
              role: 'AI',
              text: 'Sorry, I could not fetch your answer. Please try again.'
            });
            this.chatLoading = false;
            this.cdr.detectChanges();
            this.scrollToBottom();
          });
        },
        complete: () => {
          this.ngZone.run(() => {
            this.chatLoading = false;
            this.cdr.detectChanges();
          });
        }
      });
  }

  onSubmit() {

    if (this.plotCalculator.invalid) {
      this.plotCalculator.markAllAsTouched();
      return;
    }

    this.loading = true;
    this.result = null;

    const formData = this.plotCalculator.value;
    const coordinates = this.mapData.getPlotCoordinates();
    const payload = {
      zone: this.plotCalculator.value.zoneDetails,
      plot_length: Number(this.plotCalculator.value.plotLength),
      plot_width: Number(this.plotCalculator.value.plotWidth),
      coordinates: coordinates,
      road_width: Number(this.plotCalculator.value.roadWidth),
      building_height: Number(this.plotCalculator.value.buildingHeight),
      usage: this.plotCalculator.value.usage
    };
    console.log(payload);
    this.http.post('http://localhost:8000/planning', payload)
      .subscribe({
        next: (response: any) => {
          this.ngZone.run(() => {
            this.result = { ...response };
            this.mapData.setPlanningResult(response);
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
