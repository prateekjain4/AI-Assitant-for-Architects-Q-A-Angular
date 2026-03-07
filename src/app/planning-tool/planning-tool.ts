import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import {FormBuilder, FormGroup, Validators} from '@angular/forms';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-planning-tool',
  standalone: false,
  templateUrl: './planning-tool.html',
  styleUrl: './planning-tool.css',
})
export class PlanningTool implements OnInit {

  plotCalculator: FormGroup = new FormGroup({});

  result: any = null;
  loading: boolean = false;
  errorMessage: string = '';

  constructor(private fb: FormBuilder, private http: HttpClient, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.plotCalculator = this.fb.group({
      zoneDetails: ['', Validators.required],
      plotLength: ['', Validators.required],
      plotWidth: ['', Validators.required],
      roadWidth: ['', Validators.required],
      buildingHeight: ['', Validators.required],
      usage: ['', Validators.required]
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

    const payload = {
      zone: this.plotCalculator.value.zoneDetails,
      plot_length: Number(this.plotCalculator.value.plotLength),
      plot_width: Number(this.plotCalculator.value.plotWidth),
      road_width: Number(this.plotCalculator.value.roadWidth),
      building_height: Number(this.plotCalculator.value.buildingHeight),
      usage: this.plotCalculator.value.usage
    };
    console.log(payload);
    this.http.post('http://localhost:8000/planning', payload)
      .subscribe({
        next: (response: any) => {

          this.result = { ...response };
          console.log(this.result)
          this.loading = false;
          this.cdr.detectChanges();

        },
        error: (error) => {

          console.error(error);
          this.errorMessage = 'Failed to calculate regulations.';
          this.loading = false;
          this.cdr.detectChanges();

        }
      });

  }

}
