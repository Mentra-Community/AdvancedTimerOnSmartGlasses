import fs from 'fs';
import path from 'path';
import { AppSetting as SdkSettingType, AppSession } from '@mentra/sdk'; 
import { parseMMSS } from '../utils/timeformatter';

export type ShowHintsLevel = 'show_all' | 'hide_hints_only' | 'hide_hints_context' | 'hide_all_details';

export interface AppSettings {
  startup_mode: 'menu' | 'stopwatch' | 'timer' | 'pomodoro';
  default_timer_duration_seconds: number;
  default_timer_duration_mmss: string;
  control_input_method: 'voice' | 'app_external';
  use_trigger_word_setting: boolean;
  show_hints_level: ShowHintsLevel;
  raw_stopwatch_auto_lap_interval_mmss: string;
  stopwatch_max_auto_lap_intervals: number;
  activate_timer_from_settings: boolean;
  activate_stopwatch_from_settings: boolean;
  stopwatch_auto_lap_enabled: boolean;
  stopwatch_auto_lap_interval_seconds_processed: number;
  pomodoro_work_duration_seconds: number;
  pomodoro_short_break_duration_seconds: number;
  pomodoro_long_break_duration_seconds: number;
  pomodoro_intervals_before_long_break: number;
  pomodoro_auto_start_breaks: boolean;
  pomodoro_auto_start_work: boolean;
  activate_pomodoro_from_settings: boolean;
}

interface TpaConfigFile {
  name?: string;
  description?: string;
  version?: string;
  settings: Array<{
    key: string;
    label?: string;
    type: string;
    options?: Array<{ label: string; value: string | number | boolean }>;
    defaultValue: string | number | boolean;
    description?: string;
  }>;
}

export const ALWAYS_ON_SETTING_KEYS: string[] = [ 
  'startup_mode',
  'control_input_method',
  'use_trigger_word_setting',
  'show_hints_level',
  'activate_timer_from_settings',
  'activate_stopwatch_from_settings',
  'activate_pomodoro_from_settings',
];

export const TIMER_DATA_SETTING_KEYS: string[] = [
  'default_timer_duration_mmss',
];

export const STOPWATCH_DATA_SETTING_KEYS: string[] = [
  'stopwatch_auto_lap_enabled',
  'stopwatch_auto_lap_interval_mmss',
  'stopwatch_max_auto_lap_intervals',
];

export const POMODORO_DATA_SETTING_KEYS: string[] = [
  'pomodoro_work_duration_minutes',
  'pomodoro_short_break_duration_minutes',
  'pomodoro_long_break_duration_minutes',
  'pomodoro_intervals_before_long_break',
  'pomodoro_auto_start_breaks',
  'pomodoro_auto_start_work',
];

const ALL_MANAGED_TPA_CONFIG_KEYS: string[] = Array.from(new Set([
  ...ALWAYS_ON_SETTING_KEYS,
  ...TIMER_DATA_SETTING_KEYS,
  ...STOPWATCH_DATA_SETTING_KEYS,
  ...POMODORO_DATA_SETTING_KEYS,
]));

