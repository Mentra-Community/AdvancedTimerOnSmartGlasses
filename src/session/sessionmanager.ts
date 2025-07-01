import { MyAppState } from './appstate';
import { MySessionInfo, initialMySessionInfo } from './sessioninfo'; 
import { AppSettings, SettingsManager } from '../core/settingsmanager';

interface SessionEntry {
  state: MyAppState;
  info: MySessionInfo;
}

export class SessionManager {
  private activeSessions: Map<string, SessionEntry> = new Map();
  public settingsManager: SettingsManager;

  constructor(settingsManager: SettingsManager) {
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
  public initializeSession(sessionId: string, initialState: MyAppState, userId?: string): MySessionInfo { 
    if (this.activeSessions.has(sessionId)) {
      console.warn(`[SessionManager] Session ${sessionId} is al geïnitialiseerd. Overschrijven/herinitialiseren...`);
      this.clearTimersForSession(sessionId);
    }

    const currentGlobalSettings = this.settingsManager.getAllSettings(); 
    const sessionSpecificSettings = { ...currentGlobalSettings }; 

    const newSessionInfo: MySessionInfo = {
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

  public getSessionInfo(sessionId: string): MySessionInfo | undefined {
    return this.activeSessions.get(sessionId)?.info;
  }

  public getState(sessionId: string): MyAppState | undefined {
    return this.activeSessions.get(sessionId)?.state;
  }

  public setState(sessionId: string, state: MyAppState): void {
    const sessionEntry = this.activeSessions.get(sessionId);
    if (sessionEntry) {
      const previousState = sessionEntry.state;
      sessionEntry.state = state;
      const stateName = MyAppState[state] !== undefined ? MyAppState[state] : 'UNKNOWN_STATE_VALUE';
      const prevStateName = MyAppState[previousState] !== undefined ? MyAppState[previousState] : 'UNKNOWN_STATE_VALUE';
      console.log(`[SessionManager] Session ${sessionId} state changing: ${prevStateName} -> ${stateName}`);
    } else {
      console.warn(`[SessionManager] Poging om state in te stellen voor onbekende sessie ${sessionId}`);
    }
  }

  public updateSessionInfo(sessionId: string, updates: Partial<MySessionInfo>): void {
    const sessionEntry = this.activeSessions.get(sessionId);
    if (sessionEntry) {
      sessionEntry.info = { ...sessionEntry.info, ...updates };
    } else {
      console.warn(`[SessionManager] Poging om info bij te werken voor onbekende sessie ${sessionId}`);
    }
  }

  public clearTimersForSession(sessionId: string): void {
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

  public removeSession(sessionId: string): void {
    this.clearTimersForSession(sessionId); 
    const deleted = this.activeSessions.delete(sessionId);
    if (deleted) {
      console.log(`[SessionManager] Session ${sessionId} removed.`);
    }
  }

  public isSessionActive(sessionId: string): boolean {
    return this.activeSessions.has(sessionId);
  }

  public getAllSessionIds(): string[] {
    return Array.from(this.activeSessions.keys());
  }
}