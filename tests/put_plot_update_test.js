(async function(){
  const fetch = global.fetch || require('node-fetch');
  const fs = require('fs');
  const path = require('path');

  // Login and get cookie
  const loginRes = await fetch('http://localhost:3000/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' })
  });
  const login = await loginRes.json();
  console.log('login:', login);
  const setCookie = loginRes.headers.get('set-cookie');
  let cookieHeader = '';
  if (setCookie) cookieHeader = setCookie.split(';')[0];

  // Update plot 1
  const res = await fetch('http://localhost:3000/api/plots/1', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Cookie': cookieHeader },
    body: JSON.stringify({ status: 'sold', price: 123456, notes: 'Sold via admin test' })
  });
  const data = await res.json();
  console.log('update response:', data);

  const saved = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'plots.json'), 'utf8'));
  console.log('plots.json sample for 1:', saved['1']);
})();
