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

export function isFolder(node: SessionNode): node is FolderNode {
  return node.kind === 'folder';
}

export function isFile(node: SessionNode): node is FileNode {
  return node.kind === 'file';
}

export interface Layout {
  id: string;
  name: string;
  lastUpdated: string;
  lastViewDate: string;
  username?: string;
  description?: string;
}

export interface NodeData {
  id: string;
  kind: 'folder' | 'file';
  layout?: Layout;
  isOther?: boolean;
}
