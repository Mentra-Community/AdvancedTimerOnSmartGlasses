// Utility to parse spoken durations from natural language into seconds (max 60 minutes)
// Handles: 'five minutes', 'one minute forty seconds', 'one zero three zero', '2 minutes and 35 seconds', etc.

const NUMBER_WORDS: Record<string, number> = {
    'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9,
    'ten': 10, 'eleven': 11, 'twelve': 12, 'thirteen': 13, 'fourteen': 14, 'fifteen': 15, 'sixteen': 16, 'seventeen': 17, 'eighteen': 18, 'nineteen': 19,
    'twenty': 20, 'thirty': 30, 'forty': 40, 'fifty': 50, 'sixty': 60
};

function wordToNumber(word: string): number | null {
    word = word.toLowerCase();
    if (NUMBER_WORDS.hasOwnProperty(word)) return NUMBER_WORDS[word];
    // Handle compound words like 'thirtyfive', 'twentyone'
    for (const tens of ['twenty', 'thirty', 'forty', 'fifty', 'sixty']) {
        if (word.startsWith(tens)) {
            const ones = word.slice(tens.length);
            if (ones && NUMBER_WORDS.hasOwnProperty(ones)) {
                return NUMBER_WORDS[tens] + NUMBER_WORDS[ones];
            }
        }
    }
    return null;
}

function spokenToDigits(text: string): string {
    // Replace number words with digits, e.g., 'five' -> '5', 'thirtyfive' -> '35'
    return text.split(/\s+/).map(word => {
        const n = wordToNumber(word);
        return n !== null ? n.toString() : word;
    }).join(' ');
}

export function parseSpokenDuration(command: string): number | null {
    let text = command.toLowerCase().replace(/[^a-z0-9: ]+/g, ' ').replace(/\s+/g, ' ').trim();
    // Handle colon-separated time, e.g. '10:30'
    const colonMatch = text.match(/^(\d{1,2}):(\d{2})$/);
    if (colonMatch) {
        const min = parseInt(colonMatch[1], 10);
        const sec = parseInt(colonMatch[2], 10);
        if (min >= 0 && sec >= 0 && sec < 60) {
            const total = min * 60 + sec;
            return total > 0 && total <= 3600 ? total : null;
        }
    }
    // Replace number words with digits for easier parsing
    text = spokenToDigits(text);
    // Try to handle military time: e.g. '1030' => 10:30, '0830' => 8:30
    // Accept both '10 30' and '1030' as 10:30
    const militaryParts = text.split(' ');
    if (militaryParts.length === 2 && militaryParts.every(p => /^\d+$/.test(p))) {
        // e.g. '10 30' or '1 40'
        const min = parseInt(militaryParts[0], 10);
        const sec = parseInt(militaryParts[1], 10);
        if (min >= 0 && sec >= 0 && sec < 60) {
            const total = min * 60 + sec;
            return total > 0 && total <= 3600 ? total : null;
        }
    } else if (militaryParts.length === 1 && /^\d{3,4}$/.test(militaryParts[0])) {
        // e.g. '1030' or '830'
        const str = militaryParts[0].padStart(4, '0');
        const min = parseInt(str.slice(0, 2), 10);
        const sec = parseInt(str.slice(2), 10);
        if (min >= 0 && sec >= 0 && sec < 60) {
            const total = min * 60 + sec;
            return total > 0 && total <= 3600 ? total : null;
        }
    }
    // Handle 'X minutes Y seconds', 'X min', 'Y sec', etc.
    let minutes = 0, seconds = 0, hours = 0;
    // e.g. '2 minutes and 35 seconds', '1 minute 40 seconds', '5 minutes'
    const hourMatch = text.match(/(\d+)\s*(hour|hr)s?/);
    if (hourMatch) hours = parseInt(hourMatch[1], 10);
    const minMatch = text.match(/(\d+)\s*(minute|min)s?/);
    if (minMatch) minutes = parseInt(minMatch[1], 10);
    const secMatch = text.match(/(\d+)\s*(second|sec)s?/);
    if (secMatch) seconds = parseInt(secMatch[1], 10);
    // Handle 'X minutes and Y seconds'
    if (!minMatch && !secMatch) {
        // Try to parse 'X Y' as MM SS
        const parts = text.split(' ');
        if (parts.length === 2 && parts.every(p => /^\d+$/.test(p))) {
            minutes = parseInt(parts[0], 10);
            seconds = parseInt(parts[1], 10);
        } else if (parts.length === 1 && /^\d+$/.test(parts[0])) {
            // Single number, treat as minutes
            minutes = parseInt(parts[0], 10);
        }
    }
    let totalSeconds = hours * 3600 + minutes * 60 + seconds;
    // Cap at 60 minutes (3600 seconds)
    if (totalSeconds > 3600) totalSeconds = 3600;
    if (totalSeconds > 0) return totalSeconds;
    return null;
} 