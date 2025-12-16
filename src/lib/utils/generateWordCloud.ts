import { createCanvas, CanvasRenderingContext2D } from 'canvas'
import fs from 'fs'

export type WordItem = {
    word: string
    freq: number
}

type PlacedWord = {
    x: number
    y: number
    width: number
    height: number
    word: string
    fontSize: number
}

export function createWordCloud(wordCounts: WordItem[]): void {
    const WIDTH = 3840
    const HEIGHT = 2160
    const canvas = createCanvas(WIDTH, HEIGHT)
    const ctx: CanvasRenderingContext2D = canvas.getContext('2d')

    const totalFreq = wordCounts.reduce((sum, w) => sum + w.freq, 0)
    const words = wordCounts.sort((a, b) => b.freq - a.freq)
    const placedWords: PlacedWord[] = []
    ctx.textBaseline = 'top'

    function intersects(x: number, y: number, w: number, h: number): boolean {
        return placedWords.some(word =>
            x < word.x + word.width &&
            x + w > word.x &&
            y < word.y + word.height &&
            y + h > word.y
        )
    }

    function placeWord(word: string, fontSize: number): void {
        ctx.font = `${fontSize}px monospace`
        const metrics = ctx.measureText(word)
        const width = metrics.width
        const height = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent

        const centerX = WIDTH / 2
        const centerY = HEIGHT / 2
        let angle = 0
        let radius = 0
        let x: number, y: number

        const spiralStep = 0.2
        const radiusStep = 0.5

        while (true) {
            x = centerX + radius * Math.cos(angle) - width / 2
            y = centerY + radius * Math.sin(angle) - height / 2
            if (!intersects(x, y, width, height)) break
            angle += spiralStep
            radius += radiusStep
            if (radius > Math.max(WIDTH, HEIGHT)) break
        }

        placedWords.push({ x, y, width, height, word, fontSize })
    }

    if (!words[0]) return

    words.forEach(({ word, freq }) => {
        const percent = freq / totalFreq 
        const size = percent * 8000 // fuck my life
        placeWord(word, size)
    })

    ctx.fillStyle = '#171717ff'
    ctx.fillRect(0, 0, WIDTH, HEIGHT)

    ctx.fillStyle = '#e5e5e5ff'
    placedWords.forEach(({ x, y, word, fontSize }) => {
        ctx.font = `${fontSize}px monospace`
        ctx.fillText(word, x, y)
    })

    const out = fs.createWriteStream('wordcloud.png')
    const stream = canvas.createPNGStream()
    stream.pipe(out)
    out.on('finish', () => console.log('wordcloud created'))
}