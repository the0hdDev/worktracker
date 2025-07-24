// Configuration
const API_BASE = 'http://localhost:3000';

// State
let isWorking = false;
let sessionStart = null;
let sessionInterval = null;
let currentTab = 'work';

// DOM Elements
const workBtn = document.getElementById('workBtn');
const sessionTimeDiv = document.getElementById('sessionTime');
const todayTimeDiv = document.getElementById('todayTime');
const weekTimeDiv = document.getElementById('weekTime');
const totalTimeDiv = document.getElementById('totalTime');
const avgTimeDiv = document.getElementById('avgTime');
const workDaysDiv = document.getElementById('workDays');
const tableBody = document.getElementById('tableBody');
const loadingDiv = document.getElementById('loading');
const refreshBtn = document.getElementById('refreshBtn');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');

// Navigation elements
const navLinks = document.querySelectorAll('.nav-link');
const tabContents = document.querySelectorAll('.tab-content');

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    setupEventListeners();
});

function initializeApp() {
    // Load initial data
    loadStats();
    
    // Set up tab navigation
    setupTabs();
    
    // Check if we were working (in case of page refresh)
    checkWorkingStatus();
}

function setupEventListeners() {
    workBtn.addEventListener('click', toggleWork);
    refreshBtn.addEventListener('click', () => {
        loadStats();
        loadTimeTable();
    });
}

function setupTabs() {
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const tabName = link.getAttribute('data-tab');
            switchTab(tabName);
        });
    });
}

function switchTab(tabName) {
    // Update navigation
    navLinks.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('data-tab') === tabName) {
            link.classList.add('active');
        }
    });

    // Update tab content
    tabContents.forEach(content => {
        content.classList.remove('active');
    });
    
    document.getElementById(`${tabName}-tab`).classList.add('active');
    currentTab = tabName;

    // Load data for review tab
    if (tabName === 'review') {
        loadTimeTable();
    }
}

async function toggleWork() {
    if (!isWorking) {
        await startWork();
    } else {
        await stopWork();
    }
}

async function startWork() {
    try {
        const response = await fetch(`${API_BASE}/work/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timestamp: new Date().toISOString() })
        });

        if (response.ok) {
            sessionStart = new Date();
            isWorking = true;
            updateWorkButton();
            updateStatus();
            
            // Start session timer
            sessionInterval = setInterval(updateSessionTime, 1000);
        } else {
            throw new Error('Failed to start work session');
        }
    } catch (error) {
        console.error('Error starting work:', error);
        alert('Fehler beim Starten der Arbeitszeit. Bitte versuchen Sie es erneut.');
    }
}

async function stopWork() {
    try {
        const response = await fetch(`${API_BASE}/work/stop`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timestamp: new Date().toISOString() })
        });

        if (response.ok) {
            isWorking = false;
            sessionStart = null;
            updateWorkButton();
            updateStatus();
            
            // Clear session timer
            if (sessionInterval) {
                clearInterval(sessionInterval);
                sessionInterval = null;
            }
            
            // Reset session time display
            sessionTimeDiv.textContent = '0h 0m';
            
            // Refresh stats
            loadStats();
            
            // If we're on review tab, refresh the table
            if (currentTab === 'review') {
                loadTimeTable();
            }
        } else {
            throw new Error('Failed to stop work session');
        }
    } catch (error) {
        console.error('Error stopping work:', error);
        alert('Fehler beim Beenden der Arbeitszeit. Bitte versuchen Sie es erneut.');
    }
}

function updateWorkButton() {
    const buttonIcon = workBtn.querySelector('.button-icon');
    const buttonText = workBtn.querySelector('.button-text');
    
    if (isWorking) {
        workBtn.classList.add('working');
        buttonIcon.textContent = '⏹️';
        buttonText.textContent = 'ARBEIT BEENDEN';
    } else {
        workBtn.classList.remove('working');
        buttonIcon.textContent = '▶️';
        buttonText.textContent = 'ARBEIT STARTEN';
    }
}

function updateStatus() {
    if (isWorking) {
        statusDot.classList.add('working');
        statusText.textContent = 'Arbeitszeit läuft...';
    } else {
        statusDot.classList.remove('working');
        statusText.textContent = 'Bereit zum Arbeiten';
    }
}

function updateSessionTime() {
    if (sessionStart && isWorking) {
        const now = new Date();
        const diff = now - sessionStart;
        const minutes = Math.floor(diff / 60000);
        sessionTimeDiv.textContent = formatTime(minutes);
    }
}

async function loadStats() {
    try {
        const response = await fetch(`${API_BASE}/stats`);
        
        if (!response.ok) {
            throw new Error('Failed to load stats');
        }
        
        const data = await response.json();
        
        // Update current tab stats
        todayTimeDiv.textContent = formatTime(data.todayMinutes || 0);
        weekTimeDiv.textContent = formatTime(data.weekMinutes || 0);
        
        // Update review tab stats
        totalTimeDiv.textContent = formatTime(data.totalMinutes || 0);
        avgTimeDiv.textContent = formatTime(data.avgDailyMinutes || 0);
        workDaysDiv.textContent = data.workDays || 0;
        
    } catch (error) {
        console.error('Error loading stats:', error);
        // Set default values on error
        todayTimeDiv.textContent = '0h 0m';
        weekTimeDiv.textContent = '0h 0m';
        totalTimeDiv.textContent = '0h 0m';
        avgTimeDiv.textContent = '0h 0m';
        workDaysDiv.textContent = '0';
    }
}

async function loadTimeTable() {
    showLoading(true);
    
    try {
        const response = await fetch(`${API_BASE}/timesheet`);
        
        if (!response.ok) {
            throw new Error('Failed to load timesheet');
        }
        
        const data = await response.json();
        
        tableBody.innerHTML = '';
        
        if (data.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="4" class="no-data">Noch keine Arbeitsdaten vorhanden</td></tr>';
        } else {
            data.forEach(day => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td><strong>${formatDate(day.date)}</strong></td>
                    <td><strong>${formatTime(day.totalMinutes)}</strong></td>
                    <td>${formatHourlyBreakdown(day.hourlyBreakdown)}</td>
                    <td>${formatSessions(day.sessions)}</td>
                `;
                tableBody.appendChild(row);
            });
        }
    } catch (error) {
        console.error('Error loading time table:', error);
        tableBody.innerHTML = '<tr><td colspan="4" class="no-data">Fehler beim Laden der Daten</td></tr>';
    } finally {
        showLoading(false);
    }
}

