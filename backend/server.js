require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Import Google OAuth routes
const googleRoutes = require('./src/routes/googleRoutes');

// ===== MIDDLEWARE =====
app.use(cors({
  origin: ['http://localhost:5500', 'http://127.0.0.1:5500', 'http://localhost:3000'],
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(cookieParser());

// ===== SERVE STATIC FILES =====
// Serve uploaded images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
// Serve frontend files (HTML, CSS, JS) 
app.use(express.static(__dirname));

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('📁 Uploads directory created');
}

// ===== MULTER CONFIGURATION =====
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
  } else {
    cb(new Error('Only image files are allowed (jpeg, jpg, png, gif, webp, svg)'));
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: fileFilter
});

// ===== MODELS =====

// Menu Item Model
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

// ===== ORDER MODEL =====
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

// Settings Model
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

// ===== CART MODEL - versionKey: false =====
const cartSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    default: 'guest'
  },
  sessionId: {
    type: String,
    required: true,
    unique: true
  },
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
}, {
  timestamps: true,
  versionKey: false
});

const Cart = mongoose.model('Cart', cartSchema);

// ===== SSE CLIENTS =====
const kitchenClients = [];
const menuClients = [];
const adminClients = [];
const orderClients = {};

// Broadcast functions
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
    .catch(err => {
      console.error('❌ Broadcast error:', err);
    });
}

// ===== AUTH ROUTES =====
app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/auth', googleRoutes);

// ===== ROUTES =====

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ============================================
// SSE STREAMS
// ============================================

app.get('/api/orders/stream', (req, res) => {
  console.log('📡 Admin orders SSE connected');
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  res.write(`data: ${JSON.stringify({ type: 'connected', message: 'Connected to order stream' })}\n\n`);
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
    console.log('📡 Admin orders SSE disconnected');
    clearInterval(pingInterval);
    const index = adminClients.findIndex(c => c.id === client.id);
    if (index !== -1) adminClients.splice(index, 1);
  });
});

