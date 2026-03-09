// src/lib/prisma.js
// Singleton instance PrismaClient untuk seluruh aplikasi.
// Prisma 7 menggunakan Driver Adapter — tidak lagi koneksi langsung.
// Untuk MySQL/MariaDB, gunakan @prisma/adapter-mariadb.

const { PrismaClient } = require('@prisma/client');
const { PrismaMariaDb } = require('@prisma/adapter-mariadb');
const mariadb = require('mariadb');

// Parse DATABASE_URL menjadi komponen terpisah
// Karena package mariadb membutuhkan format mariadb://, bukan mysql://
const dbUrl = new URL(process.env.DATABASE_URL);

const pool = mariadb.createPool({
  host: dbUrl.hostname,
  port: Number(dbUrl.port) || 3306,
  user: dbUrl.username,
  password: dbUrl.password || undefined,
  database: dbUrl.pathname.replace('/', ''), // hilangkan leading /
  connectionLimit: 5,
});

// Buat adapter dari pool
const adapter = new PrismaMariaDb(pool);

// Inisialisasi PrismaClient dengan adapter (Prisma 7 style)
const prisma = new PrismaClient({ adapter });

module.exports = prisma;
