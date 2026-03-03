import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UpdatedBylaw } from './updated-bylaw';

describe('UpdatedBylaw', () => {
  let component: UpdatedBylaw;
  let fixture: ComponentFixture<UpdatedBylaw>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [UpdatedBylaw]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UpdatedBylaw);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
