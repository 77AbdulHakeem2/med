function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sanitizeCandidate(raw, doctor, subject, part) {
  let t = (raw || '').replace(/_/g, ' ').trim();

  // 0. Strip file extension immediately
  t = t.replace(/\.[a-zA-Z0-9]{1,6}$/i, '').trim();

  // 1. Remove Doctor
  if (doctor && doctor.trim()) {
    const doc = doctor.trim();
    t = t.replace(new RegExp('(?:دكتور|د\\.?|د\\/|Dr\\.?|Prof\\.?)[\\s._/\\:–-]*' + escapeRegex(doc), 'gi'), '');
    t = t.replace(new RegExp('\\b' + escapeRegex(doc) + '\\b', 'gi'), '');
  }
  t = t.replace(/(?:دكتور|د\.?|د\/|Dr\.?|Prof\.?)[\s._/\\:–-]+[A-Za-z\u0600-\u06FF\s]{2,30}$/gi, '');

  // 2. Remove Subject prefix markers
  t = t.replace(/(?:مادة|كورس|course|subject)[\s:_-]+/gi, '');

  // 3. Remove Part safely
  if (part !== undefined && part !== null && String(part).trim()) {
    t = t.replace(new RegExp('(?:\\b(?:part|pt|section|sec|episode|ep)\\b|جزء|الجزء|حلقة|الحلقة)[\\s.:_-]*' + escapeRegex(String(part).trim()), 'gi'), '');
  }
  t = t.replace(/(?:\b(?:part|pt|section|sec|episode|ep)\b|جزء|الجزء|حلقة|الحلقة)[\s.:_-]*[0-9]{1,3}/gi, '');
  t = t.replace(/\[\s*(?:part|pt|جزء|حلقة)?\s*[0-9]{1,3}\s*\]/gi, '');
  t = t.replace(/\(\s*(?:part|pt|جزء|حلقة)?\s*[0-9]{1,3}\s*\)/gi, '');

  // 4. Remove leading numbering or sequence delimiters (e.g. '11 ', '06. ')
  t = t.replace(/^[0-9]{1,3}[\s._\-–—:]+/, '');

  // 5. Remove common leading words
  t = t.replace(/^(?:شرح|محاضرة|درس|فيديو|تسجيل|موضوع|lecture|video|tutorial)[\s:_-]*/gi, '');

  // 6. Clean punctuation & brackets
  t = t
    .replace(/[\[\]()]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s:–—|\-]+/, '')
    .replace(/[\s:–—|\-]+$/, '')
    .trim();

  // 7. Strip any trailing .m or stray extension
  t = t.replace(/\s*\.m$/i, '').replace(/\s*\.[a-zA-Z0-9]{1,5}$/i, '').replace(/\.+$/, '').trim();

  return t;
}

const tests = [
  { raw: '11_Female_Reproductive_Cycles_Ovarian_and_Uterine_Dr_Ahmed_Farid.mp4', doc: 'Ahmed Farid', sub: 'Embryology', part: '' },
  { raw: '08 Muscles 4 Skeletal Muscle Action & Power Anatomy Intro .mp4', doc: '', sub: 'Anatomy', part: '' },
  { raw: '06. Chorion.mp4', doc: '', sub: 'Embryology', part: '' },
];

for (const test of tests) {
  console.log(test.raw, '===>', sanitizeCandidate(test.raw, test.doc, test.sub, test.part));
}
