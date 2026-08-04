process.env.ADMIN_SECRET = process.env.ADMIN_SECRET || 'test-secret';
require('./server');
console.log('server started with ADMIN_SECRET=' + process.env.ADMIN_SECRET);
