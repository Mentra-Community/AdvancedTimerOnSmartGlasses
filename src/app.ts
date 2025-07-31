// src/app.ts
import {
    AppServer, AppSession, AppServerConfig,
    WebSocketError, ButtonPress, TranscriptionData, ViewType,
    AppSetting as SdkSetting,
} from '@mentra/sdk';
import path from 'path';

import { MyAppState } from './session/appstate';
import { MySessionInfo } from './session/sessioninfo';
import { SessionManager } from './session/sessionmanager';
import { AppSettings, SettingsManager } from './core/settingsmanager';
import { fallbackDefaultAppSettings } from './core/constants';
import { UIManager } from './core/uimanager';
import { TimerUi } from './features/timer/timerui';
import { TimerLogic } from './features/timer/timerlogic';
import { StopwatchUi } from './features/stopwatch/stopwatchui';
import { StopwatchLogic } from './features/stopwatch/stopwatchlogic';
import { PomodoroUi } from './features/pomodoro/pomodoroui';
import { PomodoroLogic } from './features/pomodoro/pomodorologic';
import { CommandHandler } from './core/commandhandler';
import { TRIGGER_PHRASE, COMMAND_COOLDOWN_MS } from './core/constants';
import { formatTime } from './utils/timeformatter';
import { handleToolCall } from './tools';
import { ToolCall } from '@mentra/sdk';

const TOAST_DURATION = 2000; 
const INITIALIZING_DELAY_MS = 1000; 
const INITIALIZING_STAGES = 3;
const ALWAYS_LISTEN_SDK_KEYS: string[] = [ /* ... */ ];
const FEATURE_TOGGLE_SDK_KEYS: string[] = [ /* ... */ ];
const TIMER_DATA_SDK_KEYS: string[] = [ /* ... */ ];
const STOPWATCH_DATA_SDK_KEYS: string[] = [ /* ... */ ];
const POMODORO_DATA_SDK_KEYS: string[] = [ /* ... */ ];
const SDK_KEY_TO_APP_SETTINGS_KEY_MAP: Partial<Record<string, keyof AppSettings>> = { /* ... */ };

export class AdvancedTimerApp extends AppServer {
    public sessionManager: SessionManager;
    private settingsManager: SettingsManager;
    private uiManager: UIManager;
    private timerUi: TimerUi;
    private timerLogic: TimerLogic;
    private stopwatchUi: StopwatchUi;
    private stopwatchLogic: StopwatchLogic;
    private pomodoroUi: PomodoroUi;
    private pomodoroLogic: PomodoroLogic;
    public commandHandler: CommandHandler;
    public activeAppSessions: Map<string, AppSession> = new Map();

    public readonly ownPackageName: string;
    public readonly ownPort: number;
    public readonly ownApiKey: string;

    private settingsRefreshedUnsubscribeMap: Map<string, () => void> = new Map();
    private initializationTimeouts: Map<string, NodeJS.Timeout> = new Map();
    private transcriptionUnsubscribeMap: Map<string, () => void> = new Map();

    constructor(config: AppServerConfig) {
        super(config);
        this.ownPackageName = config.packageName;
        this.ownPort = config.port ?? 8080;
        this.ownApiKey = config.apiKey;
        console.log(`[AdvancedTimerApp] Initialized with package name: ${this.ownPackageName}, port: ${this.ownPort}`);

        const configDir = config.publicDir || path.join(__dirname, '../'); 
        this.settingsManager = new SettingsManager(configDir, fallbackDefaultAppSettings);
        this.settingsManager.loadGlobalSettings(); 

        this.sessionManager = new SessionManager(this.settingsManager); 
        this.uiManager = new UIManager(this.settingsManager, this.sessionManager);
        this.timerUi = new TimerUi(this.settingsManager, this.uiManager);
        this.stopwatchUi = new StopwatchUi(this.settingsManager, this.uiManager);
        this.timerLogic = new TimerLogic(this.sessionManager, this.timerUi, this.uiManager);
        this.stopwatchLogic = new StopwatchLogic(this.sessionManager, this.stopwatchUi, this.uiManager);
        this.pomodoroUi = new PomodoroUi(this.settingsManager, this.uiManager);
        this.pomodoroLogic = new PomodoroLogic(this.sessionManager, this.pomodoroUi, this.uiManager);
        this.commandHandler = new CommandHandler(
            this.sessionManager, this.uiManager,
            this.stopwatchLogic, this.timerLogic, this.pomodoroLogic, this.settingsManager
        );
        console.log('[AdvancedTimerApp] All components initialized.');
    }

    protected async onToolCall(toolCall: ToolCall): Promise<string | undefined> {
        const sessionId = this.sessionManager.getSessionIdForUserId(toolCall.userId);
        if (!sessionId) {
            return "Could not find an active session for this user.";
        }
        const session = this.activeAppSessions.get(sessionId);
        if (!session) {
            return "Could not find the session object for this command.";
        }

        return handleToolCall(toolCall, this, session, this.commandHandler, sessionId);
    }

