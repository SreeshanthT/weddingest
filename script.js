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
    data[arrayName].splice(index, 1);
    renderAll();
    saveData();
}

function updateLog(index, field, value) {
    data.logs[index][field] = value;
    renderAll();
    saveData();
}

function renderAll() {
    // Render Dress Settings
    const dressBody = document.getElementById('dressTableBody');
    dressBody.innerHTML = data.dresses.map((d, i) => `
            <tr>
                <td class="p-3 border text-sm">${d.name}</td>
                <td class="p-3 border text-sm font-mono">₹${d.budget.toLocaleString()}</td>
                <td class="p-3 border"><button onclick="deleteItem('dresses', ${i})" class="text-red-500 text-xs">Delete</button></td>
            </tr>
        `).join('');

    // Render Members
    const memberBody = document.getElementById('memberTableBody');
    memberBody.innerHTML = data.members.map((m, i) => `
            <tr>
                <td class="p-3 border text-sm">${m.name}</td>
                <td class="p-3 border"><button onclick="deleteItem('members', ${i})" class="text-red-500 text-xs">Delete</button></td>
            </tr>
        `).join('');

    // Render Log
    const logBody = document.getElementById('logTableBody');
    let totalEst = 0;
    let totalSpent = 0;

    logBody.innerHTML = data.logs.map((log, i) => {
        const dressInfo = data.dresses.find(d => d.id === log.dressId) || { budget: 0 };
        const est = dressInfo.budget;
        const price = parseFloat(log.price) || 0;
        const savings = est > 0 ? est - price : 0;
        const status = price > 0 ? "Purchased" : "Pending";

        totalEst += est;
        totalSpent += price;

        return `
                <tr class="text-sm">
                    <td class="p-2 border">
                        <select onchange="updateLog(${i}, 'memberId', this.value)" class="w-full p-1 bg-transparent">
                            <option value="">Select Member</option>
                            ${data.members.map(m => `<option value="${m.id}" ${log.memberId === m.id ? 'selected' : ''}>${m.name}</option>`).join('')}
                        </select>
                    </td>
                    <td class="p-2 border">
                        <select onchange="updateLog(${i}, 'dressId', this.value)" class="w-full p-1 bg-transparent">
                            <option value="">Select Dress</option>
                            ${data.dresses.map(d => `<option value="${d.id}" ${log.dressId === d.id ? 'selected' : ''}>${d.name}</option>`).join('')}
                        </select>
                    </td>
                    <td class="p-2 border bg-gray-50 font-mono">₹${est.toLocaleString()}</td>
                    <td class="p-2 border">
                        <input type="number" value="${log.price}" onchange="updateLog(${i}, 'price', this.value)" class="w-full p-1 bg-transparent font-mono border-b border-gray-200">
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
}

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
    await loadData();
    renderAll();
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        loadData,
        saveData,
        getData: () => data,
        setData: (newData) => { data = newData; }
    };
}