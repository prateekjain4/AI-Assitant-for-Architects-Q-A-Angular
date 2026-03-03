import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Askai } from './askai';

describe('Askai', () => {
  let component: Askai;
  let fixture: ComponentFixture<Askai>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [Askai]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Askai);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
