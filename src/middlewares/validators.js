// src/middlewares/validators.js
// Validation Middleware menggunakan Zod.
// Sesuai architect.md: "Middleware-Based Validation: Gunakan Zod/Joi sebelum data menyentuh Controller."
// Data yang masuk ke Controller sudah dijamin bersih dan bertipe data benar.

const { z } = require('zod');

/**
 * Factory function untuk membuat validation middleware dari Zod schema.
 * Jika validasi gagal, langsung return 400 dengan detail error.
 * @param {z.ZodSchema} schema - Zod schema untuk validasi req.body.
 */
function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const errors = result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));

      return res.status(400).json({
        success: false,
        message: 'Validasi input gagal.',
        error_code: 'VALIDATION_ERROR',
        errors,
      });
    }

    // Timpa req.body dengan data yang sudah di-parse & di-coerce oleh Zod
    req.body = result.data;
    next();
  };
}

// =====================================================
// SCHEMAS
// =====================================================

/**
 * Schema untuk POST /api/students
 */
const createStudentSchema = z.object({
  nisn: z
    .string({ required_error: 'NISN wajib diisi.' })
    .min(1, 'NISN tidak boleh kosong.'),
  name: z
    .string({ required_error: 'Nama wajib diisi.' })
    .min(1, 'Nama tidak boleh kosong.'),
  className: z
    .string({ required_error: 'Kelas wajib diisi.' })
    .min(1, 'Kelas tidak boleh kosong.'),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
});

/**
 * Schema untuk POST /api/invoices (single generate)
 */
const createInvoiceSchema = z.object({
  studentId: z
    .number({ required_error: 'studentId wajib diisi.' })
    .int('studentId harus integer.')
    .positive('studentId harus positif.'),
  feeCategoryId: z
    .number({ required_error: 'feeCategoryId wajib diisi.' })
    .int('feeCategoryId harus integer.')
    .positive('feeCategoryId harus positif.'),
  month: z
    .number()
    .int('Bulan harus integer.')
    .min(1, 'Bulan minimal 1.')
    .max(12, 'Bulan maksimal 12.')
    .optional()
    .nullable(),
  year: z
    .number({ required_error: 'year wajib diisi.' })
    .int('Tahun harus integer.')
    .min(2020, 'Tahun minimal 2020.')
    .max(2100, 'Tahun maksimal 2100.'),
});

/**
 * Schema untuk POST /api/invoices/bulk (bulk generate untuk semua siswa aktif)
 */
const bulkGenerateSchema = z.object({
  feeCategoryId: z
    .number({ required_error: 'feeCategoryId wajib diisi.' })
    .int('feeCategoryId harus integer.')
    .positive('feeCategoryId harus positif.'),
  month: z
    .number()
    .int('Bulan harus integer.')
    .min(1, 'Bulan minimal 1.')
    .max(12, 'Bulan maksimal 12.')
    .optional()
    .nullable(),
  year: z
    .number({ required_error: 'year wajib diisi.' })
    .int('Tahun harus integer.')
    .min(2020, 'Tahun minimal 2020.')
    .max(2100, 'Tahun maksimal 2100.'),
});

/**
 * Schema untuk POST /api/payments/charge
 */
const createPaymentSchema = z.object({
  invoiceId: z
    .string({ required_error: 'invoiceId wajib diisi.' })
    .min(1, 'invoiceId tidak boleh kosong.'),
});

/**
 * Schema untuk POST /api/fee-categories
 */
const createFeeCategorySchema = z.object({
  name: z
    .string({ required_error: 'Nama wajib diisi.' })
    .min(1, 'Nama tidak boleh kosong.'),
  amount: z
    .number({ required_error: 'Nominal wajib diisi.' })
    .int('Nominal harus integer.')
    .positive('Nominal harus positif (lebih besar dari 0).'),
  description: z.string().optional().nullable(),
});

/**
 * Schema untuk POST /api/auth/login
 */
const loginSchema = z.object({
  email: z
    .string({ required_error: 'Email wajib diisi.' })
    .email('Format email tidak valid.'),
  password: z
    .string({ required_error: 'Password wajib diisi.' })
    .min(1, 'Password tidak boleh kosong.')
});

module.exports = {
  validate,
  createStudentSchema,
  createInvoiceSchema,
  bulkGenerateSchema,
  createPaymentSchema,
  createFeeCategorySchema,
  loginSchema,
};
