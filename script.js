// Firebase configuration and initialization using the compat globals
// (we're loading the compat scripts via <script> tags in index.html so
// the `firebase` object is available on window).

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyBSQvxN5edPAUy2L-zw75quYEP896hMCqg",
    authDomain: "iamst-8206f.firebaseapp.com",
    databaseURL: "https://iamst-8206f-default-rtdb.firebaseio.com/",
    projectId: "iamst-8206f",
    storageBucket: "iamst-8206f.firebasestorage.app",
    messagingSenderId: "83991578365",
    appId: "1:83991578365:web:e88d623cde97382b266094",
    measurementId: "G-8C589708SX",
};

// Initialize Firebase via compat
const app = firebase.initializeApp(firebaseConfig);
// analytics isn't used in this app and the analytics script isn't included,
// so skip calling firebase.analytics() to avoid the runtime error.
const db = firebase.database();
const auth = firebase.auth();
const provider = new firebase.auth.GoogleAuthProvider();

let currentUser = null;
let isAdmin = false;
const ADMIN_EMAIL = 'sreeshanththekkedath8@gmail.com';

let allowEditPlannedQty = false;
let currentViewMode = 'individual'; // 'individual' or 'grouped'

// Detect development environment
const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const dataRef = isDev ? '/test' : '/data';

window.loginWithGoogle = function() {
    auth.signInWithPopup(provider).catch(console.error);
};

window.logout = function() {
    auth.signOut().catch(console.error);
};

auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        isAdmin = (user.email === ADMIN_EMAIL);
        
        document.getElementById('loginBtn').classList.add('hidden');
        document.getElementById('userInfo').classList.remove('hidden');
        document.getElementById('userNameDisplay').innerText = user.displayName || user.email;
        
        document.getElementById('appContent').classList.remove('hidden');
        
        await loadData(); // Initial load
        
        // Ensure user is registered and has permissions
        let currentUserData = data.appUsers.find(u => u.email === user.email);
        if (!currentUserData && !isAdmin) {
            currentUserData = {
                id: user.uid, // Use Firebase UID for persistence
                email: user.email,
                name: user.displayName || user.email,
                permissions: { settings: false, members: false, purchase: true, groups: true, addRow: true, deleteLog: true }
            };
            data.appUsers.push(currentUserData);
            await saveData();
        }

        // Hide/show tabs based on role
        if (!isAdmin) {
            document.getElementById('tab-app-users').style.display = 'none';
            document.getElementById('tab-groups').style.display = 'none';
            if (currentUserData) {
                document.getElementById('tab-settings').style.display = currentUserData.permissions.settings ? 'inline-block' : 'none';
                document.getElementById('tab-members').style.display = currentUserData.permissions.members ? 'inline-block' : 'none';
                document.getElementById('tab-purchase').style.display = currentUserData.permissions.purchase ? 'inline-block' : 'none';
                document.getElementById('tab-groups').style.display = currentUserData.permissions.groups ? 'inline-block' : 'none';
                
                // Show most relevant tab they have access to
                if (currentUserData.permissions.purchase) showTab('purchase');
                else if (currentUserData.permissions.settings) showTab('settings');
                else if (currentUserData.permissions.members) showTab('members');
                else document.getElementById('appContent').classList.add('hidden');
            }
        } else {
            document.getElementById('tab-settings').style.display = 'inline-block';
            document.getElementById('tab-members').style.display = 'inline-block';
            document.getElementById('tab-purchase').style.display = 'inline-block';
            document.getElementById('tab-groups').style.display = 'inline-block';
            document.getElementById('tab-app-users').style.display = 'inline-block';
            showTab('purchase');
        }
        
        // Start real-time sync for conflict prevention
        startSync();
        renderAll();
    } else {
        currentUser = null;
        isAdmin = false;
        document.getElementById('loginBtn').classList.remove('hidden');
        document.getElementById('userInfo').classList.add('hidden');
        document.getElementById('appContent').classList.add('hidden');
    }
});

// In-memory data store (populated from backend or defaults)
let data = {
    dresses: [
    ],
    members: [
    ],
    logs: [
    ],
    appUsers: [],
    groups: [],
    settings: {
        allowEditPlannedQty: false
    }
};