    private _getEffectiveSettingsForSession(sessionId: string): AppSettings {
        const effectiveSettings = { ...fallbackDefaultAppSettings } as AppSettings;
        const keys = Object.keys(fallbackDefaultAppSettings) as Array<keyof AppSettings>;
        for (const key of keys) {
            (effectiveSettings as any)[key] = this.settingsManager.getSetting(sessionId, key);
        }
        return effectiveSettings;
    }

    private _stopPreviousModeDataListeners(sessionId: string, previousState: MyAppState | undefined): void {
        console.log(`[AdvancedTimerApp] _stopPreviousModeDataListeners called for session ${sessionId}, previousState: ${previousState !== undefined ? MyAppState[previousState] : 'undefined'}`);
        if (previousState === MyAppState.TIMER_RUNNING || previousState === MyAppState.TIMER_PAUSED || previousState === MyAppState.TIMER_READY || previousState === MyAppState.CONFIGURING_TIMER) {
            this.settingsManager.stopListeningToTimerDataSettings(sessionId);
        } else if (previousState === MyAppState.STOPWATCH_RUNNING || previousState === MyAppState.STOPWATCH_PAUSED || previousState === MyAppState.STOPWATCH_READY || previousState === MyAppState.STOPWATCH_STOPPED || previousState === MyAppState.STOPWATCH_AUTOLAP_COMPLETED) {
            this.settingsManager.stopListeningToStopwatchDataSettings(sessionId);
        } else if (previousState === MyAppState.POMODORO_IDLE || previousState === MyAppState.POMODORO_WORK_RUNNING || previousState === MyAppState.POMODORO_BREAK_RUNNING || previousState === MyAppState.POMODORO_PAUSED || previousState === MyAppState.POMODORO_PENDING_CONFIRMATION || previousState === MyAppState.POMODORO_CYCLE_ENDED) {
            this.settingsManager.stopListeningToPomodoroDataSettings(sessionId);
        }
    }

    private async _handleAppInitializing(session: AppSession, sessionId: string, stage = 1): Promise<void> {
        if (!this.sessionManager.isSessionActive(sessionId) || this.sessionManager.getState(sessionId) !== MyAppState.APP_INITIALIZING) {
            const existingTimeout = this.initializationTimeouts.get(sessionId);
            if (existingTimeout) {
                clearTimeout(existingTimeout);
                this.initializationTimeouts.delete(sessionId);
                console.log(`[AdvancedTimerApp] Cleared init timeout for ${sessionId} because state changed or session ended.`);
            }
            return;
        }

        this.uiManager.showModeSelection(session, sessionId);

        if (stage < INITIALIZING_STAGES) {
            const timeoutId = setTimeout(() => {
                this._handleAppInitializing(session, sessionId, stage + 1);
            }, INITIALIZING_DELAY_MS);
            this.initializationTimeouts.set(sessionId, timeoutId);
        } else {
            this.initializationTimeouts.delete(sessionId);
            console.log(`[AdvancedTimerApp] Initialization complete for session ${sessionId}. Applying startup mode.`);
            this.applyStartupMode(session, sessionId);
        }
    }

