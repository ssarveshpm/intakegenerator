/**
 * Premium Frontend Logic for Login and Auth Management
 */

const API_URL = "https://script.google.com/macros/s/AKfycbydi_iLeuJPrGs4AtyB-03Z3THQjN5J3vkc997znwgM_8JKhWFw-1EohePExkj4wTyR/exec";

// DOM Elements
const loginView = document.getElementById('login-view');
const dashboardView = document.getElementById('dashboard-view');
const addView = document.getElementById('add-view'); // NEW
const viewRecordView = document.getElementById('view-record-view'); // NEW
const logsView = document.getElementById('logs-view');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const loginBtn = document.getElementById('login-btn');
const loginLoader = document.getElementById('login-loader');
const userDisplay = document.getElementById('user-display');
const roleBadge = document.getElementById('role-badge');
const logoutBtn = document.getElementById('logout-btn');

// Grid & Form Elements
const gridBody = document.getElementById('grid-body');
const addRecordBtn = document.getElementById('add-record-btn');
const backBtn = document.getElementById('back-btn');
const numPersonsSelect = document.getElementById('num-persons');
const personFieldsContainer = document.getElementById('person-fields-container');
const submitIntakeBtn = document.getElementById('submit-record-btn');

// Global State
let cachedRecords = [];
let currentLogRef = '';
let currentLogRunId = '';

/**
 * Initialize components and check auth status
 */
document.addEventListener('DOMContentLoaded', () => {
    checkAuthSession();

    // Event Listeners
    if (loginForm) loginForm.addEventListener('submit', handleLogin);
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

    // Dashboard Navigation
    if (addRecordBtn) addRecordBtn.addEventListener('click', () => switchView('add'));
    if (backBtn) backBtn.addEventListener('click', () => switchView('dashboard'));

    // View Screen Back Buttons
    document.querySelectorAll('.back-to-dash').forEach(btn => {
        btn.addEventListener('click', () => switchView('dashboard'));
    });

    // Dynamic Form Logic
    if (numPersonsSelect) {
        numPersonsSelect.addEventListener('change', (e) => generatePersonFields(parseInt(e.target.value)));
    }

    const fetchLogsBtn = document.getElementById('fetch-latest-logs');
    if (fetchLogsBtn) {
        fetchLogsBtn.addEventListener('click', () => {
            if (currentLogRef && currentLogRunId) {
                const svg = fetchLogsBtn.querySelector('svg');
                if (svg) svg.classList.add('spinning');
                fetchLogsBtn.disabled = true;

                // Refresh logic - Force pull from GitHub
                viewLogs(currentLogRef, currentLogRunId, true);

                setTimeout(() => {
                    if (svg) svg.classList.remove('spinning');
                    fetchLogsBtn.disabled = false;
                }, 1000);
            }
        });
    }

    // Intake Submission
    if (submitIntakeBtn) submitIntakeBtn.addEventListener('click', handleIntakeSubmit);
});

/**
 * Handle Intake Form Submission
 */
