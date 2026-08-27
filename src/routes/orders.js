const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const ApiResponse = require('../utils/response');
const logger = require('../utils/logger');

router.post('/', async (req, res) => {
    try {
        const { customer, delivery, items, payment, notes } = req.body;
        let subtotal = 0;
        const orderItems = [];
        for (const item of items) {
            const itemTotal = item.unitPrice * item.quantity;
            subtotal += itemTotal;
            orderItems.push({ ...item, total: itemTotal });
        }
        let deliveryFee = delivery?.isDelivery ? (parseInt(process.env.BASE_DELIVERY_FEE) || 500) : 0;
        if (delivery?.isDelivery && subtotal >= (parseInt(process.env.FREE_DELIVERY_THRESHOLD) || 10000)) {
            deliveryFee = 0;
        }
        const total = subtotal + deliveryFee;
        const order = new Order({
            customer,
            delivery: { isDelivery: delivery?.isDelivery || false, address: delivery?.address || '', fee: deliveryFee },
            items: orderItems,
            subtotal,
            total,
            payment: { method: payment.method, status: payment.method === 'online' ? 'pending' : 'pending' },
            notes,
            status: 'pending',
        });
        await order.save();
        logger.info(`New order created: ${order.orderNumber}`);
        return ApiResponse.created(res, 'Order placed successfully', { order, paymentRequired: false });
    } catch (error) {
        logger.error(`Create order error: ${error.message}`);
        return ApiResponse.serverError(res, 'Failed to create order');
    }
});

router.get('/', async (req, res) => {
    try {
        const orders = await Order.find().sort({ createdAt: -1 });
        return ApiResponse.success(res, 'Orders retrieved', orders);
    } catch (error) {
        return ApiResponse.serverError(res, 'Failed to retrieve orders');
    }
});

router.patch('/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        const order = await Order.findById(req.params.id);
        if (!order) return ApiResponse.notFound(res, 'Order not found');
        order.status = status;
        await order.save();
        return ApiResponse.success(res, 'Order status updated', order);
    } catch (error) {
        return ApiResponse.serverError(res, 'Failed to update order');
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const order = await Order.findByIdAndDelete(req.params.id);
        if (!order) return ApiResponse.notFound(res, 'Order not found');
        return ApiResponse.success(res, 'Order deleted');
    } catch (error) {
        return ApiResponse.serverError(res, 'Failed to delete order');
    }
});

module.exports = router;