    protected async onSession(session: AppSession, sessionId: string, userId: string): Promise<void> {
        console.log(`[AdvancedTimerApp] onSession called for session: ${sessionId}, user: ${userId}`);
        this.activeAppSessions.set(sessionId, session);

        this.sessionManager.initializeSession(sessionId, MyAppState.APP_INITIALIZING, userId); 
        
        await this.settingsManager.initializeSessionSettings(session, sessionId); 
        this.settingsManager.listenToAlwaysOnSettings(session, sessionId);

        const effectiveSettingsForSession = this._getEffectiveSettingsForSession(sessionId);
        this.sessionManager.updateSessionInfo(sessionId, {
            currentSettings: { ...effectiveSettingsForSession },
            currentControlMethod: effectiveSettingsForSession.control_input_method,
            timerDuration: effectiveSettingsForSession.default_timer_duration_seconds,
            remainingSeconds: effectiveSettingsForSession.default_timer_duration_seconds,
        });
        console.log(`[AdvancedTimerApp] MySessionInfo for ${sessionId} updated with effective settings after SDK init.`);

        const oldUnsubscribe = this.settingsRefreshedUnsubscribeMap.get(sessionId);
        if (oldUnsubscribe) {
            oldUnsubscribe();
            this.settingsRefreshedUnsubscribeMap.delete(sessionId);
        }
        const oldTranscriptionUnsub = this.transcriptionUnsubscribeMap.get(sessionId);
        if (oldTranscriptionUnsub) {
            oldTranscriptionUnsub();
            this.transcriptionUnsubscribeMap.delete(sessionId);
        }
        const subscribeTranscriptionIfNeeded = () => {
            const sessInfo = this.sessionManager.getSessionInfo(sessionId);
            if (sessInfo && sessInfo.currentControlMethod === 'voice') {
                const prevUnsub = this.transcriptionUnsubscribeMap.get(sessionId);
                if (prevUnsub) prevUnsub();
                const unsub = session.events.onTranscription(async (transcriptionData: TranscriptionData) => {
                    const sessionInfo = this.sessionManager.getSessionInfo(sessionId);
                    if (!sessionInfo || !sessionInfo.isConnected || !sessionInfo.currentSettings || this.sessionManager.getState(sessionId) === MyAppState.APP_INITIALIZING) return;
                    const effectiveControlMethod = sessionInfo.currentControlMethod;
                    if (effectiveControlMethod !== 'voice') return;
                    const rawCommandText = transcriptionData.text;
                    const isFinal = transcriptionData.isFinal ?? true;
                    if (isFinal && rawCommandText && rawCommandText.trim() !== "") {
                        let commandToExecute = rawCommandText.trim().toLowerCase();
                        commandToExecute = commandToExecute.replace(/[^a-z0-9 ]+/g, "");
                        if (commandToExecute === "stop watch") {
                            commandToExecute = "stopwatch";
                        }
                        const useTrigger = sessionInfo.currentSettings.use_trigger_word_setting;
                        if (useTrigger && commandToExecute.startsWith(TRIGGER_PHRASE.toLowerCase())) {
                            commandToExecute = commandToExecute.substring(TRIGGER_PHRASE.length).trim();
                            if (commandToExecute === "") {
                                this.sessionManager.updateSessionInfo(sessionId, { lastCommandProcessedTimestamp: Date.now() });
                                return;
                            }
                        } else if (useTrigger) {
                            return;
                        }
                        if (commandToExecute.trim() !== "") {
                            const now = Date.now();
                            if (sessionInfo.lastCommandProcessedTimestamp && (now - sessionInfo.lastCommandProcessedTimestamp < COMMAND_COOLDOWN_MS)) {
                                console.log(`[AdvancedTimerApp] Command "${commandToExecute}" for session ${sessionId} ignored due to cooldown.`);
                                return;
                            }
                            await this.commandHandler.handleCommand(session, sessionId, commandToExecute);
                        }
                    }
                });
                this.transcriptionUnsubscribeMap.set(sessionId, unsub);
                console.log(`[AdvancedTimerApp] Subscribed to transcription for session ${sessionId}`);
            }
        };
        // subscribeTranscriptionIfNeeded();
        
        const unsubscribeSettingsRefreshed = this.settingsManager.onSettingsRefreshed(sessionId, (changedTpaConfigKeys: string[]) => {
            console.log(`[AdvancedTimerApp] Settings refreshed callback for session ${sessionId}. Changed TPA Config keys:`, changedTpaConfigKeys);
            
            const currentSessInfo = this.sessionManager.getSessionInfo(sessionId);
            if (!currentSessInfo) {
                console.warn(`[AdvancedTimerApp] onSettingsRefreshed: No session info found for ${sessionId}. Aborting.`);
                return;
            }
            const previousAppSettingsInSession = { ...currentSessInfo.currentSettings };
            const newEffectiveSettings = this._getEffectiveSettingsForSession(sessionId); 

            this.sessionManager.updateSessionInfo(sessionId, {
                currentSettings: { ...newEffectiveSettings },
                currentControlMethod: newEffectiveSettings.control_input_method,
            });
            console.log(`[AdvancedTimerApp] MySessionInfo for ${sessionId} updated with latest effective settings before processing individual keys.`);

            let uiRefreshNeeded = false;

            changedTpaConfigKeys.forEach(tpaConfigKey => {
                console.log(`[AdvancedTimerApp] Processing changed key: ${tpaConfigKey} for session ${sessionId}`);
                
                let appSettingEquivalentKey = tpaConfigKey as keyof AppSettings;
                let valueToCheckAgainstPrevious = (newEffectiveSettings as any)[appSettingEquivalentKey];
                let previousValueInSession = (previousAppSettingsInSession as any)[appSettingEquivalentKey];
                
                if (tpaConfigKey === 'default_timer_duration_minutes') {
                    appSettingEquivalentKey = 'default_timer_duration_seconds';
                    valueToCheckAgainstPrevious = newEffectiveSettings.default_timer_duration_seconds;
                    previousValueInSession = previousAppSettingsInSession.default_timer_duration_seconds;
                if (previousValueInSession !== valueToCheckAgainstPrevious) {
                    // GECORRIGEERDE AANROEP:
                    this.timerLogic.handleSettingChange(
                        session,
                        sessionId,
                        'default_timer_duration_seconds', 
                        newEffectiveSettings.default_timer_duration_seconds
                    );
                }
                    uiRefreshNeeded = true;
                } else if (tpaConfigKey === 'stopwatch_auto_lap_interval_mmss') {
                    appSettingEquivalentKey = 'stopwatch_auto_lap_interval_seconds_processed';
                    valueToCheckAgainstPrevious = newEffectiveSettings.stopwatch_auto_lap_interval_seconds_processed;
                    previousValueInSession = previousAppSettingsInSession.stopwatch_auto_lap_interval_seconds_processed;
                     if (valueToCheckAgainstPrevious !== previousValueInSession) {
                        this.uiManager.showToast(session, sessionId, `Auto-Lap interval set to ${formatTime(newEffectiveSettings.stopwatch_auto_lap_interval_seconds_processed)}.`);
                    }
                    uiRefreshNeeded = true;
                } else if (tpaConfigKey === 'pomodoro_work_duration_minutes') {
                    appSettingEquivalentKey = 'pomodoro_work_duration_seconds';
                    valueToCheckAgainstPrevious = newEffectiveSettings.pomodoro_work_duration_seconds;
                    previousValueInSession = previousAppSettingsInSession.pomodoro_work_duration_seconds;
                     if (previousValueInSession !== valueToCheckAgainstPrevious) {
                        this.handlePomodoroDurationChange('pomodoro_work_duration_seconds', newEffectiveSettings.pomodoro_work_duration_seconds, "Pomodoro work duration", session, sessionId);
                    }
                    uiRefreshNeeded = true;
                } else if (tpaConfigKey === 'pomodoro_short_break_duration_minutes') {
                    appSettingEquivalentKey = 'pomodoro_short_break_duration_seconds';
                    valueToCheckAgainstPrevious = newEffectiveSettings.pomodoro_short_break_duration_seconds;
                    previousValueInSession = previousAppSettingsInSession.pomodoro_short_break_duration_seconds;
                    if (previousValueInSession !== valueToCheckAgainstPrevious) {
                        this.handlePomodoroDurationChange('pomodoro_short_break_duration_seconds', newEffectiveSettings.pomodoro_short_break_duration_seconds, "Pomodoro short break", session, sessionId);
                    }
                    uiRefreshNeeded = true;
                } else if (tpaConfigKey === 'pomodoro_long_break_duration_minutes') {
                    appSettingEquivalentKey = 'pomodoro_long_break_duration_seconds';
                    valueToCheckAgainstPrevious = newEffectiveSettings.pomodoro_long_break_duration_seconds;
                    previousValueInSession = previousAppSettingsInSession.pomodoro_long_break_duration_seconds;
                     if (previousValueInSession !== valueToCheckAgainstPrevious) {
                        this.handlePomodoroDurationChange('pomodoro_long_break_duration_seconds', newEffectiveSettings.pomodoro_long_break_duration_seconds, "Pomodoro long break", session, sessionId);
                    }
                    uiRefreshNeeded = true;
                }
                else if (Object.prototype.hasOwnProperty.call(previousAppSettingsInSession, appSettingEquivalentKey) && 
                         previousValueInSession !== valueToCheckAgainstPrevious) {
                    
                    console.log(`[AdvancedTimerApp] Setting '${appSettingEquivalentKey}' (from tpaKey '${tpaConfigKey}') changed from '${previousValueInSession}' to '${valueToCheckAgainstPrevious}'`);

                    if (tpaConfigKey === 'startup_mode') {
                        this.uiManager.showToast(session, sessionId, "Startup mode updated.");
                        const currentAppState = this.sessionManager.getState(sessionId);
                        if (currentAppState === MyAppState.IDLE || currentAppState === MyAppState.SELECTING_MODE || currentAppState === MyAppState.APP_INITIALIZING) {
                            this.applyStartupMode(session, sessionId); 
                            uiRefreshNeeded = false; 
                        } else { uiRefreshNeeded = true; }
                    } else if (tpaConfigKey === 'control_input_method') {
                        this.uiManager.showToast(session, sessionId, `Controls set to ${valueToCheckAgainstPrevious}.`);
                        const sessInfo = this.sessionManager.getSessionInfo(sessionId);
                        // if (sessInfo) {
                        //     if (sessInfo.currentControlMethod === 'voice') {
                        //         subscribeTranscriptionIfNeeded();
                        //     } else {
                        //         const unsub = this.transcriptionUnsubscribeMap.get(sessionId);
                        //         if (unsub) {
                        //             unsub();
                        //             this.transcriptionUnsubscribeMap.delete(sessionId);
                        //             console.log(`[AdvancedTimerApp] Unsubscribed from transcription for session ${sessionId}`);
                        //         }
                        //     }
                        // }
                        uiRefreshNeeded = true;
                    } else if (tpaConfigKey === 'use_trigger_word_setting') {
                        this.uiManager.showToast(session, sessionId, `Trigger word ("${TRIGGER_PHRASE}") ${valueToCheckAgainstPrevious ? 'enabled' : 'disabled'}.`);
                        uiRefreshNeeded = true;
                    } else if (tpaConfigKey === 'show_hints') {
                        this.uiManager.showToast(session, sessionId, `Command hints ${valueToCheckAgainstPrevious ? 'enabled' : 'disabled'}.`);
                        uiRefreshNeeded = true;
                    }
                    else if (tpaConfigKey === 'activate_timer_from_settings') {
                        this.handleActivateToggleChange(session, sessionId, 'timer', newEffectiveSettings.activate_timer_from_settings, previousAppSettingsInSession.activate_timer_from_settings);
                        uiRefreshNeeded = false; 
                    }
                    else if (tpaConfigKey === 'activate_stopwatch_from_settings') {
                         this.handleActivateToggleChange(session, sessionId, 'stopwatch', newEffectiveSettings.activate_stopwatch_from_settings, previousAppSettingsInSession.activate_stopwatch_from_settings);
                         uiRefreshNeeded = false;
                    } else if (tpaConfigKey === 'activate_pomodoro_from_settings') {
                         this.handleActivateToggleChange(session, sessionId, 'pomodoro', newEffectiveSettings.activate_pomodoro_from_settings, previousAppSettingsInSession.activate_pomodoro_from_settings);
                         uiRefreshNeeded = false;
                    }
                    else if (tpaConfigKey === 'stopwatch_auto_lap_enabled') {
                        this.uiManager.showToast(session, sessionId, `Stopwatch Auto-Lap ${valueToCheckAgainstPrevious ? 'enabled' : 'disabled'}.`);
                        uiRefreshNeeded = true;
                    } else if (tpaConfigKey === 'stopwatch_max_auto_lap_intervals') {
                        const displayMax = (valueToCheckAgainstPrevious as number) >= 99 ? "Unlimited" : `${valueToCheckAgainstPrevious} rounds`;
                        this.uiManager.showToast(session, sessionId, `Stopwatch Max Auto-Laps set to ${displayMax}.`);
                        uiRefreshNeeded = true; 
                    }
                    else if (tpaConfigKey === 'pomodoro_intervals_before_long_break') {
                        this.uiManager.showToast(session, sessionId, `Pomodoro intervals set to ${valueToCheckAgainstPrevious}.`);
                        if (this.sessionManager.getState(sessionId) === MyAppState.POMODORO_IDLE) uiRefreshNeeded = true;
                    } else if (tpaConfigKey === 'pomodoro_auto_start_breaks') {
                        this.uiManager.showToast(session, sessionId, `Auto-start breaks ${valueToCheckAgainstPrevious ? 'enabled' : 'disabled'}.`);
                    } else if (tpaConfigKey === 'pomodoro_auto_start_work') {
                        this.uiManager.showToast(session, sessionId, `Auto-start work ${valueToCheckAgainstPrevious ? 'enabled' : 'disabled'}.`);
                    }
                } else if (!Object.prototype.hasOwnProperty.call(previousAppSettingsInSession, appSettingEquivalentKey) && (newEffectiveSettings as any)[appSettingEquivalentKey] !== undefined) {
                     console.log(`[AdvancedTimerApp] New setting '${appSettingEquivalentKey}' (from tpaKey '${tpaConfigKey}') detected with value '${(newEffectiveSettings as any)[appSettingEquivalentKey]}'`);
                }
            });

                if (uiRefreshNeeded) {
                    if (this.sessionManager.getState(sessionId) !== MyAppState.APP_INITIALIZING) {
                        this.refreshCurrentUI(session, sessionId);
                    }
                }
        });
        this.settingsRefreshedUnsubscribeMap.set(sessionId, unsubscribeSettingsRefreshed);
        
        this._handleAppInitializing(session, sessionId); 
        
        session.events.onError((error: WebSocketError | Error) => { 
            const existingTimeout = this.initializationTimeouts.get(sessionId);
            if (existingTimeout) clearTimeout(existingTimeout);
            this.initializationTimeouts.delete(sessionId);
            console.error(`[AdvancedTimerApp] Session ${sessionId} Error:`, error);
            if (this.sessionManager.getSessionInfo(sessionId)) {
                this.sessionManager.updateSessionInfo(sessionId, { isConnected: false });
                this.clearAllTimersForSession(sessionId);
            }
            this.activeAppSessions.delete(sessionId);
        });
        session.events.onDisconnected((disconnectData: string | { message: string; code: number; reason: string; wasClean: boolean; permanent?: boolean }) => {
            const reason = typeof disconnectData === 'string' ? disconnectData : disconnectData.reason;
            console.log(`[AdvancedTimerApp] 👋 Session ${sessionId} disconnected. Reason: ${reason}`);
            const existingTimeout = this.initializationTimeouts.get(sessionId);
            if (existingTimeout) clearTimeout(existingTimeout);
            this.initializationTimeouts.delete(sessionId);

            const unsubscribe = this.settingsRefreshedUnsubscribeMap.get(sessionId);
            if (unsubscribe) {
                unsubscribe();
                this.settingsRefreshedUnsubscribeMap.delete(sessionId);
            }
            this._stopPreviousModeDataListeners(sessionId, this.sessionManager.getState(sessionId)); 
            this.settingsManager.stopListeningToAlwaysOnSettings(sessionId); 
            
            if (this.sessionManager.getSessionInfo(sessionId)) {
                this.clearAllTimersForSession(sessionId);
                this.sessionManager.removeSession(sessionId);
                this.settingsManager.removeSessionSettings(sessionId);
            }
            this.activeAppSessions.delete(sessionId);
            const unsub = this.transcriptionUnsubscribeMap.get(sessionId);
            if (unsub) {
                unsub();
                this.transcriptionUnsubscribeMap.delete(sessionId);
                console.log(`[AdvancedTimerApp] Unsubscribed from transcription for session ${sessionId} on disconnect`);
            }
        });
                
        // session.events.onButtonPress(async (buttonData: ButtonPress) => { 
        //     if (this.sessionManager.getState(sessionId) === MyAppState.APP_INITIALIZING) return;
        //     const buttonId = buttonData.buttonId;
        //     this.uiManager.showToast(session, sessionId, `Button "${buttonId}" pressed (not implemented).`);
        // });
    } // EINDE onSession METHODE

