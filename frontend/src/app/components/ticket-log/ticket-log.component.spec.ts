import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TicketLogComponent } from './ticket-log.component';

describe('TicketLogComponent', () => {
  let component: TicketLogComponent;
  let fixture: ComponentFixture<TicketLogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TicketLogComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TicketLogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
