// ============================================================
// dashboard.js – Complete Admin Dashboard with Stats API
// ============================================================

const API_URL = (() => {
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:3000/api';
  }
  return 'https://mabites-grills-mkv8.onrender.com/api';
})();

let currentSection = 'overview';
let allOrders = [];
let allMenuItems = [];
let eventSource = null;
let notificationSound = null;
let isSoundEnabled = true;

// ===== REVENUE STATE =====
let currentRevenuePeriod = 'daily';
let currentRevenueData = {
  daily: null,
  weekly: null,
  monthly: null
};
let isRevenueLoading = false;
let revenueRefreshQueue = false;

// ===== DELETE STATE =====
let deleteOrderId = null;
let deleteMenuItemId = null;

// ===== INIT =====
document.addEventListener('DOMContentLoaded', function () {
  // Set current date
  const dateStr = new Date().toLocaleDateString('en-NG', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  document.getElementById('currentDate').textContent = dateStr;

  // Load all data
  loadDashboard();
  loadOrders();
  loadMenu();

  // Setup SSE for real-time orders
  setupSSE();

  // Navigation
  document.querySelectorAll('.sidebar-nav a').forEach(link => {
    link.addEventListener('click', function (e) {
      e.preventDefault();
      const section = this.dataset.section;
      navigateTo(section);
    });
  });

  // Menu form
  document.getElementById('menuForm').addEventListener('submit', function (e) {
    e.preventDefault();
    saveMenuItem();
  });

  // Delete Order confirmation
  document.getElementById('confirmDeleteOrderBtn').addEventListener('click', function () {
    confirmDeleteOrder();
  });

  // Delete Menu Item confirmation
  document.getElementById('confirmDeleteMenuItemBtn').addEventListener('click', function () {
    confirmDeleteMenuItem();
  });

  // Restore previous section if exists
  const savedSection = sessionStorage.getItem('adminSection') || 'overview';
  navigateTo(savedSection, true);
});

// ============================================
// NAVIGATION
// ============================================

function navigateTo(section, skipSave) {
  currentSection = section;
  document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
  const activeLink = document.querySelector(`.sidebar-nav a[data-section="${section}"]`);
  if (activeLink) activeLink.classList.add('active');
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  const sectionEl = document.getElementById(`section-${section}`);
  if (sectionEl) sectionEl.classList.add('active');

  const titles = {
    overview: 'Dashboard',
    orders: 'Orders',
    menu: 'Menu Management',
    reports: 'Reports'
  };
  document.getElementById('pageTitle').innerHTML =
    `<i class="fas fa-${section === 'overview' ? 'chart-pie' : section === 'orders' ? 'clipboard-list' : section === 'menu' ? 'utensils' : 'chart-bar'}"></i> ${titles[section] || 'Dashboard'}`;

  if (section === 'orders') loadOrders();
  if (section === 'menu') loadMenu();
  if (section === 'reports') loadReports(currentRevenuePeriod);

  if (!skipSave) {
    sessionStorage.setItem('adminSection', section);
  }

  if (window.innerWidth <= 768) {
    document.getElementById('sidebar').classList.remove('open');
  }
}

// ============================================
// SSE - REAL-TIME ORDER NOTIFICATIONS
// ============================================

function setupSSE() {
  try {
    console.log('📡 Setting up SSE for orders...');

    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      notificationSound = {
        play: function () {
          try {
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            oscillator.type = 'sine';
            oscillator.frequency.value = 800;
            gainNode.gain.value = 0.3;
            oscillator.start();
            setTimeout(function () {
              oscillator.stop();
            }, 200);
            setTimeout(function () {
              const osc2 = audioContext.createOscillator();
              const gain2 = audioContext.createGain();
              osc2.connect(gain2);
              gain2.connect(audioContext.destination);
              osc2.type = 'sine';
              osc2.frequency.value = 1000;
              gain2.gain.value = 0.3;
              osc2.start();
              setTimeout(function () {
                osc2.stop();
              }, 200);
            }, 250);
          } catch (e) {
            console.log('🔊 Sound play error:', e);
          }
        }
      };
      console.log('🔊 Audio context initialized');
    } catch (e) {
      console.log('🔊 Web Audio not supported, using fallback');
      notificationSound = {
        play: function () {
          try {
            const audio = new Audio(
              'data:audio/wav;base64,UklGRlwAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQkAAACBhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqF');
            audio.play().catch(function (e) { });
          } catch (e) { }
        }
      };
    }

    eventSource = new EventSource(`${API_URL}/orders/stream`);

    eventSource.onopen = function () {
      console.log('📡 SSE: ✅ Connected to order stream');
    };

    eventSource.onmessage = function (event) {
      try {
        const data = JSON.parse(event.data);
        console.log('📡 SSE: Order update received', data);

        if (data.type === 'new_order') {
          // New order - sound and notification
          if (isSoundEnabled) {
            notificationSound.play();
          }
          showToast('🛎️ New Order #' + data.orderNumber + ' arrived!', 'success');
          flashOrdersTab();

          // Refresh all data including revenue
          refreshAllData();
        }

        if (data.type === 'order_delivered') {
          showToast('✅ Order #' + data.orderNumber + ' has been delivered!', 'success');
          refreshAllData();
        }

        if (data.type === 'order_update') {
          console.log('📡 Order update received, refreshing all data...');
          refreshAllData();
        }
      } catch (e) {
        console.error('📡 SSE: Error parsing message', e);
      }
    };

    eventSource.onerror = function (error) {
      console.log('📡 SSE: ❌ Connection error. Will reconnect in 5s...');
      eventSource.close();
      setTimeout(setupSSE, 5000);
    };

  } catch (error) {
    console.log('📡 SSE: Failed to setup, using polling fallback', error);
    setInterval(function () {
      refreshAllData();
    }, 15000);
  }
}

