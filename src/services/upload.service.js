const cloudinary = require('../config/cloudinary');
const ApiError = require('../utils/ApiError');

function uploadBuffer(buffer, folder, resourceType = 'auto') {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: resourceType,
        // Allow larger docs / photos used in driver onboarding
        timeout: 120000
      },
      (err, result) => {
        if (err) {
          const msg =
            err.message ||
            err.error?.message ||
            (typeof err === 'string' ? err : 'Cloudinary upload failed');
          const httpCode = err.http_code || err.error?.http_code;
          // Map common Cloudinary failures to 400 so clients see a clear message
          if (httpCode === 400 || httpCode === 401 || httpCode === 403 || /Invalid|Unauthorized|api_key|cloud_name/i.test(String(msg))) {
            return reject(ApiError.badRequest(`File upload failed: ${msg}`));
          }
          return reject(ApiError.badRequest(`File upload failed: ${msg}`));
        }
        resolve(result);
      }
    );
    stream.on('error', (err) => {
      reject(ApiError.badRequest(`File upload stream error: ${err.message || err}`));
    });
    stream.end(buffer);
  });
}

async function upload(file, folder) {
  if (!file) throw ApiError.badRequest('File is required');
  if (!file.buffer || !file.buffer.length) {
    throw ApiError.badRequest('Empty file received. Please choose a valid image or PDF.');
  }
  // Prefer image for image mime types; raw for PDFs; auto as fallback
  let resourceType = 'auto';
  const mime = (file.mimetype || '').toLowerCase();
  if (mime === 'application/pdf' || mime === 'application/x-pdf') {
    resourceType = 'raw';
  } else if (mime.startsWith('image/')) {
    resourceType = 'image';
  }
  try {
    const r = await uploadBuffer(file.buffer, folder, resourceType);
    return {
      publicId: r.public_id,
      url: r.secure_url || r.url,
      resourceType: r.resource_type || resourceType
    };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw ApiError.badRequest(`File upload failed: ${err.message || err}`);
  }
}

module.exports = { upload };
