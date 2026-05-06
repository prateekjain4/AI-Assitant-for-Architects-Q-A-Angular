import { NgModule, provideBrowserGlobalErrorListeners } from '@angular/core';
import { PdfViewerModule } from 'ng2-pdf-viewer';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing-module';
import { App } from './app';
import { Askai } from './askai/askai';
import { UpdatedBylaw } from './updated-bylaw/updated-bylaw';
import { HomeModule } from './home/home-module';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { provideHttpClient, withInterceptorsFromDi, HTTP_INTERCEPTORS } from '@angular/common/http';
import { PlanningTool } from './planning-tool/planning-tool';
import { Map } from './map/map';
import { NavbarModule } from './navbar/navbar-module';
import { About } from './about/about';
import { ScenarioComparison } from './scenario-comparison/scenario-comparison';
import { ParkingLayout } from './parking-layout/parking-layout';
import { SitePlan } from './site-plan/site-plan';
import { CostEstimator } from './cost-estimator/cost-estimator';
import { CostAnalysisPage } from './cost-analysis/cost-analysis';
import { RanchiPlanningTool } from './ranchi-planning/ranchi-planning';
import { BengaluruPlanningTool } from './bengaluru-planning/bengaluru-planning';
import { HyderabadPlanningTool } from './hyderabad-planning/hyderabad-planning';
import { Login } from './auth/login/login';
import { Signup } from './auth/signup/signup';
import { AuthInterceptor } from './interceptors/auth.interceptor';
import { ToastComponent } from './toast/toast.component';

@NgModule({
  declarations: [
    App,
    Askai,
    UpdatedBylaw,
    PlanningTool,
    Map,
    About,
    ScenarioComparison,
    ParkingLayout,
    SitePlan,
    CostEstimator,
    CostAnalysisPage,
    RanchiPlanningTool,
    BengaluruPlanningTool,
    HyderabadPlanningTool,
    Login,
    Signup,
    ToastComponent,
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    HomeModule,
    FormsModule,
    ReactiveFormsModule,
    NavbarModule,
    PdfViewerModule,
  ],
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptorsFromDi()),
    { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true },
  ],
  bootstrap: [App]
})
export class AppModule { }
