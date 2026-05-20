import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
  computed,
  model,
  linkedSignal,
  untracked,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { debounceTime } from 'rxjs/operators';
import { FormsModule } from '@angular/forms';
import { NgTemplateOutlet, DatePipe } from '@angular/common';
import { TreeModule, TreeNodeDropEvent } from 'primeng/tree';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { TreeDragDropService, TreeNode, ConfirmationService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';

import { FolderTreeStore } from '../store/folder-tree.store';
import { NodeData, SessionNode, LayoutInstance } from '../models/folder-tree.models';

@Component({
  selector: 'app-folder-tree',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    FormsModule,
    TreeModule,
    ButtonModule,
    InputTextModule,
    IconFieldModule,
    InputIconModule,
    DatePipe,
    ConfirmDialogModule,
  ],
  providers: [TreeDragDropService, FolderTreeStore, ConfirmationService],
  templateUrl: './folder-tree.component.html',
  styleUrl: './folder-tree.component.scss',
})
export class FolderTreeComponent {
  sessions = model.required<SessionNode[]>();
  layouts = input<LayoutInstance[]>([]);
  selectedFileId = model.required<string | null>();

  protected readonly store = inject(FolderTreeStore);
  protected readonly confirmationService = inject(ConfirmationService);

  protected readonly editingId = signal<string | null>(null);
  protected readonly editingValue = signal<string>('');
  protected readonly filterText = signal<string>('');

  protected readonly debouncedFilterText = toSignal(
    toObservable(this.filterText).pipe(debounceTime(300)),
    { initialValue: '' }
  );

  protected readonly isFiltering = computed(() => this.debouncedFilterText().trim().length > 0);

  private isInitialLoad = true;

  treeValue = linkedSignal<
    { nodes: TreeNode<NodeData>[]; filter: string; selectedId: string | null },
    TreeNode<NodeData>[]
  >({
    source: () => ({
      nodes: this.store.treeNodes(),
      filter: this.debouncedFilterText().trim().toLowerCase(),
      selectedId: this.store.selectedFileId(),
    }),
    computation: (source, previous) => {
      const expandedKeys = previous
        ? this.collectKeys(previous.value, (n) => !!n.expanded)
        : new Set<string>();

      const selectionChanged = previous && previous.source.selectedId !== source.selectedId;
      const shouldAutoExpand = selectionChanged || (this.isInitialLoad && source.nodes.length > 0);

      if (shouldAutoExpand && source.selectedId && source.nodes.length > 0) {
        const ancestors = this.store.selectedFileAncestors();
        if (ancestors.length > 0 || source.nodes.some((n) => n.key === source.selectedId)) {
          ancestors.forEach((k) => expandedKeys.add(k));
          this.isInitialLoad = false;
        }
      }

      let filtered = source.nodes;
      if (source.filter) {
        filtered = this.filterTree(source.nodes, source.filter);
        const filteredKeys = this.collectKeys(filtered);
        filteredKeys.forEach(k => expandedKeys.add(k));
      }

      this.applyExpanded(filtered, expandedKeys);
      return filtered;
    },
  });

  selectedNode = computed(() => {
    const id = this.store.selectedFileId();
    if (!id) return null;
    return this.findNodeByKey(this.treeValue(), id) ?? null;
  });

  constructor() {
    effect(() => {
      this.store.initData(this.sessions(), this.layouts());
    }, { allowSignalWrites: true });

    effect(() => {
      this.store.selectFile(this.selectedFileId());
    }, { allowSignalWrites: true });

    effect(() => {
      const currentSessions = this.store.sessions();
      const selectedId = this.store.selectedFileId();
      untracked(() => {
        if (!this.isInitialLoad) {
          if (this.sessions() !== currentSessions) this.sessions.set(currentSessions);
          if (this.selectedFileId() !== selectedId) this.selectedFileId.set(selectedId);
        }
      });
    }, { allowSignalWrites: true });
  }

  // ---------------------------------------------------------------------------
  // Event handlers
  // ---------------------------------------------------------------------------

  protected onFilterChange(value: string): void {
    this.filterText.set(value);
  }

  protected onSelectionChange(node: TreeNode<NodeData> | TreeNode<NodeData>[] | null): void {
    const selected = Array.isArray(node) ? node[0] : node;
    if (selected?.data?.kind === 'file') {
      this.store.selectFile(selected.data.id);
    }
  }

  protected onNodeDrop(event: TreeNodeDropEvent): void {
    const dragNode = event.dragNode as TreeNode<NodeData> | undefined;
    if (!dragNode?.data) return;

    const location = this.findNodeInTree(this.treeValue(), dragNode);
    if (!location) return;

    const { parent, index } = location;
    if (parent && parent.data?.kind !== 'folder') return;

    const draggedId = dragNode.data.id;
    const targetFolderId = parent?.data?.id ?? null;

    // Decouple store update from PrimeNG's synchronous drag-and-drop event loop
    setTimeout(() => this.store.moveNode(draggedId, targetFolderId, index), 50);
  }

