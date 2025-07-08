import {Telegraf} from "telegraf";
import schedule from "node-schedule";
import redis from "./redis";
import logger from "./logger";
import {getAirTempFromLatLng, getWGBTFromLatLng} from "../api/weather";
import {CDA, HTTC} from "./locations";
import getWBGTEmoji from "./getWBGTEmoji";
import {readFile} from "node:fs/promises";

export const bot = new Telegraf(process.env.BOT_ID!)

// Cron rule to run every weekday at 09:50, 11:50, 13:50, and 15:50 in Singapore timezone
const rule = new schedule.RecurrenceRule()
rule.dayOfWeek = new schedule.Range(1, 5) // Monday to Friday
rule.hour = [9, 11, 13, 15]
rule.minute = 50
rule.tz = "Singapore"

export const job = schedule.scheduleJob(rule, async (fireDate) => {
    try {
        let subscribedChatIds = await redis.smembers("subscribed_chat_ids");

        if (subscribedChatIds.length === 0) {
            logger.info("No subscribed chat IDs found. Skipping weather report.");
            return;
        }

        const [cdaWBGT, cdaAirTemp, httcWBGT, httcAirTemp] = await Promise.all([
            getWGBTFromLatLng(CDA.latitude, CDA.longitude),
            getAirTempFromLatLng(CDA.latitude, CDA.longitude),
            getWGBTFromLatLng(HTTC.latitude, HTTC.longitude),
            getAirTempFromLatLng(HTTC.latitude, HTTC.longitude)
        ])

        const reply = `*CDA*:\n🌡️ Heat Stress: ${cdaWBGT.heatStress} ${getWBGTEmoji(cdaWBGT.heatStress)}\n🌍 WBGT: ${cdaWBGT.wbgt} °C\n🌬️ Air Temp: ${cdaAirTemp.value} °C\n\n*HTTC*:\n🌡️ Heat Stress: ${httcWBGT.heatStress} ${getWBGTEmoji(httcWBGT.heatStress)}\n🌍 WBGT: ${httcWBGT.wbgt} °C\n🌬️ Air Temp: ${httcAirTemp.value} °C\n\nLast updated: ${new Date(cdaWBGT.dateTime).toLocaleString('en-SG', {timeZone: 'Asia/Singapore'})}.\nJob date: ${new Date(fireDate).toLocaleString('en-SG', {timeZone: 'Asia/Singapore'})}\nNext Update: ${new Date(job.nextInvocation()).toLocaleString('en-SG', {timeZone: 'Asia/Singapore'})}`

        const replacedReply = reply
            .replaceAll(".", "\\.")
            .replaceAll("(", "\\(")
            .replaceAll(")", "\\)")

        const sendingChatPromises = await Promise.allSettled(
            subscribedChatIds.map(chatId => bot.telegram.sendMessage(chatId, replacedReply, {parse_mode: "MarkdownV2"}).catch((err) => {
                return bot.telegram.sendMessage(chatId, "Failed to fetch weather data. Try /weather command to get the latest data.");
            }))
        )

        sendingChatPromises.map((result => {
            if (result.status === 'rejected') {
                logger.error(`Failed to send message: ${result.reason}`);
            } else {
                logger.info(`Weather report sent to chat ID: ${result.value.chat.id}`);
            }
        }))

        logger.info("Weather report sent to all subscribed chat IDs at " + new Date().toLocaleString('en-SG', {timeZone: 'Asia/Singapore'}));

    } catch (error) {
        logger.error("Error fetching weather data:", error);
    }
})

bot.start(async (ctx) => {
    logger.info(`Start command called by Chat ID: ${ctx.chat.id}. Next update at ${new Date(job.nextInvocation()).toLocaleString('en-SG', {timeZone: 'Asia/Singapore'})}`);

    const [loadingMessage, isChatSubscribed] = await Promise.all([
        await ctx.reply("⏳ Loading..."),
        await redis.sismember("subscribed_chat_ids", ctx.chat.id)
    ])

    if (isChatSubscribed) {
        const msg = `Welcome back 👋🏻👍🏻
        
You're already subscribed to receive weather updates for CDA and HTTC.

You can also use the /weather command to get the latest weather data on demand.

Reply with /stop to unsubscribe from the weather updates.

Next update: ${new Date(job.nextInvocation()).toLocaleString('en-SG', {timeZone: 'Asia/Singapore'})}`

        ctx.telegram.editMessageText(
            ctx.chat.id,
            loadingMessage.message_id,
            undefined,
            msg,
        )

        logger.info("Chat ID: " + ctx.chat.id + " is already subscribed. No action taken.");
        return;
    }

    const msg = `Welcome 👋🏻

You're now subscribed to receive weather updates for CDA and HTTC.

Weather reports will be sent automatically every weekday at 09:50, 11:50, 13:50, and 15:50 Singapore time.

You can also use the /weather command to get the latest weather data on demand.

Reply with /stop to unsubscribe from the weather updates.`

    await redis.sadd("subscribed_chat_ids", ctx.chat.id);

    ctx.telegram.editMessageText(
        ctx.chat.id,
        loadingMessage.message_id,
        undefined,
        msg,
    )

    logger.info("Added Chat ID: " + ctx.chat.id + " to subscribed chat IDs.");

    logger.info(`No. of Subscribed Chat IDs: ${await redis.scard("subscribed_chat_ids")}`);
})

