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

function distanceBetween(from: Coordinate, to: Coordinate) {
  return haversine(from, to);
}

function parseWbgtLocation(location: WbgtReading['location']): Coordinate {
  return {
    latitude: parseFloat(location.latitude),
    longitude: parseFloat(location.longitude),
  };
}

function defaultWbgtResponse(): WBGTResponse {
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

function defaultAirTempStation(): AirTempStation {
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

function findClosestWbgtStation(
  records: WbgtRecord[],
  targetLocation: Coordinate,
): WbgtStation | null {
  let closestStation: WbgtStation | null = null;
  let shortestDistance = Number.MAX_SAFE_INTEGER;

  for (const record of records) {
    for (const reading of record.item.readings) {
      const readingLocation = parseWbgtLocation(reading.location);
      const distance = distanceBetween(targetLocation, readingLocation);

      if (distance < shortestDistance) {
        shortestDistance = distance;
        closestStation = reading.station;
      }
    }
  }

  return closestStation;
}

function findClosestAirTempStation(
  stations: AirTempStation[],
  targetLocation: Coordinate,
): AirTempStation {
  let closestStation = defaultAirTempStation();
  let shortestDistance = Number.MAX_SAFE_INTEGER;

  for (const station of stations) {
    const distance = distanceBetween(targetLocation, station.location);
    if (distance < shortestDistance) {
      shortestDistance = distance;
      closestStation = station;
    }
  }

  return closestStation;
}

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
export async function getWGBTFromLatLng(
  lat: number,
  lng: number,
): Promise<WBGTResponse> {
  const targetLocation: Coordinate = {
    latitude: lat,
    longitude: lng,
  };
  const wbgtApiRes = await getWBGT();

  const closestStation = findClosestWbgtStation(
    wbgtApiRes.data.records,
    targetLocation,
  );

  if (!closestStation) {
    return defaultWbgtResponse();
  }

  for (const record of wbgtApiRes.data.records) {
    for (const reading of record.item.readings) {
      if (reading.station.id === closestStation.id) {
        const readingLocation = parseWbgtLocation(reading.location);

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

  return defaultWbgtResponse();
}

/**
 * Get the air temperature from the closest station to the given latitude and longitude.
 * @param lat
 * @param lng
 */
export async function getAirTempFromLatLng(
  lat: number,
  lng: number,
): Promise<AirTempResponse> {
  const targetLocation: Coordinate = {
    latitude: lat,
    longitude: lng,
  };
  const airTempApiRes = await getAirTemp();

  const closestStation = findClosestAirTempStation(
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
