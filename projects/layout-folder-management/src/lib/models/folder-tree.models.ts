export interface FolderNode {
  id: string;
  kind: 'folder';
  name: string;
  children: SessionNode[];
}

export interface FileNode {
  id: string;
  kind: 'file';
}

export type SessionNode = FolderNode | FileNode;

export function isFolderNode(node: SessionNode): node is FolderNode {
  return node.kind === 'folder';
}

export type LayoutInstance = {
  id: string;
  name: string;
  lastUpdated: string;
  lastViewDate: string;
  username?: string;
  description?: string;
}

// A single visible row in the flattened tree consumed by cdk-virtual-scroll.
// Produced by flattenSessions() in tree-helpers.
export interface FlatRow {
  id: string;
  kind: 'folder' | 'file';
  label: string;
  depth: number;
  expanded: boolean;
  hasChildren: boolean;
  layout?: LayoutInstance;
  isOther?: boolean;
}