// ============================================
// REFRESH ALL DATA - COMPLETE REFRESH (WITH QUEUE)
// ============================================

function refreshAllData() {
  // If a refresh is already running, queue another one to run after
  if (isRevenueLoading) {
    revenueRefreshQueue = true;
    console.log('⏳ Refresh already in progress, queuing another...');
    return;
  }

  console.log('🔄 Refreshing all data...');
  loadOrders();
  loadDashboard();
  refreshAllRevenueData();
  updateOrderBadge();
}

// ============================================
// REFRESH ALL REVENUE DATA (WITH QUEUE)
// ============================================

function refreshAllRevenueData() {
  // If already loading, queue the next refresh
  if (isRevenueLoading) {
    revenueRefreshQueue = true;
    console.log('⏳ Revenue refresh already in progress, queuing...');
    return;
  }

  isRevenueLoading = true;
  revenueRefreshQueue = false;

  console.log('📊 Refreshing all revenue data...');

  // Refresh all three periods
  const periods = ['daily', 'weekly', 'monthly'];
  const promises = periods.map(period => {
    return fetch(`${API_URL}/stats/reports?period=${period}`)
      .then(res => res.json())
      .then(result => {
        if (result.success) {
          currentRevenueData[period] = result.data;
          // If this is the current period, update the UI
          if (period === currentRevenuePeriod) {
            updateRevenueUI(result.data);
          }
        }
        return result;
      })
      .catch(err => {
        console.error(`❌ Failed to fetch ${period} revenue:`, err);
        return null;
      });
  });

  // Also refresh revenue breakdown
  fetch(`${API_URL}/stats/revenue-breakdown`)
    .then(res => res.json())
    .then(result => {
      if (result.success) {
        updateRevenueBreakdown(result.data);
      }
    })
    .catch(err => {
      console.error('❌ Failed to fetch revenue breakdown:', err);
    });

  Promise.all(promises)
    .finally(() => {
      isRevenueLoading = false;
      console.log('📊 Revenue refresh complete');

      // If there's a queued refresh, run it
      if (revenueRefreshQueue) {
        revenueRefreshQueue = false;
        console.log('🔄 Running queued refresh...');
        refreshAllRevenueData();
      }
    });
}

// ============================================
// UPDATE REVENUE BREAKDOWN
// ============================================

function updateRevenueBreakdown(data) {
  if (!data) return;

  const cashTotal = data.cash || 0;
  const onlineTotal = data.online || 0;
  const totalRevenue = data.total || 0;

  const breakdownEl = document.getElementById('revenueBreakdown');
  if (breakdownEl) {
    breakdownEl.innerHTML = `
            <div class="revenue-row">
                <span><i class="fas fa-money-bill" style="color:#1a7a3a;"></i> Cash</span>
                <span class="revenue-amount">₦${cashTotal.toLocaleString()}</span>
            </div>
            <div class="revenue-row">
                <span><i class="fas fa-credit-card" style="color:#1a5f9e;"></i> Bank Transfer</span>
                <span class="revenue-amount">₦${onlineTotal.toLocaleString()}</span>
            </div>
            <div class="revenue-total">
                <span>Total Revenue</span>
                <span class="revenue-total-amount">₦${totalRevenue.toLocaleString()}</span>
            </div>
        `;
  }
}

