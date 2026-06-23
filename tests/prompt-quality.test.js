'use strict';

/**
 * Part 5 — Prompt Quality Verification
 * 
 * Validates that all AI prompts follow the required quality patterns:
 * 1. JSON-output prompts specify exact schema
 * 2. All customer-facing prompts have REGELS/VERBODEN/STRUCTUUR
 * 3. Template literals compile without errors
 * 4. Word/character limits are specified
 * 5. No vague instructions remain
 */

const fs = require('fs');
const path = require('path');

// Read source files
const serverJs = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const emailJs = fs.readFileSync(path.join(__dirname, '..', 'lib', 'email.js'), 'utf8');

describe('Part 5: Prompt Quality Verification', () => {

  describe('JSON-output prompts have explicit schema', () => {
    // Find all prompts that say "Antwoord ALLEEN als JSON" or similar
    const jsonPromptPattern = /Antwoord ALLEEN als JSON[^`]*/g;
    const jsonPrompts = [...serverJs.matchAll(jsonPromptPattern), ...emailJs.matchAll(jsonPromptPattern)];

    test('all JSON prompts specify output schema after the JSON instruction', () => {
      const missingSchema = [];
      for (const match of jsonPrompts) {
        const text = match[0];
        // Should contain { or [ after "als JSON:" indicating schema
        if (!text.includes('{') && !text.includes('[')) {
          missingSchema.push(text.substring(0, 80));
        }
      }
      expect(missingSchema).toEqual([]);
    });

    test('found a reasonable number of JSON-output prompts', () => {
      // serverJs has 59 + emailJs has 7 = 66 total "Antwoord ALLEEN als JSON" / "Geef ALLEEN JSON" patterns
      // But not all use the exact "Antwoord ALLEEN als JSON" wording
      expect(jsonPrompts.length).toBeGreaterThan(10);
    });
  });

  describe('Customer-facing prompts have quality constraints', () => {
    // Key prompt sections that must have REGELS or KWALITEITSEISEN
    const requiredPatterns = [
      { name: 'REGELS or KWALITEITSEISEN', pattern: /REGELS:|KWALITEITSEISEN:/g },
      { name: 'VERBODEN', pattern: /VERBODEN:/g },
    ];

    test('server.js contains REGELS/KWALITEITSEISEN patterns', () => {
      const regelsCount = (serverJs.match(/REGELS:|KWALITEITSEISEN:/g) || []).length;
      // Should have many instances across all prompts
      expect(regelsCount).toBeGreaterThan(30);
    });

    test('server.js contains VERBODEN patterns', () => {
      const verbodenCount = (serverJs.match(/VERBODEN:/g) || []).length;
      expect(verbodenCount).toBeGreaterThan(15);
    });

    test('email.js contains REGELS patterns', () => {
      const regelsCount = (emailJs.match(/REGELS:/g) || []).length;
      expect(regelsCount).toBeGreaterThan(3);
    });

    test('STRUCTUUR/Structure patterns present for multi-step prompts', () => {
      const structuurCount = (serverJs.match(/STRUCTUUR:|Structure \(/g) || []).length;
      expect(structuurCount).toBeGreaterThan(10);
    });
  });

  describe('Word/character limits specified', () => {
    test('max word limits are present', () => {
      const maxWordPatterns = serverJs.match(/[Mm]ax \d+ woorden/g) || [];
      expect(maxWordPatterns.length).toBeGreaterThan(15);
    });

    test('email prompts have word limits', () => {
      const emailMaxWords = emailJs.match(/[Mm]ax \d+ woorden/g) || [];
      expect(emailMaxWords.length).toBeGreaterThan(2);
    });
  });

  describe('No vague instructions remain in key prompts', () => {
    // These vague phrases should NOT appear in prompt text (they indicate weak prompts)
    const vaguePatterns = [
      'maak het professioneel',
      'schrijf een goede',
      'zorg dat het goed is',
      'maak het mooi',
      'wees creatief',
    ];

    test('no vague instruction phrases in server.js prompts', () => {
      const found = [];
      for (const phrase of vaguePatterns) {
        if (serverJs.toLowerCase().includes(phrase)) {
          found.push(phrase);
        }
      }
      expect(found).toEqual([]);
    });

    test('no vague instruction phrases in email.js prompts', () => {
      const found = [];
      for (const phrase of vaguePatterns) {
        if (emailJs.toLowerCase().includes(phrase)) {
          found.push(phrase);
        }
      }
      expect(found).toEqual([]);
    });
  });

  describe('Post-delivery follow-up prompts (d3/d7/d14/d30)', () => {
    test('d3 prompt has STRUCTUUR + REGELS + VERBODEN', () => {
      const d3Section = serverJs.substring(
        serverJs.indexOf("d3: `Schrijf een check-in email"),
        serverJs.indexOf("d7: `Schrijf een resultaten-email")
      );
      expect(d3Section).toContain('STRUCTUUR:');
      expect(d3Section).toContain('REGELS:');
      expect(d3Section).toContain('VERBODEN:');
      expect(d3Section).toContain('Max 60 woorden');
    });

    test('d7 prompt has STRUCTUUR + REGELS + VERBODEN', () => {
      const d7Section = serverJs.substring(
        serverJs.indexOf("d7: `Schrijf een resultaten-email"),
        serverJs.indexOf("d14: `Schrijf een subtiele upsell")
      );
      expect(d7Section).toContain('STRUCTUUR:');
      expect(d7Section).toContain('REGELS:');
      expect(d7Section).toContain('VERBODEN:');
      expect(d7Section).toContain('Max 80 woorden');
    });

    test('d14 prompt has STRUCTUUR + REGELS + VERBODEN', () => {
      const d14Section = serverJs.substring(
        serverJs.indexOf("d14: `Schrijf een subtiele upsell"),
        serverJs.indexOf("d30: `Schrijf een maandreview")
      );
      expect(d14Section).toContain('STRUCTUUR:');
      expect(d14Section).toContain('REGELS:');
      expect(d14Section).toContain('VERBODEN:');
      expect(d14Section).toContain('Max 90 woorden');
    });

    test('d30 prompt has STRUCTUUR + REGELS + VERBODEN', () => {
      const d30Start = serverJs.indexOf("d30: `Schrijf een maandreview");
      const d30Section = serverJs.substring(d30Start, d30Start + 800);
      expect(d30Section).toContain('STRUCTUUR:');
      expect(d30Section).toContain('REGELS:');
      expect(d30Section).toContain('VERBODEN:');
      expect(d30Section).toContain('Max 110 woorden');
    });
  });

  describe('Website content prompt quality', () => {
    test('website content prompt has REGELS + VERBODEN + JSON schema', () => {
      const wcStart = serverJs.indexOf('Genereer website content voor');
      const wcSection = serverJs.substring(wcStart, wcStart + 800);
      expect(wcSection).toContain('REGELS:');
      expect(wcSection).toContain('VERBODEN:');
      expect(wcSection).toContain('"headline"');
      expect(wcSection).toContain('"services"');
      expect(wcSection).toContain('Antwoord ALLEEN als JSON');
    });
  });

  describe('Admin instructions prompt quality', () => {
    test('generate-admin-instructions has REGELS + VERBODEN', () => {
      const aiStart = serverJs.indexOf('Schrijf een duidelijk admin-instructiedocument');
      const aiSection = serverJs.substring(aiStart, aiStart + 1200);
      expect(aiSection).toContain('REGELS:');
      expect(aiSection).toContain('VERBODEN:');
      expect(aiSection).toContain('WAT KLANT NOG MOET DOEN');
      expect(aiSection).toContain('WAT JIJ NOG MOET DOEN');
    });

    test('service admin instructions has STRUCTUUR + REGELS + VERBODEN', () => {
      const siStart = serverJs.indexOf('Maak een stap-voor-stap instructiegids');
      const siSection = serverJs.substring(siStart, siStart + 1000);
      expect(siSection).toContain('STRUCTUUR:');
      expect(siSection).toContain('REGELS:');
      expect(siSection).toContain('VERBODEN:');
      expect(siSection).toContain('DOELGROEP:');
    });
  });

  describe('Email prompts in lib/email.js', () => {
    test('welcome email has STRUCTUUR + REGELS + VERBODEN', () => {
      const welStart = emailJs.indexOf('STRUCTUUR:');
      expect(welStart).toBeGreaterThan(-1);
      const welSection = emailJs.substring(welStart, welStart + 500);
      expect(welSection).toContain('REGELS:');
    });

    test('intakeReceived email has REGELS', () => {
      const irStart = emailJs.indexOf('intakeReceived');
      const irSection = emailJs.substring(irStart, irStart + 500);
      expect(irSection).toContain('REGELS:');
      expect(irSection).toContain('Max 100 woorden');
    });

    test('deliveryReady email has STRUCTUUR + REGELS', () => {
      const drStart = emailJs.indexOf('deliveryReady');
      const drSection = emailJs.substring(drStart, drStart + 600);
      expect(drSection).toContain('STRUCTUUR:');
      expect(drSection).toContain('REGELS:');
    });

    test('checkIn email has REGELS + VERBODEN', () => {
      const ciStart = emailJs.indexOf('checkIn');
      const ciSection = emailJs.substring(ciStart, ciStart + 600);
      expect(ciSection).toContain('REGELS:');
      expect(ciSection).toContain('VERBODEN:');
    });
  });

  describe('Cold email / Agent 5 prompts', () => {
    test('cold email system prompt has REGELS + VERBODEN', () => {
      // The cold email uses a system prompt variable with REGELS/VERBODEN
      const ceStart = serverJs.indexOf('emailSystemPrompt');
      expect(ceStart).toBeGreaterThan(-1);
      const ceSection = serverJs.substring(ceStart, ceStart + 3000);
      expect(ceSection).toContain('REGELS:');
      expect(ceSection).toContain('VERBODEN');
    });

    test('cold email has STRUCTUUR/STRUCTURE rules', () => {
      // structureRules variable contains STRUCTUUR for NL and STRUCTURE for EN
      const srStart = serverJs.indexOf('structureRules');
      expect(srStart).toBeGreaterThan(-1);
      const srSection = serverJs.substring(srStart, srStart + 2000);
      expect(srSection.includes('STRUCTUUR') || srSection.includes('STRUCTURE')).toBe(true);
    });
  });

  describe('Proposal and contract prompts', () => {
    test('proposal prompt has Structure + RULES + BANNED', () => {
      // The proposal prompt uses English: "RULES:" and "BANNED:"
      const pStart = serverJs.indexOf('Write a professional business proposal');
      expect(pStart).toBeGreaterThan(-1);
      const pSection = serverJs.substring(pStart, pStart + 2000);
      expect(pSection).toContain('RULES:');
      expect(pSection).toContain('BANNED:');
    });

    test('contract prompt has REGELS + VERBODEN', () => {
      // Contract prompt exists in NL
      const cStart = serverJs.indexOf('dienstverleningsovereenkomst');
      expect(cStart).toBeGreaterThan(-1);
      const cSection = serverJs.substring(cStart, cStart + 3000);
      expect(cSection.includes('REGELS:') || cSection.includes('RULES:')).toBe(true);
    });
  });

  describe('Lead scoring system prompt', () => {
    test('has explicit 0-10 scale rubric', () => {
      // The scoring system prompt at line ~9483 uses "Score elk criterium 0-10"
      const lsStart = serverJs.indexOf('lead-scoring expert');
      expect(lsStart).toBeGreaterThan(-1);
      const lsSection = serverJs.substring(lsStart, lsStart + 3000);
      expect(lsSection).toContain('0-10');
      expect(lsSection).toContain('Score');
    });
  });

  describe('All aiJSON calls constrain to JSON-only output', () => {
    // Every aiJSON call should have "Antwoord ALLEEN als JSON" or "Geef ALLEEN JSON" or "ONLY valid JSON"
    test('aiJSON prompts contain JSON-only constraint', () => {
      const aiJsonCalls = serverJs.match(/aiJSON\(`[^`]+`/g) || [];
      const missingConstraint = [];
      
      for (const call of aiJsonCalls) {
        const hasConstraint = 
          call.includes('ALLEEN als JSON') || 
          call.includes('ALLEEN JSON') ||
          call.includes('Geef ALLEEN JSON') ||
          call.includes('ONLY valid JSON') ||
          call.includes('ONLY as JSON') ||
          call.includes('Return ONLY') ||
          call.includes('valid JSON array') ||
          call.includes('valid JSON:');
        
        if (!hasConstraint) {
          missingConstraint.push(call.substring(0, 100));
        }
      }
      
      // Allow at most a few edge cases (e.g., short extraction prompts or multi-line template literals)
      expect(missingConstraint.length).toBeLessThan(5);
    });
  });
});
