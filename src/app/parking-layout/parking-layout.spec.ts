import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ParkingLayout } from './parking-layout';

describe('ParkingLayout', () => {
  let component: ParkingLayout;
  let fixture: ComponentFixture<ParkingLayout>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ParkingLayout]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ParkingLayout);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