async function handleIntakeSubmit(e) {
    if (e) e.preventDefault();

    const username = localStorage.getItem('loggedInUser');
    const role = localStorage.getItem('loggedInRole');
    const token = localStorage.getItem('authToken');
    const totalPersons = parseInt(numPersonsSelect.value);
    const portal = document.getElementById('portal').value;
    const level = document.getElementById('level').value;

    // 1. Collect all Person Data into structured JSON
    const personsData = {};
    for (let i = 1; i <= totalPersons; i++) {
        const baseId = `add-p${i}`;
        const fname = addView.querySelector(`input[name="p${i}_fname"]`)?.value || '';
        const lname = addView.querySelector(`input[name="p${i}_lname"]`)?.value || '';
        const gender = addView.querySelector(`select[name="p${i}_gender"]`)?.value || '';
        const dob = addView.querySelector(`input[name="p${i}_dob"]`)?.value || '';
        const p_role = addView.querySelector(`select[name="p${i}_role"]`)?.value || '';

        // Allegation fields (only for victims)
        const classification = document.getElementById(`${baseId}_classification_val`)?.value || '';
        const sexual = document.getElementById(`${baseId}_sexual_abuse_val`)?.value || '';
        const physical = document.getElementById(`${baseId}_physical_abuse_val`)?.value || '';
        const perpetrator = document.getElementById(`${baseId}_perpetrator_val`)?.value || '';

        personsData[`person${i}`] = {
            first_name: fname,
            last_name: lname,
            gender: gender,
            dob: dob.replace(/-/g, '/'), // Format as YYYY/MM/DD
            role: p_role,
            classification: classification,
            sexual: sexual,
            physical: physical,
            perpetrator: perpetrator
        };
    }

    // Show loading state
    const originalText = submitIntakeBtn.innerHTML;
    submitIntakeBtn.disabled = true;
    submitIntakeBtn.innerHTML = '<span class="loader-sm"></span> Submitting...';

    try {
        const body = new URLSearchParams();
        body.append('action', 'addRecord');
        body.append('username', username);
        body.append('role', role);
        body.append('token', token);
        body.append('totalPerson', totalPersons);
        body.append('portal', portal);
        body.append('level', level);
        body.append('personsData', JSON.stringify(personsData));

        const response = await fetch(API_URL, {
            method: 'POST',
            body: body
        });

        const result = await response.json();

        if (result.status === 'success') {
            switchView('dashboard');
        } else {
            if (result.message && result.message.toLowerCase().includes('token')) {
                handleAuthError(result.message);
            } else {
                alert(`Error: ${result.message}`);
            }
        }
    } catch (error) {
        console.error('Submission Error:', error);
        alert('Failed to connect to server. Check your connection or the Script URL.');
    } finally {
        submitIntakeBtn.disabled = false;
        submitIntakeBtn.innerHTML = originalText;
    }
}

/**
 * Handle Login Form Submission
 */
async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    toggleLoading(true);
    loginError.textContent = '';

    try {
        const response = await fetch(`${API_URL}?action=login&username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`, {
            method: 'POST'
        });

        if (!response.ok) throw new Error('Network response was not ok');

        const result = await response.json();

        if (result.status === 'success') {
            localStorage.setItem('loggedInUser', username);
            localStorage.setItem('loggedInRole', result.data.role);
            localStorage.setItem('authToken', result.data.token);

            showDashboard(username, result.data.role);
        } else {
            loginError.textContent = result.message || 'Invalid username or password';
        }
    } catch (error) {
        console.error('Login Error:', error);
        loginError.textContent = 'Server connection failed. Please try again later.';
    } finally {
        toggleLoading(false);
    }
}

/**
 * Transitions between main views
 */
function switchView(viewId) {
    // Hide all logically
    const views = [loginView, dashboardView, addView, viewRecordView, logsView];
    views.forEach(v => {
        if (v) {
            v.style.display = 'none';
            v.classList.add('hidden');
        }
    });

    // Show target
    let target = null;
    if (viewId === 'login') target = loginView;
    else if (viewId === 'dashboard') target = dashboardView;
    else if (viewId === 'add') target = addView;
    else if (viewId === 'view-record-view') target = viewRecordView;
    else if (viewId === 'logs') target = logsView;

    if (target) {
        target.style.display = (viewId === 'login' ? 'block' : 'flex');
        target.classList.remove('hidden');

        // Post-switch logic
        if (viewId === 'dashboard') renderGrid();
        if (viewId === 'add') generatePersonFields(parseInt(numPersonsSelect.value));
    }
}

/**
 * Renders the dashboard grid with live data from the backend
 */
