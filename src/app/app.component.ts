import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { FolderTreeComponent, SessionNode, Layout } from 'layout-folder-management';
import { FolderApiService } from './services/folder-api.service';

@Component({
  selector: 'app-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FolderTreeComponent],
  template: `
    <div class="p-6">
      @if (sessions1().length > 0 && layouts1().length > 0) {
        <app-folder-tree
          [(sessions)]="sessions1"
          [layouts]="layouts1()"
          [(selectedFileId)]="selectedFileId1"
        />
      } @else {
        <div class="p-6 text-gray-500">Loading…</div>
      }
    </div>
  `,
})
export class AppComponent implements OnInit {
  private api = inject(FolderApiService);

  sessions1 = signal<SessionNode[]>([]);
  layouts1 = signal<Layout[]>([]);
  selectedFileId1 = signal<string | null>('v-003');

  ngOnInit() {
    this.api.fetchSessions1().subscribe((s) => this.sessions1.set(s));
    this.api.fetchLayouts1().subscribe((l) => this.layouts1.set(l));
  }
}
