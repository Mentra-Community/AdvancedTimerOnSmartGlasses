import { AppSession } from '@mentra/sdk';
import { MyAppState } from '../../session/appstate';
import { MySessionInfo } from '../../session/sessioninfo';
import { SessionManager } from '../../session/sessionmanager';
import { TimerUi } from './timerui';
import { UIManager } from '../../core/uimanager';
import { AppSettings } from '../../core/settingsmanager';
import { MAX_TIMER_DURATION_SECONDS } from '../../core/constants';
import { formatTime } from '../../utils/timeformatter';
import { parseSpokenDuration } from '../../utils/parseDuration';

const TOAST_DURATION = 2000; // Default duration for most toasts

export class TimerLogic {
    constructor(
        private sessionManager: SessionManager,
        private timerUi: TimerUi,
        private uiManager: UIManager
    ) {
        console.log('[TimerLogic] Initialized');
    }

    public requestConfiguration(session: AppSession, sessionId: string): void {
        const sessionInfo = this.sessionManager.getSessionInfo(sessionId);
        if (!sessionInfo || !sessionInfo.isConnected) {
            console.warn(`[TimerLogic] Session ${sessionId} not available or connected for configuration.`);
            return;
        }
        this.sessionManager.setState(sessionId, MyAppState.CONFIGURING_TIMER);
        this.timerUi.showConfigurationScreen(session, sessionId, sessionInfo);
        console.log(`[TimerLogic] Session ${sessionId}: Requesting timer configuration.`);
    }

    public setDuration(session: AppSession, sessionId: string, commandText: string): boolean {
        const sessionInfo = this.sessionManager.getSessionInfo(sessionId);
        if (!sessionInfo || !sessionInfo.isConnected) return false;

        // Use the new spoken duration parser
        const durationSeconds = parseSpokenDuration(commandText);
        if (durationSeconds !== null && durationSeconds > 0 && durationSeconds <= MAX_TIMER_DURATION_SECONDS) {
            this.sessionManager.updateSessionInfo(sessionId, { timerDuration: durationSeconds, remainingSeconds: durationSeconds });
            this.sessionManager.setState(sessionId, MyAppState.TIMER_READY);
            const updatedSessionInfo = this.sessionManager.getSessionInfo(sessionId)!;
            this.timerUi.displayInterface(session, sessionId, updatedSessionInfo, MyAppState.TIMER_READY);
            this.uiManager.showToast(session, sessionId, `Timer set for ${formatTime(durationSeconds)}. Say 'Start'.`, TOAST_DURATION);
            console.log(`[TimerLogic] Session ${sessionId}: Timer duration set to ${durationSeconds}s.`);
            return true;
        } else if (durationSeconds !== null && durationSeconds > MAX_TIMER_DURATION_SECONDS) {
            const maxMinutes = Math.floor(MAX_TIMER_DURATION_SECONDS / 60);
            this.uiManager.showToast(session, sessionId, `Invalid duration. Max ${maxMinutes} minutes. Try e.g., '5 minutes'.`, TOAST_DURATION);
            console.warn(`[TimerLogic] Session ${sessionId}: Invalid duration input (too long): ${commandText} (parsed as ${durationSeconds}s).`);
            return false;
        } else {
            this.uiManager.showToast(session, sessionId, "Could not understand duration. Try '5 minutes'.", TOAST_DURATION);
            return false;
        }
    }

