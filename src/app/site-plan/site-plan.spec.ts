import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SitePlan } from './site-plan';

describe('SitePlan', () => {
  let component: SitePlan;
  let fixture: ComponentFixture<SitePlan>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [SitePlan]
    }).compileComponents();

    fixture = TestBed.createComponent(SitePlan);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});