app.get('/api/kitchen/stream', (req, res) => {
  console.log('📡 Kitchen client connected');
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
  console.log('📡 Menu client connected');
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  MenuItem.find()
    .then(items => {
      res.write(`data: ${JSON.stringify({ type: 'menu_update', data: items, timestamp: Date.now() })}\n\n`);
    })
    .catch(err => {
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
    console.log('📡 Menu client disconnected');
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
  console.log(`📡 Order SSE client connected for order: ${orderId}`);
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
    console.log(`📡 Order SSE client disconnected for order: ${orderId}`);
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
      return res.status(400).json({
        success: false,
        message: 'No image file uploaded'
      });
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
    res.json({
      success: true,
      message: 'All menu items cleared successfully'
    });
  } catch (err) {
    console.error('❌ Clear all error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================
// CART CRUD - Using findOneAndUpdate with upsert
// ============================================

// Get cart by sessionId
app.get('/api/cart', async (req, res) => {
  try {
    let sessionId = req.headers['x-session-id'] || req.query.sessionId;
    if (!sessionId) {
      sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
    let cart = await Cart.findOne({ sessionId: sessionId });
    if (!cart) {
      cart = new Cart({
        sessionId: sessionId,
        items: [],
        subtotal: 0,
        totalItems: 0
      });
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

// Add item to cart
app.post('/api/cart/add', async (req, res) => {
  try {
    const { productId, name, price, quantity, image, sessionId } = req.body;

    if (!productId || !name || !price) {
      return res.status(400).json({
        success: false,
        message: 'productId, name, and price are required'
      });
    }

    let cart = await Cart.findOne({ sessionId: sessionId });

    if (!cart) {
      cart = new Cart({
        sessionId: sessionId,
        items: [],
        subtotal: 0,
        totalItems: 0
      });
    }

    const existingItem = cart.items.find(item => item.productId === productId);

    if (existingItem) {
      existingItem.quantity += (quantity || 1);
    } else {
      cart.items.push({
        productId: productId,
        name: name,
        price: price,
        quantity: quantity || 1,
        image: image || null
      });
    }

    cart.subtotal = cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    cart.totalItems = cart.items.reduce((sum, item) => sum + item.quantity, 0);
    cart.updatedAt = new Date();

    const updatedCart = await Cart.findOneAndUpdate(
      { sessionId: sessionId },
      {
        $set: {
          items: cart.items,
          subtotal: cart.subtotal,
          totalItems: cart.totalItems,
          updatedAt: cart.updatedAt
        }
      },
      {
        new: true,
        upsert: true,
        runValidators: true
      }
    );

    res.json({
      success: true,
      data: {
        items: updatedCart.items,
        subtotal: updatedCart.subtotal,
        totalItems: updatedCart.totalItems
      },
      message: 'Item added to cart'
    });
  } catch (err) {
    console.error('❌ Add to cart error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Update cart item quantity
app.put('/api/cart/update', async (req, res) => {
  try {
    const { productId, quantity, sessionId } = req.body;

    if (!productId || quantity === undefined) {
      return res.status(400).json({
        success: false,
        message: 'productId and quantity are required'
      });
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

    const updatedCart = await Cart.findOneAndUpdate(
      { sessionId: sessionId },
      {
        $set: {
          items: cart.items,
          subtotal: cart.subtotal,
          totalItems: cart.totalItems,
          updatedAt: cart.updatedAt
        }
      },
      {
        new: true,
        upsert: false,
        runValidators: true
      }
    );

    res.json({
      success: true,
      data: {
        items: updatedCart.items,
        subtotal: updatedCart.subtotal,
        totalItems: updatedCart.totalItems
      },
      message: 'Cart updated'
    });
  } catch (err) {
    console.error('❌ Update cart error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Remove item from cart
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

    const updatedCart = await Cart.findOneAndUpdate(
      { sessionId: sessionId },
      {
        $set: {
          items: cart.items,
          subtotal: cart.subtotal,
          totalItems: cart.totalItems,
          updatedAt: cart.updatedAt
        }
      },
      {
        new: true,
        upsert: false,
        runValidators: true
      }
    );

    res.json({
      success: true,
      data: {
        items: updatedCart.items,
        subtotal: updatedCart.subtotal,
        totalItems: updatedCart.totalItems
      },
      message: 'Item removed from cart'
    });
  } catch (err) {
    console.error('❌ Remove from cart error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Clear cart
app.delete('/api/cart/clear', async (req, res) => {
  try {
    const { sessionId } = req.query;

    if (!sessionId) {
      return res.status(400).json({ success: false, message: 'sessionId is required' });
    }

    const updatedCart = await Cart.findOneAndUpdate(
      { sessionId: sessionId },
      {
        $set: {
          items: [],
          subtotal: 0,
          totalItems: 0,
          updatedAt: new Date()
        }
      },
      {
        new: true,
        upsert: true,
        runValidators: true
      }
    );

    res.json({
      success: true,
      message: 'Cart cleared successfully',
      data: {
        items: updatedCart.items,
        subtotal: updatedCart.subtotal,
        totalItems: updatedCart.totalItems
      }
    });
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

app.post('/api/orders', async (req, res) => {
  console.log('📥 Received:', req.body);

  try {
    const order = new Order(req.body);
    const date = new Date();
    const num = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    order.orderNumber = `MB-${date.getFullYear().toString().slice(-2)}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}-${num}`;
    order.status = 'pending';
    if (!order.payment) order.payment = { method: 'cash', status: 'pending' };

    const saved = await order.save();
    console.log('✅ Saved:', saved.orderNumber);

    broadcastToKitchen({ type: 'new_order', order: saved });
    broadcastToAdmin({
      type: 'new_order',
      orderNumber: saved.orderNumber,
      order: saved
    });
    broadcastOrderUpdate(saved._id.toString(), saved);

    res.status(201).json({
      success: true,
      data: { order: saved }
    });
  } catch (err) {
    console.error('❌ Error:', err);
    res.status(500).json({
      success: false,
      error: err.message,
      stack: err.stack
    });
  }
});

// ============================================
// PAYMENT CONFIRMATION
// ============================================

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

    console.log('💳 Payment confirmed for order:', order.orderNumber);

    broadcastToAdmin({
      type: 'new_order',
      orderNumber: order.orderNumber,
      order: order
    });
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

    res.json({
      success: true,
      message: 'Payment confirmed successfully',
      data: order
    });
  } catch (err) {
    console.error('❌ Payment confirmation error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// UPDATE ORDER STATUS
// ============================================

app.patch('/api/orders/:id/status', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false });

    order.status = req.body.status;
    await order.save();

    console.log(`📝 Order ${order.orderNumber} status updated to: ${order.status}`);

    broadcastToKitchen({ type: 'order_update', order: order });
    broadcastToAdmin({
      type: 'order_update',
      orderId: order._id,
      orderNumber: order.orderNumber,
      status: order.status,
      order: order
    });

    if (req.body.status === 'delivered') {
      broadcastToAdmin({
        type: 'order_delivered',
        orderNumber: order.orderNumber,
        order: order
      });
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
// REVIEWS API
// ============================================

app.get('/api/reviews', async (req, res) => {
  try {
    const reviews = [
      {
        id: 1,
        name: 'David Okonkwo',
        avatar: null,
        rating: 5,
        text: 'Mabites Grills is absolutely amazing! Their shawarma is the best I\'ve had in Ogbomoso. The chicken is always fresh and the service is top-notch. Highly recommend!',
        date: '2 weeks ago',
        source: 'Google'
      },
      {
        id: 2,
        name: 'Funmi Adeyemi',
        avatar: null,
        rating: 5,
        text: 'I ordered the chicken and fries combo and it was delicious! The portion size was generous and the price was very reasonable. Will definitely order again.',
        date: '1 month ago',
        source: 'Google'
      },
      {
        id: 3,
        name: 'Chidi Okafor',
        avatar: null,
        rating: 5,
        text: 'The best shawarma spot in town! The meat is perfectly spiced and the bread is always fresh. Their customer service is also excellent. 5 stars!',
        date: '3 weeks ago',
        source: 'Google'
      },
      {
        id: 4,
        name: 'Amina Bello',
        avatar: null,
        rating: 4,
        text: 'Great food and fast delivery. I love their parfait and zobo. The only reason I\'m giving 4 stars is because they were out of my favorite sauce last time.',
        date: '2 months ago',
        source: 'Google'
      },
      {
        id: 5,
        name: 'Tunde Balogun',
        avatar: null,
        rating: 5,
        text: 'Mabites Grills never disappoints! The quality is always consistent and the portions are generous. My go-to place for shawarma in Ogbomoso.',
        date: '1 week ago',
        source: 'Google'
      },
      {
        id: 6,
        name: 'Ngozi Eze',
        avatar: null,
        rating: 5,
        text: 'I\'ve been ordering from Mabites for months and I\'ve never been disappointed. Their food is always hot and fresh. The delivery is always on time too.',
        date: '3 months ago',
        source: 'Google'
      }
    ];
    res.json({ success: true, data: reviews });
  } catch (error) {
    console.error('❌ Error fetching reviews:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch reviews' });
  }
});

app.post('/api/reviews', async (req, res) => {
  try {
    const { name, rating, text, source } = req.body;
    if (!name || !rating || !text) {
      return res.status(400).json({
        success: false,
        message: 'Name, rating, and text are required'
      });
    }
    res.json({
      success: true,
      message: 'Review submitted successfully',
      data: { name, rating, text, source: source || 'Google' }
    });
  } catch (error) {
    console.error('❌ Error submitting review:', error);
    res.status(500).json({ success: false, message: 'Failed to submit review' });
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
      data: {
        totalOrders,
        pendingOrders,
        todayRevenue,
        deliveryOrders
      }
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
        if (!itemCounts[name]) {
          itemCounts[name] = { quantity: 0, revenue: 0 };
        }
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
    res.json({
      success: true,
      data: {
        cash: cashRevenue,
        online: bankTransferRevenue,
        total: cashRevenue + bankTransferRevenue
      }
    });
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
        if (!itemCounts[name]) {
          itemCounts[name] = { quantity: 0, revenue: 0 };
        }
        itemCounts[name].quantity += (item.quantity || 0);
        itemCounts[name].revenue += (item.total || 0);
      });
    });
    const topItems = Object.entries(itemCounts)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10);
    res.json({
      success: true,
      data: {
        period,
        startDate,
        totalOrders: orders.length,
        totalRevenue,
        topItems
      }
    });
  } catch (err) {
    console.error('❌ Reports error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// CONNECT TO MONGODB
// ============================================

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mabites')
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
      console.log(`🚀 Server on http://localhost:${PORT}`);
      console.log('✅ MongoDB connected');
      console.log(`📁 Uploads directory: ${uploadsDir}`);
      console.log('📡 SSE streaming enabled for kitchen');
      console.log('📡 SSE streaming enabled for menu (real-time updates)');
      console.log('📡 SSE streaming enabled for admin dashboard');
      console.log(`📋 ${itemCount} menu items loaded from database`);
      console.log('🔐 JWT authentication enabled');
      console.log('⚙️  Settings API enabled');
      console.log('📊 Dashboard Stats API enabled');
      console.log('🌐 CORS configured for localhost and 127.0.0.1');
      console.log('🖼️  Image upload enabled - /api/upload');
      console.log('📂 Static files served from /uploads');
      console.log('📡 Order Status SSE streaming enabled - /api/orders/stream/:orderId');
      console.log('🔍 Order tracking enabled - /api/orders/track/:identifier');
      console.log('⭐ Reviews API enabled - /api/reviews');
      console.log('🛒 Cart: versionKey disabled, using findOneAndUpdate with upsert');
    });
  })
  .catch(err => {
    console.error('❌ MongoDB error:', err);
    process.exit(1);
  });