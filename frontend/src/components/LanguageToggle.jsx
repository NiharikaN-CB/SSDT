import React from 'react';
import { useTranslation } from '../contexts/TranslationContext';
import '../styles/LanguageToggle.css';

const LanguageToggle = () => {
  const { currentLang, isTranslating, toggleLanguage } = useTranslation();

  return (
    <button
      className={`language-toggle ${isTranslating ? 'translating' : ''}`}
      onClick={toggleLanguage}
      disabled={isTranslating}
      aria-label="Toggle language between English and Japanese"
      title={currentLang === 'en' ? 'Switch to Japanese' : 'Switch to English'}
    >
      <div className="toggle-content">
        {isTranslating ? (
          <>
            <span className="spinner"></span>
            <span className="toggle-text">Translating...</span>
          </>
        ) : (
          <>
            <span className="flag-icon">{currentLang === 'en' ? '🇯🇵' : '🇬🇧'}</span>
            <span className="toggle-text">
              {currentLang === 'en' ? '日本語' : 'English'}
            </span>
          </>
        )}
      </div>
    </button>
  );
};

export default LanguageToggle;
