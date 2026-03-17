import axios from 'axios';
import axiosRetry from 'axios-retry';
import { format } from 'date-fns/format';
import { parseISO } from 'date-fns/parseISO';
import haversine from 'haversine-distance';
import { env } from '../utils/infra/env';
import logger from '../utils/infra/logger';
import type {
  AirTempStation,
  BaseResponse,
  Coordinate,
  WBGTResponse,
  WbgtReading,
} from './types/weather';

export namespace Lightning {
  const DATA_GOV_TIMEOUT_MS = 5_000;
  const DATA_GOV_MAX_RETRIES = 2;
  const DATA_GOV_BASE_BACKOFF_MS = 300;

  const LIGHTNING_API_URL =
    'https://api-open.data.gov.sg/v2/real-time/api/weather?api=lightning';

  function dataGovRequestConfig() {
    return {
      headers: {
        'x-api-key': env.DATA_GOV_API_KEY,
      },
      timeout: DATA_GOV_TIMEOUT_MS,
    };
  }

  axiosRetry(axios, {
    retries: DATA_GOV_MAX_RETRIES,
    retryCondition: (error) => isRetryableWeatherError(error),
    retryDelay: (retryCount, error) => {
      const retryAfterHeader = error.response?.headers?.['retry-after'];
      const retryAfterSeconds = Number(retryAfterHeader);

      if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
        return retryAfterSeconds * 1_000;
      }

      const jitter = Math.floor(Math.random() * 100);
      return DATA_GOV_BASE_BACKOFF_MS * Math.pow(2, retryCount - 1) + jitter;
    },
    onRetry: (retryCount, error, requestConfig) => {
      logger.warn(
        `Retrying data.gov request to ${requestConfig.url ?? 'unknown url'} (attempt ${retryCount}/${DATA_GOV_MAX_RETRIES}) after transient error: ${error.message}`,
      );
    },
  });

  function isRetryableWeatherError(error: unknown): boolean {
    if (!axios.isAxiosError(error)) {
      return false;
    }

    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return true;
    }

    if (!error.response) {
      return true;
    }

    const status = error.response.status;
    return status === 408 || status === 429 || (status >= 500 && status <= 599);
  }

  async function requestDataGov<T>(
    url: string,
    requestName: 'WBGT' | 'Air Temperature' | 'Lightning',
  ): Promise<BaseResponse<T>> {
    try {
      const response = await axios.get<BaseResponse<T>>(
        url,
        dataGovRequestConfig(),
      );
      return response.data;
    } catch (error) {
      logger.error(`Error fetching ${requestName} data:`, error);
      throw error;
    }
  }

  export namespace Types {
    export enum LightningEvent {
      CLOUD_TO_CLOUD = 'C',
      CLOUD_TO_GROUND = 'G',
    }

    export enum WeatherInformation {
      OBSERVATION = 'observation',
      FORECAST = 'forecast',
    }

    export type LightningObservation = {
      records: Array<{
        datetime: string;
        item: {
          type: WeatherInformation;
          isStationData: boolean;
          readings: Array<{
            location: {
              latitude: string;

              //  The typo "longtitude" is used in the API response, so we have to use it here as well to avoid parsing errors.
              longtitude: string;
            };
            datetime: string;
            text: string;
            type: LightningEvent;
          }>;
        };
        updatedTimestamp: string;
        paginationToken: string;
      }>;
    };
  }

  export namespace Parser {
    export function parseWbgtLocation(
      location: WbgtReading['location'],
    ): Coordinate {
      return {
        latitude: parseFloat(location.latitude),
        longitude: parseFloat(location.longitude),
      };
    }

    /**
     * Get the WBGT emoji based on the heat stress level.
     * @param heatStress
     */
    export function parseWBGTHeatStress(heatStress: string): string {
      const heatStressLower = heatStress.toLowerCase();

      if (heatStressLower === 'low') {
        return '🟢'; // Green for low heat stress
      } else if (heatStressLower === 'moderate') {
        return '🟡'; // Yellow for moderate heat stress
      } else if (heatStressLower.includes('hi')) {
        return '🔴'; // Red for very high heat stress
      } else {
        return '⚪'; // White for unknown or other cases
      }
    }
  }

  export namespace Distance {
    export function distanceBetween(from: Coordinate, to: Coordinate) {
      return haversine(from, to);
    }
  }

  export namespace Defaults {
    export const CDA = {
      latitude: 1.3659363,
      longitude: 103.6898665,
      name: 'Civil Defence Academy',
      shortName: 'CDA',
    };

    export const HTTC = {
      latitude: 1.4063182,
      longitude: 103.759932,
      name: 'Home Team Tactical Centre',
      shortName: 'HTTC',
    };

    export function defaultWbgtResponse(): WBGTResponse {
      return {
        wbgt: '',
        heatStress: '',
        station: {
          id: '',
          name: '',
          townCenter: '',
        },
        location: {
          latitude: -1,
          longitude: -1,
        },
        dateTime: '',
      };
    }

    export function defaultAirTempStation(): AirTempStation {
      return {
        deviceId: '',
        id: '',
        name: '',
        location: {
          latitude: -1,
          longitude: -1,
        },
      };
    }
  }

  export namespace BaseAPI {
    export async function getLightningData() {
      return requestDataGov<Lightning.Types.LightningObservation>(
        LIGHTNING_API_URL,
        'Lightning',
      );
    }
  }

  export async function retrieveLightningData(
    lat: number,
    lng: number,
    locationName: 'CDA' | 'HTTC' | string,
  ) {
    const resData = await BaseAPI.getLightningData();

    const { data } = resData;

    if (data.records.length === 0) {
      return {
        message:
          '⚠️ Unable to retrieve lightning data at this time. Please try again later.',
        last_checked: format(new Date(), 'hh:mm a'),
      };
    }

    let latestRecord = data.records[0];

    if (latestRecord.item.readings.length === 0) {
      const parsedDate = parseISO(latestRecord.datetime);

      return {
        message: '✅ No lightning activity detected across Singapore.',
        last_checked: format(parsedDate, 'hh:mm a'),
      };
    }

    // Check the readings in the latest record and check if they are 10km or less from the lat lng provided by the user. If there are multiple readings within 10km, we will count. Otherwise we will also keep track of the ones that are outside the 10km radius and still show the ones.
    let lightningCount = {
      withinRadius: 0,
      outsideRadius: 0,
    };

    latestRecord.item.readings.forEach((reading) => {
      const readingLat = parseFloat(reading.location.latitude);
      const readingLng = parseFloat(reading.location.longtitude);

      const distance = Lightning.Distance.distanceBetween(
        { latitude: lat, longitude: lng },
        { latitude: readingLat, longitude: readingLng },
      );

      if (distance <= 10_000) {
        lightningCount.withinRadius += 1;
      } else {
        lightningCount.outsideRadius += 1;
      }
    });

    const parsedDate = parseISO(latestRecord.datetime);
    const totalLightning =
      lightningCount.withinRadius + lightningCount.outsideRadius;

    /*
      Message format:
        ✅ No lightning detected within 10 km of CDA.
        ⚡ 12 strikes detected elsewhere in Singapore.
        Last checked: 2:38 PM SGT
      */

    return {
      message: `✅ No lightning detected within 10 km of '${locationName}'.\n⚡ ${totalLightning} strike(s) detected elsewhere in Singapore.`,
      last_checked: format(parsedDate, 'hh:mm a'),
    };
  }
}
