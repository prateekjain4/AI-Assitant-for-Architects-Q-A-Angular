import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ScenarioComparison } from './scenario-comparison';

describe('ScenarioComparison', () => {
  let component: ScenarioComparison;
  let fixture: ComponentFixture<ScenarioComparison>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ScenarioComparison]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ScenarioComparison);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
