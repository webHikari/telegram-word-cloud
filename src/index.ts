import { Bot, InputFile, MemorySessionStorage } from "grammy";
import { chatMembers } from "@grammyjs/chat-members";
import cron from 'node-cron';
import fs from "fs"

import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { last24hrChanges, wordsTable, last24hrWords, blacklist } from "./lib/db/schema.ts"
import { sql, eq } from "drizzle-orm";
const db = drizzle(`postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@localhost:${process.env.DB_PORT}/${process.env.DB_NAME}`!);

import { createWordCloud } from "./lib/utils/generateWordCloud.ts";
import { formatTextToWordsDict } from "./lib/utils/formatTextToWordsDict.ts";
import { isAllowedToProcessMsg } from "./lib/utils/isAllowedToProcessMsg.ts";

if (!process.env.TELEGRAM_BOT_TOKEN) {
    throw new Error("Telegram bot token is not set, you need to provide it to .env file like in .env.example")
}

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);

// get chat's word cloud of all time 
bot.command("chat", async (ctx) => {
    const chat_id = ctx.chat.id
    const user_id = ctx.from?.id

    if (chat_id === user_id) {
        return await ctx.reply("Пиши /me или /me_24h, эта команда только для чатов")
    }

    // is admin validation
    if (!user_id) return
    const chatMember = await ctx.getChatMember(user_id);
    const isAdmin = ['creator', 'administrator'].includes(chatMember.status);
    if (!isAdmin) return await ctx.reply("Команда доступна только администраторам")

    const chatWords = await db.select({
        chatID: wordsTable.chatID,
        userID: wordsTable.userID,
        word: wordsTable.word,
        freq: wordsTable.freq
    })
    .from(wordsTable)
    .where(sql`${wordsTable.chatID} != ${wordsTable.userID} AND ${wordsTable.chatID} = ${chat_id}`);

    const chatMap = new Map<string | number, Map<string, number>>();
    console.log("chatWords", chatWords)


    for (const row of chatWords) {
        if (!chatMap.has(row.chatID.toString())) {
            chatMap.set(row.chatID.toString(), new Map());
        }
        
        const wordMap = chatMap.get(row.chatID.toString())!;
        wordMap.set(row.word, (wordMap.get(row.word) || 0) + row.freq);
    }

    for (const [chatID, wordMap] of chatMap) {
        const sortedWords = Array.from(wordMap.entries())
            .map(([word, freq]) => ({ word, freq }))
            .sort((a, b) => b.freq - a.freq)
            .slice(0, 100);

        const imagePath = `wordcloud_${chatID}.png`;
        createWordCloud(sortedWords, imagePath);
        
        try {
            await bot.api.sendPhoto(
                Number(chatID),
                new InputFile(imagePath),
                {
                    caption: "Облако слов за последние 24 часа\n\nЧтоб посмотреть свое напишите команду /me или /me_24h (для 24 часовой версии)\n\nЧтоб запретить боту собирать ваши данные напишите /dont_save_my_data или /save_my_data чтоб разрешить обратно"
                }
            );

        fs.unlinkSync(imagePath);

        } catch (error) {
            console.error(`Failed to send to chat ${chatID}:`, error);
            if (fs.existsSync(imagePath)) {
                fs.unlinkSync(imagePath);
            }
        }       
        console.log(`Chat ${chatID} top words:`, sortedWords);
    }
})

// get chat's word cloud in 24h frame
bot.command("chat_24h", async (ctx) => {
    const chat_id = ctx.chat.id
    const user_id = ctx.from?.id

    if (chat_id === user_id) {
        return await ctx.reply("Пиши /me или /me_24h, эта команда только для чатов")
    }

    // is admin validation
    if (!user_id) return
    const chatMember = await ctx.getChatMember(user_id);
    const isAdmin = ['creator', 'administrator'].includes(chatMember.status);
    if (!isAdmin) return await ctx.reply("Команда доступна только администратору")


    const chatWords = await db.select({
        chatID: last24hrWords.chatID,
        userID: last24hrWords.userID,
        word: last24hrWords.word,
        freq: last24hrWords.freq
    })
    .from(last24hrWords)
    .where(sql`${last24hrWords.chatID} != ${last24hrWords.userID} 
            AND ${last24hrWords.chatID} = ${chat_id}`);

    const chatMap = new Map<string | number, Map<string, number>>();
    console.log("chatWords", chatWords)


    for (const row of chatWords) {
        if (!chatMap.has(row.chatID.toString())) {
            chatMap.set(row.chatID.toString(), new Map());
        }
        
        const wordMap = chatMap.get(row.chatID.toString())!;
        wordMap.set(row.word, (wordMap.get(row.word) || 0) + row.freq);
    }

    for (const [chatID, wordMap] of chatMap) {
        const sortedWords = Array.from(wordMap.entries())
            .map(([word, freq]) => ({ word, freq }))
            .sort((a, b) => b.freq - a.freq)
            .slice(0, 100);

        const imagePath = `wordcloud_${chatID}.png`;
        createWordCloud(sortedWords, imagePath);
        
        try {
            await bot.api.sendPhoto(
                Number(chatID),
                new InputFile(imagePath),
                {
                    caption: "Облако слов за последние 24 часа\n\nЧтоб посмотреть свое напишите команду /me или /me_24h (для 24 часовой версии)\n\nЧтоб запретить боту собирать ваши данные напишите /dont_save_my_data или /save_my_data чтоб разрешить обратно"
                }
            );

        fs.unlinkSync(imagePath);

        } catch (error) {
            console.error(`Failed to send to chat ${chatID}:`, error);
            if (fs.existsSync(imagePath)) {
                fs.unlinkSync(imagePath);
            }
        }       
        console.log(`Chat ${chatID} top words:`, sortedWords);
    }
})

