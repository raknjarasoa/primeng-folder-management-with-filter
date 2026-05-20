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

export function isFileNode(node: SessionNode): node is FileNode {
  return node.kind === 'file';
}

export type LayoutInstance = {
  id: string;
  name: string;
  lastUpdated: string;
  lastViewDate: string;
  username?: string;
  description?: string;
}

export type NodeData = {
  id: string;
  kind: 'folder' | 'file';
  layout?: LayoutInstance;
  isOther?: boolean;
}
