// src/core/commandhandler.ts
import { AppSession } from '@mentra/sdk';
import { MyAppState } from '../session/appstate';
import { SessionManager } from '../session/sessionmanager';
import { SettingsManager, AppSettings } from './settingsmanager';
import { StopwatchLogic } from '../features/stopwatch/stopwatchlogic';
import { TimerLogic } from '../features/timer/timerlogic';
import { PomodoroLogic } from '../features/pomodoro/pomodorologic'; 
import { UIManager } from './uimanager';
import { COMMAND_COOLDOWN_MS } from './constants';

export class CommandHandler {
    constructor(
        private sessionManager: SessionManager,
        private uiManager: UIManager,
        private stopwatchLogic: StopwatchLogic,
        private timerLogic: TimerLogic,
        private pomodoroLogic: PomodoroLogic, 
        private settingsManager: SettingsManager,
    ) {
        console.log('[CommandHandler] Initialized with PomodoroLogic');
    }

    public async handleCommand(session: AppSession, sessionId: string, rawCommand: string): Promise<void> {
        const sessionInfo = this.sessionManager.getSessionInfo(sessionId);
        const currentState = this.sessionManager.getState(sessionId);
        

        if (!sessionInfo || !sessionInfo.isConnected || currentState === undefined) {
            console.warn(`[CommandHandler] Session ${sessionId} not found, not connected, or state undefined. Ignoring command: "${rawCommand}"`);
            this.uiManager.showToast(session, sessionId, "Session error. Please try again.");
            return;
        }
        
        const currentSettings = sessionInfo.currentSettings as AppSettings; 

        const command = rawCommand.toLowerCase().trim();
        console.log(`[CommandHandler] Session ${sessionId} | State: ${MyAppState[currentState]} | Received command: "${command}" (raw: "${rawCommand}")`);

        const now = Date.now();
        const isVoiceControl = sessionInfo.currentControlMethod === 'voice';
        if (isVoiceControl && sessionInfo.lastCommandProcessedTimestamp && (now - sessionInfo.lastCommandProcessedTimestamp < COMMAND_COOLDOWN_MS)) {
            console.log(`[CommandHandler] Command "${command}" for session ${sessionId} ignored due to cooldown.`);
            return;
        }

        let commandWasProcessed = false;

        switch (currentState) {
            case MyAppState.IDLE:
            case MyAppState.SELECTING_MODE:
                if (command === "start stopwatch" || command === "stopwatch") {
                    this.sessionManager.setState(sessionId, MyAppState.STOPWATCH_READY);
                    this.stopwatchLogic.reset(session, sessionId);
                } else if (command === "start timer" || command === "timer" || command.startsWith("set timer for") || command === "configure timer") {
                    if (command.startsWith("set timer for")) {
                        const durationCommand = command.substring("set timer for".length).trim();
                        if (this.timerLogic.setDuration(session, sessionId, durationCommand)) {
                            commandWasProcessed = true; 
                        } else {
                            this.timerLogic.requestConfiguration(session, sessionId);
                        }
                    } else {
                        this.timerLogic.requestConfiguration(session, sessionId);
                    }
                } else if (command === "pomodoro" || command === "start pomodoro"|| command === "focus") {
                    
                    this.pomodoroLogic.initializeAndShowIdleScreen(session, sessionId);
                    
                } else {
                    this.uiManager.showToast(session, sessionId, `Unknown command: ${command}`);
                }
                break;

            case MyAppState.STOPWATCH_READY:
                if (command === "start") { this.stopwatchLogic.start(session, sessionId); commandWasProcessed = true; }
                else if (command === "menu" || command === "cancel" || command === "back") { this.stopwatchLogic.requestModeSelection(session, sessionId); commandWasProcessed = true;}
                else { this.uiManager.showToast(session, sessionId, `Say 'Start' or 'Menu'.`); }
                break;
            case MyAppState.STOPWATCH_RUNNING:
                const autoLapEnabled = currentSettings.stopwatch_auto_lap_enabled; 

                if (command === "pause") { 
                    this.stopwatchLogic.pause(session, sessionId); commandWasProcessed = true; 
                } else if (!autoLapEnabled && (command === "lap" || command === "set" || command === "round")) { 
                    this.stopwatchLogic.lap(session, sessionId); commandWasProcessed = true; 
                } else if (autoLapEnabled && (command === "lap" || command === "set" || command === "round")) { 
                    this.uiManager.showToast(session, sessionId, "Manual 'Set' disabled while Auto-Lap is active.");
                    commandWasProcessed = true; 
                }
                else if (command === "reset") { this.stopwatchLogic.reset(session, sessionId); commandWasProcessed = true; }
                else if (command === "stop") { 
                    await this.stopwatchLogic.stopStopwatch(session, sessionId, "Stopwatch stopped."); 
                    commandWasProcessed = true; 
                } 
                else if (command === "menu" || command === "back") { 
                    await this.stopwatchLogic.requestModeSelection(session, sessionId); 
                    commandWasProcessed = true; 
                }
                else { 
                    let hintForToast = `'Pause', ${!autoLapEnabled ? "'Set', " : ""}'Reset', 'Stop' or 'Menu'`;
                    this.uiManager.showToast(session, sessionId, `Try ${hintForToast}.`); 
                }
                break;
            case MyAppState.STOPWATCH_PAUSED:
                if (command === "resume") { this.stopwatchLogic.resume(session, sessionId); commandWasProcessed = true; }
                else if (command === "reset") { this.stopwatchLogic.reset(session, sessionId); commandWasProcessed = true; }
                else if (command === "stop" || command === "cancel" || command === "menu") { await this.stopwatchLogic.stopStopwatch(session, sessionId, "Stopwatch stopped."); 
                    commandWasProcessed = true; }
                else { this.uiManager.showToast(session, sessionId, `Try 'Resume', 'Reset', 'Stop', or 'Menu'.`); }
                break;
            case MyAppState.STOPWATCH_STOPPED: 
                if (command === "start") { 
                    this.stopwatchLogic.start(session, sessionId); commandWasProcessed = true; 
                } else if (command === "reset") { 
                    this.stopwatchLogic.reset(session, sessionId); commandWasProcessed = true; 
                } else if (command === "menu" || command === "back" || command === "stop") { 
                    await this.stopwatchLogic.stopStopwatch(session, sessionId, "Returning to menu."); 
                    commandWasProcessed = true; 
                } else { 
                    this.uiManager.showToast(session, sessionId, `Say 'Start', 'Reset' or 'Menu'.`); 
                }
                break;

            case MyAppState.STOPWATCH_AUTOLAP_COMPLETED:
                if (command === "restart" || command === "start") { 
                    this.stopwatchLogic.reset(session, sessionId); 
                    
                    await new Promise(resolve => setTimeout(resolve, 100)); 
                    this.stopwatchLogic.start(session, sessionId); 
                    commandWasProcessed = true;
                } else if (command === "menu" || command === "back" || command === "stop") { 
                    await this.stopwatchLogic.stopStopwatch(session, sessionId, "Returning to menu.");
                    commandWasProcessed = true;
                } else {
                    this.uiManager.showToast(session, sessionId, `Say 'Restart', 'Reset' or 'Menu'.`);
                }
                break;
            
            case MyAppState.CONFIGURING_TIMER:
                if (command === "menu" || command === "back" || command === "cancel") {
                    await this.timerLogic.stopTimer(session, sessionId); 
                    commandWasProcessed = true;
                } else if (command === "start") { 
                    this.timerLogic.startTimerWithDefaultDuration(session, sessionId);
                    commandWasProcessed = true;
                } else { 
                    const durationSet = this.timerLogic.setDuration(session, sessionId, command);
                    if (durationSet) {
                        commandWasProcessed = true; 
                    } else {
                         
                         this.timerLogic.requestConfiguration(session, sessionId);
                    }
                }
                break;
            case MyAppState.TIMER_READY:
                if (command === "start") {
                    if (sessionInfo && sessionInfo.timerDuration > 0) {
                        this.timerLogic.start(session, sessionId);
                        commandWasProcessed = true;
                    } else {
                        this.uiManager.showToast(session, sessionId, "No duration set. Say 'Configure'.");
                        this.timerLogic.requestConfiguration(session, sessionId);
                    }
                } else if (command === "reset") { 
                    this.timerLogic.reset(session, sessionId);
                    commandWasProcessed = true; 
                } else if (command === "configure" || command === "change duration" || command.startsWith("set for")) {
                    if (command.startsWith("set for")) {
                        const durationCommand = command.substring("set for".length).trim();
                        if (this.timerLogic.setDuration(session, sessionId, durationCommand)) {
                           commandWasProcessed = true;
                        } else {
                           this.timerLogic.requestConfiguration(session, sessionId);
                        }
                    } else {
                        this.timerLogic.requestConfiguration(session, sessionId);
                    }
                } else if (command === "menu" || command === "back") {
                    this.timerLogic.stopTimer(session, sessionId);
                    commandWasProcessed = true;
                } else {
                    this.uiManager.showToast(session, sessionId, "Timer is Ready. Say 'Start', 'Configure', or 'Menu'.");
                }
                break;
            case MyAppState.TIMER_RUNNING:
                if (command === "pause") { this.timerLogic.pause(session, sessionId); commandWasProcessed = true; }
                else if (command === "reset") { this.timerLogic.reset(session, sessionId); commandWasProcessed = true; }
                else if (command === "stop" || command === "cancel" || command === "menu") { this.timerLogic.stopTimer(session, sessionId); commandWasProcessed = true;}
                else { this.uiManager.showToast(session, sessionId, "Timer running. Say 'Pause', 'Reset', or 'Stop'."); }
                break;
            case MyAppState.TIMER_PAUSED:
                if (command === "resume") { this.timerLogic.resume(session, sessionId); commandWasProcessed = true; }
                else if (command === "reset") { this.timerLogic.reset(session, sessionId); commandWasProcessed = true; }
                else if (command === "stop" || command === "cancel" || command === "menu") { this.timerLogic.stopTimer(session, sessionId); commandWasProcessed = true;}
                else { this.uiManager.showToast(session, sessionId, "Timer paused. Say 'Resume', 'Reset', or 'Stop'."); }
                break;
            case MyAppState.TIMER_FINISHED:
                if (command === "okay" || command === "ok" || command === "menu") {
                    this.timerLogic.handleFinishedConfirmation(session, sessionId);
                    commandWasProcessed = true;
                } else {
                    this.uiManager.showToast(session, sessionId, "Timer finished. Say 'Okay' or 'Menu'.");
                }
                break;

            case MyAppState.POMODORO_IDLE:
                if (command === "start" || command === "start cycle") {
                    this.pomodoroLogic.startCycle(session, sessionId);
                    commandWasProcessed = true;
                } else if (command === "menu" || command === "back") {
                    this.pomodoroLogic.stopPomodoroCycle(session, sessionId); 
                    commandWasProcessed = true;
                } else {
                    this.uiManager.showToast(session, sessionId, `Say 'Start Cycle' or 'Menu'.`);
                }
                break;

            case MyAppState.POMODORO_WORK_RUNNING:
                if (command === "pause") { this.pomodoroLogic.pauseInterval(session, sessionId); commandWasProcessed = true; }
                else if (command === "skip break" || command === "skip to break" || command === "next" || command === "finish work") {
                    this.pomodoroLogic.skipToNextAppropriatePhase(session, sessionId); commandWasProcessed = true;
                } else if (command === "reset cycle") { this.pomodoroLogic.resetCurrentCycle(session, sessionId); commandWasProcessed = true; }
                else if (command === "stop pomodoro" || command === "stop cycle" || command === "menu") { 
                    this.pomodoroLogic.stopPomodoroCycle(session, sessionId); commandWasProcessed = true; 
                }
                else { this.uiManager.showToast(session, sessionId, `Say 'Pause', 'Skip to Break' or 'Stop Pomodoro'.`); }
                break;

            case MyAppState.POMODORO_BREAK_RUNNING:
                if (command === "pause" || command === "pause break") { this.pomodoroLogic.pauseInterval(session, sessionId); commandWasProcessed = true; }
                else if (command === "skip work" || command === "skip to work" || command === "next" || command === "finish break") {
                    this.pomodoroLogic.skipToNextAppropriatePhase(session, sessionId); commandWasProcessed = true;
                } else if (sessionInfo?.pomodoroCurrentPhase === 'LONG_BREAK' && (command === "early new cycle" || command === "new cycle" || command === "skip to new cycle")) {
                    this.pomodoroLogic.skipToNextAppropriatePhase(session,sessionId); 
                    commandWasProcessed = true;
                }
                else if (command === "stop pomodoro" || command === "stop cycle" || command === "menu") { this.pomodoroLogic.stopPomodoroCycle(session, sessionId); commandWasProcessed = true; }
                else { this.uiManager.showToast(session, sessionId, `Say 'Pause', 'Skip to Work' or 'Stop Pomodoro'.`); }
                break;

            case MyAppState.POMODORO_PAUSED:
                if (command === "resume" || command === "resume break" || command === "resume work") { this.pomodoroLogic.resumeInterval(session, sessionId); commandWasProcessed = true; }
                else if (command === "skip break" && sessionInfo?.pomodoroCurrentPhase === 'WORK') { this.pomodoroLogic.skipToNextAppropriatePhase(session, sessionId); commandWasProcessed = true; }
                else if ((command === "skip work" || command === "skip to work") && (sessionInfo?.pomodoroCurrentPhase === 'SHORT_BREAK' || sessionInfo?.pomodoroCurrentPhase === 'LONG_BREAK')) { this.pomodoroLogic.skipToNextAppropriatePhase(session, sessionId); commandWasProcessed = true; }
                else if (sessionInfo?.pomodoroCurrentPhase === 'LONG_BREAK' && (command === "early new cycle" || command === "new cycle" || command === "skip to new cycle")) {
                    this.pomodoroLogic.skipToNextAppropriatePhase(session,sessionId); 
                    commandWasProcessed = true;
                }
                else if (command === "reset cycle") { this.pomodoroLogic.resetCurrentCycle(session, sessionId); commandWasProcessed = true; }
                else if (command === "stop pomodoro" || command === "stop cycle" || command === "menu") { this.pomodoroLogic.stopPomodoroCycle(session, sessionId); commandWasProcessed = true; }
                else { this.uiManager.showToast(session, sessionId, `Say 'Resume', 'Skip', 'Reset' or 'Stop Pomodoro'.`); }
                break;

            case MyAppState.POMODORO_PENDING_CONFIRMATION:
                if (command === "proceed") { this.pomodoroLogic.proceedFromConfirmation(session, sessionId); commandWasProcessed = true; }
                else if (command === "stop pomodoro" || command === "stop cycle" || command === "menu") { this.pomodoroLogic.stopPomodoroCycle(session, sessionId); commandWasProcessed = true; }
                else { this.uiManager.showToast(session, sessionId, `Say 'Proceed' or 'Stop Pomodoro'.`); }
                break;

            case MyAppState.POMODORO_CYCLE_ENDED:
                if (command === "start new cycle") {
                    this.pomodoroLogic.startCycle(session, sessionId); 
                    commandWasProcessed = true;
                } else if (command === "menu" || command === "stop") { 
                    this.pomodoroLogic.stopPomodoroCycle(session, sessionId); commandWasProcessed = true; 
                } else { 
                    this.uiManager.showToast(session, sessionId, `Say 'Start New Cycle' or 'Menu'.`); 
                }
                break;

            default:
                console.warn(`[CommandHandler] Unhandled state: ${MyAppState[currentState]} for command "${command}"`);
                this.uiManager.showToast(session, sessionId, "I'm not sure what to do right now.");
                this.uiManager.showModeSelection(session, sessionId); 
                break;
        }

        if (commandWasProcessed) {
            this.sessionManager.updateSessionInfo(sessionId, { lastCommandProcessedTimestamp: Date.now() });
        }
    }
}