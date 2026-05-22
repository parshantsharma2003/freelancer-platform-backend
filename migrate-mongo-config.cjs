require('dotenv').config();

const config = {
  mongodb: {
    url: process.env.MONGO_URI,
    databaseName: process.env.MONGODB_DB_NAME || 'freelancer-platform'
  },
  migrationsDir: 'migrations',
  changelogCollectionName: 'changelog',
  migrationFileExtension: '.cjs'
};

module.exports = config;