// load & save helpers for backend persistence
async function loadData() {
    console.debug('loadData() called');
    try {
        const snapshot = await db.ref(dataRef).once('value');
        console.debug('snapshot received', snapshot.exists());
        if (snapshot.exists()) {
            const val = snapshot.val();
            data.dresses = val.dresses || [];
            data.members = val.members || [];
            data.logs = val.logs || [];
            data.appUsers = val.appUsers || [];
            data.groups = val.groups || [];
            data.settings = val.settings || { allowEditPlannedQty: false };
            
            // Set global from settings
            allowEditPlannedQty = data.settings.allowEditPlannedQty;
            
            // Migrate old data gracefully
            data.dresses.forEach((d, i) => { if (!d.id) d.id = 'd_' + Date.now() + '_' + i; });
            data.members = data.members.map((m, i) => {
                if (typeof m === 'string') return { id: 'm_' + Date.now() + '_' + i, name: m };
                return m;
            });
            data.logs.forEach((log, i) => {
                if (!log.id) log.id = 'l_' + Date.now() + '_' + i;
                if (log.member && !log.memberId) {
                    const foundMember = data.members.find(member => member.name === log.member);
                    log.memberId = foundMember ? foundMember.id : "";
                    delete log.member;
                }
                if (log.type && !log.dressId) {
                    const foundDress = data.dresses.find(dress => dress.name === log.type);
                    log.dressId = foundDress ? foundDress.id : "";
                    delete log.type;
                }
                // ensure count exists and is at least 1
                if (log.count == null || Number(log.count) < 1) {
                    log.count = 1;
                }
                // ensure purchasedCount exists (can be 0 when not purchased yet)
                if (log.purchasedCount == null || Number(log.purchasedCount) < 0) {
                    log.purchasedCount = 0;
                }
            });
        }
    } catch (e) {
        console.warn('failed to load data from Firebase', e);
    }
}

// Conflict prevention: Real-time synchronization
function startSync() {
    db.ref(dataRef).on('value', (snapshot) => {
        if (snapshot.exists()) {
            const val = snapshot.val();
            // Update local memory with external changes
            data.dresses = val.dresses || [];
            data.members = val.members || [];
            data.logs = val.logs || [];
            data.appUsers = val.appUsers || [];
            data.groups = val.groups || [];
            data.settings = val.settings || { allowEditPlannedQty: false };
            allowEditPlannedQty = data.settings.allowEditPlannedQty;
            
            console.log('Sync active: Latest data pulled from Firebase');
            renderAll();
        }
    });
}

async function saveData() {
    console.log('saveData() called with', data);
    // Ensure settings is up to date
    data.settings = data.settings || {};
    data.settings.allowEditPlannedQty = allowEditPlannedQty;
    try {
        await db.ref(dataRef).set(data);
        console.log('saveData() successful');
    } catch (e) {
        console.log('failed to save data to Firebase', e);
    }
}



function showTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    document.getElementById('tab-' + tabId).classList.add('active');
    renderAll();
}

function addDressType() {
    if (!isAdmin) return alert('Only admin can add master data');
    const name = document.getElementById('newDressType').value;
    const budget = parseFloat(document.getElementById('newDressBudget').value);
    if (name && budget) {
        data.dresses.push({ id: 'd_' + Date.now() + '_' + Math.floor(Math.random() * 1000), name, budget });
        document.getElementById('newDressType').value = '';
        document.getElementById('newDressBudget').value = '';
        renderAll();
        saveData();
    }
}

function addGroup() {
    if (!isAdmin) return alert('Only admin can manage groups');
    const name = document.getElementById('newGroupName').value;
    const color = document.getElementById('newGroupColor').value;
    if (name) {
        data.groups.push({ id: 'g_' + Date.now() + '_' + Math.floor(Math.random() * 1000), name, color });
        document.getElementById('newGroupName').value = '';
        renderAll();
        saveData();
    }
}

function editGroup(index) {
    if (!isAdmin) return alert('Only admin can edit groups');
    const g = data.groups[index];
    const newName = prompt('Group name:', g.name);
    if (newName === null) return;
    const newColor = prompt('Group color (hex):', g.color);
    if (newColor === null) return;
    if (newName.trim()) {
        g.name = newName.trim();
        g.color = newColor;
        renderAll();
        saveData();
    }
}

function addMember() {
    if (!isAdmin) return alert('Only admin can add master data');
    const name = document.getElementById('newMemberName').value;
    if (name) {
        data.members.push({ id: 'm_' + Date.now() + '_' + Math.floor(Math.random() * 1000), name });
        document.getElementById('newMemberName').value = '';
        renderAll();
        saveData();
    }
}

function addRow() {
    if (!isAdmin) {
        const userPerms = data.appUsers.find(u => u.email === auth.currentUser?.email)?.permissions;
        if (!userPerms?.addRow) return alert('You do not have permission to add rows.');
    }
    data.logs.push({ id: 'l_' + Date.now() + '_' + Math.floor(Math.random() * 1000), memberId: "", dressId: "", price: 0, count: 1, purchasedCount: 0 });
    renderAll();
    saveData();
}

