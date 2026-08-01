const serverless = require('serverless-http');
const app = require('../../server');

// Wrap Express app as serverless function
const handler = serverless(app);

module.exports.handler = async (event, context) => {
  // Normalize paths for Netlify rewrite rules if necessary
  return await handler(event, context);
};
