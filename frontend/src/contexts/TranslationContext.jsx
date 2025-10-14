import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

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
  const [translationCache, setTranslationCache] = useState(new Map());

  // Load language preference from localStorage
  useEffect(() => {
    const savedLang = localStorage.getItem('preferredLanguage');
    if (savedLang && ['en', 'ja'].includes(savedLang)) {
      setCurrentLang(savedLang);
    }
  }, []);

  // Save language preference to localStorage
  const saveLanguagePreference = useCallback((lang) => {
    localStorage.setItem('preferredLanguage', lang);
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
      texts.push(node.nodeValue.trim());
      nodes.push(node);
    }

    return { texts, nodes };
  }, []);

  /**
   * Translate texts via backend API
   */
  const translateTexts = useCallback(async (texts, targetLang) => {
    try {
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

      return data.translated;
    } catch (error) {
      console.error('❌ Translation error:', error);
      throw error;
    }
  }, []);

  /**
   * Main translation function
   */
  const translatePage = useCallback(async (targetLang) => {
    if (currentLang === targetLang) {
      console.log('Already in target language');
      return;
    }

    setIsTranslating(true);

    try {
      // Collect all text nodes
      const { texts, nodes } = collectTexts();

      if (texts.length === 0) {
        console.warn('No translatable content found');
        setIsTranslating(false);
        return;
      }

      console.log(`🔄 Translating ${texts.length} text nodes to ${targetLang}...`);

      // Translate texts
      const translated = await translateTexts(texts, targetLang);

      // Apply translations to DOM
      nodes.forEach((node, index) => {
        if (translated[index]) {
          node.nodeValue = translated[index];
        }
      });

      // Update state
      setCurrentLang(targetLang);
      saveLanguagePreference(targetLang);

      console.log(`✅ Page translated to ${targetLang}`);
    } catch (error) {
      console.error('Translation failed:', error);
      alert(`Translation failed: ${error.message}\nPlease check your API configuration.`);
    } finally {
      setIsTranslating(false);
    }
  }, [currentLang, collectTexts, translateTexts, saveLanguagePreference]);

  /**
   * Toggle between English and Japanese
   */
  const toggleLanguage = useCallback(() => {
    const newLang = currentLang === 'en' ? 'ja' : 'en';
    translatePage(newLang);
  }, [currentLang, translatePage]);

  const value = {
    currentLang,
    isTranslating,
    translatePage,
    toggleLanguage,
    translationCache
  };

  return (
    <TranslationContext.Provider value={value}>
      {children}
    </TranslationContext.Provider>
  );
};
