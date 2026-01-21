const PDFDocument = require('pdfkit');
const path = require('path');
const {
    formatScanDataForPdf,
    formatAiAnalysisForPdf,
    translateToJapanese
} = require('./geminiService');
const gridfsService = require('./gridfsService');

// Font paths
const FONTS = {
    regular: path.join(__dirname, '../fonts/NotoSansJP-Regular.ttf'),
    bold: path.join(__dirname, '../fonts/NotoSansJP-Bold.ttf')
};

// Colors
const COLORS = {
    primary: '#6366f1',
    success: '#22c55e',
    warning: '#f59e0b',
    danger: '#ef4444',
    info: '#3b82f6',
    text: '#1f2937',
    textLight: '#6b7280',
    border: '#e5e7eb',
    background: '#f9fafb'
};

// Rate limit delay (35 seconds to be safe with 2 RPM)
const RATE_LIMIT_DELAY = 35000;

/**
 * Generate a comprehensive bilingual PDF report from scan results
 * @param {Object} scanResult - The complete scan result from MongoDB
 * @returns {Promise<Buffer>} - PDF as a buffer
 */
async function generatePdfReport(scanResult) {
    console.log('📄 Starting PDF generation...');

    // Step 1: Format scan data (includes English + Japanese)
    console.log('📊 Step 1/3: Formatting scan data...');
    let scanData;
    try {
        scanData = await formatScanDataForPdf(scanResult);
    } catch (error) {
        console.error('❌ Failed to format scan data:', error.message);
        throw new Error('Failed to format scan data for PDF');
    }

    // Debug: Check what ZAP data we have
    const zapSection = scanData.sections?.find(s => s.id === 'zap');
    console.log(`🔍 ZAP section found: ${!!zapSection}`);
    if (zapSection) {
        console.log(`🔍 ZAP detailedAlerts: ${zapSection.detailedAlerts?.length || 0} items`);
        console.log(`🔍 ZAP alerts: ${zapSection.alerts?.length || 0} items`);
        if (zapSection.detailedAlerts && zapSection.detailedAlerts.length > 0) {
            console.log(`🔍 First detailedAlert: ${JSON.stringify(zapSection.detailedAlerts[0]).substring(0, 200)}`);
        }
    }

    // CRITICAL FIX: Fetch full detailed alerts from GridFS to avoid truncated remediation text
    // The MongoDB summaryAlerts truncate solution to 150 chars, but GridFS has the full text
    if (zapSection && scanResult.zapResult?.reportFiles?.length > 0) {
        const detailedAlertsFile = scanResult.zapResult.reportFiles.find(
            f => f.filename && f.filename.includes('detailed_alerts')
        );

        if (detailedAlertsFile && detailedAlertsFile.fileId) {
            try {
                console.log(`📥 Fetching full detailed alerts from GridFS: ${detailedAlertsFile.fileId}`);
                const detailedAlertsBuffer = await gridfsService.downloadFile(detailedAlertsFile.fileId);
                const fullDetailedAlerts = JSON.parse(detailedAlertsBuffer.toString('utf-8'));

                // Replace truncated alerts with full ones
                zapSection.detailedAlerts = fullDetailedAlerts.map(alert => ({
                    name: alert.alert,
                    risk: alert.risk,
                    confidence: alert.confidence,
                    description: alert.description || 'No description available',
                    solution: alert.solution || 'No solution provided',
                    reference: alert.reference || '',
                    cweid: alert.cweid,
                    wascid: alert.wascid,
                    totalOccurrences: alert.totalOccurrences || alert.occurrences?.length || 0
                }));

                console.log(`✅ Replaced with ${zapSection.detailedAlerts.length} full detailed alerts from GridFS`);
                if (zapSection.detailedAlerts.length > 0 && zapSection.detailedAlerts[0].solution) {
                    console.log(`🔍 First solution length: ${zapSection.detailedAlerts[0].solution.length} chars (full text)`);
                }
            } catch (gridfsError) {
                console.warn(`⚠️ Failed to fetch detailed alerts from GridFS: ${gridfsError.message}`);
                console.warn('⚠️ Using truncated alerts from MongoDB (solution text may be incomplete)');
            }
        }
    }

    // Wait for rate limit
    console.log(`⏳ Waiting ${RATE_LIMIT_DELAY / 1000}s for rate limit...`);
    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));

    // Step 2: Format AI analysis (English)
    console.log('📝 Step 2/3: Formatting AI analysis...');
    let aiAnalysisEn = null;
    if (scanResult.refinedReport) {
        try {
            aiAnalysisEn = await formatAiAnalysisForPdf(scanResult.refinedReport);
        } catch (error) {
            console.error('⚠️ Failed to format AI analysis:', error.message);
        }
    }

    // Wait for rate limit
    console.log(`⏳ Waiting ${RATE_LIMIT_DELAY / 1000}s for rate limit...`);
    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));

    // Step 3: Translate both AI analysis AND vulnerabilities to Japanese (combined in single API call)
    console.log('🌐 Step 3/3: Translating AI analysis + vulnerabilities to Japanese...');
    let aiAnalysisJa = null;
    let vulnerabilitiesJa = [];
    // zapSection already declared above during debug
    const vulnerabilitiesEn = zapSection?.detailedAlerts || [];

    console.log(`📊 Found ${vulnerabilitiesEn.length} vulnerabilities in scan data`);
    if (vulnerabilitiesEn.length > 0) {
        console.log(`📝 First vulnerability: ${vulnerabilitiesEn[0]?.name || vulnerabilitiesEn[0]?.alert}`);
    }

    if (aiAnalysisEn || (vulnerabilitiesEn && vulnerabilitiesEn.length > 0)) {
        try {
            const japaneseData = await translateToJapanese(
                aiAnalysisEn || {},
                vulnerabilitiesEn || []
            );
            aiAnalysisJa = japaneseData.aiAnalysis;
            vulnerabilitiesJa = japaneseData.vulnerabilities;
            console.log(`✅ Translated ${vulnerabilitiesJa.length} vulnerabilities to Japanese`);
        } catch (error) {
            console.error('⚠️ Failed to translate to Japanese:', error.message);
            // Fallback to English if translation fails
            aiAnalysisJa = aiAnalysisEn;
            vulnerabilitiesJa = vulnerabilitiesEn;
        }
    }

    console.log('✅ All Gemini calls completed, generating PDF...');

    // Generate the PDF
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({
                size: 'A4',
                bufferPages: true,
                margins: { top: 50, bottom: 50, left: 50, right: 50 },
                info: {
                    Title: `Security Scan Report - ${scanResult.target}`,
                    Author: 'SSDT Security Scanner',
                    Subject: 'Comprehensive Security and Performance Analysis',
                    CreationDate: new Date()
                }
            });

            // Register Japanese fonts
            doc.registerFont('NotoSans', FONTS.regular);
            doc.registerFont('NotoSans-Bold', FONTS.bold);

            const chunks = [];
            doc.on('data', chunk => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            // ==================== RENDER ENGLISH VERSION ====================
            renderReport(doc, scanData, aiAnalysisEn, vulnerabilitiesEn, 'en');

            // ==================== PAGE BREAK ====================
            doc.addPage();

            // ==================== RENDER JAPANESE VERSION ====================
            renderJapaneseHeader(doc);
            renderReport(doc, scanData, aiAnalysisJa, vulnerabilitiesJa, 'ja');

            // ==================== ADD FOOTERS ====================
            addFooters(doc);

            doc.end();
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Render the report content
 */
function renderReport(doc, scanData, aiAnalysis, vulnerabilities, lang) {
    const isJapanese = lang === 'ja';

    // Header
    renderHeader(doc, scanData, lang);

    // Executive Summary
    renderSummary(doc, scanData, lang);

    // Scan Data Sections
    renderScanSections(doc, scanData, lang);

    // AI Analysis
    if (aiAnalysis) {
        renderAiAnalysis(doc, aiAnalysis, isJapanese);
    }

    // Detailed Vulnerabilities
    if (vulnerabilities && vulnerabilities.length > 0) {
        renderDetailedVulnerabilities(doc, vulnerabilities, lang);
    }
}

/**
 * Render the report header
 */
function renderHeader(doc, scanData, lang) {
    const header = scanData.header;
    const title = typeof header.title === 'object' ? header.title[lang] : header.title;

    doc.font('NotoSans-Bold')
        .fontSize(24)
        .fillColor(COLORS.primary)
        .text(title, { align: 'center' });

    doc.moveDown(0.3);

    doc.font('NotoSans')
        .fontSize(12)
        .fillColor(COLORS.text)
        .text(`Target: ${header.target}`, { align: 'center' });

    doc.fontSize(10)
        .fillColor(COLORS.textLight)
        .text(`${lang === 'ja' ? '生成日' : 'Generated'}: ${header.date}`, { align: 'center' })
        .text(`Scan ID: ${header.scanId}`, { align: 'center' });

    doc.moveDown(0.5);

    // Divider line
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke(COLORS.border);
    doc.moveDown(0.5);
}

/**
 * Render Japanese version header
 */
function renderJapaneseHeader(doc) {
    doc.font('NotoSans-Bold')
        .fontSize(18)
        .fillColor(COLORS.primary)
        .text('Japanese Version', { align: 'center' });

    doc.moveDown(0.3);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke(COLORS.border);
    doc.moveDown(0.5);
}

/**
 * Render executive summary
 */
function renderSummary(doc, scanData, lang) {
    const summary = scanData.summary;
    const title = typeof summary.title === 'object' ? summary.title[lang] : summary.title;
    const riskLabel = typeof summary.riskLabel === 'object' ? summary.riskLabel[lang] : summary.riskLabel;
    const riskLevel = typeof summary.riskLevel === 'object' ? summary.riskLevel[lang] : summary.riskLevel;

    // Section header
    addSectionHeader(doc, title);

    // Risk level with color
    const riskColor = getRiskColor(riskLevel);
    doc.font('NotoSans-Bold')
        .fontSize(11)
        .fillColor(COLORS.text)
        .text(`${riskLabel}: `, { continued: true })
        .fillColor(riskColor)
        .text(riskLevel.toUpperCase());

    doc.moveDown(0.5);
}

/**
 * Render scan data sections
 */
function renderScanSections(doc, scanData, lang) {
    for (const section of scanData.sections) {
        // Check if we need a new page
        if (doc.y > 680) {
            doc.addPage();
        }

        const title = typeof section.title === 'object' ? section.title[lang] : section.title;
        addSectionHeader(doc, title);

        // Render items
        for (const item of section.items) {
            renderItem(doc, item, lang);
        }

        // Render alerts if present (for ZAP section)
        if (section.alerts && section.alerts.length > 0) {
            doc.moveDown(0.3);
            doc.font('NotoSans-Bold')
                .fontSize(10)
                .fillColor(COLORS.text)
                .text(lang === 'ja' ? '検出された脆弱性:' : 'Top Vulnerabilities:');

            for (let i = 0; i < section.alerts.length; i++) {
                const alert = section.alerts[i];
                const riskColor = getRiskColor(alert.risk);
                doc.font('NotoSans')
                    .fontSize(9)
                    .fillColor(riskColor)
                    .text(`  ${i + 1}. [${alert.risk}] ${alert.alert}`, { width: 480 });
            }
        }

        doc.moveDown(0.5);
    }
}

/**
 * Render a single item
 */
function renderItem(doc, item, lang) {
    const label = typeof item.label === 'object' ? item.label[lang] : item.label;
    let value = item.value;

    // Handle bilingual values
    if (typeof value === 'object' && value !== null && (value.en || value.ja)) {
        value = value[lang] || value.en || '';
    }

    const typeColor = getTypeColor(item.type);

    // Bullet point
    doc.font('NotoSans')
        .fontSize(10)
        .fillColor(COLORS.textLight)
        .text('  \u2022 ', { continued: true })
        .font('NotoSans-Bold')
        .fillColor(COLORS.text)
        .text(`${label}: `, { continued: true })
        .font('NotoSans')
        .fillColor(typeColor)
        .text(String(value));
}

/**
 * Render AI analysis section
 */
function renderAiAnalysis(doc, analysis, isJapanese) {
    // Check if we need a new page
    if (doc.y > 500) {
        doc.addPage();
    }

    const title = analysis.title || (isJapanese ? 'AIによるセキュリティ分析' : 'AI-Generated Security Analysis');
    addSectionHeader(doc, title);

    if (!analysis.sections) return;

    for (const section of analysis.sections) {
        // Check for page break
        if (doc.y > 680) {
            doc.addPage();
        }

        // Section heading
        if (section.heading) {
            doc.font('NotoSans-Bold')
                .fontSize(11)
                .fillColor(COLORS.primary)
                .text(section.heading);
            doc.moveDown(0.2);
        }

        // Render content
        if (section.content) {
            for (const block of section.content) {
                renderContentBlock(doc, block);
            }
        }

        doc.moveDown(0.3);
    }
}

/**
 * Parse and render text with markdown bold (**text**) support
 */
function renderTextWithBold(doc, text, options = {}) {
    const parts = [];
    let lastIndex = 0;
    const boldRegex = /\*\*([^*]+)\*\*/g;
    let match;

    while ((match = boldRegex.exec(text)) !== null) {
        // Add text before the bold part
        if (match.index > lastIndex) {
            parts.push({ text: text.substring(lastIndex, match.index), bold: false });
        }
        // Add the bold part (without the **)
        parts.push({ text: match[1], bold: true });
        lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < text.length) {
        parts.push({ text: text.substring(lastIndex), bold: false });
    }

    // If no bold parts found, render as single text
    if (parts.length === 0) {
        doc.text(text, options);
        return;
    }

    // Render each part with appropriate font
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isLast = i === parts.length - 1;

        doc.font(part.bold ? 'NotoSans-Bold' : 'NotoSans')
            .text(part.text, { ...options, continued: !isLast });
    }
}

