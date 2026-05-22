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

  /**
   * Evaluates all folders available to host the item, excluding the item's
   * own subtree (in case of a folder) to prevent self-nesting cycles.
   */
  protected readonly moveCandidates = computed<FolderOption[]>(() => {
    const sourceId = this.movingRowId();
    if (!sourceId) return [];
    const exclude = collectSubtreeIds(this.sessions(), sourceId);
    return flattenFolders(this.sessions(), exclude);
  });

  /**
   * Filters the available relocation candidate folders by the current search text query.
   */
  protected readonly filteredMoveCandidates = computed<FolderOption[]>(() => {
    const q = this.moveFilterText().trim().toLowerCase();
    const all = this.moveCandidates();
    if (!q) return all;
    return all.filter((f) => f.label.toLowerCase().includes(q));
  });

  private readonly popover = viewChild<Popover>('popover');

  /**
   * Displays the move picker popover next to the triggering DOM element.
   * 
   * @param row The flat row metadata being relocated.
   * @param event The DOM event triggering the popover.
   */
  open(row: FlatRowData, event: Event): void {
    this.movingRowId.set(row.id);
    this.movingRowLabel.set(row.label);
    this.movingRowKind.set(row.kind);
    this.moveFilterText.set('');
    this.popover()?.toggle(event);
  }

  /**
   * Confirms selection and emits the moveTo event.
   * 
   * @param targetFolderId The chosen host parent folder, or null for root level.
   */
  protected confirm(targetFolderId: string | null): void {
    const sourceId = this.movingRowId();
    this.resetState();
    this.popover()?.hide();
    if (!sourceId) return;
    this.moveTo.emit({ sourceId, targetFolderId });
  }

  /**
   * Event hook when the popover gets closed/hidden.
   */
  protected onHide(): void {
    this.resetState();
  }

  /**
   * Resets active component states to prevent memory leaks or mismatched UI overlays.
   */
  private resetState(): void {
    this.movingRowId.set(null);
    this.movingRowLabel.set(null);
    this.movingRowKind.set(null);
    this.moveFilterText.set('');
  }
}
