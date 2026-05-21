import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AutoFocus } from 'primeng/autofocus';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { Popover } from 'primeng/popover';

import { FlatRowData, TreeItem } from '../models/folder-tree.models';
import {
  FolderOption,
  collectSubtreeIds,
  flattenFolders,
} from '../store/tree-helpers';

export type MoveFolderRequest = {
  sourceId: string;
  targetFolderId: string | null;
};

@Component({
  selector: 'app-move-folder-picker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    AutoFocus,
    InputTextModule,
    IconFieldModule,
    InputIconModule,
    Popover,
  ],
  templateUrl: './move-folder-picker.component.html',
  styleUrl: './move-folder-picker.component.scss',
})
export class MoveFolderPickerComponent {
  readonly sessions = input.required<TreeItem[]>();
  readonly moveTo = output<MoveFolderRequest>();

  protected readonly movingRowId = signal<string | null>(null);
  protected readonly movingRowLabel = signal<string | null>(null);
  protected readonly movingRowKind = signal<'file' | 'folder' | null>(null);
  protected readonly moveFilterText = signal<string>('');

  protected readonly moveCandidates = computed<FolderOption[]>(() => {
    const sourceId = this.movingRowId();
    if (!sourceId) return [];
    const exclude = collectSubtreeIds(this.sessions(), sourceId);
    return flattenFolders(this.sessions(), exclude);
  });

  protected readonly filteredMoveCandidates = computed<FolderOption[]>(() => {
    const q = this.moveFilterText().trim().toLowerCase();
    const all = this.moveCandidates();
    if (!q) return all;
    return all.filter((f) => f.label.toLowerCase().includes(q));
  });

  private readonly popover = viewChild<Popover>('popover');

  open(row: FlatRowData, event: Event): void {
    this.movingRowId.set(row.id);
    this.movingRowLabel.set(row.label);
    this.movingRowKind.set(row.kind);
    this.moveFilterText.set('');
    this.popover()?.toggle(event);
  }

  protected confirm(targetFolderId: string | null): void {
    const sourceId = this.movingRowId();
    this.resetState();
    this.popover()?.hide();
    if (!sourceId) return;
    this.moveTo.emit({ sourceId, targetFolderId });
  }

  protected onHide(): void {
    this.resetState();
  }

  private resetState(): void {
    this.movingRowId.set(null);
    this.movingRowLabel.set(null);
    this.movingRowKind.set(null);
    this.moveFilterText.set('');
  }
}
