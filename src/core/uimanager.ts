// src/core/uimanager.ts
import { AppSession, ViewType } from '@mentra/sdk';
import { SettingsManager, AppSettings } from './settingsmanager';
import { SessionManager } from '../session/sessionmanager';
import { TRIGGER_PHRASE } from './constants';
import { MyAppState } from '../session/appstate';

const DEFAULT_TOAST_DURATION = 2000; 

export class UIManager {
    constructor(
        private settingsManager: SettingsManager, 
        private sessionManager: SessionManager
    ) {
        console.log('[UIManager] Initialized');
    }

    /**
     * Displays the mode selection screen.
     * This is a persistent layout, not a toast.
     * @param session The TPA session.
     * @param sessionId The ID of the session.
     */
    public showModeSelection(session: AppSession, sessionId: string): void {
        const sessionInfo = this.sessionManager.getSessionInfo(sessionId);
        if (!sessionInfo || !sessionInfo.isConnected || !sessionInfo.currentSettings) {
            console.warn(`[UIManager] Session ${sessionId} niet gevonden, niet verbonden, of currentSettings missen voor showModeSelection.`);
            try {
                session.layouts.showTextWall("Error: Cannot load menu.", { view: ViewType.MAIN, durationMs: 0 });
            } catch (e) { 
                console.error(`[UIManager] Fallback error display failed for session ${sessionId}:`, e);
            }
            return;
        }

        const currentSettings = sessionInfo.currentSettings; 
        const useTriggerWord = currentSettings.use_trigger_word_setting;
        const controlMethod = sessionInfo.currentControlMethod;
        const showHints = currentSettings.show_hints_level;

        const modeOptionsText = "1. Stopwatch\n2. Timer\n3. Pomodoro";
        
        let commandPrefix = "";
        if (useTriggerWord && controlMethod === 'voice') {
            commandPrefix = `${TRIGGER_PHRASE}, `;
        }

        let menuPrompt = "";
        
        if (controlMethod === 'voice' && showHints) {
            const hintPomodoro = `'${commandPrefix}Start Pomodoro'`; 
            let baseCommandPromptText = "Start [Mode]";
            if (commandPrefix) {
                baseCommandPromptText = `${TRIGGER_PHRASE}, Start [Mode]`;
            }
            menuPrompt = `Say '${baseCommandPromptText}'\n(e.g., ${hintPomodoro})`;
        } else if (controlMethod === 'app_external' && showHints) {
            menuPrompt = "Use external app to control.";
        }
        

        const menuText = `Choose Mode:\n${modeOptionsText}${menuPrompt ? '\n\n' + menuPrompt : ''}`;

        try {
            console.log(`[UIManager] Showing mode selection for session ${sessionId}: ${menuText.replace(/\n/g, "\\n")}`);
            session.layouts.showTextWall(menuText.trim(), { view: ViewType.MAIN, durationMs: 0 });
        } catch (e) {
            console.error(`[UIManager] Error in showModeSelection for session ${sessionId}:`, e);
        }
    }
    
    /**
     * Shows a toast message.
     * @param session The TPA session.
     * @param sessionId The ID of the session.
     * @param message The message to display.
     * @param durationMs The duration in milliseconds. Default is DEFAULT_TOAST_DURATION (2000ms).
     */
    public showToast(session: AppSession, sessionId: string, message: string, durationMs = DEFAULT_TOAST_DURATION): void {
        console.log(`[UIManager] Showing toast for session ${sessionId}: "${message}" for ${durationMs}ms`);
        try {
            session.layouts.showTextWall(message, {
                view: ViewType.MAIN, 
                durationMs: durationMs
            });
        } catch (e) {
            console.error(`[UIManager] Error in showToast for session ${sessionId}:`, e);
        }
    }

    /**
     * Displays a generic layout.
     * @param session The TPA session.
     * @param sessionId The ID of the session.
     * @param layout The layout object (expects a 'layoutType' and 'text'/'options' properties).
     */
    public showLayout(session: AppSession, sessionId: string, layout: any ): void {
        const layoutType = layout.layoutType; 
        try {
            switch (layoutType) {
                case 'TextWall': 
                    session.layouts.showTextWall(layout.text, layout.options);
                    break;
                default:
                    console.warn(`[UIManager] showLayout: Unknown or unsupported layout type: ${layoutType} for session ${sessionId}`);
                    session.layouts.showTextWall(JSON.stringify(layout), {view: ViewType.MAIN, durationMs: 0}); 
                    break;
            }
        } catch (e) {
             console.error(`[UIManager] Error in showLayout for session ${sessionId}, layoutType ${layoutType}:`, e);
        }
    }

    /**
     * Attempts to clear the UI by displaying a very brief, empty TextWall.
     * @param session The TPA session.
     * @param sessionId The ID of the session.
     */
    public clearUI(session: AppSession, sessionId: string): void {
        console.log(`[UIManager] Attempting to clear UI for session ${sessionId}`);
        try {
            session.layouts.showTextWall("", { view: ViewType.MAIN, durationMs: 1 });
        } catch (e) {
            console.error(`[UIManager] Error in clearUI for session ${sessionId}:`, e);
        }
    }
}