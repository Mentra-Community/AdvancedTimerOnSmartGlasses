import { ToolCall, AppSession } from '@mentra/sdk';
import { AdvancedTimerApp } from './app';
import { CommandHandler } from './core/commandhandler';

/**
 * Handles tool calls from the Mentra OS by mapping them to internal text commands.
 *
 * @param toolCall The tool call object from the server.
 * @param app The main application instance.
 * @param session The active AppSession for the user.
 * @param commandHandler The application's central command handler.
 * @param sessionId The unique ID for the user's session.
 * @returns A promise that resolves to a string response for the user.
 */
export async function handleToolCall(
    toolCall: ToolCall, 
    app: AdvancedTimerApp, 
    session: AppSession, 
    commandHandler: CommandHandler, 
    sessionId: string
): Promise<string | undefined> {
    
    console.log(`[handleToolCall] Received tool call: ${toolCall.toolId}`);
    if (toolCall.toolParameters && Object.keys(toolCall.toolParameters).length > 0) {
        console.log(`[handleToolCall] Tool call parameters:`, toolCall.toolParameters);
    }

    const { toolId, toolParameters } = toolCall;

    let commandText = '';
    let responseMessage = '';

    switch (toolId) {
        // Timer Tools
        case 'start_timer': {
            const durationStr = toolParameters?.duration as string;
            if (!durationStr) {
                return "Please provide a duration for the timer (e.g., '5 minutes' or '1h 30m').";
            }
            // First, set the duration. Then, start the timer.
            await commandHandler.handleCommand(session, sessionId, `set timer for ${durationStr}`);
            commandText = 'start';
            responseMessage = `Timer started for ${durationStr}.`;
            break;
        }
        case 'pause_timer':
            commandText = 'pause';
            responseMessage = 'Timer paused.';
            break;
        case 'resume_timer':
            commandText = 'resume';
            responseMessage = 'Timer resumed.';
            break;
        case 'stop_timer':
            commandText = 'stop';
            responseMessage = 'Timer stopped.';
            break;

        // Stopwatch Tools
        case 'start_stopwatch':
            await commandHandler.handleCommand(session, sessionId, 'stopwatch');
            commandText = 'start';
            responseMessage = 'Stopwatch started.';
            break;
        case 'pause_stopwatch':
            commandText = 'pause';
            responseMessage = 'Stopwatch paused.';
            break;
        case 'resume_stopwatch':
            commandText = 'resume';
            responseMessage = 'Stopwatch resumed.';
            break;
        case 'stop_stopwatch':
            commandText = 'stop';
            responseMessage = 'Stopwatch stopped.';
            break;
        case 'lap_stopwatch':
            commandText = 'lap';
            responseMessage = 'Lap recorded.';
            break;

        // Pomodoro Tools
        case 'start_pomodoro': {
             // First, select the pomodoro mode. Then, start the cycle.
            await commandHandler.handleCommand(session, sessionId, 'pomodoro');
            commandText = 'start cycle';
            const workDurationStr = toolParameters?.work_duration as string ?? '25m';
            const breakDurationStr = toolParameters?.break_duration as string ?? '5m';
            responseMessage = `Pomodoro started with ${workDurationStr} work and ${breakDurationStr} break sessions.`;
            // Note: The command handler doesn't currently support setting pomodoro durations via command.
            // This will use the default or user-configured settings.
            break;
        }
        case 'pause_pomodoro':
            commandText = 'pause';
            responseMessage = 'Pomodoro paused.';
            break;
        case 'resume_pomodoro':
            commandText = 'resume';
            responseMessage = 'Pomodoro resumed.';
            break;
        case 'stop_pomodoro':
            commandText = 'stop pomodoro';
            responseMessage = 'Pomodoro stopped.';
            break;

        // General Status Tool
        case 'get_status':
            // The command handler does not have a "get_status" command.
            // This would need to be implemented separately by checking the session state.
            const currentState = app.sessionManager.getState(sessionId);
            return `Current status: ${currentState ? currentState : 'Unknown'}`;

        default:
            console.log(`[handleToolCall] Unknown toolId: ${toolId}`);
            return `The command "${toolId}" is not recognized by the Advanced Timer.`;
    }

    await commandHandler.handleCommand(session, sessionId, commandText);
    return responseMessage;
}
