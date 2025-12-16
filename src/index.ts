import { Bot } from "grammy";
import cron from 'node-cron';

import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { last24hrChanges, wordsTable, last24hrWords, blacklist } from "./lib/db/schema.ts"
import { sql, eq } from "drizzle-orm";
const db = drizzle(`postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@localhost:${process.env.DB_PORT}/${process.env.DB_NAME}`!);

// import { createWordCloud } from "./lib/utils/generateWordCloud.ts";
import { formatTextToWordsDict } from "./lib/utils/formatTextToWordsDict.ts";
import { isAllowedToProcessMsg } from "./lib/utils/isAllowedToProcessMsg.ts";

if (!process.env.TELEGRAM_BOT_TOKEN) {
    throw new Error("Telegram bot token is not set, you need to provide it to .env file like in .env.example")
}

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN); 

// save data to database
bot.on("message", async (ctx) => {
    const message = ctx.message.text
    if (!message) return
    
    const user_id = ctx.message.from.id
    const canSave = await isAllowedToProcessMsg(user_id)
    if (!canSave) return
    
    // if ALLOWED_CHAT_ID not set, then it will process messages from any chat
    // is set, then will not process
    const chat_id = ctx.message.chat.id
    if (process.env.ALLOWED_CHAT_ID) {
        if (chat_id.toString() !== process.env.ALLOWED_CHAT_ID) {
            return
        }
    }

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
        // save to all words
        await db.insert(wordsTable).values({
            word: wordItem.word,
            freq: wordItem.freq,
            userID: user_id,
            chatID: chat_id
        }).onConflictDoUpdate({
            target: [wordsTable.word, wordsTable.userID, wordsTable.chatID],
            set: { freq: sql`${wordsTable.freq} + ${wordItem.freq}` }
        })
        
        // save to 24hr
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

// add user to blacklist (delete data and avoid insert data from this user)
bot.command("dont_save_my_data", async (ctx) => {
    const user_id = ctx.from?.id;
    if (!user_id) return;

    await db.transaction(async (tx) => {
        await tx.insert(blacklist).values({
            userID: user_id,
            canSave: false
        }).onConflictDoUpdate({
            target: blacklist.userID,
            set: { canSave: false }
        });

        await tx.delete(wordsTable).where(eq(wordsTable.userID, user_id));
        await tx.delete(last24hrWords).where(eq(last24hrWords.userID, user_id));
        await tx.delete(last24hrChanges).where(eq(last24hrChanges.userID, user_id));
    });

    await ctx.reply("Твои данные больше не сохраняются + удалены\n\nЕсли не хотел(а) это писать, то и нехуй было\n/save_my_data включает сбор данных обратно");
});

// remove user from blacklist (data now can be added from this user)
bot.command("save_my_data", async (ctx) => {
    const user_id = ctx.from?.id;
    if (!user_id) return;

    await db.insert(blacklist).values({
        userID: user_id,
        canSave: true
    }).onConflictDoUpdate({
        target: blacklist.userID,
        set: { canSave: true }
    });

    await ctx.reply("Твои данные снова сохраняются");
});

bot.start();

// cron for deleting overtimed messages from 24hr tables
cron.schedule('* * * * *', async () => {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const oldChanges = await db.select()
        .from(last24hrChanges)
        .where(sql`${last24hrChanges.sendedAt} < ${twentyFourHoursAgo}`);
    
    for (const change of oldChanges) {
        try {
            const wordsData: Array<{word: string, freq: number}> = JSON.parse(change.message as string);
            
            for (const wordItem of wordsData) {
                await db.update(last24hrWords)
                    .set({ freq: sql`${last24hrWords.freq} - ${wordItem.freq}` })
                    .where(
                        sql`${last24hrWords.word} = ${wordItem.word} 
                        AND ${last24hrWords.userID} = ${change.userID} 
                        AND ${last24hrWords.chatID} = ${change.chatID}`
                    );
            }
            
            await db.delete(last24hrChanges).where(sql`${last24hrChanges.id} = ${change.id}`);
            
        } catch (error) {
            console.error('/index.ts/cron.schedule error: ', error);
        }
    }
});
