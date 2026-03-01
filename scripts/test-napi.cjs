try {
  const napi = require('gauss-napi');
  console.log('NAPI Module loaded successfully');
  console.log('Version:', napi.version());
  console.log('Exports:', Object.keys(napi));
} catch (e) {
  console.error('Failed to load NAPI module:', e);
  process.exit(1);
}
