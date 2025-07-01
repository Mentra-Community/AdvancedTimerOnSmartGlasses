// src/features/timer/timerui.ts
import { AppSession, ViewType } from '@mentra/sdk';
import { MyAppState } from '../../session/appstate';
import { MySessionInfo } from '../../session/sessioninfo';
import { formatTime, parseMMSS } from '../../utils/timeformatter';
import { SettingsManager, AppSettings, ShowHintsLevel } from '../../core/settingsmanager';
import { UIManager } from '../../core/uimanager';
import { TRIGGER_PHRASE, MAX_TIMER_DURATION_SECONDS } from '../../core/constants';

export class TimerUi {
        constructor(
                private settingsManager: SettingsManager,
                private uiManager: UIManager
                ) {
        console.log('[TimerUi] Initialized');
        }

     private getStatusTextForTitle(state: MyAppState): string {
        switch (state) {
                case MyAppState.CONFIGURING_TIMER: return 'Set Duration';
                case MyAppState.TIMER_READY: return 'Ready';
                case MyAppState.TIMER_RUNNING: return 'Running';
                case MyAppState.TIMER_PAUSED: return 'Paused';
                case MyAppState.TIMER_FINISHED: return 'Finished!';
                default: return 'Timer';
        }
    }

    public showConfigurationScreen(
        session: AppSession,
        sessionId: string,
        sessionInfo: MySessionInfo
    ): void {
        if (!sessionInfo.isConnected || !sessionInfo.currentSettings) {
            console.warn(`[TimerUi] showConfigurationScreen: Session ${sessionId} not connected or currentSettings missing.`);
            return;
        }

        const currentSettings = sessionInfo.currentSettings;
        const useTriggerWord = currentSettings.use_trigger_word_setting;
        const showHintsLevel = currentSettings.show_hints_level as ShowHintsLevel;
        let commandPrefix = "";
        if (useTriggerWord && sessionInfo.currentControlMethod === 'voice') {
            commandPrefix = `${TRIGGER_PHRASE}, `;
        }

        let title = `Timer - ${this.getStatusTextForTitle(MyAppState.CONFIGURING_TIMER)}`;
        let instructionText = `Enter duration (e.g., '${commandPrefix}5 minutes')`;
        let defaultDurationText = `or say '${commandPrefix}Start' to use default (${currentSettings.default_timer_duration_mmss}).`;
        let examples = `(Max ${MAX_TIMER_DURATION_SECONDS / 3600} hour).`;
        let voiceCommandHint = "";
        let stateText = this.getStatusTextForTitle(MyAppState.CONFIGURING_TIMER);
        let bodyText = defaultDurationText;

        if (sessionInfo.currentControlMethod === 'voice') {
            switch (showHintsLevel) {
                case 'hide_hints_only':
                    break;
                case 'hide_hints_context':
                    stateText = "";
                    break;
                case 'hide_all_details':
                    stateText = "";
                    voiceCommandHint = "";
                    break;
                case 'show_all':
                default:
                    voiceCommandHint = `Say e.g., '${commandPrefix}Set for 1 minute 30 seconds', '${commandPrefix}Start', or '${commandPrefix}Cancel'`;
                    break;
            }
        } else if (sessionInfo.currentControlMethod === 'app_external') {
            voiceCommandHint = 'App Control Active';
        }

        if (!stateText && bodyText) {
            stateText = bodyText;
            bodyText = "";
        }

        // Compose card text based on detail level
        let cardText = "";
        if (stateText) cardText += `${stateText}\n`;
        if (bodyText) cardText += `${bodyText}\n`;
        if (instructionText) cardText += `${instructionText}\n`;
        if (examples) cardText += `${examples}`;
        if (voiceCommandHint) cardText += `\n\n${voiceCommandHint}`;

        try {
            session.layouts.showReferenceCard(title, cardText.trim(), { view: ViewType.MAIN });
        } catch (e) {
            console.error(`Session ${sessionId}: Error calling showReferenceCard for timer configuration:`, e);
        }
    }