async function renderGrid() {
    const gridBody = document.getElementById('grid-body');
    if (!gridBody) return;

    // Show loading state
    gridBody.innerHTML = `
        <tr>
            <td colspan="10" style="text-align: center; padding: 40px; color: var(--text-muted);">
                <span class="loader-sm" style="border-top-color: var(--primary);"></span> Loading records...
            </td>
        </tr>
    `;

    const username = localStorage.getItem('loggedInUser');
    const role = localStorage.getItem('loggedInRole');
    const token = localStorage.getItem('authToken');

    try {
        const url = `${API_URL}?action=fetchRecords&username=${encodeURIComponent(username)}&role=${encodeURIComponent(role)}&token=${encodeURIComponent(token)}`;
        const response = await fetch(url);
        const result = await response.json();

        if (result.status === 'success') {
            cachedRecords = result.data;

            if (cachedRecords.length === 0) {
                gridBody.innerHTML = `
                    <tr>
                        <td colspan="10" style="text-align: center; padding: 40px; color: var(--text-muted);">
                            No records found. Click the + button to add one.
                        </td>
                    </tr>
                `;
                return;
            }

            gridBody.innerHTML = cachedRecords.map(record => `
                <tr>
                    <td><span class="ref-no">${record.reference || '-'}</span></td>
                    <td>${formatDisplayDate(record.requesttime)}</td>
                    <td>${record.requestby || '-'}</td>
                    <td><code class="code-id">${record.runid || '-'}</code></td>
                    <td><code class="code-id">${record.jobid || '-'}</code></td>
                    <td>${record.portal || '-'}</td>
                    <td>
                        <span class="status-badge ${getStatusClass(record.runstatus)}">
                            ${capitalizeFirstLetter(record.runstatus || 'pending')}
                        </span>
                    </td>
                    <td>${record.jobtime || '-'}</td>
                    <td>${record.intakeno || '-'}</td>
                    <td>
                        <div class="action-btn-container">
                            <button class="action-btn view-btn" title="View Details" onclick="viewRecord('${record.reference}')">
                                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="18"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                            </button>
                            <button class="action-btn" title="Refresh Status" ${!record.runid ? 'disabled style="opacity:0.3; cursor:not-allowed;"' : ''} onclick="refreshRecordStatus('${record.reference}', '${record.runid}', this)">
                                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="18"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                            </button>
                            <button class="action-btn" title="View Logs" ${!record.jobid ? 'disabled style="opacity:0.3; cursor:not-allowed;"' : ''} onclick="viewLogs('${record.reference}', '${record.runid}')">
                                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="18"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                            </button>
                        </div>
                    </td>
                </tr>
            `).join('');
        } else {
            if (result.message && result.message.toLowerCase().includes('token')) {
                handleAuthError(result.message);
            } else {
                throw new Error(result.message);
            }
        }
    } catch (error) {
        console.error('Fetch Error:', error);
        gridBody.innerHTML = `
            <tr>
                <td colspan="10" style="text-align: center; padding: 40px; color: #ef4444;">
                    Error loading records: ${error.message}. Please refresh.
                </td>
            </tr>
        `;
    }
}

/**
 * Generates HTML for a person section (Add or View mode)
 */
