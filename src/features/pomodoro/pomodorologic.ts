// src/features/pomodoro/pomodorologic.ts
import { AppSession } from '@mentra/sdk';
import { MyAppState } from '../../session/appstate';
import { MySessionInfo } from '../../session/sessioninfo';
import { SessionManager } from '../../session/sessionmanager';
import { PomodoroUi } from './pomodoroui';
import { UIManager } from '../../core/uimanager';
import { AppSettings } from '../../core/settingsmanager';
import { formatTime } from '../../utils/timeformatter';

const TOAST_DURATION = 2000;
export type PomodoroPhase = 'WORK' | 'SHORT_BREAK' | 'LONG_BREAK' | 'NONE';

export class PomodoroLogic {
    constructor(
        private sessionManager: SessionManager,
        private pomodoroUi: PomodoroUi,
        private uiManager: UIManager
    ) {
        console.log('[PomodoroLogic] Initialized');
    }

    private _clearPomodoroInterval(sessionId: string): void {
        const sessionInfo = this.sessionManager.getSessionInfo(sessionId);
        if (sessionInfo?.pomodoroIntervalId) {
            clearInterval(sessionInfo.pomodoroIntervalId);
            this.sessionManager.updateSessionInfo(sessionId, { pomodoroIntervalId: undefined });
        }
    }

    private _startIntervalTimer(session: AppSession, sessionId: string): void {
        this._clearPomodoroInterval(sessionId); 
        const sessionInfo = this.sessionManager.getSessionInfo(sessionId);
        if (!sessionInfo || sessionInfo.pomodoroRemainingSeconds === undefined || sessionInfo.pomodoroRemainingSeconds <= 0) {
            return;
        }
        const intervalId = setInterval(() => { this._tick(session, sessionId); }, 1000);
        this.sessionManager.updateSessionInfo(sessionId, { pomodoroIntervalId: intervalId });
    }

    private _tick(session: AppSession, sessionId: string): void {
        const sessionInfo = this.sessionManager.getSessionInfo(sessionId);
        const currentState = this.sessionManager.getState(sessionId);
        if (!sessionInfo || !sessionInfo.isConnected || sessionInfo.pomodoroRemainingSeconds === undefined ||
            (currentState !== MyAppState.POMODORO_WORK_RUNNING && currentState !== MyAppState.POMODORO_BREAK_RUNNING)) {
            this._clearPomodoroInterval(sessionId); return;
        }
        const newRemainingSeconds = sessionInfo.pomodoroRemainingSeconds - 1;
        this.sessionManager.updateSessionInfo(sessionId, { pomodoroRemainingSeconds: newRemainingSeconds });
        const updatedSessionInfo = this.sessionManager.getSessionInfo(sessionId)!;
        if (newRemainingSeconds < 0) { 
            this._clearPomodoroInterval(sessionId);
            this._handleIntervalCompletion(session, sessionId, false);
        } else {
            this.pomodoroUi.displayInterface(session, sessionId, updatedSessionInfo, currentState);
        }
    }

