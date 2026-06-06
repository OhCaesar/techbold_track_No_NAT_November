import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ChatListElementComponent } from './chat-list-element.component';

describe('ChatListElementComponent', () => {
  let component: ChatListElementComponent;
  let fixture: ComponentFixture<ChatListElementComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChatListElementComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ChatListElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
