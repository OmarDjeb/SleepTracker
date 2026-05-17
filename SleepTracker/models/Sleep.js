const mongoose = require('mongoose');

const sleepSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    hours: Number,
    quality: String,
    date: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Sleep', sleepSchema);