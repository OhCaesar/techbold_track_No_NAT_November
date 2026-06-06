import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ChatDetailViewComponent } from './chat-detail-view.component';

describe('ChatDetailViewComponent', () => {
  let component: ChatDetailViewComponent;
  let fixture: ComponentFixture<ChatDetailViewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChatDetailViewComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ChatDetailViewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
