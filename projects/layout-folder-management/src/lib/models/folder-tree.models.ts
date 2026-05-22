import { LayoutInstance } from './layout-instance.model';

type FolderNode = {
  kind: 'folder';
  id: string;
  name: string;
  children: TreeItem[];
};

type FileNode = {
  kind: 'file';
  id: string;
};

export type TreeItem = FolderNode | FileNode;

/**
 * Represents a single visible row in the flattened tree structure consumed by cdk-virtual-scroll.
 * Produced by flattenSessions() in tree-helpers.ts.
 */
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


