import { getAirTempFromLatLng, getWGBTFromLatLng } from '../../api/weather';
import { CDA, HTTC } from './locations';

export type WbgtReading = Awaited<ReturnType<typeof getWGBTFromLatLng>>;
export type AirTempReading = Awaited<ReturnType<typeof getAirTempFromLatLng>>;

export type WeatherReadings = {
  cdaWBGT: WbgtReading;
  cdaAirTemp: AirTempReading;
  httcWBGT: WbgtReading;
  httcAirTemp: AirTempReading;
};

export default async function fetchWeatherReadings(): Promise<WeatherReadings> {
  const [cdaWBGT, cdaAirTemp, httcWBGT, httcAirTemp] = await Promise.all([
    getWGBTFromLatLng(CDA.latitude, CDA.longitude),
    getAirTempFromLatLng(CDA.latitude, CDA.longitude),
    getWGBTFromLatLng(HTTC.latitude, HTTC.longitude),
    getAirTempFromLatLng(HTTC.latitude, HTTC.longitude),
  ]);

  return {
    cdaWBGT,
    cdaAirTemp,
    httcWBGT,
    httcAirTemp,
  };
}