// ============================================
// UPDATE REVENUE UI
// ============================================

function updateRevenueUI(data) {
  if (!data) return;

  const periodLabels = {
    'daily': 'Today',
    'weekly': 'This Week',
    'monthly': 'This Month'
  };

  const periodDisplay = periodLabels[data.period] || data.period;

  let dateRange = '';
  if (data.period === 'daily') {
    dateRange = new Date(data.startDate).toLocaleDateString('en-NG', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  } else if (data.period === 'weekly') {
    const endDate = new Date(data.startDate);
    endDate.setDate(endDate.getDate() + 6);
    dateRange = `${new Date(data.startDate).toLocaleDateString('en-NG', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-NG', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  } else {
    dateRange = new Date(data.startDate).toLocaleDateString('en-NG', {
      month: 'long',
      year: 'numeric'
    });
  }

  const revenueEl = document.getElementById('reportRevenue');
  if (revenueEl) {
    revenueEl.innerHTML = `
            <div class="report-row">
                <span>Period</span>
                <span class="report-period" style="font-weight:700;color:#fc6203;">${periodDisplay}</span>
            </div>
            <div class="report-row">
                <span>Date Range</span>
                <span style="font-size:0.8rem;color:#6b6b74;">${dateRange}</span>
            </div>
            <div class="report-row">
                <span>Total Orders</span>
                <span class="report-value">${data.totalOrders || 0}</span>
            </div>
            <div class="report-row">
                <span><i class="fas fa-money-bill-wave" style="color:#1a7a3a;"></i> Revenue</span>
                <span class="report-value revenue">₦${(data.totalRevenue || 0).toLocaleString()}</span>
            </div>
            <div class="report-start">
                <span>Started</span>
                <span>${new Date(data.startDate).toLocaleDateString()}</span>
            </div>
        `;
  }

  const topItemsEl = document.getElementById('reportTopItems');
  if (topItemsEl) {
    if (data.topItems && data.topItems.length > 0) {
      const topHtml = data.topItems.map(item => `
                <div class="report-item">
                    <span>${item.name}</span>
                    <span class="report-count">${item.quantity} sold</span>
                </div>
            `).join('');
      topItemsEl.innerHTML = topHtml;
    } else {
      topItemsEl.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📊</div>
                    <div class="empty-state-title">No data for ${periodDisplay}</div>
                    <div class="empty-state-desc">Orders will appear here once customers start ordering</div>
                </div>
            `;
    }
  }
}

// ============================================
// SOUND TOGGLE
// ============================================

function toggleSound() {
  isSoundEnabled = !isSoundEnabled;
  const btn = document.getElementById('soundToggle');
  if (isSoundEnabled) {
    btn.className = 'sound-toggle sound-on';
    btn.innerHTML = '<i class="fas fa-volume-up"></i>';
  } else {
    btn.className = 'sound-toggle sound-off';
    btn.innerHTML = '<i class="fas fa-volume-mute"></i>';
  }
}

// ============================================
// FLASH ORDERS TAB
// ============================================

