import { Bot } from "grammy";

import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { last24hrChanges, wordsTable, last24hrWords } from "./db/schema.ts"
import { sql } from "drizzle-orm";
const db = drizzle(`postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@localhost:${process.env.DB_PORT}/${process.env.DB_NAME}`!);

import { createWordCloud } from "./lib/utils/generateWordCloud.ts";
import { formatTextToWordsDict } from "./lib/utils/formatTextToWordsDict.ts";

const { TELEGRAM_BOT_TOKEN } = process.env

if (!TELEGRAM_BOT_TOKEN) {
    throw new Error("Telegram bot token is not set, you need to provide it to .env file like in .env.example")
}

const bot = new Bot(TELEGRAM_BOT_TOKEN); 

bot.on("message", async (ctx) => {
    const message = ctx.message.text
    if (!message) return
    
    const chat_id = ctx.message.chat.id
    const user_id = ctx.message.from.id
    const timestamp = ctx.message.date

    const date = new Date(timestamp * 1000)

    const wordsFreq = formatTextToWordsDict(message)
    if (!wordsFreq.length) return

    const last24hrChangesInput = {
        message: JSON.stringify(wordsFreq),
        userID: user_id,
        chatID: chat_id,
        sendedAt: date
    } 

    console.log(last24hrChangesInput)

    await db.insert(last24hrChanges).values(last24hrChangesInput)

    for (const wordItem of wordsFreq) {
        await db.insert(wordsTable).values({
            word: wordItem.word,
            freq: wordItem.freq,
            userID: user_id,
            chatID: chat_id
        }).onConflictDoUpdate({
            target: [wordsTable.word, wordsTable.userID, wordsTable.chatID],
            set: { freq: sql`${wordsTable.freq} + ${wordItem.freq}` }
        })
    }

    for (const wordItem of wordsFreq) {
        await db.insert(last24hrWords).values({
            word: wordItem.word,
            freq: wordItem.freq,
            userID: user_id,
            chatID: chat_id
        }).onConflictDoUpdate({
            target: [last24hrWords.word, last24hrWords.userID, last24hrWords.chatID],
            set: { freq: sql`${last24hrWords.freq} + ${wordItem.freq}` }
        })
    }
});

    // nothing for now

bot.start();