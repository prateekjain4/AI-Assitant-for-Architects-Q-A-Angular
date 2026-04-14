import { Component } from '@angular/core';
import { ToastService } from '../services/toast.service';

@Component({
  selector: 'app-toast',
  standalone: false,
  templateUrl: './toast.component.html',
  styleUrl:    './toast.component.css',
})
export class ToastComponent {
  constructor(public toast: ToastService) {}
}