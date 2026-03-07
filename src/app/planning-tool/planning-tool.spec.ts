import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PlanningTool } from './planning-tool';

describe('PlanningTool', () => {
  let component: PlanningTool;
  let fixture: ComponentFixture<PlanningTool>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [PlanningTool]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PlanningTool);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
