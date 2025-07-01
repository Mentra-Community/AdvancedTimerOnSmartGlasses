import fs from 'fs';
import path from 'path';
import { parseMMSS } from '../utils/timeformatter';
export const ALWAYS_ON_SETTING_KEYS = [
    'startup_mode',
    'control_input_method',
    'use_trigger_word_setting',
    'show_hints_level',
    'activate_timer_from_settings',
    'activate_stopwatch_from_settings',
    'activate_pomodoro_from_settings',
];
export const TIMER_DATA_SETTING_KEYS = [
    'default_timer_duration_mmss',
];
export const STOPWATCH_DATA_SETTING_KEYS = [
    'stopwatch_auto_lap_enabled',
    'stopwatch_auto_lap_interval_mmss',
    'stopwatch_max_auto_lap_intervals',
];
export const POMODORO_DATA_SETTING_KEYS = [
    'pomodoro_work_duration_minutes',
    'pomodoro_short_break_duration_minutes',
    'pomodoro_long_break_duration_minutes',
    'pomodoro_intervals_before_long_break',
    'pomodoro_auto_start_breaks',
    'pomodoro_auto_start_work',
];
const ALL_MANAGED_TPA_CONFIG_KEYS = Array.from(new Set([
    ...ALWAYS_ON_SETTING_KEYS,
    ...TIMER_DATA_SETTING_KEYS,
    ...STOPWATCH_DATA_SETTING_KEYS,
    ...POMODORO_DATA_SETTING_KEYS,
]));
export const fallbackDefaultAppSettings = {
    startup_mode: 'menu',
    default_timer_duration_seconds: 0,
    default_timer_duration_mmss: '00:00',
    control_input_method: 'voice',
    use_trigger_word_setting: false,
    show_hints_level: 'show_all',
    raw_stopwatch_auto_lap_interval_mmss: '01:00',
    activate_timer_from_settings: false,
    activate_stopwatch_from_settings: false,
    stopwatch_auto_lap_enabled: false,
    stopwatch_auto_lap_interval_seconds_processed: 60,
    stopwatch_max_auto_lap_intervals: 99,
    pomodoro_work_duration_seconds: 25 * 60,
    pomodoro_short_break_duration_seconds: 5 * 60,
    pomodoro_long_break_duration_seconds: 15 * 60,
    pomodoro_intervals_before_long_break: 4,
    pomodoro_auto_start_breaks: true,
    pomodoro_auto_start_work: true,
    activate_pomodoro_from_settings: false
};
export class SettingsManager {
    configDir;
    globalAppSettings;
    sessionSpecificAppSettings = new Map();
    configFilePath;
    settingsRefreshedListeners = new Map();
    sdkUnsubscribeCallbacks = new Map();
    constructor(configDir, initialFallbackDefaults) {
        this.configDir = configDir;
        this.configFilePath = path.join(this.configDir, 'tpa_config.json');
        this.globalAppSettings = { ...initialFallbackDefaults };
        console.log('[SettingsManager] Initialized. Fallback defaults set.');
    }
    parseSettingValue(value, expectedType) {
        if (expectedType === 'boolean')
            return Boolean(value);
        if (expectedType === 'number') {
            const num = Number(value);
            return isNaN(num) ? 0 : num;
        }
        return String(value);
    }
    loadGlobalSettings() {
        try {
            if (fs.existsSync(this.configFilePath)) {
                const fileContent = fs.readFileSync(this.configFilePath, 'utf8');
                const tpaConfigFile = JSON.parse(fileContent);
                const loadedFromFileSettings = { ...this.globalAppSettings };
                tpaConfigFile.settings.forEach(settingFromFile => {
                    this.updateSingleAppSetting(loadedFromFileSettings, settingFromFile.key, settingFromFile.defaultValue);
                });
                this.globalAppSettings = loadedFromFileSettings;
                console.log('[SettingsManager] Global settings loaded and merged from tpa_config.json:', this.globalAppSettings);
            }
            else {
                console.warn(`[SettingsManager] tpa_config.json not found at ${this.configFilePath}. Using initial fallback defaults for global settings.`);
            }
        }
        catch (e) {
            console.error('[SettingsManager] Could not load or parse tpa_config.json. Using initial fallback defaults for global settings. Error:', e);
        }
    }
    updateGlobalSettings(updates) {
        let changed = false;
        for (const key in updates) {
            if (Object.prototype.hasOwnProperty.call(this.globalAppSettings, key)) {
                const appSettingKey = key;
                if (this.globalAppSettings[appSettingKey] !== updates[appSettingKey]) {
                    this.globalAppSettings[appSettingKey] = updates[appSettingKey];
                    changed = true;
                }
            }
        }
        if (changed) {
            console.log('[SettingsManager] Global AppSettings updated programmatically:', this.globalAppSettings);
        }
        return changed;
    }
    updateSingleAppSetting(settingsObject, tpaConfigKey, value) {
        switch (tpaConfigKey) {
            case 'startup_mode':
                settingsObject.startup_mode = this.parseSettingValue(value, 'string');
                break;
            case 'control_input_method':
                settingsObject.control_input_method = this.parseSettingValue(value, 'string');
                break;
            case 'use_trigger_word_setting':
                settingsObject.use_trigger_word_setting = this.parseSettingValue(value, 'boolean');
                break;
            case 'show_hints_level':
                settingsObject.show_hints_level = this.parseSettingValue(value, 'string');
                break;
            case 'default_timer_duration_mmss':
                settingsObject.default_timer_duration_mmss = this.parseSettingValue(value, 'string');
                settingsObject.default_timer_duration_seconds = parseMMSS(settingsObject.default_timer_duration_mmss) || 0;
                break;
            case 'stopwatch_max_auto_lap_intervals':
                const maxLapsVal = parseInt(this.parseSettingValue(value, 'string'), 10);
                if (!isNaN(maxLapsVal) && maxLapsVal >= 1 && maxLapsVal <= 99) {
                    settingsObject.stopwatch_max_auto_lap_intervals = maxLapsVal;
                }
                else {
                    settingsObject.stopwatch_max_auto_lap_intervals = this.globalAppSettings.stopwatch_max_auto_lap_intervals;
                }
                break;
            case 'pomodoro_work_duration_minutes':
                const workMinutes = parseInt(this.parseSettingValue(value, 'string'), 10);
                settingsObject.pomodoro_work_duration_seconds = !isNaN(workMinutes) && workMinutes > 0 ? workMinutes * 60 : this.globalAppSettings.pomodoro_work_duration_seconds;
                break;
            case 'pomodoro_short_break_duration_minutes':
                const shortBreakMinutes = parseInt(this.parseSettingValue(value, 'string'), 10);
                settingsObject.pomodoro_short_break_duration_seconds = !isNaN(shortBreakMinutes) && shortBreakMinutes > 0 ? shortBreakMinutes * 60 : this.globalAppSettings.pomodoro_short_break_duration_seconds;
                break;
            case 'pomodoro_long_break_duration_minutes':
                const longBreakMinutes = parseInt(this.parseSettingValue(value, 'string'), 10);
                settingsObject.pomodoro_long_break_duration_seconds = !isNaN(longBreakMinutes) && longBreakMinutes > 0 ? longBreakMinutes * 60 : this.globalAppSettings.pomodoro_long_break_duration_seconds;
                break;
            case 'pomodoro_intervals_before_long_break':
                const intervals = parseInt(this.parseSettingValue(value, 'string'), 10);
                settingsObject.pomodoro_intervals_before_long_break = !isNaN(intervals) && intervals > 0 ? intervals : this.globalAppSettings.pomodoro_intervals_before_long_break;
                break;
            case 'pomodoro_auto_start_breaks':
                settingsObject.pomodoro_auto_start_breaks = this.parseSettingValue(value, 'boolean');
                break;
            case 'pomodoro_auto_start_work':
                settingsObject.pomodoro_auto_start_work = this.parseSettingValue(value, 'boolean');
                break;
            case 'activate_pomodoro_from_settings':
                settingsObject.activate_pomodoro_from_settings = this.parseSettingValue(value, 'boolean');
                break;
            case 'activate_timer_from_settings':
                settingsObject.activate_timer_from_settings = this.parseSettingValue(value, 'boolean');
                break;
            case 'stopwatch_auto_lap_enabled':
                settingsObject.stopwatch_auto_lap_enabled = this.parseSettingValue(value, 'boolean');
                break;
            case 'stopwatch_auto_lap_interval_mmss':
                settingsObject.raw_stopwatch_auto_lap_interval_mmss = this.parseSettingValue(value, 'string');
                settingsObject.stopwatch_auto_lap_interval_seconds_processed = parseMMSS(settingsObject.raw_stopwatch_auto_lap_interval_mmss) || this.globalAppSettings.stopwatch_auto_lap_interval_seconds_processed;
                break;
            case 'activate_stopwatch_from_settings':
                settingsObject.activate_stopwatch_from_settings = this.parseSettingValue(value, 'boolean');
                break;
        }
    }
    async initializeSessionSettings(session, sessionId) {
        let sessionSettingsInstance = this.sessionSpecificAppSettings.get(sessionId);
        if (!sessionSettingsInstance) {
            sessionSettingsInstance = { ...this.globalAppSettings };
            this.sessionSpecificAppSettings.set(sessionId, sessionSettingsInstance);
        }
        for (const tpaConfigKey of ALL_MANAGED_TPA_CONFIG_KEYS) {
            try {
                const settingValueFromGet = await session.getSetting(tpaConfigKey);
                console.log(`[SettingsManager] initializeSessionSettings for ${sessionId}, key '${tpaConfigKey}', received from getSetting:`, JSON.stringify(settingValueFromGet));
                if (typeof settingValueFromGet !== 'undefined') {
                    this.updateSingleAppSetting(sessionSettingsInstance, tpaConfigKey, settingValueFromGet);
                }
            }
            catch (error) {
                console.warn(`[SettingsManager] Session ${sessionId}: Error fetching initial SDK setting for ${tpaConfigKey}:`, error);
            }
        }
        console.log(`[SettingsManager] Initialized (fetched values only) for session ${sessionId}:`, sessionSettingsInstance);
        if (!this.sdkUnsubscribeCallbacks.has(sessionId)) {
            this.sdkUnsubscribeCallbacks.set(sessionId, new Map());
        }
    }
    _registerListeners(session, sessionId, settingKeys) {
        const sessionUnsubscribeMap = this.sdkUnsubscribeCallbacks.get(sessionId);
        if (!sessionUnsubscribeMap) {
            console.error(`[SettingsManager] _registerListeners: No unsubscribe map for session ${sessionId}. Cannot register listeners. Ensure initializeSessionSettings was called.`);
            return;
        }
        settingKeys.forEach(tpaConfigKey => {
            const existingUnsubscribe = sessionUnsubscribeMap.get(tpaConfigKey);
            if (existingUnsubscribe) {
                existingUnsubscribe();
                console.log(`[SettingsManager] Re-registering listener: Removed old listener for ${tpaConfigKey} in session ${sessionId}`);
            }
            const unsubscribe = session.events.onSettingChange(tpaConfigKey, (sdkProvidedValue) => {
                console.log(`[SettingsManager] onSettingChange for ${sessionId}, key '${tpaConfigKey}', sdkProvidedValue:`, JSON.stringify(sdkProvidedValue));
                let workingSessionSettings = this.sessionSpecificAppSettings.get(sessionId);
                if (!workingSessionSettings) {
                    console.warn(`[SettingsManager] onSettingChange: sessionSpecificAppSettings not found for ${sessionId} when event for '${tpaConfigKey}' was received. Using globalAppSettings as base.`);
                    workingSessionSettings = { ...this.globalAppSettings };
                }
                else {
                    workingSessionSettings = { ...workingSessionSettings };
                }
                let valueToProcess;
                valueToProcess = sdkProvidedValue;
                console.log(`[SettingsManager] Using direct value from callback:`, JSON.stringify(valueToProcess));
                if (typeof valueToProcess !== 'undefined') {
                    this.updateSingleAppSetting(workingSessionSettings, tpaConfigKey, valueToProcess);
                    this.sessionSpecificAppSettings.set(sessionId, workingSessionSettings);
                    console.log(`[SettingsManager DEBUG] Updated sessionSpecificAppSettings for ${sessionId} with key '${tpaConfigKey}', new value: ${valueToProcess}. Notifying listeners.`);
                    const listeners = this.settingsRefreshedListeners.get(sessionId);
                    if (listeners) {
                        listeners.forEach(listener => listener([tpaConfigKey]));
                    }
                }
                else {
                    console.warn(`[SettingsManager] onSettingChange for ${sessionId}, key '${tpaConfigKey}': valueToProcess is undefined.`);
                }
            });
            sessionUnsubscribeMap.set(tpaConfigKey, unsubscribe);
            console.log(`[SettingsManager] Listening to ${tpaConfigKey} for session ${sessionId}`);
        });
    }
    _unregisterListeners(sessionId, settingKeys) {
        const sessionUnsubscribeMap = this.sdkUnsubscribeCallbacks.get(sessionId);
        if (sessionUnsubscribeMap) {
            settingKeys.forEach(tpaConfigKey => {
                const unsubscribe = sessionUnsubscribeMap.get(tpaConfigKey);
                if (unsubscribe) {
                    unsubscribe();
                    sessionUnsubscribeMap.delete(tpaConfigKey);
                    console.log(`[SettingsManager] Stopped listening to ${tpaConfigKey} for session ${sessionId}`);
                }
            });
        }
    }
    listenToAlwaysOnSettings(session, sessionId) {
        this._registerListeners(session, sessionId, ALWAYS_ON_SETTING_KEYS);
    }
    stopListeningToAlwaysOnSettings(sessionId) {
        this._unregisterListeners(sessionId, ALWAYS_ON_SETTING_KEYS);
    }
    listenToTimerDataSettings(session, sessionId) {
        this._registerListeners(session, sessionId, TIMER_DATA_SETTING_KEYS);
    }
    stopListeningToTimerDataSettings(sessionId) {
        this._unregisterListeners(sessionId, TIMER_DATA_SETTING_KEYS);
    }
    listenToStopwatchDataSettings(session, sessionId) {
        this._registerListeners(session, sessionId, STOPWATCH_DATA_SETTING_KEYS);
    }
    stopListeningToStopwatchDataSettings(sessionId) {
        this._unregisterListeners(sessionId, STOPWATCH_DATA_SETTING_KEYS);
    }
    listenToPomodoroDataSettings(session, sessionId) {
        this._registerListeners(session, sessionId, POMODORO_DATA_SETTING_KEYS);
    }
    stopListeningToPomodoroDataSettings(sessionId) {
        this._unregisterListeners(sessionId, POMODORO_DATA_SETTING_KEYS);
    }
    getSetting(sessionId, key) {
        const sessionSettings = this.sessionSpecificAppSettings.get(sessionId);
        if (sessionSettings && typeof sessionSettings[key] !== 'undefined') {
            return sessionSettings[key];
        }
        return this.globalAppSettings[key];
    }
    getAllSettings() {
        return { ...this.globalAppSettings };
    }
    onSettingsRefreshed(sessionId, callback) {
        if (!this.settingsRefreshedListeners.has(sessionId)) {
            this.settingsRefreshedListeners.set(sessionId, []);
        }
        const listeners = this.settingsRefreshedListeners.get(sessionId);
        listeners.push(callback);
        return () => {
            const currentListeners = this.settingsRefreshedListeners.get(sessionId);
            if (currentListeners) {
                this.settingsRefreshedListeners.set(sessionId, currentListeners.filter(cb => cb !== callback));
            }
        };
    }
    removeSessionSettings(sessionId) {
        const sessionUnsubscribeMap = this.sdkUnsubscribeCallbacks.get(sessionId);
        if (sessionUnsubscribeMap) {
            sessionUnsubscribeMap.forEach(unsub => unsub());
        }
        this.sdkUnsubscribeCallbacks.delete(sessionId);
        this.sessionSpecificAppSettings.delete(sessionId);
        this.settingsRefreshedListeners.delete(sessionId);
        console.log(`[SettingsManager] Cleared settings, SDK listeners, and refresh listeners for session ${sessionId}`);
    }
}