    private _handleIntervalCompletion(session: AppSession, sessionId: string, skipped: boolean): void {
        const sessionInfo = this.sessionManager.getSessionInfo(sessionId);
        if (!sessionInfo || !sessionInfo.currentSettings) { 
            console.error("[PomodoroLogic] _handleIntervalCompletion: Session info or currentSettings missing.");
            return;
        }

        const settings = sessionInfo.currentSettings; 
        let pomodorosCompleted = sessionInfo.pomodorosCompletedInCycle ?? 0;
        const currentPhase = sessionInfo.pomodoroCurrentPhase;
        let nextPhase: PomodoroPhase = 'NONE';
        let toastMessage = "";

        if (currentPhase === 'WORK') {
            pomodorosCompleted++;
            this.sessionManager.updateSessionInfo(sessionId, { pomodorosCompletedInCycle: pomodorosCompleted });
            toastMessage = `Work (${pomodorosCompleted}/${settings.pomodoro_intervals_before_long_break}) finished.`;

            if (pomodorosCompleted >= settings.pomodoro_intervals_before_long_break) {
                nextPhase = 'LONG_BREAK';
                toastMessage += skipped ? " Skipping to Long Break." : " Time for a Long Break!";
            } else {
                nextPhase = 'SHORT_BREAK';
                toastMessage += skipped ? " Skipping to Short Break." : " Time for a Short Break!";
            }
        } else if (currentPhase === 'SHORT_BREAK' || currentPhase === 'LONG_BREAK') {
            toastMessage = `${currentPhase === 'SHORT_BREAK' ? 'Short' : 'Long'} break finished.`;
            if (currentPhase === 'LONG_BREAK') {
                this.sessionManager.setState(sessionId, MyAppState.POMODORO_CYCLE_ENDED);
                const updatedSessionInfo = this.sessionManager.getSessionInfo(sessionId)!;
                this.pomodoroUi.displayInterface(session, sessionId, updatedSessionInfo, MyAppState.POMODORO_CYCLE_ENDED);
                this.uiManager.showToast(session, sessionId, "Pomodoro cycle complete! Well done.");
                return; 
            }
            nextPhase = 'WORK';
            toastMessage += skipped ? " Skipping to Work." : " Time for Work!";
        }

        this.uiManager.showToast(session, sessionId, toastMessage);

        let nextPhaseForSessionInfo: 'WORK' | 'SHORT_BREAK' | 'LONG_BREAK' | undefined;
        if (nextPhase === 'WORK' || nextPhase === 'SHORT_BREAK' || nextPhase === 'LONG_BREAK') {
            nextPhaseForSessionInfo = nextPhase;
        } else {
             console.warn(`[PomodoroLogic] _handleIntervalCompletion: Invalid nextPhase determined: ${nextPhase}, defaulting to undefined for session info.`);
            nextPhaseForSessionInfo = undefined;
        }
        this.sessionManager.updateSessionInfo(sessionId, { pomodoroNextPhase: nextPhaseForSessionInfo });

        const autoStartThisPhase = (nextPhase === 'WORK' && settings.pomodoro_auto_start_work) ||
                                   ((nextPhase === 'SHORT_BREAK' || nextPhase === 'LONG_BREAK') && settings.pomodoro_auto_start_breaks);

        if (autoStartThisPhase || skipped) {
            this._transitionToPhase(session, sessionId, nextPhase);
        } else {
            this.sessionManager.setState(sessionId, MyAppState.POMODORO_PENDING_CONFIRMATION);
            const updatedSessionInfo = this.sessionManager.getSessionInfo(sessionId)!;
            this.pomodoroUi.displayInterface(session, sessionId, updatedSessionInfo, MyAppState.POMODORO_PENDING_CONFIRMATION);
        }
    }

    private _transitionToPhase(session: AppSession, sessionId: string, newPhase: PomodoroPhase): void {
        const sessionInfo = this.sessionManager.getSessionInfo(sessionId);
        if (!sessionInfo || !sessionInfo.currentSettings) {
            this.uiManager.showToast(session, sessionId, "Error: Pomodoro settings missing for transition.", TOAST_DURATION);
            this.stopPomodoroCycle(session, sessionId); return;
        }
        const settings = sessionInfo.currentSettings;
        let targetDuration = 0;
        let newState: MyAppState = MyAppState.POMODORO_IDLE;
        this._clearPomodoroInterval(sessionId);
        if (newPhase === 'WORK') {
            targetDuration = settings.pomodoro_work_duration_seconds;
            newState = MyAppState.POMODORO_WORK_RUNNING;
            if(sessionInfo.pomodoroCurrentPhase === 'LONG_BREAK' || sessionInfo.pomodoroCurrentPhase === 'NONE') {
                 this.sessionManager.updateSessionInfo(sessionId, { pomodorosCompletedInCycle: 0 });
            }
        } else if (newPhase === 'SHORT_BREAK') {
            targetDuration = settings.pomodoro_short_break_duration_seconds;
            newState = MyAppState.POMODORO_BREAK_RUNNING;
        } else if (newPhase === 'LONG_BREAK') {
            targetDuration = settings.pomodoro_long_break_duration_seconds;
            newState = MyAppState.POMODORO_BREAK_RUNNING;
        } else {
            this.stopPomodoroCycle(session, sessionId); return;
        }
        this.sessionManager.updateSessionInfo(sessionId, {
            pomodoroCurrentPhase: newPhase, pomodoroRemainingSeconds: targetDuration,
            pomodoroTargetDurationSeconds: targetDuration, pomodoroIsPaused: false
        });
        this.sessionManager.setState(sessionId, newState);
        this._startIntervalTimer(session, sessionId);
        const updatedSessionInfo = this.sessionManager.getSessionInfo(sessionId)!;
        this.pomodoroUi.displayInterface(session, sessionId, updatedSessionInfo, newState);
    }

