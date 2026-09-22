/* farmer-pages.js — Aggregator: combines all farmer page modules into one FarmerPages object.
   Loaded AFTER farmer-pages-core.js, farmer-pages-orders.js, farmer-pages-market.js, farmer-pages-misc.js */

const FarmerPages = {
    // Core pages
    dashboard: (...a) => FarmerPagesCore.dashboard(...a),
    'my-crops': (...a) => FarmerPagesCore['my-crops'](...a),
    'add-crop': (...a) => FarmerPagesCore['add-crop'](...a),
    'edit-crop': (...a) => FarmerPagesCore['edit-crop'](...a),

    // Order & Transport pages
    orders: (...a) => FarmerPagesOrders.orders(...a),
    'order-details': (...a) => FarmerPagesOrders['order-details'](...a),
    transport: (...a) => FarmerPagesOrders.transport(...a),
    'request-transport': (...a) => FarmerPagesOrders['request-transport'](...a),

    // Market & AI pages
    'market-prices': (...a) => FarmerPagesMarket['market-prices'](...a),
    'ai-recommendations': (...a) => FarmerPagesMarket['ai-recommendations'](...a),
    'nearby-buyers': (...a) => FarmerPagesMarket['nearby-buyers'](...a),

    // Misc pages
    earnings: (...a) => FarmerPagesMisc.earnings(...a),
    'voice-assistant': (...a) => FarmerPagesMisc['voice-assistant'](...a),
    profile: (...a) => FarmerPagesMisc.profile(...a),
};

window.FarmerPages = FarmerPages;
