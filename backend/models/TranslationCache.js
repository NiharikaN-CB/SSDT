const mongoose = require('mongoose');
const crypto = require('crypto');

const translationCacheSchema = new mongoose.Schema({
  sourceText: {
    type: String,
    required: true,
    index: true
  },
  targetLang: {
    type: String,
    required: true,
    enum: ['en', 'ja'],
    index: true
  },
  translatedText: {
    type: String,
    required: true
  },
  hash: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  hitCount: {
    type: Number,
    default: 1
  },
  lastAccessed: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 2592000 // Auto-delete after 30 days
  }
});

// Create compound index for faster lookups
translationCacheSchema.index({ sourceText: 1, targetLang: 1 });

// Static method to generate cache hash
translationCacheSchema.statics.generateHash = function(sourceText, targetLang) {
  return crypto
    .createHash('md5')
    .update(`${sourceText}_${targetLang}`)
    .digest('hex');
};

// Static method to find or create cache entry
translationCacheSchema.statics.findCached = async function(sourceText, targetLang) {
  const hash = this.generateHash(sourceText, targetLang);

  const cached = await this.findOneAndUpdate(
    { hash },
    {
      $inc: { hitCount: 1 },
      $set: { lastAccessed: Date.now() }
    },
    { new: true }
  );

  return cached;
};

// Static method to save translation
translationCacheSchema.statics.saveTranslation = async function(sourceText, targetLang, translatedText) {
  const hash = this.generateHash(sourceText, targetLang);

  const translation = await this.findOneAndUpdate(
    { hash },
    {
      sourceText,
      targetLang,
      translatedText,
      hash,
      lastAccessed: Date.now(),
      $inc: { hitCount: 1 }
    },
    { upsert: true, new: true }
  );

  return translation;
};

// Method to check if cache entry is fresh (less than 7 days old)
translationCacheSchema.methods.isFresh = function() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return this.createdAt > sevenDaysAgo;
};

module.exports = mongoose.model('TranslationCache', translationCacheSchema);
