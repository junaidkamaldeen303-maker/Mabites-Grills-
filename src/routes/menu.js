const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const ApiResponse = require('../utils/response');

router.get('/', async (req, res) => {
    try {
        const { category } = req.query;
        const filter = { isAvailable: true };
        if (category) filter.category = category;
        const products = await Product.find(filter).sort({ category: 1, name: 1 });
        return ApiResponse.success(res, 'Menu retrieved', products);
    } catch (error) {
        return ApiResponse.serverError(res, 'Failed to retrieve menu');
    }
});

module.exports = router;
