// yamlHelper.js – safe YAML manipulation using js-yaml
// -------------------------------------------------------------
// Provides two helpers:
//   1. readYaml(filePath) → returns parsed YAML object (or null on error)
//   2. writeLlmConfig(filePath, defaultModel, providerDetails)
//      – reads existing config.yaml, replaces or inserts the `llm` block
//        in a robust way using js-yaml, then writes the file back.
// -------------------------------------------------------------

const fs = require('fs');
const yaml = require('js-yaml');

/**
 * Load a YAML file safely.
 * @param {string} filePath Absolute path to the yaml file.
 * @returns {object|null} Parsed object or null if the file cannot be parsed.
 */
function readYaml(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return yaml.load(raw);
  } catch (e) {
    console.error(`[yamlHelper] Failed to read YAML at ${filePath}:`, e);
    return null;
  }
}

/**
 * Write or update the `llm` block inside an existing config.yaml.
 * Preserves any other sections untouched.
 * @param {string} filePath Absolute path to config.yaml.
 * @param {string} defaultModel Full model reference e.g. "ollama:qwen2.5:0.5b"
 * @param {string} providerDetails YAML‑formatted indented block for providers.
 * @returns {boolean} true on success, false otherwise.
 */
function writeLlmConfig(filePath, defaultModel, providerDetails) {
  try {
    // Load existing content (if any) as raw text to preserve comments where possible.
    const original = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
    // Parse to an object for safe manipulation.
    const doc = yaml.load(original) || {};
    // Ensure `llm` exists and set fields.
    doc.llm = {
      default: defaultModel,
      providers: yaml.load(providerDetails),
      tiers: {}
    };
    // Dump back with 2‑space indentation – comments may be lost but structure remains safe.
    const newYaml = yaml.dump(doc, { indent: 2, noCompatMode: true });
    fs.writeFileSync(filePath, newYaml, 'utf8');
    return true;
  } catch (e) {
    console.error(`[yamlHelper] Failed to write LLM config at ${filePath}:`, e);
    return false;
  }
}

module.exports = { readYaml, writeLlmConfig };
