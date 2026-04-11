import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { Router } from '@angular/router';

export interface AuthUser {
  user_id:             number;
  user_name:           string;
  email:               string;
  firm_name:           string;
  role:                string;
  plan_tier:           string;
  subscription_status: string;
  trial_ends_at:       string | null;
}

interface TokenResponse extends AuthUser {
  access_token: string;
  token_type:   string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly BASE = 'http://localhost:8000/auth';
  private readonly TOKEN_KEY = 'bylaw_token';
  private readonly USER_KEY  = 'bylaw_user';
  private readonly isBrowser: boolean;

  private currentUserSubject = new BehaviorSubject<AuthUser | null>(null);
  currentUser$ = this.currentUserSubject.asObservable();

  constructor(
    private http: HttpClient,
    private router: Router,
    @Inject(PLATFORM_ID) platformId: object,
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
    if (this.isBrowser) {
      this.currentUserSubject.next(this.loadUser());
    }
  }

  get currentUser(): AuthUser | null {
    return this.currentUserSubject.value;
  }

  get isLoggedIn(): boolean {
    return !!this.getToken();
  }

  getToken(): string | null {
    return this.isBrowser ? localStorage.getItem(this.TOKEN_KEY) : null;
  }

  register(firmName: string, fullName: string, email: string, password: string): Observable<TokenResponse> {
    return this.http.post<TokenResponse>(`${this.BASE}/register`, {
      firm_name: firmName,
      full_name: fullName,
      email,
      password,
    }).pipe(tap(res => this.storeSession(res)));
  }

  login(email: string, password: string): Observable<TokenResponse> {
    return this.http.post<TokenResponse>(`${this.BASE}/login`, { email, password })
      .pipe(tap(res => this.storeSession(res)));
  }

  logout(): void {
    if (this.isBrowser) {
      localStorage.removeItem(this.TOKEN_KEY);
      localStorage.removeItem(this.USER_KEY);
    }
    this.currentUserSubject.next(null);
    this.router.navigate(['/login']);
  }

  private storeSession(res: TokenResponse): void {
    const user: AuthUser = {
      user_id:             res.user_id,
      user_name:           res.user_name,
      email:               res.email,
      firm_name:           res.firm_name,
      role:                res.role,
      plan_tier:           res.plan_tier,
      subscription_status: res.subscription_status,
      trial_ends_at:       res.trial_ends_at,
    };
    if (this.isBrowser) {
      localStorage.setItem(this.TOKEN_KEY, res.access_token);
      localStorage.setItem(this.USER_KEY, JSON.stringify(user));
    }
    this.currentUserSubject.next(user);
  }

  private loadUser(): AuthUser | null {
    try {
      const raw = this.isBrowser ? localStorage.getItem(this.USER_KEY) : null;
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  trialDaysLeft(): number {
    const user = this.currentUser;
    if (!user?.trial_ends_at) return 0;
    const msLeft = new Date(user.trial_ends_at).getTime() - Date.now();
    return Math.max(0, Math.ceil(msLeft / 86_400_000));
  }
}
