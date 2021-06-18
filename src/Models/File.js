const mongoose = require('mongoose');

module.exports = new mongoose.Schema({

    base64: { type: String },
    createdAt: { type: Number },
    id: { type: String },
    type: { type: String }

})