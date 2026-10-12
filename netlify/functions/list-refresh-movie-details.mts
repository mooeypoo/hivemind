import {
  refreshMovieDetails,
  handle,
  rateLimits,
  type Config,
} from '../../src/server/functions.ts';

export default handle(refreshMovieDetails);

export const config: Config = {
  path: '/api/lists/:list/refresh-movie-details',
  method: 'POST',
  rateLimit: rateLimits.mutation,
};
