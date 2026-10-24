const { ok } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');

function mapsKey() {
  return (
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_PLACES_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    ''
  ).trim();
}

/**
 * Places API (New) — autocomplete
 * https://developers.google.com/maps/documentation/places/web-service/place-autocomplete
 */
exports.placesAutocomplete = asyncHandler(async (req, res) => {
  const input = String(req.query.input || req.query.q || '').trim();
  if (input.length < 2) return ok(res, { predictions: [] });

  const key = mapsKey();
  if (!key) {
    return ok(res, {
      predictions: [{ description: input, placeId: null, structured: { main: input, secondary: '' } }],
      fallback: true,
      message: 'GOOGLE_MAPS_API_KEY not set on server',
    });
  }

  // Places API (New)
  const r = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask':
        'suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat',
    },
    body: JSON.stringify({
      input,
      includedRegionCodes: ['tz', 'ke', 'ug', 'rw', 'bi', 'za'],
      languageCode: 'en',
    }),
  });

  const data = await r.json().catch(() => ({}));

  if (!r.ok) {
    // Fallback to legacy Places Autocomplete if New API fails (key restrictions / billing)
    const legacyUrl =
      `https://maps.googleapis.com/maps/api/place/autocomplete/json` +
      `?input=${encodeURIComponent(input)}` +
      `&components=country:tz|country:ke|country:ug|country:rw` +
      `&key=${encodeURIComponent(key)}`;
    const lr = await fetch(legacyUrl);
    const ld = await lr.json().catch(() => ({}));
    if (ld.status === 'OK' || ld.status === 'ZERO_RESULTS') {
      const predictions = (ld.predictions || []).map((p) => ({
        description: p.description,
        placeId: p.place_id,
        structured: {
          main: p.structured_formatting?.main_text || p.description,
          secondary: p.structured_formatting?.secondary_text || '',
        },
      }));
      return ok(res, { predictions, source: 'legacy' });
    }
    const errMsg =
      data?.error?.message ||
      ld?.error_message ||
      data?.message ||
      `Places API error (${r.status})`;
    throw ApiError.badRequest(errMsg);
  }

  const predictions = (data.suggestions || [])
    .map((s) => s.placePrediction)
    .filter(Boolean)
    .map((p) => {
      const main =
        p.structuredFormat?.mainText?.text ||
        p.text?.text ||
        '';
      const secondary = p.structuredFormat?.secondaryText?.text || '';
      return {
        description: p.text?.text || [main, secondary].filter(Boolean).join(', '),
        placeId: p.placeId || null,
        structured: { main, secondary },
      };
    });

  return ok(res, { predictions, source: 'places_new' });
});

/**
 * Places API (New) — place details
 */
exports.placeDetails = asyncHandler(async (req, res) => {
  const placeId = String(req.query.placeId || '').trim();
  if (!placeId) throw ApiError.badRequest('placeId is required');

  const key = mapsKey();
  if (!key) return ok(res, { address: null });

  // New API place resource name is places/{placeId}
  const name = placeId.startsWith('places/') ? placeId : `places/${placeId}`;
  const r = await fetch(`https://places.googleapis.com/v1/${name}`, {
    method: 'GET',
    headers: {
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'id,formattedAddress,location,displayName',
    },
  });
  const data = await r.json().catch(() => ({}));

  if (!r.ok) {
    // Legacy details fallback
    const rawId = placeId.replace(/^places\//, '');
    const legacyUrl =
      `https://maps.googleapis.com/maps/api/place/details/json` +
      `?place_id=${encodeURIComponent(rawId)}` +
      `&fields=formatted_address,geometry,name` +
      `&key=${encodeURIComponent(key)}`;
    const lr = await fetch(legacyUrl);
    const ld = await lr.json().catch(() => ({}));
    const result = ld.result || {};
    return ok(res, {
      address: result.formatted_address || result.name || null,
      lat: result.geometry?.location?.lat ?? null,
      lng: result.geometry?.location?.lng ?? null,
      source: 'legacy',
    });
  }

  return ok(res, {
    address: data.formattedAddress || data.displayName?.text || null,
    lat: data.location?.latitude ?? null,
    lng: data.location?.longitude ?? null,
    source: 'places_new',
  });
});
