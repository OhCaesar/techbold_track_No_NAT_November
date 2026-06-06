import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ChatDetailViewComponent, ChatMessage } from './chat-detail-view.component';

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

  // Drive activeChat through the input pipeline (setInput) so the view is marked
  // dirty and rendered — this mirrors the parent's [activeChat]="..." binding.
  function setActiveChat(messages: ChatMessage[]): void {
    fixture.componentRef.setInput('activeChat', { id: 'chat-1', messages });
    fixture.detectChanges();
  }

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders a pending tool call as an approval card with ACCEPT/DECLINE', () => {
    setActiveChat([
      {
        id: 'tc-1',
        content: '',
        toolCall: {
          id: 'tc-1',
          name: 'run_ssh_command',
          command: 'systemctl restart nginx',
          status: 'pending',
        },
      },
    ]);

    const el: HTMLElement = fixture.nativeElement;
    const card = el.querySelector('.tool-call-card');
    expect(card).toBeTruthy();
    expect(card!.getAttribute('data-status')).toBe('pending');
    expect(el.querySelector('.tool-call-command')!.textContent).toContain(
      'systemctl restart nginx',
    );
    expect(el.querySelector('.approve-button')).toBeTruthy();
    expect(el.querySelector('.decline-button')).toBeTruthy();
  });

  it('emits toolCallResolved when ACCEPT is clicked', () => {
    setActiveChat([
      {
        id: 'tc-1',
        content: '',
        toolCall: { id: 'tc-1', name: 'run_ssh_command', command: 'ls', status: 'pending' },
      },
    ]);

    const resolved: { toolCallId: string; approved: boolean }[] = [];
    component.toolCallResolved.subscribe((e) => resolved.push(e));

    fixture.nativeElement.querySelector('.approve-button').click();
    expect(resolved).toEqual([{ toolCallId: 'tc-1', approved: true }]);
  });

  it('shows command output once a tool call is executed', () => {
    setActiveChat([
      {
        id: 'tc-1',
        content: '',
        toolCall: {
          id: 'tc-1',
          name: 'run_ssh_command',
          command: 'ls',
          status: 'executed',
          output: 'file-a\nfile-b',
          exitCode: 0,
        },
      },
    ]);

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.approve-button')).toBeNull();
    expect(el.querySelector('.tool-call-output')!.textContent).toContain('file-a');
    expect(el.querySelector('.tool-call-output')!.textContent).toContain('exit 0');
  });
});