function showLoading(show) {
    loadingDiv.style.display = show ? 'flex' : 'none';
}

async function checkWorkingStatus() {
    try {
        const response = await fetch(`${API_BASE}/status`);
        if (response.ok) {
            const data = await response.json();
            
            if (data.isWorking && data.sessionStart) {
                isWorking = true;
                sessionStart = new Date(data.sessionStart);
                updateWorkButton();
                updateStatus();
                
                // Start session timer
                sessionInterval = setInterval(updateSessionTime, 1000);
                updateSessionTime(); // Update immediately
            }
        }
    } catch (error) {
        console.error('Error checking working status:', error);
    }
}

// Utility Functions
function formatTime(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (isSameDay(date, today)) {
        return '🔥 Heute';
    } else if (isSameDay(date, yesterday)) {
        return '📅 Gestern';
    } else {
        return date.toLocaleDateString('de-DE', {
            weekday: 'short',
            day: '2-digit',
            month: '2-digit'
        });
    }
}

function isSameDay(date1, date2) {
    return date1.getDate() === date2.getDate() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getFullYear() === date2.getFullYear();
}

function formatHourlyBreakdown(hourly) {
    if (!hourly || Object.keys(hourly).length === 0) {
        return '<span style="color: #999;">Keine Daten</span>';
    }
    
    const pills = Object.entries(hourly)
        .filter(([hour, minutes]) => minutes > 0)
        .sort(([a], [b]) => parseInt(a) - parseInt(b))
        .map(([hour, minutes]) => {
            return `<span class="hour-pill">${hour}:00 (${formatTime(minutes)})</span>`;
        });
    
    return `<div class="hour-pills">${pills.join('')}</div>`;
}

function formatSessions(sessions) {
    if (!sessions || sessions.length === 0) {
        return '<span style="color: #999;">-</span>';
    }
    
    const pills = sessions.map(session => {
        const start = new Date(session.start).toLocaleTimeString('de-DE', {
            hour: '2-digit',
            minute: '2-digit'
        });
        const end = session.end ? 
            new Date(session.end).toLocaleTimeString('de-DE', {
                hour: '2-digit',
                minute: '2-digit'
            }) : 'läuft...';
        
        const duration = session.minutes ? formatTime(session.minutes) : '';
        
        return `<span class="session-pill">${start}-${end} ${duration}</span>`;
    });
    
    return `<div class="session-pills">${pills.join('')}</div>`;
}

// Auto-refresh stats every 30 seconds when on work tab
setInterval(() => {
    if (currentTab === 'work') {
        loadStats();
    }
}, 30000);

// Handle page visibility change to maintain session state
document.addEventListener('visibilitychange', function() {
    if (!document.hidden && isWorking) {
        // Page is visible again, update session time
        updateSessionTime();
    }
});

// Handle page unload to clean up
window.addEventListener('beforeunload', function() {
    if (sessionInterval) {
        clearInterval(sessionInterval);
    }
});