/**
 * Render a content block (paragraph, bullets, bold_text)
 */
function renderContentBlock(doc, block) {
    switch (block.type) {
        case 'paragraph':
            doc.fontSize(10)
                .fillColor(COLORS.text);
            renderTextWithBold(doc, block.text, { width: 495, align: 'left', lineGap: 2 });
            doc.moveDown(0.2);
            break;

        case 'bullets':
            if (block.items && Array.isArray(block.items)) {
                for (const item of block.items) {
                    doc.fontSize(10)
                        .fillColor(COLORS.text);
                    // Render bullet with bold support
                    const bulletText = `  \u2022 ${item}`;
                    renderTextWithBold(doc, bulletText, { width: 485 });
                }
            }
            doc.moveDown(0.2);
            break;

        case 'bold_text':
            doc.font('NotoSans-Bold')
                .fontSize(10)
                .fillColor(COLORS.text)
                .text(`${block.label} `, { continued: true })
                .font('NotoSans')
                .fillColor(getTypeColor(block.text?.toLowerCase?.() === 'high' ? 'danger' : 'stat'))
                .text(block.text || '');
            doc.moveDown(0.2);
            break;

        default:
            // Handle as paragraph if unknown type
            if (block.text) {
                doc.fontSize(10)
                    .fillColor(COLORS.text);
                renderTextWithBold(doc, block.text, { width: 495 });
                doc.moveDown(0.2);
            }
    }
}