    private async handleActivateToggleChange(
        session: AppSession,
        sessionId: string,
        featureType: 'timer' | 'stopwatch' | 'pomodoro',
        newToggleValue: boolean, 
        oldToggleValueInSession: boolean | undefined
    ): Promise<void> {
        console.log(`[AdvancedTimerApp] Handling activate toggle for ${featureType}: New SDK Value=${newToggleValue}, Previous Session Value=${oldToggleValueInSession}`);
        const currentState = this.sessionManager.getState(sessionId);
        
        if (currentState === MyAppState.APP_INITIALIZING) {
            console.log(`[AdvancedTimerApp] App is initializing, ignoring toggle change for ${featureType}.`);
            return;
        }

        const effectiveSettingsForSession = this._getEffectiveSettingsForSession(sessionId);
        this.sessionManager.updateSessionInfo(sessionId, {
            currentSettings: { ...effectiveSettingsForSession },
            currentControlMethod: effectiveSettingsForSession.control_input_method,
        });

        if (newToggleValue === true) { 
            let shouldStartFeature = (oldToggleValueInSession === false || oldToggleValueInSession === undefined);
            
            if (shouldStartFeature) {
                switch (featureType) {
                    case 'timer': if (currentState === MyAppState.TIMER_RUNNING || currentState === MyAppState.TIMER_PAUSED || currentState === MyAppState.TIMER_READY) shouldStartFeature = false; break;
                    case 'stopwatch': if (currentState === MyAppState.STOPWATCH_RUNNING || currentState === MyAppState.STOPWATCH_PAUSED || currentState === MyAppState.STOPWATCH_READY) shouldStartFeature = false; break;
                    case 'pomodoro': if (currentState === MyAppState.POMODORO_IDLE || currentState === MyAppState.POMODORO_WORK_RUNNING || currentState === MyAppState.POMODORO_BREAK_RUNNING || currentState === MyAppState.POMODORO_PAUSED) shouldStartFeature = false; break;
                }
            } else {
                 console.log(`[AdvancedTimerApp] Toggle for ${featureType} was already considered ON in session or feature already active.`);
            }


            if (shouldStartFeature) {
                console.log(`[AdvancedTimerApp] Activating ${featureType} for session ${sessionId} via setting.`);
                this._stopPreviousModeDataListeners(sessionId, currentState); 

                if (featureType !== 'timer' && (currentState === MyAppState.TIMER_RUNNING || currentState === MyAppState.TIMER_PAUSED || currentState === MyAppState.TIMER_READY || currentState === MyAppState.CONFIGURING_TIMER)) {
                    await this.timerLogic.stopTimer(session, sessionId, `Timer stopped to start ${featureType}.`);
                }
                if (featureType !== 'stopwatch' && (currentState === MyAppState.STOPWATCH_RUNNING || currentState === MyAppState.STOPWATCH_PAUSED || currentState === MyAppState.STOPWATCH_STOPPED || currentState === MyAppState.STOPWATCH_READY || currentState === MyAppState.STOPWATCH_AUTOLAP_COMPLETED)) {
                    await this.stopwatchLogic.stopStopwatch(session, sessionId, `Stopwatch stopped to start ${featureType}.`);
                }
                if (featureType !== 'pomodoro' && (currentState === MyAppState.POMODORO_IDLE || currentState === MyAppState.POMODORO_WORK_RUNNING || currentState === MyAppState.POMODORO_BREAK_RUNNING || currentState === MyAppState.POMODORO_PAUSED || currentState === MyAppState.POMODORO_PENDING_CONFIRMATION || currentState === MyAppState.POMODORO_CYCLE_ENDED)) {
                    await this.pomodoroLogic.stopPomodoroCycle(session, sessionId, `Pomodoro stopped to start ${featureType}.`);
                }
                await new Promise(resolve => setTimeout(resolve, 150)); // Geef tijd voor state updates

                if (featureType === 'timer') this.settingsManager.listenToTimerDataSettings(session, sessionId);
                else if (featureType === 'stopwatch') this.settingsManager.listenToStopwatchDataSettings(session, sessionId);
                else if (featureType === 'pomodoro') this.settingsManager.listenToPomodoroDataSettings(session, sessionId);
                
                if (featureType === 'timer') this.timerLogic.startTimerWithDefaultDuration(session, sessionId);
                else if (featureType === 'stopwatch') {
                    this.stopwatchLogic.reset(session, sessionId);
                    await new Promise(resolve => setTimeout(resolve, 100));
                    this.stopwatchLogic.start(session, sessionId);
                    this.refreshCurrentUI(session, sessionId);
                } else if (featureType === 'pomodoro') this.pomodoroLogic.startCycle(session, sessionId);
            } else { 
                 console.log(`[AdvancedTimerApp] ${featureType} activation toggle is ON, but conditions to start feature not met (was already ON or feature active).`);
            }
        } else { 
            let shouldStopFeature = (oldToggleValueInSession === true);
            
            if (shouldStopFeature) {
                let isFeatureCurrentlyActive = false;
                switch (featureType) {
                    case 'timer': isFeatureCurrentlyActive = (currentState === MyAppState.TIMER_RUNNING || currentState === MyAppState.TIMER_PAUSED || currentState === MyAppState.TIMER_READY || currentState === MyAppState.CONFIGURING_TIMER); break;
                    case 'stopwatch': isFeatureCurrentlyActive = (currentState === MyAppState.STOPWATCH_RUNNING || currentState === MyAppState.STOPWATCH_PAUSED || currentState === MyAppState.STOPWATCH_STOPPED || currentState === MyAppState.STOPWATCH_READY || currentState === MyAppState.STOPWATCH_AUTOLAP_COMPLETED); break;
                    case 'pomodoro': isFeatureCurrentlyActive = (currentState === MyAppState.POMODORO_IDLE || currentState === MyAppState.POMODORO_WORK_RUNNING || currentState === MyAppState.POMODORO_BREAK_RUNNING || currentState === MyAppState.POMODORO_PAUSED || currentState === MyAppState.POMODORO_PENDING_CONFIRMATION || currentState === MyAppState.POMODORO_CYCLE_ENDED); break;
                }
                if (!isFeatureCurrentlyActive) {
                    shouldStopFeature = false;
                    console.log(`[AdvancedTimerApp] ${featureType} deactivation toggle OFF, but this feature was not the one active. No state change by this toggle.`);
                }
            }


            if (shouldStopFeature) {
                console.log(`[AdvancedTimerApp] Deactivating ${featureType} for session ${sessionId} via setting.`);
                if (featureType === 'timer') {
                    await this.timerLogic.stopTimer(session, sessionId, "Timer deactivated via settings.");
                } else if (featureType === 'stopwatch') {
                    await this.stopwatchLogic.stopStopwatch(session, sessionId, "Stopwatch deactivated via settings.");
                    this.refreshCurrentUI(session, sessionId);
                } else if (featureType === 'pomodoro') {
                    await this.pomodoroLogic.stopPomodoroCycle(session, sessionId, "Pomodoro deactivated via settings.");
                }
            } else { 
                 console.log(`[AdvancedTimerApp] ${featureType} deactivation toggle OFF, but conditions to stop feature not met (was already OFF or feature not relevantly active).`);
            }
        }
    }

