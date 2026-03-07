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
@NgModule({
  declarations: [
    App,
    Askai,
    UpdatedBylaw,
    PlanningTool
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    HomeModule,
    FormsModule,
    ReactiveFormsModule
  ],
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideClientHydration(withEventReplay()),
    provideHttpClient(),
  ],
  bootstrap: [App]
})
export class AppModule { }