function getPersonHTML(i, isViewOnly = false) {
    const prefix = isViewOnly ? 'view' : 'add';
    const baseId = `${prefix}-p${i}`;
    const disabledAttr = isViewOnly ? 'disabled' : '';

    // Scoped handlers
    const clickAttr = isViewOnly ? '' : `onclick="toggleDropdown('${baseId}_classification_list')"`;
    const sexualClick = isViewOnly ? '' : `onclick="toggleDropdown('${baseId}_sexual_abuse_list')"`;
    const physicalClick = isViewOnly ? '' : `onclick="toggleDropdown('${baseId}_physical_abuse_list')"`;
    const perpClick = isViewOnly ? '' : `onclick="toggleDropdown('${baseId}_perpetrator_list')"`;

    return `
        <div class="person-section ${isViewOnly ? 'view-only' : ''}">
            <h3>Person ${i}</h3>
            <div class="form-row dense">
                <div class="form-group">
                    <label>First Name</label>
                    <input type="text" placeholder="First Name" ${disabledAttr} name="p${i}_fname">
                </div>
                <div class="form-group">
                    <label>Last Name</label>
                    <input type="text" placeholder="Last Name" ${disabledAttr} name="p${i}_lname">
                </div>
                <div class="form-group">
                    <label>Gender</label>
                    <select class="form-select" ${disabledAttr} name="p${i}_gender">
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Date of Birth</label>
                    <input type="date" ${disabledAttr} name="p${i}_dob">
                </div>
            </div>
            <div class="form-row dense">
                <div class="form-group">
                    <label>Role</label>
                    <select class="form-select role-select" data-person="${i}" ${disabledAttr} name="p${i}_role">
                        <option value="Alleged Perpetrator">Alleged Perpetrator</option>
                        <option value="Alleged Victim">Alleged Victim</option>
                    </select>
                </div>
            </div>
            
            <div id="${baseId}-victim-fields" class="victim-fields hidden">
                <div class="form-row dense">
                    <div class="form-group">
                        <label>Classification (Multi-select)</label>
                        <div class="multi-select-container" id="${baseId}_classification_wrap">
                            <div class="multi-select-display" ${clickAttr}>
                                <span class="placeholder-text">Select Classification...</span>
                            </div>
                            <div class="dropdown-list" id="${baseId}_classification_list">
                                <div class="dropdown-item" onclick="selectMultiItem('${baseId}', 'classification', 'Child Death')">Child Death</div>
                                <div class="dropdown-item" onclick="selectMultiItem('${baseId}', 'classification', 'Hospital')">Hospital</div>
                            </div>
                            <input type="hidden" name="p${i}_classification" id="${baseId}_classification_val">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Sexual Abuse (Multi-select)</label>
                        <div class="multi-select-container" id="${baseId}_sexual_abuse_wrap">
                            <div class="multi-select-display" ${sexualClick}>
                                <span class="placeholder-text">Select Sexual Abuse...</span>
                            </div>
                            <div class="dropdown-list" id="${baseId}_sexual_abuse_list">
                                <div class="dropdown-item" onclick="selectMultiItem('${baseId}', 'sexual_abuse', 'Sexual Assault')">Sexual Assault</div>
                                <div class="dropdown-item" onclick="selectMultiItem('${baseId}', 'sexual_abuse', 'Labor trafficking')">Labor trafficking</div>
                            </div>
                            <input type="hidden" name="p${i}_sexual_abuse" id="${baseId}_sexual_abuse_val">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Physical Abuse (Multi-select)</label>
                        <div class="multi-select-container" id="${baseId}_physical_abuse_wrap">
                            <div class="multi-select-display" ${physicalClick}>
                                <span class="placeholder-text">Select Physical Abuse...</span>
                            </div>
                            <div class="dropdown-list" id="${baseId}_physical_abuse_list">
                                <div class="dropdown-item" onclick="selectMultiItem('${baseId}', 'physical_abuse', 'Death')">Death</div>
                                <div class="dropdown-item" onclick="selectMultiItem('${baseId}', 'physical_abuse', 'Extreme Pain')">Extreme Pain</div>
                            </div>
                            <input type="hidden" name="p${i}_physical_abuse" id="${baseId}_physical_abuse_val">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Perpetrator (Multi-select)</label>
                        <div class="multi-select-container" id="${baseId}_perpetrator_wrap">
                            <div class="multi-select-display" ${perpClick}>
                                <span class="placeholder-text">Select Perpetrator...</span>
                            </div>
                            <div class="dropdown-list" id="${baseId}_perpetrator_list">
                                <!-- Dynamically populated -->
                            </div>
                            <input type="hidden" name="p${i}_perpetrator" id="${baseId}_perpetrator_val">
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Refreshes the status of a specific record by calling the backend
 */
async function refreshRecordStatus(reference, runid, btn) {
    if (!runid) return;

    const svg = btn.querySelector('svg');
    if (svg) svg.classList.add('spinning');
    btn.disabled = true;

    try {
        const username = localStorage.getItem('loggedInUser');
        const role = localStorage.getItem('loggedInRole');
        const token = localStorage.getItem('authToken');

        const url = `${API_URL}?action=refreshStatus&username=${encodeURIComponent(username)}&role=${encodeURIComponent(role)}&token=${encodeURIComponent(token)}&runId=${encodeURIComponent(runid)}`;

        const response = await fetch(url, { method: 'POST' });
        const result = await response.json();

        if (result.status === 'success') {
            const newStatus = result.data.status;
            const newJobTime = result.data.jobtime;
            const newJobId = result.data.jobid;

            // 1. Update local cache
            const rec = cachedRecords.find(r => r.reference === reference);
            if (rec) {
                rec.runstatus = newStatus;
                rec.jobtime = newJobTime;
                rec.jobid = newJobId;
            }

            // 2. Update the UI in the same row
            const row = btn.closest('tr');
            if (row) {
                // Update Badge
                const badge = row.querySelector('.status-badge');
                if (badge) {
                    badge.textContent = capitalizeFirstLetter(newStatus);
                    badge.className = `status-badge ${getStatusClass(newStatus)}`;
                }

                // Update Job ID cell (index 4)
                if (row.cells && row.cells[4]) {
                    const idCode = row.cells[4].querySelector('.code-id');
                    if (idCode) idCode.textContent = newJobId || '-';
                    else row.cells[4].textContent = newJobId || '-';
                }

                // Update Run Time cell (index 7)
                if (row.cells && row.cells[7]) {
                    row.cells[7].textContent = newJobTime || '-';
                }

                // Enable View Logs button if Job ID is now available
                if (newJobId) {
                    const logsBtn = row.querySelector('button[title="View Logs"]');
                    if (logsBtn) {
                        logsBtn.disabled = false;
                        logsBtn.style.opacity = "1";
                        logsBtn.style.cursor = "pointer";
                    }
                }
            }
        } else {
            if (result.message && result.message.toLowerCase().includes('token')) {
                handleAuthError(result.message);
            } else {
                alert('Refresh failed: ' + result.message);
            }
        }
    } catch (error) {
        console.error('Refresh Error:', error);
        alert('Server connection failed during refresh.');
    } finally {
        if (svg) svg.classList.remove('spinning');
        btn.disabled = false;
    }
}

/**
 * View Record Logic
 */
function viewRecord(reference) {
    const record = cachedRecords.find(r => r.reference === reference);
    if (!record) return;

    // 1. Setup Header
    const refDisplay = document.getElementById('view-ref-display');
    if (refDisplay) refDisplay.textContent = `Reference: ${record.reference} | Status: ${capitalizeFirstLetter(record.runstatus)}`;

    const portalDisplay = document.getElementById('view-portal-display');
    const levelDisplay = document.getElementById('view-level-display');
    if (portalDisplay) portalDisplay.textContent = `Portal: ${record.portal || '-'}`;
    if (levelDisplay) levelDisplay.textContent = `Level: ${record.level || '-'}`;

    // 2. Parse Persons Data
    let persons = {};
    try {
        persons = JSON.parse(record.personsdata || '{}');
    } catch (e) {
        console.error('JSON Parse Error:', e);
    }

    // 3. Render Form-like Sections
    const container = document.getElementById('view-person-details');
    if (!container) return;

    container.innerHTML = '';
    // Clear personSelections for view mode to allow fresh updateMultiDisplay calls
    for (const key in personSelections) delete personSelections[key];

    Object.keys(persons).forEach(pKey => {
        const p = persons[pKey];
        const id = pKey.replace('person', '');
        const section = document.createElement('div');
        section.innerHTML = getPersonHTML(id, true);
        container.appendChild(section.firstElementChild);

        // Populate values
        const doc = container.lastElementChild;
        doc.querySelector(`input[name="p${id}_fname"]`).value = p.first_name || '';
        doc.querySelector(`input[name="p${id}_lname"]`).value = p.last_name || '';
        doc.querySelector(`select[name="p${id}_gender"]`).value = p.gender || 'Male';
        doc.querySelector(`input[name="p${id}_dob"]`).value = formatDateForInput(p.dob);
        doc.querySelector(`select[name="p${id}_role"]`).value = p.role || '';

        const baseId = `view-p${id}`;
        const v_flds = document.getElementById(`${baseId}-victim-fields`);
        if (p.role === 'Alleged Victim' && v_flds) {
            v_flds.classList.remove('hidden');
        }

        // Populate multi-selects
        ['classification', 'sexual_abuse', 'physical_abuse', 'perpetrator'].forEach(field => {
            const rawVal = p[field === 'sexual_abuse' ? 'sexual' : (field === 'physical_abuse' ? 'physical' : field)];
            if (rawVal) {
                const vals = rawVal.split(', ');
                personSelections[`${baseId}_${field}`] = vals;
                // Custom display update for View (no remove button)
                updateMultiDisplay(baseId, field, true);
            } else {
                updateMultiDisplay(baseId, field, true);
            }
        });
    });

    switchView('view-record-view');
}

/**
 * Helper: Format YYYY/MM/DD to YYYY-MM-DD for input[type=date]
 */
function formatDateForInput(dateStr) {
    if (!dateStr) return '';
    return dateStr.replace(/\//g, '-');
}

/**
 * Helper: Get status badge class
 */
function getStatusClass(status) {
    status = String(status).toLowerCase();
    if (status === 'success' || status === 'completed') return 'status-success';
    if (status === 'error' || status === 'failed') return 'status-error';
    return 'status-pending';
}

/**
 * Helper: Format date for display (Local YYYY-MM-DD HH:mm)
 */
function formatDisplayDate(val) {
    if (!val) return '-';
    const date = new Date(val);
    if (isNaN(date.getTime())) return String(val).replace('T', ' ').substring(0, 16);

    const y = date.getFullYear();
    const mo = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const mi = String(date.getMinutes()).padStart(2, '0');

    return `${y}-${mo}-${d} ${h}:${mi}`;
}

/**
 * Helper: Capitalize first letter
 */
function capitalizeFirstLetter(string) {
    if (!string) return '-';
    string = String(string);
    return string.charAt(0).toUpperCase() + string.slice(1);
}

function generatePersonFields(count) {
    personFieldsContainer.innerHTML = '';
    // Clear selections to prevent stale data
    for (const key in personSelections) delete personSelections[key];

    for (let i = 1; i <= count; i++) {
        const section = document.createElement('div');
        section.innerHTML = getPersonHTML(i);
        personFieldsContainer.appendChild(section.firstElementChild);

        const baseId = `add-p${i}`;
        const sectionEl = personFieldsContainer.lastElementChild;
        const f_inp = sectionEl.querySelector(`input[name="p${i}_fname"]`);
        const l_inp = sectionEl.querySelector(`input[name="p${i}_lname"]`);
        const d_inp = sectionEl.querySelector(`input[name="p${i}_dob"]`);
        const g_sel = sectionEl.querySelector(`select[name="p${i}_gender"]`);
        const r_sel = sectionEl.querySelector('.role-select');
        const v_flds = document.getElementById(`${baseId}-victim-fields`);

        // Pre-fill defaults for Person 1 and 2
        if (i === 1) {
            f_inp.value = 'Edmun';
            l_inp.value = 'Gene';
            g_sel.value = 'Male';
            d_inp.value = '2020-01-21';
            r_sel.value = 'Alleged Victim';
            if (v_flds) v_flds.classList.remove('hidden');
        } else if (i === 2) {
            f_inp.value = 'Monty';
            l_inp.value = 'Norris';
            g_sel.value = 'Female';
            d_inp.value = '1990-05-29';
            r_sel.value = 'Alleged Perpetrator';
        }

        // Add reactive listeners for dynamic perpetrator list
        const updateTrigger = () => refreshPerpetratorLists();
        f_inp.addEventListener('input', updateTrigger);
        l_inp.addEventListener('input', updateTrigger);
        r_sel.addEventListener('change', (e) => {
            const vf = document.getElementById(`${baseId}-victim-fields`);
            if (e.target.value === 'Alleged Victim') {
                if (vf) vf.classList.remove('hidden');
            } else {
                if (vf) vf.classList.add('hidden');
            }
            updateTrigger();
        });
    }

    // Set multi-select defaults for Person 1 (Victim)
    if (count >= 1) {
        selectMultiItem('add-p1', 'classification', 'Hospital');
        selectMultiItem('add-p1', 'sexual_abuse', 'Sexual Assault');
        selectMultiItem('add-p1', 'physical_abuse', 'Extreme Pain');
    }

    refreshPerpetratorLists();

    // Select default perpetrator for Person 1 after options are available
    if (count >= 2) {
        selectMultiItem('add-p1', 'perpetrator', 'Monty Norris');
    }
}

/**
 * Dynamic Perpetrator Logic - Simple string-based approach
 */
function refreshPerpetratorLists() {
    const perpNames = [];
    const count = parseInt(numPersonsSelect.value);

    // 1. Collect all current Perpetrator names
    for (let i = 1; i <= count; i++) {
        const fname = addView.querySelector(`input[name="p${i}_fname"]`)?.value || '';
        const lname = addView.querySelector(`input[name="p${i}_lname"]`)?.value || '';
        const role = addView.querySelector(`select[name="p${i}_role"]`)?.value;

        if (role === 'Alleged Perpetrator' && (fname || lname)) {
            perpNames.push(`${fname} ${lname}`.trim());
        }
    }

    // 2. Update all Victim "Perpetrator" dropdowns
    for (let i = 1; i <= count; i++) {
        const baseId = `add-p${i}`;
        const list = document.getElementById(`${baseId}_perpetrator_list`);
        if (!list) continue;

        list.innerHTML = perpNames.length ? perpNames.map(name => `
            <div class="dropdown-item" onclick="selectMultiItem('${baseId}', 'perpetrator', '${name}')">${name}</div>
        `).join('') : '<div class="dropdown-item" style="opacity: 0.5; pointer-events: none;">No Perpetrators found</div>';

        updateMultiDisplay(baseId, 'perpetrator');
    }
}

/**
 * Multi-select Dropdown Logic
 */
const personSelections = {}; // Stores arrays of selected values: { '1_classification': ['A', 'B'] }

function toggleDropdown(listId) {
    const list = document.getElementById(listId);
    if (!list) return;
    const isShowing = list.classList.contains('show');

    // Close all others first
    document.querySelectorAll('.dropdown-list').forEach(l => l.classList.remove('show'));

    if (!isShowing) list.classList.add('show');
    if (window.event) window.event.stopPropagation();
}

function selectMultiItem(personId, field, value) {
    const key = `${personId}_${field}`;
    if (!personSelections[key]) personSelections[key] = [];

    if (!personSelections[key].includes(value)) {
        personSelections[key].push(value);
        updateMultiDisplay(personId, field);
    }

    // Prevent dropdown from closing
    if (window.event) window.event.stopPropagation();
}

function removeMultiItem(personId, field, value) {
    const key = `${personId}_${field}`;
    personSelections[key] = personSelections[key].filter(v => v !== value);
    updateMultiDisplay(personId, field);
    if (window.event) window.event.stopPropagation();
}

function updateMultiDisplay(personId, field, isViewOnly = false) {
    const key = `${personId}_${field}`;
    const values = personSelections[key] || [];
    const container = document.querySelector(`#${personId}_${field}_wrap .multi-select-display`);
    const hiddenInput = document.getElementById(`${personId}_${field}_val`);

    if (!container || !hiddenInput) return;

    hiddenInput.value = values.join(', ');

    if (values.length === 0) {
        container.innerHTML = `<span class="placeholder-text">Select ${field.replace('_', ' ')}...</span>`;
    } else {
        container.innerHTML = values.map(v => `
            <span class="tag">
                ${v}
                ${isViewOnly ? '' : `<span class="tag-remove" onclick="removeMultiItem('${personId}', '${field}', '${v}')">&times;</span>`}
            </span>
        `).join('');
    }

    // Highlight selected items in list
    const listItems = document.querySelectorAll(`#${personId}_${field}_list .dropdown-item`);
    listItems.forEach(item => {
        if (values.includes(item.textContent.trim())) {
            item.classList.add('selected');
        } else {
            item.classList.remove('selected');
        }
    });
}