    private handlePomodoroDurationChange(
        _appSettingsKey: keyof AppSettings,
        newDurationSeconds: number,
        toastLabelPrefix: string,
        session: AppSession,
        sessionId: string
    ) {
        const currentSessionInfo = this.sessionManager.getSessionInfo(sessionId);
        if (!currentSessionInfo) return;

        if (this.sessionManager.getState(sessionId) === MyAppState.POMODORO_IDLE) {
            this.refreshCurrentUI(session, sessionId);
        }
    }
    
    private applyStartupMode(session: AppSession, sessionId: string): void {
        const sessionInfo = this.sessionManager.getSessionInfo(sessionId);
        if (!sessionInfo || !sessionInfo.currentSettings) { /* ... */ return; }

        const previousState = this.sessionManager.getState(sessionId);
        this._stopPreviousModeDataListeners(sessionId, previousState); 

        const startupMode = sessionInfo.currentSettings.startup_mode;
        console.log(`[AdvancedTimerApp] Session ${sessionId} - Applying startup mode: '${startupMode}'`);

        switch(startupMode) {
            case 'stopwatch':
                this.settingsManager.listenToStopwatchDataSettings(session, sessionId);
                this.stopwatchLogic.reset(session, sessionId);
                break;
            case 'timer':
                this.settingsManager.listenToTimerDataSettings(session, sessionId);
                this.timerLogic.requestConfiguration(session, sessionId);
                break;
            case 'pomodoro':
                this.settingsManager.listenToPomodoroDataSettings(session, sessionId);
                this.pomodoroLogic.initializeAndShowIdleScreen(session, sessionId);
                break;
            case 'menu':
            default:
                this.sessionManager.setState(sessionId, MyAppState.SELECTING_MODE);
                this.uiManager.showModeSelection(session, sessionId);
                break;
        }
    }

