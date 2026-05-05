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
import { NodeData, SessionNode, Layout } from '../models/folder-tree.models';

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
  styleUrl: './folder-tree.component.css',
})
export class FolderTreeComponent {
  // --- Data Inputs ---
  sessions = model.required<SessionNode[]>();
  layouts = input<Layout[]>([]);
  selectedFileId = model.required<string | null>();

  protected readonly store = inject(FolderTreeStore);
  protected readonly confirmationService = inject(ConfirmationService);

  // --- Local UI State ---
  protected readonly editingId = signal<string | null>(null);
  protected readonly editingValue = signal<string>('');
  protected readonly filterText = signal<string>('');
  
  protected readonly debouncedFilterText = toSignal(
    toObservable(this.filterText).pipe(debounceTime(300)),
    { initialValue: '' }
  );
  
  protected readonly isFiltering = computed(() => this.debouncedFilterText().trim().length > 0);

  private isInitialLoad = true;

  // --- Linked Signal for Tree Data ---
  // Syncs the store to the PrimeNG tree. PrimeNG mutates this array in-place
  // for drag/drop and expand/collapse, which is why we deep copy it.
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
      const expandedKeys = previous ? this.collectExpandedKeys(previous.value) : new Set<string>();

      // Auto-expand to selected file on initial load
      if (this.isInitialLoad && source.selectedId && source.nodes.length > 0) {
        const ancestors = this.store.selectedFileAncestors();
        if (ancestors.length > 0 || source.nodes.some(n => n.key === source.selectedId)) {
          ancestors.forEach((k) => expandedKeys.add(k));
          this.isInitialLoad = false; // Only flip once data is actually loaded and processed
        }
      }

      const filtered = source.filter
        ? this.filterTree(source.nodes, source.filter)
        : source.nodes;

      const keysToExpand = source.filter ? this.collectAllKeys(filtered) : expandedKeys;