  private findNodeInTree(
    nodes: TreeNode<NodeData>[],
    target: TreeNode<NodeData>,
    parent: TreeNode<NodeData> | null = null,
  ): { parent: TreeNode<NodeData> | null; index: number } | null {
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i] === target) return { parent, index: i };
      if (nodes[i].children) {
        const found = this.findNodeInTree(nodes[i].children!, target, nodes[i]);
        if (found) return found;
      }
    }
    return null;
  }

  protected readonly creatingId = signal<string | null>(null);

  protected onAddFolder(parentId: string | null = null): void {
    const newId = this.store.addFolder(parentId, '');
    if (parentId) {
      const parentNode = this.findNodeByKey(this.treeValue(), parentId);
      if (parentNode) parentNode.expanded = true;
    }
    this.creatingId.set(newId);
    this.startRename(newId, '');
  }

  protected startRename(id: string, currentLabel: string): void {
    this.editingId.set(id);
    this.editingValue.set(currentLabel);
  }

  protected commitRename(id: string): void {
    const value = this.editingValue().trim();
    if (this.editingId() !== id || !value) return;

    const allNodes = this.store.treeNodes();
    const nodeToRename = this.findNodeByKey(allNodes, id);
    if (nodeToRename) {
      const location = this.findNodeInTree(allNodes, nodeToRename);
      if (location) {
        const siblings = location.parent ? location.parent.children! : allNodes;
        const duplicate = siblings.some(
          (s) => s.key !== id && s.label?.toLowerCase() === value.toLowerCase(),
        );
        if (duplicate) {
          this.confirmationService.confirm({
            message: 'A file or folder with this name already exists at this location.',
            header: 'Duplicate Name',
            icon: 'fas fa-triangle-exclamation',
            rejectVisible: false,
            acceptLabel: 'OK',
          });
          return;
        }
      }
    }

    this.store.renameFolder(id, value);
    this.editingId.set(null);
    this.creatingId.set(null);
  }

  protected cancelRename(id?: string): void {
    const targetId = id ?? this.editingId();
    if (targetId && targetId === this.creatingId()) {
      this.store.deleteNode(targetId);
    }
    this.editingId.set(null);
    this.creatingId.set(null);
  }

  protected onDelete(data: NodeData): void {
    this.confirmationService.confirm({
      message: 'Are you sure you want to delete this item?',
      header: 'Confirm Deletion',
      icon: 'fas fa-circle-info',
      acceptButtonStyleClass: 'p-button-danger p-button-text',
      rejectButtonStyleClass: 'p-button-text',
      accept: () => {
        // If this node was being renamed (e.g. a brand-new folder deleted before
        // the name was committed), clear the editing state so that the
        // "New folder" / "Add subfolder" buttons are no longer disabled.
        if (this.editingId() === data.id) {
          this.editingId.set(null);
          this.creatingId.set(null);
        }
        this.store.deleteNode(data.id);
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Tree helpers
  // ---------------------------------------------------------------------------

  private filterTree(nodes: TreeNode<NodeData>[], query: string): TreeNode<NodeData>[] {
    const result: TreeNode<NodeData>[] = [];
    for (const node of nodes) {
      let searchableText = (node.label ?? '').toLowerCase();
      if (node.data?.kind === 'file' && node.data.layout) {
        const l = node.data.layout;
        searchableText += ' ' + (l.username ?? '').toLowerCase();
        searchableText += ' ' + (l.description ?? '').toLowerCase();
      }

      const labelMatch = searchableText.includes(query);
      if (node.children?.length) {
        const filteredChildren = this.filterTree(node.children, query);
        if (labelMatch || filteredChildren.length > 0) {
          result.push({
            ...node,
            children: filteredChildren.length > 0 ? filteredChildren : node.children,
          });
        }
      } else if (labelMatch) {
        result.push(node);
      }
    }
    return result;
  }

  private collectKeys(
    nodes: TreeNode<NodeData>[],
    predicate: (n: TreeNode<NodeData>) => boolean = () => true,
  ): Set<string> {
    const keys = new Set<string>();
    const walk = (list: TreeNode<NodeData>[]) => {
      for (const n of list) {
        if (n.key && predicate(n)) keys.add(n.key);
        if (n.children) walk(n.children);
      }
    };
    walk(nodes);
    return keys;
  }

  private findNodeByKey(
    nodes: TreeNode<NodeData>[],
    key: string,
  ): TreeNode<NodeData> | undefined {
    for (const n of nodes) {
      if (n.key === key) return n;
      if (n.children) {
        const found = this.findNodeByKey(n.children, key);
        if (found) return found;
      }
    }
    return undefined;
  }

  private applyExpanded(nodes: TreeNode<NodeData>[], expandedKeys: Set<string>): void {
    const walk = (list: TreeNode<NodeData>[]) => {
      for (const n of list) {
        if (n.key && expandedKeys.has(n.key)) {
          n.expanded = true;
        } else {
          n.expanded = false;
        }
        if (n.children) walk(n.children);
      }
    };
    walk(nodes);
  }
}
