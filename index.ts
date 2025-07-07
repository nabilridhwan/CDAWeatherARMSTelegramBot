import {Telegraf, Markup} from 'telegraf'
import schedule from 'node-schedule'
import {CDA, HTTC, getAirTempFromLatLng, getWGBTFromLatLng, getWBGTEmoji} from "./api/weather";
import 'dotenv/config'

const bot = new Telegraf(process.env.BOT_ID!)

bot.start((ctx) => {
    ctx.reply("Welcome 👋🏻\nYou're all set to receive weather updates for CDA and HTTC.\nI will send it at: 0945, 1145, 1345 and 1545 only on Weekdays.\nYou can also use the /weather command to get the latest weather data on demand.")

    const job = schedule.scheduleJob("45 9-15/2 * * 1-5", async (fireDate) => {
        try {
            const cdaWGBT = await getWGBTFromLatLng(CDA.latitude, CDA.longitude);
            const cdaAirTemp = await getAirTempFromLatLng(CDA.latitude, CDA.longitude);
            const httcWGBT = await getWGBTFromLatLng(HTTC.latitude, HTTC.longitude);
            const httcAirTemp = await getAirTempFromLatLng(HTTC.latitude, HTTC.longitude);

            const reply = `*CDA*:\n🌡️ Heat Stress: ${cdaWGBT.heatStress} ${getWBGTEmoji(cdaWGBT.heatStress)}\n🌍 WBGT: ${cdaWGBT.wbgt} °C\n🌬️ Air Temp: ${cdaAirTemp.value} °C\n\n*HTTC*:\n🌡️ Heat Stress: ${httcWGBT.heatStress} ${getWBGTEmoji(httcWGBT.heatStress)}\n🌍 WBGT: ${httcWGBT.wbgt} °C\n🌬️ Air Temp: ${httcAirTemp.value} °C\n\nLast updated: ${new Date(cdaWGBT.dateTime).toLocaleString('en-SG', {timeZone: 'Asia/Singapore'})}.\nNext Update:${new Date(job.nextInvocation()).toLocaleString('en-SG', {timeZone: 'Asia/Singapore'})}\nWeather data provided by the National Environment Agency (NEA) of Singapore.`

            const replacedReply = reply
                .replaceAll(".", "\\.")
                .replaceAll("(", "\\(")
                .replaceAll(")", "\\)")


            await ctx.replyWithMarkdownV2(replacedReply)
        } catch (error) {
            console.error("Error fetching weather data:", error);
            ctx.reply("Failed to fetch weather data. Try /weather command to get the latest data.");
        }
    })


    console.log("Scheduled job started to send weather report.")
})
bot.help((ctx) => {
    ctx.reply("I can provide you with the weather data for CDA and HTTC for use with ARMS. Just type /start to begin.", )
})

bot.command("weather", async (ctx) => {
    try {
        const cdaWGBT = await getWGBTFromLatLng(CDA.latitude, CDA.longitude);
        const cdaAirTemp = await getAirTempFromLatLng(CDA.latitude, CDA.longitude);
        const httcWGBT = await getWGBTFromLatLng(HTTC.latitude, HTTC.longitude);
        const httcAirTemp = await getAirTempFromLatLng(HTTC.latitude, HTTC.longitude);

        const reply = `*CDA*:\n🌡️ Heat Stress: ${cdaWGBT.heatStress} ${getWBGTEmoji(cdaWGBT.heatStress)}\n🌍 WBGT: ${cdaWGBT.wbgt} °C\n🌬️ Air Temp: ${cdaAirTemp.value} °C\n\n*HTTC*:\n🌡️ Heat Stress: ${httcWGBT.heatStress} ${getWBGTEmoji(httcWGBT.heatStress)}\n🌍 WBGT: ${httcWGBT.wbgt} °C\n🌬️ Air Temp: ${httcAirTemp.value} °C\n\nLast updated: ${new Date(cdaWGBT.dateTime).toLocaleString('en-SG', {timeZone: 'Asia/Singapore'})}\nWeather data provided by the National Environment Agency (NEA) of Singapore.`

        const replacedReply = reply
            .replaceAll(".", "\\.")
            .replaceAll("(", "\\(")
            .replaceAll(")", "\\)")

        await ctx.replyWithMarkdownV2(replacedReply)

    } catch (error) {
        console.error("Error fetching weather data:", error);
        ctx.reply("Failed to fetch weather data. Try /weather command to get the latest data.");
    }
})

bot.launch(() => {
    console.log("Bot started successfully.")
})

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))


