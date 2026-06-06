import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TicketDetailviewComponent } from './ticket-detailview.component';

describe('TicketDetailviewComponent', () => {
  let component: TicketDetailviewComponent;
  let fixture: ComponentFixture<TicketDetailviewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TicketDetailviewComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TicketDetailviewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
