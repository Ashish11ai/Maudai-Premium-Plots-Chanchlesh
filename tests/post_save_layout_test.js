(async function(){
  const fetch = global.fetch || require('node-fetch');
  const payload = {
    plots: {},
    roads: [],
    walls: [],
    assets: [
      { id: 'temple_1', assetType: 'textLabel', subType: 'textLabel', text: 'Temple', x: 10, y: 0.12, z: -5, rot: 0.7 },
      { id: 'garden_1', assetType: 'textLabel', subType: 'textLabel', text: 'Garden', x: 6, y: 0.12, z: -6, rot: -0.5 }
    ]
  };

  try {
    const res = await fetch('http://localhost:3000/api/save-layout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    console.log('save-layout response:', data);
  } catch (err) {
    console.error('Error calling save-layout:', err);
  }
})();
