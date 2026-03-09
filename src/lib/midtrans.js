// src/lib/midtrans.js
// Konfigurasi Midtrans Snap Client.
// Sesuai skill.md: "Jangan pernah hardcode ServerKey Midtrans; panggil dari process.env."

const midtransClient = require('midtrans-client');

const snap = new midtransClient.Snap({
  isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
  serverKey: process.env.MIDTRANS_SERVER_KEY,
  clientKey: process.env.MIDTRANS_CLIENT_KEY,
});

module.exports = snap;
