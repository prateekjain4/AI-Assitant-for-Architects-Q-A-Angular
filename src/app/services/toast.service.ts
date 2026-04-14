import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface Toast {
  id:      number;
  type:    'success' | 'error' | 'info';
  message: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private counter = 0;
  private store   = new BehaviorSubject<Toast[]>([]);
  toasts$         = this.store.asObservable();

  show(message: string, type: Toast['type'] = 'info', duration = 3500) {
    const id = ++this.counter;
    this.store.next([...this.store.value, { id, type, message }]);
    setTimeout(() => this.dismiss(id), duration);
  }

  success(message: string) { this.show(message, 'success'); }
  error(message: string)   { this.show(message, 'error', 5000); }
  info(message: string)    { this.show(message, 'info'); }

  dismiss(id: number) {
    this.store.next(this.store.value.filter(t => t.id !== id));
  }
}