import { LayoutInstance } from './layout-instance.model';

type FolderNode = {
  id: string;
  kind: 'folder';
  name: string;
  children: TreeItem[];
};

type FileNode = {
  id: string;
  kind: 'file';
};

export type TreeItem = FolderNode | FileNode;

// A single visible row in the flattened tree consumed by cdk-virtual-scroll.
// Produced by flattenSessions() in tree-helpers.
export type FlatRowData = {
  id: string;
  kind: 'folder' | 'file';
  label: string;
  depth: number;
  expanded: boolean;
  hasChildren: boolean;
  layout?: LayoutInstance;
  isOther?: boolean;
};

export function isFolderNode(node: TreeItem): node is FolderNode {
  return node.kind === 'folder';
}