function deleteItem(arrayName, index) {
    // confirm before deleting anything
    if (!confirm('Are you sure you want to delete this item?')) {
        return;
    }
    if (!isAdmin) {
        if (arrayName === 'dresses' || arrayName === 'members') {
            alert('Only admin can delete master data');
            return;
        }
        if (arrayName === 'logs') {
            const userPerms = data.appUsers.find(u => u.email === auth.currentUser?.email)?.permissions;
            if (!userPerms?.deleteLog) return alert('You do not have permission to delete logs.');
        }
    }
    data[arrayName].splice(index, 1);
    renderAll();
    saveData();
}

function editDress(index) {
    if (!isAdmin) return alert('Only admin can edit master data');
    const d = data.dresses[index];
    const newName = prompt('Dress type name:', d.name);
    if (newName === null) return;
    const newBudget = prompt('Max budget (₹):', d.budget);
    if (newBudget === null) return;
    if (newName.trim() && !isNaN(parseFloat(newBudget))) {
        d.name = newName.trim();
        d.budget = parseFloat(newBudget);
        renderAll();
        saveData();
    }
}

function editMember(index) {
    if (!isAdmin) return alert('Only admin can edit master data');
    const m = data.members[index];
    const newName = prompt('Member name:', m.name);
    if (newName === null) return;
    if (newName.trim()) {
        m.name = newName.trim();
        renderAll();
        saveData();
    }
}

function setViewMode(mode) {
    currentViewMode = mode;
    document.querySelectorAll('.view-mode-btn').forEach(btn => {
        btn.classList.remove('bg-white', 'shadow-sm', 'border', 'border-gray-200');
        btn.classList.add('text-gray-600', 'hover:bg-gray-200');
    });
    const activeBtn = document.getElementById('mode-' + mode);
    activeBtn.classList.add('bg-white', 'shadow-sm', 'border', 'border-gray-200');
    activeBtn.classList.remove('text-gray-600', 'hover:bg-gray-200');
    renderAll();
}

function autoGroupLogs() {
    if (!isAdmin) {
        const userPerms = data.appUsers.find(u => u.email === auth.currentUser?.email)?.permissions;
        if (!userPerms?.groups) return alert('You do not have permission to manage groupings.');
    }
    if (data.members.length === 0) return alert('Add members first to auto-group');
    
    // Create groups for each member if they don't exist
    data.members.forEach(member => {
        let group = data.groups.find(g => g.name === member.name);
        if (!group) {
            const randomColor = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
            group = { id: 'g_' + Date.now() + '_' + Math.floor(Math.random() * 1000), name: member.name, color: randomColor };
            data.groups.push(group);
        }
        
        // Assign logs of this member to this group
        data.logs.forEach(log => {
            if (log.memberId === member.id) {
                log.groupId = group.id;
            }
        });
    });
    
    renderAll();
    saveData();
    alert('Logs auto-grouped by member name.');
}

function updateLog(index, field, value) {
    if (field === 'price') {
        const num = parseFloat(value);
        data.logs[index].price = isNaN(num) ? 0 : num;
    } else if (field === 'count') {
        const num = parseInt(value);
        data.logs[index].count = isNaN(num) || num < 1 ? 1 : num;
    } else if (field === 'purchasedCount') {
        const num = parseInt(value);
        data.logs[index].purchasedCount = isNaN(num) || num < 0 ? 0 : num;
    } else {
        data.logs[index][field] = value;
    }
    renderAll();
    saveData();
}

function clearPrice(index) {
    if (!confirm('Are you sure you want to clear the actual price for this row?')) {
        return;
    }
    data.logs[index].price = 0;
    renderAll();
    saveData();
}

function togglePermission(index, permissionKey) {
    if (!isAdmin) return alert('Only admins can change user permissions.');
    data.appUsers[index].permissions[permissionKey] = !data.appUsers[index].permissions[permissionKey];
    renderAll();
    saveData();
}

function clearPurchasedCount(index) {
    if (!confirm('Are you sure you want to clear the purchased quantity for this row?')) {
        return;
    }
    data.logs[index].purchasedCount = 0;
    renderAll();
    saveData();
}

function toggleEditPlanned() {
    allowEditPlannedQty = document.getElementById('editPlannedToggle').checked;
    renderAll();
    saveData();
}

// modal-based selection logic
let currentModal = { type: null, row: null };

