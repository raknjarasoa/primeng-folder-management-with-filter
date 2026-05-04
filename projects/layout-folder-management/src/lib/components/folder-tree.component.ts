import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
  computed,
  linkedSignal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule, DatePipe } from '@angular/common';
import { TreeModule, TreeNodeDropEvent } from 'primeng/tree';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { TreeDragDropService, TreeNode } from 'primeng/api';

import { FolderTreeStore } from '../store/folder-tree.store';
import { NodeData, SessionNode, Layout } from '../models/folder-tree.models';

@Component({
  selector: 'app-folder-tree',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    TreeModule,
    ButtonModule,
    InputTextModule,
    IconFieldModule,
    InputIconModule,
    DatePipe,
  ],
  providers: [TreeDragDropService, FolderTreeStore],
  templateUrl: './folder-tree.component.html',
  styleUrl: './folder-tree.component.css',
})
export class FolderTreeComponent {
  // --- Data Inputs ---
  sessions = input<SessionNode[]>([]);
  layouts = input<Layout[]>([]);
  selectedFileId = input<string | null>(null);

  // --- Outputs ---
  sessionsChange = output<SessionNode[]>();
  selectedFileIdChange = output<string | null>();

  protected readonly store = inject(FolderTreeStore);

  // --- Local UI State ---
  protected readonly editingId = signal<string | null>(null);
  protected readonly editingValue = signal<string>('');
  protected readonly filterText = signal<string>('');
  
  protected readonly isFiltering = computed(() => this.filterText().trim().length > 0);

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
      filter: this.filterText().trim().toLowerCase(),
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
      
      return this.deepCopyWithExpanded(filtered, keysToExpand);
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
          this.sessionsChange.emit(currentSessions);
          this.selectedFileIdChange.emit(selectedId);
        }
      });
    });
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
    }, 0);
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

  protected onAddFolder(parentId: string | null = null): void {
    const name = prompt('New folder name:', 'New folder');
    if (!name?.trim()) return;
    this.store.addFolder(parentId, name.trim());
    // Auto-expand the parent folder
    if (parentId) {
      const parentNode = this.findNodeByKey(this.treeValue(), parentId);
      if (parentNode) parentNode.expanded = true;
    }
  }

  protected startRename(id: string, currentLabel: string): void {
    this.editingId.set(id);
    this.editingValue.set(currentLabel);
  }

  protected commitRename(id: string): void {
    const value = this.editingValue();
    if (this.editingId() === id) {
      this.store.renameFolder(id, value);
      this.editingId.set(null);
    }
  }

  protected cancelRename(): void {
    this.editingId.set(null);
  }

  protected onDelete(data: NodeData): void {
    const what = data.kind === 'folder' ? 'folder' : 'file';
    if (confirm(`Delete this ${what}?`)) {
      this.store.deleteNode(data.id);
    }
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
      const labelMatch = (node.label ?? '').toLowerCase().includes(query);
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

  private deepCopyWithExpanded(
    nodes: TreeNode<NodeData>[],
    expandedKeys: Set<string>,
    parent?: TreeNode<NodeData>,
  ): TreeNode<NodeData>[] {
    return nodes.map((n) => this.copyNode(n, expandedKeys, parent));
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