      return filtered.map((n) => this.copyNode(n, keysToExpand));
    }
  });

  // Automatically compute the selected TreeNode reference based on the selected ID
  selectedNode = computed(() => {
    const id = this.store.selectedFileId();
    if (!id) return null;
    return this.findNodeByKey(this.treeValue(), id) ?? null;
  });

  constructor() {
    // 1. Sync Inputs -> Store
    effect(() => {
      this.store.initData(this.sessions(), this.layouts());
    }, { allowSignalWrites: true });

    effect(() => {
      this.store.selectFile(this.selectedFileId());
    }, { allowSignalWrites: true });

    // 2. Sync Store -> Outputs
    effect(() => {
      const currentSessions = this.store.sessions();
      const selectedId = this.store.selectedFileId();
      
      untracked(() => {
        if (!this.isInitialLoad) {
          if (this.sessions() !== currentSessions) {
            this.sessions.set(currentSessions);
          }
          if (this.selectedFileId() !== selectedId) {
            this.selectedFileId.set(selectedId);
          }
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
    // Folders are ignored for selection (expand/collapse is handled by PrimeNG natively)
  }

  protected onNodeDrop(event: TreeNodeDropEvent): void {
    const dragNode = event.dragNode as TreeNode<NodeData> | undefined;
    if (!dragNode?.data) return;

    // PrimeNG mutates this.treeValue() in place *before* emitting onNodeDrop.
    // Instead of relying on ambiguous event properties, we find exactly where 
    // the node ended up in the tree.
    const location = this.findNodeInTree(this.treeValue(), dragNode);
    if (!location) return;

    const { parent, index } = location;

    if (parent && parent.data?.kind !== 'folder') {
      return; // Invalid drop (e.g. somehow inside a file)
    }

    const draggedId = dragNode.data.id;
    const targetFolderId = parent?.data?.id ?? null;

    // Use setTimeout to decouple the store update and subsequent tree rebuild
    // from PrimeNG's native synchronous drag-and-drop event loop. This prevents
    // the UI from hanging/freezing during drop operations.
    setTimeout(() => {
      this.store.moveNode(
        draggedId,
        targetFolderId,
        index,
      );
    }, 50);
  }

  private findNodeInTree(
    nodes: TreeNode<NodeData>[],
    targetNode: TreeNode<NodeData>,
    parent: TreeNode<NodeData> | null = null
  ): { parent: TreeNode<NodeData> | null; index: number } | null {
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i] === targetNode) {
        return { parent, index: i };
      }
      if (nodes[i].children) {
        const found = this.findNodeInTree(nodes[i].children!, targetNode, nodes[i]);
        if (found) return found;
      }
    }
    return null;
  }

  protected readonly creatingId = signal<string | null>(null);

  protected onAddFolder(parentId: string | null = null): void {
    // Add folder with placeholder name
    const newId = this.store.addFolder(parentId, '');
    
    // Auto-expand the parent folder
    if (parentId) {
      const parentNode = this.findNodeByKey(this.treeValue(), parentId);
      if (parentNode) parentNode.expanded = true;
    }

    // Immediately trigger rename mode and track as new creation
    this.creatingId.set(newId);
    this.startRename(newId, '');
  }

  protected startRename(id: string, currentLabel: string): void {
    this.editingId.set(id);
    this.editingValue.set(currentLabel === '(untitled folder)' ? '' : currentLabel);
  }

  protected commitRename(id: string): void {
    const value = this.editingValue().trim();
    if (this.editingId() === id) {
      if (!value) {
        // Name cannot be empty
        return;
      }

      // Check for duplicate names on the same level using unfiltered tree
      const allNodes = this.store.treeNodes();
      const nodeToRename = this.findNodeByKey(allNodes, id);
      if (nodeToRename) {
        const location = this.findNodeInTree(allNodes, nodeToRename);
        if (location) {
          const siblings = location.parent ? location.parent.children! : allNodes;
          const duplicate = siblings.some(s => s.key !== id && s.label?.toLowerCase() === value.toLowerCase());
          if (duplicate) {
            this.confirmationService.confirm({
              message: 'A file or folder with this name already exists at this location.',
              header: 'Duplicate Name',
              icon: 'pi pi-exclamation-triangle',
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
  }

  protected cancelRename(id?: string): void {
    const targetId = id ?? this.editingId();
    if (targetId && targetId === this.creatingId()) {
      // If we cancelled during initial creation, remove the ephemeral node
      this.store.deleteNode(targetId);
    }
    this.editingId.set(null);
    this.creatingId.set(null);
  }

  protected onDelete(data: NodeData): void {
    this.confirmationService.confirm({
      message: 'Are you sure you want to delete this item?',
      header: 'Confirm Deletion',
      icon: 'pi pi-info-circle',
      acceptButtonStyleClass: 'p-button-danger p-button-text',
      rejectButtonStyleClass: 'p-button-text',
      accept: () => {
        this.store.deleteNode(data.id);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Tree Helpers
  // ---------------------------------------------------------------------------

  private filterTree(
    nodes: TreeNode<NodeData>[],
    query: string,
  ): TreeNode<NodeData>[] {
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
            expanded: true,
          });
        }
      } else {
        if (labelMatch) result.push(node);
      }
    }
    return result;
  }

  private collectAllKeys(nodes: TreeNode<NodeData>[]): Set<string> {
    const keys = new Set<string>();
    const walk = (list: TreeNode<NodeData>[]) => {
      for (const n of list) {
        if (n.key) keys.add(n.key);
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

  private collectExpandedKeys(nodes: TreeNode<NodeData>[]): Set<string> {
    const keys = new Set<string>();
    const walk = (list: TreeNode<NodeData>[]) => {
      for (const n of list) {
        if (n.expanded && n.key) keys.add(n.key);
        if (n.children) walk(n.children);
      }
    };
    walk(nodes);
    return keys;
  }


  private copyNode(
    node: TreeNode<NodeData>,
    expandedKeys: Set<string>,
    parent?: TreeNode<NodeData>,
  ): TreeNode<NodeData> {
    // CRITICAL FIX: explicitly set the parent back reference so PrimeNG's 
    // native drag and drop (which does dragNode.parent.children.splice) 
    // splices from the correct array, preventing wrong node displacement!
    const copy: TreeNode<NodeData> = { ...node, parent };
    
    if (node.key && expandedKeys.has(node.key)) {
      copy.expanded = true;
    }
    if (node.children) {
      copy.children = node.children.map((c) => this.copyNode(c, expandedKeys, copy));
    }
    return copy;
  }
}
