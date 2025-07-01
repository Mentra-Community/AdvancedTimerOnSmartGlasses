export const TRIGGER_PHRASE = "mira";
export const COMMAND_COOLDOWN_MS = 1500;
export const STOPWATCH_INTERVAL_MS = 30;
export const MAX_LAP_TIMES = 2;
export const USE_TRIGGER_WORD = false;
// fallbackDefaultAppSettings is now directly of type AppSettings
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
export const MAX_TIMER_DURATION_SECONDS = 3600;
