import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { Navbar } from './navbar';
import { RouterModule } from '@angular/router';

@NgModule({
  declarations: [
    Navbar,
  ],
  imports: [
    BrowserModule,
    RouterModule
  ],
  exports: [
    Navbar,
  ],
})
export class NavbarModule {}