/**
 * Render detailed vulnerabilities section
 */
function renderDetailedVulnerabilities(doc, vulnerabilities, lang) {
    // Check if we need a new page
    if (doc.y > 500) {
        doc.addPage();
    }

    const title = lang === 'ja'
        ? '脆弱性の詳細と修正方法'
        : 'Vulnerability Details & Remediation';

    addSectionHeader(doc, title);

    for (let i = 0; i < vulnerabilities.length; i++) {
        const vuln = vulnerabilities[i];

        // Check for page break before each vulnerability
        if (doc.y > 650) {
            doc.addPage();
        }

        // Vulnerability heading with number and name
        doc.moveDown(0.3);
        const riskColor = getRiskColor(vuln.risk);

        doc.font('NotoSans-Bold')
            .fontSize(11)
            .fillColor(COLORS.text)
            .text(`${i + 1}. ${vuln.name || vuln.alert}`, { continued: false });

        doc.moveDown(0.2);

        // Risk and Confidence badges
        doc.font('NotoSans')
            .fontSize(9)
            .fillColor(COLORS.textLight)
            .text(`${lang === 'ja' ? 'リスク' : 'Risk'}: `, { continued: true })
            .fillColor(riskColor)
            .font('NotoSans-Bold')
            .text(vuln.risk || 'Unknown', { continued: true })
            .fillColor(COLORS.textLight)
            .font('NotoSans')
            .text(`  |  ${lang === 'ja' ? '信頼度' : 'Confidence'}: `, { continued: true })
            .fillColor(COLORS.text)
            .text(vuln.confidence || 'Unknown');

        doc.moveDown(0.3);

        // Description section
        if (vuln.description) {
            doc.font('NotoSans-Bold')
                .fontSize(9)
                .fillColor(COLORS.primary)
                .text(lang === 'ja' ? '説明:' : 'Description:', { continued: false });

            doc.moveDown(0.1);

            doc.fontSize(9)
                .fillColor(COLORS.text);
            renderTextWithBold(doc, vuln.description, { width: 485, align: 'left', lineGap: 2 });

            doc.moveDown(0.3);
        }

        // Solution section
        if (vuln.solution) {
            doc.font('NotoSans-Bold')
                .fontSize(9)
                .fillColor(COLORS.success)
                .text(lang === 'ja' ? '推奨される修正方法:' : 'Recommended Solution:', { continued: false });

            doc.moveDown(0.1);

            doc.fontSize(9)
                .fillColor(COLORS.text);
            renderTextWithBold(doc, vuln.solution, { width: 485, align: 'left', lineGap: 2 });

            doc.moveDown(0.3);
        }

        // Additional metadata (CWE, WASC, Occurrences)
        const metadata = [];
        if (vuln.cweid) metadata.push(`CWE-${vuln.cweid}`);
        if (vuln.wascid) metadata.push(`WASC-${vuln.wascid}`);
        if (vuln.totalOccurrences) {
            metadata.push(lang === 'ja'
                ? `${vuln.totalOccurrences}回検出`
                : `${vuln.totalOccurrences} occurrence(s)`);
        }

        if (metadata.length > 0) {
            doc.font('NotoSans')
                .fontSize(8)
                .fillColor(COLORS.textLight)
                .text(metadata.join(' | '), { width: 485 });

            doc.moveDown(0.2);
        }

        // Reference links
        if (vuln.reference) {
            doc.font('NotoSans')
                .fontSize(8)
                .fillColor(COLORS.info)
                .text(lang === 'ja' ? '参考情報: ' : 'References: ', { continued: true })
                .fillColor(COLORS.textLight)
                .text(vuln.reference, { width: 450, link: vuln.reference });
        }

        // Divider line between vulnerabilities (except for the last one)
        if (i < vulnerabilities.length - 1) {
            doc.moveDown(0.3);
            doc.moveTo(60, doc.y).lineTo(535, doc.y).stroke(COLORS.border);
        }

        doc.moveDown(0.4);
    }
}