// Global click-away handler
document.addEventListener('click', () => {
    document.querySelectorAll('.dropdown-list').forEach(l => l.classList.remove('show'));
});

/**
 * View Logs Logic - Dynamic fetching from Sheets or live GitHub
 */
async function viewLogs(reference, runid, forceRefresh = false) {
    if (!runid && !reference) return;
    currentLogRef = reference;
    currentLogRunId = runid;

    const logRefDisplay = document.getElementById('log-ref-display');
    const logContent = document.getElementById('log-content');

    if (logRefDisplay) logRefDisplay.textContent = `Logs for Reference: ${reference} | Run ID: ${runid || 'N/A'}`;

    // Switch view and show loading immediately
    switchView('logs');
    if (logContent) {
        const loadingMsg = forceRefresh ? 'Synchronizing live logs from GitHub...' : 'Fetching logs from DB...';
        logContent.innerHTML = `<span class="status-badge status-pending" style="background:none;"><span class="loader-sm" style="display:inline-block; margin-right:8px;"></span>${loadingMsg}</span>`;
    }

    try {
        const username = localStorage.getItem('loggedInUser');
        const role = localStorage.getItem('loggedInRole');
        const token = localStorage.getItem('authToken');

        const action = forceRefresh ? 'refreshLogs' : 'fetchLogs';
        const url = `${API_URL}?action=${action}&username=${encodeURIComponent(username)}&role=${encodeURIComponent(role)}&token=${encodeURIComponent(token)}&reference=${encodeURIComponent(reference)}`;

        const response = await fetch(url);
        const result = await response.json();

        if (result.status === 'success') {
            const rawLogs = typeof result.data === 'string' ? result.data : (result.data.logs || "");
            const intakeNo = result.data.intakeno || "";

            // Update local cache and UI if we have fresh intake data
            if (intakeNo) {
                const rec = cachedRecords.find(r => r.reference === reference);
                if (rec) rec.intakeno = intakeNo;

                // Safer row finding for grid update
                const gridRows = document.querySelectorAll('#grid-body tr');
                gridRows.forEach(tr => {
                    const refSpan = tr.querySelector('.ref-no');
                    if (refSpan && refSpan.textContent === reference) {
                        if (tr.cells && tr.cells[8]) tr.cells[8].textContent = intakeNo;
                    }
                });
            }

            // Format logs into terminal lines
            logContent.innerHTML = rawLogs.split('\n').map(line => {
                if (!line.trim()) return '';

                // Try to extract timestamp (GitHub format is common)
                const timestampMatch = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z)\s*(.*)/);

                if (timestampMatch) {
                    return `<div class="log-line"><span class="log-timestamp">${timestampMatch[1]}</span><span class="log-message">${timestampMatch[2]}</span></div>`;
                } else {
                    return `<div class="log-line"><span class="log-message">${line}</span></div>`;
                }
            }).join('');

            // Scroll to bottom
            setTimeout(() => { if (logContent) logContent.scrollTop = logContent.scrollHeight; }, 100);

        } else {
            if (result.message && result.message.toLowerCase().includes('token')) {
                handleAuthError(result.message);
            } else {
                logContent.innerHTML = `<span class="status-badge status-error" style="background:none;">Fetch Failed: ${result.message}</span>`;
            }
        }
    } catch (error) {
        console.error('Log Fetch Error:', error);
        if (logContent) logContent.innerHTML = '<span class="status-badge status-error" style="background:none;">Server connection failed while loading logs.</span>';
    }
}

