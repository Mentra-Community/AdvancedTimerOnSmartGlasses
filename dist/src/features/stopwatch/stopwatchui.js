// src/features/stopwatch/stopwatchui.ts
import { ViewType } from '@mentra/sdk';
import { MyAppState } from '../../session/appstate';
import { formatTime } from '../../utils/timeformatter';
import { TRIGGER_PHRASE, MAX_LAP_TIMES } from '../../core/constants';
export class StopwatchUi {
    settingsManager;
    uiManager;
    constructor(settingsManager, uiManager) {
        this.settingsManager = settingsManager;
        this.uiManager = uiManager;
        console.log('[StopwatchUi] Initialized');
    }
    getStatusTextForTitle(state) {
        switch (state) {
            case MyAppState.STOPWATCH_RUNNING: return 'Running';
            case MyAppState.STOPWATCH_PAUSED: return 'Paused';
            case MyAppState.STOPWATCH_READY: return 'Ready';
            case MyAppState.STOPWATCH_STOPPED: return 'Stopped';
            case MyAppState.STOPWATCH_AUTOLAP_COMPLETED: return 'Max Auto-Laps Done';
            default: return 'Stopwatch';
        }
    }
    displayInterface(session, sessionId, sessionInfo, state) {
        if (!sessionInfo.isConnected || !sessionInfo.currentSettings) {
            console.warn(`[StopwatchUi] Session ${sessionId} not connected or currentSettings missing. Skipping UI update.`);
            return;
        }
        const currentSettings = sessionInfo.currentSettings;
        const useTriggerWord = currentSettings.use_trigger_word_setting;
        const showHintsLevel = currentSettings.show_hints_level;
        let commandPrefix = "";
        if (useTriggerWord && sessionInfo.currentControlMethod === 'voice') {
            commandPrefix = `${TRIGGER_PHRASE}, `;
        }
        const statusForTitle = this.getStatusTextForTitle(state);
        let title = `Stopwatch - ${statusForTitle}`;
        const totalTimeDisplay = formatTime(sessionInfo.elapsedSeconds ?? 0);
        let currentLapTimeDisplay = "[--:--]";
        const currentLapRaw = sessionInfo.elapsedSeconds - (sessionInfo.currentLapStartTime ?? 0);
        if ((state === MyAppState.STOPWATCH_RUNNING || state === MyAppState.STOPWATCH_PAUSED) && currentLapRaw >= 0) {
            currentLapTimeDisplay = `[${formatTime(currentLapRaw)}]`;
        }
        else if (state === MyAppState.STOPWATCH_READY || state === MyAppState.STOPWATCH_STOPPED || state === MyAppState.STOPWATCH_AUTOLAP_COMPLETED) {
            currentLapTimeDisplay = "[00:00]";
        }
        let roundsPrefix = "Rounds: ";
        const autoLapEnabled = currentSettings.stopwatch_auto_lap_enabled;
        const maxAutoLaps = currentSettings.stopwatch_max_auto_lap_intervals;
        if (autoLapEnabled &&
            (state === MyAppState.STOPWATCH_RUNNING ||
                state === MyAppState.STOPWATCH_PAUSED ||
                state === MyAppState.STOPWATCH_STOPPED ||
                state === MyAppState.STOPWATCH_AUTOLAP_COMPLETED)) {
            const maxLapsDisplay = (maxAutoLaps >= 99) ? "(Unlimited)" : `(Max: ${maxAutoLaps})`;
            roundsPrefix = `Auto-Rounds ${maxLapsDisplay}: `;
        }
        let roundsText = roundsPrefix;
        const lapTimesToDisplay = sessionInfo.lapTimes || [];
        if (lapTimesToDisplay.length > 0) {
            let lapDetails = "";
            const totalLapsRecorded = sessionInfo.totalLapsRecorded ?? 0;
            lapTimesToDisplay.slice(0, MAX_LAP_TIMES).forEach((lapTime, index) => {
                const lapNumber = totalLapsRecorded - index;
                if (lapNumber > 0) {
                    lapDetails += `L${lapNumber}: ${formatTime(lapTime)} `;
                }
            });
            roundsText += lapDetails.trim() || "(none recorded)";
        }
        else {
            roundsText += "(none recorded)";
        }
        let voiceCommandHint = "";
        let contextText = roundsText;
        let stateText = statusForTitle;
        let bodyText = `${totalTimeDisplay} | ${currentLapTimeDisplay}`;
        if (sessionInfo.currentControlMethod === 'voice') {
            switch (showHintsLevel) {
                case 'hide_hints_only':
                    break;
                case 'hide_hints_context':
                    stateText = "";
                    break;
                case 'hide_all_details':
                    contextText = "";
                    stateText = "";
                    break;
                case 'show_all':
                default:
                    break;
            }
        }
        if (sessionInfo.currentControlMethod === 'voice') {
            switch (state) {
                case MyAppState.STOPWATCH_RUNNING:
                    let setCommandHint = !autoLapEnabled ? `, '${commandPrefix}Set'` : "";
                    voiceCommandHint = `Say '${commandPrefix}Pause'${setCommandHint}, '${commandPrefix}Reset', '${commandPrefix}Stop' or '${commandPrefix}Menu'`;
                    break;
                case MyAppState.STOPWATCH_PAUSED:
                    voiceCommandHint = `Say '${commandPrefix}Resume', '${commandPrefix}Reset', '${commandPrefix}Stop' or '${commandPrefix}Menu'`;
                    break;
                case MyAppState.STOPWATCH_READY:
                    voiceCommandHint = `Say '${commandPrefix}Start' or '${commandPrefix}Menu'`;
                    break;
                case MyAppState.STOPWATCH_STOPPED:
                    voiceCommandHint = `Say '${commandPrefix}Start' (new), '${commandPrefix}Reset' or '${commandPrefix}Menu'`;
                    break;
                case MyAppState.STOPWATCH_AUTOLAP_COMPLETED:
                    voiceCommandHint = `Say '${commandPrefix}Restart', '${commandPrefix}Reset' or '${commandPrefix}Menu'`;
                    break;
            }
        }
        else if (sessionInfo.currentControlMethod === 'app_external') {
            voiceCommandHint = 'App Control Active';
        }
        if (sessionInfo.currentControlMethod === 'voice') {
            switch (showHintsLevel) {
                case 'hide_hints_only':
                    voiceCommandHint = "";
                    break;
                case 'hide_hints_context':
                    voiceCommandHint = "";
                    stateText = "";
                    break;
                case 'hide_all_details':
                    voiceCommandHint = "";
                    contextText = "";
                    stateText = "";
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
        let displayText = "";
        if (stateText)
            displayText += `${stateText}\n`;
        if (bodyText)
            displayText += `${bodyText}\n`;
        if (contextText)
            displayText += `${contextText}\n`;
        if (voiceCommandHint)
            displayText += `\n${voiceCommandHint}`;
        try {
            session.layouts.showTextWall(displayText.trim(), { view: ViewType.MAIN });
        }
        catch (e) {
            console.error(`Session ${sessionId}: Error calling showTextWall for Stopwatch UI (state ${MyAppState[state]}):`, e);
        }
    }
    displayScore(session, sessionId, sessionInfo) {
        if (!sessionInfo.isConnected || !sessionInfo.currentSettings) {
            console.warn(`[StopwatchUi] displayScore: Session ${sessionId} not connected or settings missing. Aborting.`);
            return;
        }
        let bestLapText = "";
        const lapTimes = sessionInfo.lapTimes || [];
        if (lapTimes.length > 0) {
            const validLaps = lapTimes.filter(lap => typeof lap === 'number' && lap > 0);
            if (validLaps.length > 0) {
                const bestLap = Math.min(...validLaps);
                bestLapText = `\nBest Round: ${formatTime(bestLap)}`;
            }
        }
        let scorePrompt = "";
        const showHintsLevel = sessionInfo.currentSettings.show_hints_level;
        const useTriggerWord = sessionInfo.currentSettings.use_trigger_word_setting;
        if (sessionInfo.currentControlMethod === 'voice') {
            switch (showHintsLevel) {
                case 'hide_hints_only':
                case 'hide_hints_context':
                case 'hide_all_details':
                    scorePrompt = "";
                    break;
                case 'show_all':
                default:
                    let commandPrefix = useTriggerWord ? `${TRIGGER_PHRASE}, ` : "";
                    scorePrompt = `Say '${commandPrefix}Okay' or '${commandPrefix}Menu'.`;
                    break;
            }
        }
        else if (sessionInfo.currentControlMethod === 'app_external') {
            scorePrompt = 'App Control Active';
        }
        const scoreText = `Stopwatch Finished\nTotal Time: ${formatTime(sessionInfo.elapsedSeconds ?? 0)}${bestLapText}${scorePrompt ? '\n\n' + scorePrompt : ''}`;
        try {
            session.layouts.showTextWall(scoreText.trim(), { view: ViewType.MAIN, durationMs: 0 });
        }
        catch (e) {
            console.error(`[StopwatchUi] displayScore: Error calling showTextWall for stopwatch score for session ${sessionId}:`, e);
        }
    }
}
