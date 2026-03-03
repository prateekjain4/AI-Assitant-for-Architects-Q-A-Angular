import { Component, ChangeDetectorRef  } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-askai',
  standalone: false,
  templateUrl: './askai.html',
  styleUrls: ['./askai.css']
})
export class Askai {
  question: string = '';
  answer: string | null = null;
  loading: boolean = false;

  private apiUrl = 'http://localhost:8000/ask';

  constructor(
    private http: HttpClient,
    private cd: ChangeDetectorRef
  ) {}

  sendQuestion(): void {
    if (!this.question.trim()) return;

    this.loading = true;
    this.answer = null;

    this.http.post<any>(this.apiUrl, {
      question: this.question
    }).subscribe({
      next: (response) => {
        this.answer = response.answer;
        this.loading = false;
        console.log('Received answer:', this.answer);
        this.cd.detectChanges();   // 👈 force UI update
      },
      error: () => {
        this.answer = 'Error getting response';
        this.loading = false;

        this.cd.detectChanges();
      }
    });
  }
}