function flashOrdersTab() {
  const ordersLink = document.querySelector('.sidebar-nav a[data-section="orders"]');
  if (ordersLink) {
    const originalBg = ordersLink.style.backgroundColor;
    const originalColor = ordersLink.style.color;
    ordersLink.style.backgroundColor = '#fc6203';
    ordersLink.style.color = '#ffffff';
    ordersLink.style.transition = 'background-color 0.3s ease';
    setTimeout(function () {
      ordersLink.style.backgroundColor = originalBg || '';
      ordersLink.style.color = originalColor || '';
    }, 2000);
  }
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

// ===== LOGOUT =====
async function logout() {
  try {
    console.log('🔐 Logging out...');

    await fetch(`${API_URL}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });

    console.log('✅ Logout request completed');
  } catch (error) {
    console.error('❌ Logout request failed:', error);
  }

  sessionStorage.removeItem('mabite_user');
  localStorage.removeItem('mabite_admin');
  sessionStorage.removeItem('adminSection');

  window.location.href = 'login.html';
}

// ===== TOAST =====
function showToast(message, type) {
  type = type || 'success';
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast ' + type;
  void toast.offsetWidth;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 4000);
}

// ===== MODAL =====
function openModal(id) {
  document.getElementById(id).classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  document.body.style.overflow = '';
}

// ============================================
// DASHBOARD OVERVIEW WITH STATS API
// ============================================
async function loadDashboard() {
  try {
    const [overviewRes, popularRes, revenueRes] = await Promise.all([
      fetch(`${API_URL}/stats/overview`),
      fetch(`${API_URL}/stats/popular-items`),
      fetch(`${API_URL}/stats/revenue-breakdown`)
    ]);

    const overview = await overviewRes.json();
    const popular = await popularRes.json();
    const revenue = await revenueRes.json();

    if (overview.success) {
      document.getElementById('statOrders').textContent = overview.data.totalOrders || 0;
      document.getElementById('statPending').textContent = overview.data.pendingOrders || 0;
      document.getElementById('statRevenue').textContent = `₦${(overview.data.todayRevenue || 0).toLocaleString()}`;
      document.getElementById('statDelivery').textContent = overview.data.deliveryOrders || 0;
      document.getElementById('orderBadge').textContent = overview.data.pendingOrders || 0;
    }

    if (popular.success && popular.data.length > 0) {
      const popularHtml = popular.data.map(item => `
                <div class="popular-item">
                    <span>${item.name}</span>
                    <span class="popular-count">${item.quantity} sold</span>
                </div>
            `).join('');
      document.getElementById('popularItems').innerHTML = popularHtml;
    } else {
      document.getElementById('popularItems').innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📦</div>
                    <div class="empty-state-title">No orders yet</div>
                    <div class="empty-state-desc">Orders will appear here once customers start ordering</div>
                </div>
            `;
    }

    if (revenue.success) {
      updateRevenueBreakdown(revenue.data);
    }
  } catch (error) {
    console.error('Load dashboard error:', error);
    document.getElementById('popularItems').innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">⚠️</div>
                <div class="empty-state-title">Failed to load</div>
                <div class="empty-state-desc">Could not load popular items. Please refresh.</div>
            </div>
        `;
    document.getElementById('revenueBreakdown').innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">⚠️</div>
                <div class="empty-state-title">Failed to load</div>
                <div class="empty-state-desc">Could not load revenue data. Please refresh.</div>
            </div>
        `;
  }
}

// ============================================
// ORDERS
// ============================================
async function loadOrders() {
  try {
    const response = await fetch(`${API_URL}/orders`);
    const result = await response.json();
    if (result.success) {
      allOrders = result.data || [];
      renderOrders(allOrders);
      updateOrderBadge();
    }
  } catch (error) {
    console.error('Load orders error:', error);
    document.getElementById('ordersTableBody').innerHTML = `
            <tr>
                <td colspan="8" class="error-cell">
                    <div class="error-icon">⚠️</div>
                    <div class="error-title">Failed to load orders</div>
                    <div class="error-desc">Is the server running? Please check your connection.</div>
                </td>
            </tr>
        `;
  }
}

function renderOrders(orders) {
  var tbody = document.getElementById('ordersTableBody');
  if (!orders.length) {
    tbody.innerHTML = `
            <tr>
                <td colspan="8" class="empty-cell">
                    <div class="empty-state-icon">📋</div>
                    <div class="empty-state-title">No orders found</div>
                    <div class="empty-state-desc">Orders will appear here once customers place them</div>
                </td>
            </tr>
        `;
    return;
  }

  tbody.innerHTML = orders.map(function (o) {
    var isDelivery = o.delivery && o.delivery.isDelivery || false;
    var deliveryLabel = isDelivery ? 'Delivery' : 'Pickup';
    var deliveryClass = isDelivery ? 'delivery' : 'pickup';
    var address = isDelivery && o.delivery && o.delivery.address ? o.delivery.address : '';

    var paymentMethod = o.payment && o.payment.method || 'cash';
    var paymentLabel = paymentMethod === 'cash' ? 'Cash' : 'Bank Transfer';
    var confirmationName = o.payment && o.payment.confirmationName || '';

    return `
        <tr>
            <td>
                <strong>#${o.orderNumber || 'N/A'}</strong>
                <br>
                <span class="order-date">${new Date(o.createdAt).toLocaleString()}</span>
            </td>
            <td>
                ${(o.customer && o.customer.name) || 'Guest'}<br>
                <span class="customer-phone">${(o.customer && o.customer.phone) || 'N/A'}</span>
                ${(o.customer && o.customer.email) ? `<br><span class="customer-email">${o.customer.email}</span>` : ''}
            </td>
            <td class="order-items-cell">${(o.items || []).map(function (i) { return i.name + ' ×' + i.quantity; }).join('<br>')}</td>
            <td class="order-total">₦${(o.total || 0).toLocaleString()}</td>
            <td>
                <span class="delivery-type-badge ${deliveryClass}">
                    ${deliveryLabel}
                </span>
                ${address ? `<br><span class="delivery-address">${address}</span>` : ''}
            </td>
            <td>
                <span class="payment-method-badge ${paymentMethod}">
                    ${paymentLabel}
                </span>
                ${confirmationName ? `<br><span class="payment-confirmation-name">Confirmation: ${confirmationName}</span>` : ''}
            </td>
            <td><span class="status-badge ${o.status || 'pending'}">${o.status || 'Pending'}</span></td>
            <td>
                <div class="status-actions">
                    <select onchange="updateOrderStatus('${o._id}', this.value)" class="status-select">
                        <option value="pending" ${o.status === 'pending' ? 'selected' : ''}>Pending</option>
                        <option value="confirmed" ${o.status === 'confirmed' ? 'selected' : ''}>Confirm</option>
                        <option value="preparing" ${o.status === 'preparing' ? 'selected' : ''}>Preparing</option>
                        <option value="ready" ${o.status === 'ready' ? 'selected' : ''}>Ready</option>
                        <option value="delivered" ${o.status === 'delivered' ? 'selected' : ''}>Delivered</option>
                        <option value="cancelled" ${o.status === 'cancelled' ? 'selected' : ''}>Cancel</option>
                    </select>
                </div>
                <div class="action-buttons">
                    <button class="btn-sm info" onclick="viewOrderDetails('${o._id}')" title="View Details">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn-sm danger" onclick="deleteOrder('${o._id}')" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
        `;
  }).join('');
}

function viewOrderDetails(orderId) {
  var order = allOrders.find(function (o) { return o._id === orderId; });
  if (!order) {
    showToast('Order not found', 'error');
    return;
  }

  var content = document.getElementById('orderDetailContent');
  var isDelivery = order.delivery && order.delivery.isDelivery || false;
  var deliveryLabel = isDelivery ? 'Delivery' : 'Pickup';

  var paymentMethod = order.payment && order.payment.method || 'cash';
  var paymentLabel = paymentMethod === 'cash' ? 'Cash' : 'Bank Transfer';
  var confirmationName = order.payment && order.payment.confirmationName || '';

  var itemsHtml = (order.items || []).map(function (item) {
    return `
            <div class="detail-item-row">
                <span>${item.quantity} × ${item.name}</span>
                <span>₦${(item.unitPrice * item.quantity).toLocaleString()}</span>
            </div>
        `;
  }).join('');

  content.innerHTML = `
        <div class="order-detail-header">
            <span class="order-detail-number">#${order.orderNumber || 'N/A'}</span>
            <span class="status-badge ${order.status || 'pending'}">${order.status || 'Pending'}</span>
        </div>

        <div class="order-detail-grid">
            <div class="detail-item">
                <div class="detail-label">Customer</div>
                <div class="detail-value">${(order.customer && order.customer.name) || 'Guest'}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Phone</div>
                <div class="detail-value">${(order.customer && order.customer.phone) || 'N/A'}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Email</div>
                <div class="detail-value">${(order.customer && order.customer.email) || 'N/A'}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Delivery Type</div>
                <div class="detail-value">
                    <span class="delivery-type-badge ${isDelivery ? 'delivery' : 'pickup'}">
                        ${deliveryLabel}
                    </span>
                </div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Payment Method</div>
                <div class="detail-value">
                    <span class="payment-method-badge ${paymentMethod}">
                        ${paymentLabel}
                    </span>
                    ${confirmationName ? `<br><span style="font-size:0.8rem;color:#6b6b74;margin-top:2px;">Confirmation: ${confirmationName}</span>` : ''}
                </div>
            </div>
            ${isDelivery ? `
            <div class="detail-item full-width">
                <div class="detail-label">Delivery Address</div>
                <div class="detail-value">${(order.delivery && order.delivery.address) || 'N/A'}</div>
            </div>
            ` : ''}
            <div class="detail-item">
                <div class="detail-label">Order Date</div>
                <div class="detail-value">${new Date(order.createdAt).toLocaleString()}</div>
            </div>
        </div>

        <div class="order-detail-items-section">
            <div class="detail-section-title">Items</div>
            <div class="order-detail-items">
                ${itemsHtml || '<div class="no-items">No items</div>'}
            </div>
        </div>

        <div class="order-detail-total">
            <span>Total</span>
            <span class="order-detail-total-amount">₦${(order.total || 0).toLocaleString()}</span>
        </div>
        <div class="order-detail-subtotal">
            <span>Subtotal: ₦${(order.subtotal || 0).toLocaleString()}</span>
            <span>Delivery Fee: ₦${(order.deliveryFee || 0).toLocaleString()}</span>
        </div>
    `;

  openModal('orderDetailModal');
}

function updateOrderBadge() {
  var pending = allOrders.filter(function (o) { return o.status === 'pending'; }).length;
  document.getElementById('orderBadge').textContent = pending;
}

function applyOrderFilter() {
  var filter = document.getElementById('orderFilter').value;
  var dateFilter = document.getElementById('orderDateFilter').value;
  var deliveryFilter = document.getElementById('orderDeliveryFilter').value;
  var filtered = allOrders.slice();

  if (filter !== 'all') {
    filtered = filtered.filter(function (o) { return o.status === filter; });
  }
  if (dateFilter) {
    var date = new Date(dateFilter);
    date.setHours(0, 0, 0, 0);
    filtered = filtered.filter(function (o) {
      var d = new Date(o.createdAt);
      d.setHours(0, 0, 0, 0);
      return d.getTime() === date.getTime();
    });
  }
  if (deliveryFilter !== 'all') {
    var isDelivery = deliveryFilter === 'delivery';
    filtered = filtered.filter(function (o) { return (o.delivery && o.delivery.isDelivery || false) === isDelivery; });
  }
  renderOrders(filtered);
  showToast('Filter applied', 'success');
}

function clearOrderFilter() {
  document.getElementById('orderFilter').value = 'all';
  document.getElementById('orderDateFilter').value = '';
  document.getElementById('orderDeliveryFilter').value = 'all';
  renderOrders(allOrders);
  showToast('Filters cleared', 'info');
}

async function updateOrderStatus(id, status) {
  try {
    var response = await fetch(API_URL + '/orders/' + id + '/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: status })
    });
    var result = await response.json();
    if (result.success) {
      showToast('✅ Order status updated to ' + status, 'success');
      refreshAllData();
    } else {
      showToast('Failed to update status', 'error');
    }
  } catch (error) {
    showToast('Network error', 'error');
  }
}

