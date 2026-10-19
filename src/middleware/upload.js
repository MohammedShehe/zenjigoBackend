const multer = require('multer');
const path = require('path');
const config = require('../config/env');
const ApiError = require('../utils/ApiError');

const storage = multer.memoryStorage();
const allowedExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.pdf']);
const allowedMimeTypes = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf', 'application/x-pdf']);

const upload = multer({
  storage,
  limits: {
    fileSize: config.security.maxUploadMb * 1024 * 1024,
    files: 10,
    fields: 40,
    fieldSize: 1024 * 1024
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    // Some Android/iOS file providers report application/octet-stream despite a
    // valid extension. Accept known extensions, but reject unknown formats.
    if (allowedExtensions.has(ext) && (allowedMimeTypes.has(file.mimetype) || file.mimetype === 'application/octet-stream' || !file.mimetype)) {
      return cb(null, true);
    }
    return cb(ApiError.badRequest('Unsupported file type. Choose JPG, JPEG, PNG, WEBP or PDF.'));
  }
});

module.exports = { upload };
