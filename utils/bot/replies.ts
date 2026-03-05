import { job } from '../../bot';
import getNextUpdateDateForRota from '../schedule/getNextUpdateDateForRota';
import { WeatherReadings } from '../weather/fetchWeatherReadings';
import getWBGTEmoji from '../weather/getWBGTEmoji';
import { WorkingSchedule } from './subscriptions';

type WeatherSnapshot = {
  heatStress: string;
  wbgt: string;
  airTemp: number;
  emoji: string;
  dateTime: string;
};

function formatSingaporeDate(date: Date | string) {
  return new Date(date).toLocaleString('en-SG', { timeZone: 'Asia/Singapore' });
}

export function escapeMarkdownV2(reply: string) {
  return reply
    .replaceAll('.', '\\.')
    .replaceAll('(', '\\(')
    .replaceAll(')', '\\)');
}

export function buildWeatherReply(
  cda: WeatherSnapshot,
  httc: WeatherSnapshot,
  options?: {
    jobDate?: Date;
    nextUpdate?: Date;
  },
) {
  const baseReply = `*CDA*:\n🌡️ Heat Stress: ${cda.heatStress} ${cda.emoji}\n🌍 WBGT: ${cda.wbgt} °C\n🌬️ Air Temp: ${cda.airTemp} °C\n\n*HTTC*:\n🌡️ Heat Stress: ${httc.heatStress} ${httc.emoji}\n🌍 WBGT: ${httc.wbgt} °C\n🌬️ Air Temp: ${httc.airTemp} °C\n\nLast updated: ${formatSingaporeDate(cda.dateTime)}`;

  if (!options?.jobDate || !options?.nextUpdate) {
    return baseReply;
  }

  return `${baseReply}.\nJob date: ${formatSingaporeDate(options.jobDate)}\nNext Update: ${formatSingaporeDate(options.nextUpdate)}`;
}

export function buildAlreadySubscribedMessage(
  rotaNumber: WorkingSchedule,
  nextUpdate: Date,
) {
  const schedule =
    rotaNumber === 'office_hours' ? 'Office Hours' : `Rota ${rotaNumber}`;

  return `👋🏻 You're already subscribed to the CDA ARMS Weather Bot!

You are currently on *${schedule}* and will receive weather updates accordingly.

Next update: ${formatSingaporeDate(nextUpdate)}

Use /settings to change your schedule or unsubscribe.`;
}

export const WELCOME_SUBSCRIBED_MESSAGE = `👋🏻 Welcome to the CDA ARMS Weather Bot!

This bot automatically sends you WBGT and heat stress updates for CDA and HTTC — 10 minutes before each ARMS Weather Report deadline, so you can submit your report without manually checking myENV.

Reports are sent every weekday at 09:50, 11:50, 13:50, and 15:50 SGT.

*Getting started:*
1️⃣ Select your rota below to receive updates on your working days
2️⃣ Or select "Office Hours" to receive updates every weekday
3️⃣ Use /weather anytime to get a live snapshot of the current weather data

Use /settings to change your schedule or unsubscribe at any time.`;

export function buildSettingsMessages(rotaNumber: number | 'office_hours') {
  const schedule =
    rotaNumber === 'office_hours' ? 'Office Hours' : `Rota ${rotaNumber}`;

  return `⚙️ *Settings*

You are currently on *${schedule}* and will receive weather updates accordingly.

To change your schedule, select a different option below. To stop updates, press the *Stop Updates* button below.`;
}

export const INVALID_ROTA_MESSAGE =
  'Please provide a valid rota number (1, 2, or 3). Example: /setrota 1';

export const INVALID_ROTA_RANGE_MESSAGE =
  'Invalid rota number. Please provide a valid rota number (1, 2, or 3). Example: /setrota 1';

export const SETROTA_ERROR_MESSAGE =
  'An error occurred while setting your rota. Please try again later.';

export function buildRotaSetSuccessMessage(rota: WorkingSchedule) {
  const date = getNextUpdateDateForRota(rota) ?? new Date(job.nextInvocation());

  if (rota === 'office_hours') {
    return `✅ You're subscribed to Office Hours. You will receive weather updates every weekday. To change your schedule or stop updates, use the /settings command.
    
Next update: ${formatSingaporeDate(date)}
    `;
  }

  return `✅ You're subscribed to Rota ${rota}. You will receive weather updates on your rota working days. To change your rota or stop updates, use the /settings command.

Next update: ${formatSingaporeDate(date)}
  `;
}

export const HELP_MESSAGE = `🤖 *CDA ARMS Weather Bot — Help*

This bot sends you WBGT and heat stress updates for CDA and HTTC, 10 minutes before each ARMS Weather Report deadline — so you don't have to manually check myENV.

Reports are sent every weekday at 09:50, 11:50, 13:50, and 15:50 SGT.

Use /settings to change your schedule or stop receiving updates.`;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getStatusCode(error: unknown): string {
  if (!isObject(error)) {
    return 'UNKNOWN';
  }

  const status =
    error.status ??
    (isObject(error.response) ? error.response.status : undefined);

  if (typeof status === 'number') {
    return String(status);
  }

  if (typeof status === 'string' && status.trim().length > 0) {
    return status;
  }

  return 'UNKNOWN';
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (!isObject(error)) {
    return 'Unknown error';
  }

  const responseData = isObject(error.response)
    ? error.response.data
    : undefined;

  if (typeof responseData === 'string' && responseData.trim().length > 0) {
    return responseData;
  }

  if (isObject(responseData)) {
    const messageFromData = responseData.message ?? responseData.error;
    if (
      typeof messageFromData === 'string' &&
      messageFromData.trim().length > 0
    ) {
      return messageFromData;
    }
  }

  if (typeof error.message === 'string' && error.message.trim().length > 0) {
    return error.message;
  }

  return 'Unknown error';
}

export function buildEscapedWeatherReply(
  readings: WeatherReadings,
  options?: {
    jobDate?: Date;
    nextUpdate?: Date;
  },
) {
  const reply = buildWeatherReply(
    {
      heatStress: readings.cdaWBGT.heatStress,
      wbgt: readings.cdaWBGT.wbgt,
      airTemp: readings.cdaAirTemp.value,
      emoji: getWBGTEmoji(readings.cdaWBGT.heatStress),
      dateTime: readings.cdaWBGT.dateTime,
    },
    {
      heatStress: readings.httcWBGT.heatStress,
      wbgt: readings.httcWBGT.wbgt,
      airTemp: readings.httcAirTemp.value,
      emoji: getWBGTEmoji(readings.httcWBGT.heatStress),
      dateTime: readings.httcWBGT.dateTime,
    },
    options,
  );

  return escapeMarkdownV2(reply);
}

export function buildWeatherFetchFailedMessage(error: unknown): string {
  return `⚠️ Couldn't fetch weather data. Please try /weather again in a few moments.\n\nStatus code: ${getStatusCode(error)}\nError: ${getErrorMessage(error)}`;
}

export const NOT_SUBSCRIBED_MESSAGE = `You're not subscribed to any weather updates. Use /start to get set up.`;

export const STOP_SUCCESS_MESSAGE = `✅ You've been unsubscribed from weather updates. Use /start anytime to resubscribe.`;

export const LOADING_MESSAGE = '⏳ Loading...';
