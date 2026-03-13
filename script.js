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
        
        // Hide/show tabs based on role
        if (!isAdmin) {
            document.getElementById('tab-settings').style.display = 'none';
            document.getElementById('tab-members').style.display = 'none';
            showTab('purchase');
        } else {
            document.getElementById('tab-settings').style.display = 'inline-block';
            document.getElementById('tab-members').style.display = 'inline-block';
            showTab('settings');
        }
        
        await loadData();
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
        { id: "d1", name: "Kerala Saree", budget: 8000 },
        { id: "d2", name: "Bridal Lehenga", budget: 45000 },
        { id: "d3", name: "Groom Suit", budget: 20000 }
    ],
    members: [
        { id: "m1", name: "Anjali" },
        { id: "m2", name: "Rahul" },
        { id: "m3", name: "Amma" }
    ],
    logs: [
        { id: "l1", memberId: "m1", dressId: "d1", price: 7200 }
    ]
};

// load & save helpers for backend persistence
async function loadData() {
    console.debug('loadData() called');
    try {
        const snapshot = await db.ref('/data').once('value');
        console.debug('snapshot received', snapshot.exists());
        if (snapshot.exists()) {
            const val = snapshot.val();
            data.dresses = val.dresses || [];
            data.members = val.members || [];
            data.logs = val.logs || [];
            
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
            });
        }
    } catch (e) {
        console.warn('failed to load data from Firebase', e);
    }
}

async function saveData() {
    console.log('saveData() called with', data);
    try {
        await db.ref('/data').set(data);
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
    data.logs.push({ id: 'l_' + Date.now() + '_' + Math.floor(Math.random() * 1000), memberId: "", dressId: "", price: 0 });
    renderAll();
    saveData();
}

function deleteItem(arrayName, index) {
    // confirm before deleting anything
    if (!confirm('Are you sure you want to delete this item?')) {
        return;
    }
    if (!isAdmin && (arrayName === 'dresses' || arrayName === 'members')) {
        alert('Only admin can delete master data');
        return;
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

function updateLog(index, field, value) {
    data.logs[index][field] = value;
    renderAll();
    saveData();
}

function clearPrice(index) {
    data.logs[index].price = 0;
    renderAll();
    saveData();
}

// modal-based selection logic
let currentModal = { type: null, row: null };

function openModal(type, row) {
    currentModal.type = type;
    currentModal.row = row;
    const title = type === 'member' ? 'Select Member' : 'Select Dress';
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

    logBody.innerHTML = logsToRender.map((log, i) => {
        const dressInfo = data.dresses.find(d => d.id === log.dressId) || { budget: 0 };
        const est = dressInfo.budget;
        const price = parseFloat(log.price) || 0;
        const savings = est > 0 ? est - price : 0;
        const status = price > 0 ? "Purchased" : "Pending";

        totalEst += est;
        totalSpent += price;
        totalCount++;
        if (status === 'Purchased') purchasedCount++;
        else pendingCount++;

        // display name value for inputs
        const memberName = data.members.find(m => m.id === log.memberId)?.name || '';
        const foundDress = data.dresses.find(d => d.id === log.dressId);
        const dressName = foundDress ? `${foundDress.name} (₹${foundDress.budget.toLocaleString()})` : '';

        return `
                <tr class="text-sm">
                    <td class="p-2 border">
                        <button onclick="openModal('member', ${i})" class="w-full text-left p-1 bg-transparent">${memberName || 'Select Member'}</button>
                    </td>
                    <td class="p-2 border">
                        <button onclick="openModal('dress', ${i})" class="w-full text-left p-1 bg-transparent">${dressName || 'Select Dress'}</button>
                    </td>
                    <td class="p-2 border bg-gray-50 font-mono">₹${est.toLocaleString()}</td>
                    <td class="p-2 border">
                        <div class="flex items-center gap-1">
                            <input type="number" value="${log.price}" onchange="updateLog(${i}, 'price', this.value)" class="w-full p-1 bg-transparent font-mono border-b border-gray-200">
                            <button onclick="clearPrice(${i})" class="text-blue-500 hover:text-blue-700 text-xs">Clear</button>
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
                        <button onclick="deleteItem('logs', ${i})" class="text-gray-400 hover:text-red-500">✕</button>
                    </td>
                </tr>
            `;
    }).join('');

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
    let csv = "Member,Dress Type,Estimated Budget,Actual Price,Status\n";
    data.logs.forEach(log => {
        const dress = data.dresses.find(d => d.id === log.dressId) || { name: 'Unknown', budget: 0 };
        const member = data.members.find(m => m.id === log.memberId) || { name: 'Unknown' };
        csv += `${member.name},${dress.name},${dress.budget},${log.price},${log.price > 0 ? 'Purchased' : 'Pending'}\n`;
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
        return `
                <tr>
                    <td>${member.name}</td>
                    <td>${dress.name}</td>
                    <td>${dress.budget}</td>
                    <td>${log.price || 0}</td>
                    <td>=C${rowNum}-D${rowNum}</td>
                    <td>=IF(D${rowNum}>0, "Purchased", "Pending")</td>
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
                    <thead><tr><th>Member</th><th>Dress Type</th><th>Est Budget</th><th>Actual Price</th><th>Savings</th><th>Status</th></tr></thead>
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
window.exportCSV = exportCSV;
window.exportToExcel = exportToExcel;

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