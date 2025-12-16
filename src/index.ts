import { Bot } from "grammy";
import dotenv from "dotenv"
dotenv.config()

const { TELEGRAM_BOT_TOKEN } = process.env

if (!TELEGRAM_BOT_TOKEN) {
    throw new Error("Telegram bot token is not set, you need to provide it to .env file like in .env.example")
}

const bot = new Bot(TELEGRAM_BOT_TOKEN); 

bot.on("message", async (ctx) => {
    console.log(ctx.msg)
    // nothing for now
});

bot.start();