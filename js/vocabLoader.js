(function (global) {
  'use strict';

  const TERM_RE = /^[A-Za-z]+(?:[\s-][A-Za-z]+)*$/;
  const MAX_TERM_LENGTH = 20;

  const ID_VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);
  const ID_DIPHTHONGS = new Set(['ai', 'au', 'oi', 'ei']);
  const ID_DIGRAPHS = new Set(['ng', 'ny', 'kh', 'sy']);
  const ID_LIQUID_ONSETS = new Set([
    'bl', 'br', 'dr', 'fl', 'fr', 'gl', 'gr', 'kl', 'kr', 'pl', 'pr', 'tr',
  ]);

  const EN_VOWEL_CHARS = new Set(['a', 'e', 'i', 'o', 'u', 'y']);
  const EN_VOWEL_TEAMS = new Set([
    'ai', 'ay', 'au', 'aw', 'ea', 'ee', 'ei', 'ey', 'eu',
    'ie', 'oa', 'oe', 'oi', 'oo', 'ou', 'ow', 'oy', 'ue', 'ui',
  ]);
  const EN_DIGRAPHS = new Set(['ch', 'sh', 'th', 'ph', 'wh', 'gh', 'ck', 'ng', 'qu']);
  const EN_ONSET_CLUSTERS = new Set([
    'bl', 'br', 'cl', 'cr', 'dr', 'fl', 'fr', 'gl', 'gr',
    'pl', 'pr', 'sc', 'sk', 'sl', 'sm', 'sn', 'sp', 'st',
    'sw', 'tr', 'tw', 'wr', 'ch', 'sh', 'th', 'ph', 'wh', 'qu',
  ]);

  const EASINESS_RANGES = {
    'id-to-en': {
      easy: { min: 1, max: 7, label: '1 – 7 chars' },
      medium: { min: 8, max: 12, label: '8 – 12 chars' },
      hard: { min: 13, max: MAX_TERM_LENGTH, label: '13 – 20 chars' },
      all: { min: 1, max: MAX_TERM_LENGTH, label: 'All lengths' },
    },
    'en-to-id': {
      easy: { min: 1, max: 7, label: '1 – 7 chars' },
      medium: { min: 8, max: 12, label: '8 – 12 chars' },
      hard: { min: 13, max: MAX_TERM_LENGTH, label: '13 – 20 chars' },
      all: { min: 1, max: MAX_TERM_LENGTH, label: 'All lengths' },
    },
  };

  /**
   * RFC 4180 compliant CSV parser (handles quoted fields, escaped quotes, embedded commas, CRLF/LF).
   */
  function parseCSV(text) {
    const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < clean.length; i++) {
      const ch = clean[i];

      if (inQuotes) {
        if (ch === '"') {
          if (clean[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field);
        field = '';
      } else if (ch === '\r') {
        if (clean[i + 1] === '\n') i++;
        row.push(field);
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
        field = '';
      } else if (ch === '\n') {
        row.push(field);
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
        field = '';
      } else {
        field += ch;
      }
    }

    if (field.length > 0 || row.length > 0) {
      row.push(field);
      rows.push(row);
    }

    return rows;
  }

  /**
   * Extract clean candidate terms from a semicolon-separated glossary cell.
   */
  function extractCleanTerms(rawCell) {
    if (!rawCell) return [];
    const parts = rawCell.split(';');
    const clean = [];
    for (let i = 0; i < parts.length; i++) {
      const candidate = parts[i].trim().replace(/\s+/g, ' ');
      if (candidate.length > 0 && candidate.length <= MAX_TERM_LENGTH && TERM_RE.test(candidate)) {
        clean.push(candidate);
      }
    }
    return clean;
  }

  /**
   * Tokenise a single Indonesian word into phonetic consonant/vowel units (EYD / PUEBI).
   */
  function tokeniseIndonesianWord(word) {
    const tokens = [];
    const lower = word.toLowerCase();
    let i = 0;

    while (i < word.length) {
      const pair = lower.slice(i, i + 2);

      // Digraph consonants: ng, ny, kh, sy
      if (ID_DIGRAPHS.has(pair)) {
        tokens.push({ text: word.slice(i, i + 2), type: 'C' });
        i += 2;
        continue;
      }

      // Diphthongs (ai, au, oi, ei): keep together at word end or before CV
      // Split hiatus pairs before a word-final consonant (e.g. ba-ik, da-un, la-ut, ma-in)
      if (ID_DIPHTHONGS.has(pair)) {
        const after = lower.slice(i + 2);
        const isAtEnd = after.length === 0;
        const followedByCV =
          after.length >= 2 && !ID_VOWELS.has(after[0]) && ID_VOWELS.has(after[1]);
        const followedByDigraphV =
          after.length >= 3 && ID_DIGRAPHS.has(after.slice(0, 2)) && ID_VOWELS.has(after[2]);

        if (isAtEnd || followedByCV || followedByDigraphV) {
          tokens.push({ text: word.slice(i, i + 2), type: 'V' });
          i += 2;
          continue;
        }
      }

      const ch = lower[i];
      tokens.push({
        text: word[i],
        type: ID_VOWELS.has(ch) ? 'V' : 'C',
      });
      i += 1;
    }

    return tokens;
  }

  /**
   * Syllabify a single Indonesian word using PUEBI / EYD rules.
   */
  function syllabifyIndonesianSingleWord(word) {
    if (!word || word.length <= 2) return [word];

    const tokens = tokeniseIndonesianWord(word);
    const vowelIndices = [];
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type === 'V') vowelIndices.push(i);
    }

    if (vowelIndices.length <= 1) return [word];

    const boundaries = new Set();
    for (let k = 0; k < vowelIndices.length - 1; k++) {
      const v1 = vowelIndices[k];
      const v2 = vowelIndices[k + 1];
      const consonantsBetween = v2 - v1 - 1;

      if (consonantsBetween === 0) {
        // V | V (hiatus, e.g. sa-at, bu-ah, ma-in)
        boundaries.add(v2);
      } else if (consonantsBetween === 1) {
        // V | C V (e.g. ba-pak, a-car, ba-ngun)
        boundaries.add(v1 + 1);
      } else if (
        consonantsBetween === 2 &&
        ID_LIQUID_ONSETS.has(
          (tokens[v1 + 1].text + tokens[v1 + 2].text).toLowerCase()
        )
      ) {
        // Keep Indonesian liquid onset clusters intact (e.g. ke-pri-ba-di-an, pu-tra)
        boundaries.add(v1 + 1);
      } else {
        // V C | C V (2 consonants) or V C | C C V (3+ consonants, e.g. in-stru-men, ul-tra)
        boundaries.add(v1 + 2);
      }
    }

    const syllables = [];
    let current = '';
    for (let i = 0; i < tokens.length; i++) {
      if (boundaries.has(i) && current.length > 0) {
        syllables.push(current);
        current = '';
      }
      current += tokens[i].text;
    }
    if (current.length > 0) {
      syllables.push(current);
    }
    return syllables;
  }

  /**
   * Segment an Indonesian word or phrase into syllable descriptors.
   */
  function segmentIndonesianSyllables(phrase) {
    const words = phrase.split(/[\s-]+/).filter(Boolean);
    const result = [];
    words.forEach((w, wordIndex) => {
      const syls = syllabifyIndonesianSingleWord(w);
      syls.forEach((s) => {
        result.push({ text: s, wordIndex });
      });
    });
    return result;
  }

  /**
   * Determine whether character at index i in an English word acts as a vowel.
   */
  function isEnglishVowelAt(lower, i) {
    const ch = lower[i];
    if (ch === 'y') {
      // 'y' at start before a vowel is a consonant (e.g. yellow, yard); otherwise vowel
      return !(i === 0 && i + 1 < lower.length && EN_VOWEL_CHARS.has(lower[i + 1]) && lower[i + 1] !== 'y');
    }
    return EN_VOWEL_CHARS.has(ch);
  }

  /**
   * Syllabify a single English word using orthographic vowel-nucleus + onset-cluster heuristics.
   */
  function syllabifyEnglishSingleWord(word) {
    if (!word || word.length <= 3) return [word];

    const lower = word.toLowerCase();
    const len = lower.length;

    // Identify vowel nucleus spans [start, end)
    const nuclei = [];
    let i = 0;
    while (i < len) {
      // Handle 'qu' as consonant cluster so 'u' is not counted as its own nucleus before a vowel
      if (lower[i] === 'q' && lower[i + 1] === 'u' && i + 2 < len && isEnglishVowelAt(lower, i + 2)) {
        i += 2;
        continue;
      }
      if (isEnglishVowelAt(lower, i)) {
        const start = i;
        if (i + 1 < len && EN_VOWEL_TEAMS.has(lower.slice(i, i + 2))) {
          i += 2;
        } else {
          i += 1;
        }
        nuclei.push({ start, end: i });
      } else {
        i += 1;
      }
    }

    // Handle silent trailing 'e' (unless word ends in consonant + 'le', e.g. ta-ble, ap-ple)
    if (nuclei.length > 1) {
      const last = nuclei[nuclei.length - 1];
      if (last.start === len - 1 && lower[len - 1] === 'e') {
        const isConsonantLe =
          len >= 3 && lower[len - 2] === 'l' && !isEnglishVowelAt(lower, len - 3);
        if (!isConsonantLe) {
          nuclei.pop();
        }
      } else if (
        last.start === len - 2 &&
        lower.slice(len - 2) === 'es' &&
        len >= 4 &&
        !'sxz'.includes(lower[len - 3]) &&
        !['ch', 'sh'].includes(lower.slice(len - 4, len - 2))
      ) {
        nuclei.pop();
      } else if (
        last.start === len - 2 &&
        lower.slice(len - 2) === 'ed' &&
        len >= 4 &&
        lower[len - 3] !== 't' &&
        lower[len - 3] !== 'd' &&
        !(lower[len - 3] === 'l' && !isEnglishVowelAt(lower, len - 4))
      ) {
        nuclei.pop();
      }
    }

    if (nuclei.length <= 1) return [word];

    const boundaries = [];
    for (let k = 0; k < nuclei.length - 1; k++) {
      const cStart = nuclei[k].end;
      const cEnd = nuclei[k + 1].start;
      const cLen = cEnd - cStart;
      const cluster = lower.slice(cStart, cEnd);

      // Consonant + 'le' at word end (e.g. ta-ble, ap-ple)
      if (
        k === nuclei.length - 2 &&
        nuclei[k + 1].start === len - 1 &&
        lower.slice(len - 2) === 'le' &&
        cLen >= 2
      ) {
        boundaries.push(cEnd - 2);
        continue;
      }

      if (cLen === 0) {
        boundaries.push(cEnd);
      } else if (cLen === 1) {
        boundaries.push(cStart);
      } else if (cLen === 2) {
        if (EN_DIGRAPHS.has(cluster) || EN_ONSET_CLUSTERS.has(cluster)) {
          boundaries.push(cStart);
        } else {
          boundaries.push(cStart + 1);
        }
      } else {
        // 3+ consonants: avoid splitting digraphs on the left; keep valid 2-char onset on the right
        const leftTwo = lower.slice(cStart, cStart + 2);
        const rightTwo = lower.slice(cEnd - 2, cEnd);
        if (EN_DIGRAPHS.has(leftTwo)) {
          boundaries.push(cStart + 2);
        } else if (EN_ONSET_CLUSTERS.has(rightTwo) || EN_DIGRAPHS.has(rightTwo)) {
          boundaries.push(cEnd - 2);
        } else {
          boundaries.push(cStart + 1);
        }
      }
    }

    const syllables = [];
    let prev = 0;
    for (let b = 0; b < boundaries.length; b++) {
      const pos = boundaries[b];
      if (pos > prev && pos < len) {
        syllables.push(word.slice(prev, pos));
        prev = pos;
      }
    }
    if (prev < len) {
      syllables.push(word.slice(prev));
    }

    return syllables.length > 0 ? syllables : [word];
  }

  /**
   * Segment an English word or phrase into syllable descriptors.
   */
  function segmentEnglishSyllables(phrase) {
    const words = phrase.split(/[\s-]+/).filter(Boolean);
    const result = [];
    words.forEach((w, wordIndex) => {
      const syls = syllabifyEnglishSingleWord(w);
      syls.forEach((s) => {
        result.push({ text: s, wordIndex });
      });
    });
    return result;
  }

  function formatSyllableBreakdown(syllables) {
    if (!syllables || syllables.length === 0) return '';
    let out = '';
    for (let i = 0; i < syllables.length; i++) {
      if (i > 0) {
        out += syllables[i].wordIndex !== syllables[i - 1].wordIndex ? '  /  ' : ' · ';
      }
      out += syllables[i].text;
    }
    return out;
  }

  function buildBlocks(term) {
    return Array.from(term).map((ch) => ({
      text: ch,
      isSpace: ch === ' ',
      isHyphen: ch === '-',
    }));
  }

  /**
   * Lazily compute blocks and Indonesian + English syllables for a vocabulary item.
   */
  function enrichVocabItem(item) {
    if (item._enriched) return item;

    item.idBlocks = buildBlocks(item.indonesian);
    item.enBlocks = buildBlocks(item.english);
    item.idSyllables = segmentIndonesianSyllables(item.indonesian);
    item.enSyllables = segmentEnglishSyllables(item.english);
    item.idSyllableBreakdown = formatSyllableBreakdown(item.idSyllables);
    item.enSyllableBreakdown = formatSyllableBreakdown(item.enSyllables);
    item.idLetterBreakdown = item.idBlocks
      .map((b) => (b.isSpace ? '␣' : b.text))
      .join(' · ');
    item.enLetterBreakdown = item.enBlocks
      .map((b) => (b.isSpace ? '␣' : b.text))
      .join(' · ');
    item._enriched = true;
    return item;
  }

  /**
   * Load and parse assets/data/glosarium_pasti.csv (columns: foreign, indonesian, field).
   * @param {string} csvPath
   * @returns {Promise<{items: Array<object>, fields: Array<{name: string, count: number}>, totalRows: number, skippedRows: number}>}
   */
  async function loadDataset(csvPath) {
    const resp = await fetch(csvPath);
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }
    const text = await resp.text();
    const rows = parseCSV(text);
    if (rows.length < 2) {
      throw new Error('CSV dataset is empty');
    }

    const header = rows[0].map((h) => h.trim().toLowerCase());
    const idxForeign = header.indexOf('foreign');
    const idxIndonesian = header.indexOf('indonesian');
    const idxField = header.indexOf('field');
    if (idxForeign === -1 || idxIndonesian === -1 || idxField === -1) {
      throw new Error('Expected columns: foreign, indonesian, field');
    }

    const items = [];
    const seen = new Set();
    const fieldCounts = new Map();
    let skippedRows = 0;

    for (let r = 1; r < rows.length; r++) {
      const cols = rows[r];
      const rawForeign = (cols[idxForeign] || '').trim().normalize('NFC');
      const rawIndonesian = (cols[idxIndonesian] || '').trim().normalize('NFC');
      const field = (cols[idxField] || '').trim().normalize('NFC') || 'Umum';

      const enTerms = extractCleanTerms(rawForeign);
      const idTerms = extractCleanTerms(rawIndonesian);

      if (enTerms.length === 0 || idTerms.length === 0) {
        skippedRows += 1;
        continue;
      }

      const english = enTerms[0];
      const indonesian = idTerms[0];
      const dedupKey = `${indonesian.toLowerCase()}|${english.toLowerCase()}|${field}`;

      if (seen.has(dedupKey)) {
        skippedRows += 1;
        continue;
      }
      seen.add(dedupKey);

      fieldCounts.set(field, (fieldCounts.get(field) || 0) + 1);

      items.push({
        indonesian,
        english,
        field,
        idLen: indonesian.length,
        enLen: english.length,
        idAccepted: idTerms.map((t) => normalizeInput(t)),
        enAccepted: enTerms.map((t) => normalizeInput(t)),
      });
    }

    const fields = Array.from(fieldCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, 'id'));

    return {
      items,
      fields,
      totalRows: rows.length - 1,
      skippedRows,
    };
  }

  function getEasinessRanges(practiceMode) {
    return EASINESS_RANGES[practiceMode] || EASINESS_RANGES['id-to-en'];
  }

  /**
   * Filter vocabulary entries by selected fields and easiness (character count).
   */
  function filterWords(items, config) {
    const practiceMode = config.practiceMode || 'id-to-en';
    const ranges = getEasinessRanges(practiceMode);
    const range = ranges[config.easiness] || ranges.easy;
    const fieldSet =
      config.selectedFields && config.selectedFields.size > 0
        ? config.selectedFields
        : null;

    const out = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (fieldSet && !fieldSet.has(item.field)) continue;

      const len = practiceMode === 'en-to-id' ? item.enLen : item.idLen;
      if (len < range.min || len > range.max) continue;

      out.push(item);
    }
    return out;
  }

  /**
   * Randomly sample up to `count` unique entries using partial Fisher-Yates shuffle
   * and lazily enrich the sampled entries with blocks & syllables.
   */
  function sampleWords(pool, count) {
    const n = pool.length;
    const take = Math.min(count, n);
    if (take <= 0) return [];

    // Partial Fisher-Yates (O(take) swaps instead of shuffling 120k items)
    const copy = pool.slice();
    const result = [];
    for (let i = 0; i < take; i++) {
      const j = i + Math.floor(Math.random() * (n - i));
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
      result.push(enrichVocabItem(copy[i]));
    }
    return result;
  }

  /**
   * Canonicalise Bahasa Indonesia / English input for reliable typing comparison.
   */
  function normalizeInput(str) {
    return (str || '')
      .normalize('NFC')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  global.IndoVocabLoader = {
    EASINESS_RANGES,
    getEasinessRanges,
    loadDataset,
    filterWords,
    sampleWords,
    enrichVocabItem,
    segmentIndonesianSyllables,
    segmentEnglishSyllables,
    normalizeInput,
  };
})(window);
