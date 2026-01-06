const mongoose = require('mongoose');
const { GridFSBucket } = require('mongodb');
const stream = require('stream');

class GridFSService {
    constructor() {
        this.bucket = null;
    }

    initialize() {
        if (!this.bucket) {
            const db = mongoose.connection.db;
            this.bucket = new GridFSBucket(db, {
                bucketName: 'zap_reports'
            });
        }
        return this.bucket;
    }

    /**
     * Upload a file to GridFS
     * @param {Buffer|String} data - File data
     * @param {String} filename - Filename
     * @param {Object} metadata - Additional metadata
     * @returns {Promise<ObjectId>} - File ID
     */
    async uploadFile(data, filename, metadata = {}) {
        const bucket = this.initialize();

        return new Promise((resolve, reject) => {
            const uploadStream = bucket.openUploadStream(filename, {
                metadata: {
                    ...metadata,
                    uploadDate: new Date()
                }
            });

            uploadStream.on('error', reject);
            uploadStream.on('finish', () => resolve(uploadStream.id));

            // Convert string to buffer if needed
            const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);

            // Create readable stream from buffer
            const readableStream = new stream.Readable();
            readableStream.push(buffer);
            readableStream.push(null);

            readableStream.pipe(uploadStream);
        });
    }

    /**
     * Download a file from GridFS
     * @param {ObjectId|String} fileId - File ID
     * @returns {Promise<Buffer>} - File data
     */
    async downloadFile(fileId) {
        const bucket = this.initialize();

        return new Promise((resolve, reject) => {
            const chunks = [];
            const downloadStream = bucket.openDownloadStream(
                mongoose.Types.ObjectId(fileId)
            );

            downloadStream.on('data', chunk => chunks.push(chunk));
            downloadStream.on('error', reject);
            downloadStream.on('end', () => resolve(Buffer.concat(chunks)));
        });
    }

    /**
     * Download file as stream (for large files)
     * @param {ObjectId|String} fileId - File ID
     * @returns {ReadStream} - Download stream
     */
    downloadFileStream(fileId) {
        const bucket = this.initialize();
        return bucket.openDownloadStream(mongoose.Types.ObjectId(fileId));
    }

    /**
     * Delete a file from GridFS
     * @param {ObjectId|String} fileId - File ID
     */
    async deleteFile(fileId) {
        const bucket = this.initialize();
        await bucket.delete(mongoose.Types.ObjectId(fileId));
    }

    /**
     * List files for a scan
     * @param {String} scanId - Scan ID
     * @returns {Promise<Array>} - List of files
     */
    async listFiles(scanId) {
        const bucket = this.initialize();
        const files = await bucket
            .find({ 'metadata.scanId': scanId })
            .toArray();
        return files;
    }

    /**
     * Get file metadata
     * @param {ObjectId|String} fileId - File ID
     */
    async getFileMetadata(fileId) {
        const bucket = this.initialize();
        const files = await bucket
            .find({ _id: mongoose.Types.ObjectId(fileId) })
            .toArray();
        return files[0] || null;
    }
}

module.exports = new GridFSService();