export const fallbackDefaultAppSettings: AppSettings = {
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
  private globalAppSettings: AppSettings;
  private sessionSpecificAppSettings: Map<string, AppSettings> = new Map();
  private configFilePath: string;
  private settingsRefreshedListeners: Map<string, Array<(changedTpaConfigKeys: string[]) => void>> = new Map();
  private sdkUnsubscribeCallbacks: Map<string, Map<string, () => void>> = new Map();

  constructor(private configDir: string, initialFallbackDefaults: AppSettings) {
    this.configFilePath = path.join(this.configDir, 'tpa_config.json');
    this.globalAppSettings = { ...initialFallbackDefaults };
    console.log('[SettingsManager] Initialized. Fallback defaults set.');
  }

  private parseSettingValue<T extends string | number | boolean>(value: any, expectedType: 'string' | 'number' | 'boolean'): T {
    if (expectedType === 'boolean') return Boolean(value) as T;
    if (expectedType === 'number') {
      const num = Number(value);
      return isNaN(num) ? 0 as T : num as T;
    }
    return String(value) as T;
  }

  public loadGlobalSettings(): void {
    try {
      if (fs.existsSync(this.configFilePath)) {
        const fileContent = fs.readFileSync(this.configFilePath, 'utf8');
        const tpaConfigFile = JSON.parse(fileContent) as TpaConfigFile;
        
        const loadedFromFileSettings = { ...this.globalAppSettings }; 
        
        tpaConfigFile.settings.forEach(settingFromFile => {
          this.updateSingleAppSetting(loadedFromFileSettings, settingFromFile.key, settingFromFile.defaultValue);
        });

        this.globalAppSettings = loadedFromFileSettings;
        console.log('[SettingsManager] Global settings loaded and merged from tpa_config.json:', this.globalAppSettings);
      } else {
        console.warn(`[SettingsManager] tpa_config.json not found at ${this.configFilePath}. Using initial fallback defaults for global settings.`);
      }
    } catch (e) {
      console.error('[SettingsManager] Could not load or parse tpa_config.json. Using initial fallback defaults for global settings. Error:', e);
    }
  }

  public updateGlobalSettings(updates: Partial<AppSettings>): boolean {
    let changed = false;
    for (const key in updates) {
      if (Object.prototype.hasOwnProperty.call(this.globalAppSettings, key)) {
        const appSettingKey = key as keyof AppSettings;
        if (this.globalAppSettings[appSettingKey] !== updates[appSettingKey]) {
          (this.globalAppSettings as any)[appSettingKey] = updates[appSettingKey];
          changed = true;
        }
      }
    }
    if (changed) {
      console.log('[SettingsManager] Global AppSettings updated programmatically:', this.globalAppSettings);
    }
    return changed;
  }

  private updateSingleAppSetting(settingsObject: AppSettings, tpaConfigKey: string, value: any): void {
    switch (tpaConfigKey) {
      case 'startup_mode':
        settingsObject.startup_mode = this.parseSettingValue(value, 'string') as AppSettings['startup_mode'];
        break;
      case 'control_input_method':
        settingsObject.control_input_method = this.parseSettingValue(value, 'string') as AppSettings['control_input_method'];
        break;
      case 'use_trigger_word_setting':
        settingsObject.use_trigger_word_setting = this.parseSettingValue(value, 'boolean');
        break;
      case 'show_hints_level':
        settingsObject.show_hints_level = this.parseSettingValue(value, 'string') as ShowHintsLevel;
        break;
      case 'default_timer_duration_mmss':
        settingsObject.default_timer_duration_mmss = this.parseSettingValue(value, 'string');
        settingsObject.default_timer_duration_seconds = parseMMSS(settingsObject.default_timer_duration_mmss) || 0;
        break;
      case 'stopwatch_max_auto_lap_intervals':
        const maxLapsVal = parseInt(this.parseSettingValue(value, 'string'), 10);
        if (!isNaN(maxLapsVal) && maxLapsVal >= 1 && maxLapsVal <= 99) {
          settingsObject.stopwatch_max_auto_lap_intervals = maxLapsVal;
        } else {
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

  public async initializeSessionSettings(session: AppSession, sessionId: string): Promise<void> {
    let sessionSettingsInstance = this.sessionSpecificAppSettings.get(sessionId);
    if (!sessionSettingsInstance) {
      sessionSettingsInstance = { ...this.globalAppSettings };
      this.sessionSpecificAppSettings.set(sessionId, sessionSettingsInstance);
    }

    for (const tpaConfigKey of ALL_MANAGED_TPA_CONFIG_KEYS) {
      try {
        const settingValueFromGet = await session.getSetting<any>(tpaConfigKey);
        console.log(`[SettingsManager] initializeSessionSettings for ${sessionId}, key '${tpaConfigKey}', received from getSetting:`, JSON.stringify(settingValueFromGet));
        if (typeof settingValueFromGet !== 'undefined') {
          this.updateSingleAppSetting(sessionSettingsInstance, tpaConfigKey, settingValueFromGet);
        }
      } catch (error) {
        console.warn(`[SettingsManager] Session ${sessionId}: Error fetching initial SDK setting for ${tpaConfigKey}:`, error);
      }
    }
    
    console.log(`[SettingsManager] Initialized (fetched values only) for session ${sessionId}:`, sessionSettingsInstance);

    if (!this.sdkUnsubscribeCallbacks.has(sessionId)) {
      this.sdkUnsubscribeCallbacks.set(sessionId, new Map<string, () => void>());
    }
  }

  private _registerListeners(session: AppSession, sessionId: string, settingKeys: string[]): void {
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

      const unsubscribe = session.events.onSettingChange(tpaConfigKey, (sdkProvidedValue: any) => {
        console.log(`[SettingsManager] onSettingChange for ${sessionId}, key '${tpaConfigKey}', sdkProvidedValue:`, JSON.stringify(sdkProvidedValue));
        
        let workingSessionSettings = this.sessionSpecificAppSettings.get(sessionId);
        if (!workingSessionSettings) {
          console.warn(`[SettingsManager] onSettingChange: sessionSpecificAppSettings not found for ${sessionId} when event for '${tpaConfigKey}' was received. Using globalAppSettings as base.`);
          workingSessionSettings = { ...this.globalAppSettings };
        } else {
          workingSessionSettings = { ...workingSessionSettings }; 
        }

        let valueToProcess: any;
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
        } else {
          console.warn(`[SettingsManager] onSettingChange for ${sessionId}, key '${tpaConfigKey}': valueToProcess is undefined.`);
        }
      });
      sessionUnsubscribeMap.set(tpaConfigKey, unsubscribe);
      console.log(`[SettingsManager] Listening to ${tpaConfigKey} for session ${sessionId}`);
    });
  }

  private _unregisterListeners(sessionId: string, settingKeys: string[]): void {
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

  public listenToAlwaysOnSettings(session: AppSession, sessionId: string): void {
    this._registerListeners(session, sessionId, ALWAYS_ON_SETTING_KEYS);
  }
  public stopListeningToAlwaysOnSettings(sessionId: string): void { 
    this._unregisterListeners(sessionId, ALWAYS_ON_SETTING_KEYS);
  }

  public listenToTimerDataSettings(session: AppSession, sessionId: string): void {
    this._registerListeners(session, sessionId, TIMER_DATA_SETTING_KEYS);
  }
  public stopListeningToTimerDataSettings(sessionId: string): void {
    this._unregisterListeners(sessionId, TIMER_DATA_SETTING_KEYS);
  }

  public listenToStopwatchDataSettings(session: AppSession, sessionId: string): void {
    this._registerListeners(session, sessionId, STOPWATCH_DATA_SETTING_KEYS);
  }
  public stopListeningToStopwatchDataSettings(sessionId: string): void {
    this._unregisterListeners(sessionId, STOPWATCH_DATA_SETTING_KEYS);
  }

  public listenToPomodoroDataSettings(session: AppSession, sessionId: string): void {
    this._registerListeners(session, sessionId, POMODORO_DATA_SETTING_KEYS);
  }
  public stopListeningToPomodoroDataSettings(sessionId: string): void {
    this._unregisterListeners(sessionId, POMODORO_DATA_SETTING_KEYS);
  }

  public getSetting<K extends keyof AppSettings>(sessionId: string, key: K): AppSettings[K] {
    const sessionSettings = this.sessionSpecificAppSettings.get(sessionId);
    if (sessionSettings && typeof sessionSettings[key] !== 'undefined') {
      return sessionSettings[key];
    }
    return this.globalAppSettings[key];
  }

  public getAllSettings(): AppSettings {
    return { ...this.globalAppSettings };
  }

  public onSettingsRefreshed(sessionId: string, callback: (changedTpaConfigKeys: string[]) => void): () => void {
    if (!this.settingsRefreshedListeners.has(sessionId)) {
      this.settingsRefreshedListeners.set(sessionId, []);
    }
    const listeners = this.settingsRefreshedListeners.get(sessionId)!;
    listeners.push(callback);

    return () => {
      const currentListeners = this.settingsRefreshedListeners.get(sessionId);
      if (currentListeners) {
        this.settingsRefreshedListeners.set(
          sessionId,
          currentListeners.filter(cb => cb !== callback)
        );
      }
    };
  }

  public removeSessionSettings(sessionId: string): void {
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
