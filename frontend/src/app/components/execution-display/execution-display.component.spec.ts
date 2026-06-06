import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ExecutionDisplayComponent } from './execution-display.component';

describe('ExecutionDisplayComponent', () => {
  let component: ExecutionDisplayComponent;
  let fixture: ComponentFixture<ExecutionDisplayComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ExecutionDisplayComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ExecutionDisplayComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
