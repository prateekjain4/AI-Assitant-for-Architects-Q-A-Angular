import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface ProjectSummary {
  id:         number;
  name:       string;
  zone:       string;
  locality:   string;
  saved_by:   string;
  created_at: string;
  updated_at: string;
}

export interface ProjectDetail extends ProjectSummary {
  plot_inputs:     any;
  planning_result: any;
  cost_estimate:   any;
  scenarios:       any;
}

@Injectable({ providedIn: 'root' })
export class ProjectService {
  private readonly BASE = 'http://localhost:8000/projects';

  constructor(private http: HttpClient) {}

  save(payload: {
    name:            string;
    zone:            string;
    locality:        string;
    plot_inputs:     any;
    planning_result: any;
    cost_estimate:   any;
    scenarios:       any;
  }): Observable<{ id: number; name: string; message: string }> {
    return this.http.post<any>(`${this.BASE}/save`, payload);
  }

  list(): Observable<ProjectSummary[]> {
    return this.http.get<ProjectSummary[]>(`${this.BASE}/`);
  }

  get(id: number): Observable<ProjectDetail> {
    return this.http.get<ProjectDetail>(`${this.BASE}/${id}`);
  }

  rename(id: number, name: string): Observable<any> {
    return this.http.patch(`${this.BASE}/${id}/rename`, { name });
  }

  delete(id: number): Observable<any> {
    return this.http.delete(`${this.BASE}/${id}`);
  }
}