    public start(session: AppSession, sessionId: string): void {
        let sessionInfo = this.sessionManager.getSessionInfo(sessionId);
        const currentState = this.sessionManager.getState(sessionId);
        if (!sessionInfo || !sessionInfo.isConnected) return;

        if (currentState === MyAppState.TIMER_READY) {
            if (sessionInfo.timerDuration <= 0) {
                this.uiManager.showToast(session, sessionId, "No duration set. Please configure first.", TOAST_DURATION);
                this.requestConfiguration(session, sessionId);
                return;
            }
            this.sessionManager.setState(sessionId, MyAppState.TIMER_RUNNING);
            this._clearTimerInterval(sessionId);
            const tick = () => { /* ... tick logic ... */ 
                let currentTickSessionInfo = this.sessionManager.getSessionInfo(sessionId);
                const currentTickState = this.sessionManager.getState(sessionId);
                if (!currentTickSessionInfo || !currentTickSessionInfo.isConnected || currentTickState !== MyAppState.TIMER_RUNNING) {
                    this._clearTimerInterval(sessionId); return;
                }
                const newRemainingSeconds = currentTickSessionInfo.remainingSeconds - 1;
                this.sessionManager.updateSessionInfo(sessionId, { remainingSeconds: newRemainingSeconds });
                currentTickSessionInfo = this.sessionManager.getSessionInfo(sessionId)!; 
                if (newRemainingSeconds < 0) {
                    this._clearTimerInterval(sessionId);
                    this.sessionManager.setState(sessionId, MyAppState.TIMER_FINISHED);
                    this.timerUi.showFinishedScreen(session, sessionId, currentTickSessionInfo);
                    console.log(`[TimerLogic] Session ${sessionId}: Timer finished.`);
                } else {
                    this.timerUi.displayInterface(session, sessionId, currentTickSessionInfo, MyAppState.TIMER_RUNNING);
                }
            };
            const intervalId = setInterval(tick, 1000);
            this.sessionManager.updateSessionInfo(sessionId, { timerInterval: intervalId });
            sessionInfo = this.sessionManager.getSessionInfo(sessionId)!; 
            this.timerUi.displayInterface(session, sessionId, sessionInfo, MyAppState.TIMER_RUNNING);
            console.log(`[TimerLogic] Session ${sessionId}: Timer started for ${formatTime(sessionInfo.timerDuration)}.`);
        } else {
            this.uiManager.showToast(session, sessionId, "Timer can't be started now.", TOAST_DURATION);
            console.warn(`[TimerLogic] Session ${sessionId}: Attempted to start timer not in READY state (current: ${MyAppState[currentState!]}).`);
        }
    }

    private _clearTimerInterval(sessionId: string): void {
        const sessionInfo = this.sessionManager.getSessionInfo(sessionId);
        if (sessionInfo?.timerInterval) {
            clearInterval(sessionInfo.timerInterval);
            this.sessionManager.updateSessionInfo(sessionId, { timerInterval: undefined });
        }
    }

    /**
     * Pausing a running timer.
     */
    public pause(session: AppSession, sessionId: string): void {
        const sessionInfo = this.sessionManager.getSessionInfo(sessionId);
        const currentState = this.sessionManager.getState(sessionId);
        if (!sessionInfo || !sessionInfo.isConnected) return;
        if (currentState === MyAppState.TIMER_RUNNING) {
            this._clearTimerInterval(sessionId);
            this.sessionManager.setState(sessionId, MyAppState.TIMER_PAUSED);
            const updatedSessionInfo = this.sessionManager.getSessionInfo(sessionId)!;
            this.timerUi.displayInterface(session, sessionId, updatedSessionInfo, MyAppState.TIMER_PAUSED);
            console.log(`[TimerLogic] Session ${sessionId}: Timer paused with ${formatTime(updatedSessionInfo.remainingSeconds)} remaining.`);
        } else {
            this.uiManager.showToast(session, sessionId, "Timer is not running, cannot pause.", TOAST_DURATION);
            console.warn(`[TimerLogic] Session ${sessionId}: Attempted to pause timer not in RUNNING state (current: ${MyAppState[currentState!]}).`);
        }
    }

