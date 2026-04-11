import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BrowserModule } from '@angular/platform-browser';
import { Navbar } from './navbar';
import { RouterModule } from '@angular/router';

@NgModule({
  declarations: [
    Navbar,
  ],
  imports: [
    BrowserModule,
    CommonModule,
    RouterModule,
  ],
  exports: [
    Navbar,
  ],
})
export class NavbarModule {}