(async function(){
  const fetch = global.fetch || require('node-fetch');
  try {
    // Login
    const loginRes = await fetch('http://localhost:3000/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' })
    });
    const loginData = await loginRes.json();
    console.log('login:', loginData);
    const setCookie = loginRes.headers.get('set-cookie');
    let cookieHeader = '';
    if (setCookie) {
      cookieHeader = setCookie.split(';')[0];
    }

    const payload = {
      plots: {},
      roads: [],
      walls: [],
      assets: [
        { id: 'temple_1', assetType: 'textLabel', subType: 'textLabel', text: 'Temple', x: 10, y: 0.12, z: -5, rot: 0.7 },
        { id: 'garden_1', assetType: 'textLabel', subType: 'textLabel', text: 'Garden', x: 6, y: 0.12, z: -6, rot: -0.5 }
      ]
    };

    const res = await fetch('http://localhost:3000/api/save-layout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': cookieHeader },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    console.log('save-layout response:', data);

    // Read the saved file
    const fs = require('fs');
    const path = require('path');
    const saved = fs.readFileSync(path.join(__dirname, '..', 'data', 'custom_assets.json'), 'utf8');
    console.log('saved custom_assets.json:', saved);
  } catch (err) {
    console.error('Error:', err);
  }
})();
