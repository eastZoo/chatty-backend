// eslint-disable-next-line
require('dotenv').config();

module.exports = {
  apps: [
    {
      name: process.env.PROJECT_NAME,
      script: 'dist/main.js',
      env: {
        NODE_ENV: process.env.NODE_ENV,
        PORT: process.env.PORT,
      },
    },
  ],
};
