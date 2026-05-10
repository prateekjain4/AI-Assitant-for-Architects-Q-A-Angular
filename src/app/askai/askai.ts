import {
  Component,
  ChangeDetectorRef,
  ViewChild,
  ElementRef,
  AfterViewChecked
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { environment } from '../../environments/environment';

interface Message {
  role: 'user' | 'ai' | 'error';
  text: string;
  time: string;
  safeHtml?: SafeHtml;
}

@Component({
  selector: 'app-askai',
  standalone: false,
  templateUrl: './askai.html',
  styleUrls: ['./askai.css']
})
export class Askai implements AfterViewChecked {
  @ViewChild('chatContainer') chatContainer!: ElementRef;

  question: string = '';
  messages: Message[] = [];
  loading: boolean = false;
  copiedIndex: number | null = null;

  suggestedQuestions = [
    'What are the setback requirements for a residential plot in Bangalore?',
    'What is FAR (Floor Area Ratio) in BDA bylaws?',
    'What are the parking norms for commercial buildings?',
    'What is the maximum height allowed for buildings in R zone?'
  ];

  private apiUrl = environment.apiUrl + '/ask';
  private shouldScroll = false;

  constructor(
    private http: HttpClient,
    private cd: ChangeDetectorRef,
    private sanitizer: DomSanitizer
  ) {}

  ngAfterViewChecked() {
    if (this.shouldScroll) {
      this.scrollToBottom();
      this.shouldScroll = false;
    }
  }

  private scrollToBottom() {
    try {
      const el = this.chatContainer.nativeElement;
      el.scrollTop = el.scrollHeight;
    } catch {}
  }

  private formatTime(): string {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  private renderText(text: string): SafeHtml {
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    const formatted = escaped
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');

    return this.sanitizer.bypassSecurityTrustHtml(formatted);
  }

  sendQuestion(): void {
    const q = this.question.trim();
    if (!q || this.loading) return;

    this.messages.push({ role: 'user', text: q, time: this.formatTime() });
    this.question = '';
    this.loading = true;
    this.shouldScroll = true;
    this.cd.detectChanges();

    this.http.post<any>(this.apiUrl, { question: q }).subscribe({
      next: (response) => {
        const text = response.answer ?? 'No response received.';
        this.messages.push({
          role: 'ai',
          text,
          time: this.formatTime(),
          safeHtml: this.renderText(text)
        });
        this.loading = false;
        this.shouldScroll = true;
        this.cd.detectChanges();
      },
      error: () => {
        this.messages.push({
          role: 'error',
          text: 'Something went wrong. Please try again.',
          time: this.formatTime()
        });
        this.loading = false;
        this.shouldScroll = true;
        this.cd.detectChanges();
      }
    });
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendQuestion();
    }
  }

  askSuggested(q: string): void {
    this.question = q;
    this.sendQuestion();
  }

  copyText(text: string, index: number): void {
    navigator.clipboard.writeText(text).then(() => {
      this.copiedIndex = index;
      setTimeout(() => {
        this.copiedIndex = null;
        this.cd.detectChanges();
      }, 2000);
      this.cd.detectChanges();
    });
  }

  clearChat(): void {
    this.messages = [];
    this.cd.detectChanges();
  }
}
