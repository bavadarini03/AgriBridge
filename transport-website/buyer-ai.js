/* buyer-ai.js - AI Recommendation Logic for Best Farmer Match
 * 
 * Scoring formula (weights must sum to 1.0):
 *   Price      30%  (lower is better)
 *   Distance   20%  (closer is better)
 *   Freshness  15%  (fresher is better)
 *   Quality    15%  (A > B > C)
 *   Quantity   10%  (availability)
 *   Transport  10%  (lower transport cost is better)
 *
 * Transport cost formula (mirrors _calcEarnings in firebase-service.js):
 *   Base: 50, Distance: ₹12/km, Load: ₹8/100kg, Min: ₹80
 */

const BuyerAI = {
  
  /**
   * Calculate transport cost using same formula as the existing transport module.
   * @param {number} distanceKm 
   * @param {number} weightKg
   */
  calcTransportCost(distanceKm, weightKg) {
    const base = 50;
    const distCharge = Math.round(12 * (distanceKm || 0));
    const loadCharge = Math.round(8 * ((weightKg || 0) / 100));
    return Math.max(80, base + distCharge + loadCharge);
  },

  /**
   * Calculate a 0–100 match score for a crop/farmer.
   * Returns { matchScore, reasons, transportCost }
   * 
   * @param {Object} crop  - Firestore crop document
   * @param {number} qtyRequired - buyer's required quantity in kg
   */
  calculateScore(crop, qtyRequired = 100) {
    const WEIGHTS = {
      price:     0.30,
      distance:  0.20,
      freshness: 0.15,
      quality:   0.15,
      quantity:  0.10,
      transport: 0.10,
    };

    // ── 1. Price Score (lower price = higher score) ──────────────────
    // Baseline: ₹80/kg = 0, ₹10/kg = 100, linear interpolation
    const price = crop.pricePerKg || 40;
    const priceScore = Math.max(0, Math.min(100, ((80 - price) / 70) * 100));

    // ── 2. Distance Score (closer = higher score) ────────────────────
    // 0 km = 100, 100 km = 0
    const dist = crop.distanceKm != null ? crop.distanceKm : 15;
    const distScore = Math.max(0, Math.min(100, ((100 - dist) / 100) * 100));

    // ── 3. Freshness Score (fewer days since harvest = higher score) ──
    // 0 days old = 100, 10 days old = 0
    const freshness = crop.freshness != null ? crop.freshness : 2;
    const freshScore = Math.max(0, Math.min(100, ((10 - freshness) / 10) * 100));

    // ── 4. Quality Score ─────────────────────────────────────────────
    const qualMap = { 'A': 100, 'B': 70, 'C': 45 };
    const qualScore = qualMap[crop.quality] ?? 70;

    // ── 5. Quantity Availability Score ───────────────────────────────
    const available = crop.availableQuantity || 0;
    let qtyScore = 100;
    if (available < qtyRequired) {
      qtyScore = available > 0 ? Math.round((available / qtyRequired) * 100) : 0;
    }

    // ── 6. Transport Cost Score ──────────────────────────────────────
    const transportCost = this.calcTransportCost(dist, qtyRequired);
    // ₹80 = 100 pts, ₹2000 = 0 pts
    const transportScore = Math.max(0, Math.min(100, ((2000 - transportCost) / 1920) * 100));

    // ── Weighted sum ─────────────────────────────────────────────────
    const raw = (
      priceScore     * WEIGHTS.price     +
      distScore      * WEIGHTS.distance  +
      freshScore     * WEIGHTS.freshness +
      qualScore      * WEIGHTS.quality   +
      qtyScore       * WEIGHTS.quantity  +
      transportScore * WEIGHTS.transport
    );
    const matchScore = Math.min(100, Math.max(0, Math.round(raw)));

    // ── Explainable reasons ──────────────────────────────────────────
    const reasons = [];
    if (priceScore >= 70)     reasons.push('Competitive market price');
    if (distScore >= 70)      reasons.push('Nearby farmer (low distance)');
    if (freshScore >= 80)     reasons.push('Very fresh produce');
    else if (freshScore >= 60) reasons.push('Fresh produce');
    if (qualScore === 100)    reasons.push('Grade A quality guaranteed');
    else if (qualScore >= 70) reasons.push('Good quality (Grade B)');
    if (qtyScore === 100)     reasons.push('Sufficient quantity available');
    else if (qtyScore > 0)    reasons.push(`Partial quantity available (${available} kg)`);
    if (transportScore >= 70) reasons.push('Low transport cost');

    return {
      matchScore,
      reasons: reasons.slice(0, 5),
      transportCost,
      breakdown: {
        priceScore: Math.round(priceScore),
        distScore: Math.round(distScore),
        freshScore: Math.round(freshScore),
        qualScore,
        qtyScore: Math.round(qtyScore),
        transportScore: Math.round(transportScore)
      }
    };
  },

  /**
   * Rank a list of crops by match score.
   * @param {Array} crops  - list of crop objects
   * @param {number} qtyRequired
   * @returns {Array} sorted crops with .matchScore added
   */
  rankCrops(crops, qtyRequired = 100) {
    return crops.map(crop => ({
      ...crop,
      aiResult: this.calculateScore(crop, qtyRequired)
    })).sort((a, b) => b.aiResult.matchScore - a.aiResult.matchScore);
  }
};

window.BuyerAI = BuyerAI;
