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

export function buildAlreadySubscribedMessage(params: {
  isSubscribedToRota1: number;
  isSubscribedToRota2: number;
  isSubscribedToRota3: number;
  nextUpdate: Date;
}) {
  const {
    isSubscribedToRota1,
    isSubscribedToRota2,
    isSubscribedToRota3,
    nextUpdate,
  } = params;

  return `Welcome back 👋🏻
        
You're already subscribed to receive weather updates for CDA and HTTC.

You are currently subscribed to: ${isSubscribedToRota1 ? 'Rota 1' : isSubscribedToRota2 ? 'Rota 2' : isSubscribedToRota3 ? 'Rota 3' : 'All Weekdays'} and will receive notifications accordingly.

You may use the /weather command to get the latest weather data on demand.

Reply with /stop to unsubscribe from the weather updates.

Next update: ${formatSingaporeDate(nextUpdate)}`;
}

export const WELCOME_SUBSCRIBED_MESSAGE = `Welcome 👋🏻
  
You're now subscribed to receive weather updates for CDA and HTTC.

Weather reports will be sent automatically every weekday at 09:50, 11:50, 13:50, and 15:50 Singapore time.

You can also use the /weather command to get the latest weather data on demand.

You can also set your rota using /setrota command (e.g. /setrota 1) to receive the alerts on your rota working shifts.

Reply with /stop to unsubscribe from the weather updates.`;

export const INVALID_ROTA_MESSAGE =
  'Please provide a valid rota number (1, 2, or 3). Example: /setrota 1';

export const INVALID_ROTA_RANGE_MESSAGE =
  'Invalid rota number. Please provide a valid rota number (1, 2, or 3). Example: /setrota 1';

export const SETROTA_ERROR_MESSAGE =
  'An error occurred while setting your rota. Please try again later.';

export function buildRotaSetSuccessMessage(rota: number) {
  return `Your rota has been set to Rota ${rota}. You will receive weather updates on your rota days. If you want to receive updates every weekday, please use /start command to subscribe without setting a rota.`;
}

export const HELP_MESSAGE = `This bot provides you with the weather data for CDA and HTTC for use with ARMS.
It'll send you updates automatically every weekday at 09:50, 11:50, 13:50, and 15:50 Singapore time every weekday.

Just type /start to begin.

Set your rota using /setrota command to receive the alerts on your rota days. (e.g. /setrota 1)

If you want to stop receiving updates, type /stop.
    `;

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

export function buildWeatherFetchFailedMessage(error: unknown): string {
  return `Failed to fetch weather data.\nStatus code: ${getStatusCode(error)}\nError: ${getErrorMessage(error)}\n\nPlease retry with /weather`;
}

export const STOP_SUCCESS_MESSAGE =
  'You have been unsubscribed from weather updates. Use /start to subscribe to the updates again.';

export const LOADING_MESSAGE = '⏳ Loading...';
