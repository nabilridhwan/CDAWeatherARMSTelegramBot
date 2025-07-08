import axios from 'axios';
import haversine from 'haversine-distance';
import logger from '../utils/logger';

interface AirTempAPIResponse {
  readingType: string;
  readingUnit: string;
  readings: Array<{
    timestamp: string;
    data: Array<{
      stationId: string;
      value: number;
    }>;
  }>;
  stations: Array<{
    deviceId: string;
    id: string;
    location: {
      latitude: number;
      longitude: number;
    };
    name: string;
  }>;
}

interface WBGTAPIResponse {
  records: Array<{
    datetime: string;
    item: {
      isStationData: boolean;
      type: string;
      readings: Array<{
        heatStress: string;
        location: {
          latitude: string;
          longitude: string;
        };
        wbgt: string;
        station: {
          id: string;
          name: string;
          area: string;
          townCenter: string;
        };
      }>;
    };
    updatedTimestamp: string;
  }>;
  paginationToken: string;
}

interface WBGTResponse {
  wbgt: string;
  heatStress: string;
  station: {
    id: string;
    name: string;
    townCenter: string;
  };
  location: {
    latitude: number;
    longitude: number;
  };
  dateTime: string;
}

interface AirTempResponse {
  value: number;
  station: {
    deviceId: string;
    id: string;
    name: string;
    location: {
      latitude: number;
      longitude: number;
    };
  };
  location: {
    latitude: number;
    longitude: number;
  };
  dateTime: string;
}

interface BaseResponse<T> {
  code: number;
  errorMsg: string;
  data: T;
}

/**
 * Read datetime for the latest WBGT data
 */
function getWBGT() {
  return axios
    .get<BaseResponse<WBGTAPIResponse>>(
      'https://api-open.data.gov.sg/v2/real-time/api/weather?api=wbgt',
    )
    .then((response) => response.data)
    .catch((error) => {
      logger.error('Error fetching WBGT data:', error);
      throw error;
    });
}

/**
 * Read datetime for the latest Air Temperature data
 */
function getAirTemp() {
  return axios
    .get<BaseResponse<AirTempAPIResponse>>(
      'https://api-open.data.gov.sg/v2/real-time/api/air-temperature',
    )
    .then((response) => response.data)
    .catch((error) => {
      logger.error('Error fetching Air Temperature data:', error);
      throw error;
    });
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
  let wbgtApiRes = await getWBGT();
  let distToClosestStn = Number.MAX_SAFE_INTEGER;
  let closestStn: {
    id: string;
    name: string;
    townCenter: string;
  } = {
    id: '',
    name: '',
    townCenter: '',
  };

  let fnRes: WBGTResponse = {
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

  // Find the closest station to the given latitude and longitude
  wbgtApiRes.data.records.forEach((record) => {
    record.item.readings.forEach((r) => {
      const loc = {
        latitude: parseFloat(r.location.latitude),
        longitude: parseFloat(r.location.longitude),
      };

      // calculate distance from the location to the station
      const distFromLocation = haversine(
        {
          latitude: lat,
          longitude: lng,
        },
        loc,
      );

      if (Math.min(distToClosestStn, distFromLocation) === distFromLocation) {
        distToClosestStn = distFromLocation;
        closestStn = r.station;
      }
    });
  });

  // Get the WBGT and heat stress readings from the closest station
  wbgtApiRes.data.records.forEach((r) => {
    r.item.readings.forEach((read) => {
      if (read.station.id == closestStn.id) {
        fnRes.wbgt = read.wbgt;
        fnRes.heatStress = read.heatStress;
        fnRes.station = read.station;
        fnRes.dateTime = r.datetime;
        fnRes.location = {
          latitude: parseFloat(read.location.latitude),
          longitude: parseFloat(read.location.longitude),
        };
      }
    });
  });

  // console.log(fnRes)

  return fnRes;
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
  let airTempApiRes = await getAirTemp();
  let distToClosestStn = Number.MAX_SAFE_INTEGER;
  let closestStn: {
    deviceId: string;
    id: string;
    name: string;
    location: {
      latitude: number;
      longitude: number;
    };
  } = {
    deviceId: '',
    id: '',
    name: '',
    location: {
      latitude: -1,
      longitude: -1,
    },
  };

  // Find the closest station to the given latitude and longitude
  airTempApiRes.data.stations.forEach((station) => {
    const loc = {
      latitude: station.location.latitude,
      longitude: station.location.longitude,
    };

    // calculate distance from the location to the station
    const distFromLocation = haversine(
      {
        latitude: lat,
        longitude: lng,
      },
      loc,
    );

    if (Math.min(distToClosestStn, distFromLocation) === distFromLocation) {
      distToClosestStn = distFromLocation;
      closestStn = station;
    }
  });

  // Get the air temperature readings from the closest station
  let fnRes: AirTempResponse = {
    dateTime: '',
    value: -1,
    station: {
      deviceId: closestStn.deviceId,
      id: closestStn.id,
      name: closestStn.name,
      location: {
        latitude: closestStn.location.latitude,
        longitude: closestStn.location.longitude,
      },
    },
    location: {
      latitude: lat,
      longitude: lng,
    },
  };

  const { data, timestamp } = airTempApiRes.data.readings[0];
  fnRes.dateTime = timestamp;

  data.forEach((reading) => {
    if (reading.stationId === closestStn.id) {
      fnRes.value = reading.value;
    }
  });

  // console.log(fnRes)

  return fnRes;
}
