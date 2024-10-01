const ensureNonNullFields = (obj, requiredFields) => {
    const missingFields = requiredFields.filter(field => obj[field] == null);
    if (missingFields.length > 0) {
      throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
    }
    return obj;
  };
  
  module.exports = { ensureNonNullFields };