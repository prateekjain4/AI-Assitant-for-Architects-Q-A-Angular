import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { Home } from './home/home';
import { Askai } from './askai/askai';
import { UpdatedBylaw } from './updated-bylaw/updated-bylaw';
import { PlanningTool } from './planning-tool/planning-tool';

const routes: Routes = [ { path: '', component: Home },
  { path: 'ask', component: Askai },
  { path: 'updates', component: UpdatedBylaw },
  { path: 'planning', component: PlanningTool },
  { path: '**', redirectTo: '' }];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
