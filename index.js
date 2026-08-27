// ============================================================
// index.js – Mabites Grills Customer Menu
// ============================================================

(function () {
    'use strict';

    // ============================================
    // STATE
    // ============================================

    var menuItems = [];
    var currentCategory = 'all';
    var eventSource = null;
    var reconnectAttempts = 0;
    var maxReconnectAttempts = 10;
    var reconnectDelay = 3000;
    var pollingInterval = null;
    var isLoading = false;
    var reviews = [];
    var currentReviewSlide = 0;
    var reviewInterval = null;
    var cart = [];
    var isSearchMode = false;

    // ============================================
    // DOM REFS
    // ============================================

    var menuGrid = document.getElementById('menuGrid');
    var menuCount = document.getElementById('menuCount');
    var menuSubtitle = document.getElementById('menuSubtitle');
    var categoryScroll = document.getElementById('categoryScroll');
    var searchInput = document.getElementById('searchInput');
    var searchSubmit = document.getElementById('searchSubmit');
    var searchMobileInput = document.getElementById('searchMobileInput');
    var searchMobileSubmit = document.getElementById('searchMobileSubmit');
    var reviewsTrack = document.getElementById('reviewsTrack');
    var reviewsDots = document.getElementById('reviewsDots');
    var cartBadge = document.getElementById('cartBadge');
    var floatingCartBadge = document.getElementById('floatingCartBadge');
    var searchResultsSection = document.getElementById('searchResultsSection');
    var searchResultsGrid = document.getElementById('searchResultsGrid');
    var searchQueryDisplay = document.getElementById('searchQueryDisplay');
    var searchResultCount = document.getElementById('searchResultCount');
    var clearSearchBtn = document.getElementById('clearSearchBtn');
    var mainNavbar = document.getElementById('mainNavbar');
    var trackModal = document.getElementById('trackModal');
    var trackModalClose = document.getElementById('trackModalClose');
    var trackOrderNav = document.getElementById('trackOrderNav');
    var trackBtn = document.getElementById('trackBtn');
    var trackInput = document.getElementById('trackInput');
    var trackResult = document.getElementById('trackResult');
    var floatingCart = document.getElementById('floatingCart');
    var floatingCartBtn = document.querySelector('.floating-cart-btn');
    var searchToggle = document.getElementById('searchToggle');
    var searchMobileWrapper = document.getElementById('searchMobileWrapper');
    var navLinksContainer = document.getElementById('navLinks');
    var closeSearchMobile = document.getElementById('closeSearchMobile');
    var navLinks = document.querySelectorAll('.nav-links a[data-section]');

    // ============================================
    // API URL
    // ============================================

    var API_URL = (function () {
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            return 'http://localhost:3000/api';
        }
        return '/api';
    })();

    // ============================================
    // SESSION ID
    // ============================================

    var sessionId = localStorage.getItem('mabite_session_id') || null;

    function getSessionId() {
        if (!sessionId) {
            sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('mabite_session_id', sessionId);
        }
        return sessionId;
    }

    // ============================================
    // SANITIZE INPUT
    // ============================================

    function sanitizeInput(input) {
        if (!input) return '';
        return input.replace(/[<>]/g, '');
    }

    // ============================================
    // TOAST NOTIFICATION
    // ============================================

    function showToast(message, type) {
        type = type || 'success';
        var existing = document.querySelector('.customer-toast');
        if (existing) existing.remove();

        var toast = document.createElement('div');
        toast.className = 'customer-toast ' + type;
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(function () {
            toast.classList.add('show');
        }, 10);

        setTimeout(function () {
            toast.classList.remove('show');
            setTimeout(function () { toast.remove(); }, 300);
        }, 3000);
    }

    // ============================================
    // FLOATING CART - DRAGGABLE
    // ============================================

    var isDragging = false;
    var dragOffsetX, dragOffsetY;

    function initFloatingCart() {
        if (!floatingCart) return;

        var scrollTimeout = null;

        window.addEventListener('scroll', function () {
            if (scrollTimeout) {
                clearTimeout(scrollTimeout);
            }

            if (floatingCart) {
                floatingCart.classList.add('hidden');
            }

            scrollTimeout = setTimeout(function () {
                if (floatingCart) {
                    floatingCart.classList.remove('hidden');
                }
            }, 300);
        });

        if (floatingCartBtn) {
            floatingCartBtn.addEventListener('mousedown', function (e) {
                isDragging = true;
                var rect = floatingCart.getBoundingClientRect();
                dragOffsetX = e.clientX - rect.left;
                dragOffsetY = e.clientY - rect.top;
                floatingCart.style.cursor = 'grabbing';
                e.preventDefault();
            });

            document.addEventListener('mousemove', function (e) {
                if (!isDragging) return;
                var x = e.clientX - dragOffsetX;
                var y = e.clientY - dragOffsetY;

                var cartWidth = floatingCart.offsetWidth || 60;
                var cartHeight = floatingCart.offsetHeight || 60;
                var maxX = window.innerWidth - cartWidth - 20;
                var maxY = window.innerHeight - cartHeight - 20;

                x = Math.max(20, Math.min(x, maxX));
                y = Math.max(20, Math.min(y, maxY));

                floatingCart.style.left = x + 'px';
                floatingCart.style.top = y + 'px';
                floatingCart.style.right = 'auto';
                floatingCart.style.bottom = 'auto';
            });

            document.addEventListener('mouseup', function () {
                if (isDragging) {
                    isDragging = false;
                    floatingCart.style.cursor = 'grab';
                }
            });

            floatingCartBtn.addEventListener('touchstart', function (e) {
                var touch = e.touches[0];
                var rect = floatingCart.getBoundingClientRect();
                dragOffsetX = touch.clientX - rect.left;
                dragOffsetY = touch.clientY - rect.top;
                isDragging = true;
            }, { passive: true });

            document.addEventListener('touchmove', function (e) {
                if (!isDragging) return;
                var touch = e.touches[0];
                var x = touch.clientX - dragOffsetX;
                var y = touch.clientY - dragOffsetY;

                var cartWidth = floatingCart.offsetWidth || 60;
                var cartHeight = floatingCart.offsetHeight || 60;
                var maxX = window.innerWidth - cartWidth - 20;
                var maxY = window.innerHeight - cartHeight - 20;

                x = Math.max(20, Math.min(x, maxX));
                y = Math.max(20, Math.min(y, maxY));

                floatingCart.style.left = x + 'px';
                floatingCart.style.top = y + 'px';
                floatingCart.style.right = 'auto';
                floatingCart.style.bottom = 'auto';
            }, { passive: true });

            document.addEventListener('touchend', function () {
                isDragging = false;
            }, { passive: true });
        }
    }

    // ============================================
    // STICKY NAVBAR
    // ============================================

    var lastScrollY = window.scrollY;

    function handleScroll() {
        var scrollY = window.scrollY;

        if (scrollY > 100) {
            mainNavbar.classList.add('sticky');
        } else {
            mainNavbar.classList.remove('sticky');
        }

        if (scrollY > lastScrollY && scrollY > 100) {
            mainNavbar.classList.add('hidden-nav');
            mainNavbar.classList.remove('visible-nav');
        } else {
            mainNavbar.classList.remove('hidden-nav');
            mainNavbar.classList.add('visible-nav');
        }

        lastScrollY = scrollY;
    }

    window.addEventListener('scroll', handleScroll);

    // ============================================
    // CATEGORIES
    // ============================================

    var categories = [
        { id: 'all', label: 'All', image: 'frontend/public/images/all.png', emoji: '📋' },
        { id: 'shawarma', label: 'Shawarma', image: 'frontend/public/images/shawarma.png', emoji: '🌯' },
        { id: 'chicken-fries', label: 'Chicken & Fries', image: 'frontend/public/images/Chicken & Fries.png', emoji: '🍗' },
        { id: 'barbeque', label: 'Barbeque', image: 'frontend/public/images/Barbeque.png', emoji: '🔥' },
        { id: 'desserts', label: 'Desserts', image: 'frontend/public/images/Parfait.png', emoji: '🍨' }
    ];

    var categoryMapping = {
        'shawarma': ['shawarma', 'sharwama'],
        'chicken-fries': ['chicken-fries', 'chicken & fries', 'chicken', 'fries'],
        'barbeque': ['barbeque', 'bbq', 'barbecue'],
        'desserts': ['desserts', 'dessert']
    };

    // ============================================
    // ============================================
    // CART MANAGEMENT
    // ============================================

    function loadCart() {
        var sessionId = getSessionId();

        fetch(API_URL + '/cart', {
            headers: {
                'X-Session-Id': sessionId
            }
        })
            .then(function (response) { return response.json(); })
            .then(function (result) {
                if (result.success && result.data) {
                    cart = result.data.items.map(function (item) {
                        return {
                            id: item.productId,
                            name: item.name,
                            price: item.price,
                            image: item.image || '🌯',
                            quantity: item.quantity
                        };
                    });

                    if (result.data.sessionId) {
                        sessionId = result.data.sessionId;
                        localStorage.setItem('mabite_session_id', sessionId);
                    }

                    updateCartUI();
                }
            })
            .catch(function (error) {
                console.warn('⚠️ Failed to load cart from database:', error);
                var backup = localStorage.getItem('mabite_cart_backup');
                if (backup && cart.length === 0) {
                    try {
                        cart = JSON.parse(backup);
                        updateCartUI();
                    } catch (e) {
                        cart = [];
                        updateCartUI();
                    }
                } else {
                    cart = [];
                    updateCartUI();
                }
            });
    }

    function syncCartToServer() {
        var sessionId = getSessionId();

        fetch(API_URL + '/cart/clear?sessionId=' + encodeURIComponent(sessionId), {
            method: 'DELETE'
        })
            .then(function () {
                if (cart.length === 0) return;

                var promises = cart.map(function (item) {
                    return fetch(API_URL + '/cart/add', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            productId: item.id,
                            name: item.name,
                            price: item.price,
                            quantity: item.quantity,
                            image: item.image || null,
                            sessionId: sessionId
                        })
                    });
                });

                return Promise.all(promises);
            })
            .catch(function (error) {
                console.warn('⚠️ Failed to sync cart to server:', error);
                try {
                    localStorage.setItem('mabite_cart_backup', JSON.stringify(cart));
                } catch (e) {
                    console.warn('⚠️ Failed to save to localStorage:', e);
                }
            });
    }

    function addToCart(product, qty, btnElement) {
        qty = qty || 1;

        if (!product || !product.id) {
            console.error('❌ Invalid product:', product);
            showToast('Error adding item to cart', 'error');
            return;
        }

        console.log('🛒 Adding to cart:', product.name, 'ID:', product.id, 'Qty:', qty);

        var existingIndex = -1;
        for (var i = 0; i < cart.length; i++) {
            if (cart[i].id === product.id) {
                existingIndex = i;
                break;
            }
        }

        var sessionId = getSessionId();

        if (existingIndex !== -1) {
            var newQuantity = cart[existingIndex].quantity + qty;

            fetch(API_URL + '/cart/update', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    productId: product.id,
                    quantity: newQuantity,
                    sessionId: sessionId
                })
            })
                .then(function (response) { return response.json(); })
                .then(function (result) {
                    if (result.success) {
                        cart[existingIndex].quantity = newQuantity;
                        updateCartUI();
                        showToast(product.name + ' quantity updated! 🎉', 'success');
                    } else {
                        console.error('❌ Failed to update cart:', result);
                        cart[existingIndex].quantity = newQuantity;
                        updateCartUI();
                        syncCartToServer();
                    }
                })
                .catch(function (error) {
                    console.error('❌ Update cart error:', error);
                    cart[existingIndex].quantity = newQuantity;
                    updateCartUI();
                    syncCartToServer();
                });
        } else {
            fetch(API_URL + '/cart/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    productId: product.id,
                    name: product.name,
                    price: product.price,
                    quantity: qty,
                    image: product.image || null,
                    sessionId: sessionId
                })
            })
                .then(function (response) { return response.json(); })
                .then(function (result) {
                    if (result.success) {
                        cart.push({
                            id: product.id,
                            name: product.name,
                            price: product.price,
                            image: product.image || product.icon || '🌯',
                            quantity: qty
                        });
                        updateCartUI();
                        showToast(product.name + ' added to cart! 🎉', 'success');
                    } else {
                        console.error('❌ Failed to add to cart:', result);
                        cart.push({
                            id: product.id,
                            name: product.name,
                            price: product.price,
                            image: product.image || product.icon || '🌯',
                            quantity: qty
                        });
                        updateCartUI();
                        syncCartToServer();
                    }
                })
                .catch(function (error) {
                    console.error('❌ Add to cart error:', error);
                    cart.push({
                        id: product.id,
                        name: product.name,
                        price: product.price,
                        image: product.image || product.icon || '🌯',
                        quantity: qty
                    });
                    updateCartUI();
                    syncCartToServer();
                });
        }

        if (btnElement) {
            var originalHtml = btnElement.innerHTML;
            btnElement.classList.add('added');
            btnElement.innerHTML = '<i class="fas fa-check"></i>';
            setTimeout(function () {
                btnElement.classList.remove('added');
                btnElement.innerHTML = originalHtml;
            }, 800);
        }
    }

    function updateCartItemQuantity(productId, delta) {
        var sessionId = getSessionId();

        var itemIndex = -1;
        for (var i = 0; i < cart.length; i++) {
            if (cart[i].id === productId) {
                itemIndex = i;
                break;
            }
        }

        if (itemIndex === -1) {
            console.warn('⚠️ Item not found in cart:', productId);
            return;
        }

        var newQuantity = cart[itemIndex].quantity + delta;

        if (newQuantity <= 0) {
            removeFromCart(productId);
            return;
        }

        fetch(API_URL + '/cart/update', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                productId: productId,
                quantity: newQuantity,
                sessionId: sessionId
            })
        })
            .then(function (response) { return response.json(); })
            .then(function (result) {
                if (result.success) {
                    cart[itemIndex].quantity = newQuantity;
                    updateCartUI();
                } else {
                    console.error('❌ Failed to update cart:', result);
                    cart[itemIndex].quantity = newQuantity;
                    updateCartUI();
                    syncCartToServer();
                }
            })
            .catch(function (error) {
                console.error('❌ Update cart error:', error);
                cart[itemIndex].quantity = newQuantity;
                updateCartUI();
                syncCartToServer();
            });
    }

    function removeFromCart(productId) {
        var sessionId = getSessionId();

        var itemIndex = -1;
        for (var i = 0; i < cart.length; i++) {
            if (cart[i].id === productId) {
                itemIndex = i;
                break;
            }
        }

        if (itemIndex === -1) {
            console.warn('⚠️ Item not found in cart:', productId);
            return;
        }

        var itemName = cart[itemIndex].name;

        fetch(API_URL + '/cart/remove/' + encodeURIComponent(productId) + '?sessionId=' + encodeURIComponent(sessionId), {
            method: 'DELETE'
        })
            .then(function (response) { return response.json(); })
            .then(function (result) {
                if (result.success) {
                    cart.splice(itemIndex, 1);
                    updateCartUI();
                    showToast(itemName + ' removed from cart', 'success');
                } else {
                    console.error('❌ Failed to remove from cart:', result);
                    cart.splice(itemIndex, 1);
                    updateCartUI();
                    syncCartToServer();
                }
            })
            .catch(function (error) {
                console.error('❌ Remove from cart error:', error);
                cart.splice(itemIndex, 1);
                updateCartUI();
                syncCartToServer();
            });
    }

    function getCartCount() {
        var count = 0;
        for (var i = 0; i < cart.length; i++) {
            count += cart[i].quantity;
        }
        return count;
    }

    function updateCartUI() {
        var count = getCartCount();

        if (cartBadge) {
            if (count > 0) {
                cartBadge.textContent = count;
                cartBadge.style.display = 'flex';
            } else {
                cartBadge.textContent = '0';
                cartBadge.style.display = 'none';
            }
        }

        if (floatingCartBadge) {
            if (count > 0) {
                floatingCartBadge.textContent = count;
                floatingCartBadge.style.display = 'flex';
            } else {
                floatingCartBadge.textContent = '0';
                floatingCartBadge.style.display = 'none';
            }
        }

        try {
            localStorage.setItem('mabite_cart_backup', JSON.stringify(cart));
            localStorage.setItem('mabite_cart_count', JSON.stringify(count));
        } catch (e) { }

        try {
            var event = new Event('cartUpdated');
            document.dispatchEvent(event);
        } catch (e) { }
    }

    // ============================================
    // REVIEWS - Google Reviews Carousel
    // ============================================

    var defaultReviews = [
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

    var reviewCarousel = null;
    var reviewDotsContainer = null;
    var reviewPrevBtn = null;
    var reviewNextBtn = null;
    var reviewsData = [];
    var currentReviewIndex = 0;
    var reviewAutoplayTimer = null;
    var isReviewAutoplayPaused = false;
    var reviewTouchStartX = 0;
    var reviewTouchEndX = 0;
    var reviewTouchStartY = 0;
    var reviewTouchEndY = 0;
    var VISIBLE_CARDS = 3;
    var AUTOPLAY_DELAY = 6000;
    var SWIPE_THRESHOLD = 50;

    function loadReviews() {
        console.log('📋 Loading reviews from API...');
        showReviewLoading();

        fetch(API_URL + '/reviews')
            .then(function (response) {
                if (!response.ok) {
                    throw new Error('HTTP ' + response.status);
                }
                return response.json();
            })
            .then(function (result) {
                if (result.success && result.data && result.data.length > 0) {
                    reviewsData = result.data;
                } else {
                    reviewsData = defaultReviews;
                }
                console.log('📋 Loaded ' + reviewsData.length + ' reviews');
                renderReviews();
                startReviewAutoplay();
            })
            .catch(function (error) {
                console.warn('⚠️ Using default reviews:', error);
                reviewsData = defaultReviews;
                renderReviews();
                startReviewAutoplay();
            });
    }

    function showReviewLoading() {
        var carousel = document.getElementById('reviewsCarousel');
        if (!carousel) return;

        carousel.innerHTML = `
            <div class="reviews-loading">
                <div class="spinner" aria-hidden="true"></div>
                <p>Loading reviews...</p>
            </div>
        `;
    }

    function showReviewError() {
        var carousel = document.getElementById('reviewsCarousel');
        if (!carousel) return;

        carousel.innerHTML = `
            <div class="reviews-error">
                <div class="error-icon" aria-hidden="true">⚠️</div>
                <h3>Unable to load reviews</h3>
                <p>Please try again later.</p>
            </div>
        `;
    }

    function showReviewEmpty() {
        var carousel = document.getElementById('reviewsCarousel');
        if (!carousel) return;

        carousel.innerHTML = `
            <div class="reviews-empty">
                <div class="empty-icon" aria-hidden="true">⭐</div>
                <h3>No customer reviews yet</h3>
                <p>Be the first to review us on Google!</p>
            </div>
        `;
    }

    function getInitials(name) {
        if (!name) return '?';
        var parts = name.trim().split(' ');
        if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
        return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
    }

    function getStarsHtml(rating) {
        var fullStars = Math.floor(rating);
        var halfStar = rating % 1 >= 0.5 ? 1 : 0;
        var emptyStars = 5 - fullStars - halfStar;
        var html = '';

        for (var i = 0; i < fullStars; i++) {
            html += '<i class="fas fa-star" style="color: #fbbc04;" aria-hidden="true"></i>';
        }
        if (halfStar) {
            html += '<i class="fas fa-star-half-alt" style="color: #fbbc04;" aria-hidden="true"></i>';
        }
        for (var i = 0; i < emptyStars; i++) {
            html += '<i class="far fa-star" style="color: #d1c9c0;" aria-hidden="true"></i>';
        }
        return html;
    }

    function getAvatarHtml(review) {
        if (review.avatar) {
            return '<img src="' + review.avatar + '" alt="' + review.name + '" class="review-avatar" loading="lazy">';
        }
        return '<div class="review-avatar-placeholder" aria-hidden="true">' + getInitials(review.name) + '</div>';
    }

    function updateVisibleCards() {
        if (window.innerWidth < 768) {
            VISIBLE_CARDS = 1;
        } else if (window.innerWidth < 1024) {
            VISIBLE_CARDS = 2;
        } else {
            VISIBLE_CARDS = 3;
        }
    }

    function renderReviews() {
        reviewCarousel = document.getElementById('reviewsCarousel');
        reviewDotsContainer = document.getElementById('reviewsDots');
        reviewPrevBtn = document.getElementById('reviewsPrev');
        reviewNextBtn = document.getElementById('reviewsNext');

        if (!reviewCarousel) return;

        updateVisibleCards();

        if (!reviewsData || reviewsData.length === 0) {
            showReviewEmpty();
            if (reviewDotsContainer) reviewDotsContainer.innerHTML = '';
            if (reviewPrevBtn) reviewPrevBtn.style.display = 'none';
            if (reviewNextBtn) reviewNextBtn.style.display = 'none';
            return;
        }

        if (reviewPrevBtn) reviewPrevBtn.style.display = 'flex';
        if (reviewNextBtn) reviewNextBtn.style.display = 'flex';

        var html = '';
        for (var i = 0; i < reviewsData.length; i++) {
            var review = reviewsData[i];
            var starsHtml = getStarsHtml(review.rating);
            var avatarHtml = getAvatarHtml(review);

            html += `
                <article class="review-card" data-index="${i}" role="tabpanel" aria-label="Review by ${review.name}">
                    <div class="review-card-header">
                        ${avatarHtml}
                        <div class="review-user-info">
                            <h3 class="review-name">${review.name}</h3>
                            <div class="review-source">
                                <span class="review-stars">${starsHtml}</span>
                                <span class="google-icon" aria-hidden="true">
                                    <i class="fab fa-google"></i>
                                </span>
                                <span>Google</span>
                            </div>
                        </div>
                    </div>
                    <p class="review-text">${review.text}</p>
                    <p class="review-date">${review.date || 'Recent'}</p>
                </article>
            `;
        }

        reviewCarousel.innerHTML = html;

        var totalDots = Math.max(1, reviewsData.length);
        var dotsHtml = '';
        for (var d = 0; d < totalDots; d++) {
            dotsHtml += `
                <button class="reviews-dot${d === 0 ? ' active' : ''}" 
                        data-index="${d}" 
                        role="tab" 
                        aria-label="Go to review ${d + 1} of ${totalDots}"
                        aria-selected="${d === 0 ? 'true' : 'false'}">
                </button>
            `;
        }
        if (reviewDotsContainer) {
            reviewDotsContainer.innerHTML = dotsHtml;

            var dots = reviewDotsContainer.querySelectorAll('.reviews-dot');
            dots.forEach(function (dot) {
                dot.removeEventListener('click', handleDotClick);
                dot.addEventListener('click', handleDotClick);
            });
        }

        if (reviewPrevBtn) {
            reviewPrevBtn.removeEventListener('click', handlePrevClick);
            reviewPrevBtn.addEventListener('click', handlePrevClick);
        }
        if (reviewNextBtn) {
            reviewNextBtn.removeEventListener('click', handleNextClick);
            reviewNextBtn.addEventListener('click', handleNextClick);
        }

        document.removeEventListener('keydown', handleReviewKeyboard);
        document.addEventListener('keydown', handleReviewKeyboard);

        var wrapper = document.querySelector('.reviews-carousel-wrapper');
        if (wrapper) {
            wrapper.removeEventListener('touchstart', handleTouchStart);
            wrapper.removeEventListener('touchmove', handleTouchMove);
            wrapper.removeEventListener('touchend', handleTouchEnd);
            wrapper.addEventListener('touchstart', handleTouchStart, { passive: true });
            wrapper.addEventListener('touchmove', handleTouchMove, { passive: true });
            wrapper.addEventListener('touchend', handleTouchEnd, { passive: true });
        }

        currentReviewIndex = 0;
        goToReview(0);
    }

    function handleDotClick(e) {
        var index = parseInt(this.dataset.index);
        goToReview(index);
        resetReviewAutoplay();
    }

    function handlePrevClick() {
        goToReview(currentReviewIndex - 1);
        resetReviewAutoplay();
    }

    function handleNextClick() {
        goToReview(currentReviewIndex + 1);
        resetReviewAutoplay();
    }

    function handleReviewKeyboard(e) {
        var isFocused = document.activeElement &&
            document.activeElement.closest('.reviews-section');
        if (!isFocused) return;

        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            goToReview(currentReviewIndex - 1);
            resetReviewAutoplay();
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            goToReview(currentReviewIndex + 1);
            resetReviewAutoplay();
        }
    }

    function goToReview(index) {
        if (!reviewsData || reviewsData.length === 0) return;

        var totalReviews = reviewsData.length;
        if (index < 0) {
            index = totalReviews - 1;
        } else if (index >= totalReviews) {
            index = 0;
        }

        currentReviewIndex = index;

        var carousel = reviewCarousel;
        if (!carousel) return;

        var cards = carousel.querySelectorAll('.review-card');
        if (cards.length === 0) return;

        var centerOffset = Math.floor(VISIBLE_CARDS / 2);

        cards.forEach(function (card, i) {
            var isVisible = i >= currentReviewIndex && i < currentReviewIndex + VISIBLE_CARDS;
            var isCenter = isVisible && (i === currentReviewIndex + centerOffset);
            card.classList.toggle('active', isCenter);
        });

        var totalCards = reviewsData.length;
        var maxIndex = Math.max(0, totalCards - VISIBLE_CARDS);
        var targetIndex = Math.min(currentReviewIndex, maxIndex);

        var cardWidth = cards[0].offsetWidth || 0;
        var gap = 24;
        var offset = targetIndex * (cardWidth + gap);

        if (totalCards <= VISIBLE_CARDS) {
            var totalWidth = totalCards * (cardWidth + gap) - gap;
            var containerWidth = carousel.parentElement.offsetWidth || 0;
            if (totalWidth < containerWidth) {
                offset = 0;
            }
        }

        carousel.style.transform = 'translateX(-' + offset + 'px)';

        if (reviewDotsContainer) {
            var dots = reviewDotsContainer.querySelectorAll('.reviews-dot');
            dots.forEach(function (dot, i) {
                dot.classList.toggle('active', i === currentReviewIndex);
                dot.setAttribute('aria-selected', i === currentReviewIndex ? 'true' : 'false');
            });
        }

        if (reviewPrevBtn) {
            reviewPrevBtn.disabled = false;
        }
        if (reviewNextBtn) {
            reviewNextBtn.disabled = false;
        }

        carousel.setAttribute('aria-label', 'Reviews ' + (currentReviewIndex + 1) + ' to ' + Math.min(currentReviewIndex + VISIBLE_CARDS, totalCards) + ' of ' + totalCards);
    }

    function handleTouchStart(e) {
        var touch = e.touches[0];
        reviewTouchStartX = touch.clientX;
        reviewTouchStartY = touch.clientY;
    }

    function handleTouchMove(e) {
        var touch = e.touches[0];
        reviewTouchEndX = touch.clientX;
        reviewTouchEndY = touch.clientY;

        var deltaX = reviewTouchStartX - reviewTouchEndX;
        var deltaY = reviewTouchStartY - reviewTouchEndY;

        if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
            e.preventDefault();
        }
    }

    function handleTouchEnd(e) {
        var deltaX = reviewTouchStartX - reviewTouchEndX;
        var deltaY = reviewTouchStartY - reviewTouchEndY;

        if (Math.abs(deltaX) < SWIPE_THRESHOLD) return;

        if (deltaX > 0) {
            goToReview(currentReviewIndex + 1);
        } else {
            goToReview(currentReviewIndex - 1);
        }
        resetReviewAutoplay();
    }

    function startReviewAutoplay() {
        stopReviewAutoplay();

        var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (prefersReducedMotion) {
            console.log('📋 Autoplay disabled due to reduced motion preference');
            return;
        }

        if (!reviewsData || reviewsData.length <= 1) return;

        reviewAutoplayTimer = setInterval(function () {
            if (!isReviewAutoplayPaused) {
                goToReview(currentReviewIndex + 1);
            }
        }, AUTOPLAY_DELAY);
    }

    function stopReviewAutoplay() {
        if (reviewAutoplayTimer) {
            clearInterval(reviewAutoplayTimer);
            reviewAutoplayTimer = null;
        }
    }

    function resetReviewAutoplay() {
        stopReviewAutoplay();
        startReviewAutoplay();
    }

    function pauseReviewAutoplay() {
        isReviewAutoplayPaused = true;
    }

    function resumeReviewAutoplay() {
        isReviewAutoplayPaused = false;
    }

    function setupReviewPauseOnHover() {
        var section = document.querySelector('.reviews-section');
        if (!section) return;

        section.addEventListener('mouseenter', function () {
            pauseReviewAutoplay();
        });

        section.addEventListener('mouseleave', function () {
            resumeReviewAutoplay();
        });
    }

    var reviewResizeTimer = null;

    function handleReviewResize() {
        if (reviewResizeTimer) {
            clearTimeout(reviewResizeTimer);
        }
        reviewResizeTimer = setTimeout(function () {
            if (reviewsData && reviewsData.length > 0) {
                updateVisibleCards();
                renderReviews();
            }
        }, 250);
    }

    window.addEventListener('resize', handleReviewResize);

    var reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotionQuery.addEventListener('change', function () {
        if (reducedMotionQuery.matches) {
            stopReviewAutoplay();
        } else {
            startReviewAutoplay();
        }
    });

    // ============================================
    // TRACK ORDER MODAL - FIXED
    // ============================================

    function openTrackModal() {
        if (!trackModal) {
            console.error('❌ Track modal not found');
            return;
        }

        trackModal.classList.add('open');
        if (trackInput) {
            trackInput.value = '';
        }
        if (trackResult) {
            trackResult.style.display = 'none';
            trackResult.innerHTML = '';
        }
        document.body.style.overflow = 'hidden';
        setTimeout(function () {
            if (trackInput) {
                trackInput.focus();
            }
        }, 100);
    }

    function closeTrackModal() {
        if (!trackModal) return;

        trackModal.classList.remove('open');
        document.body.style.overflow = '';
    }

    function trackOrder() {
        if (!trackInput || !trackResult || !trackBtn) {
            console.error('❌ Track modal elements not found');
            return;
        }

        var orderNum = trackInput.value.trim();
        if (!orderNum) {
            trackResult.style.display = 'block';
            trackResult.innerHTML = `
                <div class="track-error">
                    <span class="track-error-icon">⚠️</span>
                    <p>Please enter your order number</p>
                    <small>You can find it on your receipt or confirmation email</small>
                </div>
            `;
            return;
        }

        orderNum = orderNum.replace(/^#/, '');

        trackBtn.disabled = true;
        trackBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Searching...';
        trackResult.style.display = 'block';
        trackResult.innerHTML = `
            <div class="track-loading">
                <span class="track-loading-spinner">⏳</span>
                <p>Searching for your order...</p>
                <small>Please wait</small>
            </div>
        `;

        fetch(API_URL + '/orders/track/' + encodeURIComponent(orderNum))
            .then(function (response) {
                if (!response.ok) {
                    if (response.status === 404) {
                        throw new Error('ORDER_NOT_FOUND');
                    }
                    throw new Error('SERVER_ERROR');
                }
                return response.json();
            })
            .then(function (result) {
                if (result.success && result.data) {
                    var order = result.data;
                    renderTrackResult(order);
                    showToast('Order found! 🎉', 'success');
                } else {
                    throw new Error('ORDER_NOT_FOUND');
                }
            })
            .catch(function (error) {
                console.error('Track order error:', error);

                var errorMessage = '';
                var errorIcon = '🔍';
                var errorDetail = '';

                if (error.message === 'ORDER_NOT_FOUND') {
                    errorMessage = 'Order not found. Please check your order number.';
                    errorIcon = '🔍';
                    errorDetail = 'Make sure you enter it exactly as shown on your receipt.';
                } else if (error.message === 'SERVER_ERROR') {
                    errorMessage = 'Unable to check your order right now.';
                    errorIcon = '⚠️';
                    errorDetail = 'Please try again in a few moments.';
                } else {
                    errorMessage = 'Something went wrong. Please try again.';
                    errorIcon = '⚠️';
                    errorDetail = 'If the problem persists, contact our support team.';
                }

                trackResult.innerHTML = `
                    <div class="track-error">
                        <span class="track-error-icon">${errorIcon}</span>
                        <p>${errorMessage}</p>
                        <small>${errorDetail}</small>
                    </div>
                `;
                showToast(errorMessage, 'error');
            })
            .finally(function () {
                if (trackBtn) {
                    trackBtn.disabled = false;
                    trackBtn.innerHTML = 'Track';
                }
            });
    }

    function renderTrackResult(order) {
        var statusMap = {
            'pending': '⏳ Pending',
            'confirmed': '✅ Confirmed',
            'preparing': '🔥 Preparing',
            'ready': '🛍️ Ready',
            'delivered': '🎉 Delivered',
            'cancelled': '❌ Cancelled'
        };
        var statusClass = order.status || 'pending';

        var displayOrderNum = order.orderNumber || order.orderNumber || 'N/A';

        var trackerHtml = '';
        var statuses = ['pending', 'confirmed', 'preparing', 'ready', 'delivered'];
        var currentIndex = statuses.indexOf(order.status);
        if (currentIndex === -1) currentIndex = 0;

        for (var i = 0; i < statuses.length; i++) {
            var isActive = i === currentIndex;
            var isDone = i < currentIndex;
            var label = statuses[i].charAt(0).toUpperCase() + statuses[i].slice(1);

            trackerHtml += `
                <div class="step-mini">
                    <div class="dot ${isDone ? 'done' : (isActive ? 'active' : '')}"></div>
                    <div class="label ${isDone ? 'done' : (isActive ? 'active' : '')}">${label}</div>
                </div>
                ${i < statuses.length - 1 ? `<div class="tracker-line-mini ${isDone ? 'done' : ''}"></div>` : ''}
            `;
        }

        var itemsHtml = '';
        var items = order.items || [];
        for (var j = 0; j < items.length; j++) {
            var item = items[j];
            itemsHtml += `
                <div class="row">
                    <span>${item.quantity} × ${sanitizeInput(item.name)}</span>
                    <span>₦${(item.unitPrice * item.quantity).toLocaleString()}</span>
                </div>
            `;
        }

        trackResult.innerHTML = `
            <div class="track-result-card">
                <div class="order-header">
                    <span class="order-number">${displayOrderNum}</span>
                    <span class="order-status-badge ${statusClass}">${statusMap[order.status] || order.status}</span>
                </div>
                <div class="order-details-mini">
                    <div class="row">
                        <span>Customer</span>
                        <span>${sanitizeInput(order.customer?.name || 'Guest')}</span>
                    </div>
                    <div class="row">
                        <span>Phone</span>
                        <span>${order.customer?.phone || 'N/A'}</span>
                    </div>
                    <div class="row">
                        <span>Total</span>
                        <span>₦${(order.total || 0).toLocaleString()}</span>
                    </div>
                    <div class="row">
                        <span>Delivery</span>
                        <span>${order.delivery?.isDelivery ? '🚚 Delivery' : '🏪 Pickup'}</span>
                    </div>
                    <div class="row" style="border-top:1px solid #e0dad3;padding-top:8px;margin-top:4px;font-weight:600;">
                        <span>Items</span>
                        <span>${items.length} item${items.length > 1 ? 's' : ''}</span>
                    </div>
                    ${itemsHtml}
                </div>
                <div class="tracker-mini">
                    <div class="tracker-steps-mini">
                        ${trackerHtml}
                    </div>
                </div>
            </div>
        `;
    }

    // ============================================
    // TRACK ORDER MODAL EVENT LISTENERS
    // ============================================

    if (trackOrderNav) {
        trackOrderNav.addEventListener('click', function (e) {
            e.preventDefault();
            openTrackModal();
        });
    }

    if (trackModalClose) {
        trackModalClose.addEventListener('click', closeTrackModal);
    }

    if (trackModal) {
        trackModal.addEventListener('click', function (e) {
            if (e.target === trackModal) {
                closeTrackModal();
            }
        });
    }

    if (trackBtn) {
        trackBtn.addEventListener('click', trackOrder);
    }

    if (trackInput) {
        trackInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                trackOrder();
            }
        });
    }

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && trackModal && trackModal.classList.contains('open')) {
            closeTrackModal();
        }
    });

    // ============================================
    // SKELETON LOADING
    // ============================================

    function showSkeletonLoading(count) {
        count = count || 4;
        var html = '';
        for (var i = 0; i < count; i++) {
            html += `
        <div class="menu-card skeleton-card">
          <div class="card-image-wrapper skeleton-image">
            <div class="skeleton-shimmer"></div>
          </div>
          <div class="card-body">
            <div class="skeleton-line skeleton-title"></div>
            <div class="skeleton-line skeleton-desc"></div>
            <div class="skeleton-line skeleton-desc short"></div>
            <div class="card-footer">
              <div class="skeleton-line skeleton-price"></div>
              <div class="skeleton-circle"></div>
            </div>
          </div>
        </div>
      `;
        }
        menuGrid.innerHTML = html;
    }

    // ============================================
    // RENDER CATEGORIES
    // ============================================

    function renderCategories() {
        var html = '';
        for (var i = 0; i < categories.length; i++) {
            var cat = categories[i];
            var activeClass = cat.id === currentCategory ? 'active' : '';
            var imageHtml = '<img src="' + cat.image + '" alt="' + cat.label + '" loading="lazy" onerror="this.style.display=\'none\'">';
            var fallbackHtml = '<span class="emoji-fallback">' + cat.emoji + '</span>';

            html += '<button class="category-item-filter ' + activeClass + '" data-category="' + cat.id + '">';
            html += '<div class="category-thumb">';
            html += imageHtml;
            html += fallbackHtml;
            html += '</div>';
            html += '<span class="category-label">' + cat.label + '</span>';
            html += '</button>';
        }
        categoryScroll.innerHTML = html;

        categoryScroll.querySelectorAll('.category-item-filter').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                var categoryId = this.dataset.category;
                console.log('🔍 Category clicked:', categoryId);
                currentCategory = categoryId;
                renderCategories();
                filterAndRenderMenu();
                updateSubtitle(categoryId);
            });
        });
    }

    // ============================================
    // UPDATE SUBTITLE
    // ============================================

    function updateSubtitle(categoryId) {
        var categoryNames = {
            'all': 'All items',
            'shawarma': 'Shawarma',
            'chicken-fries': 'Chicken & Fries',
            'barbeque': 'Barbeque',
            'desserts': 'Desserts'
        };
        var name = categoryNames[categoryId] || 'items';
        var totalItems = menuItems.length;
        var filteredCount = getFilteredItems().length;

        if (totalItems === 0) {
            menuSubtitle.textContent = 'No items available yet. Check back soon!';
        } else if (categoryId === 'all') {
            menuSubtitle.textContent = 'Showing all ' + totalItems + ' delicious items';
        } else {
            menuSubtitle.textContent = 'Showing ' + filteredCount + ' items in ' + name;
        }
    }

    // ============================================
    // GET FILTERED ITEMS
    // ============================================

    function getFilteredItems() {
        if (currentCategory === 'all') {
            return menuItems.slice();
        }

        var validCategories = categoryMapping[currentCategory] || [currentCategory];
        var filtered = [];
        for (var i = 0; i < menuItems.length; i++) {
            var item = menuItems[i];
            var itemCategory = (item.category || '').toLowerCase().trim();

            var matches = false;
            for (var j = 0; j < validCategories.length; j++) {
                if (itemCategory === validCategories[j].toLowerCase()) {
                    matches = true;
                    break;
                }
            }

            if (matches) {
                filtered.push(item);
            }
        }

        return filtered;
    }

    // ============================================
    // GET IMAGE HTML
    // ============================================

    function getImageHtml(item) {
        var hasImage = item.image &&
            item.image.trim() !== '' &&
            item.image !== 'null' &&
            item.image !== 'undefined';

        if (hasImage) {
            var imageValue = item.image.trim();
            var imageUrl = '';

            if (imageValue.startsWith('data:image/')) {
                imageUrl = imageValue;
            } else if (imageValue.startsWith('http://') || imageValue.startsWith('https://')) {
                imageUrl = imageValue;
            } else {
                if (imageValue.startsWith('/')) {
                    imageUrl = imageValue;
                } else {
                    imageUrl = '/uploads/' + imageValue;
                }
            }

            return `
        <div class="image-loader">
          <img src="${imageUrl}" 
               alt="${item.name}" 
               class="menu-item-image" 
               loading="lazy"
               onload="this.parentElement.classList.add('loaded')"
               onerror="this.parentElement.classList.add('error'); this.style.display='none'; this.parentElement.querySelector('.image-fallback').style.display='flex';">
          <div class="image-loader-spinner">
            <i class="fas fa-spinner fa-spin"></i>
          </div>
          <div class="image-fallback" style="display:none;align-items:center;justify-content:center;font-size:3rem;width:100%;height:100%;position:absolute;top:0;left:0;background:#f5f0eb;border-radius:16px 16px 0 0;">
            ${item.emoji || '🍽️'}
          </div>
        </div>
      `;
        }

        var emoji = item.emoji || '🍽️';
        return `
      <div class="image-loader loaded">
        <div class="image-fallback" style="display:flex;align-items:center;justify-content:center;font-size:4rem;width:100%;height:100%;background:#f5f0eb;border-radius:16px 16px 0 0;">
          ${emoji}
        </div>
      </div>
    `;
    }

    // ============================================
    // RENDER MENU
    // ============================================

    function renderMenu(items) {
        if (!menuGrid) return;

        if (!items || items.length === 0) {
            menuCount.innerHTML = '<strong>0</strong> items';
            menuGrid.innerHTML = `
        <div class="menu-empty">
          <div class="empty-icon">🍽️</div>
          <h3>No menu items yet</h3>
          <p>Our kitchen is preparing something delicious for you!</p>
          <p class="empty-sub">Menu will appear here automatically when available.</p>
        </div>
      `;
            return;
        }

        menuCount.innerHTML = '<strong>' + items.length + '</strong> items';

        var html = '';
        for (var i = 0; i < items.length; i++) {
            var item = items[i];

            var rating = (4 + Math.random() * 0.5).toFixed(1);
            var fullStars = Math.floor(rating);
            var starsHtml = '';
            for (var s = 0; s < fullStars; s++) starsHtml += '<i class="fas fa-star"></i>';
            if (rating % 1 >= 0.5) starsHtml += '<i class="fas fa-star-half-alt"></i>';
            for (var e = 0; e < 5 - Math.ceil(rating); e++) starsHtml += '<i class="far fa-star"></i>';

            var badgeHtml = '';
            if (item.isPopular) {
                badgeHtml = '<span class="card-badge popular">🔥 Popular</span>';
            }

            var imageHtml = getImageHtml(item);

            var isUnavailable = item.isAvailable === false;

            html += `
        <div class="menu-card" data-id="${item.id}">
          <div class="card-image-wrapper">
            <div class="card-image">
              ${imageHtml}
            </div>
            <button class="favorite-btn" data-id="${item.id}" aria-label="Add to favourites">
              <i class="far fa-heart"></i>
            </button>
            ${badgeHtml}
          </div>
          <div class="card-body">
            <div class="card-top">
              <h3 class="card-title">${item.name}</h3>
              <div class="card-rating">
                <span class="stars">${starsHtml}</span>
                <span class="rating-number">${rating}</span>
              </div>
            </div>
            <p class="card-desc">${item.description || 'Delicious and freshly prepared.'}</p>
            <div class="card-footer">
              <span class="price">₦${item.price.toLocaleString()}</span>
              ${isUnavailable ?
                    '<span class="btn-unavailable">Unavailable</span>' :
                    '<button class="add-btn" data-id="' + item.id + '" aria-label="Add to cart"><i class="fas fa-plus"></i></button>'
                }
            </div>
          </div>
        </div>
      `;
        }

        menuGrid.innerHTML = html;

        var addBtns = menuGrid.querySelectorAll('.add-btn');
        addBtns.forEach(function (btn) {
            btn.removeEventListener('click', handleAddToCart);
            btn.addEventListener('click', handleAddToCart);
        });

        function handleAddToCart(e) {
            e.stopPropagation();
            var btn = this;
            var id = btn.dataset.id;

            console.log('🔍 Add to cart clicked for ID:', id);

            var item = null;
            for (var i = 0; i < menuItems.length; i++) {
                if (menuItems[i].id == id) {
                    item = menuItems[i];
                    break;
                }
            }

            if (!item) {
                console.error('❌ Item not found in menuItems for ID:', id);
                showToast('Item not found. Please refresh the page.', 'error');
                return;
            }

            if (item.isAvailable === false) {
                showToast('This item is currently unavailable', 'error');
                return;
            }

            addToCart(item, 1, btn);
        }

        var favBtns = menuGrid.querySelectorAll('.favorite-btn');
        favBtns.forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                this.classList.toggle('favorited');
                var icon = this.querySelector('i');
                icon.classList.toggle('far');
                icon.classList.toggle('fas');
            });
        });

        var cards = menuGrid.querySelectorAll('.menu-card');
        cards.forEach(function (card) {
            card.addEventListener('click', function (e) {
                if (e.target.closest('.add-btn') || e.target.closest('.favorite-btn')) return;
                var id = this.dataset.id;
                var item = menuItems.find(function (i) { return i.id == id; });
                if (item) {
                    console.log('📋 Viewing details:', item.name);
                }
            });
        });
    }

    // ============================================
    // FILTER AND RENDER MENU
    // ============================================

    function filterAndRenderMenu() {
        var filtered = getFilteredItems();
        renderMenu(filtered);
        updateSubtitle(currentCategory);
    }

    // ============================================
    // LOAD MENU FROM API
    // ============================================

    function loadMenu() {
        if (isLoading) return;
        isLoading = true;

        console.log('📋 Loading menu from API...');
        showSkeletonLoading(4);

        fetch(API_URL + '/menu', {
            headers: {
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            }
        })
            .then(function (response) {
                if (!response.ok) {
                    throw new Error('HTTP ' + response.status);
                }
                return response.json();
            })
            .then(function (result) {
                if (result.success && result.data) {
                    menuItems = result.data.map(function (item) {
                        if (!item.emoji) {
                            var emojis = {
                                'shawarma': '🌯',
                                'chicken-fries': '🍗',
                                'barbeque': '🔥',
                                'desserts': '🍨'
                            };
                            item.emoji = emojis[item.category] || '🍽️';
                        }
                        return item;
                    });
                    console.log('📋 Loaded ' + menuItems.length + ' menu items');
                } else {
                    menuItems = [];
                }

                isLoading = false;
                filterAndRenderMenu();
            })
            .catch(function (error) {
                console.error('⚠️ Error loading menu:', error);
                isLoading = false;
                menuItems = [];
                filterAndRenderMenu();
            });
    }

    // ============================================
    // SSE SETUP
    // ============================================

    function setupSSE() {
        try {
            console.log('📡 Setting up SSE connection...');
            eventSource = new EventSource(API_URL + '/menu/stream');

            eventSource.onopen = function () {
                console.log('📡 SSE: ✅ Connected to menu stream');
                reconnectAttempts = 0;
            };

            eventSource.onmessage = function (event) {
                try {
                    var data = JSON.parse(event.data);

                    if (data.type === 'menu_update') {
                        var newMenu = data.data || [];
                        menuItems = newMenu.map(function (item) {
                            if (!item.emoji) {
                                var emojis = {
                                    'shawarma': '🌯',
                                    'chicken-fries': '🍗',
                                    'barbeque': '🔥',
                                    'desserts': '🍨'
                                };
                                item.emoji = emojis[item.category] || '🍽️';
                            }
                            return item;
                        });
                        filterAndRenderMenu();
                    }
                } catch (e) {
                    console.error('📡 SSE: Error parsing message', e);
                }
            };

            eventSource.onerror = function (error) {
                console.log('📡 SSE: ❌ Connection error');
                eventSource.close();
                reconnectAttempts++;
                if (reconnectAttempts <= maxReconnectAttempts) {
                    setTimeout(function () { setupSSE(); }, reconnectDelay);
                } else {
                    console.log('📡 SSE: Max reconnect attempts. Using polling fallback.');
                    setupPollingFallback();
                }
            };

        } catch (error) {
            console.log('📡 SSE: Failed to setup, using polling fallback', error);
            setupPollingFallback();
        }
    }

    // ============================================
    // POLLING FALLBACK
    // ============================================

    function setupPollingFallback() {
        console.log('📡 Using polling fallback (every 15s)');

        if (pollingInterval) {
            clearInterval(pollingInterval);
            pollingInterval = null;
        }

        loadMenu();

        pollingInterval = setInterval(function () {
            loadMenu();
        }, 15000);
    }

    // ============================================
    // SEARCH
    // ============================================

    function handleSearch(query) {
        var term = query.toLowerCase().trim();
        if (!term) {
            clearSearch();
            return;
        }

        var results = menuItems.filter(function (item) {
            return item.name.toLowerCase().includes(term) ||
                (item.description && item.description.toLowerCase().includes(term));
        });

        isSearchMode = true;
        searchResultsSection.style.display = 'block';
        document.getElementById('menu').style.display = 'none';
        document.getElementById('categoryFilter').style.display = 'none';
        document.getElementById('reviews').style.display = 'none';

        searchQueryDisplay.textContent = term;
        searchResultCount.textContent = results.length + ' item' + (results.length !== 1 ? 's' : '') + ' found';

        if (results.length === 0) {
            searchResultsGrid.innerHTML = `
        <div class="search-result-empty">
          <div class="empty-icon">🔍</div>
          <h3>No results found</h3>
          <p>We couldn't find anything matching "${term}"</p>
          <p class="search-empty-hint">Try searching for something else or browse our menu</p>
        </div>
      `;
        } else {
            var html = '';
            for (var i = 0; i < results.length; i++) {
                var item = results[i];
                var rating = (4 + Math.random() * 0.5).toFixed(1);
                var fullStars = Math.floor(rating);
                var starsHtml = '';
                for (var s = 0; s < fullStars; s++) starsHtml += '<i class="fas fa-star"></i>';
                if (rating % 1 >= 0.5) starsHtml += '<i class="fas fa-star-half-alt"></i>';
                for (var e = 0; e < 5 - Math.ceil(rating); e++) starsHtml += '<i class="far fa-star"></i>';

                var imageHtml = getImageHtml(item);
                var isUnavailable = item.isAvailable === false;

                html += `
          <div class="menu-card" data-id="${item.id}">
            <div class="card-image-wrapper">
              <div class="card-image">
                ${imageHtml}
              </div>
              <button class="favorite-btn" data-id="${item.id}" aria-label="Add to favourites">
                <i class="far fa-heart"></i>
              </button>
            </div>
            <div class="card-body">
              <div class="card-top">
                <h3 class="card-title">${item.name}</h3>
                <div class="card-rating">
                  <span class="stars">${starsHtml}</span>
                  <span class="rating-number">${rating}</span>
                </div>
              </div>
              <p class="card-desc">${item.description || 'Delicious and freshly prepared.'}</p>
              <div class="card-footer">
                <span class="price">₦${item.price.toLocaleString()}</span>
                ${isUnavailable ?
                        '<span class="btn-unavailable">Unavailable</span>' :
                        '<button class="add-btn" data-id="' + item.id + '" aria-label="Add to cart"><i class="fas fa-plus"></i></button>'
                    }
              </div>
            </div>
          </div>
        `;
            }
            searchResultsGrid.innerHTML = html;

            searchResultsGrid.querySelectorAll('.add-btn').forEach(function (btn) {
                btn.removeEventListener('click', handleSearchAddToCart);
                btn.addEventListener('click', handleSearchAddToCart);
            });

            function handleSearchAddToCart(e) {
                e.stopPropagation();
                var btn = this;
                var id = btn.dataset.id;

                var item = null;
                for (var i = 0; i < menuItems.length; i++) {
                    if (menuItems[i].id == id) {
                        item = menuItems[i];
                        break;
                    }
                }

                if (!item) {
                    console.error('❌ Item not found in menuItems for ID:', id);
                    showToast('Item not found. Please refresh the page.', 'error');
                    return;
                }

                if (item.isAvailable === false) {
                    showToast('This item is currently unavailable', 'error');
                    return;
                }

                addToCart(item, 1, btn);
            }

            searchResultsGrid.querySelectorAll('.favorite-btn').forEach(function (btn) {
                btn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    this.classList.toggle('favorited');
                    var icon = this.querySelector('i');
                    icon.classList.toggle('far');
                    icon.classList.toggle('fas');
                });
            });

            var searchCards = searchResultsGrid.querySelectorAll('.menu-card');
            searchCards.forEach(function (card) {
                card.addEventListener('click', function (e) {
                    if (e.target.closest('.add-btn') || e.target.closest('.favorite-btn')) return;
                    var id = this.dataset.id;
                    var item = menuItems.find(function (i) { return i.id == id; });
                    if (item) {
                        console.log('📋 Viewing details:', item.name);
                    }
                });
            });
        }

        searchResultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function clearSearch() {
        isSearchMode = false;
        searchResultsSection.style.display = 'none';
        document.getElementById('menu').style.display = 'block';
        document.getElementById('categoryFilter').style.display = 'block';
        document.getElementById('reviews').style.display = 'block';
        searchInput.value = '';
        searchMobileInput.value = '';
        filterAndRenderMenu();
        if (searchMobileWrapper.classList.contains('active')) {
            closeMobileSearch();
        }
    }

    // ============================================
    // NAV LINKS ACTIVE STATE
    // ============================================

    function setActiveLink(sectionId) {
        navLinks.forEach(function (link) {
            link.classList.remove('active');
            if (link.dataset.section === sectionId) {
                link.classList.add('active');
            }
        });
    }

    function getCurrentSection() {
        var sections = ['home', 'menu', 'reviews'];
        var scrollPos = window.scrollY + 150;

        for (var i = sections.length - 1; i >= 0; i--) {
            var el = document.getElementById(sections[i]);
            if (el && el.offsetTop <= scrollPos) {
                return sections[i];
            }
        }
        return 'home';
    }

    function updateActiveLinkOnScroll() {
        var current = getCurrentSection();
        setActiveLink(current);
    }

    navLinks.forEach(function (link) {
        link.addEventListener('click', function (e) {
            var href = this.getAttribute('href');

            if (href && href.startsWith('#')) {
                e.preventDefault();
                var targetId = href.substring(1);
                var targetElement = document.getElementById(targetId);

                if (targetElement) {
                    if (isSearchMode) {
                        clearSearch();
                        setTimeout(function () {
                            targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }, 100);
                    } else {
                        targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                }

                navLinks.forEach(function (l) { l.classList.remove('active'); });
                this.classList.add('active');
            }
        });
    });

    window.addEventListener('scroll', function () {
        if (!isSearchMode) {
            updateActiveLinkOnScroll();
        }
    });

    // ============================================
    // MOBILE SEARCH
    // ============================================

    function openMobileSearch() {
        navLinksContainer.classList.add('hidden');
        searchMobileWrapper.classList.add('active');
        searchToggle.style.display = 'none';
        setTimeout(function () { searchMobileInput.focus(); }, 150);
    }

    function closeMobileSearch() {
        navLinksContainer.classList.remove('hidden');
        searchMobileWrapper.classList.remove('active');
        searchToggle.style.display = 'flex';
        searchMobileInput.value = '';
        if (!isSearchMode) {
            filterAndRenderMenu();
        }
    }

    if (searchToggle) {
        searchToggle.addEventListener('click', function (e) {
            e.stopPropagation();
            if (searchMobileWrapper.classList.contains('active')) {
                closeMobileSearch();
            } else {
                openMobileSearch();
            }
        });
    }

    if (closeSearchMobile) {
        closeSearchMobile.addEventListener('click', closeMobileSearch);
    }

    if (searchMobileInput) {
        searchMobileInput.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') { closeMobileSearch(); }
            if (e.key === 'Enter') {
                e.preventDefault();
                handleSearch(this.value);
                closeMobileSearch();
            }
        });
    }

    if (searchMobileSubmit) {
        searchMobileSubmit.addEventListener('click', function (e) {
            e.preventDefault();
            var query = searchMobileInput.value.trim();
            if (query) {
                handleSearch(query);
                closeMobileSearch();
            }
        });
    }

    document.addEventListener('click', function (e) {
        if (searchMobileWrapper && searchMobileWrapper.classList.contains('active')) {
            var navbar = document.querySelector('.navbar');
            if (navbar && !navbar.contains(e.target)) {
                closeMobileSearch();
            }
        }
    });

    if (searchInput) {
        searchInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleSearch(this.value);
            }
        });
    }

    if (searchSubmit) {
        searchSubmit.addEventListener('click', function (e) {
            e.preventDefault();
            var query = searchInput.value.trim();
            if (query) {
                handleSearch(query);
            }
        });
    }

    if (clearSearchBtn) {
        clearSearchBtn.addEventListener('click', function () {
            clearSearch();
        });
    }

    // ============================================
    // WINDOW RESIZE
    // ============================================

    window.addEventListener('resize', function () {
        if (reviews && reviews.length > 0) {
            renderReviews();
        }
    });

    // ============================================
    // INIT
    // ============================================

    function init() {
        console.log('🌯 Mabites Grills loaded!');

        renderCategories();
        showSkeletonLoading(4);
        loadMenu();
        loadReviews();
        loadCart();
        setupSSE();
        initFloatingCart();

        if (menuSubtitle) {
            menuSubtitle.textContent = 'Handpicked favourites just for you';
        }

        updateCartUI();

        setTimeout(function () {
            var current = getCurrentSection();
            setActiveLink(current);
        }, 100);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();