bot.help((ctx) => {
    ctx.reply(`This bot provides you with the weather data for CDA and HTTC for use with ARMS.
It'll send you updates automatically every weekday at 09:50, 11:50, 13:50, and 15:50 Singapore time every weekday.

Just type /start to begin.
If you want to stop receiving updates, type /stop.
    `)
})

bot.command("weather", async (ctx) => {

    logger.info("Weather command called by user: " + ctx.from.username + " (ID: " + ctx.from.id + ") in chat ID: " + ctx.chat.id);

    const loadingMessage = await ctx.reply("⏳ Loading...")

    try {
        const [cdaWBGT, cdaAirTemp, httcWBGT, httcAirTemp] = await Promise.all([
            getWGBTFromLatLng(CDA.latitude, CDA.longitude),
            getAirTempFromLatLng(CDA.latitude, CDA.longitude),
            getWGBTFromLatLng(HTTC.latitude, HTTC.longitude),
            getAirTempFromLatLng(HTTC.latitude, HTTC.longitude)
        ])

        const reply = `*CDA*:\n🌡️ Heat Stress: ${cdaWBGT.heatStress} ${getWBGTEmoji(cdaWBGT.heatStress)}\n🌍 WBGT: ${cdaWBGT.wbgt} °C\n🌬️ Air Temp: ${cdaAirTemp.value} °C\n\n*HTTC*:\n🌡️ Heat Stress: ${httcWBGT.heatStress} ${getWBGTEmoji(httcWBGT.heatStress)}\n🌍 WBGT: ${httcWBGT.wbgt} °C\n🌬️ Air Temp: ${httcAirTemp.value} °C\n\nLast updated: ${new Date(cdaWBGT.dateTime).toLocaleString('en-SG', {timeZone: 'Asia/Singapore'})}`

        const replacedReply = reply
            .replaceAll(".", "\\.")
            .replaceAll("(", "\\(")
            .replaceAll(")", "\\)")


        await ctx.telegram.editMessageText(
            ctx.chat.id,
            loadingMessage.message_id,
            undefined,
            replacedReply,
            {parse_mode: "MarkdownV2"}
        )

        logger.info("Weather data sent to user: " + ctx.from.username + " (ID: " + ctx.from.id + ") in chat ID: " + ctx.chat.id);

    } catch (error) {
        logger.error("Error fetching weather data:", error);
        await ctx.telegram.editMessageText(
            ctx.chat.id,
            loadingMessage.message_id,
            undefined,
            "Failed to fetch weather data. Try /weather command to get the latest data."
        )
    }
})

bot.command("stop", async (ctx) => {
    const chatId = ctx.chat.id;

    const [loadingMessage, isChatSubscribed] = await Promise.all([
        await ctx.reply("⏳ Loading..."),
        await redis.sismember("subscribed_chat_ids", ctx.chat.id)
    ])

    if (!isChatSubscribed) {
        await ctx.telegram.editMessageText(
            ctx.chat.id,
            loadingMessage.message_id,
            undefined,
            "You are not subscribed to weather updates. Use /start to subscribe."
        )
        logger.info(`Stop command called by Chat ID: ${chatId}. No action taken as the chat is not subscribed.`);
        logger.info(`No. of Subscribed Chat IDs: ${await redis.scard("subscribed_chat_ids")}`);
        return;
    }

    await redis.srem("subscribed_chat_ids", chatId);
    await ctx.telegram.editMessageText(
        ctx.chat.id,
        loadingMessage.message_id,
        undefined,
        "You have been unsubscribed from weather updates. Use /start to subscribe to the updates again."
    )

    logger.info(`Stop command called by Chat ID: ${chatId}.`);
    logger.info(`No. of Subscribed Chat IDs: ${await redis.scard("subscribed_chat_ids")}`);
})

bot.command("logs", async (ctx) => {
    logger.info("Logs command called by user: " + ctx.from.username);
    try {
        // Read logs from the logs/app.log file
        const logs = await readFile("logs/app.log", "utf8")
        logs.split("\n").slice(-12).join("\n")
        await ctx.reply("Here are the last 10 lines of the logs:\n" + logs.split("\n").slice(-10).join("\n"))
        logger.info("Sent logs to user: " + ctx.from.username + " (ID: " + ctx.from.id + ") in chat ID: " + ctx.chat.id);
    } catch (error) {
        logger.error("Error reading logs:", error);
        await ctx.reply("Failed to read logs. Please try again later.");
    }
})


