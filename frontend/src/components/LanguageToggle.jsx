import React from 'react';
import { useTranslation } from '../contexts/TranslationContext';
import '../styles/LanguageToggle.css';

const LanguageToggle = () => {
  const { currentLang, isTranslating, translationProgress, toggleLanguage, hasReport } = useTranslation();

  // Don't render the button if there's no report generated yet
  if (!hasReport) {
    return null;
  }

  return (
    <button
      className={`language-toggle ${isTranslating ? 'translating' : ''}`}
      onClick={toggleLanguage}
      disabled={isTranslating}
      aria-label="Toggle language between English and Japanese"
      title={currentLang === 'en' ? 'Switch to Japanese' : 'Switch to English'}
      style={{
        '--progress': `${translationProgress}%`
      }}
    >
      {isTranslating && (
        <div className="progress-percentage">{translationProgress}%</div>
      )}
      <div className="toggle-content">
        {!isTranslating && (
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
