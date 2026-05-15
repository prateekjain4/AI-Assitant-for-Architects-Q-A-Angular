import { Component } from '@angular/core';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-navbar',
  standalone: false,
  templateUrl: './navbar.html',
  styleUrl: './navbar.css',
})
export class Navbar {
  menuOpen = false;
  citiesOpen = false;

  constructor(public auth: AuthService) {}

  toggleMenu()  { this.menuOpen = !this.menuOpen; }
  toggleCities(e: Event) { e.preventDefault(); this.citiesOpen = !this.citiesOpen; }
  closeMenu()   { this.menuOpen = false; this.citiesOpen = false; (document.activeElement as HTMLElement)?.blur(); }
}
