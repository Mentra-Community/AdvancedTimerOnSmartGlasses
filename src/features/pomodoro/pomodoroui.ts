import { AppSession, ViewType } from '@mentra/sdk';
import { MyAppState } from '../../session/appstate';
import { MySessionInfo } from '../../session/sessioninfo';
import { formatTime } from '../../utils/timeformatter';
import { SettingsManager, AppSettings, ShowHintsLevel } from '../../core/settingsmanager';
import { UIManager } from '../../core/uimanager';
import { TRIGGER_PHRASE } from '../../core/constants';

export class PomodoroUi {
    constructor(
        private settingsManager: SettingsManager,
        private uiManager: UIManager
    ) {
        console.log('[PomodoroUi] Initialized');
    }

    private getPomodoroStatusAndCycleText(
        sessionInfo: MySessionInfo,
        appState: MyAppState
    ): string {
        if (!sessionInfo.currentSettings) {
            console.warn("[PomodoroUi] currentSettings missing in sessionInfo for getPomodoroStatusAndCycleText.");
            return "Status Error";
        }
        const currentSettings = sessionInfo.currentSettings;
        const intervalsTotal = currentSettings.pomodoro_intervals_before_long_break;
        const pomodorosDone = sessionInfo.pomodorosCompletedInCycle ?? 0;

        switch (appState) {
            case MyAppState.POMODORO_IDLE:
                return 'Ready';
            case MyAppState.POMODORO_WORK_RUNNING:
                return `Work (${pomodorosDone + 1}/${intervalsTotal})`;
            case MyAppState.POMODORO_BREAK_RUNNING:
                const phaseText = sessionInfo.pomodoroCurrentPhase === 'SHORT_BREAK' ? 'Short Break' : 'Long Break';
                let cycleProgress = `${pomodorosDone}/${intervalsTotal} done`;
                if (sessionInfo.pomodoroCurrentPhase === 'LONG_BREAK') {
                    cycleProgress = `(${intervalsTotal}/${intervalsTotal} done)`;
                }
                return `${phaseText} ${cycleProgress}`;
            case MyAppState.POMODORO_PAUSED:
                let pausedText = "Paused";
                if (sessionInfo.pomodoroCurrentPhase === 'WORK') {
                    pausedText = `Work Paused (${pomodorosDone + 1}/${intervalsTotal})`;
                } else {
                    const pausedPhaseText = sessionInfo.pomodoroCurrentPhase === 'SHORT_BREAK' ? 'Short Break' : 'Long Break';
                    let pausedCycleProgress = `${pomodorosDone}/${intervalsTotal} done`;
                    if (sessionInfo.pomodoroCurrentPhase === 'LONG_BREAK') {
                        pausedCycleProgress = `(${intervalsTotal}/${intervalsTotal} done)`;
                    }
                    pausedText = `${pausedPhaseText} Paused ${pausedCycleProgress}`;
                }
                return pausedText;
            case MyAppState.POMODORO_PENDING_CONFIRMATION:
                const prevPhase = sessionInfo.pomodoroCurrentPhase;
                if (prevPhase === 'WORK') return `Work Finished (${pomodorosDone}/${intervalsTotal})`;
                if (prevPhase === 'SHORT_BREAK') return `Short Break Finished (${pomodorosDone}/${intervalsTotal} work done)`;
                if (prevPhase === 'LONG_BREAK') return `Long Break Finished`;
                return 'Phase Finished!';
            case MyAppState.POMODORO_CYCLE_ENDED:
                return 'Cycle Complete!';
            default:
                return 'Pomodoro'; 
        }
    }