    public initializeAndShowIdleScreen(session: AppSession, sessionId: string): void {
        this._clearPomodoroInterval(sessionId);
        const sessionInfo = this.sessionManager.getSessionInfo(sessionId);
        if (!sessionInfo || !sessionInfo.currentSettings) {
            this.uiManager.showToast(session, sessionId, "Error: Pomodoro settings not available.", TOAST_DURATION);
            this.sessionManager.setState(sessionId, MyAppState.SELECTING_MODE);
            this.uiManager.showModeSelection(session, sessionId); return;
        }
        const currentSettings = sessionInfo.currentSettings;
        this.sessionManager.updateSessionInfo(sessionId, {
            pomodoroCurrentPhase: 'NONE', pomodorosCompletedInCycle: 0,
            pomodoroRemainingSeconds: currentSettings.pomodoro_work_duration_seconds,
            pomodoroTargetDurationSeconds: currentSettings.pomodoro_work_duration_seconds,
            pomodoroIsPaused: false, pomodoroNextPhase: 'WORK'
        });
        this.sessionManager.setState(sessionId, MyAppState.POMODORO_IDLE);
        const updatedSessionInfo = this.sessionManager.getSessionInfo(sessionId)!;
        this.pomodoroUi.displayInterface(session, sessionId, updatedSessionInfo, MyAppState.POMODORO_IDLE);
    }

    public startCycle(session: AppSession, sessionId: string): void {
        const sessionInfo = this.sessionManager.getSessionInfo(sessionId);
        if (!sessionInfo || !sessionInfo.currentSettings) {
            this.uiManager.showToast(session, sessionId, "Error starting Pomodoro: Settings not found.", TOAST_DURATION);
            this.stopPomodoroCycle(session, sessionId); return;
        }
        const settings = sessionInfo.currentSettings;
        if (!(settings.pomodoro_work_duration_seconds > 0) || !(settings.pomodoro_short_break_duration_seconds > 0) ||
            !(settings.pomodoro_long_break_duration_seconds > 0) || !(settings.pomodoro_intervals_before_long_break > 0) ) {
            this.uiManager.showToast(session, sessionId, "Error: Pomodoro durations not set correctly.", TOAST_DURATION);
            this.stopPomodoroCycle(session, sessionId); return;
        }
        this.sessionManager.updateSessionInfo(sessionId, { pomodorosCompletedInCycle: 0, pomodoroIsPaused: false });
        this._transitionToPhase(session, sessionId, 'WORK');
    }

    public pauseInterval(session: AppSession, sessionId: string): void {
        const sessionInfo = this.sessionManager.getSessionInfo(sessionId);
        const currentState = this.sessionManager.getState(sessionId);
        if (!sessionInfo || !sessionInfo.isConnected || (currentState !== MyAppState.POMODORO_WORK_RUNNING && currentState !== MyAppState.POMODORO_BREAK_RUNNING)) {
            this.uiManager.showToast(session, sessionId, "Nothing to pause.", TOAST_DURATION); return;
        }
        this._clearPomodoroInterval(sessionId);
        this.sessionManager.updateSessionInfo(sessionId, { pomodoroIsPaused: true });
        this.sessionManager.setState(sessionId, MyAppState.POMODORO_PAUSED);
        const updatedSessionInfo = this.sessionManager.getSessionInfo(sessionId)!;
        this.pomodoroUi.displayInterface(session, sessionId, updatedSessionInfo, MyAppState.POMODORO_PAUSED);
    }

    public resumeInterval(session: AppSession, sessionId: string): void {
        const sessionInfo = this.sessionManager.getSessionInfo(sessionId);
        const currentState = this.sessionManager.getState(sessionId);
        if (!sessionInfo || !sessionInfo.isConnected || currentState !== MyAppState.POMODORO_PAUSED) {
            this.uiManager.showToast(session, sessionId, "Nothing to resume.", TOAST_DURATION); return;
        }
        const phaseToResume = sessionInfo.pomodoroCurrentPhase;
        let nextState: MyAppState = MyAppState.POMODORO_IDLE; 
        if (phaseToResume === 'WORK') nextState = MyAppState.POMODORO_WORK_RUNNING;
        else if (phaseToResume === 'SHORT_BREAK' || phaseToResume === 'LONG_BREAK') nextState = MyAppState.POMODORO_BREAK_RUNNING;
        else { this.stopPomodoroCycle(session,sessionId); return; }
        this.sessionManager.updateSessionInfo(sessionId, { pomodoroIsPaused: false });
        this.sessionManager.setState(sessionId, nextState);
        this._startIntervalTimer(session, sessionId);
        const updatedSessionInfo = this.sessionManager.getSessionInfo(sessionId)!;
        this.pomodoroUi.displayInterface(session, sessionId, updatedSessionInfo, nextState);
    }

    public proceedFromConfirmation(session: AppSession, sessionId: string): void {
        const sessionInfo = this.sessionManager.getSessionInfo(sessionId);
        if (!sessionInfo || this.sessionManager.getState(sessionId) !== MyAppState.POMODORO_PENDING_CONFIRMATION || !sessionInfo.pomodoroNextPhase) {
             return;
        }
        this._transitionToPhase(session, sessionId, sessionInfo.pomodoroNextPhase);
    }

