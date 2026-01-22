export interface Port {
    proto: string;
    port: string;
}

export interface Bookmark {
    id: string;
    orgId: string;
    folderId: string;
    type: 'ip' | 'url';
    name: string;
    value: string;
    ports: Port[];
    createdAt?: number;
    deletedAt?: number;
}

export interface Folder {
    id: string;
    name: string;
    orgId: string;
}

export interface Organization {
    id: string;
    name: string;
    color: string;
}

export interface AppData {
    activeOrgId: string | null;
    activeFolderId: string;
    organizations: Organization[];
    folders: Folder[];
    bookmarks: Bookmark[];
}
