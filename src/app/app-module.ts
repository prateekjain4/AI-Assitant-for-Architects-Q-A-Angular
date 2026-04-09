import { NgModule, provideBrowserGlobalErrorListeners } from '@angular/core';
import { BrowserModule, provideClientHydration, withEventReplay } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing-module';
import { App } from './app';
import { Askai } from './askai/askai';
import { UpdatedBylaw } from './updated-bylaw/updated-bylaw';
import { HomeModule } from './home/home-module';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { provideHttpClient } from '@angular/common/http';
import { PlanningTool } from './planning-tool/planning-tool';
import { Map } from './map/map';
import { NavbarModule } from './navbar/navbar-module';
import { About } from './about/about';
import { ScenarioComparison } from './scenario-comparison/scenario-comparison';
import { ParkingLayout } from './parking-layout/parking-layout'
import { SitePlan } from './site-plan/site-plan'
import { CostEstimator } from './cost-estimator/cost-estimator'
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
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    HomeModule,
    FormsModule,
    ReactiveFormsModule,
    NavbarModule

  ],
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideClientHydration(withEventReplay()),
    provideHttpClient(),
  ],
  bootstrap: [App]
})
export class AppModule { }
