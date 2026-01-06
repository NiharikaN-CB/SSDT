const mongoose = require('mongoose');

const zapAlertSchema = new mongoose.Schema({
    scanId: {
        type: String,
        required: true,
        index: true
    },
    alertId: {
        type: String,
        required: true
    },
    name: {
        type: String,
        required: true
    },
    risk: {
        type: String,
        enum: ['High', 'Medium', 'Low', 'Informational'],
        required: true,
        index: true
    },
    confidence: {
        type: String,
        enum: ['High', 'Medium', 'Low'],
        required: true
    },
    url: {
        type: String,
        required: true
    },
    description: String,
    solution: String,
    reference: String,
    cweid: String,
    wascid: String,
    param: String,
    attack: String,
    evidence: String,
    otherinfo: String,
    createdAt: {
        type: Date,
        default: Date.now
    }
}, {
    collection: 'zap_alerts'
});

// Compound index for efficient queries
zapAlertSchema.index({ scanId: 1, risk: 1 });
zapAlertSchema.index({ scanId: 1, createdAt: -1 });

module.exports = mongoose.model('ZapAlert', zapAlertSchema);
