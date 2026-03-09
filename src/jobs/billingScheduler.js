// src/jobs/billingScheduler.js
// Scheduler harian untuk maintenance billing:
// 1) Expire invoice overdue
// 2) Auto-generate invoice bulanan untuk fee category tertentu

const InvoiceService = require('../services/InvoiceService');

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000; // cek setiap 1 jam
const DEFAULT_BILLING_DAY = 1; // tanggal 1 setiap bulan

function parseFeeCategoryIds(rawValue) {
  if (!rawValue) return [];
  return String(rawValue)
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((num) => Number.isInteger(num) && num > 0);
}

async function runDailyMaintenance(now = new Date()) {
  // 1) Expire overdue invoice (idempotent)
  await InvoiceService.expireOverdueInvoices(now);

  // 2) Auto billing bulanan (opsional berdasarkan env)
  const billingDay = Number(process.env.AUTO_BILLING_DAY) || DEFAULT_BILLING_DAY;
  const feeCategoryIds = parseFeeCategoryIds(process.env.AUTO_BILLING_FEE_CATEGORY_IDS);

  if (now.getDate() !== billingDay || feeCategoryIds.length === 0) {
    return;
  }

  const month = now.getMonth() + 1; // JS month: 0-11
  const year = now.getFullYear();

  for (const feeCategoryId of feeCategoryIds) {
    await InvoiceService.generateBulk(feeCategoryId, month, year);
  }
}

function startBillingScheduler() {
  const intervalMs = Number(process.env.BILLING_SCHEDULER_INTERVAL_MS) || DEFAULT_INTERVAL_MS;
  const runOnStart = process.env.AUTO_BILLING_RUN_ON_START === 'true';

  let isRunning = false;
  let lastRunDateKey = null;

  const tick = async () => {
    const now = new Date();
    const dateKey = now.toISOString().slice(0, 10); // YYYY-MM-DD

    if (isRunning || lastRunDateKey === dateKey) {
      return;
    }

    isRunning = true;
    try {
      await runDailyMaintenance(now);
      lastRunDateKey = dateKey;
    } finally {
      isRunning = false;
    }
  };

  if (runOnStart) {
    tick();
  }

  const timer = setInterval(tick, intervalMs);
  if (typeof timer.unref === 'function') {
    timer.unref();
  }

  return timer;
}

module.exports = {
  startBillingScheduler,
  runDailyMaintenance,
};
