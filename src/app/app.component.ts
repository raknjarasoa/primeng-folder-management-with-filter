import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { FolderTreeComponent, LayoutInstance, TreeItem } from 'layout-folder-management';
import { ButtonModule } from 'primeng/button';
import { Popover } from 'primeng/popover';
import { forkJoin } from 'rxjs';
import { FolderApiService } from './services/folder-api.service';

@Component({
  selector: 'app-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonModule, Popover, FolderTreeComponent],
  template: `
    <div class="p-6">
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
          <span class="font-medium text-emerald-600 dark:text-emerald-400">{{ selectedFileName() ?? 'None' }}</span>
        </span>
      </div>

      <p-popover #treePopover [style]="{ width: '500px' }" (onShow)="onPopoverShow()" (onHide)="onPopoverHide()">
        @if (isLoading()) {
          <div class="p-6 flex flex-col items-center justify-center gap-2 text-gray-500">
            <span class="text-xs font-semibold tracking-wide text-gray-500 dark:text-gray-400">Refreshing layouts...</span>
          </div>
        } @else if (isTreeVisible() && sessions1().length > 0 && layouts1().length > 0) {
          <app-folder-tree
            [(sessions)]="sessions1"
            [layouts]="layouts1()"
            [(selectedFileId)]="selectedFileId1"
            (fileSelected)="onFileClicked($event); treePopover.hide()"
          />
        } @else {
          <div class="p-6 text-center text-gray-400 dark:text-gray-500">
            <i class="fas fa-exclamation-circle text-lg mb-1 block"></i>
            <span>No layouts available.</span>
          </div>
        }
      </p-popover>
    </div>
  `,
})
export class AppComponent implements OnInit {
  private api = inject(FolderApiService);

  sessions1 = signal<TreeItem[]>([]);
  layouts1 = signal<LayoutInstance[]>([]);
  selectedFileId1 = signal<string | null>('v-003');

  isLoading = signal(false);
  isTreeVisible = signal(false);

  protected selectedFileName = computed<string | null>(() => {
    const id = this.selectedFileId1();
    if (!id) return null;
    return this.layouts1().find((l) => l.id === id)?.name ?? null;
  });

  ngOnInit() {
    // Initial load so the selected file name is immediately displayed on the page
    this.api.fetchSessions1().subscribe((s) => this.sessions1.set(s));
    this.api.fetchLayouts1().subscribe((l) => this.layouts1.set(l));
  }

  onPopoverShow(): void {
    this.isTreeVisible.set(true);
    this.isLoading.set(true);

    forkJoin({
      sessions: this.api.fetchSessions1(),
      layouts: this.api.fetchLayouts1(),
    }).subscribe({
      next: ({ sessions, layouts }) => {
        this.sessions1.set(sessions);
        this.layouts1.set(layouts);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('[AppComponent] Error refreshing layout/session data:', err);
        this.isLoading.set(false);
      },
    });
  }

  onPopoverHide(): void {
    this.isTreeVisible.set(false);
  }

  protected onFileClicked(id: string): void {
    console.log('[AppComponent] file clicked:', id);
  }
}

