import { MyAppState } from '../../session/appstate';
import { STOPWATCH_INTERVAL_MS } from '../../core/constants';
import { formatTime } from '../../utils/timeformatter';
const TOAST_DURATION = 2000;
export class StopwatchLogic {
    sessionManager;
    stopwatchUi;
    uiManager;
    constructor(sessionManager, stopwatchUi, uiManager) {
        this.sessionManager = sessionManager;
        this.stopwatchUi = stopwatchUi;
        this.uiManager = uiManager;
        console.log('[StopwatchLogic] Initialized');
    }
    _clearStopwatchInterval(sessionId) {
        const sessionInfo = this.sessionManager.getSessionInfo(sessionId);
        if (sessionInfo?.stopwatchInterval) {
            clearInterval(sessionInfo.stopwatchInterval);
            this.sessionManager.updateSessionInfo(sessionId, { stopwatchInterval: undefined });
        }
    }
    _handleAutoLap(session, sessionId) {
        const sessionInfo = this.sessionManager.getSessionInfo(sessionId);
        if (!sessionInfo || !sessionInfo.currentSettings || !sessionInfo.isConnected || this.sessionManager.getState(sessionId) !== MyAppState.STOPWATCH_RUNNING) {
            return;
        }
        const settings = sessionInfo.currentSettings;
        if (!settings.stopwatch_auto_lap_enabled || settings.stopwatch_auto_lap_interval_seconds_processed <= 0) {
            return;
        }
        const intervalSeconds = settings.stopwatch_auto_lap_interval_seconds_processed;
        const maxAutoLapsSetting = settings.stopwatch_max_auto_lap_intervals;
        const autoLapsDoneThisRun = sessionInfo.stopwatchAutoLapsDoneThisRun ?? 0;
        const expectedTimeForNextLap = (autoLapsDoneThisRun + 1) * intervalSeconds;
        if (sessionInfo.elapsedSeconds >= expectedTimeForNextLap) {
            if (maxAutoLapsSetting >= 99 || autoLapsDoneThisRun < maxAutoLapsSetting) {
                console.log(`[StopwatchLogic] Auto-lap ${autoLapsDoneThisRun + 1} triggered at ${formatTime(sessionInfo.elapsedSeconds)}.`);
                this.lap(session, sessionId, true);
                const infoAfterLap = this.sessionManager.getSessionInfo(sessionId);
                const currentAutoLapsNow = autoLapsDoneThisRun + 1;
                this.sessionManager.updateSessionInfo(sessionId, {
                    stopwatchAutoLapsDoneThisRun: currentAutoLapsNow
                });
                if (maxAutoLapsSetting < 99 && currentAutoLapsNow >= maxAutoLapsSetting) {
                    console.log(`[StopwatchLogic] Max auto-laps (${maxAutoLapsSetting}) reached. Stopping stopwatch timer.`);
                    this._clearStopwatchInterval(sessionId);
                    this.sessionManager.setState(sessionId, MyAppState.STOPWATCH_AUTOLAP_COMPLETED);
                    this.stopwatchUi.displayInterface(session, sessionId, this.sessionManager.getSessionInfo(sessionId), MyAppState.STOPWATCH_AUTOLAP_COMPLETED);
                }
            }
            else {
                console.log(`[StopwatchLogic] Max auto-laps (${maxAutoLapsSetting}) previously reached. No further auto-laps.`);
            }
        }
    }
    _tick(session, sessionId) {
        let currentTickSessionInfo = this.sessionManager.getSessionInfo(sessionId);
        const currentState = this.sessionManager.getState(sessionId);
        if (!currentTickSessionInfo || !currentTickSessionInfo.isConnected ||
            (currentState !== MyAppState.STOPWATCH_RUNNING)) {
            this._clearStopwatchInterval(sessionId);
            return;
        }
        const updatedElapsed = (currentTickSessionInfo.elapsedSeconds ?? 0) + (STOPWATCH_INTERVAL_MS / 1000.0);
        this.sessionManager.updateSessionInfo(sessionId, { elapsedSeconds: updatedElapsed });
        currentTickSessionInfo = this.sessionManager.getSessionInfo(sessionId);
        this.stopwatchUi.displayInterface(session, sessionId, currentTickSessionInfo, MyAppState.STOPWATCH_RUNNING);
        this._handleAutoLap(session, sessionId);
    }
    start(session, sessionId) {
        let sessionInfo = this.sessionManager.getSessionInfo(sessionId);
        const currentState = this.sessionManager.getState(sessionId);
        if (!sessionInfo || !sessionInfo.isConnected || !sessionInfo.currentSettings) {
            console.warn("[StopwatchLogic] Cannot start, session info or currentSettings missing.");
            return;
        }
        if (currentState === MyAppState.STOPWATCH_READY || currentState === MyAppState.STOPWATCH_STOPPED || currentState === MyAppState.STOPWATCH_AUTOLAP_COMPLETED) {
            this.sessionManager.updateSessionInfo(sessionId, {
                elapsedSeconds: 0,
                lapTimes: [],
                currentLapStartTime: 0,
                totalLapsRecorded: 0,
                stopwatchAutoLapsDoneThisRun: 0,
            });
            this.sessionManager.setState(sessionId, MyAppState.STOPWATCH_RUNNING);
            this._clearStopwatchInterval(sessionId);
            const tickCallback = () => { this._tick(session, sessionId); };
            const intervalId = setInterval(tickCallback, STOPWATCH_INTERVAL_MS);
            this.sessionManager.updateSessionInfo(sessionId, { stopwatchInterval: intervalId });
            sessionInfo = this.sessionManager.getSessionInfo(sessionId);
            this.stopwatchUi.displayInterface(session, sessionId, sessionInfo, MyAppState.STOPWATCH_RUNNING);
            console.log(`[StopwatchLogic] Session ${sessionId}: Stopwatch started/restarted.`);
        }
        else {
            this.uiManager.showToast(session, sessionId, "Stopwatch cannot be started now.", TOAST_DURATION);
            console.warn(`[StopwatchLogic] Session ${sessionId}: Attempted to start stopwatch not in a startable state (current: ${MyAppState[currentState]}).`);
        }
    }
    reset(session, sessionId) {
        const sessionInfo = this.sessionManager.getSessionInfo(sessionId);
        if (!sessionInfo || !sessionInfo.isConnected)
            return;
        this._clearStopwatchInterval(sessionId);
        this.sessionManager.updateSessionInfo(sessionId, {
            elapsedSeconds: 0,
            lapTimes: [],
            currentLapStartTime: 0,
            totalLapsRecorded: 0,
            stopwatchAutoLapsDoneThisRun: 0,
        });
        this.sessionManager.setState(sessionId, MyAppState.STOPWATCH_READY);
        const updatedSessionInfo = this.sessionManager.getSessionInfo(sessionId);
        this.stopwatchUi.displayInterface(session, sessionId, updatedSessionInfo, MyAppState.STOPWATCH_READY);
        console.log(`[StopwatchLogic] Session ${sessionId}: Stopwatch reset.`);
    }
    lap(session, sessionId, isAutoLap = false) {
        let sessionInfo = this.sessionManager.getSessionInfo(sessionId);
        const currentState = this.sessionManager.getState(sessionId);
        if (!sessionInfo || !sessionInfo.isConnected || !sessionInfo.currentSettings) {
            console.warn("[StopwatchLogic] Cannot lap, session info or currentSettings missing.");
            return;
        }
        if (currentState !== MyAppState.STOPWATCH_RUNNING) {
            if (!isAutoLap) {
                this.uiManager.showToast(session, sessionId, "Round can only be set when stopwatch is running.", TOAST_DURATION);
            }
            return;
        }
        if (!isAutoLap && sessionInfo.currentSettings.stopwatch_auto_lap_enabled) {
            this.uiManager.showToast(session, sessionId, "Manual 'Set' disabled while Auto-Lap is active.", TOAST_DURATION);
            return;
        }
        const lapDuration = sessionInfo.elapsedSeconds - sessionInfo.currentLapStartTime;
        let totalLapsRecorded = sessionInfo.totalLapsRecorded ?? 0;
        totalLapsRecorded++;
        const newLapTimes = [lapDuration, ...(sessionInfo.lapTimes || [])];
        this.sessionManager.updateSessionInfo(sessionId, {
            lapTimes: newLapTimes,
            currentLapStartTime: sessionInfo.elapsedSeconds,
            totalLapsRecorded: totalLapsRecorded
        });
        sessionInfo = this.sessionManager.getSessionInfo(sessionId);
        this.stopwatchUi.displayInterface(session, sessionId, sessionInfo, MyAppState.STOPWATCH_RUNNING);
        if (!isAutoLap) {
            this.uiManager.showToast(session, sessionId, `Round ${totalLapsRecorded} set: ${formatTime(lapDuration)}`, TOAST_DURATION);
        }
        console.log(`[StopwatchLogic] ${isAutoLap ? 'Auto-' : ''}Lap (Round ${totalLapsRecorded}, duration: ${formatTime(lapDuration)}) set at total time ${formatTime(sessionInfo.elapsedSeconds)}.`);
    }
    pause(session, sessionId) {
        const sessionInfo = this.sessionManager.getSessionInfo(sessionId);
        const currentState = this.sessionManager.getState(sessionId);
        if (!sessionInfo || !sessionInfo.isConnected)
            return;
        if (currentState === MyAppState.STOPWATCH_RUNNING) {
            // ... pause logic ...
            this._clearStopwatchInterval(sessionId);
            this.sessionManager.setState(sessionId, MyAppState.STOPWATCH_PAUSED);
            const updatedSessionInfo = this.sessionManager.getSessionInfo(sessionId);
            this.stopwatchUi.displayInterface(session, sessionId, updatedSessionInfo, MyAppState.STOPWATCH_PAUSED);
            if (updatedSessionInfo)
                console.log(`[StopwatchLogic] Session ${sessionId}: Stopwatch paused at ${formatTime(updatedSessionInfo.elapsedSeconds)}.`);
        }
        else {
            this.uiManager.showToast(session, sessionId, "Stopwatch is not running, cannot pause.", TOAST_DURATION);
        }
    }
    resume(session, sessionId) {
        let sessionInfo = this.sessionManager.getSessionInfo(sessionId);
        const currentState = this.sessionManager.getState(sessionId);
        if (!sessionInfo || !sessionInfo.isConnected)
            return;
        if (currentState === MyAppState.STOPWATCH_PAUSED) {
            // ... resume logic ...
            this.sessionManager.setState(sessionId, MyAppState.STOPWATCH_RUNNING);
            this._clearStopwatchInterval(sessionId);
            const tickCallback = () => { this._tick(session, sessionId); };
            const intervalId = setInterval(tickCallback, STOPWATCH_INTERVAL_MS);
            this.sessionManager.updateSessionInfo(sessionId, { stopwatchInterval: intervalId });
            sessionInfo = this.sessionManager.getSessionInfo(sessionId);
            this.stopwatchUi.displayInterface(session, sessionId, sessionInfo, MyAppState.STOPWATCH_RUNNING);
            console.log(`[StopwatchLogic] Session ${sessionId}: Stopwatch resumed.`);
        }
        else {
            this.uiManager.showToast(session, sessionId, "Stopwatch is not paused, cannot resume.", TOAST_DURATION);
        }
    }
    async stopStopwatch(session, sessionId, toastMessage) {
        console.log(`[StopwatchLogic] Session ${sessionId}: Stopping stopwatch.`);
        const sessionInfo = this.sessionManager.getSessionInfo(sessionId);
        if (!sessionInfo)
            return;
        this._clearStopwatchInterval(sessionId);
        this.sessionManager.setState(sessionId, MyAppState.SELECTING_MODE);
        const finalToastMessage = toastMessage || "Stopwatch stopped.";
        this.uiManager.showToast(session, sessionId, finalToastMessage);
        await new Promise(resolve => setTimeout(resolve, TOAST_DURATION + 100));
        if (this.sessionManager.isSessionActive(sessionId) && this.sessionManager.getState(sessionId) === MyAppState.SELECTING_MODE) {
            this.uiManager.showModeSelection(session, sessionId);
        }
    }
    async requestModeSelection(session, sessionId) {
        const currentState = this.sessionManager.getState(sessionId);
        if (currentState === MyAppState.STOPWATCH_RUNNING ||
            currentState === MyAppState.STOPWATCH_PAUSED ||
            currentState === MyAppState.STOPWATCH_AUTOLAP_COMPLETED) {
            await this.stopStopwatch(session, sessionId, "Stopwatch stopped, returning to menu.");
        }
        else {
            this.sessionManager.setState(sessionId, MyAppState.SELECTING_MODE);
            this.uiManager.showModeSelection(session, sessionId);
        }
        console.log(`[StopwatchLogic] Session ${sessionId}: Requested mode selection. Current state was ${MyAppState[currentState]}`);
    }
    clearAllIntervals(sessionId) {
        this._clearStopwatchInterval(sessionId);
    }
    /**
     * Called by app.ts when stopwatch-related settings change.
     * @param session The TPA session.
     * @param sessionId The ID of the session.
     * @param changedSettingKey The key of AppSettings that was changed.
     * @param newValue The new value of the setting.
     */
    handleSettingChange(session, sessionId, changedSettingKey, newValue) {
        const sessionInfo = this.sessionManager.getSessionInfo(sessionId);
        const currentState = this.sessionManager.getState(sessionId);
        if (!sessionInfo || !sessionInfo.currentSettings) {
            console.warn(`[StopwatchLogic] handleSettingChange: Session info or currentSettings not found for session ${sessionId}.`);
            return;
        }
        console.log(`[StopwatchLogic] Received setting change for '${String(changedSettingKey)}', new value: '${newValue}' in session ${sessionId}. Current state: ${MyAppState[currentState]}`);
        if (currentState === MyAppState.STOPWATCH_RUNNING ||
            currentState === MyAppState.STOPWATCH_PAUSED ||
            currentState === MyAppState.STOPWATCH_READY ||
            currentState === MyAppState.STOPWATCH_AUTOLAP_COMPLETED) {
            if (changedSettingKey === 'stopwatch_auto_lap_enabled' ||
                changedSettingKey === 'stopwatch_auto_lap_interval_seconds_processed' ||
                changedSettingKey === 'stopwatch_max_auto_lap_intervals') {
                if (currentState === MyAppState.STOPWATCH_READY || currentState === MyAppState.STOPWATCH_PAUSED || currentState === MyAppState.STOPWATCH_AUTOLAP_COMPLETED) {
                    const updatedSessionInfo = this.sessionManager.getSessionInfo(sessionId);
                    if (updatedSessionInfo) {
                        this.stopwatchUi.displayInterface(session, sessionId, updatedSessionInfo, currentState);
                        console.log(`[StopwatchLogic] Refreshed Stopwatch UI due to setting change in state: ${MyAppState[currentState]}`);
                    }
                }
            }
        }
    }
}