// sending word cloud of user's words
bot.command("me", async (ctx) => {
    const user_id = ctx.from?.id;
    if (!user_id) {
        console.log("No user_id in /index.ts/bot.command/me");
        return;
    }

    const userWords = await db.select({
        word: wordsTable.word,
        freq: wordsTable.freq
    })
    .from(wordsTable)
    .where(sql`${wordsTable.userID} = ${user_id}`)
    .orderBy(sql`${wordsTable.freq} DESC`)
    .limit(100);

    if (userWords.length < 10) {
        await ctx.reply("У бота недостаточно данных, чтоб создать облако слов - надо чето писать в чаты где есть этот бот");
        return;
    }

    const sortedWords = userWords.map(row => ({ word: row.word, freq: row.freq }));
    const imagePath = `wordcloud_me_${user_id}.png`;
    
    createWordCloud(sortedWords, imagePath);

    try {
        await ctx.replyWithPhoto(
            new InputFile(imagePath),
            {
                caption: "Держи свое облако слов за все время\n\nЧтоб отключить сбор данных для своего айди - нажми /dont_save_my_data, дополнительно это удалит все данные о тебе"
            }
        );

        fs.unlinkSync(imagePath);
    } catch (error) {
        console.error("/index.ts/bot.command/me error:", error);
        if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
        }
        await ctx.reply("Произошла ошибка при создании облака слов, киньте ишью на гитхаб, мейнтейнер починит");
    }
});

// sending word cloud of user's words in 24h frame
bot.command("me_24h", async (ctx) => {        
    const user_id = ctx.from?.id;
    if (!user_id) {
        console.log("No user_id in /index.ts/bot.command/me_24h");
        return;
    }
    
    const userWords = await db.select({
        word: last24hrWords.word,
        freq: last24hrWords.freq
    })
    .from(last24hrWords)
    .where(sql`${last24hrWords.userID} = ${user_id}`)
    .orderBy(sql`${last24hrWords.freq} DESC`)
    .limit(100);
    
    if (userWords.length < 10) {
        await ctx.reply("У бота недостаточно данных, чтоб создать облако слов - надо чето писать в чаты где есть этот бот");
        return;
    }
    
    const sortedWords = userWords.map(row => ({ word: row.word, freq: row.freq }));
    const imagePath = `wordcloud_me_${user_id}.png`;
    
    createWordCloud(sortedWords, imagePath);
    
    try {
        await ctx.replyWithPhoto(
            new InputFile(imagePath),
            {
                caption: "Держи свое облако слов за последние 24 часа\n\nЧтоб отключить сбор данных для своего айди - нажми /dont_save_my_data, дополнительно это удалит все данные о тебе"
            }
        );
    
        fs.unlinkSync(imagePath);
    } catch (error) {
        console.error("/index.ts/bot.command/me_24h error:", error);
        if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
        }
        await ctx.reply("Произошла ошибка при создании облака слов, киньте ишью на гитхаб, мейнтейнер починит");
    }
})

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

bot.start().catch((e) => {
    console.error(e instanceof Error ? e.message : e)
});

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

// every 00:00 sending word cloud image to all chats excluding personal
cron.schedule('0 0 * * *', async () => {
    const chatWords = await db.select({
        chatID: last24hrWords.chatID,
        userID: last24hrWords.userID,
        word: last24hrWords.word,
        freq: last24hrWords.freq
    })
    .from(last24hrWords)
    .where(sql`${last24hrWords.chatID} != ${last24hrWords.userID}`);

    const chatMap = new Map<string | number, Map<string, number>>();
    console.log("chatWords", chatWords)


    for (const row of chatWords) {
        if (!chatMap.has(row.chatID.toString())) {
            chatMap.set(row.chatID.toString(), new Map());
        }
        
        const wordMap = chatMap.get(row.chatID.toString())!;
        wordMap.set(row.word, (wordMap.get(row.word) || 0) + row.freq);
    }

    for (const [chatID, wordMap] of chatMap) {
        const sortedWords = Array.from(wordMap.entries())
            .map(([word, freq]) => ({ word, freq }))
            .sort((a, b) => b.freq - a.freq)
            .slice(0, 100);

        const imagePath = `wordcloud_${chatID}.png`;
        createWordCloud(sortedWords, imagePath);
        
        try {
            await bot.api.sendPhoto(
                Number(chatID),
                new InputFile(imagePath),
                {
                    caption: "Облако слов за последние 24 часа\n\nЧтоб посмотреть свое напишите команду /me или /me_24h (для 24 часовой версии)\n\nЧтоб запретить боту собирать ваши данные напишите /dont_save_my_data или /save_my_data чтоб разрешить обратно"
                }
            );

        fs.unlinkSync(imagePath);

        } catch (error) {
            console.error(`Failed to send to chat ${chatID}:`, error);
            if (fs.existsSync(imagePath)) {
                fs.unlinkSync(imagePath);
            }
        }       
        console.log(`Chat ${chatID} top words:`, sortedWords);
    }
});