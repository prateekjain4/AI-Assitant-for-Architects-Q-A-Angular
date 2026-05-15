import { platformBrowser } from '@angular/platform-browser';
import { AppModule } from './app/app-module';
import { inject } from '@vercel/analytics';

// Initialize Vercel Web Analytics
inject();

platformBrowser().bootstrapModule(AppModule, {
  
})
  .catch(err => console.error(err));
