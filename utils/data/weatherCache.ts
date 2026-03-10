// import redis from '../infra/redis';

// export const getCachedWeatherData = async (cacheKey: string) => {
//   try {
//     const cachedData = await redis.get(cacheKey);
//     if (cachedData) {
//       return JSON.parse(cachedData);
//     }
//     return null;
//   } catch (error) {
//     console.error(
//       `Error retrieving weather data from cache for key ${cacheKey}:`,
//       error,
//     );
//     return null;
//   }
// };

// namespace Cache {
//     const CACHE_KEY_PREFIX = 'weather:';

//     // Cache function that stores for 15 minutes interval. So that:
//     // When a user requests at 9:50, it should check if there is cached data from 9:35 to 9:50. If there is, return it. If not, fetch new data and cache it with the current timestamp.
//     export async function getWeatherDataWithCache<T>(
//         cacheKeySuffix: string,
//         fetchFunction: () => Promise<T>,
//     ): Promise<T> {
//         const cacheKey = CACHE_KEY_PREFIX + cacheKeySuffix;
//         const cachedData = await getCachedWeatherData(cacheKey);

//         if (cachedData) {
//             return cachedData;
//         }

//         const freshData = await fetchFunction();
//         await redis.set(cacheKey, JSON.stringify(freshData), 'EX', 15 * 60); // Cache for 15 minutes
//         return freshData;
//     }
// }
