import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { DomSanitizer } from '@angular/platform-browser';
import { of } from 'rxjs';

import { TicketDetailviewComponent } from './ticket-detailview.component';
import { TicketService } from '../../services/ticket.service';

describe('TicketDetailviewComponent', () => {
  let component: TicketDetailviewComponent;
  let fixture: ComponentFixture<TicketDetailviewComponent>;

  beforeEach(async () => {
    const mockActivatedRoute = {
      params: of({}),
    };

    const mockTicketService = {
      getTickets: () => of({ tickets: [], count: 0 }),
    };

    const mockDomSanitizer = {
      sanitize: () => '',
    };

    await TestBed.configureTestingModule({
      imports: [TicketDetailviewComponent],
      providers: [
        { provide: ActivatedRoute, useValue: mockActivatedRoute },
        { provide: TicketService, useValue: mockTicketService },
        { provide: DomSanitizer, useValue: mockDomSanitizer },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TicketDetailviewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
