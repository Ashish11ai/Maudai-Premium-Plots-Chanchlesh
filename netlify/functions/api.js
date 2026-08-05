const serverless = require('serverless-http');
const app = require('../../server');

// Wrap Express app as serverless function
const handler = serverless(app);

module.exports.handler = async (event, context) => {
  if (event.path && event.path.startsWith('/.netlify/functions/api')) {
    event.path = event.path.replace('/.netlify/functions/api', '/api');
  }
  return await handler(event, context);
};