    private refreshCurrentUI(session: AppSession, sessionId: string): void {
        const currentState = this.sessionManager.getState(sessionId);
        const sessionInfo = this.sessionManager.getSessionInfo(sessionId);
        if (!sessionInfo || !sessionInfo.isConnected) {
            console.warn(`[AdvancedTimerApp] refreshCurrentUI: Session ${sessionId} not found or not connected.`);
            return;
        }

        const stateName = currentState !== undefined ? MyAppState[currentState] : 'UNDEFINED_STATE';
        console.log(`[AdvancedTimerApp] Refreshing UI for session ${sessionId}, state: ${stateName}`);

        if (!sessionInfo.currentSettings) {
            console.error(`[AdvancedTimerApp] refreshCurrentUI: currentSettings missing in sessionInfo for session ${sessionId}. Cannot refresh UI properly.`);
            this.uiManager.showToast(session, sessionId, "Error: UI cannot be refreshed due to missing settings.");
            this.sessionManager.setState(sessionId, MyAppState.SELECTING_MODE);
            this.uiManager.showModeSelection(session, sessionId);
            return;
        }

        switch (currentState) {
            case MyAppState.APP_INITIALIZING:
                
                break;
            case MyAppState.SELECTING_MODE:
            case MyAppState.IDLE:
                this.uiManager.showModeSelection(session, sessionId);
                break;
            case MyAppState.STOPWATCH_READY:
            case MyAppState.STOPWATCH_RUNNING:
            case MyAppState.STOPWATCH_PAUSED:
            case MyAppState.STOPWATCH_STOPPED:
            case MyAppState.STOPWATCH_AUTOLAP_COMPLETED:
                this.stopwatchUi.displayInterface(session, sessionId, sessionInfo, currentState as any);
                break;
            case MyAppState.CONFIGURING_TIMER:
                 this.timerUi.showConfigurationScreen(session, sessionId, sessionInfo);
                 break;
            case MyAppState.TIMER_READY:
            case MyAppState.TIMER_PAUSED:
            case MyAppState.TIMER_RUNNING:
                this.timerUi.displayInterface(session, sessionId, sessionInfo, currentState as any);
                break;
            case MyAppState.TIMER_FINISHED:
                this.timerUi.showFinishedScreen(session, sessionId, sessionInfo);
                break;
            case MyAppState.POMODORO_IDLE:
            case MyAppState.POMODORO_WORK_RUNNING:
            case MyAppState.POMODORO_BREAK_RUNNING:
            case MyAppState.POMODORO_PAUSED:
            case MyAppState.POMODORO_PENDING_CONFIRMATION:
            case MyAppState.POMODORO_CYCLE_ENDED:
                this.pomodoroUi.displayInterface(session, sessionId, sessionInfo, currentState as any);
                break;
            default:
                console.warn(`[AdvancedTimerApp] refreshCurrentUI: Unhandled state ${stateName}. Defaulting to mode selection.`);
                this.uiManager.showModeSelection(session, sessionId);
                break;
        }
    }

