const express = require('express');
const gtranslate = require('google-translate-api-x');
const TranslationCache = require('../models/TranslationCache');

const router = express.Router();

console.log('✅ Translation service initialized (Free Google Translate API - No API key required)');

/**
 * POST /api/translate
 * Translates an array of texts to the target language using free Google Translate API
 * Uses MongoDB caching to improve performance and reduce requests
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
        // console.log(`✅ Cache hit for text ${i}`); // Too verbose
      } else {
        // Add to batch for translation
        textsToTranslate.push(text);
        indexMap.push(i);
      }
    }

    // Step 2: Translate uncached texts
    if (textsToTranslate.length > 0) {
      console.log(`🌐 Translating ${textsToTranslate.length} texts via Free Google Translate API...`);

      try {
        const sourceLang = targetLang === 'en' ? 'ja' : 'en';
        const translationPromises = [];

        // Create translation promises for each text
        for (let i = 0; i < textsToTranslate.length; i++) {
          const text = textsToTranslate[i];

          // Use an options object for clarity
          const translateOptions = {
            from: sourceLang,
            to: targetLang,
            // Recommended for higher quality translation for technical text:
            forceBatch: false
          };

          // Translate using the free Google Translate API
          const promise = gtranslate.translate(text, translateOptions)
            .then(res => res.text)
            .catch(err => {
              console.error(`❌ Translation failed for text "${text.substring(0, 50)}...":`, err.message);
              return text; // Return original text if translation fails
            });

          translationPromises.push(promise);
        }

        // Wait for all translations to complete
        const translatedArray = await Promise.all(translationPromises);

        // Step 3: Save to cache and populate results
        for (let i = 0; i < translatedArray.length; i++) {
          const originalIndex = indexMap[i];
          const translatedText = translatedArray[i];

          results[originalIndex] = translatedText;

          // Save to cache (fire and forget)
          TranslationCache.saveTranslation(
            textsToTranslate[i],
            targetLang,
            translatedText
          ).catch(err => console.error('Cache save error:', err.message));
        }

        console.log(`✅ Successfully translated ${translatedArray.length} texts`);
      } catch (translationError) {
        console.error('❌ Translation API error:', translationError.message);

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
