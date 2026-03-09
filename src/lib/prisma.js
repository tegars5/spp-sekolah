// src/lib/prisma.js
// Singleton PrismaClient.
// Prisma 7 client engine membutuhkan driver adapter (MariaDB/MySQL).

const { PrismaClient } = require('@prisma/client');
const { PrismaMariaDb } = require('@prisma/adapter-mariadb');

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL belum diset. Isi DATABASE_URL di file .env.');
}

function buildAdapterConfig(urlString) {
  let parsed;

  try {
    parsed = new URL(urlString);
  } catch {
    throw new Error('DATABASE_URL tidak valid. Format yang benar: mysql://user:pass@host:3306/dbname');
  }

  if (!['mysql:', 'mariadb:'].includes(parsed.protocol)) {
    throw new Error('Protocol DATABASE_URL harus mysql:// atau mariadb://');
  }

  const database = parsed.pathname.replace(/^\//, '');
  if (!database) {
    throw new Error('Nama database pada DATABASE_URL tidak boleh kosong.');
  }

  const config = {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 3306,
    user: decodeURIComponent(parsed.username),
    database,
  };

  if (parsed.password) {
    config.password = decodeURIComponent(parsed.password);
  }

  return config;
}

const adapter = new PrismaMariaDb(buildAdapterConfig(databaseUrl));
const prisma = new PrismaClient({ adapter });

module.exports = prisma;