/**
 * Transitions from login view to dashboard
 */
function showDashboard(username, role) {
    switchView('dashboard');
    userDisplay.textContent = username;
    roleBadge.textContent = role;
}

/**
 * Transitions from dashboard to login view
 */
function showLogin() {
    switchView('login');
}

/**
 * Clear session and redirect to login
 */
function handleLogout() {
    localStorage.removeItem('loggedInUser');
    localStorage.removeItem('loggedInRole');
    localStorage.removeItem('authToken');
    showLogin();
}

/**
 * Handle API authentication errors
 */
function handleAuthError(message) {
    console.warn('Auth Error:', message);
    alert(message || 'Session expired. Please log in again.');
    handleLogout();
}

/**
 * Check if the user is already logged in
 */
function checkAuthSession() {
    const user = localStorage.getItem('loggedInUser');
    const role = localStorage.getItem('loggedInRole');
    const token = localStorage.getItem('authToken');

    if (user && role && token) {
        showDashboard(user, role);
    } else {
        handleLogout();
    }
}

/**
 * Helper to show/hide loading state
 */
function toggleLoading(isLoading) {
    if (!loginBtn || !loginLoader) return;
    loginBtn.disabled = isLoading;
    loginLoader.style.display = isLoading ? 'block' : 'none';
    const span = loginBtn.querySelector('span');
    if (span) span.style.display = isLoading ? 'none' : 'inline';
}
