import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-login',
  standalone: false,
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  form: FormGroup;
  loading = false;
  error   = '';

  constructor(private fb: FormBuilder, private auth: AuthService, private router: Router, private toast: ToastService) {
    this.form = this.fb.group({
      email:    ['', [Validators.required, Validators.email]],
      password: ['', Validators.required],
    });
  }

  onSubmit() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.loading = true;
    this.error   = '';

    const { email, password } = this.form.value;
    this.auth.login(email, password).subscribe({
      next: () => {
        this.toast.success('Welcome back! Redirecting…');
        this.router.navigate(['/planning']);
      },
      error: (err) => {
        this.error   = err?.error?.detail ?? 'Login failed. Please try again.';
        this.toast.error(this.error);
        this.loading = false;
      },
    });
  }
}