function openModal(type, row) {
    if (!isAdmin && type === 'group') {
        const userPerms = data.appUsers.find(u => u.email === auth.currentUser?.email)?.permissions;
        if (!userPerms?.groups) return alert('You do not have permission to manage groupings.');
    }
    currentModal.type = type;
    currentModal.row = row;
    let title = 'Select';
    if (type === 'member') title = 'Select Member';
    if (type === 'dress') title = 'Select Dress';
    if (type === 'group') title = 'Select Group';
    
    document.getElementById('modalTitle').innerText = title;
    document.getElementById('modalSearch').value = '';
    populateModalList('');
    document.getElementById('selectionModal').classList.remove('hidden');
    document.getElementById('modalSearch').focus();
}

function closeModal() {
    currentModal.type = null;
    currentModal.row = null;
    document.getElementById('selectionModal').classList.add('hidden');
}

function populateModalList(filterText) {
    const listEl = document.getElementById('modalList');
    if (currentModal.type === 'member') {
        const matches = data.members.filter(m => m.name.toLowerCase().includes(filterText));
        listEl.innerHTML = matches.map(m =>
            `<li class="px-2 py-1 hover:bg-gray-100 cursor-pointer" onclick="selectModal('${m.id}','${m.name}')">${m.name}</li>`
        ).join('');
    } else if (currentModal.type === 'dress') {
        const matches = data.dresses.filter(d => {
            const display = `${d.name} (₹${d.budget.toLocaleString()})`;
            return display.toLowerCase().includes(filterText);
        });
        listEl.innerHTML = matches.map(d => {
            const display = `${d.name} (₹${d.budget.toLocaleString()})`;
            const safe = display.replace(/'/g, "\\'");
            return `<li class="px-2 py-1 hover:bg-gray-100 cursor-pointer" onclick="selectModal('${d.id}','${safe}')">${display}</li>`;
        }).join('');
    } else if (currentModal.type === 'group') {
        const matches = data.groups.filter(g => g.name.toLowerCase().includes(filterText));
        listEl.innerHTML = matches.map(g =>
            `<li class="px-2 py-1 hover:bg-gray-100 cursor-pointer flex items-center gap-2" onclick="selectModal('${g.id}','${g.name}')">
                <span class="w-3 h-3 rounded-full" style="background-color: ${g.color}"></span>
                ${g.name}
            </li>`
        ).join('');
    }
}

function filterModal() {
    const txt = document.getElementById('modalSearch').value.toLowerCase();
    populateModalList(txt);
}

function selectModal(id, display) {
    if (currentModal.row !== null) {
        if (currentModal.type === 'member') {
            updateLog(currentModal.row, 'memberId', id);
        } else if (currentModal.type === 'dress') {
            updateLog(currentModal.row, 'dressId', id);
        } else if (currentModal.type === 'group') {
            updateLog(currentModal.row, 'groupId', id);
        }
    }
    closeModal();
}

function populateFilters() {
    const memberSelect = document.getElementById('filterMember');
    const dressSelect = document.getElementById('filterDress');
    const prevMember = memberSelect ? memberSelect.value : '';
    const prevDress = dressSelect ? dressSelect.value : '';
    if (memberSelect) {
        memberSelect.innerHTML = '<option value="">All Members</option>' + data.members.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
        memberSelect.value = prevMember;
    }
    if (dressSelect) {
        dressSelect.innerHTML = '<option value="">All Dresses</option>' + data.dresses.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
        dressSelect.value = prevDress;
    }
}

function clearFilters() {
    const memberSelect = document.getElementById('filterMember');
    const dressSelect = document.getElementById('filterDress');
    const statusSelect = document.getElementById('filterStatus');
    if (memberSelect) memberSelect.value = '';
    if (dressSelect) dressSelect.value = '';
    if (statusSelect) statusSelect.value = '';
    renderAll();
}

function renderAll() {
    // Render Dress Settings
    const dressBody = document.getElementById('dressTableBody');
    dressBody.innerHTML = data.dresses.map((d, i) => `
            <tr>
                <td class="p-3 border text-sm">${d.name}</td>
                <td class="p-3 border text-sm font-mono">₹${d.budget.toLocaleString()}</td>
                <td class="p-3 border flex space-x-1">
                    <button onclick="editDress(${i})" class="text-blue-500 text-xs">Edit</button>
                    <button onclick="deleteItem('dresses', ${i})" class="text-red-500 text-xs">Delete</button>
                </td>
            </tr>
        `).join('');
    const dressCountEl = document.getElementById('dressCount');
    if (dressCountEl) dressCountEl.innerText = `(${data.dresses.length} types)`;

    // Render Groups
    const groupBody = document.getElementById('groupTableBody');
    if (groupBody) {
        groupBody.innerHTML = data.groups.map((g, i) => `
            <tr>
                <td class="p-3 border text-center">
                    <span class="inline-block w-6 h-6 rounded border" style="background-color: ${g.color}"></span>
                </td>
                <td class="p-3 border text-sm font-medium">${g.name}</td>
                <td class="p-3 border flex space-x-1">
                    <button onclick="editGroup(${i})" class="text-blue-500 text-xs">Edit</button>
                    <button onclick="deleteItem('groups', ${i})" class="text-red-500 text-xs">Delete</button>
                </td>
            </tr>
        `).join('');
    }
    const groupCountEl = document.getElementById('groupCount');
    if (groupCountEl) groupCountEl.innerText = `(${data.groups.length} groups)`;

    // Render Members
    const memberBody = document.getElementById('memberTableBody');
    memberBody.innerHTML = data.members.map((m, i) => `
            <tr>
                <td class="p-3 border text-sm">${m.name}</td>
                <td class="p-3 border flex space-x-1">
                    <button onclick="editMember(${i})" class="text-blue-500 text-xs">Edit</button>
                    <button onclick="deleteItem('members', ${i})" class="text-red-500 text-xs">Delete</button>
                </td>
            </tr>
        `).join('');
    const memberCountEl = document.getElementById('memberCount');
    if (memberCountEl) memberCountEl.innerText = `(${data.members.length} people)`;

    // Render Log
    const logBody = document.getElementById('logTableBody');
    let totalEst = 0;
    let totalSpent = 0;
    let purchasedCount = 0;
    let pendingCount = 0;
    let totalCount = 0;

    // refresh filter options
    populateFilters();

    // show/hide admin controls
    if (isAdmin) {
        document.getElementById('adminControls').style.display = 'block';
        document.getElementById('editPlannedToggle').checked = allowEditPlannedQty;
    } else {
        document.getElementById('adminControls').style.display = 'none';
    }

    // read filter values
    const memberFilter = document.getElementById('filterMember').value;
    const dressFilter = document.getElementById('filterDress').value;
    const statusFilter = document.getElementById('filterStatus').value;

    const filteredLogs = data.logs.filter(log => {
        const price = parseFloat(log.price) || 0;
        const status = price > 0 ? "Purchased" : "Pending";
        if (memberFilter && log.memberId !== memberFilter) return false;
        if (dressFilter && log.dressId !== dressFilter) return false;
        if (statusFilter && status !== statusFilter) return false;
        return true;
    });

    const logsToRender = filteredLogs;

    // Helper to render log rows
    const renderLogRow = (log, idx) => {
        const dressInfo = data.dresses.find(d => d.id === log.dressId) || { budget: 0 };
        const est = dressInfo.budget;
        const count = Math.max(1, parseInt(log.count) || 1);
        const purchasedCountVal = Math.max(0, parseInt(log.purchasedCount) || 0);
        const price = parseFloat(log.price) || 0;
        const totalEstForRow = est * count;
        const totalSpentForRow = price * purchasedCountVal;
        const savings = totalEstForRow - totalSpentForRow;
        const status = purchasedCountVal >= count ? "Purchased" : "Pending";
        
        const userPerms = isAdmin ? null : data.appUsers.find(u => u.email === auth.currentUser?.email)?.permissions;
        const canDelete = isAdmin || userPerms?.deleteLog;

        const memberName = data.members.find(m => m.id === log.memberId)?.name || '';
        const foundDress = data.dresses.find(d => d.id === log.dressId);
        const dressName = foundDress ? `${foundDress.name} (₹${foundDress.budget.toLocaleString()})` : '';
        
        const foundGroup = data.groups.find(g => g.id === log.groupId);
        const groupColor = foundGroup ? foundGroup.color : '#e5e7eb';
        const groupName = foundGroup ? foundGroup.name : 'No Group';

        // Find the absolute index in data.logs for mapping back
        const absoluteIndex = data.logs.indexOf(log);

        return `
                <tr class="text-sm cursor-default" draggable="true" data-index="${absoluteIndex}" ondragstart="handleDragStart(event)" ondragover="handleDragOver(event)" ondrop="handleDrop(event)">
                    <td class="p-2 border text-center text-gray-300" style="border-left: 4px solid ${groupColor}">
                        <div class="cursor-move p-1 hover:text-gray-600" title="Drag to reorder">
                            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M7 7h2v2H7V7zm3 0h2v2h-2V7zM7 10h2v2H7v-2zm3 0h2v2h-2v-2zm-3 3h2v2H7v-2zm3 0h2v2h-2v-2z"></path></svg>
                        </div>
                    </td>
                    <td class="p-2 border">
                        <button onclick="openModal('group', ${absoluteIndex})" class="w-full text-left p-1 bg-transparent flex items-center gap-2">
                             <span class="w-2 h-2 rounded-full" style="background-color: ${groupColor}"></span>
                             ${groupName}
                        </button>
                    </td>
                    <td class="p-2 border">
                        <button onclick="openModal('member', ${absoluteIndex})" class="w-full text-left p-1 bg-transparent">${memberName || 'Select Member'}</button>
                    </td>
                    <td class="p-2 border">
                        <button onclick="openModal('dress', ${absoluteIndex})" class="w-full text-left p-1 bg-transparent">${dressName || 'Select Dress'}</button>
                    </td>
                    <td class="p-2 border">
                        <input type="number" min="1" value="${count}" onchange="updateLog(${absoluteIndex}, 'count', this.value)" ${!allowEditPlannedQty ? 'disabled' : ''} class="w-full p-1 bg-transparent font-mono border-b border-gray-200" title="Planned quantity">
                    </td>
                    <td class="p-2 border">
                        <div class="flex items-center gap-1">
                            <input type="number" min="0" value="${purchasedCountVal}" onchange="updateLog(${absoluteIndex}, 'purchasedCount', this.value)" class="w-full p-1 bg-transparent font-mono border-b border-gray-200" title="Actual quantity purchased">
                            <button onclick="clearPurchasedCount(${absoluteIndex})" class="text-blue-500 hover:text-blue-700 text-xs">Clear</button>
                        </div>
                    </td>
                    <td class="p-2 border bg-gray-50 font-mono">₹${totalEstForRow.toLocaleString()}</td>
                    <td class="p-2 border">
                        <div class="flex items-center gap-1">
                            <input type="number" value="${log.price}" onchange="updateLog(${absoluteIndex}, 'price', this.value)" class="w-full p-1 bg-transparent font-mono border-b border-gray-200">
                            <button onclick="clearPrice(${absoluteIndex})" class="text-blue-500 hover:text-blue-700 text-xs">Clear</button>
                        </div>
                    </td>
                    <td class="p-2 border font-mono ${savings < 0 ? 'text-red-600' : 'text-green-600'}">
                        ${savings > 0 ? '+' : ''}${savings.toLocaleString()}
                    </td>
                    <td class="p-2 border">
                        <span class="px-2 py-1 rounded-full text-[10px] uppercase font-bold ${status === 'Purchased' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}">
                            ${status}
                        </span>
                    </td>
                    <td class="p-2 border text-center">
                        ${canDelete ? `<button onclick="deleteItem('logs', ${absoluteIndex})" class="text-gray-400 hover:text-red-500">✕</button>` : ''}
                    </td>
                </tr>
            `;
    };

    if (currentViewMode === 'individual') {
        logBody.innerHTML = logsToRender.map((log, i) => {
            const dressInfo = data.dresses.find(d => d.id === log.dressId) || { budget: 0 };
            const est = dressInfo.budget;
            const count = Math.max(1, parseInt(log.count) || 1);
            const purchasedCountVal = Math.max(0, parseInt(log.purchasedCount) || 0);
            const price = parseFloat(log.price) || 0;
            totalEst += est * count;
            totalSpent += price * purchasedCountVal;
            totalCount += count;
            purchasedCount += purchasedCountVal;
            pendingCount += Math.max(0, count - purchasedCountVal);
            return renderLogRow(log, i);
        }).join('');
    } else {
        // Grouped View
        const grouped = {};
        logsToRender.forEach(log => {
            const gId = log.groupId || 'none';
            if (!grouped[gId]) grouped[gId] = [];
            grouped[gId].push(log);
        });

        let html = '';
        // Sort groups: show named groups first, then 'No Group'
        const sortedGroupIds = Object.keys(grouped).sort((a, b) => {
            if (a === 'none') return 1;
            if (b === 'none') return -1;
            const gnA = data.groups.find(g => g.id === a)?.name || '';
            const gnB = data.groups.find(g => g.id === b)?.name || '';
            return gnA.localeCompare(gnB);
        });

        sortedGroupIds.forEach(gId => {
            const group = data.groups.find(g => g.id === gId);
            const gName = group ? group.name : 'No Group';
            const gColor = group ? group.color : '#e5e7eb';
            
            html += `<tr class="bg-gray-100 font-bold text-xs uppercase tracking-wider"><td colspan="10" class="p-2 border" style="border-left: 8px solid ${gColor}">${gName} (${grouped[gId].length} items)</td></tr>`;
            
            grouped[gId].forEach((log, i) => {
                const dressInfo = data.dresses.find(d => d.id === log.dressId) || { budget: 0 };
                const est = dressInfo.budget;
                const count = Math.max(1, parseInt(log.count) || 1);
                const purchasedCountVal = Math.max(0, parseInt(log.purchasedCount) || 0);
                const price = parseFloat(log.price) || 0;
                totalEst += est * count;
                totalSpent += price * purchasedCountVal;
                totalCount += count;
                purchasedCount += purchasedCountVal;
                pendingCount += Math.max(0, count - purchasedCountVal);
                html += renderLogRow(log, i);
            });
        });
        logBody.innerHTML = html;
    }

    // Update Stats
    document.getElementById('statTotalEst').innerText = '₹' + totalEst.toLocaleString();
    document.getElementById('statTotalSpent').innerText = '₹' + totalSpent.toLocaleString();
    document.getElementById('statVariance').innerText = '₹' + (totalEst - totalSpent).toLocaleString();
    const totalEl = document.getElementById('statTotalCount');
    const purchasedEl = document.getElementById('statPurchasedCount');
    const pendingEl = document.getElementById('statPendingCount');
    if (totalEl) totalEl.innerText = totalCount;
    if (purchasedEl) purchasedEl.innerText = purchasedCount;
    if (pendingEl) pendingEl.innerText = pendingCount;

    // Show/hide Add Row button based on permission
    const addRowBtn = document.querySelector('button[onclick="addRow()"]');
    if (addRowBtn && !isAdmin) {
        const userPerms = data.appUsers.find(u => u.email === auth.currentUser?.email)?.permissions;
        addRowBtn.style.display = userPerms?.addRow ? 'inline-block' : 'none';
    } else if (addRowBtn) {
        addRowBtn.style.display = 'inline-block';
    }

    // Show/hide Auto-Group button based on permission
    const autoGroupBtn = document.querySelector('button[onclick="autoGroupLogs()"]');
    if (autoGroupBtn && !isAdmin) {
        const userPerms = data.appUsers.find(u => u.email === auth.currentUser?.email)?.permissions;
        autoGroupBtn.style.display = userPerms?.groups ? 'inline-block' : 'none';
    } else if (autoGroupBtn) {
        autoGroupBtn.style.display = 'inline-block';
    }

    // Render App Users (Admins only)
    if (isAdmin) {
        const appUsersBody = document.getElementById('appUsersTableBody');
        appUsersBody.innerHTML = data.appUsers.map((u, i) => `
            <tr class="text-sm border-b">
                <td class="p-3">${u.name}</td>
                <td class="p-3 text-gray-500">${u.email}</td>
                <td class="p-3 text-center">
                    <input type="checkbox" ${u.permissions.settings ? 'checked' : ''} onchange="togglePermission(${i}, 'settings')" class="w-4 h-4 text-indigo-600 rounded">
                </td>
                <td class="p-3 text-center">
                    <input type="checkbox" ${u.permissions.members ? 'checked' : ''} onchange="togglePermission(${i}, 'members')" class="w-4 h-4 text-indigo-600 rounded">
                </td>
                <td class="p-3 text-center">
                    <input type="checkbox" ${u.permissions.purchase ? 'checked' : ''} onchange="togglePermission(${i}, 'purchase')" class="w-4 h-4 text-indigo-600 rounded">
                </td>
                <td class="p-3 text-center">
                    <input type="checkbox" ${u.permissions.groups ? 'checked' : ''} onchange="togglePermission(${i}, 'groups')" class="w-4 h-4 text-indigo-600 rounded">
                </td>
                <td class="p-3 text-center">
                    <input type="checkbox" ${u.permissions.addRow !== false ? 'checked' : ''} onchange="togglePermission(${i}, 'addRow')" class="w-4 h-4 text-indigo-600 rounded">
                </td>
                <td class="p-3 text-center">
                    <input type="checkbox" ${u.permissions.deleteLog !== false ? 'checked' : ''} onchange="togglePermission(${i}, 'deleteLog')" class="w-4 h-4 text-indigo-600 rounded">
                </td>
            </tr>
        `).join('');
    }
}

// hide suggestion lists when clicking outside
function hideAllLists() {
    document.querySelectorAll('[id^="memberList-"],[id^="dressList-"]').forEach(l => l.classList.add('hidden'));
}

// close modal when clicking on background
const selectionModalEl = document.getElementById('selectionModal');
if (selectionModalEl) {
    selectionModalEl.addEventListener('click', (e) => {
        if (e.target.id === 'selectionModal') {
            closeModal();
        }
    });
}

// global click listener
document.addEventListener('click', (e) => {
    if (!e.target.matches('input[id^="memberInput-"]') && !e.target.matches('input[id^="dressInput-"]')) {
        hideAllLists();
    }
});

function exportCSV() {
    let csv = "Member,Dress Type,Qty Planned,Qty Purchased,Estimated Budget,Actual Price,Status\n";
    data.logs.forEach(log => {
        const dress = data.dresses.find(d => d.id === log.dressId) || { name: 'Unknown', budget: 0 };
        const member = data.members.find(m => m.id === log.memberId) || { name: 'Unknown' };
        const count = Math.max(1, parseInt(log.count) || 1);
        const purchasedCountVal = Math.max(0, parseInt(log.purchasedCount) || 0);
        const price = parseFloat(log.price) || 0;
        const status = purchasedCountVal >= count ? 'Purchased' : 'Pending';
        csv += `${member.name},${dress.name},${count},${purchasedCountVal},${dress.budget * count},${price * purchasedCountVal},${status}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('href', url);
    a.setAttribute('download', 'wedding_budget.csv');
    a.click();
}

function exportToExcel() {
    // Creates a real Excel-compatible HTML structure that includes Formulas
    const fileName = "Wedding_Budget_Planner.xls";

    // Define settings sheet table
    let settingsRows = data.dresses.map(d => `<tr><td>${d.name}</td><td>${d.budget}</td></tr>`).join('');

    // Define purchase log table
    let logRows = data.logs.map((log, i) => {
        const rowNum = i + 2; // Offset for header in Excel
        const dress = data.dresses.find(d => d.id === log.dressId) || { name: 'Unknown', budget: 0 };
        const member = data.members.find(m => m.id === log.memberId) || { name: 'Unknown' };
        const count = Math.max(1, parseInt(log.count) || 1);
        const purchasedCountVal = Math.max(0, parseInt(log.purchasedCount) || 0);
        const estTotal = dress.budget * count;
        const actualTotal = (parseFloat(log.price) || 0) * purchasedCountVal;
        const statusFormula = `IF(F${rowNum}>=C${rowNum}, "Purchased", "Pending")`;
        return `
                <tr>
                    <td>${member.name}</td>
                    <td>${dress.name}</td>
                    <td>${count}</td>
                    <td>${purchasedCountVal}</td>
                    <td>${estTotal}</td>
                    <td>${actualTotal}</td>
                    <td>=E${rowNum}-F${rowNum}</td>
                    <td>${statusFormula}</td>
                </tr>
            `;
    }).join('');

    const excelTemplate = `
            <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
            <head><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets>
                <x:ExcelWorksheet><x:Name>PurchaseLog</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet>
                <x:ExcelWorksheet><x:Name>Settings</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet>
            </x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head>
            <body>
                <table>
                    <thead><tr><th>Member</th><th>Dress Type</th><th>Qty Planned</th><th>Qty Purchased</th><th>Est Budget</th><th>Actual Price</th><th>Savings</th><th>Status</th></tr></thead>
                    <tbody>${logRows}</tbody>
                </table>
                <br>
                <table>
                    <thead><tr><th>DRESS SETTINGS</th></tr><tr><th>Type</th><th>Budget</th></tr></thead>
                    <tbody>${settingsRows}</tbody>
                </table>
            </body>
            </html>
        `;

    const blob = new Blob([excelTemplate], { type: 'application/vnd.ms-excel' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
}

// expose functions used by inline event handlers so they live on the global scope
// (modules are scoped to themselves and don't automatically export to window)
window.showTab = showTab;
window.addDressType = addDressType;
window.addMember = addMember;
window.addRow = addRow;
window.deleteItem = deleteItem;
window.updateLog = updateLog;
window.clearPrice = clearPrice;
window.clearPurchasedCount = clearPurchasedCount;
window.togglePermission = togglePermission;
window.addGroup = addGroup;
window.editGroup = editGroup;
window.setViewMode = setViewMode;
window.autoGroupLogs = autoGroupLogs;
window.exportCSV = exportCSV;
window.exportToExcel = exportToExcel;
window.toggleEditPlanned = toggleEditPlanned;

// drag and drop logic
let draggedIdx = null;

function handleDragStart(e) {
    draggedIdx = parseInt(e.currentTarget.getAttribute('data-index'));
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

function handleDrop(e) {
    e.preventDefault();
    const targetIdx = parseInt(e.currentTarget.getAttribute('data-index'));
    if (draggedIdx !== null && draggedIdx !== targetIdx) {
        // Rearrange logs in memory
        const item = data.logs.splice(draggedIdx, 1)[0];
        data.logs.splice(targetIdx, 0, item);
        renderAll();
        saveData();
    }
    draggedIdx = null;
}

window.handleDragStart = handleDragStart;
window.handleDragOver = handleDragOver;
window.handleDrop = handleDrop;

// Initial render
window.onload = async () => {
    // handled by auth state changed watcher
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        loadData,
        saveData,
        getData: () => data,
        setData: (newData) => { data = newData; }
    };
}