// ============================================================
// customer.js – DEBUG VERSION - Test rendering
// ============================================================

(function () {
    'use strict';

    var API_URL = 'http://localhost:3000/api';
    var menuItems = [];
    var currentCategory = 'all';

    // ===== DOM REFS =====
    var menuGrid = document.getElementById('menuGrid');
    var categoriesGrid = document.getElementById('categoriesGrid');
    var cartBadge = document.getElementById('cartBadge');
    var cartItemsList = document.getElementById('cartItemsList');
    var cartOverlay = document.getElementById('cartOverlay');
    var closeCartBtn = document.getElementById('closeCartBtn');
    var cartBtn = document.getElementById('cartBtn');
    var checkoutSection = document.getElementById('checkoutSection');
    var checkoutBtn = document.getElementById('checkoutBtn');

    // ============================================
    // SIMPLE LOAD - NO SSE, NO COMPLEXITY
    // ============================================

    function loadMenuDirectly() {
        console.log('🔍 DEBUG: Loading menu directly...');

        fetch(API_URL + '/menu')
            .then(function (response) {
                console.log('🔍 DEBUG: Response status:', response.status);
                return response.json();
            })
            .then(function (result) {
                console.log('🔍 DEBUG: Full API response:', JSON.stringify(result, null, 2));

                if (result.success && result.data) {
                    menuItems = result.data;
                    console.log('🔍 DEBUG: menuItems set to:', menuItems.length, 'items');
                    console.log('🔍 DEBUG: First item:', menuItems[0]);
                } else {
                    menuItems = [];
                    console.log('🔍 DEBUG: No items in response');
                }

                // FORCE RENDER
                renderMenuDirectly();
            })
            .catch(function (error) {
                console.error('🔍 DEBUG: Fetch error:', error);
                menuItems = [];
                renderMenuDirectly();
            });
    }

    // ============================================
    // DIRECT RENDER - NO CATEGORIES, JUST SHOW ALL
    // ============================================

    function renderMenuDirectly() {
        console.log('🔍 DEBUG: Rendering menu. Items:', menuItems.length);
        console.log('🔍 DEBUG: menuItems content:', menuItems);

        // CLEAR THE GRID FIRST
        menuGrid.innerHTML = '';

        if (!menuItems || menuItems.length === 0) {
            console.log('🔍 DEBUG: No items to render');
            menuGrid.innerHTML = `
                <div style="grid-column:1/-1;text-align:center;padding:80px 20px;">
                    <div style="font-size:4rem;margin-bottom:16px;">🍽️</div>
                    <h3 style="font-size:1.4rem;font-weight:700;color:#1a1a1e;margin-bottom:6px;">No menu items yet</h3>
                    <p style="color:#6b6b74;font-size:0.95rem;">Add items from the admin panel</p>
                    <p style="color:#8a8a94;font-size:0.85rem;margin-top:8px;">📡 SSE is connected and waiting for updates</p>
                </div>
            `;
            return;
        }

        var html = '';
        for (var i = 0; i < menuItems.length; i++) {
            var item = menuItems[i];
            console.log('🔍 DEBUG: Rendering item:', item.name, 'Price:', item.price);

            html += '<div class="menu-card" style="background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);border:1px solid #f0f0f0;">';
            html += '<div class="card-image" style="height:180px;background:#f8f6f4;display:flex;align-items:center;justify-content:center;font-size:4rem;">';
            html += item.image ? '<img src="' + item.image + '" style="width:100%;height:100%;object-fit:cover;">' : '🌯';
            html += '</div>';
            html += '<div class="card-body" style="padding:16px;">';
            html += '<h3 style="font-size:1.1rem;font-weight:700;margin:0 0 4px 0;">' + item.name + '</h3>';
            html += '<p style="font-size:0.9rem;color:#6b6b74;margin:0 0 12px 0;">' + (item.description || 'Delicious meal') + '</p>';
            html += '<div style="display:flex;justify-content:space-between;align-items:center;">';
            html += '<span style="font-weight:700;color:#c0392b;font-size:1.2rem;">₦' + item.price.toLocaleString() + '</span>';
            html += '<button class="btn-add" data-id="' + item.id + '" style="background:#c0392b;color:white;border:none;border-radius:50%;width:36px;height:36px;font-size:1.2rem;cursor:pointer;">+</button>';
            html += '</div></div></div>';
        }

        menuGrid.innerHTML = html;
        console.log('🔍 DEBUG: Rendering complete. HTML length:', html.length);

        // Setup add to cart buttons
        menuGrid.querySelectorAll('.btn-add').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                var id = this.dataset.id;
                var product = null;
                for (var j = 0; j < menuItems.length; j++) {
                    if (menuItems[j].id == id) { product = menuItems[j]; break; }
                }
                if (product) {
                    console.log('🔍 DEBUG: Added to cart:', product.name);
                    alert('Added ' + product.name + ' to cart!');
                }
            });
        });
    }

    // ============================================
    // SSE SETUP - WITH DEBUG
    // ============================================

    function setupSSE() {
        console.log('🔍 DEBUG: Setting up SSE...');

        try {
            var eventSource = new EventSource(API_URL + '/menu/stream');

            eventSource.onopen = function () {
                console.log('🔍 DEBUG: SSE Connected! ✅');
            };

            eventSource.onmessage = function (event) {
                console.log('🔍 DEBUG: SSE Message received:', event.data);
                try {
                    var data = JSON.parse(event.data);
                    console.log('🔍 DEBUG: SSE Parsed:', data);

                    if (data.type === 'menu_update') {
                        console.log('🔍 DEBUG: Menu update! Items:', data.data.length);
                        menuItems = data.data || [];
                        renderMenuDirectly();
                    }
                } catch (e) {
                    console.error('🔍 DEBUG: SSE Parse error:', e);
                }
            };

            eventSource.onerror = function (error) {
                console.error('🔍 DEBUG: SSE Error:', error);
            };

        } catch (error) {
            console.error('🔍 DEBUG: SSE Setup error:', error);
        }
    }

    // ============================================
    // CART FUNCTIONS (MINIMAL)
    // ============================================

    var cart = [];

    function loadCart() {
        var saved = localStorage.getItem('mabite_cart');
        if (saved) {
            try {
                cart = JSON.parse(saved);
            } catch (e) {
                cart = [];
            }
        }
        updateCartUI();
    }

    function saveCart() {
        localStorage.setItem('mabite_cart', JSON.stringify(cart));
        updateCartUI();
    }

    function updateCartUI() {
        var count = 0;
        for (var i = 0; i < cart.length; i++) {
            count += cart[i].quantity;
        }
        cartBadge.textContent = count;
        cartBadge.style.display = count > 0 ? 'flex' : 'none';
    }

    function openCart() {
        cartOverlay.classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    function closeCart() {
        cartOverlay.classList.remove('open');
        document.body.style.overflow = '';
    }

    // ============================================
    // INIT
    // ============================================

    function init() {
        console.log('🔍 DEBUG ========================================');
        console.log('🔍 DEBUG: Mabite Customer App - DEBUG MODE');
        console.log('🔍 DEBUG: API URL:', API_URL);
        console.log('🔍 DEBUG: ========================================');

        // Load cart
        loadCart();

        // Load menu directly FIRST
        loadMenuDirectly();

        // Setup SSE for updates
        setupSSE();

        // Cart button
        cartBtn.addEventListener('click', openCart);
        closeCartBtn.addEventListener('click', closeCart);
        cartOverlay.addEventListener('click', function (e) {
            if (e.target === cartOverlay) closeCart();
        });

        // Checkout
        checkoutBtn.addEventListener('click', function () {
            alert('Checkout functionality is disabled in DEBUG mode');
        });

        console.log('🔍 DEBUG: Init complete!');
        console.log('🔍 DEBUG: ========================================');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();