        public displayInterface(
                session: AppSession,
                sessionId: string,
                sessionInfo: MySessionInfo,
                state: MyAppState.TIMER_READY | MyAppState.TIMER_RUNNING | MyAppState.TIMER_PAUSED
        ): void {
        if (!sessionInfo.isConnected || !sessionInfo.currentSettings) {
            console.warn(`[TimerUi] displayInterface: Session ${sessionId} not connected or currentSettings missing.`);
            return;
        }

        const currentSettings = sessionInfo.currentSettings;
        const useTriggerWord = currentSettings.use_trigger_word_setting;
        const showHintsLevel = currentSettings.show_hints_level as ShowHintsLevel;
        let commandPrefix = "";
        if (useTriggerWord && sessionInfo.currentControlMethod === 'voice') {
            commandPrefix = `${TRIGGER_PHRASE}, `;
        }

        let statusForTitle = this.getStatusTextForTitle(state);
        let title = `Timer - ${statusForTitle}`;
        let timeToDisplay = formatTime(sessionInfo.remainingSeconds);
        let detailsText = "";
        let voiceCommandHint = "";
        let stateText = statusForTitle;
        let bodyText = timeToDisplay;

        // Timer-specific context/details logic
        if (sessionInfo.currentControlMethod === 'voice') {
            switch (state) {
                case MyAppState.TIMER_RUNNING:
                    detailsText = `(Set for ${formatTime(sessionInfo.timerDuration)})`;
                    voiceCommandHint = `Say '${commandPrefix}Pause', '${commandPrefix}Reset' or '${commandPrefix}Stop'`;
                    break;
                case MyAppState.TIMER_PAUSED:
                    detailsText = `(Set for ${formatTime(sessionInfo.timerDuration)})`;
                    voiceCommandHint = `Say '${commandPrefix}Resume', '${commandPrefix}Reset' or '${commandPrefix}Stop'`;
                    break;
                case MyAppState.TIMER_READY:
                    if (sessionInfo.timerDuration > 0) {
                        detailsText = `Set for ${formatTime(sessionInfo.timerDuration)}`;
                        voiceCommandHint = `Say '${commandPrefix}Start', '${commandPrefix}Configure', '${commandPrefix}Reset' or '${commandPrefix}Menu'`;
                    } else {
                        detailsText = "No duration set.";
                        voiceCommandHint = `Say '${commandPrefix}Configure' or '${commandPrefix}Menu'`;
                    }
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
                    stateText = "";
                    voiceCommandHint = "";
                    // detailsText remains visible
                    break;
                case 'hide_all_details':
                    stateText = "";
                    detailsText = "";
                    voiceCommandHint = "";
                    break;
                case 'show_all':
                default:
                    break;
            }
        }

        if (!stateText && bodyText) {
            stateText = bodyText;
            bodyText = "";
        }

        // Compose display text based on detail level
        let displayText = "";
        if (stateText) displayText += `${stateText}\n`;
        if (bodyText) displayText += `${bodyText}\n`;
        if (detailsText) displayText += `${detailsText}\n`;
        if (voiceCommandHint) displayText += `\n${voiceCommandHint}`;

        try {
            session.layouts.showTextWall(displayText.trim(), { view: ViewType.MAIN });
        } catch (e) {
            console.error(`Session ${sessionId}: Error calling showTextWall for Timer UI (state ${MyAppState[state]}):`, e);
        }
    }

        public showFinishedScreen(
                session: AppSession,
                sessionId: string,
                sessionInfo: MySessionInfo
        ): void {
                if (!sessionInfo.isConnected || !sessionInfo.currentSettings) {
            console.warn(`[TimerUi] showFinishedScreen: Session ${sessionId} not connected or currentSettings missing.`);
            return;
        }

        const currentSettings = sessionInfo.currentSettings;
        const useTriggerWord = currentSettings.use_trigger_word_setting;
        const showHintsLevel = currentSettings.show_hints_level as ShowHintsLevel;
        let commandPrefix = "";
        if (useTriggerWord && sessionInfo.currentControlMethod === 'voice') {
            commandPrefix = `${TRIGGER_PHRASE}, `;
        }

        let title = `Timer - ${this.getStatusTextForTitle(MyAppState.TIMER_FINISHED)}`;
        let mainMessage = "Time's Up!";
        let voiceCommandHint = "";
        let stateText = this.getStatusTextForTitle(MyAppState.TIMER_FINISHED);

        if (sessionInfo.currentControlMethod === 'voice') {
            switch (showHintsLevel) {
                case 'hide_hints_only':
                    voiceCommandHint = "";
                    break;
                case 'hide_hints_context':
                    stateText = "";
                    voiceCommandHint = "";
                    break;
                case 'hide_all_details':
                    stateText = "";
                    voiceCommandHint = "";
                    break;
                case 'show_all':
                default:
                    voiceCommandHint = `Say '${commandPrefix}Okay' or '${commandPrefix}Menu'`;
                    break;
            }
        } else if (sessionInfo.currentControlMethod === 'app_external') {
            voiceCommandHint = 'App Control Active';
        }

        if (!stateText && mainMessage) {
            stateText = mainMessage;
            mainMessage = "";
        }

        let finishedDisplayText = "";
        if (stateText) finishedDisplayText += `${stateText}\n`;
        if (mainMessage) finishedDisplayText += `${mainMessage}\n`;
        if (voiceCommandHint) finishedDisplayText += `\n${voiceCommandHint}`;

        try {
            session.layouts.showTextWall(finishedDisplayText.trim(), { view: ViewType.MAIN, durationMs: 0 });
        } catch (e) {
            console.error(`Session ${sessionId}: Error calling showTextWall for timer finished screen:`, e);
        }
    }
}