    public resume(session: AppSession, sessionId: string): void {
        let sessionInfo = this.sessionManager.getSessionInfo(sessionId);
        const currentState = this.sessionManager.getState(sessionId);
        if (!sessionInfo || !sessionInfo.isConnected) return;
        if (currentState === MyAppState.TIMER_PAUSED) {
            this.sessionManager.setState(sessionId, MyAppState.TIMER_RUNNING);
            this._clearTimerInterval(sessionId); 
            const tick = () => { /* ... tick logic ... */ 
                let currentTickSessionInfo = this.sessionManager.getSessionInfo(sessionId);
                const currentTickState = this.sessionManager.getState(sessionId);
                if (!currentTickSessionInfo || !currentTickSessionInfo.isConnected || currentTickState !== MyAppState.TIMER_RUNNING) {
                    this._clearTimerInterval(sessionId); return;
                }
                const newRemainingSeconds = currentTickSessionInfo.remainingSeconds - 1;
                this.sessionManager.updateSessionInfo(sessionId, { remainingSeconds: newRemainingSeconds });
                currentTickSessionInfo = this.sessionManager.getSessionInfo(sessionId)!;
                if (newRemainingSeconds < 0) {
                    this._clearTimerInterval(sessionId);
                    this.sessionManager.setState(sessionId, MyAppState.TIMER_FINISHED);
                    this.timerUi.showFinishedScreen(session, sessionId, currentTickSessionInfo);
                } else {
                    this.timerUi.displayInterface(session, sessionId, currentTickSessionInfo, MyAppState.TIMER_RUNNING);
                }
            };
            const intervalId = setInterval(tick, 1000);
            this.sessionManager.updateSessionInfo(sessionId, { timerInterval: intervalId });
            sessionInfo = this.sessionManager.getSessionInfo(sessionId)!;
            this.timerUi.displayInterface(session, sessionId, sessionInfo, MyAppState.TIMER_RUNNING);
            console.log(`[TimerLogic] Session ${sessionId}: Timer resumed.`);
        } else {
            this.uiManager.showToast(session, sessionId, "Timer is not paused, cannot resume.", TOAST_DURATION);
            console.warn(`[TimerLogic] Session ${sessionId}: Attempted to resume timer not in PAUSED state (current: ${MyAppState[currentState!]}).`);
        }
    }

    public reset(session: AppSession, sessionId: string): void {
        const sessionInfo = this.sessionManager.getSessionInfo(sessionId);
        if (!sessionInfo || !sessionInfo.isConnected) { /* ... */ return; }
        this._clearTimerInterval(sessionId);
        const resetDuration = sessionInfo.timerDuration > 0 ? sessionInfo.timerDuration : 0;
        this.sessionManager.updateSessionInfo(sessionId, { remainingSeconds: resetDuration });
        this.sessionManager.setState(sessionId, MyAppState.TIMER_READY);
        const updatedSessionInfo = this.sessionManager.getSessionInfo(sessionId)!;
        this.timerUi.displayInterface(session, sessionId, updatedSessionInfo, MyAppState.TIMER_READY);
        if (resetDuration > 0) {
            this.uiManager.showToast(session, sessionId, `Timer reset to ${formatTime(resetDuration)}. Say 'Start' or 'Configure'.`, TOAST_DURATION);
            console.log(`[TimerLogic] Session ${sessionId}: Timer reset. Ready for ${formatTime(resetDuration)}.`);
        } else {
            this.uiManager.showToast(session, sessionId, "Timer reset. Please set a duration.", TOAST_DURATION);
            console.log(`[TimerLogic] Session ${sessionId}: Timer reset. No duration set, requesting configuration.`);
            this.requestConfiguration(session, sessionId);
        }
    }

        public async stopTimer(session: AppSession, sessionId: string, toastMessage?: string): Promise<void> {
        console.log(`[TimerLogic] Session ${sessionId}: Stopping Timer.`);
        const sessionInfo = this.sessionManager.getSessionInfo(sessionId);
        if (!sessionInfo || !sessionInfo.isConnected) return;
        this._clearTimerInterval(sessionId);
        this.sessionManager.setState(sessionId, MyAppState.SELECTING_MODE);
        const finalToastMessage = toastMessage || "Timer stopped.";
        this.uiManager.showToast(session, sessionId, finalToastMessage); 
        await new Promise(resolve => setTimeout(resolve, TOAST_DURATION + 100));
        if (this.sessionManager.isSessionActive(sessionId) && 
            this.sessionManager.getState(sessionId) === MyAppState.SELECTING_MODE) {
            console.log(`[TimerLogic] Displaying mode selection after stop toast for session ${sessionId}.`);
            this.uiManager.showModeSelection(session, sessionId); 
        }
    }

