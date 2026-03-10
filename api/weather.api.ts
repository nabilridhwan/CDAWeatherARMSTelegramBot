import axios from 'axios';
import { configDotenv } from 'dotenv';
import haversine from 'haversine-distance';
import logger from '../utils/infra/logger';
import type {
  AirTempAPIResponse,
  AirTempResponse,
  AirTempStation,
  BaseResponse,
  Coordinate,
  WBGTAPIResponse,
  WBGTResponse,
  WbgtReading,
  WbgtRecord,
  WbgtStation,
} from './types/weather';

configDotenv();

export namespace Weather {
  const WBGT_API_URL =
    'https://api-open.data.gov.sg/v2/real-time/api/weather?api=wbgt';
  const AIR_TEMP_API_URL =
    'https://api-open.data.gov.sg/v2/real-time/api/air-temperature';
  const DATA_GOV_API_KEY = process.env.DATA_GOV_API_KEY!;

  const dataGovRequestConfig = {
    headers: {
      'x-api-key': DATA_GOV_API_KEY,
    },
  };

  export namespace Types {
    export type WeatherReadings = {
      cdaWBGT: WBGTResponse;
      cdaAirTemp: AirTempResponse;
      httcWBGT: WBGTResponse;
      httcAirTemp: AirTempResponse;
    };

    export type WeatherSnapshot = {
      heatStress: string;
      wbgt: string;
      airTemp: number;
      emoji: string;
      dateTime: string;
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
  }

  export namespace Distance {
    export function distanceBetween(from: Coordinate, to: Coordinate) {
      return haversine(from, to);
    }

    export function findClosestWbgtStation(
      records: WbgtRecord[],
      targetLocation: Coordinate,
    ): WbgtStation | null {
      let closestStation: WbgtStation | null = null;
      let shortestDistance = Number.MAX_SAFE_INTEGER;

      for (const record of records) {
        for (const reading of record.item.readings) {
          const readingLocation = Weather.Parser.parseWbgtLocation(
            reading.location,
          );
          const distance = Weather.Distance.distanceBetween(
            targetLocation,
            readingLocation,
          );

          if (distance < shortestDistance) {
            shortestDistance = distance;
            closestStation = reading.station;
          }
        }
      }

      return closestStation;
    }

    export function findClosestAirTempStation(
      stations: AirTempStation[],
      targetLocation: Coordinate,
    ): AirTempStation {
      let closestStation = Weather.Defaults.defaultAirTempStation();
      let shortestDistance = Number.MAX_SAFE_INTEGER;

      for (const station of stations) {
        const distance = Weather.Distance.distanceBetween(
          targetLocation,
          station.location,
        );
        if (distance < shortestDistance) {
          shortestDistance = distance;
          closestStation = station;
        }
      }

      return closestStation;
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
    /**
     * Read datetime for the latest WBGT data
     */
    async function getWBGT() {
      try {
        const response = await axios.get<BaseResponse<WBGTAPIResponse>>(
          WBGT_API_URL,
          dataGovRequestConfig,
        );
        return response.data;
      } catch (error) {
        logger.error('Error fetching WBGT data:', error);
        throw error;
      }
    }

    /**
     * Read datetime for the latest Air Temperature data
     */
    async function getAirTemp() {
      try {
        const response = await axios.get<BaseResponse<AirTempAPIResponse>>(
          AIR_TEMP_API_URL,
          dataGovRequestConfig,
        );
        return response.data;
      } catch (error) {
        logger.error('Error fetching Air Temperature data:', error);
        throw error;
      }
    }

    /**
     * Get the WBGT and heat stress from the closest station to the given latitude and longitude.
     * @param lat
     * @param lng
     */
    export async function fetchWBGTFromCoordinates(
      lat: number,
      lng: number,
    ): Promise<WBGTResponse> {
      const targetLocation: Coordinate = {
        latitude: lat,
        longitude: lng,
      };
      const wbgtApiRes = await getWBGT();

      const closestStation = Weather.Distance.findClosestWbgtStation(
        wbgtApiRes.data.records,
        targetLocation,
      );

      if (!closestStation) {
        return Weather.Defaults.defaultWbgtResponse();
      }

      for (const record of wbgtApiRes.data.records) {
        for (const reading of record.item.readings) {
          if (reading.station.id === closestStation.id) {
            const readingLocation = Weather.Parser.parseWbgtLocation(
              reading.location,
            );

            return {
              wbgt: reading.wbgt,
              heatStress: reading.heatStress,
              station: {
                id: reading.station.id,
                name: reading.station.name,
                townCenter: reading.station.townCenter,
              },
              location: readingLocation,
              dateTime: record.datetime,
            };
          }
        }
      }

      return Weather.Defaults.defaultWbgtResponse();
    }

    /**
     * Get the air temperature from the closest station to the given latitude and longitude.
     * @param lat
     * @param lng
     */
    export async function fetchAirTemperatureFromCoordinates(
      lat: number,
      lng: number,
    ): Promise<AirTempResponse> {
      const targetLocation: Coordinate = {
        latitude: lat,
        longitude: lng,
      };
      const airTempApiRes = await getAirTemp();

      const closestStation = Weather.Distance.findClosestAirTempStation(
        airTempApiRes.data.stations,
        targetLocation,
      );

      const latestReading = airTempApiRes.data.readings[0];
      const stationReading = latestReading?.data.find(
        (reading) => reading.stationId === closestStation.id,
      );

      return {
        dateTime: latestReading?.timestamp ?? '',
        value: stationReading?.value ?? -1,
        station: {
          deviceId: closestStation.deviceId,
          id: closestStation.id,
          name: closestStation.name,
          location: {
            latitude: closestStation.location.latitude,
            longitude: closestStation.location.longitude,
          },
        },
        location: targetLocation,
      };
    }
  }

  export async function retrieveWeatherDataForBot(): Promise<Weather.Types.WeatherReadings> {
    const [cdaWBGT, cdaAirTemp, httcWBGT, httcAirTemp] = await Promise.all([
      Weather.BaseAPI.fetchWBGTFromCoordinates(
        Weather.Defaults.CDA.latitude,
        Weather.Defaults.CDA.longitude,
      ),
      Weather.BaseAPI.fetchAirTemperatureFromCoordinates(
        Weather.Defaults.CDA.latitude,
        Weather.Defaults.CDA.longitude,
      ),
      Weather.BaseAPI.fetchWBGTFromCoordinates(
        Weather.Defaults.HTTC.latitude,
        Weather.Defaults.HTTC.longitude,
      ),
      Weather.BaseAPI.fetchAirTemperatureFromCoordinates(
        Weather.Defaults.HTTC.latitude,
        Weather.Defaults.HTTC.longitude,
      ),
    ]);

    return {
      cdaWBGT,
      cdaAirTemp,
      httcWBGT,
      httcAirTemp,
    };
  }
}
