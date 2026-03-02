export type Coordinate = {
  latitude: number;
  longitude: number;
};

export interface AirTempAPIResponse {
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

export interface WBGTAPIResponse {
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

export interface WBGTResponse {
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

export interface AirTempResponse {
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

export interface BaseResponse<T> {
  code: number;
  errorMsg: string;
  data: T;
}

export type WbgtRecord = WBGTAPIResponse['records'][number];
export type WbgtReading = WbgtRecord['item']['readings'][number];
export type WbgtStation = WbgtReading['station'];
export type AirTempStation = AirTempAPIResponse['stations'][number];
