const express = require('express');
const { Translate } = require('@google-cloud/translate').v2;
const TranslationCache = require('../models/TranslationCache');

const router = express.Router();

// Initialize Google Translate
let translate;
try {
  const apiKey = process.env.GOOGLE_TRANSLATE_KEY;

  if (!apiKey) {
    console.warn('⚠️  GOOGLE_TRANSLATE_KEY not configured. Translation features will be disabled.');
  } else {
    translate = new Translate({ key: apiKey });
    console.log('✅ Google Cloud Translation initialized');
  }
} catch (error) {
  console.error('❌ Failed to initialize Google Cloud Translation:', error.message);
}

/**
 * POST /api/translate
 * Translates an array of texts to the target language
 * Uses MongoDB caching to reduce API costs and improve performance
 */
router.post('/', async (req, res) => {
  try {
    const { texts, targetLang } = req.body;

    // Validation
    if (!texts || !Array.isArray(texts) || texts.length === 0) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'texts must be a non-empty array'
      });
    }

    if (!targetLang || !['en', 'ja'].includes(targetLang)) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'targetLang must be either "en" or "ja"'
      });
    }

    if (!translate) {
      return res.status(503).json({
        error: 'Service unavailable',
        message: 'Translation service is not configured'
      });
    }

    // Limit to 100 texts per request to prevent abuse
    if (texts.length > 100) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Maximum 100 texts per request'
      });
    }

    console.log(`🔄 Translation request: ${texts.length} texts to ${targetLang}`);

    const results = [];
    const textsToTranslate = [];
    const indexMap = [];

    // Step 1: Check cache for each text
    for (let i = 0; i < texts.length; i++) {
      const text = texts[i].trim();

      // Skip empty texts
      if (!text) {
        results[i] = '';
        continue;
      }

      // Check cache
      const cached = await TranslationCache.findCached(text, targetLang);

      if (cached && cached.isFresh()) {
        results[i] = cached.translatedText;
        console.log(`✅ Cache hit for text ${i}`);
      } else {
        // Add to batch for translation
        textsToTranslate.push(text);
        indexMap.push(i);
      }
    }

    // Step 2: Translate uncached texts in batch
    if (textsToTranslate.length > 0) {
      console.log(`🌐 Translating ${textsToTranslate.length} texts via Google API...`);

      try {
        const [translations] = await translate.translate(textsToTranslate, {
          from: targetLang === 'en' ? 'ja' : 'en',
          to: targetLang,
          format: 'text'
        });

        // Ensure translations is always an array
        const translationArray = Array.isArray(translations) ? translations : [translations];

        // Step 3: Save to cache and populate results
        for (let i = 0; i < translationArray.length; i++) {
          const originalIndex = indexMap[i];
          const translatedText = translationArray[i];

          results[originalIndex] = translatedText;

          // Save to cache (fire and forget)
          TranslationCache.saveTranslation(
            textsToTranslate[i],
            targetLang,
            translatedText
          ).catch(err => console.error('Cache save error:', err.message));
        }

        console.log(`✅ Successfully translated ${translationArray.length} texts`);
      } catch (translationError) {
        console.error('❌ Google Translate API error:', translationError.message);

        return res.status(500).json({
          error: 'Translation failed',
          message: translationError.message,
          details: process.env.NODE_ENV === 'development' ? translationError.stack : undefined
        });
      }
    } else {
      console.log('✅ All texts served from cache');
    }

    // Return results
    res.json({
      success: true,
      translated: results,
      cached: textsToTranslate.length === 0,
      cacheHitRate: ((texts.length - textsToTranslate.length) / texts.length * 100).toFixed(1) + '%'
    });

  } catch (error) {
    console.error('❌ Translation route error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * GET /api/translate/stats
 * Get translation cache statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const totalCached = await TranslationCache.countDocuments();
    const enCached = await TranslationCache.countDocuments({ targetLang: 'en' });
    const jaCached = await TranslationCache.countDocuments({ targetLang: 'ja' });

    const topTranslations = await TranslationCache.find()
      .sort({ hitCount: -1 })
      .limit(10)
      .select('sourceText translatedText targetLang hitCount');

    res.json({
      success: true,
      stats: {
        total: totalCached,
        english: enCached,
        japanese: jaCached,
        topTranslations: topTranslations
      }
    });
  } catch (error) {
    console.error('❌ Stats retrieval error:', error);
    res.status(500).json({
      error: 'Failed to retrieve stats',
      message: error.message
    });
  }
});

/**
 * DELETE /api/translate/cache
 * Clear translation cache (admin only - you can add auth middleware here)
 */
router.delete('/cache', async (req, res) => {
  try {
    const result = await TranslationCache.deleteMany({});

    res.json({
      success: true,
      message: `Cleared ${result.deletedCount} cached translations`
    });
  } catch (error) {
    console.error('❌ Cache clear error:', error);
    res.status(500).json({
      error: 'Failed to clear cache',
      message: error.message
    });
  }
});

module.exports = router;
