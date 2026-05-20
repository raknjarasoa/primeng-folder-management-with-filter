import { LayoutInstance } from './layout-instance.model';

export interface FolderNode {
  id: string;
  kind: 'folder';
  name: string;
  children: TreeItem[];
}

export interface FileNode {
  id: string;
  kind: 'file';
}

export type TreeItem = FolderNode | FileNode;

export function isFolderNode(node: TreeItem): node is FolderNode {
  return node.kind === 'folder';
}

// A single visible row in the flattened tree consumed by cdk-virtual-scroll.
// Produced by flattenSessions() in tree-helpers.
export interface FlatRowData {
  id: string;
  kind: 'folder' | 'file';
  label: string;
  depth: number;
  expanded: boolean;
  hasChildren: boolean;
  layout?: LayoutInstance;
  isOther?: boolean;
}
