/**
 * lib/email.js — Email helper functions
 *
 * EXTRACTION STATUS: Not yet extracted.
 *
 * sendEmail, buildEmailHTML, buildDeliveryEmailHTML, generateClientEmail,
 * generateInvoiceNumber, and sanitizeSubject all live in server.js.
 *
 * Extraction is blocked because sendEmail depends on:
 *   - wsReadWs() for workspace-scoped settings and lead lookup
 *   - BASE_URL (global constant)
 *   - addActivity() for audit trail
 *   - buildEmailHTML() and sanitizeSubject() (co-located helpers)
 *   - process.env for RESEND_API_KEY, GMAIL_USER fallbacks
 *
 * A clean extraction would require either:
 *   (a) A dependency injection pattern (pass context object), or
 *   (b) Moving all email-related state into a class/module that
 *       receives its dependencies at init time
 *
 * Both approaches are non-trivial refactors that risk breaking the
 * 54+ sendEmail call sites across server.js and route files.
 * Recommended as a dedicated future session.
 */

module.exports = {};
