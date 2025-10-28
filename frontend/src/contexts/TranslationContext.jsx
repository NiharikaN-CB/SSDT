import { createContext, useContext, useState, useCallback, useEffect } from 'react';

const TranslationContext = createContext();

export const useTranslation = () => {
  const context = useContext(TranslationContext);
  if (!context) {
    throw new Error('useTranslation must be used within a TranslationProvider');
  }
  return context;
};

export const TranslationProvider = ({ children }) => {
  const [currentLang, setCurrentLang] = useState('en');
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationProgress, setTranslationProgress] = useState(0);
  const [hasReport, setHasReport] = useState(false);

  // Store translations as a Map: English text → Japanese translation
  // This allows us to reuse translations even when DOM structure changes
  const [translationMap] = useState(new Map());

  // Always start with English on page load
  useEffect(() => {
    setCurrentLang('en');
  }, []);

  /**
   * Collect all translatable text nodes from the DOM
   * Excludes script tags, style tags, and elements with data-no-translate attribute
   */
  const collectTexts = useCallback(() => {
    const texts = [];
    const nodes = [];

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          // Skip empty text nodes
          if (!node.nodeValue.trim()) {
            return NodeFilter.FILTER_REJECT;
          }

          // Skip nodes inside script, style, noscript tags
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;

          const tagName = parent.tagName?.toLowerCase();
          if (['script', 'style', 'noscript'].includes(tagName)) {
            return NodeFilter.FILTER_REJECT;
          }

          // Skip nodes with data-no-translate attribute
          if (parent.closest('[data-no-translate]')) {
            return NodeFilter.FILTER_REJECT;
          }

          // Skip input placeholders (they'll be handled separately if needed)
          if (tagName === 'input' || tagName === 'textarea') {
            return NodeFilter.FILTER_REJECT;
          }

          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    let node;
    while ((node = walker.nextNode())) {
      const originalText = node.nodeValue;
      const trimmedText = originalText.trim();

      // Store both the trimmed text for translation and the original for whitespace preservation
      texts.push(trimmedText);
      nodes.push({
        node,
        leadingSpace: originalText.match(/^(\s*)/)[1],
        trailingSpace: originalText.match(/(\s*)$/)[1]
      });
    }

    console.log(`📝 Collected ${texts.length} text nodes for translation`);
    console.log(`📝 Sample texts:`, texts.slice(0, 5));

    return { texts, nodes };
  }, []);

  /**
   * Translate texts via backend API (using free Google Translate)
   * Handles batching to prevent server crashes with large datasets
   */
  const translateTexts = useCallback(async (texts, targetLang) => {
    try {
      const BATCH_SIZE = 200;

      if (texts.length <= BATCH_SIZE) {
        setTranslationProgress(50); // Show 50% while translating single batch

        const response = await fetch('http://localhost:3001/api/translate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            texts,
            targetLang
          })
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || 'Translation failed');
        }

        const data = await response.json();
        console.log(`✅ Translation complete. Cache hit rate: ${data.cacheHitRate}`);

        setTranslationProgress(100);
        return data.translated;
      }

      // For large arrays, split into batches
      console.log(`📦 Splitting ${texts.length} texts into batches of ${BATCH_SIZE}...`);
      const allTranslations = [];
      const totalBatches = Math.ceil(texts.length / BATCH_SIZE);

      for (let i = 0; i < texts.length; i += BATCH_SIZE) {
        const batch = texts.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;

        console.log(`🔄 Translating batch ${batchNum}/${totalBatches} (${batch.length} texts)...`);

        // Update progress based on batch completion
        const progressPercent = Math.round((batchNum / totalBatches) * 100);
        setTranslationProgress(progressPercent);

        const response = await fetch('http://localhost:3001/api/translate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            texts: batch,
            targetLang
          })
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || 'Translation failed');
        }

        const data = await response.json();
        allTranslations.push(...data.translated);

        console.log(`✅ Batch ${batchNum}/${totalBatches} complete (${progressPercent}%)`);
      }

      console.log(`✅ All ${allTranslations.length} texts translated successfully!`);
      setTranslationProgress(100);
      return allTranslations;
    } catch (error) {
      console.error('❌ Translation error:', error);
      throw error;
    }
  }, []);

  /**
   * Main translation function with smart caching
   * Uses text-based mapping so it works even when DOM structure changes
   */
  const translatePage = useCallback(async (targetLang) => {
    if (currentLang === targetLang) {
      console.log('Already in target language');
      return;
    }

    setIsTranslating(true);
    setTranslationProgress(0);

    try {
      // Collect current text nodes from DOM
      const { texts, nodes } = collectTexts();

      if (texts.length === 0) {
        console.warn('No translatable content found');
        setIsTranslating(false);
        return;
      }

      if (targetLang === 'ja') {
        // Translating to Japanese
        console.log(`🔄 Translating ${texts.length} text nodes to Japanese...`);

        // Check which texts we already have cached
        const textsToTranslate = [];
        const indicesToTranslate = [];

        texts.forEach((text, index) => {
          if (!translationMap.has(text)) {
            textsToTranslate.push(text);
            indicesToTranslate.push(index);
          }
        });

        // Translate only new texts
        if (textsToTranslate.length > 0) {
          console.log(`🆕 Translating ${textsToTranslate.length} new texts (${texts.length - textsToTranslate.length} from cache)`);
          const newTranslations = await translateTexts(textsToTranslate, targetLang);

          // Cache the new translations
          textsToTranslate.forEach((text, index) => {
            translationMap.set(text, newTranslations[index]);
          });
        } else {
          console.log(`✅ All ${texts.length} texts served from cache (no API call needed)`);
          setTranslationProgress(100); // Instant progress when fully cached
        }

        // Apply translations to all nodes with preserved whitespace
        nodes.forEach((nodeInfo, index) => {
          const translation = translationMap.get(texts[index]);
          if (translation) {
            // Restore original leading/trailing whitespace
            nodeInfo.node.nodeValue = nodeInfo.leadingSpace + translation + nodeInfo.trailingSpace;
          }
        });

        setCurrentLang('ja');
        console.log(`✅ Page translated to Japanese`);
      } else if (targetLang === 'en') {
        // Switching back to English
        console.log(`🔄 Restoring English for ${texts.length} text nodes...`);
        setTranslationProgress(50);

        // We need to reverse-lookup: find English text from Japanese text
        // Build reverse map
        const reverseMap = new Map();
        translationMap.forEach((ja, en) => {
          reverseMap.set(ja, en);
        });

        // Restore English for each node with preserved whitespace
        nodes.forEach((nodeInfo, index) => {
          const currentJapanese = texts[index];
          const originalEnglish = reverseMap.get(currentJapanese);

          if (originalEnglish) {
            // Restore original leading/trailing whitespace
            nodeInfo.node.nodeValue = nodeInfo.leadingSpace + originalEnglish + nodeInfo.trailingSpace;
          }
          // If no reverse mapping exists, the text is already in English
        });

        setTranslationProgress(100);
        setCurrentLang('en');
        console.log(`✅ Page restored to English (no API call needed)`);
      }
    } catch (error) {
      console.error('Translation failed:', error);
      alert(`Translation failed: ${error.message}\nPlease check your backend server is running.`);
    } finally {
      setIsTranslating(false);
      // Reset progress after a short delay to allow user to see 100%
      setTimeout(() => setTranslationProgress(0), 500);
    }
  }, [currentLang, collectTexts, translateTexts, translationMap]);

  /**
   * Toggle between English and Japanese
   */
  const toggleLanguage = useCallback(() => {
    const newLang = currentLang === 'en' ? 'ja' : 'en';
    translatePage(newLang);
  }, [currentLang, translatePage]);

  /**
   * Clear translation cache
   */
  const clearTranslationCache = useCallback(() => {
    console.log('🗑️ Clearing translation cache');
    translationMap.clear();
    setCurrentLang('en');
  }, [translationMap]);

  const value = {
    currentLang,
    isTranslating,
    translationProgress,
    hasReport,
    setHasReport,
    translatePage,
    toggleLanguage,
    clearTranslationCache,
    translationCache: translationMap
  };

  return (
    <TranslationContext.Provider value={value}>
      {children}
    </TranslationContext.Provider>
  );
};