// ===== DELETE ORDER WITH MODAL =====
function deleteOrder(id) {
  deleteOrderId = id;
  openModal('deleteOrderModal');
}

async function confirmDeleteOrder() {
  if (!deleteOrderId) return;

  try {
    var response = await fetch(API_URL + '/orders/' + deleteOrderId, {
      method: 'DELETE'
    });
    if (response.ok) {
      showToast('Order deleted successfully');
      refreshAllData();
      closeModal('deleteOrderModal');
      deleteOrderId = null;
    } else {
      showToast('Failed to delete order', 'error');
      closeModal('deleteOrderModal');
    }
  } catch (error) {
    console.error('Delete order error:', error);
    showToast('Network error', 'error');
    closeModal('deleteOrderModal');
  }
}

function refreshOrders() {
  refreshAllData();
  showToast('Data refreshed');
}

// ============================================
// MENU MANAGEMENT WITH IMAGE UPLOAD
// ============================================

async function loadMenu() {
  try {
    var response = await fetch(API_URL + '/menu');
    var result = await response.json();
    if (result.success) {
      allMenuItems = result.data || [];
      renderMenu();
    }
  } catch (error) {
    console.error('Load menu error:', error);
    document.getElementById('menuTableBody').innerHTML = `
            <tr>
                <td colspan="7" class="error-cell">
                    <div class="error-icon">⚠️</div>
                    <div class="error-title">Failed to load menu</div>
                    <div class="error-desc">Is the server running? Please check your connection.</div>
                </td>
            </tr>
        `;
  }
}

