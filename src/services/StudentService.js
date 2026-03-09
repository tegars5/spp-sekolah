// src/services/StudentService.js
// Service Layer untuk logika bisnis Siswa.
// Sesuai architect.md: logika bisnis HANYA di Service, bukan di Controller.

const prisma = require('../lib/prisma');
const bcrypt = require('bcrypt');

const StudentService = {
  /**
   * Mendaftarkan siswa baru.
   * Validasi: NISN harus unik (ditangani oleh Prisma unique constraint).
   * @param {Object} data - { nisn, name, className, phone, address }
   * @returns {Promise<Object>} Data siswa yang baru dibuat.
   */
  async register(data) {
    const { nisn, name, className, phone, address } = data;
    // Input sudah divalidasi oleh Zod middleware (validators.js)

    // Cek apakah NISN sudah terdaftar (explicit check untuk pesan error yang ramah)
    const existing = await prisma.student.findUnique({
      where: { nisn },
    });

    if (existing) {
      const error = new Error(`Siswa dengan NISN ${nisn} sudah terdaftar.`);
      error.code = 'STUDENT_ALREADY_EXISTS';
      error.statusCode = 409;
      throw error;
    }

    // Buat User dan Student secara ATOMIK menggunakan Prisma $transaction
    // Password default siswa adalah NISN-nya sendiri
    const hashedPassword = await bcrypt.hash(nisn, 10);
    const email = `${nisn}@student.sekolah.com`;

    const result = await prisma.$transaction(async (tx) => {
      // 1. Buat User untuk login
      const user = await tx.user.create({
        data: {
          email,
          password: hashedPassword,
          role: 'STUDENT',
        },
      });

      // 2. Buat profil Student dan hubungkan dengan User
      const student = await tx.student.create({
        data: {
          userId: user.id,
          nisn,
          name,
          class: className, // 'class' adalah reserved word
          phone: phone || null,
          address: address || null,
        },
      });

      return student;
    });

    return result;
  },

  /**
   * Mengambil semua data siswa yang aktif.
   * @returns {Promise<Array>} Daftar semua siswa.
   */
  async getAll() {
    const students = await prisma.student.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
    return students;
  },

  /**
   * Mengambil data siswa berdasarkan ID, termasuk relasi invoice & payment.
   * Menghindari N+1 query problem sesuai skill.md (gunakan include).
   * @param {number} id - ID siswa.
   * @returns {Promise<Object>} Data siswa lengkap dengan tagihan dan pembayaran.
   */
  async getById(id) {
    const student = await prisma.student.findUnique({
      where: { id: Number(id) },
      include: {
        invoices: {
          include: { 
            payments: true,
            feeCategory: true,
          },
          orderBy: [{ year: 'desc' }, { month: 'desc' }],
        },
      },
    });

    if (!student) {
      const error = new Error(`Siswa dengan ID ${id} tidak ditemukan.`);
      error.code = 'STUDENT_NOT_FOUND';
      error.statusCode = 404;
      throw error;
    }

    return student;
  },
};

module.exports = StudentService;
