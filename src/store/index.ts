import { AppData, Bookmark, Folder, Organization } from '../types';

const initialData: AppData = {
    activeOrgId: null,
    activeFolderId: 'dashboard',
    organizations: [
        { id: 'org_1', name: 'Acme Corp', color: 'blue' },
        { id: 'org_2', name: 'Personal Lab', color: 'green' }
    ],
    folders: [
        { id: 'f_1', name: 'Web Servers', orgId: 'org_1' },
        { id: 'f_2', name: 'Databases', orgId: 'org_1' },
        { id: 'f_3', name: 'Home Network', orgId: 'org_2' }
    ],
    bookmarks: [
        { 
            id: 'b_1', orgId: 'org_1', folderId: 'f_1', type: 'ip', 
            name: 'Primary Web', value: '192.168.10.5', 
            ports: [{proto: 'TCP', port: '80'}, {proto: 'TCP', port: '443'}] 
        },
        { 
            id: 'b_2', orgId: 'org_1', folderId: 'f_1', type: 'ip', 
            name: 'Secondary Web', value: '192.168.10.6', 
            ports: [{proto: 'TCP', port: '80'}] 
        },
        { 
            id: 'b_3', orgId: 'org_1', folderId: 'root', type: 'url', 
            name: 'Jira Dashboard', value: 'https://jira.acme.com', 
            ports: [] 
        },
        { 
            id: 'b_4', orgId: 'org_1', folderId: 'f_2', type: 'ip', 
            name: 'DB Master', value: '10.0.50.100', 
            ports: [{proto: 'TCP', port: '5432'}] 
        }
    ]
};

export class Store {
    data: AppData;

    constructor() {
        const saved = localStorage.getItem('netmark_data');
        this.data = saved ? JSON.parse(saved) : initialData;
        
        // Ensure data integrity matching interface
        if (!this.data.bookmarks) this.data.bookmarks = [];
        if (!this.data.folders) this.data.folders = [];
        if (!this.data.organizations) this.data.organizations = [];

        if (!this.data.activeOrgId && this.data.organizations.length > 0) {
            this.data.activeOrgId = this.data.organizations[0].id;
        }
        this.save();
        this.cleanupTrash();
    }

    save() {
        localStorage.setItem('netmark_data', JSON.stringify(this.data));
        window.dispatchEvent(new CustomEvent('store-updated'));
    }

    cleanupTrash() {
        const twoMinutesAgo = Date.now() - (2 * 60 * 1000);
        const initialCount = this.data.bookmarks.length;
        
        this.data.bookmarks = this.data.bookmarks.filter(b => {
             // Keep if not in trash OR (in trash AND not yet expired)
            return !(b.folderId === 'trash' && b.deletedAt && b.deletedAt < twoMinutesAgo);
        });

        if (this.data.bookmarks.length !== initialCount) {
            this.save();
            console.log('Auto-deleted expired trash items');
        }
    }

    get activeOrg(): Organization | undefined {
        return this.data.organizations.find(o => o.id === this.data.activeOrgId);
    }

    get currentBookmarks(): Bookmark[] {
        let items = this.data.bookmarks.filter(b => b.orgId === this.data.activeOrgId);
        if (this.data.activeFolderId === 'dashboard') {
            return items.filter(b => b.folderId !== 'trash');
        }
        if (this.data.activeFolderId !== 'root' && this.data.activeFolderId !== 'search' && this.data.activeFolderId !== 'trash') {
            items = items.filter(b => b.folderId === this.data.activeFolderId);
        } else if (this.data.activeFolderId === 'root') {
            items = items.filter(b => b.folderId === 'root');
        } else if (this.data.activeFolderId === 'trash') {
            items = items.filter(b => b.folderId === 'trash');
        }
        return items;
    }
}
