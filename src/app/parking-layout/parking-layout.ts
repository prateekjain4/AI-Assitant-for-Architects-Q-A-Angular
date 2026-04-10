import { Component, Input, OnChanges, NgZone, ChangeDetectorRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-parking-layout',
  standalone: false,
  templateUrl: './parking-layout.html',
  styleUrl: './parking-layout.css',
})
export class ParkingLayout implements OnChanges {
  @Input() usage:         string  = 'residential';
  @Input() builtUpSqft:   number  = 0;
  @Input() numUnits:      number  = 1;
  @Input() plotLengthM:   number  = 0;
  @Input() plotWidthM:    number  = 0;
  @Input() basement:      boolean = false;
  @Input() stilt:         boolean = false;

  parkingData: any    = null;
  loading:     boolean = false;

  constructor(
    private http:   HttpClient,
    private ngZone: NgZone,
    private cdr:    ChangeDetectorRef
  ) {}

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
}
