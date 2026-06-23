'use strict';

// ── Model Configuration ─────────────────────────────────────────────────────
// Central registry mapping logical task names to Claude model IDs.
// Adjust model assignments here when new models are released or pricing changes.

const MODELS = {
  // ── Tier definitions ──────────────────────────────────────────────────────
  HAIKU: 'claude-haiku-4-5-20251001',   // $1/$5 per MTok — fast, cheap, good for structured extraction
  SONNET: 'claude-sonnet-4-6',          // $3/$15 per MTok — balanced quality/cost for most tasks
  OPUS: 'claude-opus-4-8',              // $5/$25 per MTok — highest quality, reserved for complex creative

  // ── Pricing (USD per million tokens) ──────────────────────────────────────
  PRICING: {
    'claude-haiku-4-5-20251001': { input: 1.0, output: 5.0, cacheWrite: 1.25, cacheRead: 0.10 },
    'claude-sonnet-4-6':         { input: 3.0, output: 15.0, cacheWrite: 3.75, cacheRead: 0.30 },
    'claude-opus-4-8':           { input: 5.0, output: 25.0, cacheWrite: 6.25, cacheRead: 0.50 },
  },

  // ── Task → Model mapping ──────────────────────────────────────────────────
  // Internal/low-stakes tasks → Haiku (cheaper, faster)
  LEAD_DISCOVERY:        'claude-haiku-4-5-20251001',  // Agent 1: find businesses via web search
  INSTAGRAM_DISCOVERY:   'claude-haiku-4-5-20251001',  // Agent 1-IG: Instagram targeting
  MAPS_DISCOVERY:        'claude-haiku-4-5-20251001',  // Agent 1-Maps: Google Maps targeting
  COMPETITOR_ANALYSIS:   'claude-haiku-4-5-20251001',  // Agent 4: competitor JSON extraction
  SUBJECT_LINES:         'claude-haiku-4-5-20251001',  // Agent 5b: 3 subject line options
  MOTIVATIONAL_LINE:     'claude-haiku-4-5-20251001',  // Daily briefing: 1 motivational sentence
  INTAKE_FORM:           'claude-haiku-4-5-20251001',  // Generate intake form questions
  PROJECT_PLAN:          'claude-haiku-4-5-20251001',  // Internal project plan JSON
  TASK_LIST:             'claude-haiku-4-5-20251001',  // Week-1 task list JSON
  CONTENT_CALENDAR_INT:  'claude-haiku-4-5-20251001',  // Internal month-1 content calendar
  ONBOARDING_SCRIPT:     'claude-haiku-4-5-20251001',  // Internal onboarding call script
  CODE_EXTRACTION:       'claude-haiku-4-5-20251001',  // Extract widget/booking code from HTML
  MILESTONE_TIMELINE:    'claude-haiku-4-5-20251001',  // Internal milestone planning
  ADMIN_INSTRUCTIONS:    'claude-haiku-4-5-20251001',  // Admin-only instruction guide
  SUPERADMIN_PROXY:      'claude-haiku-4-5-20251001',  // Superadmin test/debug endpoint

  // Customer-visible content → Sonnet (quality matters)
  COLD_EMAIL:            'claude-sonnet-4-6',  // Agent 5: outreach emails A/B
  FOLLOWUP_EMAIL:        'claude-sonnet-4-6',  // Follow-up 1 & 2 emails
  LINKEDIN_DM:           'claude-sonnet-4-6',  // LinkedIn DM text
  VOICENOTE_SCRIPT:      'claude-sonnet-4-6',  // Voicenote script
  AI_REPLY:              'claude-sonnet-4-6',  // Reply to prospect responses
  CLIENT_EMAIL:          'claude-sonnet-4-6',  // Upsell, referral, lifecycle emails
  PAYMENT_REMINDER:      'claude-sonnet-4-6',  // Payment reminder emails
  WEBSITE_CONTENT:       'claude-sonnet-4-6',  // Website copy/content JSON
  WEBSITE_BUILD:         'claude-sonnet-4-6',  // Full HTML website generation
  SERVICE_BUILD:         'claude-sonnet-4-6',  // Service deliverable HTML builds
  SERVICE_CONTENT:       'claude-sonnet-4-6',  // Service deliverable content (blogs, ads, etc.)
  PROPOSAL:              'claude-sonnet-4-6',  // Client proposal HTML
  CONTRACT:              'claude-sonnet-4-6',  // Service contract HTML
  CASE_STUDY:            'claude-sonnet-4-6',  // Case study generation
  MONTHLY_REPORT:        'claude-sonnet-4-6',  // Client monthly reports
  DELIVERY_EMAIL:        'claude-sonnet-4-6',  // Delivery notification email
  CLIENT_TODO:           'claude-sonnet-4-6',  // Client activation steps
  CHAT_RESPONSE:         'claude-sonnet-4-6',  // Project chat AI response
  ADMIN_SEARCH:          'claude-sonnet-4-6',  // Admin web search (needs quality)
};

// Helper: get model for a task, with fallback to Sonnet
function getModel(task, opts) {
  // Force Sonnet for all marketing_agency niche outreach (highest-stakes founder acquisition)
  if (opts && opts.niche && /marketing|marketingbureau|reclamebureau/i.test(opts.niche)) {
    return MODELS.SONNET;
  }
  return MODELS[task] || MODELS.SONNET;
}

// Helper: get pricing for a model
function getPricing(modelId) {
  return MODELS.PRICING[modelId] || MODELS.PRICING[MODELS.SONNET];
}

// Helper: calculate cost in USD for a given model
function calcCost(modelId, tokensIn, tokensOut) {
  const p = getPricing(modelId);
  return (tokensIn / 1e6) * p.input + (tokensOut / 1e6) * p.output;
}

module.exports = { MODELS, getModel, getPricing, calcCost };