function renderMenu() {
  var tbody = document.getElementById('menuTableBody');
  if (!allMenuItems.length) {
    tbody.innerHTML = `
            <tr>
                <td colspan="7" class="empty-cell">
                    <div class="empty-state-icon">🍽️</div>
                    <div class="empty-state-title">No menu items</div>
                    <div class="empty-state-desc">Add your first menu item using the "Add Item" button</div>
                </td>
            </tr>
        `;
    return;
  }

  tbody.innerHTML = allMenuItems.map(function (item) {
    return `
        <tr>
            <td>
                <strong>${item.name}</strong>
                ${item.image ? `<br><img src="${item.image}" alt="${item.name}" class="menu-item-thumb">` : ''}
                <br><span class="menu-item-desc">${item.description || ''}</span>
            </td>
            <td><span class="menu-item-category">${item.category}</span></td>
            <td class="menu-item-price">₦${(item.price || 0).toLocaleString()}</td>
            <td>${item.variants ? item.variants.map(function (v) { return '<span class="variant-tag">' + v + '</span>'; }).join(' ') : '-'}</td>
            <td>${item.modifiers ? item.modifiers.map(function (m) { return '<span class="modifier-tag">' + m + '</span>'; }).join(' ') : '-'}</td>
            <td><span class="status-badge ${item.isAvailable !== false ? 'confirmed' : 'cancelled'}">${item.isAvailable !== false ? 'Available' : 'Unavailable'}</span></td>
            <td>
                <button class="btn-sm info" onclick="editMenuItem('${item.id}')"><i class="fas fa-edit"></i></button>
                <button class="btn-sm warning" onclick="toggleMenuItem('${item.id}')"><i class="fas ${item.isAvailable !== false ? 'fa-eye' : 'fa-eye-slash'}"></i></button>
                <button class="btn-sm danger" onclick="deleteMenuItem('${item.id}')"><i class="fas fa-trash"></i></button>
            </td>
        </tr>
        `;
  }).join('');
}