    public handleFinishedConfirmation(session: AppSession, sessionId: string): void {
        const sessionInfo = this.sessionManager.getSessionInfo(sessionId);
        if (!sessionInfo || !sessionInfo.isConnected) return;
        
        const currentState = this.sessionManager.getState(sessionId);
        if (currentState === MyAppState.TIMER_FINISHED) {
            console.log(`[TimerLogic] Session ${sessionId}: Timer finished acknowledged. Returning to mode selection.`);
            this.sessionManager.setState(sessionId, MyAppState.SELECTING_MODE);
            this.uiManager.showModeSelection(session, sessionId);
        } else {
            console.warn(`[TimerLogic] Session ${sessionId}: handleFinishedConfirmation called in unexpected state: ${MyAppState[currentState!]}`);
        }
    }

    public handleSettingChange(session: AppSession, sessionId: string, changedSettingKey: keyof AppSettings, newValue: any ): void {
        const sessionInfo = this.sessionManager.getSessionInfo(sessionId);
        const currentState = this.sessionManager.getState(sessionId);
        if (!sessionInfo || !sessionInfo.currentSettings) { /* ... */ return; }
        console.log(`[TimerLogic] Received setting change for '${String(changedSettingKey)}', new value: '${newValue}' in session ${sessionId}. Current state: ${MyAppState[currentState!]}`);

        if (changedSettingKey === 'default_timer_duration_seconds') {
            const newDurationSec = newValue as number;
            if (currentState === MyAppState.TIMER_READY) {
                this.sessionManager.updateSessionInfo(sessionId, { remainingSeconds: newDurationSec });
                const updatedSessionInfo = this.sessionManager.getSessionInfo(sessionId)!;
                this.timerUi.displayInterface(session, sessionId, updatedSessionInfo, MyAppState.TIMER_READY);
            } else if (currentState === MyAppState.CONFIGURING_TIMER) {
                const updatedSessionInfo = this.sessionManager.getSessionInfo(sessionId)!;
                this.timerUi.showConfigurationScreen(session, sessionId, updatedSessionInfo);
            }
        }
    }
    
    public startTimerWithDefaultDuration(session: AppSession, sessionId: string): void {
        const sessionInfo = this.sessionManager.getSessionInfo(sessionId);
        if (!sessionInfo || !sessionInfo.currentSettings) {
            this.uiManager.showToast(session, sessionId, "Error: Timer settings not available to start with default.", TOAST_DURATION);
            console.error("[TimerLogic] Cannot startWithDefaultDuration, sessionInfo or currentSettings missing.");
            this.sessionManager.setState(sessionId, MyAppState.SELECTING_MODE);
            this.uiManager.showModeSelection(session, sessionId);
            return;
        }
        const defaultDurationSeconds = sessionInfo.currentSettings.default_timer_duration_seconds;
        if (defaultDurationSeconds <= 0) {
            this.uiManager.showToast(session, sessionId, "Default timer duration is not set or invalid. Please check settings.", TOAST_DURATION);
            this.requestConfiguration(session, sessionId);
            return;
        }
        console.log(`[TimerLogic] Starting timer with default duration from settings: ${formatTime(defaultDurationSeconds)} for session ${sessionId}.`);
        this.sessionManager.updateSessionInfo(sessionId, { timerDuration: defaultDurationSeconds, remainingSeconds: defaultDurationSeconds });
        this.sessionManager.setState(sessionId, MyAppState.TIMER_READY);
        this.start(session, sessionId); 
    }

    public clearAllIntervals(sessionId: string): void { this._clearTimerInterval(sessionId); }
}