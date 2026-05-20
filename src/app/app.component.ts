import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { FolderTreeComponent, TreeItem, LayoutInstance } from 'layout-folder-management';
import { ButtonModule } from 'primeng/button';
import { Popover } from 'primeng/popover';
import { FolderApiService } from './services/folder-api.service';

@Component({
  selector: 'app-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonModule, Popover, FolderTreeComponent],
  template: `
    <div class="p-6">
      @if (sessions1().length > 0 && layouts1().length > 0) {
        <div class="flex items-center gap-3 mb-4">
          <button
            pButton
            icon="fas fa-folder-tree"
            label="Layouts"
            outlined
            (click)="treePopover.toggle($event)"
          ></button>
          <span class="text-sm">
            Selected:
            <span class="font-medium">{{ selectedFileName() ?? 'None' }}</span>
          </span>
        </div>

        <p-popover #treePopover [style]="{ width: '500px' }">
          <app-folder-tree
            [(sessions)]="sessions1"
            [layouts]="layouts1()"
            [(selectedFileId)]="selectedFileId1"
            (fileSelected)="onFileClicked($event); treePopover.hide()"
          />
        </p-popover>
      } @else {
        <div class="p-6 text-gray-500">Loading…</div>
      }
    </div>
  `,
})
export class AppComponent implements OnInit {
  private api = inject(FolderApiService);

  sessions1 = signal<TreeItem[]>([]);
  layouts1 = signal<LayoutInstance[]>([]);
  selectedFileId1 = signal<string | null>('v-003');

  protected selectedFileName = computed<string | null>(() => {
    const id = this.selectedFileId1();
    if (!id) return null;
    return this.layouts1().find((l) => l.id === id)?.name ?? null;
  });

  ngOnInit() {
    this.api.fetchSessions1().subscribe((s) => this.sessions1.set(s));
    this.api.fetchLayouts1().subscribe((l) => this.layouts1.set(l));
  }

  protected onFileClicked(id: string): void {
    console.log('[AppComponent] file clicked:', id);
  }
}