function openAddItemModal() {
  document.getElementById('menuModalTitle').textContent = 'Add Menu Item';
  document.getElementById('menuItemId').value = '';
  document.getElementById('menuForm').reset();
  document.getElementById('menuItemAvailable').checked = true;
  document.getElementById('menuItemImagePreview').style.display = 'none';
  document.getElementById('menuItemImage').value = '';
  document.getElementById('menuItemImagePreview').innerHTML = '';
  openModal('menuModal');
}

function editMenuItem(id) {
  var item = allMenuItems.find(function (i) { return i.id === id; });
  if (!item) return;

  document.getElementById('menuModalTitle').textContent = 'Edit Menu Item';
  document.getElementById('menuItemId').value = item.id;
  document.getElementById('menuItemName').value = item.name || '';
  document.getElementById('menuItemCategory').value = item.category || 'sharwama';
  document.getElementById('menuItemPrice').value = item.price || 0;
  document.getElementById('menuItemDescription').value = item.description || '';
  document.getElementById('menuItemVariants').value = (item.variants || []).join(', ');
  document.getElementById('menuItemModifiers').value = (item.modifiers || []).join(', ');
  document.getElementById('menuItemAvailable').checked = item.isAvailable !== false;

  var previewContainer = document.getElementById('menuItemImagePreview');
  if (item.image) {
    previewContainer.style.display = 'block';
    previewContainer.innerHTML = `
            <img src="${item.image}" alt="${item.name}" class="menu-item-preview">
            <p class="preview-label">Current image</p>
        `;
  } else {
    previewContainer.style.display = 'none';
    previewContainer.innerHTML = '';
  }

  openModal('menuModal');
}

async function saveMenuItem() {
  var id = document.getElementById('menuItemId').value;
  var name = document.getElementById('menuItemName').value.trim();
  var category = document.getElementById('menuItemCategory').value;
  var price = parseFloat(document.getElementById('menuItemPrice').value) || 0;
  var description = document.getElementById('menuItemDescription').value.trim();
  var variants = document.getElementById('menuItemVariants').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  var modifiers = document.getElementById('menuItemModifiers').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  var isAvailable = document.getElementById('menuItemAvailable').checked;

  var imageFile = document.getElementById('menuItemImage').files[0];
  var imageData = null;

  if (imageFile) {
    imageData = await readFileAsBase64(imageFile);
  } else {
    if (id) {
      var existing = allMenuItems.find(function (i) { return i.id === id; });
      if (existing && existing.image) {
        imageData = existing.image;
      }
    }
  }

  if (!name) { showToast('Please enter a name', 'error'); return; }
  if (!price || price <= 0) { showToast('Please enter a valid price', 'error'); return; }

  var data = {
    name: name,
    category: category,
    price: price,
    description: description,
    variants: variants,
    modifiers: modifiers,
    isAvailable: isAvailable,
    image: imageData
  };

  try {
    var method = id ? 'PUT' : 'POST';
    var url = id ? API_URL + '/menu/' + id : API_URL + '/menu';
    var response = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (response.ok) {
      closeModal('menuModal');
      showToast(id ? 'Item updated' : 'Item added');
      loadMenu();
      loadDashboard();
    } else {
      var error = await response.json();
      showToast(error.message || 'Failed to save', 'error');
    }
  } catch (error) {
    console.error('Save menu error:', error);
    showToast('Network error', 'error');
  }
}

