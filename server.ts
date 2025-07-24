const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3000;
const DATA_FILE = 'timetracking.json';

// Middleware
app.use(cors());
app.use(express.json());

// In-memory state for current session
let currentSession = {
    isWorking: false,
    sessionStart: null
};

// Initialize data file if it doesn't exist
async function initializeDataFile() {
    try {
        await fs.access(DATA_FILE);
    } catch (error) {
        // File doesn't exist, create it
        const initialData = {
            sessions: [],
            dailyStats: {},
            totalMinutes: 0
        };
        await fs.writeFile(DATA_FILE, JSON.stringify(initialData, null, 2));
        console.log('Created initial data file');
    }
}

// Read data from JSON file
async function readData() {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading data:', error);
        return { sessions: [], dailyStats: {}, totalMinutes: 0 };
    }
}

// Write data to JSON file
async function writeData(data) {
    try {
        await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error writing data:', error);
    }
}

// Helper function to get today's date string
function getTodayString() {
    return new Date().toISOString().split('T')[0];
}

// Helper function to get this week's start date
function getWeekStartString() {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Monday as start of week
    const monday = new Date(now.setDate(diff));
    return monday.toISOString().split('T')[0];
}

// Start work session
app.post('/work/start', async (req, res) => {
    try {
        if (currentSession.isWorking) {
            return res.status(400).json({ error: 'Already working' });
        }

        const now = new Date();
        currentSession.isWorking = true;
        currentSession.sessionStart = now;

        const data = await readData();
        
        // Add new session to data
        const session = {
            start: now.toISOString(),
            end: null,
            minutes: 0,
            date: getTodayString()
        };
        
        data.sessions.push(session);
        await writeData(data);

        console.log(`Work started at ${now.toLocaleString()}`);
        res.json({ success: true, sessionStart: now.toISOString() });
    } catch (error) {
        console.error('Error starting work:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Stop work session
app.post('/work/stop', async (req, res) => {
    try {
        if (!currentSession.isWorking) {
            return res.status(400).json({ error: 'Not currently working' });
        }

        const now = new Date();
        const sessionDuration = Math.floor((now - currentSession.sessionStart) / 60000); // minutes

        currentSession.isWorking = false;
        const sessionStart = currentSession.sessionStart;
        currentSession.sessionStart = null;

        const data = await readData();
        
        // Find the current session and update it
        const currentSessionIndex = data.sessions.length - 1;
        if (currentSessionIndex >= 0) {
            data.sessions[currentSessionIndex].end = now.toISOString();
            data.sessions[currentSessionIndex].minutes = sessionDuration;
        }

        // Update daily stats
        const today = getTodayString();
        const hour = sessionStart.getHours();

        if (!data.dailyStats[today]) {
            data.dailyStats[today] = {
                totalMinutes: 0,
                hourlyBreakdown: {},
                sessions: []
            };
        }

        // Add session to daily stats
        data.dailyStats[today].sessions.push({
            start: sessionStart.toISOString(),
            end: now.toISOString(),
            minutes: sessionDuration
        });

        // Update hourly breakdown
        const sessionHours = getSessionHours(sessionStart, now);
        sessionHours.forEach(({ hour, minutes }) => {
            if (!data.dailyStats[today].hourlyBreakdown[hour]) {
                data.dailyStats[today].hourlyBreakdown[hour] = 0;
            }
            data.dailyStats[today].hourlyBreakdown[hour] += minutes;
        });

        // Update daily total
        data.dailyStats[today].totalMinutes += sessionDuration;

        // Update overall total
        data.totalMinutes = (data.totalMinutes || 0) + sessionDuration;

        await writeData(data);

        console.log(`Work stopped at ${now.toLocaleString()}, duration: ${sessionDuration} minutes`);
        res.json({ success: true, sessionDuration });
    } catch (error) {
        console.error('Error stopping work:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get current working status
app.get('/status', (req, res) => {
    res.json({
        isWorking: currentSession.isWorking,
        sessionStart: currentSession.sessionStart
    });
});

// Get statistics
app.get('/stats', async (req, res) => {
    try {
        const data = await readData();
        const today = getTodayString();
        const weekStart = getWeekStartString();

        // Calculate today's minutes
        const todayMinutes = data.dailyStats[today]?.totalMinutes || 0;

        // Calculate this week's minutes
        let weekMinutes = 0;
        const weekStartDate = new Date(weekStart);
        Object.entries(data.dailyStats).forEach(([date, dayData]) => {
            const dayDate = new Date(date);
            if (dayDate >= weekStartDate) {
                weekMinutes += dayData.totalMinutes;
            }
        });

        // Calculate work days and average
        const workDays = Object.keys(data.dailyStats).length;
        const avgDailyMinutes = workDays > 0 ? Math.floor(data.totalMinutes / workDays) : 0;

        res.json({
            totalMinutes: data.totalMinutes || 0,
            todayMinutes,
            weekMinutes,
            workDays,
            avgDailyMinutes
        });
    } catch (error) {
        console.error('Error getting stats:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get timesheet data
app.get('/timesheet', async (req, res) => {
    try {
        const data = await readData();
        
        // Convert daily stats to array and sort by date (newest first)
        const timesheet = Object.entries(data.dailyStats)
            .map(([date, dayData]) => ({
                date,
                totalMinutes: dayData.totalMinutes,
                hourlyBreakdown: dayData.hourlyBreakdown,
                sessions: dayData.sessions
            }))
            .sort((a, b) => new Date(b.date) - new Date(a.date));

        res.json(timesheet);
    } catch (error) {
        console.error('Error getting timesheet:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Helper function to calculate minutes per hour for a session
function getSessionHours(start, end) {
    const result = [];
    const startHour = start.getHours();
    const endHour = end.getHours();
    
    if (startHour === endHour) {
        // Session within same hour
        const minutes = Math.floor((end - start) / 60000);
        result.push({ hour: startHour, minutes });
    } else {
        // Session spans multiple hours
        for (let hour = startHour; hour <= endHour; hour++) {
            let hourStart, hourEnd;
            
            if (hour === startHour) {
                // First hour: from session start to end of hour
                hourStart = start;
                hourEnd = new Date(start.getFullYear(), start.getMonth(), start.getDate(), hour + 1, 0, 0);
            } else if (hour === endHour) {
                // Last hour: from start of hour to session end
                hourStart = new Date(end.getFullYear(), end.getMonth(), end.getDate(), hour, 0, 0);
                hourEnd = end;
            } else {
                // Full hour
                hourStart = new Date(start.getFullYear(), start.getMonth(), start.getDate(), hour, 0, 0);
                hourEnd = new Date(start.getFullYear(), start.getMonth(), start.getDate(), hour + 1, 0, 0);
            }
            
            const minutes = Math.floor((hourEnd - hourStart) / 60000);
            if (minutes > 0) {
                result.push({ hour, minutes });
            }
        }
    }
    
    return result;
}

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
async function startServer() {
    try {
        await initializeDataFile();
        
        app.listen(PORT, () => {
            console.log(`=================================`);
            console.log(`🚀 Zeiterfassung Server läuft!`);
            console.log(`📍 Port: ${PORT}`);
            console.log(`💾 Daten werden gespeichert in: ${DATA_FILE}`);
            console.log(`🌐 API verfügbar unter: http://localhost:${PORT}`);
            console.log(`=================================`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Server wird beendet...');
    
    // If currently working, stop the session
    if (currentSession.isWorking) {
        console.log('⚠️  Aktive Arbeitszeit wird beendet...');
        try {
            const now = new Date();
            const sessionDuration = Math.floor((now - currentSession.sessionStart) / 60000);
            
            const data = await readData();
            const currentSessionIndex = data.sessions.length - 1;
            
            if (currentSessionIndex >= 0) {
                data.sessions[currentSessionIndex].end = now.toISOString();
                data.sessions[currentSessionIndex].minutes = sessionDuration;
                
                // Update daily stats
                const today = getTodayString();
                if (!data.dailyStats[today]) {
                    data.dailyStats[today] = { totalMinutes: 0, hourlyBreakdown: {}, sessions: [] };
                }
                
                data.dailyStats[today].sessions.push({
                    start: currentSession.sessionStart.toISOString(),
                    end: now.toISOString(),
                    minutes: sessionDuration
                });
                
                data.dailyStats[today].totalMinutes += sessionDuration;
                data.totalMinutes = (data.totalMinutes || 0) + sessionDuration;
                
                await writeData(data);
                console.log(`✅ Session beendet: ${sessionDuration} Minuten gespeichert`);
            }
        } catch (error) {
            console.error('❌ Fehler beim Beenden der Session:', error);
        }
    }
    
    console.log('👋 Goodbye!');
    process.exit(0);
});

startServer();