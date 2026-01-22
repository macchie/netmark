import { Store } from './store';
import { generateId, isIP, getSubnet } from './utils';
import { Bookmark, Port } from './types';

// Declare types for window app
declare global {
    interface Window {
        app: AppController;
    }
}

export class AppController {
    store: Store;
    tempPorts: Port[] = [];
    editingId: string | null = null;
    sidebarOpen: boolean = false;

    constructor() {
        this.store = new Store();
    }

    init() {
        this.setupEventListeners();
        this.render();
        
        setInterval(() => {
            this.store.cleanupTrash();
        }, 5000);

        setInterval(() => {
            if (this.store.data.activeFolderId === 'trash') {
                this.updateTrashTimers();
            }
        }, 1000);
    }

    setupEventListeners() {
        const orgDropdownBtn = document.getElementById('orgDropdownBtn');
        if (orgDropdownBtn) {
            orgDropdownBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const menu = document.getElementById('orgDropdownMenu');
                menu?.classList.toggle('hidden');
            });
        }
        
        document.addEventListener('click', () => {
            document.getElementById('orgDropdownMenu')?.classList.add('hidden');
        });

        const searchInput = document.getElementById('searchInput') as HTMLInputElement;
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const target = e.target as HTMLInputElement;
                const term = target.value.toLowerCase();
                if (term.length > 0) {
                    this.store.data.activeFolderId = 'search';
                    this.renderMain(term);
                } else {
                    if (this.store.data.activeFolderId === 'search') {
                            this.store.data.activeFolderId = 'dashboard';
                    }
                    this.renderMain();
                }
            });
        }
    }

    toggleSidebar() {
        this.sidebarOpen = !this.sidebarOpen;
        const sidebar = document.getElementById('appSidebar');
        const overlay = document.getElementById('sidebarOverlay');
        
        if (this.sidebarOpen) {
            sidebar?.classList.remove('-translate-x-full');
            overlay?.classList.remove('hidden');
            setTimeout(() => overlay?.classList.remove('opacity-0'), 10);
        } else {
            sidebar?.classList.add('-translate-x-full');
            overlay?.classList.add('opacity-0');
            setTimeout(() => overlay?.classList.add('hidden'), 300);
        }
    }

    confirmAction(title: string, message: string, confirmBtnText: string, confirmBtnColor: string, actionCallback: () => void) {
        const overlay = document.getElementById('modalOverlay');
        const content = document.getElementById('modalContent');
        if (!overlay || !content) return;

        overlay.classList.remove('hidden');

        content.innerHTML = `
            <div class="text-center mb-6">
                <div class="w-12 h-12 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i class="fa-solid fa-triangle-exclamation text-xl"></i>
                </div>
                <h3 class="text-xl font-bold text-slate-800 mb-2">${title}</h3>
                <p class="text-slate-500 text-sm">${message}</p>
            </div>
            <div class="flex justify-center gap-3 mt-6">
                <button id="cancelConfirmBtn" class="px-5 py-2.5 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium transition-colors">Cancel</button>
                <button id="confirmActionBtn" class="px-5 py-2.5 ${confirmBtnColor} text-white rounded-lg text-sm font-medium shadow-lg transition-all">${confirmBtnText}</button>
            </div>
        `;

        const cancelBtn = document.getElementById('cancelConfirmBtn');
        const confirmBtn = document.getElementById('confirmActionBtn');

        if (cancelBtn) cancelBtn.onclick = () => this.closeModal();
        if (confirmBtn) confirmBtn.onclick = () => {
            actionCallback();
            this.closeModal();
        };
    }

    updateTrashTimers() {
        const timers = document.querySelectorAll('.trash-timer');
        if (timers.length === 0) return;

        const now = Date.now();
        timers.forEach(el => {
            const htmlEl = el as HTMLElement;
            const expiresAt = parseInt(htmlEl.dataset.expires || '0');
            const diff = expiresAt - now;

            if (diff > 0) {
                const m = Math.floor(diff / 60000);
                const s = Math.floor((diff % 60000) / 1000);
                const sStr = s < 10 ? '0' + s : s;
                htmlEl.innerText = `Expires in ${m}:${sStr}`;
            } else {
                htmlEl.innerText = 'Deleting...';
            }
        });
    }

    setOrg(id: string) {
        this.store.data.activeOrgId = id;
        this.store.data.activeFolderId = 'dashboard';
        this.store.save();
        if(window.innerWidth < 768) this.toggleSidebar();
        this.render(); 
    }

    setFolder(id: string) {
        this.store.data.activeFolderId = id;
        const searchInput = document.getElementById('searchInput') as HTMLInputElement;
        if (searchInput) searchInput.value = ''; 
        this.store.save();
        if(window.innerWidth < 768) this.toggleSidebar();
        this.render(); 
    }

    addOrg(name: string) {
        if(!name.trim()) return;
        this.store.data.organizations.push({ id: generateId(), name, color: 'blue' });
        this.store.save();
        this.closeModal();
        this.toast('Organization created');
        this.render(); 
    }

    addFolder(name: string) {
        if(!name.trim()) return;
        this.store.data.folders.push({
            id: generateId(),
            name,
            orgId: this.store.data.activeOrgId!
        });
        this.store.save();
        this.closeModal();
        this.toast('Folder created');
        this.render(); 
    }

    addBookmark(data: Partial<Bookmark>) {
        this.store.data.bookmarks.push({
            id: generateId(),
            orgId: this.store.data.activeOrgId!,
            folderId: data.folderId || (['dashboard', 'search', 'trash'].includes(this.store.data.activeFolderId) ? 'root' : this.store.data.activeFolderId),
            createdAt: Date.now(),
            type: data.type || 'url',
            name: data.name || 'New Bookmark',
            value: data.value || '',
            ports: data.ports || []
        });
        this.store.save();
        this.closeModal();
        this.toast('Bookmark added');
        this.render(); 
    }

    editBookmark(id: string) {
        const b = this.store.data.bookmarks.find(item => item.id === id);
        if (!b) return;

        this.editingId = id;
        this.tempPorts = JSON.parse(JSON.stringify(b.ports));
        this.openModal('bookmarkModal');
    }

    updateBookmark(id: string, data: Partial<Bookmark>) {
        const index = this.store.data.bookmarks.findIndex(b => b.id === id);
        if (index !== -1) {
            const existing = this.store.data.bookmarks[index];
            this.store.data.bookmarks[index] = { 
                ...existing, 
                ...data,
                orgId: existing.orgId 
            };
            this.store.save();
            this.closeModal();
            this.toast('Bookmark updated');
            this.render(); 
        }
    }

    deleteBookmark(id: string) {
        const b = this.store.data.bookmarks.find(item => item.id === id);
        if (!b) return;

        if (b.folderId === 'trash') {
            this.confirmAction(
                'Delete Permanently',
                'Are you sure you want to delete this bookmark permanently? This action cannot be undone.',
                'Delete',
                'bg-red-600 hover:bg-red-700 shadow-red-500/20',
                () => {
                    this.store.data.bookmarks = this.store.data.bookmarks.filter(item => item.id !== id);
                    this.store.save();
                    this.toast('Deleted permanently');
                    this.render(); 
                }
            );
        } else {
            this.confirmAction(
                'Move to Trash',
                'This bookmark will be moved to Trash and permanently deleted after 2 minutes.',
                'Move to Trash',
                'bg-red-600 hover:bg-red-700 shadow-red-500/20',
                () => {
                    b.folderId = 'trash';
                    b.deletedAt = Date.now();
                    this.store.save();
                    this.toast('Moved to Trash');
                    this.render(); 
                }
            );
        }
    }

    restoreBookmark(id: string) {
        const b = this.store.data.bookmarks.find(item => item.id === id);
        if (b && b.folderId === 'trash') {
            b.folderId = 'root';
            delete b.deletedAt;
            this.store.save();
            this.toast('Restored to Root');
            this.render(); 
        }
    }

    deleteFolder(id: string) {
        this.confirmAction(
            'Delete Folder',
            'Deleting this folder will move all its bookmarks to the Root Directory. Continue?',
            'Delete Folder',
            'bg-red-600 hover:bg-red-700 shadow-red-500/20',
            () => {
                this.store.data.bookmarks.forEach(b => {
                    if (b.folderId === id) b.folderId = 'root';
                });
                this.store.data.folders = this.store.data.folders.filter(f => f.id !== id);
                
                if (this.store.data.activeFolderId === id) {
                    this.store.data.activeFolderId = 'dashboard';
                }
                
                this.store.save();
                this.toast('Folder deleted');
                this.render(); 
            }
        );
    }

    resetData() {
        this.confirmAction(
            'Reset Data',
            'This will wipe all data and restore default values. This cannot be undone. Are you sure?',
            'Reset Everything',
            'bg-red-600 hover:bg-red-700 shadow-red-500/20',
            () => {
                localStorage.removeItem('netmark_data');
                location.reload();
            }
        );
    }

    // --- Rendering ---
    
    render() {
        if (!this.store) return;
        const org = this.store.activeOrg;
        if (!org) return;

        const currentOrgName = document.getElementById('currentOrgName');
        if(currentOrgName) currentOrgName.innerText = org.name;

        // Org Dropdown
        const orgListHTML = this.store.data.organizations.map(o => `
            <div onclick="app.setOrg('${o.id}')" class="px-4 py-3 hover:bg-slate-700 cursor-pointer text-sm text-slate-300 hover:text-white flex items-center justify-between border-b border-slate-700/50 last:border-0 transition-colors">
                <div class="flex items-center gap-2">
                    <div class="w-2 h-2 rounded-full ${o.id === this.store.data.activeOrgId ? 'bg-blue-400' : 'bg-slate-600'}"></div>
                    <span>${o.name}</span>
                </div>
                ${o.id === this.store.data.activeOrgId ? '<i class="fa-solid fa-check text-blue-400 text-xs"></i>' : ''}
            </div>
        `).join('');
        const orgDropdownMenu = document.getElementById('orgDropdownMenu');
        if(orgDropdownMenu) orgDropdownMenu.innerHTML = orgListHTML;

        // Folders
        const orgFolders = this.store.data.folders.filter(f => f.orgId === org.id);
        const activeId = this.store.data.activeFolderId;
        
        let folderHTML = `
            <div onclick="app.setFolder('dashboard')" class="cursor-pointer px-3 py-2.5 rounded-lg flex items-center gap-3 text-sm font-medium transition-all ${activeId === 'dashboard' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white'} mb-2">
                <i class="fa-solid fa-chart-pie w-4 text-center"></i>
                <span>Dashboard</span>
            </div>
            
            <div class="px-3 py-1 text-[10px] uppercase font-bold text-slate-600 tracking-wider">Storage</div>

            <div onclick="app.setFolder('root')" class="cursor-pointer px-3 py-2.5 rounded-lg flex items-center gap-3 text-sm font-medium transition-all ${activeId === 'root' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}">
                <i class="fa-solid fa-layer-group w-4 text-center"></i>
                <span>All Root Items</span>
            </div>
        `;

        folderHTML += orgFolders.map(f => `
            <div class="group/folder flex items-center justify-between cursor-pointer px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${activeId === f.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}">
                <div class="flex items-center gap-3 flex-1 overflow-hidden" onclick="app.setFolder('${f.id}')">
                    <i class="fa-regular fa-folder w-4 text-center"></i>
                    <span class="truncate">${f.name}</span>
                </div>
                <button onclick="app.deleteFolder('${f.id}')" class="md:opacity-0 group-hover/folder:opacity-100 p-1.5 hover:text-red-400 transition-all rounded hover:bg-black/20" title="Delete Folder">
                    <i class="fa-solid fa-trash-can text-xs"></i>
                </button>
            </div>
        `).join('');

        const folderList = document.getElementById('folderList');
        if(folderList) folderList.innerHTML = folderHTML;

        const trashHTML = `
            <div onclick="app.setFolder('trash')" class="cursor-pointer px-3 py-2.5 rounded-lg flex items-center gap-3 text-sm font-medium transition-all ${activeId === 'trash' ? 'bg-red-900/30 text-red-400 border border-red-900/50' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}">
                <i class="fa-solid fa-trash-can w-4 text-center"></i>
                <span>Trash</span>
                ${this.store.data.bookmarks.filter(b => b.orgId === org.id && b.folderId === 'trash').length > 0 ? '<span class="ml-auto w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>' : ''}
            </div>
        `;
        const trashContainer = document.getElementById('trashContainer');
        if(trashContainer) trashContainer.innerHTML = trashHTML;

        this.renderMain();
    }

    renderDashboard() {
        const view = document.getElementById('mainView');
        if(!view) return;

        const orgId = this.store.data.activeOrgId;
        const org = this.store.activeOrg;
        if(!org) return;

        const bookmarks = this.store.data.bookmarks.filter(b => b.orgId === orgId && b.folderId !== 'trash');
        const folders = this.store.data.folders.filter(f => f.orgId === orgId);
        const trashCount = this.store.data.bookmarks.filter(b => b.orgId === orgId && b.folderId === 'trash').length;
        
        const total = bookmarks.length;
        const ips = bookmarks.filter(b => b.type === 'ip').length;
        const urls = bookmarks.filter(b => b.type === 'url').length;
        const recent = [...bookmarks].reverse().slice(0, 5);

        const statsCard = (title: string, count: number, icon: string, color: string) => `
            <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between group hover:shadow-md transition-all">
                <div>
                    <p class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">${title}</p>
                    <p class="text-2xl font-bold text-slate-800">${count}</p>
                </div>
                <div class="w-12 h-12 rounded-lg ${color} flex items-center justify-center text-xl shadow-sm group-hover:scale-110 transition-transform">
                    <i class="${icon}"></i>
                </div>
            </div>
        `;

        let html = `
            <div class="animate-fade-in max-w-6xl mx-auto">
                <div class="mb-8">
                    <h2 class="text-2xl font-bold text-slate-800 mb-2">Overview</h2>
                    <p class="text-slate-500 text-sm">Welcome back to ${org.name}. Here's what's happening.</p>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                    ${statsCard('Total Bookmarks', total, 'fa-solid fa-bookmark', 'bg-blue-100 text-blue-600')}
                    ${statsCard('IP Addresses', ips, 'fa-solid fa-server', 'bg-emerald-100 text-emerald-600')}
                    ${statsCard('Trash Items', trashCount, 'fa-solid fa-trash-can', 'bg-red-100 text-red-600')}
                </div>
                <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div class="lg:col-span-2">
                        <h3 class="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">Quick Access</h3>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div onclick="app.setFolder('root')" class="cursor-pointer bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:border-blue-500 hover:shadow-md transition-all group flex items-center gap-4">
                                <div class="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                                    <i class="fa-solid fa-layer-group text-lg"></i>
                                </div>
                                <div>
                                    <h4 class="font-bold text-slate-800 group-hover:text-blue-600 transition-colors">Root Directory</h4>
                                    <p class="text-xs text-slate-400">${bookmarks.filter(b => b.folderId === 'root').length} items</p>
                                </div>
                            </div>
                            ${folders.map(f => {
                                const count = bookmarks.filter(b => b.folderId === f.id).length;
                                return `
                                <div onclick="app.setFolder('${f.id}')" class="cursor-pointer bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:border-blue-500 hover:shadow-md transition-all group flex items-center gap-4">
                                    <div class="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                                        <i class="fa-regular fa-folder text-lg"></i>
                                    </div>
                                    <div>
                                        <h4 class="font-bold text-slate-800 group-hover:text-blue-600 transition-colors truncate max-w-[150px]">${f.name}</h4>
                                        <p class="text-xs text-slate-400">${count} items</p>
                                    </div>
                                </div>
                                `
                            }).join('')}
                            <div onclick="app.openModal('folderModal')" class="cursor-pointer bg-slate-50/50 p-4 rounded-xl border-2 border-dashed border-slate-200 hover:border-blue-400 hover:bg-blue-50/30 transition-all flex items-center justify-center gap-2 text-slate-400 hover:text-blue-500">
                                <i class="fa-solid fa-plus"></i>
                                <span class="font-medium text-sm">Create Folder</span>
                            </div>
                        </div>
                    </div>
                    <div>
                        <h3 class="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">Recently Added</h3>
                        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                            ${recent.length > 0 ? recent.map(b => `
                                <div class="p-3 border-b border-slate-100 last:border-0 hover:bg-slate-50 flex items-center gap-3">
                                    <div class="w-8 h-8 rounded ${b.type === 'url' ? 'bg-indigo-100 text-indigo-500' : 'bg-emerald-100 text-emerald-500'} flex items-center justify-center text-xs">
                                        <i class="fa-solid ${b.type === 'url' ? 'fa-globe' : 'fa-server'}"></i>
                                    </div>
                                    <div class="min-w-0 flex-1">
                                        <p class="text-sm font-medium text-slate-800 truncate">${b.name}</p>
                                        <p class="text-xs text-slate-400 truncate font-mono">${b.value}</p>
                                    </div>
                                </div>
                            `).join('') : `
                                <div class="p-6 text-center text-slate-400 text-sm italic">No recent activity</div>
                            `}
                        </div>
                    </div>
                </div>
            </div>
        `;

        view.innerHTML = html;
        const pageTitle = document.getElementById('pageTitle');
        if(pageTitle) pageTitle.innerText = 'Dashboard';
        const itemCount = document.getElementById('itemCount');
        if(itemCount) itemCount.innerText = '';
    }

    renderMain(searchTerm: string | null = null) {
        if (this.store.data.activeFolderId === 'dashboard' && !searchTerm) {
            this.renderDashboard();
            return;
        }

        const view = document.getElementById('mainView');
        if(!view) return;

        let bookmarks: Bookmark[];
        
        const pageTitle = document.getElementById('pageTitle');

        if (searchTerm) {
            bookmarks = this.store.data.bookmarks.filter(b => 
                b.orgId === this.store.data.activeOrgId && 
                (b.name.toLowerCase().includes(searchTerm) || b.value.includes(searchTerm))
            );
            if(pageTitle) pageTitle.innerText = `Search: "${searchTerm}"`;
        } else {
            bookmarks = this.store.currentBookmarks;
            const activeFolder = this.store.data.folders.find(f => f.id === this.store.data.activeFolderId);
            if (this.store.data.activeFolderId === 'trash') {
                if(pageTitle) pageTitle.innerText = 'Trash (Auto-delete in 2m)';
            } else {
                if(pageTitle) pageTitle.innerText = activeFolder ? activeFolder.name : 'Root Directory';
            }
        }

        const countEl = document.getElementById('itemCount');
        if(countEl) countEl.innerText = `${bookmarks.length} ITEMS`;

        if (bookmarks.length === 0) {
            const isTrash = this.store.data.activeFolderId === 'trash';
            view.innerHTML = `
                <div class="h-full flex flex-col items-center justify-center text-slate-400 p-8 text-center animate-fade-in">
                    <div class="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-6">
                        <i class="fa-regular ${isTrash ? 'fa-trash-can' : 'fa-folder-open'} text-3xl text-slate-300"></i>
                    </div>
                    <h3 class="text-lg font-semibold text-slate-600 mb-2">${isTrash ? 'Trash is Empty' : 'It\'s empty here'}</h3>
                    <p class="text-sm max-w-xs mx-auto">${isTrash ? 'Items moved here will be deleted automatically.' : 'Start by adding a new bookmark or folder using the buttons above.'}</p>
                </div>
            `;
            return;
        }

        const urls = bookmarks.filter(b => b.type === 'url').sort((a,b) => a.name.localeCompare(b.name));
        const ips = bookmarks.filter(b => b.type === 'ip').sort((a,b) => a.value.localeCompare(b.value, undefined, { numeric: true }));

        const ipGroups: Record<string, Bookmark[]> = {};
        ips.forEach(ip => {
            const subnet = getSubnet(ip.value);
            if(!ipGroups[subnet]) ipGroups[subnet] = [];
            ipGroups[subnet].push(ip);
        });

        let html = '';

        if (urls.length > 0) {
            html += `
            <div class="mb-8 animate-slide-up" style="animation-delay: 0ms;">
                <div class="flex items-center gap-2 mb-4 ml-1">
                    <div class="w-1 h-4 bg-indigo-500 rounded-full"></div>
                    <h3 class="text-xs font-bold text-slate-400 uppercase tracking-widest">Web Resources</h3>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
                    ${urls.map(b => this.createCard(b)).join('')}
                </div>
            </div>`;
        }

        let delay = 100;
        Object.keys(ipGroups).sort().forEach(subnet => {
            html += `
            <div class="mb-8 animate-slide-up" style="animation-delay: ${delay}ms;">
                <div class="flex items-center gap-2 mb-4 ml-1">
                    <div class="w-1 h-4 bg-emerald-500 rounded-full"></div>
                    <h3 class="text-xs font-bold text-slate-400 uppercase tracking-widest font-mono">Subnet: ${subnet}</h3>
                    <span class="text-[10px] bg-slate-100 text-slate-400 px-2 py-0.5 rounded-full font-mono">${ipGroups[subnet].length}</span>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
                    ${ipGroups[subnet].map(b => this.createCard(b)).join('')}
                </div>
            </div>`;
            delay += 50;
        });

        view.innerHTML = html;

        if (this.store.data.activeFolderId === 'trash') {
            this.updateTrashTimers();
        }
    }

    createCard(b: Bookmark) {
        const isUrl = b.type === 'url';
        const isTrash = b.folderId === 'trash';
        const icon = isUrl ? 'fa-globe' : 'fa-server';
        const colorClass = isUrl ? 'text-indigo-600 bg-indigo-50 border-indigo-100' : 'text-emerald-600 bg-emerald-50 border-emerald-100';
        const accentBorder = isUrl ? 'border-t-indigo-500' : 'border-t-emerald-500';
        
        const portsHtml = b.ports.map(p => 
            `<span class="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-mono font-medium bg-slate-50 text-slate-600 border border-slate-200">
                ${p.port}<span class="text-slate-400 ml-1.5 opacity-70">${p.proto}</span>
            </span>`
        ).join('');

        let trashInfo = '';
        if (isTrash && b.deletedAt) {
            const expiresAt = b.deletedAt + 120000;
            trashInfo = `<span class="trash-timer text-[10px] text-red-400 font-mono ml-auto" data-expires="${expiresAt}">Calculating...</span>`;
        }

        const actions = isTrash ? `
            <button onclick="app.restoreBookmark('${b.id}')" class="w-7 h-7 flex items-center justify-center rounded-full text-slate-400 hover:text-green-600 hover:bg-green-50 transition-colors" title="Restore">
                <i class="fa-solid fa-rotate-left text-xs"></i>
            </button>
            <button onclick="app.deleteBookmark('${b.id}')" class="w-7 h-7 flex items-center justify-center rounded-full text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Delete Permanently">
                <i class="fa-solid fa-ban text-xs"></i>
            </button>
        ` : `
            <button onclick="app.editBookmark('${b.id}')" class="w-7 h-7 flex items-center justify-center rounded-full text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Edit">
                <i class="fa-solid fa-pen text-xs"></i>
            </button>
            <button onclick="app.deleteBookmark('${b.id}')" class="w-7 h-7 flex items-center justify-center rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete">
                <i class="fa-solid fa-trash text-xs"></i>
            </button>
        `;

        return `
        <div class="group bg-white rounded-xl border border-slate-200 border-t-4 ${isTrash ? 'border-t-slate-400 opacity-80' : accentBorder} shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 p-4 relative flex flex-col h-full">
            <div class="flex items-start justify-between mb-3">
                <div class="flex items-center gap-3 min-w-0">
                    <div class="w-10 h-10 rounded-lg ${isTrash ? 'bg-slate-100 text-slate-400' : colorClass} flex items-center justify-center flex-shrink-0 shadow-sm">
                        <i class="fa-solid ${icon} text-lg"></i>
                    </div>
                    <div class="min-w-0 flex-1">
                        <h4 class="font-bold text-slate-800 text-sm truncate" title="${b.name}">${b.name}</h4>
                        <div class="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5 group/link cursor-pointer" onclick="app.copyToClipboard('${b.value}')">
                            <span class="font-mono truncate select-all hover:text-blue-600 transition-colors">${b.value}</span>
                            ${!isTrash ? '<i class="fa-regular fa-copy text-[10px] md:opacity-0 group-hover/link:opacity-100 transition-opacity text-blue-400"></i>' : ''}
                        </div>
                    </div>
                </div>
                <div class="flex items-center gap-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity bg-white/80 backdrop-blur-sm rounded-lg relative z-10">
                    ${actions}
                </div>
            </div>
            
            <div class="flex-1 mt-auto pt-2 flex flex-wrap gap-1.5 content-end items-center">
                ${portsHtml || '<span class="text-[10px] text-slate-300 italic pl-1">No ports</span>'}
                ${trashInfo}
            </div>

            <a href="${isUrl && !isTrash ? b.value : '#'}" target="_blank" class="${!isUrl || isTrash ? 'hidden' : ''} absolute inset-0 z-0"></a>
        </div>
        `;
    }

    openModal(type: string) {
        const overlay = document.getElementById('modalOverlay');
        const content = document.getElementById('modalContent');
        if(!overlay || !content) return;

        overlay.classList.remove('hidden');
        
        if (!this.editingId) {
            this.tempPorts = [];
        }

        if (type === 'orgModal') {
            content.innerHTML = `
                <div class="flex justify-between items-center mb-6">
                    <h3 class="text-xl font-bold text-slate-800">New Organization</h3>
                    <button onclick="app.closeModal()" class="text-slate-400 hover:text-slate-600"><i class="fa-solid fa-xmark text-lg"></i></button>
                </div>
                <div class="space-y-4">
                    <div>
                        <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Organization Name</label>
                        <input id="newOrgName" class="w-full bg-slate-50 border border-slate-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" placeholder="e.g. Acme Corp">
                    </div>
                </div>
                <div class="flex justify-end gap-3 mt-8">
                    <button onclick="app.closeModal()" class="px-5 py-2.5 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium transition-colors">Cancel</button>
                    <button onclick="app.addOrg((document.getElementById('newOrgName') as HTMLInputElement).value)" class="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 shadow-lg shadow-blue-500/20 transition-all">Create Org</button>
                </div>
            `;
        } else if (type === 'folderModal') {
            content.innerHTML = `
                <div class="flex justify-between items-center mb-6">
                    <h3 class="text-xl font-bold text-slate-800">New Folder</h3>
                    <button onclick="app.closeModal()" class="text-slate-400 hover:text-slate-600"><i class="fa-solid fa-xmark text-lg"></i></button>
                </div>
                <div class="space-y-4">
                    <div>
                        <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Folder Name</label>
                        <input id="newFolderName" class="w-full bg-slate-50 border border-slate-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" placeholder="e.g. Web Servers">
                    </div>
                </div>
                <div class="flex justify-end gap-3 mt-8">
                    <button onclick="app.closeModal()" class="px-5 py-2.5 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium transition-colors">Cancel</button>
                    <button onclick="app.addFolder((document.getElementById('newFolderName') as HTMLInputElement).value)" class="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 shadow-lg shadow-blue-500/20 transition-all">Create Folder</button>
                </div>
            `;
        } else if (type === 'bookmarkModal') {
            const currentFolders = this.store.data.folders.filter(f => f.orgId === this.store.data.activeOrgId);
            const isEdit = !!this.editingId;
            const bookmark = isEdit ? this.store.data.bookmarks.find(b => b.id === this.editingId) : null;
            
            let activeFolderId;
            if (isEdit && bookmark) {
                activeFolderId = bookmark.folderId;
            } else if (this.store.data.activeFolderId === 'dashboard' || this.store.data.activeFolderId === 'search') {
                activeFolderId = 'root';
            } else {
                activeFolderId = this.store.data.activeFolderId;
            }

            const nameVal = isEdit && bookmark ? bookmark.name : '';
            const valueVal = isEdit && bookmark ? bookmark.value : '';
            const typeVal = isEdit && bookmark ? bookmark.type : 'url';
            
            const folderOptions = `
                <option value="root" ${activeFolderId === 'root' ? 'selected' : ''}>All Root Items</option>
                ${currentFolders.map(f => `<option value="${f.id}" ${activeFolderId === f.id ? 'selected' : ''}>${f.name}</option>`).join('')}
            `;

            content.innerHTML = `
                <div class="flex justify-between items-center mb-6">
                    <h3 class="text-xl font-bold text-slate-800">${isEdit ? 'Edit Bookmark' : 'Add Bookmark'}</h3>
                    <button onclick="app.closeModal()" class="text-slate-400 hover:text-slate-600"><i class="fa-solid fa-xmark text-lg"></i></button>
                </div>
                <div class="space-y-5">
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Type</label>
                            <div class="flex bg-slate-100 p-1 rounded-lg">
                                <label class="flex-1 text-center cursor-pointer">
                                    <input type="radio" name="bType" value="url" class="peer hidden" ${typeVal === 'url' ? 'checked' : ''} onchange="app.toggleInputType(this.value)">
                                    <span class="block py-1.5 text-xs font-semibold text-slate-500 rounded-md peer-checked:bg-white peer-checked:text-blue-600 peer-checked:shadow-sm transition-all">URL</span>
                                </label>
                                <label class="flex-1 text-center cursor-pointer">
                                    <input type="radio" name="bType" value="ip" class="peer hidden" ${typeVal === 'ip' ? 'checked' : ''} onchange="app.toggleInputType(this.value)">
                                    <span class="block py-1.5 text-xs font-semibold text-slate-500 rounded-md peer-checked:bg-white peer-checked:text-emerald-600 peer-checked:shadow-sm transition-all">IP</span>
                                </label>
                            </div>
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Folder</label>
                            <select id="bFolder" class="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none h-[38px]">
                                ${folderOptions}
                            </select>
                        </div>
                    </div>

                    <div class="space-y-3">
                        <div>
                            <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Display Name</label>
                            <input id="bName" value="${nameVal}" class="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" placeholder="e.g. Primary Web Server">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Value</label>
                            <input id="bValue" value="${valueVal}" class="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none" placeholder="${typeVal === 'ip' ? '192.168.1.10' : 'https://example.com'}">
                        </div>
                    </div>
                    
                    <div class="bg-slate-50 rounded-lg p-3 border border-slate-200">
                        <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Open Ports</label>
                        <div class="flex gap-2 mb-3">
                            <input id="pNum" class="w-24 bg-white border border-slate-300 rounded-lg p-2 text-sm text-center font-mono placeholder:text-slate-300" placeholder="80" type="number">
                            <select id="pProto" class="flex-1 bg-white border border-slate-300 rounded-lg p-2 text-sm">
                                <option>TCP</option>
                                <option>UDP</option>
                                <option>HTTP</option>
                                <option>HTTPS</option>
                                <option>SSH</option>
                                <option>RDP</option>
                            </select>
                            <button onclick="app.addTempPort()" class="px-3 bg-slate-200 hover:bg-slate-300 rounded-lg text-slate-600 text-xs font-bold transition-colors">ADD</button>
                        </div>
                        <div id="tempPortsList" class="flex flex-wrap gap-2 min-h-[32px] p-2 bg-white rounded border border-slate-100 border-dashed">
                            <span class="text-xs text-slate-300 italic self-center w-full text-center" id="emptyPortsMsg">No ports added</span>
                        </div>
                    </div>
                </div>
                <div class="flex justify-end gap-3 mt-8">
                    <button onclick="app.closeModal()" class="px-5 py-2.5 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium transition-colors">Cancel</button>
                    <button onclick="app.submitBookmark()" class="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 shadow-lg shadow-blue-500/20 transition-all">${isEdit ? 'Save Changes' : 'Add Bookmark'}</button>
                </div>
            `;
            setTimeout(() => document.getElementById('bName')?.focus(), 100);
            this.renderTempPorts();
        }
    }

    closeModal() {
        const overlay = document.getElementById('modalOverlay');
        overlay?.classList.add('hidden');
        this.editingId = null;
    }

    toggleInputType(type: string) {
        const input = document.getElementById('bValue') as HTMLInputElement;
        if(input) {
            if (type === 'ip') {
                input.placeholder = '192.168.1.10';
            } else {
                input.placeholder = 'https://example.com';
            }
        }
    }

    addTempPort() {
        const numInput = document.getElementById('pNum') as HTMLInputElement;
        const protoInput = document.getElementById('pProto') as HTMLSelectElement;
        
        if (!numInput || !protoInput) return;

        const num = numInput.value;
        const proto = protoInput.value;
        if (!num) return;
        
        this.tempPorts.push({ port: num, proto });
        this.renderTempPorts();
        
        numInput.value = '';
        numInput.focus();
    }

    removeTempPort(index: number) {
        this.tempPorts.splice(index, 1);
        this.renderTempPorts();
    }

    renderTempPorts() {
        const container = document.getElementById('tempPortsList');
        if(!container) return;

        if(this.tempPorts.length === 0) {
            container.innerHTML = '<span class="text-xs text-slate-300 italic self-center w-full text-center">No ports added</span>';
            return;
        }
        container.innerHTML = this.tempPorts.map((p, idx) => `
            <span onclick="app.removeTempPort(${idx})" class="cursor-pointer group hover:bg-red-50 hover:border-red-200 inline-flex items-center px-2 py-1 rounded-md bg-slate-100 text-xs text-slate-600 border border-slate-200 font-mono transition-colors">
                ${p.port}<span class="text-slate-400 mx-1">/</span>${p.proto} 
                <i class="fa-solid fa-times ml-1.5 text-[10px] text-slate-400 group-hover:text-red-500"></i>
            </span>
        `).join('');
    }

    submitBookmark() {
        const typeInput = document.querySelector('input[name="bType"]:checked') as HTMLInputElement;
        const nameInput = document.getElementById('bName') as HTMLInputElement;
        const valueInput = document.getElementById('bValue') as HTMLInputElement;
        const folderInput = document.getElementById('bFolder') as HTMLSelectElement;

        const type = typeInput?.value as 'ip' | 'url';
        const name = nameInput?.value;
        const value = valueInput?.value;
        const folderId = folderInput?.value;

        if (!name || !value) {
            alert('Name and Value are required');
            return;
        }

        if (type === 'ip' && !isIP(value)) {
            alert('Invalid IP Address Format');
            return;
        }

        const data: Partial<Bookmark> = {
            type,
            name,
            value,
            folderId,
            ports: this.tempPorts
        };

        if (this.editingId) {
            this.updateBookmark(this.editingId, data);
        } else {
            this.addBookmark(data);
        }
    }

    copyToClipboard(text: string) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        this.toast(`Copied to clipboard`);
    }

    toast(msg: string) {
        const el = document.getElementById('toast');
        const msgEl = document.getElementById('toastMsg');
        if(!el || !msgEl) return;

        msgEl.innerText = msg;
        
        el.classList.remove('translate-y-24', 'opacity-0');
        setTimeout(() => {
            el.classList.add('translate-y-24', 'opacity-0');
        }, 3000);
    }
}