/**
 * Add a section header
 */
function addSectionHeader(doc, title) {
    doc.moveDown(0.3);

    // Background box
    const startY = doc.y;
    doc.rect(50, startY, 495, 22)
        .fill(COLORS.background);

    doc.font('NotoSans-Bold')
        .fontSize(12)
        .fillColor(COLORS.primary)
        .text(title, 55, startY + 5);

    doc.y = startY + 28;
}

/**
 * Add footers to all pages
 */
function addFooters(doc) {
    const range = doc.bufferedPageRange();
    if (!range || range.count === 0) {
        console.warn('No pages to add footers to');
        return;
    }

    const pageCount = range.count;

    for (let i = 0; i < pageCount; i++) {
        doc.switchToPage(i);

        // Access page dimensions after switching to ensure correct values
        const pageWidth = doc.page.width;
        const footerY = doc.page.height - 30;

        const footerText = `Page ${i + 1} of ${pageCount} | SSDT Security Scanner | Generated ${new Date().toLocaleDateString()}`;

        // Set font before measuring text width
        doc.font('NotoSans').fontSize(8);
        const textWidth = doc.widthOfString(footerText);
        const centerX = (pageWidth - textWidth) / 2;

        // Simple text call without alignment options to prevent page creation
        doc.fillColor(COLORS.textLight)
            .text(footerText, centerX, footerY, { lineBreak: false });
    }
}

/**
 * Get color based on risk level
 */
function getRiskColor(risk) {
    if (!risk) return COLORS.textLight;
    const r = String(risk).toLowerCase();
    if (r === 'high' || r.includes('high')) return COLORS.danger;
    if (r === 'medium' || r.includes('medium')) return COLORS.warning;
    if (r === 'low' || r.includes('low')) return COLORS.info;
    return COLORS.success;
}

/**
 * Get color based on item type
 */
function getTypeColor(type) {
    switch (type) {
        case 'danger': return COLORS.danger;
        case 'warning': return COLORS.warning;
        case 'success': return COLORS.success;
        case 'info': return COLORS.info;
        case 'grade':
            return COLORS.primary;
        case 'score':
        case 'stat':
        default:
            return COLORS.text;
    }
}

module.exports = {
    generatePdfReport
};