    public skipToNextAppropriatePhase(session: AppSession, sessionId: string): void {
        const sessionInfo = this.sessionManager.getSessionInfo(sessionId);
        const currentState = this.sessionManager.getState(sessionId);
        if (!sessionInfo || !sessionInfo.isConnected || (currentState !== MyAppState.POMODORO_WORK_RUNNING && currentState !== MyAppState.POMODORO_BREAK_RUNNING && currentState !== MyAppState.POMODORO_PAUSED) ) {
            this.uiManager.showToast(session, sessionId, "Nothing to skip right now.", TOAST_DURATION); return;
        }
        this._clearPomodoroInterval(sessionId);
        this._handleIntervalCompletion(session, sessionId, true);
    }

    public resetCurrentCycle(session: AppSession, sessionId: string): void {
        this._clearPomodoroInterval(sessionId);
        this.sessionManager.updateSessionInfo(sessionId, { pomodorosCompletedInCycle: 0, pomodoroIsPaused: false }); 
        this._transitionToPhase(session, sessionId, 'WORK'); 
        this.uiManager.showToast(session, sessionId, "Pomodoro cycle reset.", TOAST_DURATION);
    }

    public async stopPomodoroCycle(session: AppSession, sessionId: string, toastMessage?: string): Promise<void> {
        console.log(`[PomodoroLogic] Session ${sessionId}: Stopping Pomodoro cycle. Current state: ${MyAppState[this.sessionManager.getState(sessionId)!]}`);
        this._clearPomodoroInterval(sessionId);
        this.sessionManager.updateSessionInfo(sessionId, {
            pomodoroCurrentPhase: 'NONE',
            pomodoroRemainingSeconds: 0,
            pomodorosCompletedInCycle: 0,
            pomodoroTargetDurationSeconds: 0,
            pomodoroIsPaused: false, 
            pomodoroNextPhase: undefined
        });
        
        this.sessionManager.setState(sessionId, MyAppState.SELECTING_MODE);
        console.log(`[PomodoroLogic] State set to SELECTING_MODE for session ${sessionId}.`);

        const finalToastMessage = toastMessage || "Pomodoro stopped.";
        const toastDuration = 2000; 
        this.uiManager.showToast(session, sessionId, finalToastMessage, toastDuration);
        console.log(`[PomodoroLogic] Toast "${finalToastMessage}" shown. Starting delay of ${toastDuration + 100}ms.`);

        await new Promise(resolve => setTimeout(resolve, toastDuration + 100)); 

        console.log(`[PomodoroLogic] Delay finished for session ${sessionId}.`);
        console.log(`[PomodoroLogic] Checking conditions: IsActive: ${this.sessionManager.isSessionActive(sessionId)}, CurrentState: ${MyAppState[this.sessionManager.getState(sessionId)!]}`);

        if (this.sessionManager.isSessionActive(sessionId) && 
            this.sessionManager.getState(sessionId) === MyAppState.SELECTING_MODE) {
            console.log(`[PomodoroLogic] Displaying mode selection after stop toast for session ${sessionId}.`);
            this.uiManager.showModeSelection(session, sessionId); 
        } else {
            console.warn(`[PomodoroLogic] Not displaying mode selection. Conditions not met. Active: ${this.sessionManager.isSessionActive(sessionId)}, State: ${MyAppState[this.sessionManager.getState(sessionId)!]}`);
        }
    }

    public clearAllIntervals(sessionId: string): void {
        this._clearPomodoroInterval(sessionId);
    }

    public handleSettingChange(session: AppSession, sessionId: string, changedSettingKey: keyof AppSettings, newValue: any ): void {
        const sessionInfo = this.sessionManager.getSessionInfo(sessionId);
        const currentState = this.sessionManager.getState(sessionId);
        if (!sessionInfo || !sessionInfo.currentSettings) { return; }
        console.log(`[PomodoroLogic] Received setting change for '${String(changedSettingKey)}', new value: '${newValue}' in session ${sessionId}. Current state: ${MyAppState[currentState!]}`);
        switch (changedSettingKey) {
            case 'pomodoro_work_duration_seconds':
            case 'pomodoro_short_break_duration_seconds':
            case 'pomodoro_long_break_duration_seconds':
            case 'pomodoro_intervals_before_long_break':
                if (currentState === MyAppState.POMODORO_IDLE) {
                    const updatedSessionInfo = this.sessionManager.getSessionInfo(sessionId);
                    if (updatedSessionInfo) {
                        this.pomodoroUi.displayInterface(session, sessionId, updatedSessionInfo, MyAppState.POMODORO_IDLE);
                    }
                }
                break;
            case 'pomodoro_auto_start_breaks':
            case 'pomodoro_auto_start_work':
                console.log(`[PomodoroLogic] Auto-start setting '${String(changedSettingKey)}' updated. Value: ${newValue}.`);
                break;
        }
    }
}       