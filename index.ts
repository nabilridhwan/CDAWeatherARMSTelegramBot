import {Telegraf, Markup} from 'telegraf'
import schedule from 'node-schedule'
import {getAirTempFromLatLng, getWGBTFromLatLng} from "./api/weather";
import 'dotenv/config'
import {CDA, HTTC} from "./utils/locations";
import getWBGTEmoji from "./utils/getWBGTEmoji";
import logger from "./utils/logger";

const bot = new Telegraf(process.env.BOT_ID!)

let subscribedChatIds: number[] = [];


const job = schedule.scheduleJob("45 9-15/2 * * 1-5", async (fireDate) => {
    for (let chatId of subscribedChatIds) {
        try {
            const cdaWGBT = await getWGBTFromLatLng(CDA.latitude, CDA.longitude);
            const cdaAirTemp = await getAirTempFromLatLng(CDA.latitude, CDA.longitude);
            const httcWGBT = await getWGBTFromLatLng(HTTC.latitude, HTTC.longitude);
            const httcAirTemp = await getAirTempFromLatLng(HTTC.latitude, HTTC.longitude);

            const reply = `*CDA*:\n🌡️ Heat Stress: ${cdaWGBT.heatStress} ${getWBGTEmoji(cdaWGBT.heatStress)}\n🌍 WBGT: ${cdaWGBT.wbgt} °C\n🌬️ Air Temp: ${cdaAirTemp.value} °C\n\n*HTTC*:\n🌡️ Heat Stress: ${httcWGBT.heatStress} ${getWBGTEmoji(httcWGBT.heatStress)}\n🌍 WBGT: ${httcWGBT.wbgt} °C\n🌬️ Air Temp: ${httcAirTemp.value} °C\n\nLast updated: ${new Date(cdaWGBT.dateTime).toLocaleString('en-SG', {timeZone: 'Asia/Singapore'})}.\nJob date: ${new Date(fireDate).toLocaleString('en-SG', {timeZone: 'Asia/Singapore'})}\nNext Update: ${new Date(job.nextInvocation()).toLocaleString('en-SG', {timeZone: 'Asia/Singapore'})}`

            const replacedReply = reply
                .replaceAll(".", "\\.")
                .replaceAll("(", "\\(")
                .replaceAll(")", "\\)")

            await bot.telegram.sendMessage(chatId, replacedReply, {parse_mode: "MarkdownV2"});
            logger.info(`Weather report sent to chat ID: ${chatId} at ${new Date().toLocaleString('en-SG', {timeZone: 'Asia/Singapore'})}`);
        } catch (error) {
            logger.error("Error fetching weather data:", error);
            await bot.telegram.sendMessage(chatId, "Failed to fetch weather data. Try /weather command to get the latest data.");
        }
    }
})

bot.start((ctx) => {

    const isChatSubscribed = subscribedChatIds.includes(ctx.chat.id);

    if(isChatSubscribed){
        ctx.reply(`Welcome back 👋🏻
You're already subscribed to receive weather updates for CDA and HTTC.
Next update: ${new Date(job.nextInvocation()).toLocaleString('en-SG', {timeZone: 'Asia/Singapore'})}
You can also use the /weather command to get the latest weather data on demand.`)
    }else{


    ctx.reply("Welcome 👋🏻\nYou're all set to receive weather updates for CDA and HTTC.\nI will send it at: 09:45, 11:45, 13:45 and 15:45 only on Weekdays.\nYou can also use the /weather command to get the latest weather data on demand.")
    }

    subscribedChatIds = [...new Set([...subscribedChatIds, ctx.chat.id])]; // Add the chat ID to the list if it's not already present

    logger.info(`Start command called by Chat ID: ${ctx.chat.id}. Next update at ${new Date(job.nextInvocation()).toLocaleString('en-SG', {timeZone: 'Asia/Singapore'})}`);
    logger.info(`No. of Subscribed Chat IDs: ${subscribedChatIds.length}`)
})

bot.help((ctx) => {
    ctx.reply("I can provide you with the weather data for CDA and HTTC for use with ARMS. Just type /start to begin.",)
})

bot.command("weather", async (ctx) => {

    logger.info("Weather command called by user: " + ctx.from.username + " (ID: " + ctx.from.id + ") in chat ID: " + ctx.chat.id);

    try {
        const cdaWGBT = await getWGBTFromLatLng(CDA.latitude, CDA.longitude);
        const cdaAirTemp = await getAirTempFromLatLng(CDA.latitude, CDA.longitude);
        const httcWGBT = await getWGBTFromLatLng(HTTC.latitude, HTTC.longitude);
        const httcAirTemp = await getAirTempFromLatLng(HTTC.latitude, HTTC.longitude);

        const reply = `*CDA*:\n🌡️ Heat Stress: ${cdaWGBT.heatStress} ${getWBGTEmoji(cdaWGBT.heatStress)}\n🌍 WBGT: ${cdaWGBT.wbgt} °C\n🌬️ Air Temp: ${cdaAirTemp.value} °C\n\n*HTTC*:\n🌡️ Heat Stress: ${httcWGBT.heatStress} ${getWBGTEmoji(httcWGBT.heatStress)}\n🌍 WBGT: ${httcWGBT.wbgt} °C\n🌬️ Air Temp: ${httcAirTemp.value} °C\n\nLast updated: ${new Date(cdaWGBT.dateTime).toLocaleString('en-SG', {timeZone: 'Asia/Singapore'})}`

        const replacedReply = reply
            .replaceAll(".", "\\.")
            .replaceAll("(", "\\(")
            .replaceAll(")", "\\)")

        await ctx.replyWithMarkdownV2(replacedReply)

        logger.info("Weather data sent to user: " + ctx.from.username + " (ID: " + ctx.from.id + ") in chat ID: " + ctx.chat.id);

    } catch (error) {
        logger.error("Error fetching weather data:", error);
        ctx.reply("Failed to fetch weather data. Try /weather command to get the latest data.");
    }
})

bot.launch(() => {
    logger.info("Bot started successfully.")
})

// Enable graceful stop
process.once('SIGINT', () => {
    logger.info("Bot stopped gracefully.");
    bot.stop('SIGINT');
})

process.once('SIGTERM', () => {
    logger.info("Bot stopped gracefully.");
    bot.stop('SIGTERM');
})

process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception:', err);
    // Log the error, perform cleanup, and potentially restart the application.
    // It's crucial to exit the process after handling uncaught exceptions.
    process.exit(1); // Exit with a non-zero code to indicate an error.
});


