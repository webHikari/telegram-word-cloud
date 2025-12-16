import type { WordItem } from './generateWordCloud.ts';

export function formatTextToWordsDict(message: string): WordItem[] {
    const stopWords = new Set([
        'the', 'a', 'an', 'and', 'or', 'but', 'on', 'in', 'at', 'to', 'for', 'of', 'with', 'by',
        'is', 'are', 'was', 'were', 'be',
        'на', 'с', 'в', 'по', 'о', 'об', 'от', 'до', 'за', 'из', 'к', 'у', 'без', 'под', 'над',
        'при', 'про', 'не', 'и', 'или', 'но', 'да', 'же', 'ли', 'бы', 'б',
        'его', 'её', 'наш', 'ваш', 'их', 'этот', 'тот'
    ]);

    const words = message.toLowerCase()
        .replace(/[^\w\sа-яА-ЯёЁ]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 0 && !stopWords.has(word));

    const frequencyMap = new Map<string, number>();
    
    for (const word of words) {
        frequencyMap.set(word, (frequencyMap.get(word) || 0) + 1);
    }

    return Array.from(frequencyMap.entries())
        .map(([word, freq]) => ({ word, freq }))
        .sort((a, b) => b.freq - a.freq);
}