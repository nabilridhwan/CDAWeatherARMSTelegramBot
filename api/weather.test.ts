import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
  },
}));

vi.mock('../utils/logger', () => ({
  default: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

const mockedAxiosGet = vi.mocked(axios.get);

describe('weather api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.DATA_GOV_API_KEY = 'unit-test-key';
  });

  it('returns WBGT reading from the closest station', async () => {
    const wbgtApiResponse = {
      code: 0,
      errorMsg: '',
      data: {
        records: [
          {
            datetime: '2026-03-02T10:00:00+08:00',
            updatedTimestamp: '2026-03-02T10:00:00+08:00',
            item: {
              isStationData: true,
              type: 'WBGT',
              readings: [
                {
                  heatStress: 'Low',
                  location: { latitude: '1.2900', longitude: '103.7800' },
                  wbgt: '28.2',
                  station: {
                    id: 'A',
                    name: 'Alpha',
                    area: 'Area A',
                    townCenter: 'Center A',
                  },
                },
                {
                  heatStress: 'Moderate',
                  location: { latitude: '1.3000', longitude: '103.7600' },
                  wbgt: '30.1',
                  station: {
                    id: 'B',
                    name: 'Bravo',
                    area: 'Area B',
                    townCenter: 'Center B',
                  },
                },
              ],
            },
          },
        ],
        paginationToken: '',
      },
    };

    mockedAxiosGet.mockResolvedValueOnce({ data: wbgtApiResponse });

    const { getWGBTFromLatLng } = await import('./weather');
    const reading = await getWGBTFromLatLng(1.3001, 103.7601);

    expect(mockedAxiosGet).toHaveBeenCalledWith(
      'https://api-open.data.gov.sg/v2/real-time/api/weather?api=wbgt',
      {
        headers: {
          'x-api-key': 'unit-test-key',
        },
      },
    );
    expect(reading).toEqual({
      wbgt: '30.1',
      heatStress: 'Moderate',
      station: {
        id: 'B',
        name: 'Bravo',
        townCenter: 'Center B',
      },
      location: {
        latitude: 1.3,
        longitude: 103.76,
      },
      dateTime: '2026-03-02T10:00:00+08:00',
    });
  });

  it('returns default WBGT response when API has no station readings', async () => {
    const wbgtApiResponse = {
      code: 0,
      errorMsg: '',
      data: {
        records: [],
        paginationToken: '',
      },
    };

    mockedAxiosGet.mockResolvedValueOnce({ data: wbgtApiResponse });

    const { getWGBTFromLatLng } = await import('./weather');
    const reading = await getWGBTFromLatLng(1.3, 103.8);

    expect(reading).toEqual({
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
    });
  });

  it('returns latest air temperature for closest station', async () => {
    const airTempApiResponse = {
      code: 0,
      errorMsg: '',
      data: {
        readingType: 'air-temp',
        readingUnit: 'deg C',
        stations: [
          {
            deviceId: 'device-a',
            id: 'station-a',
            name: 'Station A',
            location: {
              latitude: 1.35,
              longitude: 103.8,
            },
          },
          {
            deviceId: 'device-b',
            id: 'station-b',
            name: 'Station B',
            location: {
              latitude: 1.3,
              longitude: 103.76,
            },
          },
        ],
        readings: [
          {
            timestamp: '2026-03-02T10:00:00+08:00',
            data: [
              {
                stationId: 'station-a',
                value: 32.4,
              },
              {
                stationId: 'station-b',
                value: 30.2,
              },
            ],
          },
        ],
      },
    };

    mockedAxiosGet.mockResolvedValueOnce({ data: airTempApiResponse });

    const { getAirTempFromLatLng } = await import('./weather');
    const reading = await getAirTempFromLatLng(1.3001, 103.7601);

    expect(mockedAxiosGet).toHaveBeenCalledWith(
      'https://api-open.data.gov.sg/v2/real-time/api/air-temperature',
      {
        headers: {
          'x-api-key': 'unit-test-key',
        },
      },
    );
    expect(reading).toEqual({
      dateTime: '2026-03-02T10:00:00+08:00',
      value: 30.2,
      station: {
        deviceId: 'device-b',
        id: 'station-b',
        name: 'Station B',
        location: {
          latitude: 1.3,
          longitude: 103.76,
        },
      },
      location: {
        latitude: 1.3001,
        longitude: 103.7601,
      },
    });
  });

  it('returns -1 air temp value when closest station has no latest reading', async () => {
    const airTempApiResponse = {
      code: 0,
      errorMsg: '',
      data: {
        readingType: 'air-temp',
        readingUnit: 'deg C',
        stations: [
          {
            deviceId: 'device-z',
            id: 'station-z',
            name: 'Station Z',
            location: {
              latitude: 1.3,
              longitude: 103.76,
            },
          },
        ],
        readings: [
          {
            timestamp: '2026-03-02T10:00:00+08:00',
            data: [
              {
                stationId: 'station-a',
                value: 31.5,
              },
            ],
          },
        ],
      },
    };

    mockedAxiosGet.mockResolvedValueOnce({ data: airTempApiResponse });

    const { getAirTempFromLatLng } = await import('./weather');
    const reading = await getAirTempFromLatLng(1.3, 103.76);

    expect(reading.value).toBe(-1);
    expect(reading.dateTime).toBe('2026-03-02T10:00:00+08:00');
  });
});
