import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';

import { TicketDetailviewComponent } from './ticket-detailview.component';

describe('TicketDetailviewComponent', () => {
  let component: TicketDetailviewComponent;
  let fixture: ComponentFixture<TicketDetailviewComponent>;

  beforeEach(async () => {
    const mockActivatedRoute = {
      params: of({}),
    };

    await TestBed.configureTestingModule({
      imports: [TicketDetailviewComponent],
      providers: [{ provide: ActivatedRoute, useValue: mockActivatedRoute }],
    }).compileComponents();

    fixture = TestBed.createComponent(TicketDetailviewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