    public displayInterface(
        session: AppSession,
        sessionId: string,
        sessionInfo: MySessionInfo,
        appState: MyAppState
    ): void {
        if (!sessionInfo || !sessionInfo.isConnected || !sessionInfo.currentSettings) {
            console.warn(`[PomodoroUi] displayInterface: Session ${sessionId} not connected or currentSettings missing.`);
            return;
        }

        const currentSettings = sessionInfo.currentSettings;
        const useTriggerWord = currentSettings.use_trigger_word_setting;
        const showHintsLevel = currentSettings.show_hints_level as ShowHintsLevel;
        let commandPrefix = "";
        if (useTriggerWord && sessionInfo.currentControlMethod === 'voice') {
            commandPrefix = `${TRIGGER_PHRASE}, `;
        }

        const statusAndCycleText = this.getPomodoroStatusAndCycleText(sessionInfo, appState);
        const title = `Pomodoro - ${statusAndCycleText}`;

        let timeToDisplay = formatTime(sessionInfo.pomodoroRemainingSeconds ?? 0);
        let contextLine = "";
        let voiceCommandHint = "";

        // Determine phase title (Work/Short Break/Long Break)
        let phaseTitle = "";
        let stateText = "";
        let contextText = "";
        let phaseStatus = "";
        switch (appState) {
            case MyAppState.POMODORO_WORK_RUNNING:
                phaseTitle = "Work";
                phaseStatus = "Running";
                break;
            case MyAppState.POMODORO_BREAK_RUNNING:
                phaseTitle = sessionInfo.pomodoroCurrentPhase === 'LONG_BREAK' ? "Long Break" : "Short Break";
                phaseStatus = "Running";
                break;
            case MyAppState.POMODORO_PAUSED:
                if (sessionInfo.pomodoroCurrentPhase === 'WORK') {
                    phaseTitle = "Work";
                } else if (sessionInfo.pomodoroCurrentPhase === 'SHORT_BREAK') {
                    phaseTitle = "Short Break";
                } else if (sessionInfo.pomodoroCurrentPhase === 'LONG_BREAK') {
                    phaseTitle = "Long Break";
                }
                phaseStatus = "Paused";
                break;
            case MyAppState.POMODORO_PENDING_CONFIRMATION:
                phaseTitle = "Work";
                break;
            case MyAppState.POMODORO_IDLE:
            case MyAppState.POMODORO_CYCLE_ENDED:
            default:
                phaseTitle = "";
                phaseStatus = "";
                break;
        }
        // State is the cycle progress (e.g., (1/4))
        const intervalsTotal = currentSettings.pomodoro_intervals_before_long_break;
        const pomodorosDone = sessionInfo.pomodorosCompletedInCycle ?? 0;
        if (phaseTitle) {
            if (phaseTitle === "Work") {
                stateText = `(${pomodorosDone + 1}/${intervalsTotal})`;
            } else if (phaseTitle === "Short Break" || phaseTitle === "Long Break") {
                stateText = `(${pomodorosDone}/${intervalsTotal})`;
            }
        }
        let bodyText = timeToDisplay;

        // Set voiceCommandHint as in the old example, but only show if show_hints_level is 'show_all'
        if (sessionInfo.currentControlMethod === 'voice') {
            switch (appState) {
                case MyAppState.POMODORO_IDLE:
                    bodyText = formatTime(currentSettings.pomodoro_work_duration_seconds);
                    contextText = `Work: ${formatTime(currentSettings.pomodoro_work_duration_seconds)}, Short Break: ${formatTime(currentSettings.pomodoro_short_break_duration_seconds)}, Long Break: ${formatTime(currentSettings.pomodoro_long_break_duration_seconds)}`;
                    voiceCommandHint = `Say '${commandPrefix}Start' or '${commandPrefix}Menu'`;
                    break;
                case MyAppState.POMODORO_WORK_RUNNING:
                    voiceCommandHint = `Say '${commandPrefix}Pause', '${commandPrefix}Skip to Break' or '${commandPrefix}Stop Pomodoro'`;
                    break;
                case MyAppState.POMODORO_BREAK_RUNNING:
                    voiceCommandHint = `Say '${commandPrefix}Pause', '${commandPrefix}Skip to Work' or '${commandPrefix}Stop Pomodoro'`;
                    if (sessionInfo.pomodoroCurrentPhase === 'LONG_BREAK') {
                        voiceCommandHint = `Say '${commandPrefix}Pause', '${commandPrefix}Skip to New Cycle' or '${commandPrefix}Stop Pomodoro'`;
                    }
                    break;
                case MyAppState.POMODORO_PAUSED:
                    if (sessionInfo.pomodoroCurrentPhase === 'WORK') {
                        voiceCommandHint = `Say '${commandPrefix}Resume', '${commandPrefix}Skip to Break' or '${commandPrefix}Stop Pomodoro'`;
                    } else {
                        voiceCommandHint = `Say '${commandPrefix}Resume', '${commandPrefix}Skip to Work' or '${commandPrefix}Stop Pomodoro'`;
                        if (sessionInfo.pomodoroCurrentPhase === 'LONG_BREAK') {
                            voiceCommandHint = `Say '${commandPrefix}Resume', '${commandPrefix}Skip to New Cycle' or '${commandPrefix}Stop Pomodoro'`;
                        }
                    }
                    break;
                case MyAppState.POMODORO_PENDING_CONFIRMATION:
                    const nextPhaseDisplay = sessionInfo.pomodoroNextPhase?.replace('_', ' ') || "next phase";
                    bodyText = `${stateText}`;
                    contextText = `Start ${nextPhaseDisplay}?`;
                    voiceCommandHint = `Say '${commandPrefix}Proceed' or '${commandPrefix}Stop Pomodoro'`;
                    break;
                case MyAppState.POMODORO_CYCLE_ENDED:
                    bodyText = `All ${intervalsTotal} Pomodoros done.`;
                    contextText = `Great job!`;
                    voiceCommandHint = `Say '${commandPrefix}Start New Cycle' or '${commandPrefix}Menu'`;
                    break;
                default:
                    voiceCommandHint = `Say '${commandPrefix}Menu' to return.`;
                    break;
            }
        } else if (sessionInfo.currentControlMethod === 'app_external') {
            voiceCommandHint = 'App Control Active';
        }

        // Apply show_hints_level logic
        if (sessionInfo.currentControlMethod === 'voice') {
            switch (showHintsLevel) {
                case 'hide_hints_only':
                    voiceCommandHint = "";
                    break;
                case 'hide_hints_context':
                    phaseTitle = "";
                    voiceCommandHint = "";
                    break;
                case 'hide_all_details':
                    phaseTitle = "";
                    stateText = "";
                    voiceCommandHint = "";
                    break;
                case 'show_all':
                default:
                    break;
            }
        }

        // Compose display text based on detail level
        let displayText = "";
        if (phaseTitle) {
            displayText += phaseTitle;
            if (phaseStatus) {
                displayText += ` - ${phaseStatus}`;
            }
            displayText += "\n";
        }
        if (bodyText) displayText += `${bodyText}\n`;
        if (stateText) displayText += `${stateText}\n`;
        if (voiceCommandHint) displayText += `\n${voiceCommandHint}`;

        try {
            session.layouts.showTextWall(displayText.trim(), { view: ViewType.MAIN });
        } catch (e) {
            console.error(`Session ${sessionId}: Error calling showTextWall for Pomodoro UI (state ${MyAppState[appState]}):`, e);
        }
    }
}
