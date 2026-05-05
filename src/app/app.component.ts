import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { FolderTreeComponent, SessionNode, Layout } from 'layout-folder-management';
import { FolderApiService } from './services/folder-api.service';

@Component({
  selector: 'app-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FolderTreeComponent],
  template: `
    <div style="display: flex; gap: 32px; padding: 24px; font-family: sans-serif; align-items: flex-start;">
      
      <!-- Instance 1: User 1 -->
      <div style="flex: 1; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
        <div style="background: #f9fafb; padding: 12px 24px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">
          My Folders (User 1)
        </div>
        @if (sessions1().length > 0 && layouts1().length > 0) {
          <app-folder-tree
            [(sessions)]="sessions1"
            [layouts]="layouts1()"
            [(selectedFileId)]="selectedFileId1"
          />
        } @else {
          <div style="padding: 24px;">Loading User 1 data...</div>
        }
      </div>

    </div>
  `,
})
export class AppComponent implements OnInit {
  private api = inject(FolderApiService);

  // User 1 State
  sessions1 = signal<SessionNode[]>([]);
  layouts1 = signal<Layout[]>([]);
  selectedFileId1 = signal<string | null>('v-003');

  ngOnInit() {
    this.api.fetchSessions1().subscribe((s) => this.sessions1.set(s));
    this.api.fetchLayouts1().subscribe((l) => this.layouts1.set(l));
  }
}
