const imdb = require('../imdb');
const episodes = require('../episodes');

module.exports = {
  search: imdb.search,
  details: imdb.details,
  trending: imdb.trending,
  popularMovies: imdb.popularMovies,
  popularShows: imdb.popularShows,
  getAllEpisodes: episodes.getAllEpisodes,
};
