/**
 * Formats a total number of seconds into a string representation (HH:MM:SS or MM:SS).
 *
 * @param totalSeconds The total number of seconds to format.
 * @returns A string in the format MM:SS or HH:MM:SS if there are hours.
 * Returns "00:00" if totalSeconds is negative or not a valid number.
 */
export function formatTime(totalSeconds) {
    if (isNaN(totalSeconds) || totalSeconds < 0) {
        console.warn(`[formatTime] Ongeldige input ontvangen: ${totalSeconds}. Standaardwaarde "00:00" wordt gebruikt.`);
        return "00:00";
    }
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    let formattedTime = "";
    if (hours > 0) {
        formattedTime += `${hours.toString().padStart(2, '0')}:`;
    }
    formattedTime += `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    return formattedTime;
}
/**
 * Parses a string in MM:SS format into a number of seconds.
 * Returns NaN if the input is invalid.
 * @param mmss The string in MM:SS format (e.g., '01:30').
 * @returns The total number of seconds, or NaN if invalid.
 */
export function parseMMSS(mmss) {
    if (!mmss || typeof mmss !== 'string')
        return NaN;
    const parts = mmss.split(':');
    if (parts.length !== 2)
        return NaN;
    const minutes = parseInt(parts[0], 10);
    const seconds = parseInt(parts[1], 10);
    if (isNaN(minutes) || isNaN(seconds) || minutes < 0 || seconds < 0 || seconds > 59)
        return NaN;
    return minutes * 60 + seconds;
}