function readFileAsBase64(file) {
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onload = function (e) { resolve(e.target.result); };
    reader.onerror = function (e) { reject(e.target.error); };
    reader.readAsDataURL(file);
  });
}

async function toggleMenuItem(id) {
  var item = allMenuItems.find(function (i) { return i.id === id; });
  if (!item) return;
  try {
    var newAvailability = !item.isAvailable;
    var response = await fetch(API_URL + '/menu/' + id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isAvailable: newAvailability })
    });
    if (response.ok) {
      showToast('Item ' + (newAvailability ? 'available' : 'unavailable'));
      loadMenu();
    }
  } catch (error) {
    showToast('Failed to toggle', 'error');
  }
}

// ===== DELETE MENU ITEM WITH MODAL =====
function deleteMenuItem(id) {
  deleteMenuItemId = id;
  openModal('deleteMenuItemModal');
}

async function confirmDeleteMenuItem() {
  if (!deleteMenuItemId) return;

  var item = allMenuItems.find(function (i) { return i.id === deleteMenuItemId; });
  if (!item) {
    showToast('Item not found', 'error');
    closeModal('deleteMenuItemModal');
    deleteMenuItemId = null;
    return;
  }

  try {
    var response = await fetch(API_URL + '/menu/' + deleteMenuItemId, {
      method: 'DELETE'
    });
    if (response.ok) {
      showToast('Item "' + item.name + '" deleted successfully');
      loadMenu();
      closeModal('deleteMenuItemModal');
      deleteMenuItemId = null;
    } else {
      showToast('Failed to delete item', 'error');
      closeModal('deleteMenuItemModal');
    }
  } catch (error) {
    console.error('Delete menu item error:', error);
    showToast('Network error', 'error');
    closeModal('deleteMenuItemModal');
  }
}

// ============================================
// REPORTS - WITH ACTIVE PERIOD INDICATOR & PERSISTENCE
// ============================================

function loadReports(period) {
  period = period || 'daily';
  currentRevenuePeriod = period;

  document.querySelectorAll('.report-buttons .btn-sm').forEach(function (btn) {
    btn.classList.remove('active-report');
  });

  document.querySelectorAll('.report-buttons .btn-sm').forEach(function (btn) {
    if (btn.dataset.period === period) {
      btn.classList.add('active-report');
    }
  });

  var revenueEl = document.getElementById('reportRevenue');
  var topItemsEl = document.getElementById('reportTopItems');

  if (revenueEl) {
    revenueEl.innerHTML = `
            <div class="loading-state">
                <div class="loading-spinner"></div>
                <p>Loading...</p>
            </div>
        `;
  }
  if (topItemsEl) {
    topItemsEl.innerHTML = `
            <div class="loading-state">
                <div class="loading-spinner"></div>
                <p>Loading...</p>
            </div>
        `;
  }

  if (currentRevenueData[period]) {
    updateRevenueUI(currentRevenueData[period]);
  }

  fetch(API_URL + '/stats/reports?period=' + period)
    .then(function (res) { return res.json(); })
    .then(function (result) {
      if (result.success) {
        currentRevenueData[period] = result.data;
        updateRevenueUI(result.data);
      }
    })
    .catch(function (error) {
      console.error('Load reports error:', error);
      if (revenueEl) {
        revenueEl.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">⚠️</div>
                        <div class="empty-state-title">Failed to load</div>
                        <div class="empty-state-desc">Could not load revenue data. Please refresh.</div>
                    </div>
                `;
      }
      if (topItemsEl) {
        topItemsEl.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">⚠️</div>
                        <div class="empty-state-title">Failed to load</div>
                        <div class="empty-state-desc">Could not load report data. Please refresh.</div>
                    </div>
                `;
      }
    });
}