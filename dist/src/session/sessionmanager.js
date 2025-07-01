import { MyAppState } from './appstate';
import { initialMySessionInfo } from './sessioninfo';
export class SessionManager {
    activeSessions = new Map();
    settingsManager;
    constructor(settingsManager) {
        this.settingsManager = settingsManager;
        console.log('[SessionManager] Initialized with SettingsManager');
    }
    /**
     * Initializes a new session with a starting state and data.
     * Retrieves the initial settings internally via the SettingsManager.
     * @param sessionId The unique identifier of the session.
     * @param initialState The initial state for the session.
     * @param userId Optional identifier of the user.
     * @returns The created MySessionInfo.
     */
    initializeSession(sessionId, initialState, userId) {
        if (this.activeSessions.has(sessionId)) {
            console.warn(`[SessionManager] Session ${sessionId} is al geïnitialiseerd. Overschrijven/herinitialiseren...`);
            this.clearTimersForSession(sessionId);
        }
        const currentGlobalSettings = this.settingsManager.getAllSettings();
        const sessionSpecificSettings = { ...currentGlobalSettings };
        const newSessionInfo = {
            ...initialMySessionInfo,
            sessionId: sessionId,
            isConnected: true,
            currentControlMethod: sessionSpecificSettings.control_input_method,
            timerDuration: sessionSpecificSettings.default_timer_duration_seconds,
            remainingSeconds: sessionSpecificSettings.default_timer_duration_seconds,
            currentSettings: sessionSpecificSettings,
        };
        this.activeSessions.set(sessionId, {
            state: initialState,
            info: newSessionInfo,
        });
        console.log(`[SessionManager] Session ${sessionId} initialized for user ${userId || 'unknown'}. Initial state: ${MyAppState[initialState]}.`);
        return newSessionInfo;
    }
    getSessionInfo(sessionId) {
        return this.activeSessions.get(sessionId)?.info;
    }
    getState(sessionId) {
        return this.activeSessions.get(sessionId)?.state;
    }
    setState(sessionId, state) {
        const sessionEntry = this.activeSessions.get(sessionId);
        if (sessionEntry) {
            const previousState = sessionEntry.state;
            sessionEntry.state = state;
            const stateName = MyAppState[state] !== undefined ? MyAppState[state] : 'UNKNOWN_STATE_VALUE';
            const prevStateName = MyAppState[previousState] !== undefined ? MyAppState[previousState] : 'UNKNOWN_STATE_VALUE';
            console.log(`[SessionManager] Session ${sessionId} state changing: ${prevStateName} -> ${stateName}`);
        }
        else {
            console.warn(`[SessionManager] Poging om state in te stellen voor onbekende sessie ${sessionId}`);
        }
    }
    updateSessionInfo(sessionId, updates) {
        const sessionEntry = this.activeSessions.get(sessionId);
        if (sessionEntry) {
            sessionEntry.info = { ...sessionEntry.info, ...updates };
        }
        else {
            console.warn(`[SessionManager] Poging om info bij te werken voor onbekende sessie ${sessionId}`);
        }
    }
    clearTimersForSession(sessionId) {
        const sessionInfo = this.getSessionInfo(sessionId);
        if (sessionInfo) {
            if (sessionInfo.timerInterval) {
                clearInterval(sessionInfo.timerInterval);
                this.updateSessionInfo(sessionId, { timerInterval: undefined });
            }
            if (sessionInfo.stopwatchInterval) {
                clearInterval(sessionInfo.stopwatchInterval);
                this.updateSessionInfo(sessionId, { stopwatchInterval: undefined });
            }
        }
    }
    removeSession(sessionId) {
        this.clearTimersForSession(sessionId);
        const deleted = this.activeSessions.delete(sessionId);
        if (deleted) {
            console.log(`[SessionManager] Session ${sessionId} removed.`);
        }
    }
    isSessionActive(sessionId) {
        return this.activeSessions.has(sessionId);
    }
    getAllSessionIds() {
        return Array.from(this.activeSessions.keys());
    }
}
