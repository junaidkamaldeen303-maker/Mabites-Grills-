const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    orderNumber: { type: String, unique: true },
    customer: {
        name: { type: String, required: true },
        phone: { type: String, required: true },
        email: String,
    },
    delivery: {
        isDelivery: { type: Boolean, default: false },
        address: String,
        fee: { type: Number, default: 0 },
    },
    items: [{
        productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        name: String,
        quantity: Number,
        unitPrice: Number,
        modifiers: [{ name: String, price: Number }],
        total: Number,
    }],
    subtotal: { type: Number, required: true },
    total: { type: Number, required: true },
    payment: {
        method: { type: String, enum: ['online', 'cash', 'transfer'], required: true },
        status: { type: String, enum: ['pending', 'paid', 'failed'], default: 'pending' },
        reference: { type: String, unique: true, sparse: true },
    },
    status: {
        type: String,
        enum: ['pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled'],
        default: 'pending',
    },
    notes: String,
}, { timestamps: true });

orderSchema.pre('save', function(next) {
    if (this.isNew) {
        const date = new Date();
        const year = date.getFullYear().toString().slice(-2);
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const count = Math.floor(Math.random() * 1000).toString().padStart(4, '0');
        this.orderNumber = `MB-${year}${month}${day}-${count}`;
    }
    next();
});

module.exports = mongoose.model('Order', orderSchema);