    private clearAllTimersForSession(sessionId: string): void {
        const existingTimeout = this.initializationTimeouts.get(sessionId);
        if (existingTimeout) clearTimeout(existingTimeout);
        this.initializationTimeouts.delete(sessionId);

        this.timerLogic.clearAllIntervals(sessionId);
        this.stopwatchLogic.clearAllIntervals(sessionId);
        this.pomodoroLogic.clearAllIntervals(sessionId);
        console.log(`[AdvancedTimerApp] All feature timers/intervals cleared for session ${sessionId}.`);
    }

    public stop(): void {
        console.log('[AdvancedTimerApp] stop() called. Clearing all session timers and listeners before shutting down server.');
        this.sessionManager.getAllSessionIds().forEach(sessionId => {
            this.clearAllTimersForSession(sessionId);
            const unsubscribe = this.settingsRefreshedUnsubscribeMap.get(sessionId);
            if (unsubscribe) {
                unsubscribe();
                this.settingsRefreshedUnsubscribeMap.delete(sessionId);
            }
            this._stopPreviousModeDataListeners(sessionId, this.sessionManager.getState(sessionId));
            this.settingsManager.stopListeningToAlwaysOnSettings(sessionId); 
            this.settingsManager.removeSessionSettings(sessionId); 
            this.sessionManager.removeSession(sessionId); 
        });
        super.stop();
    }
}