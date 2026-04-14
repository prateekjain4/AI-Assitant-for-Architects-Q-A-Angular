import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { Home } from './home/home';
import { Askai } from './askai/askai';
import { UpdatedBylaw } from './updated-bylaw/updated-bylaw';
import { PlanningTool } from './planning-tool/planning-tool';
import { About } from './about/about';
import { Login } from './auth/login/login';
import { Signup } from './auth/signup/signup';
import { AuthGuard } from './guards/auth.guard';
import { CostAnalysisPage } from './cost-analysis/cost-analysis';
import { RanchiPlanningTool } from './ranchi-planning/ranchi-planning';
import { BengaluruPlanningTool } from './bengaluru-planning/bengaluru-planning';

const routes: Routes = [
  { path: '',             component: Home },
  { path: 'login',        component: Login },
  { path: 'signup',       component: Signup },
  { path: 'ask',          component: Askai,           canActivate: [AuthGuard] },
  { path: 'updates',      component: UpdatedBylaw,    canActivate: [AuthGuard] },
  { path: 'planning',     component: PlanningTool,    canActivate: [AuthGuard] },
  { path: 'cost-analysis',component: CostAnalysisPage,canActivate: [AuthGuard] },
  { path: 'ranchi',      component: RanchiPlanningTool,    canActivate: [AuthGuard] },
  { path: 'bengaluru',   component: BengaluruPlanningTool, canActivate: [AuthGuard] },
  { path: 'about',       component: About },
  { path: '**',           redirectTo: '' },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
