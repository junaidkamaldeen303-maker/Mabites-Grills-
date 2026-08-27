// ============================================================
// server-cluster.js – Mabites Grills Production Server
// ============================================================

const cluster = require('cluster');
const os = require('os');
const dotenv = require('dotenv');

dotenv.config();

const isDev = process.env.NODE_ENV === 'development';
const numCPUs = isDev ? 1 : os.cpus().length;

if (cluster.isMaster && !isDev) {
    console.log(`🚀 Mabites Grills Production Server`);
    console.log(`📡 Master ${process.pid} is running`);
    console.log(`💻 Detected ${numCPUs} CPU cores`);
    console.log(`📦 Forking ${numCPUs} workers...\n`);

    // Fork workers
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }

    // Handle worker crashes
    cluster.on('exit', (worker, code, signal) => {
        console.log(`💀 Worker ${worker.process.pid} died (code: ${code})`);
        console.log('🔄 Restarting worker...');
        cluster.fork();
    });

    // Log worker online
    cluster.on('online', (worker) => {
        console.log(`✅ Worker ${worker.process.pid} is online`);
    });

} else {
    // ============================================================
    // WORKER PROCESS - Runs the actual server
    // ============================================================

    const express = require('express');
    const mongoose = require('mongoose');
    const cors = require('cors');
    const cookieParser = require('cookie-parser');
    const helmet = require('helmet');
    const compression = require('compression');
    const rateLimit = require('express-rate-limit');
    const multer = require('multer');
    const path = require('path');
    const fs = require('fs');

    const app = express();
    const PORT = process.env.PORT || 3000;

    // Import models
    const Staff = require('./src/models/Staff');
    const googleRoutes = require('./src/routes/googleRoutes');

    // ============================================
    // SECURITY MIDDLEWARE
    // ============================================

    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
                scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
                imgSrc: ["'self'", "data:", "https:"],
                fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
            },
        },
    }));

    // Compression
    app.use(compression());

    // ============================================
    // RATE LIMITING
    // ============================================

    // Global rate limiter - 100 requests per 10 minutes per IP
    const globalLimiter = rateLimit({
        windowMs: 10 * 60 * 1000,
        max: 200,
        message: {
            success: false,
            message: 'Too many requests. Please try again later.',
        },
        standardHeaders: true,
        legacyHeaders: false,
    });

    // Strict limiter for order creation - 10 orders per hour per IP
    const orderLimiter = rateLimit({
        windowMs: 60 * 60 * 1000,
        max: 20,
        message: {
            success: false,
            message: 'Order limit reached. Please try again later.',
        },
        standardHeaders: true,
        legacyHeaders: false,
    });

    // Apply global rate limiter to all /api routes
    app.use('/api/', globalLimiter);

    // ============================================
    // CORS
    // ============================================

    const allowedOrigins = process.env.ALLOWED_ORIGINS ?
        process.env.ALLOWED_ORIGINS.split(',') :
        ['http://localhost:5500', 'http://127.0.0.1:5500', 'http://localhost:3000'];

    app.use(cors({
        origin: function (origin, callback) {
            if (!origin) return callback(null, true);
            if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
                callback(null, true);
            } else {
                callback(new Error('Not allowed by CORS'));
            }
        },
        credentials: true,
    }));

    // ============================================
    // REQUEST TIMEOUT
    // ============================================

    app.use((req, res, next) => {
        req.setTimeout(30000);
        res.setTimeout(30000);
        next();
    });

    // ============================================
    // BODY PARSERS
    // ============================================

    app.use(express.json({ limit: '10mb' }));
    app.use(cookieParser());

    // ============================================
    // SERVE STATIC FILES
    // ============================================

    app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
    app.use(express.static(__dirname));

    const uploadsDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
    }

    // ============================================
    // MULTER CONFIGURATION
    // ============================================

    const storage = multer.diskStorage({
        destination: function (req, file, cb) {
            cb(null, uploadsDir);
        },
        filename: function (req, file, cb) {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            const ext = path.extname(file.originalname);
            cb(null, uniqueSuffix + ext);
        }
    });

    const fileFilter = (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp|svg/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error('Only image files are allowed'));
    };

    const upload = multer({
        storage: storage,
        limits: { fileSize: 5 * 1024 * 1024 },
        fileFilter: fileFilter
    });

    // ============================================
    // MODELS
    // ============================================

    const menuItemSchema = new mongoose.Schema({
        id: { type: String, required: true, unique: true },
        name: { type: String, required: true },
        category: { type: String, required: true },
        price: { type: Number, required: true },
        description: String,
        image: { type: String, default: null },
        isAvailable: { type: Boolean, default: true },
        isPopular: { type: Boolean, default: false },
        variants: Array,
        modifiers: Array,
        createdAt: { type: Date, default: Date.now }
    });

    const MenuItem = mongoose.model('MenuItem', menuItemSchema);

    const orderSchema = new mongoose.Schema({
        orderNumber: String,
        customer: {
            name: String,
            phone: String,
            email: String
        },
        delivery: {
            isDelivery: Boolean,
            address: String,
            fee: Number
        },
        items: [{
            productId: String,
            name: String,
            quantity: Number,
            unitPrice: Number,
            total: Number
        }],
        subtotal: Number,
        total: Number,
        payment: {
            method: String,
            status: String,
            confirmationName: String
        },
        status: String,
        notes: String
    }, {
        timestamps: true,
        strict: false
    });

    const Order = mongoose.model('Order', orderSchema);

    const settingsSchema = new mongoose.Schema({
        prepTime: { type: Number, default: 15 },
        deliveryRadius: { type: Number, default: 5 },
        deliveryFee: { type: Number, default: 500 },
        freeDeliveryThreshold: { type: Number, default: 10000 },
        openingHours: {
            monday: { open: { type: String, default: '09:00' }, close: { type: String, default: '22:00' } },
            tuesday: { open: { type: String, default: '09:00' }, close: { type: String, default: '22:00' } },
            wednesday: { open: { type: String, default: '09:00' }, close: { type: String, default: '22:00' } },
            thursday: { open: { type: String, default: '09:00' }, close: { type: String, default: '22:00' } },
            friday: { open: { type: String, default: '09:00' }, close: { type: String, default: '23:00' } },
            saturday: { open: { type: String, default: '09:00' }, close: { type: String, default: '23:00' } },
            sunday: { open: { type: String, default: '10:00' }, close: { type: String, default: '20:00' } }
        },
        updatedAt: { type: Date, default: Date.now }
    }, { timestamps: true });

    const Settings = mongoose.model('Settings', settingsSchema);

    const cartSchema = new mongoose.Schema({
        userId: { type: String, required: true, default: 'guest' },
        sessionId: { type: String, required: true, unique: true },
        items: [{
            productId: { type: String, required: true },
            name: { type: String, required: true },
            price: { type: Number, required: true },
            quantity: { type: Number, required: true, min: 1 },
            image: { type: String, default: null }
        }],
        subtotal: { type: Number, default: 0 },
        totalItems: { type: Number, default: 0 },
        updatedAt: { type: Date, default: Date.now }
    }, { timestamps: true });

    const Cart = mongoose.model('Cart', cartSchema);

    // ============================================
    // SSE CLIENTS
    // ============================================

    const kitchenClients = [];
    const menuClients = [];
    const adminClients = [];
    const orderClients = {};

    function broadcastOrderUpdate(orderId, orderData) {
        if (!orderClients[orderId]) return;
        const message = `data: ${JSON.stringify({
            type: 'order_update',
            orderId: orderId,
            data: orderData
        })}\n\n`;
        const deadClients = [];
        orderClients[orderId].forEach((client, index) => {
            try {
                client.res.write(message);
            } catch (e) {
                deadClients.push(index);
            }
        });
        for (let i = deadClients.length - 1; i >= 0; i--) {
            orderClients[orderId].splice(deadClients[i], 1);
        }
        if (orderClients[orderId].length === 0) {
            delete orderClients[orderId];
        }
    }

    function broadcastToAdmin(data) {
        const message = `data: ${JSON.stringify(data)}\n\n`;
        const deadClients = [];
        adminClients.forEach((client, index) => {
            try {
                client.res.write(message);
            } catch (e) {
                deadClients.push(index);
            }
        });
        for (let i = deadClients.length - 1; i >= 0; i--) {
            adminClients.splice(deadClients[i], 1);
        }
    }

    function broadcastToKitchen(data) {
        const message = `data: ${JSON.stringify(data)}\n\n`;
        const deadClients = [];
        kitchenClients.forEach((client, index) => {
            try {
                client.res.write(message);
            } catch (e) {
                deadClients.push(index);
            }
        });
        for (let i = deadClients.length - 1; i >= 0; i--) {
            kitchenClients.splice(deadClients[i], 1);
        }
    }

    function broadcastMenuUpdate() {
        MenuItem.find()
            .then(items => {
                const data = JSON.stringify({
                    type: 'menu_update',
                    data: items,
                    timestamp: Date.now()
                });
                const deadClients = [];
                menuClients.forEach((client, index) => {
                    try {
                        client.res.write(`data: ${data}\n\n`);
                    } catch (e) {
                        deadClients.push(index);
                    }
                });
                for (let i = deadClients.length - 1; i >= 0; i--) {
                    menuClients.splice(deadClients[i], 1);
                }
            })
            .catch(err => console.error('❌ Broadcast error:', err));
    }

    // ============================================
    // AUTH ROUTES
    // ============================================

    app.use('/api/auth', require('./src/routes/auth'));
    app.use('/api/auth', googleRoutes);

    // ============================================
    // HEALTH CHECK
    // ============================================

    app.get('/health', (req, res) => {
        res.json({
            status: 'ok',
            worker: process.pid,
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            timestamp: new Date().toISOString()
        });
    });

    // ============================================
    // SSE STREAMS
    // ============================================

    app.get('/api/orders/stream', (req, res) => {
        console.log(`📡 Admin orders SSE connected (worker ${process.pid})`);
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*'
        });
        res.write(`data: ${JSON.stringify({ type: 'connected', worker: process.pid })}\n\n`);
        const client = { id: Date.now(), res };
        adminClients.push(client);
        const pingInterval = setInterval(() => {
            try {
                res.write(`data: ${JSON.stringify({ type: 'ping', timestamp: Date.now() })}\n\n`);
            } catch (e) {
                clearInterval(pingInterval);
            }
        }, 25000);
        req.on('close', () => {
            clearInterval(pingInterval);
            const index = adminClients.findIndex(c => c.id === client.id);
            if (index !== -1) adminClients.splice(index, 1);
        });
    });

    app.get('/api/kitchen/stream', (req, res) => {
        console.log(`📡 Kitchen client connected (worker ${process.pid})`);
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        });
        res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
        const client = { id: Date.now(), res };
        kitchenClients.push(client);
        req.on('close', () => {
            const index = kitchenClients.findIndex(c => c.id === client.id);
            if (index !== -1) kitchenClients.splice(index, 1);
        });
    });

    app.get('/api/menu/stream', (req, res) => {
        console.log(`📡 Menu client connected (worker ${process.pid})`);
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*'
        });
        MenuItem.find().then(items => {
            res.write(`data: ${JSON.stringify({ type: 'menu_update', data: items, timestamp: Date.now() })}\n\n`);
        }).catch(err => {
            res.write(`data: ${JSON.stringify({ type: 'menu_update', data: [] })}\n\n`);
        });
        const client = { id: Date.now(), res };
        menuClients.push(client);
        const pingInterval = setInterval(() => {
            try {
                res.write(`data: ${JSON.stringify({ type: 'ping', timestamp: Date.now() })}\n\n`);
            } catch (e) {
                clearInterval(pingInterval);
            }
        }, 25000);
        req.on('close', () => {
            clearInterval(pingInterval);
            const index = menuClients.findIndex(c => c.id === client.id);
            if (index !== -1) menuClients.splice(index, 1);
        });
    });

    // ============================================
    // ORDER STATUS SSE STREAM
    // ============================================

    app.get('/api/orders/stream/:orderId', (req, res) => {
        const { orderId } = req.params;
        console.log(`📡 Order SSE client connected for ${orderId} (worker ${process.pid})`);
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*'
        });
        res.write(`data: ${JSON.stringify({ type: 'connected', orderId: orderId })}\n\n`);
        if (!orderClients[orderId]) {
            orderClients[orderId] = [];
        }
        const client = { id: Date.now(), res };
        orderClients[orderId].push(client);
        const pingInterval = setInterval(() => {
            try {
                res.write(`data: ${JSON.stringify({ type: 'ping' })}\n\n`);
            } catch (e) {
                clearInterval(pingInterval);
            }
        }, 25000);
        req.on('close', () => {
            clearInterval(pingInterval);
            if (orderClients[orderId]) {
                const index = orderClients[orderId].findIndex(c => c.id === client.id);
                if (index !== -1) orderClients[orderId].splice(index, 1);
                if (orderClients[orderId].length === 0) {
                    delete orderClients[orderId];
                }
            }
        });
    });

    // ============================================
    // TRACK ORDER
    // ============================================

    app.get('/api/orders/track/:identifier', async (req, res) => {
        try {
            const { identifier } = req.params;
            let order;
            if (identifier.startsWith('MB-')) {
                order = await Order.findOne({ orderNumber: identifier });
            } else {
                try {
                    const mongoose = require('mongoose');
                    if (mongoose.Types.ObjectId.isValid(identifier)) {
                        order = await Order.findById(identifier);
                    }
                } catch (e) { }
            }
            if (!order) {
                return res.status(404).json({
                    success: false,
                    message: 'Order not found. Please check your order number.'
                });
            }
            res.json({ success: true, data: order });
        } catch (err) {
            console.error('❌ Track order error:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // ============================================
    // IMAGE UPLOAD
    // ============================================

    app.post('/api/upload', upload.single('image'), (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ success: false, message: 'No image file uploaded' });
            }
            res.json({
                success: true,
                data: {
                    filename: req.file.filename,
                    path: '/uploads/' + req.file.filename,
                    originalName: req.file.originalname,
                    size: req.file.size
                }
            });
        } catch (err) {
            console.error('❌ Upload error:', err);
            res.status(500).json({ success: false, message: err.message });
        }
    });

    // ============================================
    // MENU CRUD
    // ============================================

    app.get('/api/menu', async (req, res) => {
        try {
            const items = await MenuItem.find().sort({ createdAt: -1 });
            res.json({ success: true, data: items });
        } catch (err) {
            console.error('❌ Error fetching menu:', err);
            res.status(500).json({ success: false, message: err.message });
        }
    });

    app.post('/api/menu', async (req, res) => {
        try {
            const { name, category, price, description, isAvailable, image, variants, modifiers, isPopular } = req.body;
            if (!name || !category || !price) {
                return res.status(400).json({ success: false, message: 'Name, category, and price are required' });
            }
            const newItem = new MenuItem({
                id: Date.now().toString(),
                name: name.trim(),
                category: category,
                price: parseFloat(price),
                description: description || '',
                isAvailable: isAvailable !== undefined ? isAvailable : true,
                image: image || null,
                isPopular: isPopular || false,
                variants: variants || [],
                modifiers: modifiers || [],
            });
            await newItem.save();
            broadcastMenuUpdate();
            res.status(201).json({ success: true, data: newItem });
        } catch (err) {
            console.error('❌ Add menu error:', err);
            res.status(500).json({ success: false, message: err.message });
        }
    });

    app.put('/api/menu/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const { name, category, price, description, isAvailable, image, variants, modifiers, isPopular } = req.body;
            const item = await MenuItem.findOne({ id: id });
            if (!item) {
                return res.status(404).json({ success: false, message: 'Item not found' });
            }
            if (item.image && image && image !== item.image) {
                const oldImagePath = path.join(uploadsDir, item.image);
                if (fs.existsSync(oldImagePath)) {
                    fs.unlinkSync(oldImagePath);
                }
            }
            if (name) item.name = name.trim();
            if (category) item.category = category;
            if (price !== undefined) item.price = parseFloat(price);
            if (description !== undefined) item.description = description;
            if (isAvailable !== undefined) item.isAvailable = isAvailable;
            if (image !== undefined) item.image = image;
            if (isPopular !== undefined) item.isPopular = isPopular;
            if (variants !== undefined) item.variants = variants;
            if (modifiers !== undefined) item.modifiers = modifiers;
            await item.save();
            broadcastMenuUpdate();
            res.json({ success: true, data: item });
        } catch (err) {
            console.error('❌ Update menu error:', err);
            res.status(500).json({ success: false, message: err.message });
        }
    });

    app.patch('/api/menu/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const { isAvailable } = req.body;
            const item = await MenuItem.findOne({ id: id });
            if (!item) {
                return res.status(404).json({ success: false, message: 'Item not found' });
            }
            item.isAvailable = isAvailable !== undefined ? isAvailable : !item.isAvailable;
            await item.save();
            broadcastMenuUpdate();
            res.json({ success: true, data: item });
        } catch (err) {
            console.error('❌ Toggle menu error:', err);
            res.status(500).json({ success: false, message: err.message });
        }
    });

    app.delete('/api/menu/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const item = await MenuItem.findOne({ id: id });
            if (!item) {
                return res.status(404).json({ success: false, message: 'Item not found' });
            }
            if (item.image) {
                const imagePath = path.join(uploadsDir, item.image);
                if (fs.existsSync(imagePath)) {
                    fs.unlinkSync(imagePath);
                }
            }
            await MenuItem.deleteOne({ id: id });
            broadcastMenuUpdate();
            res.json({ success: true, message: 'Item deleted successfully' });
        } catch (err) {
            console.error('❌ Delete menu error:', err);
            res.status(500).json({ success: false, message: err.message });
        }
    });

    app.delete('/api/menu/clear-all', async (req, res) => {
        try {
            const items = await MenuItem.find();
            for (const item of items) {
                if (item.image) {
                    const imagePath = path.join(uploadsDir, item.image);
                    if (fs.existsSync(imagePath)) {
                        fs.unlinkSync(imagePath);
                    }
                }
            }
            await MenuItem.deleteMany({});
            broadcastMenuUpdate();
            res.json({ success: true, message: 'All menu items cleared successfully' });
        } catch (err) {
            console.error('❌ Clear all error:', err);
            res.status(500).json({ success: false, message: err.message });
        }
    });

    // ============================================
    // CART CRUD
    // ============================================

    app.get('/api/cart', async (req, res) => {
        try {
            let sessionId = req.headers['x-session-id'] || req.query.sessionId;
            if (!sessionId) {
                sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            }
            let cart = await Cart.findOne({ sessionId: sessionId });
            if (!cart) {
                cart = new Cart({ sessionId: sessionId, items: [], subtotal: 0, totalItems: 0 });
                await cart.save();
            }
            res.json({
                success: true,
                data: {
                    items: cart.items,
                    subtotal: cart.subtotal,
                    totalItems: cart.totalItems,
                    sessionId: sessionId
                }
            });
        } catch (err) {
            console.error('❌ Get cart error:', err);
            res.status(500).json({ success: false, message: err.message });
        }
    });

    app.post('/api/cart/add', async (req, res) => {
        try {
            const { productId, name, price, quantity, image, sessionId } = req.body;
            if (!productId || !name || !price) {
                return res.status(400).json({ success: false, message: 'productId, name, and price are required' });
            }
            let cart = await Cart.findOne({ sessionId: sessionId });
            if (!cart) {
                cart = new Cart({ sessionId: sessionId, items: [], subtotal: 0, totalItems: 0 });
            }
            const existingItem = cart.items.find(item => item.productId === productId);
            if (existingItem) {
                existingItem.quantity += (quantity || 1);
            } else {
                cart.items.push({ productId, name, price, quantity: quantity || 1, image: image || null });
            }
            cart.subtotal = cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            cart.totalItems = cart.items.reduce((sum, item) => sum + item.quantity, 0);
            cart.updatedAt = new Date();
            await cart.save();
            res.json({ success: true, data: { items: cart.items, subtotal: cart.subtotal, totalItems: cart.totalItems }, message: 'Item added to cart' });
        } catch (err) {
            console.error('❌ Add to cart error:', err);
            res.status(500).json({ success: false, message: err.message });
        }
    });

    app.put('/api/cart/update', async (req, res) => {
        try {
            const { productId, quantity, sessionId } = req.body;
            if (!productId || quantity === undefined) {
                return res.status(400).json({ success: false, message: 'productId and quantity are required' });
            }
            const cart = await Cart.findOne({ sessionId: sessionId });
            if (!cart) {
                return res.status(404).json({ success: false, message: 'Cart not found' });
            }
            const item = cart.items.find(item => item.productId === productId);
            if (!item) {
                return res.status(404).json({ success: false, message: 'Item not found in cart' });
            }
            if (quantity <= 0) {
                cart.items = cart.items.filter(item => item.productId !== productId);
            } else {
                item.quantity = quantity;
            }
            cart.subtotal = cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            cart.totalItems = cart.items.reduce((sum, item) => sum + item.quantity, 0);
            cart.updatedAt = new Date();
            await cart.save();
            res.json({ success: true, data: { items: cart.items, subtotal: cart.subtotal, totalItems: cart.totalItems }, message: 'Cart updated' });
        } catch (err) {
            console.error('❌ Update cart error:', err);
            res.status(500).json({ success: false, message: err.message });
        }
    });

    app.delete('/api/cart/remove/:productId', async (req, res) => {
        try {
            const { productId } = req.params;
            const { sessionId } = req.query;
            const cart = await Cart.findOne({ sessionId: sessionId });
            if (!cart) {
                return res.status(404).json({ success: false, message: 'Cart not found' });
            }
            cart.items = cart.items.filter(item => item.productId !== productId);
            cart.subtotal = cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            cart.totalItems = cart.items.reduce((sum, item) => sum + item.quantity, 0);
            cart.updatedAt = new Date();
            await cart.save();
            res.json({ success: true, data: { items: cart.items, subtotal: cart.subtotal, totalItems: cart.totalItems }, message: 'Item removed from cart' });
        } catch (err) {
            console.error('❌ Remove from cart error:', err);
            res.status(500).json({ success: false, message: err.message });
        }
    });

    app.delete('/api/cart/clear', async (req, res) => {
        try {
            const { sessionId } = req.query;
            if (!sessionId) {
                return res.status(400).json({ success: false, message: 'sessionId is required' });
            }
            const cart = await Cart.findOne({ sessionId: sessionId });
            if (!cart) {
                return res.status(404).json({ success: false, message: 'Cart not found' });
            }
            cart.items = [];
            cart.subtotal = 0;
            cart.totalItems = 0;
            cart.updatedAt = new Date();
            await cart.save();
            res.json({ success: true, message: 'Cart cleared successfully' });
        } catch (err) {
            console.error('❌ Clear cart error:', err);
            res.status(500).json({ success: false, message: err.message });
        }
    });

    // ============================================
    // ORDERS
    // ============================================

    app.get('/api/orders', async (req, res) => {
        try {
            const orders = await Order.find().sort({ createdAt: -1 });
            res.json({ success: true, data: orders });
        } catch (err) {
            console.error('Error:', err);
            res.json({ success: false, error: err.message });
        }
    });

    app.post('/api/orders', orderLimiter, async (req, res) => {
        console.log(`📥 Received order (worker ${process.pid})`);
        try {
            const order = new Order(req.body);
            const date = new Date();
            const num = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
            order.orderNumber = `MB-${date.getFullYear().toString().slice(-2)}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}-${num}`;
            order.status = 'pending';
            if (!order.payment) order.payment = { method: 'cash', status: 'pending' };
            const saved = await order.save();
            console.log(`✅ Saved order: ${saved.orderNumber}`);
            broadcastToKitchen({ type: 'new_order', order: saved });
            broadcastToAdmin({ type: 'new_order', orderNumber: saved.orderNumber, order: saved });
            broadcastOrderUpdate(saved._id.toString(), saved);
            res.status(201).json({ success: true, data: { order: saved } });
        } catch (err) {
            console.error('❌ Error:', err);
            res.status(500).json({ success: false, error: err.message, stack: err.stack });
        }
    });

    app.post('/api/orders/:id/confirm-payment', async (req, res) => {
        try {
            const order = await Order.findById(req.params.id);
            if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
            order.payment.status = 'paid';
            order.status = 'confirmed';
            if (req.body.confirmationName) {
                order.payment.confirmationName = req.body.confirmationName;
            }
            await order.save();
            broadcastToAdmin({ type: 'new_order', orderNumber: order.orderNumber, order: order });
            broadcastToKitchen({ type: 'order_update', order: order });
            broadcastOrderUpdate(req.params.id, {
                status: order.status,
                orderNumber: order.orderNumber,
                payment: order.payment,
                total: order.total,
                subtotal: order.subtotal,
                deliveryFee: order.deliveryFee,
                items: order.items,
                delivery: order.delivery,
                customer: order.customer
            });
            res.json({ success: true, message: 'Payment confirmed successfully', data: order });
        } catch (err) {
            console.error('❌ Payment confirmation error:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    app.patch('/api/orders/:id/status', async (req, res) => {
        try {
            const order = await Order.findById(req.params.id);
            if (!order) return res.status(404).json({ success: false });
            order.status = req.body.status;
            await order.save();
            broadcastToKitchen({ type: 'order_update', order: order });
            broadcastToAdmin({ type: 'order_update', orderId: order._id, orderNumber: order.orderNumber, status: order.status, order: order });
            if (req.body.status === 'delivered') {
                broadcastToAdmin({ type: 'order_delivered', orderNumber: order.orderNumber, order: order });
            }
            broadcastOrderUpdate(req.params.id, {
                status: order.status,
                orderNumber: order.orderNumber,
                payment: order.payment,
                total: order.total,
                subtotal: order.subtotal,
                deliveryFee: order.deliveryFee,
                items: order.items,
                delivery: order.delivery,
                customer: order.customer
            });
            res.json({ success: true, data: order });
        } catch (err) {
            console.error('❌ Status update error:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    app.delete('/api/orders/:id', async (req, res) => {
        try {
            await Order.findByIdAndDelete(req.params.id);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // ============================================
    // REVIEWS
    // ============================================

    let reviews = [];

    app.get('/api/reviews', (req, res) => {
        res.json({ success: true, data: reviews });
    });

    app.post('/api/reviews', (req, res) => {
        const newReview = { id: Date.now(), ...req.body, verified: true, createdAt: new Date().toISOString() };
        reviews.unshift(newReview);
        res.json({ success: true, data: newReview });
    });

    // ============================================
    // STAFF ROUTES
    // ============================================

    app.get('/api/staff', async (req, res) => {
        try {
            const staff = await Staff.find().select('-password');
            res.json({ success: true, data: staff });
        } catch (err) {
            console.error('❌ Get staff error:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    app.get('/api/staff/:id', async (req, res) => {
        try {
            const staff = await Staff.findById(req.params.id).select('-password');
            if (!staff) return res.status(404).json({ success: false, message: 'Staff not found' });
            res.json({ success: true, data: staff });
        } catch (err) {
            console.error('❌ Get staff error:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    app.post('/api/staff', async (req, res) => {
        try {
            const { name, email, password, role } = req.body;
            if (!name || !email || !password) {
                return res.status(400).json({ success: false, message: 'Name, email, and password are required' });
            }
            if (password.length < 6) {
                return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
            }
            const existingStaff = await Staff.findOne({ email: email.toLowerCase() });
            if (existingStaff) {
                return res.status(400).json({ success: false, message: 'Email already registered' });
            }
            const staff = new Staff({ name: name.trim(), email: email.toLowerCase(), password, role: role || 'kitchen', isActive: true });
            await staff.save();
            const staffData = staff.toObject();
            delete staffData.password;
            res.status(201).json({ success: true, message: 'Staff added successfully', data: staffData });
        } catch (err) {
            console.error('❌ Add staff error:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    app.put('/api/staff/:id', async (req, res) => {
        try {
            const { name, email, password, role, isActive } = req.body;
            const staff = await Staff.findById(req.params.id);
            if (!staff) return res.status(404).json({ success: false, message: 'Staff not found' });
            if (name) staff.name = name.trim();
            if (email) {
                const existingStaff = await Staff.findOne({ email: email.toLowerCase(), _id: { $ne: req.params.id } });
                if (existingStaff) {
                    return res.status(400).json({ success: false, message: 'Email already in use by another staff member' });
                }
                staff.email = email.toLowerCase();
            }
            if (password && password.length >= 6) staff.password = password;
            if (role) staff.role = role;
            if (isActive !== undefined) staff.isActive = isActive;
            await staff.save();
            const staffData = staff.toObject();
            delete staffData.password;
            res.json({ success: true, message: 'Staff updated successfully', data: staffData });
        } catch (err) {
            console.error('❌ Update staff error:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    app.patch('/api/staff/:id/toggle', async (req, res) => {
        try {
            const staff = await Staff.findById(req.params.id);
            if (!staff) return res.status(404).json({ success: false, message: 'Staff not found' });
            staff.isActive = !staff.isActive;
            await staff.save();
            const staffData = staff.toObject();
            delete staffData.password;
            res.json({ success: true, message: `Staff ${staff.isActive ? 'activated' : 'deactivated'}`, data: staffData });
        } catch (err) {
            console.error('❌ Toggle staff error:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    app.delete('/api/staff/:id', async (req, res) => {
        try {
            const staff = await Staff.findById(req.params.id);
            if (!staff) return res.status(404).json({ success: false, message: 'Staff not found' });
            if (staff.role === 'admin') {
                const adminCount = await Staff.countDocuments({ role: 'admin' });
                if (adminCount <= 1) {
                    return res.status(400).json({ success: false, message: 'Cannot delete the last admin user' });
                }
            }
            await Staff.findByIdAndDelete(req.params.id);
            res.json({ success: true, message: 'Staff deleted successfully' });
        } catch (err) {
            console.error('❌ Delete staff error:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // ============================================
    // SETTINGS ROUTES
    // ============================================

    app.get('/api/settings', async (req, res) => {
        try {
            let settings = await Settings.findOne();
            if (!settings) {
                settings = new Settings({
                    prepTime: 15,
                    deliveryRadius: 5,
                    deliveryFee: 500,
                    freeDeliveryThreshold: 10000,
                    openingHours: {
                        monday: { open: '09:00', close: '22:00' },
                        tuesday: { open: '09:00', close: '22:00' },
                        wednesday: { open: '09:00', close: '22:00' },
                        thursday: { open: '09:00', close: '22:00' },
                        friday: { open: '09:00', close: '23:00' },
                        saturday: { open: '09:00', close: '23:00' },
                        sunday: { open: '10:00', close: '20:00' }
                    }
                });
                await settings.save();
            }
            res.json({ success: true, data: settings });
        } catch (err) {
            console.error('❌ Get settings error:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    app.put('/api/settings', async (req, res) => {
        try {
            const { prepTime, deliveryRadius, deliveryFee, freeDeliveryThreshold, openingHours } = req.body;
            let settings = await Settings.findOne();
            if (!settings) settings = new Settings();
            if (prepTime !== undefined) settings.prepTime = prepTime;
            if (deliveryRadius !== undefined) settings.deliveryRadius = deliveryRadius;
            if (deliveryFee !== undefined) settings.deliveryFee = deliveryFee;
            if (freeDeliveryThreshold !== undefined) settings.freeDeliveryThreshold = freeDeliveryThreshold;
            if (openingHours) settings.openingHours = openingHours;
            settings.updatedAt = new Date();
            await settings.save();
            res.json({ success: true, data: settings });
        } catch (err) {
            console.error('❌ Update settings error:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // ============================================
    // DASHBOARD STATS
    // ============================================

    app.get('/api/stats/overview', async (req, res) => {
        try {
            const totalOrders = await Order.countDocuments();
            const pendingOrders = await Order.countDocuments({ status: 'pending' });
            const deliveryOrders = await Order.countDocuments({ 'delivery.isDelivery': true });
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const todayRevenueOrders = await Order.find({
                createdAt: { $gte: today },
                status: { $in: ['confirmed', 'preparing', 'ready', 'delivered'] }
            });
            const todayRevenue = todayRevenueOrders.reduce((sum, o) => sum + (o.total || 0), 0);
            res.json({
                success: true,
                data: { totalOrders, pendingOrders, todayRevenue, deliveryOrders }
            });
        } catch (err) {
            console.error('❌ Overview stats error:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    app.get('/api/stats/popular-items', async (req, res) => {
        try {
            const orders = await Order.find();
            const itemCounts = {};
            orders.forEach(order => {
                (order.items || []).forEach(item => {
                    const name = item.name || 'Unknown';
                    if (!itemCounts[name]) itemCounts[name] = { quantity: 0, revenue: 0 };
                    itemCounts[name].quantity += (item.quantity || 0);
                    itemCounts[name].revenue += (item.total || 0);
                });
            });
            const popular = Object.entries(itemCounts)
                .map(([name, data]) => ({ name, ...data }))
                .sort((a, b) => b.quantity - a.quantity)
                .slice(0, 5);
            res.json({ success: true, data: popular });
        } catch (err) {
            console.error('❌ Popular items error:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    app.get('/api/stats/revenue-breakdown', async (req, res) => {
        try {
            const revenueOrders = await Order.find({
                status: { $in: ['confirmed', 'preparing', 'ready', 'delivered'] }
            });
            const cashRevenue = revenueOrders
                .filter(o => o.payment?.method === 'cash')
                .reduce((sum, o) => sum + (o.total || 0), 0);
            const bankTransferRevenue = revenueOrders
                .filter(o => o.payment?.method !== 'cash' && o.payment?.method !== undefined)
                .reduce((sum, o) => sum + (o.total || 0), 0);
            res.json({ success: true, data: { cash: cashRevenue, online: bankTransferRevenue, total: cashRevenue + bankTransferRevenue } });
        } catch (err) {
            console.error('❌ Revenue breakdown error:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    app.get('/api/stats/reports', async (req, res) => {
        try {
            const { period = 'daily' } = req.query;
            const now = new Date();
            let startDate = new Date();
            if (period === 'daily') {
                startDate.setHours(0, 0, 0, 0);
            } else if (period === 'weekly') {
                startDate.setDate(now.getDate() - now.getDay());
                startDate.setHours(0, 0, 0, 0);
            } else if (period === 'monthly') {
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            } else {
                return res.status(400).json({ success: false, message: 'Invalid period. Use daily, weekly, or monthly' });
            }
            const orders = await Order.find({
                createdAt: { $gte: startDate },
                status: { $in: ['confirmed', 'preparing', 'ready', 'delivered'] }
            });
            const totalRevenue = orders.reduce((sum, o) => sum + (o.total || 0), 0);
            const itemCounts = {};
            orders.forEach(order => {
                (order.items || []).forEach(item => {
                    const name = item.name || 'Unknown';
                    if (!itemCounts[name]) itemCounts[name] = { quantity: 0, revenue: 0 };
                    itemCounts[name].quantity += (item.quantity || 0);
                    itemCounts[name].revenue += (item.total || 0);
                });
            });
            const topItems = Object.entries(itemCounts)
                .map(([name, data]) => ({ name, ...data }))
                .sort((a, b) => b.quantity - a.quantity)
                .slice(0, 10);
            res.json({ success: true, data: { period, startDate, totalOrders: orders.length, totalRevenue, topItems } });
        } catch (err) {
            console.error('❌ Reports error:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // ============================================
    // CONNECT TO MONGODB
    // ============================================

    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/mabites';

    mongoose.connect(MONGODB_URI, {
        maxPoolSize: 50,
        minPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
    })
        .then(async () => {
            const settingsCount = await Settings.countDocuments();
            if (settingsCount === 0) {
                const defaultSettings = new Settings({
                    prepTime: 15,
                    deliveryRadius: 5,
                    deliveryFee: 500,
                    freeDeliveryThreshold: 10000,
                    openingHours: {
                        monday: { open: '09:00', close: '22:00' },
                        tuesday: { open: '09:00', close: '22:00' },
                        wednesday: { open: '09:00', close: '22:00' },
                        thursday: { open: '09:00', close: '22:00' },
                        friday: { open: '09:00', close: '23:00' },
                        saturday: { open: '09:00', close: '23:00' },
                        sunday: { open: '10:00', close: '20:00' }
                    }
                });
                await defaultSettings.save();
                console.log('📋 Default settings initialized');
            }

            const itemCount = await MenuItem.countDocuments();
            console.log(`📋 ${itemCount} menu items in database`);

            app.listen(PORT, () => {
                console.log(`🚀 Worker ${process.pid} running on http://localhost:${PORT}`);
                console.log(`✅ MongoDB connected (pool size: 50)`);
                console.log(`📡 SSE streaming enabled for kitchen, menu, admin, and order tracking`);
                console.log(`📋 ${itemCount} menu items loaded from database`);
                console.log(`🔐 JWT authentication enabled`);
                console.log(`🖼️  Image upload enabled - /api/upload`);
                console.log(`📡 Order Status SSE streaming - /api/orders/stream/:orderId`);
                console.log(`🔍 Order tracking - /api/orders/track/:identifier`);
                console.log(`⭐ Reviews API enabled - /api/reviews`);
                console.log(`🛡️ Rate limiting: 200 req/10min (global), 20 orders/hour (strict)`);
                console.log(`🛡️ Helmet security enabled`);
                console.log(`📦 Compression enabled`);
            });
        })
        .catch(err => {
            console.error('❌ MongoDB error:', err);
            process.exit(1);
        });

    // ============================================
    // ERROR HANDLING
    // ============================================

    process.on('uncaughtException', (err) => {
        console.error('💥 Uncaught Exception:', err);
    });

    process.on('unhandledRejection', (reason, promise) => {
        console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
    });

    console.log(`✅ Worker ${process.pid} started`);
}

// ============================================
// EXPORT FOR MODULE
// ============================================

module.exports = app;