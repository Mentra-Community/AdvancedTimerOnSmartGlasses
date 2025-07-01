import { AppSettings } from '../core/settingsmanager';
import { fallbackDefaultAppSettings } from '../core/constants';

export interface MySessionInfo {
    sessionId: string;
    isConnected: boolean;
    currentControlMethod: 'voice' | 'app_internal' | 'app_external';

    // Timer specific
    timerDuration: number;
    remainingSeconds: number;
    timerInterval?: any;

    // Stopwatch specific
    elapsedSeconds: number;
    lapTimes: number[];
    stopwatchInterval?: any;
    currentLapStartTime: number;
    totalLapsRecorded?: number; 
    stopwatchAutoLapsRecorded?: number;
    stopwatchAutoLapsDoneThisRun?: number;
    nextAutoLapTime?: number; 
    stopwatch_auto_lap_enabled?: boolean;
    stopwatch_max_auto_lap_intervals?: number;

    // General Settings
    currentSettings: AppSettings;
    lastCommandProcessedTimestamp: number;

    // Pomodoro specific  
    pomodoroCurrentPhase?: 'WORK' | 'SHORT_BREAK' | 'LONG_BREAK' | 'NONE';
    pomodoroNextPhase?: 'WORK' | 'SHORT_BREAK' | 'LONG_BREAK';
    pomodoroRemainingSeconds?: number;
    pomodoroTargetDurationSeconds?: number;
    pomodorosCompletedInCycle?: number;
    pomodoroIsPaused?: boolean;
    pomodoroIntervalId?: any;
}

export const initialMySessionInfo: MySessionInfo = {
    sessionId: '',
    isConnected: false,
    currentControlMethod: fallbackDefaultAppSettings.control_input_method,
    timerDuration: fallbackDefaultAppSettings.default_timer_duration_seconds,
    remainingSeconds: fallbackDefaultAppSettings.default_timer_duration_seconds,
    timerInterval: undefined,
    elapsedSeconds: 0,
    lapTimes: [],
    totalLapsRecorded: 0,
    stopwatchInterval: undefined,
    stopwatchAutoLapsDoneThisRun: 0,
    currentSettings: fallbackDefaultAppSettings,
    lastCommandProcessedTimestamp: 0,
    currentLapStartTime: 0,
    
    // Initialize Pomodoro fields---
    pomodoroCurrentPhase: 'NONE',
    pomodoroNextPhase: undefined,
    pomodoroRemainingSeconds: 0,
    pomodoroTargetDurationSeconds: 0,
    pomodorosCompletedInCycle: 0,
    pomodoroIsPaused: false,
    pomodoroIntervalId: undefined,
};