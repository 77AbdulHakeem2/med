import { GoogleGenAI, Type } from '@google/genai';
import { AIRenamingConfig, AIRenamedItemResult } from '../src/types';
import { splitExtension } from './pipeline';

let aiClient: GoogleGenAI | null = null;
const aiCache = new Map<string, AIRenamedItemResult>();

// Gemini Model candidate list per gemini-api skill instructions
const GEMINI_MODELS = ['gemini-3.8-flash', 'gemini-flash-latest'];

// Rate limit and Quota cooldown management to prevent spamming Google GenAI when 429 occurs
let quotaCooldownUntil = 0;
let lastQuotaLogTime = 0;

export function getQuotaCooldownRemaining(): number {
  return Math.max(0, quotaCooldownUntil - Date.now());
}

export function isGeminiInCooldown(): boolean {
  return Date.now() < quotaCooldownUntil;
}

function getCacheKey(item: InputBatchItem, config: AIRenamingConfig): string {
  return `v2:::${item.originalFilename}:::${item.originalCaption || ''}:::${config.namingPattern || ''}:::${config.captionStyle || 'medpulse_box'}:::${config.customCaptionTemplate || ''}:::${config.customInstructions || ''}`;
}

export function clearAiCache() {
  aiCache.clear();
}

export function getCachedAiResult(item: InputBatchItem, config: AIRenamingConfig): AIRenamedItemResult | undefined {
  const key = getCacheKey(item, config);
  const cached = aiCache.get(key);
  if (cached) {
    return { ...cached, id: item.id };
  }
  return undefined;
}

export function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

export interface InputBatchItem {
  id: string;
  originalFilename: string;
  originalCaption?: string;
  duration?: number;
  sequenceNumber?: number;
  mimeType?: string;
  fileSize?: number;
}

export const MEDPULSE_LINK = 'https://t.me/addlist/Qr1Wx2nHR_MxZjM0';
export const MEDPULSE_ANCHOR = `<a href="${MEDPULSE_LINK}">MedPulse🫀</a>`;

/**
 * Sanitizes caption for Telegram HTML parse mode.
 * Telegram strictly requires that in HTML mode:
 * - Only <a>, <b>, <strong>, <i>, <em>, <u>, <ins>, <s>, <strike>, <del>, <code>, <pre>, <tg-spoiler> are allowed.
 * - Any stray '&' (such as in 'Artery & Vein') MUST be escaped to '&amp;' (unless already part of a valid HTML entity).
 * - Any stray '<' or '>' MUST be escaped to '&lt;' and '&gt;'.
 * - If maxLen is provided, cuts cleanly at natural word/newline boundary and balances ALL open tags so Telegram never rejects it.
 */
export function sanitizeTelegramCaptionHtml(caption: string, maxLen = 1024): string {
  if (!caption) return '';

  let sanitized = caption;

  // Extract and preserve allowed HTML tags with unique placeholders
  const allowedTagRegex = /<a\s+href="[^"]+">|<\/a>|<b>|<\/b>|<strong>|<\/strong>|<i>|<\/i>|<em>|<\/em>|<code>|<\/code>|<pre>|<\/pre>|<u>|<\/u>|<s>|<\/s>|<tg-spoiler>|<\/tg-spoiler>/gi;

  const tagTokens: string[] = [];
  sanitized = sanitized.replace(allowedTagRegex, (match) => {
    const token = `___TGTAG_${tagTokens.length}___`;
    tagTokens.push(match);
    return token;
  });

  // Escape '&' that is NOT already an entity
  sanitized = sanitized.replace(/&(?!(amp|lt|gt|quot|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;');

  // Escape any stray '<' and '>'
  sanitized = sanitized.replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Restore the preserved allowed tags
  tagTokens.forEach((originalTag, idx) => {
    sanitized = sanitized.replace(`___TGTAG_${idx}___`, originalTag);
  });

  // If maxLen is set and text exceeds it, cut cleanly at a word/newline boundary
  if (maxLen > 0 && sanitized.length > maxLen) {
    let cutPoint = maxLen - 6; // leave room for '...'
    const lastSpace = sanitized.lastIndexOf(' ', cutPoint);
    const lastNewline = sanitized.lastIndexOf('\n', cutPoint);
    const naturalBreak = Math.max(lastSpace, lastNewline);
    if (naturalBreak > maxLen - 120) {
      cutPoint = naturalBreak;
    }
    sanitized = sanitized.slice(0, cutPoint).trim() + '...';
  }

  // Ensure all opened tags are safely closed in reverse order
  const stack: string[] = [];
  const tagCheckRegex = /<(\/)?([a-z0-9\-]+)(?:\s+href="[^"]*")?>/gi;
  let match: RegExpExecArray | null;
  while ((match = tagCheckRegex.exec(sanitized)) !== null) {
    const isClose = !!match[1];
    const tagName = match[2].toLowerCase();
    if (isClose) {
      const idx = stack.lastIndexOf(tagName);
      if (idx !== -1) {
        stack.splice(idx, 1);
      }
    } else {
      stack.push(tagName);
    }
  }

  // Safely close unclosed tags in reverse order
  while (stack.length > 0) {
    const unclosed = stack.pop();
    sanitized += `</${unclosed}>`;
  }

  return sanitized;
}

/**
 * Ensures the link https://t.me/addlist/Qr1Wx2nHR_MxZjM0 is always planted
 * inside the word 'MedPulse🫀' as <a href="...">MedPulse🫀</a>.
 * Normalizes all variations, repairs malformed links, and handles unlinked text.
 */
export function ensureMedPulseLinkInCaption(caption: string, maxLen = 1024): string {
  if (!caption || !caption.trim()) {
    return MEDPULSE_ANCHOR;
  }

  let text = caption.trim();

  // 1. Normalize markdown links [MedPulse...](...) into the standard HTML anchor
  text = text.replace(/\[\s*MedPulse[🫀]?\s*\]\([^\)]+\)/gi, MEDPULSE_ANCHOR);

  // 2. Normalize existing <a> anchors containing MedPulse (with single or double quotes, or any link)
  text = text.replace(/<a\s+href=["'][^"']*["'][^>]*>\s*MedPulse[🫀]?\s*<\/a>/gi, MEDPULSE_ANCHOR);

  // 3. If standard anchor is already present, sanitize remaining text and return
  if (text.includes(MEDPULSE_ANCHOR)) {
    return sanitizeTelegramCaptionHtml(text, maxLen);
  }

  // 4. If caption has plain MedPulse🫀 or MedPulse 🫀 or MedPulse (not inside an <a> tag)
  if (/MedPulse\s*🫀?/i.test(text)) {
    text = text.replace(/MedPulse\s*🫀?/i, MEDPULSE_ANCHOR);
  } else {
    // 5. If MedPulse is missing entirely, prepend to the header
    text = `${MEDPULSE_ANCHOR} | ${text}`;
  }

  return sanitizeTelegramCaptionHtml(text, maxLen);
}

export interface CaptionPreset {
  id: string;
  name: string;
  badge: string;
  description: string;
  template: string;
}

export const CAPTION_PRESETS: CaptionPreset[] = [
  {
    id: 'medpulse_box',
    name: 'النمط الرسمي المعتمد (MedPulse Box)',
    badge: 'الافتراضي المعتمد 👑',
    description: 'إطار خطي فخم، اسم الدكتور بجانب MedPulse، الموضوع، ومعرف القناة بجانب الهاشتاق.',
    template: `━━━━━━━━━━━━━━━\n📕 Name :\n{medpulse_link} | {doctor}\n━━━━━━━━━━━━━━━\n📌 Topic\n{topic}\n━━━━━━━━━━━━━━━\n@MedPulseVIP | #{hashtag}`,
  },
  {
    id: 'academic_badges',
    name: 'النمط الأكاديمي الشامل (Academic Badges)',
    badge: 'منظم وتفصيلي 📚',
    description: 'توزيع منظم بأيقونات طبية وأكاديمية للمادة، المحاضر، المحاضرة ورقم الجزء.',
    template: `🩺 {medpulse_link}\n━━━━━━━━━━━━━━━━━━\n📚 المادة: {subject}\n👨‍⚕️ الدكتور: {doctor}\n📑 المحاضرة: {topic}\n🔢 الجزء: {part}\n━━━━━━━━━━━━━━━━━━\n📢 القناة: @MedPulseVIP\n#{hashtag}`,
  },
  {
    id: 'modern_minimal',
    name: 'النمط العصري الهادئ (Modern Minimal)',
    badge: 'هادئ وأنيق ✨',
    description: 'خطوط هادئة ونقاط ناعمة بدون حشو أو تكرار، ممتاز للقراءة السلسة والمظهر الاحترافي.',
    template: `{medpulse_link} | {subject}\n▪️ المحاضر: {doctor}\n▫️ الموضوع: {topic} {part}\n\n🔗 @MedPulseVIP • #{hashtag}`,
  },
  {
    id: 'compact_bullets',
    name: 'النمط الهندسي المركز (Compact Bullets)',
    badge: 'هندسي ومركّز ◈',
    description: 'نقاط هندسية واضحة ومباشرة مع خط فاصل رفيع.',
    template: `◈ {medpulse_link} ◈\n▸ الكورس: {subject}\n▸ الدكتور: {doctor}\n▸ العنوان: {topic} {part}\n⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\n@MedPulseVIP • #{hashtag}`,
  },
  {
    id: 'single_line_clean',
    name: 'النمط المختصر والسريع (Direct Short)',
    badge: 'موجز وسريع ⚡',
    description: 'صيغة سريعة وموجزة لتوفير المساحة في القنوات المزدحمة.',
    template: `{medpulse_link} • {subject}\n{doctor} — {topic} {part}\n@MedPulseVIP • #{hashtag}`,
  },
  {
    id: 'custom',
    name: 'قالب مخصص بالكامل (Custom Template)',
    badge: 'حرية كاملة ✏️',
    description: 'اكتب نمطك الخاص واستخدم المتغيرات الذكية: {subject}, {doctor}, {topic}, {part}, {filename}, {description}, #{hashtag}, {channel}, {medpulse_link}.',
    template: '',
  },
];

export interface FormattedCaptionInput {
  doctor?: string | null;
  subject?: string | null;
  topic?: string | null;
  part?: string | number | null;
  filename?: string | null;
  originalFilename?: string | null;
  originalCaption?: string | null;
  description?: string | null;
}

export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isValidPartNumber(part: string | number | undefined | null, originalText: string): boolean {
  if (part === undefined || part === null) return false;
  const pStr = String(part).trim();
  if (!pStr) return false;
  if (!originalText || !originalText.trim()) return false;

  // 1. Explicit Part markers (e.g. "Part 1", "pt 2", "جزء 3", "الحلقة 4", "[Part 1]", "(Part 2)")
  const legitPartRegex = new RegExp(
    `(?:\\b(?:part|pt|section|sec|episode|ep)\\b|جزء|الجزء|حلقة|الحلقة|السكشن|الدرس)[\\s.:_-]*${escapeRegex(pStr)}(?!\\d)|[\\[(](?:part|pt|جزء|حلقة)?\\s*${escapeRegex(pStr)}[\\])]`,
    'i'
  );
  if (legitPartRegex.test(originalText)) {
    return true;
  }

  // 2. Arabic ordinal words (e.g. "الجزء الرابع" -> 4)
  const arabicWordsForNum: Record<string, string[]> = {
    '1': ['الاول', 'الأول', 'الاولى', 'الأولى'],
    '2': ['الثاني', 'الثانية'],
    '3': ['الثالث', 'الثالثة'],
    '4': ['الرابع', 'الرابعة'],
    '5': ['الخامس', 'الخامسة'],
    '6': ['السادس', 'السادسة'],
    '7': ['السابع', 'السابعة'],
    '8': ['الثامن', 'الثامنة'],
    '9': ['التاسع', 'التاسعة'],
    '10': ['العاشر', 'العاشرة'],
  };
  if (arabicWordsForNum[pStr]) {
    for (const word of arabicWordsForNum[pStr]) {
      if (new RegExp(`(?:جزء|الجزء|حلقة|الحلقة)\\s+${word}`, 'i').test(originalText)) {
        return true;
      }
    }
  }

  return false;
}

export interface MedicalSubjectRule {
  subject: string;
  patterns: RegExp[];
}

export const MEDICAL_SUBJECT_RULES: MedicalSubjectRule[] = [
  {
    subject: 'Embryology',
    patterns: [
      /\b(?:Embryolog\w*|Embryo|Embryogenesis|علم\s*الأجنة|أجنة)\b/i,
      /\b(?:Female\s*Reproductive\s*Cycles?|Ovarian\s*(?:and|&)?\s*Uterine|Ovarian\s*Cycle|Uterine\s*Cycle|Menstrual\s*Cycle|الدورة\s*المبيضية|الدورة\s*الرحمية|الدورات\s*التناسلية)\b/i,
      /\b(?:Gametogenesis|Spermatogenesis|Oogenesis|تكوين\s*الأمشاج|تكوين\s*البويضات|الحيوانات\s*المنوية)\b/i,
      /\b(?:Fertilization|Implantation|Cleavage|Morula|Blastocyst|إخصاب|تلقيح|انغراس|تعشيش)\b/i,
      /\b(?:Bilaminar|Trilaminar|Germ\s*Disc|Gastrulation|Neurulation|Neural\s*Tube)\b/i,
      /\b(?:Chorion|Amnion|Amniotic|Yolk\s*Sac|Allantois|Placenta|Placentation|Umbilical\s*Cord|كوريون|مشيمة|حبل\s*سري)\b/i,
      /\b(?:Somites|Somitogenesis|Pharyngeal\s*Arches|Branchial\s*Arches)\b/i,
      /\b(?:Teratology|Congenital\s*Anomalies?|تشوهات\s*جنينية)\b/i,
      /\b(?:Fetal\s*Membranes|Development\s*of\s*(?:Heart|Gut|Kidney|Face|Limbs))\b/i,
    ],
  },
  {
    subject: 'Histology',
    patterns: [
      /\b(?:Histolog\w*|هستولوجي|علم\s*الأنسجة|أنسجة)\b/i,
      /\b(?:Epithelium|Epithelial|Connective\s*Tissue|Cartilage|Bone\s*Histology)\b/i,
      /\b(?:Blood\s*Cells?|Blood\s*Film|Muscle\s*Tissue|Nerve\s*Tissue|Lymphoid\s*Tissue)\b/i,
    ],
  },
  {
    subject: 'Anatomy',
    patterns: [
      /\b(?:Anatom\w*|General\s*Anatomy|Clinical\s*Anatomy|Systemic\s*Anatomy|تشريح|تشريح\s*عام)\b/i,
      /\b(?:Skeletal\s*Muscles?|Muscles|Muscular\s*System|Bones|Joints|Ligaments)\b/i,
      /\b(?:Upper\s*Limb|Lower\s*Limb|Thorax|Abdomen|Pelvis|Perineum|Head\s*(?:and|&)?\s*Neck)\b/i,
      /\b(?:Neuroanatomy|Brachial\s*Plexus|Lumbar\s*Plexus|Cranial\s*Nerves?)\b/i,
      /\b(?:Anatomical\s*Position|Anatomical\s*Planes|Fascia)\b/i,
    ],
  },
  {
    subject: 'Physiology',
    patterns: [
      /\b(?:Physiolog\w*|فسيولوجي|علم\s*وظائف\s*الأعضاء|وظائف\s*الأعضاء)\b/i,
      /\b(?:Action\s*Potential|Membrane\s*Potential|Homeostasis|Cardiac\s*Output)\b/i,
      /\b(?:ECG|EKG|Blood\s*Pressure|Hemodynamics|Renal\s*Clearance|GFR)\b/i,
      /\b(?:Acid\s*Base\s*Balance|Respiratory\s*Physiology|Endocrine\s*Physiology)\b/i,
    ],
  },
  {
    subject: 'Biochemistry',
    patterns: [
      /\b(?:Biochemist\w*|كيمياء\s*حيوية|بايو)\b/i,
      /\b(?:Carbohydrates?|Lipids?|Proteins?|Enzymes?|Glycolysis|Krebs\s*Cycle)\b/i,
      /\b(?:Metabolism|ATP\s*Synthesis|Vitamins?|Nucleic\s*Acids?|DNA\s*Replication)\b/i,
    ],
  },
  {
    subject: 'Pathology',
    patterns: [
      /\b(?:Patholog\w*|باثولوجي|علم\s*الأمراض)\b/i,
      /\b(?:Acute\s*Inflammation|Chronic\s*Inflammation|Necrosis|Apoptosis|Cell\s*Injury)\b/i,
      /\b(?:Neoplasia|Tumors?|Carcinoma|Sarcoma|Infarction|Thrombosis|Embolism)\b/i,
    ],
  },
  {
    subject: 'Pharmacology',
    patterns: [
      /\b(?:Pharmacolog\w*|فارماكولوجي|فارما|علم\s*الأدوية)\b/i,
      /\b(?:Pharmacokinetics|Pharmacodynamics|Autonomic\s*Drugs|Antibiotics|NSAIDs)\b/i,
      /\b(?:Beta\s*Blockers|Cholinergic|Adrenergic)\b/i,
    ],
  },
  {
    subject: 'Microbiology',
    patterns: [
      /\b(?:Microbiolog\w*|مايكروبيولوجي|ميكرو|علم\s*الأحياء\s*الدقيقة)\b/i,
      /\b(?:Bacteriology|Gram\s*Positive|Gram\s*Negative|Staphylococcus|Streptococcus)\b/i,
      /\b(?:Virology|Viruses|Mycology|Fungi|Culture\s*Media)\b/i,
    ],
  },
  {
    subject: 'Parasitology',
    patterns: [
      /\b(?:Parasitolog\w*|باراسيتولوجي|طفيليات|علم\s*الطفيليات)\b/i,
      /\b(?:Protozoa|Helminths?|Nematodes?|Cestodes?|Trematodes?|Amoeba|Malaria|Schistosoma)\b/i,
    ],
  },
];

export function detectMedicalSubject(text: string): string | null {
  if (!text || !text.trim()) return null;
  const clean = text.replace(/[\r\n\t_]+/g, ' ');

  for (const rule of MEDICAL_SUBJECT_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(clean)) {
        return rule.subject;
      }
    }
  }

  return null;
}

export const MEDICAL_DISCIPLINE_TAGS: Array<{ regex: RegExp; tag: string }> = [
  { regex: /\b(?:Anatomy|تشريح)\b/i, tag: '#ANATOMY' },
  { regex: /\b(?:Physiology|فسيولوجي)\b/i, tag: '#PHYSIOLOGY' },
  { regex: /\b(?:Biochemistry|كيمياء\s*حيوية|بايو)\b/i, tag: '#BIOCHEMISTRY' },
  { regex: /\b(?:Histology|هستولوجي|انسجة|أنسجة)\b/i, tag: '#HISTOLOGY' },
  { regex: /\b(?:Embryolog\w*|Embryo|أجنة|علم\s*الأجنة)\b/i, tag: '#EMBRYOLOGY' },
  { regex: /\b(?:Pathology|باثولوجي|علم\s*الأمراض)\b/i, tag: '#PATHOLOGY' },
  { regex: /\b(?:Pharmacology|فارماكولوجي|فارما)\b/i, tag: '#PHARMACOLOGY' },
  { regex: /\b(?:Microbiology|مايكروبيولوجي|ميكرو)\b/i, tag: '#MICROBIOLOGY' },
  { regex: /\b(?:Parasitology|طفيليات|باراسيتولوجي)\b/i, tag: '#PARASITOLOGY' },
  { regex: /\b(?:Immunology|مناعة|اميونولوجي)\b/i, tag: '#IMMUNOLOGY' },
  { regex: /\b(?:Genetics|وراثة|جيناتكس)\b/i, tag: '#GENETICS' },
  { regex: /\b(?:Neuroanatomy|تشريح\s*عصبي)\b/i, tag: '#NEUROANATOMY' },
  { regex: /\b(?:Surgery|جراحة)\b/i, tag: '#SURGERY' },
  { regex: /\b(?:Internal\s*Medicine|Medicine|باطنة)\b/i, tag: '#INTERNAL_MEDICINE' },
  { regex: /\b(?:Pediatrics|أطفال|اطفال)\b/i, tag: '#PEDIATRICS' },
  { regex: /\b(?:Obstetrics|Gynecology|نساء\s*وتوليد|توليد)\b/i, tag: '#GYNECOLOGY' },
  { regex: /\b(?:Cardiology|قلب)\b/i, tag: '#CARDIOLOGY' },
  { regex: /\b(?:Ophthalmology|عيون|رمد)\b/i, tag: '#OPHTHALMOLOGY' },
  { regex: /\b(?:ENT|أنف\s*وأذن|انف\s*واذن)\b/i, tag: '#ENT' },
  { regex: /\b(?:Dermatology|جلدية)\b/i, tag: '#DERMATOLOGY' },
];

export function cleanDoctorDisplay(docRaw: string): string {
  let d = (docRaw || '').replace(/_/g, ' ').trim();
  if (!d) return '';
  // 1. Strip leading titles like دكتور, د, Dr, Prof followed by optional dots, slashes, dashes, colons
  d = d.replace(/^(?:دكتور|د[\s./\\:–-]*|Dr[\s./\\:–-]*|Prof[\s./\\:–-]*)\s*/i, '').trim();
  // 2. Strip any remaining leading or trailing punctuation, slashes, colons, dashes or pipes
  d = d.replace(/^[\s/\\:–|.\-]+/, '').replace(/[\s/\\:–|.\-]+$/, '').trim();
  // 3. Normalize multiple whitespace
  d = d.replace(/\s{2,}/g, ' ').trim();
  return d;
}

export function normalizeSubjectTitle(subRaw: string): string {
  let s = (subRaw || '').trim();
  if (!s) return '';

  const m = s.match(/^(?:GENERAL|General|عام|اساسي|BASIC|Basic|HUMAN|Human|SYSTEMIC|Systemic)\s+([A-Za-z\u0600-\u06FF\s]+?\s*\d+)\b/i);
  if (m && m[1]) {
    return m[1].trim();
  }

  if (/^General\s+Anatomy$/i.test(s) || /^GENERAL\s+ANATOMY$/i.test(s) || /^تشريح\s+عام$/i.test(s)) {
    return 'ANATOMY';
  }

  return s.replace(/^[\[\("']+|[\]\)"']+$/g, '').trim();
}

export function generateAcademicHashtag(subject?: string | null, doctor?: string | null): string {
  const sub = (subject || '').trim();
  if (sub) {
    for (const disc of MEDICAL_DISCIPLINE_TAGS) {
      if (disc.regex.test(sub)) {
        return disc.tag;
      }
    }
    let cleaned = sub
      .replace(/^(?:GENERAL|CLINICAL|BASIC|HUMAN|SYSTEMIC|INTRO|INTRODUCTION|عام|اساسي|كلينيكال|مقدمة)\s+/gi, '')
      .replace(/\s*(?:[0-9]+|[IVXLCDM]+)$/gi, '')
      .trim();
    cleaned = cleaned.replace(/[\s\-_/]+/g, '_').replace(/[^\p{L}\p{N}_]/gu, '');
    if (cleaned) {
      return `#${cleaned.toUpperCase()}`;
    }
  }

  if (doctor && doctor.trim()) {
    const docWord = doctor.trim().replace(/^(?:د\.?|دكتور|Dr\.?|Prof\.?)\s*/i, '').replace(/[\s\-_/]+/g, '_').replace(/[^\p{L}\p{N}_]/gu, '');
    if (docWord) return `#د_${docWord}`;
  }

  return '#MedPulse';
}

export function extractMeaningfulNotes(
  origCaption: string | undefined | null,
  doctor?: string,
  subject?: string,
  topic?: string
): string {
  if (!origCaption || !origCaption.trim()) return '';

  const raw = origCaption.trim();
  let stripped = raw;

  if (doctor) {
    stripped = stripped.replace(new RegExp(`(?:دكتور|د\\.?|د\\/|Dr\\.?|Prof\\.?)\\s*${escapeRegex(doctor)}`, 'gi'), '');
    stripped = stripped.replace(new RegExp(`\\b${escapeRegex(doctor)}\\b`, 'gi'), '');
  }
  if (subject) {
    stripped = stripped.replace(new RegExp(`\\b${escapeRegex(subject)}\\b`, 'gi'), '');
  }
  if (topic) {
    stripped = stripped.replace(new RegExp(`\\b${escapeRegex(topic)}\\b`, 'gi'), '');
  }

  stripped = stripped.replace(/\b(?:Dr|DR|دكتور|د|محاضرة|كورس|مادة|شرح|فيديو|part|lecture|video|tutorial|General|Anatomy)\b/gi, '');
  stripped = stripped.replace(/[:\-–—|_()[\]]/g, ' ');
  stripped = stripped.replace(/\s+/g, ' ').trim();

  // If remaining substance is purely redundant fragments, omit completely
  if (stripped.length < 12) {
    return '';
  }

  return raw;
}

/**
 * Formats caption according to the user's selected style preset or custom template.
 * Eliminates redundant descriptions and clutter, delivering a clean, publication-ready layout.
 */
export function generateFormattedCaption(
  data: FormattedCaptionInput,
  config?: {
    captionStyle?: string;
    customCaptionTemplate?: string;
  }
): string {
  const { doctor, subject, topic, part } = data;
  const docClean = cleanDoctorDisplay(doctor || '');
  const subClean = normalizeSubjectTitle(subject || '');
  let topicClean = (topic || '')
    .trim()
    .replace(/\s*[:\-–—]\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s*\.m$/i, '')
    .replace(/\s*\.[a-zA-Z0-9]{1,5}$/i, '')
    .replace(/\.+$/, '')
    .trim();
  const partStr = part !== undefined && part !== null && String(part).trim().length > 0 ? String(part).trim() : '';

  // Extract clean file name without extension
  const rawFile = data.filename || data.originalFilename || '';
  const fileClean = rawFile.replace(/\.[a-zA-Z0-9]{1,6}$/i, '').trim();

  // Extract non-redundant description notes only
  const origCaption = (data.description || data.originalCaption || '').trim();
  const meaningfulDesc = extractMeaningfulNotes(origCaption, docClean, subClean, topicClean);

  const medPulseAnchor = `<a href="${MEDPULSE_LINK}">MedPulse🫀</a>`;
  const styleId = config?.captionStyle || 'medpulse_box';

  // Smart Academic Hashtag (e.g. #ANATOMY, #PHYSIOLOGY)
  const hashtag = generateAcademicHashtag(subClean, docClean);

  // Build caption block ONLY if meaningfulDesc exists
  let captionBlock = '';
  if (meaningfulDesc) {
    if (styleId === 'compact_bullets') {
      captionBlock = `⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\n📝 تفاصيل إضافية:\n${meaningfulDesc}`;
    } else if (styleId === 'modern_minimal' || styleId === 'single_line_clean') {
      captionBlock = `\n📝 تفاصيل إضافية:\n${meaningfulDesc}`;
    } else {
      captionBlock = `━━━━━━━━━━━━━━━\n📝 تفاصيل إضافية:\n${meaningfulDesc}`;
    }
  }

  // Preset 1: medpulse_box (classic official)
  if (styleId === 'medpulse_box') {
    const nameLine = docClean ? `${medPulseAnchor} | ${docClean}` : medPulseAnchor;

    // In the official MedPulse Box caption, the topic remains clean without trailing "[Part ...]" tags
    let boxTopic = topicClean
      .replace(/\s*\[\s*(?:part|pt|جزء|حلقة)\s*[0-9]{1,3}\s*\]/gi, '')
      .replace(/\s*\(\s*(?:part|pt|جزء|حلقة)\s*[0-9]{1,3}\s*\)/gi, '')
      .replace(/\s*[-–—:]\s*(?:part|pt|جزء|حلقة)\s*[0-9]{1,3}$/gi, '')
      .replace(/\s+(?:part|pt|جزء|حلقة)\s*[0-9]{1,3}$/gi, '')
      .replace(/\s*\.m$/i, '')
      .replace(/\s*\.[a-zA-Z0-9]{1,5}$/i, '')
      .replace(/\.+$/, '')
      .trim();

    const finalTopic = boxTopic || topicClean || fileClean || 'محاضرة';
    const descSection = meaningfulDesc ? `\n━━━━━━━━━━━━━━━\n📝 تفاصيل إضافية:\n${meaningfulDesc}` : '';
    const footerLine = hashtag ? `@MedPulseVIP | ${hashtag}` : '@MedPulseVIP';

    return ensureMedPulseLinkInCaption(
      `━━━━━━━━━━━━━━━\n` +
      `📕 Name :\n` +
      `${nameLine}\n` +
      `━━━━━━━━━━━━━━━\n` +
      `📌 Topic\n` +
      `${finalTopic}\n` +
      `━━━━━━━━━━━━━━━\n` +
      `${footerLine}`,
      4096
    );
  }

  // Find template or custom
  let rawTemplate = '';
  if (styleId === 'custom') {
    rawTemplate = config?.customCaptionTemplate?.trim() || '';
  }
  if (!rawTemplate) {
    const preset = CAPTION_PRESETS.find((p) => p.id === styleId);
    rawTemplate = preset?.template || CAPTION_PRESETS[0].template;
  }

  const finalTopic = (topicClean || fileClean || 'محاضرة')
    .replace(/\s*\.m$/i, '')
    .replace(/\s*\.[a-zA-Z0-9]{1,5}$/i, '')
    .replace(/\.+$/, '')
    .trim();

  // Format variables
  let rendered = rawTemplate
    .replace(/\{medpulse_link\}/g, medPulseAnchor)
    .replace(/\{doctor\}/g, docClean)
    .replace(/\{subject\}/g, subClean)
    .replace(/\{topic\}/g, finalTopic)
    .replace(/\{part\}/g, partStr ? (rawTemplate.includes('Part') ? partStr : `Part ${partStr}`) : '')
    .replace(/\{filename\}/g, fileClean)
    .replace(/\{file_name\}/g, fileClean)
    .replace(/\{caption_block\}/g, captionBlock)
    .replace(/\{original_caption\}/g, meaningfulDesc)
    .replace(/\{description\}/g, meaningfulDesc)
    .replace(/#\{hashtag\}/g, hashtag)
    .replace(/\{hashtag\}/g, hashtag.replace(/^#/, ''))
    .replace(/\{channel\}/g, '@MedPulseVIP');

  // Clean empty lines or dangling prefixes if doctor/subject/part were missing
  const lines = rendered.split('\n');
  const cleanedLines: string[] = [];
  for (const line of lines) {
    let l = line.trim();
    if (
      (!docClean && /^(👨‍⚕️\s*الدكتور:|▪️\s*المحاضر:|▸\s*الدكتور:)\s*$/.test(l)) ||
      (!subClean && /^(📚\s*المادة:|▸\s*الكورس:)\s*$/.test(l)) ||
      (!fileClean && /^(📁\s*الملف:|📁\s*اسم الملف:|▪️\s*الملف:)\s*$/.test(l)) ||
      (!partStr && /^(🔢\s*الجزء:|Part\s*|الجزء\s*)\s*$/.test(l)) ||
      (!meaningfulDesc && /^(📝\s*الوصف:|📝\s*تفاصيل:|📝\s*تفاصيل إضافية:)\s*$/.test(l))
    ) {
      continue;
    }
    l = l.replace(/\|\s*$/, '').replace(/^\s*\|\s*/, '').replace(/—\s*$/, '').trim();
    cleanedLines.push(l);
  }

  rendered = cleanedLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return ensureMedPulseLinkInCaption(rendered, 4096);
}

/**
 * Backward compatibility wrapper
 */
export function generateMedPulseCaption(data: {
  doctor?: string | null;
  subject?: string | null;
  topic?: string | null;
  part?: string | number | null;
}): string {
  return generateFormattedCaption(data, { captionStyle: 'medpulse_box' });
}

/**
 * Formats a clean filename using the requested naming pattern and extracted components.
 * Cleans up dangling dashes, empty brackets, and whitespace while strictly keeping original extension.
 */
export function applyNamingPattern(
  pattern: string,
  doctor: string | undefined | null,
  subject: string | undefined | null,
  topic: string | undefined | null,
  part: string | number | undefined | null,
  ext: string
): string {
  let result = pattern;

  const docClean = cleanDoctorDisplay(doctor || '');
  const subClean = normalizeSubjectTitle(subject || '');
  let topicClean = (topic || '').trim().replace(/\s*\.m$/i, '').replace(/\s*\.[a-zA-Z0-9]{1,5}$/i, '').replace(/\.+$/, '').trim();
  const partClean = part !== undefined && part !== null && String(part).trim().length > 0 ? String(part).trim() : '';

  // If topic starts with subject (e.g. subject is "ANATOMY 1" and topic is "GENERAL ANATOMY 1 anatomical position and anatomical planes")
  // avoid repeating the subject inside the filename!
  if (subClean && result.includes('{subject}')) {
    const duplicatePrefix = new RegExp(`^(?:GENERAL|General|عام|اساسي|BASIC|Basic)?\\s*${escapeRegex(subClean)}\\s*[-–—:]?\\s*`, 'i');
    if (duplicatePrefix.test(topicClean)) {
      const withoutSub = topicClean.replace(duplicatePrefix, '').trim();
      if (withoutSub.length >= 3) {
        topicClean = withoutSub;
      }
    }
  }

  // 1. If pattern has {subject}, replace or eliminate cleanly
  if (result.includes('{subject}')) {
    if (subClean) {
      result = result.replace(/\{subject\}/g, subClean);
    } else {
      result = result
        .replace(/\[\s*\{subject\}\s*\]\s*[-–|:]?\s*/gi, '')
        .replace(/\(\s*\{subject\}\s*\)\s*[-–|:]?\s*/gi, '')
        .replace(/\{subject\}\s*[-–|:]\s*/gi, '')
        .replace(/\s*[-–|:]\s*\{subject\}/gi, '')
        .replace(/\{subject\}/g, '');
    }
  }

  // 2. If pattern has {doctor}, replace or eliminate cleanly
  if (result.includes('{doctor}')) {
    if (docClean) {
      result = result.replace(/\{doctor\}/g, docClean);
    } else {
      result = result
        .replace(/د\.?\s*\{doctor\}\s*[-–|:]?\s*/gi, '')
        .replace(/Dr\.?\s*\{doctor\}\s*[-–|:]?\s*/gi, '')
        .replace(/\{doctor\}\s*[-–|:]\s*/gi, '')
        .replace(/\s*[-–|:]\s*\{doctor\}/gi, '')
        .replace(/\{doctor\}/g, '');
    }
  }

  // 3. If pattern has {topic}, replace or fallback
  if (result.includes('{topic}')) {
    result = result.replace(/\{topic\}/g, topicClean || 'ملف');
  }

  // 4. If pattern has {part}, replace or eliminate cleanly
  if (result.includes('{part}')) {
    if (partClean) {
      result = result.replace(/\{part\}/g, partClean);
    } else {
      result = result
        .replace(/\[\s*(Part|جزء|حلقة)?\s*\{part\}\s*\]/gi, '')
        .replace(/\(\s*(Part|جزء|حلقة)?\s*\{part\}\s*\)/gi, '')
        .replace(/[-–|:]?\s*(Part|جزء|حلقة)\s*\{part\}/gi, '')
        .replace(/[-–|:]?\s*\{part\}/gi, '')
        .replace(/\{part\}/g, '');
    }
  }

  // Cleanup dangling symbols, multiple spaces, multiple dashes
  let cleaned = result
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\[\s*\]/g, '')
    .replace(/\(\s*\)/g, '')
    .replace(/[\\/:*?"<>|]/g, ' - ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s*[-–|:]\s*[-–|:]\s*/g, ' - ')
    .replace(/^\s*[-–|:]\s*/g, '')
    .replace(/\s*[-–|:]\s*$/g, '')
    .replace(/\s*\.m$/i, '')
    .replace(/\s*\.[a-zA-Z0-9]{1,5}$/i, '')
    .trim();

  if (!cleaned) {
    cleaned = topicClean || subClean || 'ملف';
  }

  // Cap filename base length to 100 characters to ensure safe filesystem & Telegram handling
  if (cleaned.length > 100) {
    cleaned = cleaned.slice(0, 100).trim();
  }

  const cleanExt = ext.startsWith('.') ? ext : ext ? `.${ext}` : '.mp4';
  return `${cleaned}${cleanExt}`;
}

/**
 * Sanitizes any raw filename string into a 100% filesystem-safe and Telegram-safe single-line filename.
 * Removes newlines, illegal characters, and trims excessive length while preserving extension.
 */
export function sanitizeSafeFilename(name: string, fallbackExt = '.mp4'): string {
  if (!name || !name.trim()) return `file_${Date.now()}${fallbackExt}`;
  let clean = name.replace(/[\r\n\t]+/g, ' ');
  clean = clean.replace(/[\\/:*?"<>|]/g, ' - ');
  clean = clean.replace(/\s{2,}/g, ' ').trim();

  const extMatch = clean.match(/(\.[a-zA-Z0-9]{2,6})$/);
  const ext = extMatch ? extMatch[1] : fallbackExt;
  let base = extMatch ? clean.slice(0, -ext.length).trim() : clean;
  if (!base) base = 'file';

  if (base.length > 100) {
    base = base.slice(0, 100).trim();
  }

  return `${base}${ext}`;
}

/**
 * Robustly extracts the cleanest, most complete topic without truncation or noise.
 * If the filename is truncated (e.g. 'GENERAL ANATOMY 1 anatomical pos.mp4')
 * but originalCaption contains the full topic (e.g. 'GENERAL ANATOMY 1 : anatomical position and anatomical planes DR SAMEH GHAZY'),
 * this guarantees the complete topic ('anatomical position and anatomical planes') is returned.
 */
export function extractCleanTopic(
  caption: string | undefined,
  base: string,
  doctor?: string,
  subject?: string,
  part?: string | number
): string {
  const candidates: string[] = [];

  const sanitizeCandidate = (raw: string): string => {
    let t = (raw || '').replace(/_/g, ' ').trim();

    // 0. Strip file extension immediately
    t = t.replace(/\.[a-zA-Z0-9]{1,6}$/i, '').trim();

    // 1. Remove Doctor
    if (doctor && doctor.trim()) {
      const doc = doctor.trim();
      t = t.replace(new RegExp(`(?:دكتور|د\\.?|د\\/|Dr\\.?|Prof\\.?)[\\s._/\\:–-]*${escapeRegex(doc)}`, 'gi'), '');
      t = t.replace(new RegExp(`\\b${escapeRegex(doc)}\\b`, 'gi'), '');
    }
    // Also remove generic Doctor titles if left over (e.g. "DR SAMEH GHAZY", "د. سامح غازي")
    t = t.replace(/(?:دكتور|د\.?|د\/|Dr\.?|Prof\.?)[\s._/\\:–-]+[A-Za-z\u0600-\u06FF\s]{2,30}$/gi, '');
    t = t.replace(/(?:دكتور|د\.?|د\/|Dr\.?|Prof\.?)[\s._/\\:–-]+[A-Za-z\u0600-\u06FF\s]{2,30}(?=\s*[-–—|:]|$)/gi, '');

    // 2. Remove Subject prefix markers only without destroying the lecture topic
    t = t.replace(/(?:مادة|كورس|course|subject)[\s:_-]+/gi, '');

    // 3. Remove Part safely - DO NOT delete single 'p' which corrupts words like 'planes' or 'power'
    if (part !== undefined && part !== null && String(part).trim()) {
      t = t.replace(new RegExp(`(?:\\b(?:part|pt|section|sec|episode|ep)\\b|جزء|الجزء|حلقة|الحلقة)[\\s.:_-]*${escapeRegex(String(part).trim())}`, 'gi'), '');
    }
    t = t.replace(/(?:\b(?:part|pt|section|sec|episode|ep)\b|جزء|الجزء|حلقة|الحلقة)[\s.:_-]*[0-9]{1,3}/gi, '');
    t = t.replace(/\[\s*(?:part|pt|جزء|حلقة)?\s*[0-9]{1,3}\s*\]/gi, '');
    t = t.replace(/\(\s*(?:part|pt|جزء|حلقة)?\s*[0-9]{1,3}\s*\)/gi, '');

    // 4. Remove leading numbering or sequence delimiters (e.g. "11 ", "06. ")
    t = t.replace(/^[0-9]{1,3}[\s._\-–—:]+/, '');

    // 5. Remove common leading words like "شرح", "محاضرة", "درس", "فيديو", "lecture", etc.
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
  };

  // Check originalCaption first (it is usually the most complete and untruncated source)
  if (caption && caption.trim()) {
    const cap = caption.trim();

    // Pattern: "Subject : Topic Doctor" or "Subject - Topic - Doctor"
    if (cap.includes(':')) {
      const parts = cap.split(':');
      // What comes after the first colon is typically the Topic (+ Doctor)
      const afterColon = parts.slice(1).join(':').trim();
      const cleaned = sanitizeCandidate(afterColon);
      if (cleaned.length >= 3) {
        candidates.push(cleaned);
      }
    }

    if (cap.includes(' - ') || cap.includes(' – ') || cap.includes(' — ') || cap.includes(' | ')) {
      const parts = cap.split(/\s*[-–—|]\s*/);
      for (const p of parts) {
        const cleaned = sanitizeCandidate(p);
        if (cleaned.length >= 3) {
          candidates.push(cleaned);
        }
      }
    }

    const wholeCaptionCleaned = sanitizeCandidate(cap);
    if (wholeCaptionCleaned.length >= 3) {
      candidates.push(wholeCaptionCleaned);
    }
  }

  // Check base filename
  if (base && base.trim()) {
    if (base.includes(':')) {
      const parts = base.split(':');
      const afterColon = parts.slice(1).join(':').trim();
      const cleaned = sanitizeCandidate(afterColon);
      if (cleaned.length >= 3) {
        candidates.push(cleaned);
      }
    }
    if (base.includes(' - ') || base.includes(' – ') || base.includes(' — ') || base.includes(' | ')) {
      const parts = base.split(/\s*[-–—|]\s*/);
      for (const p of parts) {
        const cleaned = sanitizeCandidate(p);
        if (cleaned.length >= 3) {
          candidates.push(cleaned);
        }
      }
    }
    const wholeBaseCleaned = sanitizeCandidate(base);
    if (wholeBaseCleaned.length >= 3) {
      candidates.push(wholeBaseCleaned);
    }
  }

  if (candidates.length === 0) {
    return subject || 'محاضرة';
  }

  // Filter out candidates that are purely the subject name or doctor name
  const filtered = candidates.filter((c) => {
    if (subject && c.toLowerCase() === subject.toLowerCase()) return false;
    if (doctor && c.toLowerCase() === doctor.toLowerCase()) return false;
    return true;
  });

  const listToRank = filtered.length > 0 ? filtered : candidates;

  listToRank.sort((a, b) => {
    const aLower = a.toLowerCase();
    const bLower = b.toLowerCase();

    // If one candidate is a prefix of another candidate, the longer one is the untruncated one!
    // Example: "anatomical pos" vs "anatomical position and anatomical planes"
    if (bLower.startsWith(aLower) && b.length > a.length) {
      return 1;
    }
    if (aLower.startsWith(bLower) && a.length > b.length) {
      return -1;
    }

    // Check for truncated word endings (like "pos", "sec", "pt", "an")
    const aEndsTruncated = /\b(pos|sec|pt|ch|intro|anat)\b$/i.test(a);
    const bEndsTruncated = /\b(pos|sec|pt|ch|intro|anat)\b$/i.test(b);
    if (aEndsTruncated && !bEndsTruncated) return 1;
    if (!aEndsTruncated && bEndsTruncated) return -1;

    // Longer informative topic is preferred
    return b.length - a.length;
  });

    // Ensure candidate topic does not have dangling .m or extensions
    const rawSelected = listToRank[0] || subject || 'محاضرة';
    const selected = rawSelected
      .replace(/\s*\.m$/i, '')
      .replace(/\s*\.[a-zA-Z0-9]{1,5}$/i, '')
      .replace(/\.+$/, '')
      .trim();

    return selected || subject || 'محاضرة';
}

/**
 * Deterministic fallback parser for extracting Doctor, Subject, Topic, and Part numbers
 * without hallucinating information, used if Gemini API is offline or without key.
 */
export function heuristicBatchRename(
  items: InputBatchItem[],
  config: AIRenamingConfig
): AIRenamedItemResult[] {
  return items.map((item, idx) => {
    const { base, ext } = splitExtension(item.originalFilename || `video_${idx + 1}.mp4`);
    const cleanBaseForAnalysis = base.replace(/_/g, ' ').replace(/\.[a-zA-Z0-9]{1,6}$/i, '').trim();
    const fullText = `${cleanBaseForAnalysis} ${(item.originalCaption || '').replace(/_/g, ' ')}`;

    // 1. Detect Subject / Course
    let subject = '';
    const subjectKeywords = [
      'General Anatomy', 'Clinical Anatomy', 'Human Anatomy', 'Systemic Anatomy',
      'Physiology', 'Anatomy', 'Pathology', 'Pharmacology', 'Biochemistry',
      'Microbiology', 'Histology', 'Embryology', 'Genetics', 'Parasitology',
      'Immunology', 'Surgery', 'Pediatrics', 'Internal Medicine', 'Cardiology',
      'تشريح عام', 'فسيولوجي', 'تشريح', 'باثولوجي', 'فارماكولوجي', 'فارما', 'كيمياء حيوية',
      'مايكروبيولوجي', 'هستولوجي', 'علم الأجنة', 'أجنة', 'طفيليات', 'مناعة',
      'جراحة', 'باطنة', 'أطفال'
    ];

    // Look for leading Subject prefix before colon, e.g. "GENERAL ANATOMY 1 : ..." in originalCaption or base
    if (item.originalCaption) {
      const capColon = item.originalCaption.trim().match(/^([^:\n\-_|]+)[\s]*[:]/i);
      if (capColon && capColon[1]) {
        const candidateSub = capColon[1].trim();
        for (const kw of subjectKeywords) {
          if (new RegExp(`\\b${escapeRegex(kw)}\\b`, 'i').test(candidateSub)) {
            subject = candidateSub;
            break;
          }
        }
      }
    }

    if (!subject && base) {
      const baseColon = cleanBaseForAnalysis.match(/^([^:\n\-_|]+)[\s]*[:]/i);
      if (baseColon && baseColon[1]) {
        const candidateSub = baseColon[1].trim();
        for (const kw of subjectKeywords) {
          if (new RegExp(`\\b${escapeRegex(kw)}\\b`, 'i').test(candidateSub)) {
            subject = candidateSub;
            break;
          }
        }
      }
    }

    if (!subject) {
      const explicitSubMatch = (item.originalCaption || cleanBaseForAnalysis).match(/(?:مادة|كورس|course|subject)[\s:_-]*([^\d\n\-_,|[\]()]+(?:\s+\d+)?)/i);
      if (explicitSubMatch && explicitSubMatch[1]) {
        subject = explicitSubMatch[1].trim();
      } else {
        for (const kw of subjectKeywords) {
          const regex = new RegExp(`\\b${escapeRegex(kw)}(?:\\s*\\d+)?\\b`, 'i');
          const capMatch = (item.originalCaption || '').match(regex);
          const baseMatch = cleanBaseForAnalysis.match(regex);
          if (capMatch) {
            subject = capMatch[0].trim();
            break;
          } else if (baseMatch) {
            subject = baseMatch[0].trim();
            break;
          }
        }
      }
    }

    // Medical Syllabus Semantic Detection (e.g. Female Reproductive Cycles, Chorion, Ovarian -> Embryology)
    if (!subject) {
      const detectedSub = detectMedicalSubject(fullText);
      if (detectedSub) {
        subject = detectedSub;
      }
    }

    // 2. Detect Doctor
    let doctor = '';
    const docMatch = fullText.match(/(?:دكتور|د|Dr|Prof)[\s._/\\:–-]+([a-zA-Z\u0600-\u06FF]+(?:[\s_]+[a-zA-Z\u0600-\u06FF]+){0,3})/i);
    if (docMatch && docMatch[1]) {
      doctor = cleanDoctorDisplay(docMatch[1].trim());
    }

    // 3. Detect Part number strictly (never invent Part 4 or treat numbering as part)
    let part: string | number = '';
    const partMatch = fullText.match(/(?:part|pt|section|sec|episode|ep|جزء|الجزء|حلقة|الحلقة|السكشن|الدرس)[\s.:_-]*([0-9]{1,3})/i);
    if (partMatch && isValidPartNumber(partMatch[1], fullText)) {
      part = partMatch[1];
    } else {
      const bracketPart = fullText.match(/[\[(](?:part|pt|جزء|حلقة)?\s*([0-9]{1,3})\s*[\])]/i);
      if (bracketPart && isValidPartNumber(bracketPart[1], fullText)) {
        part = bracketPart[1];
      } else {
        const arabicParts: Record<string, number> = {
          'الاول': 1, 'الأول': 1, 'الاولى': 1, 'الأولى': 1,
          'الثاني': 2, 'الثانية': 2, 'الثالث': 3, 'الثالثة': 3,
          'الرابع': 4, 'الرابعة': 4, 'الخامس': 5, 'الخامسة': 5,
          'السادس': 6, 'السابعة': 7, 'الثامن': 8, 'التاسع': 9, 'العاشر': 10
        };
        for (const [word, num] of Object.entries(arabicParts)) {
          if (new RegExp(`(?:الجزء|جزء|حلقة|الحلقة)\\s+${word}`, 'i').test(fullText)) {
            part = num;
            break;
          }
        }
      }
    }

    // 4. Detect Topic cleanly without truncation using originalCaption and base
    const topic = extractCleanTopic(item.originalCaption, base, doctor, subject, part);

    const formattedFilename = applyNamingPattern(
      config.namingPattern || '{subject} - د. {doctor} - {topic} [Part {part}]',
      doctor,
      subject,
      topic,
      part,
      ext
    );

    const formattedCaption = generateFormattedCaption({
      doctor,
      subject,
      topic,
      part,
      originalFilename: item.originalFilename,
      originalCaption: item.originalCaption,
    }, config);

    const reasons: string[] = [];
    if (subject) reasons.push(`المادة: ${subject}`);
    if (doctor) reasons.push(`الدكتور: ${doctor}`);
    if (part) reasons.push(`الجزء: ${part}`);
    reasons.push(`الموضوع: ${topic}`);

    return {
      id: item.id,
      originalFilename: item.originalFilename,
      originalCaption: item.originalCaption,
      extractedDoctor: doctor || undefined,
      extractedSubject: subject || undefined,
      extractedTopic: topic || undefined,
      extractedPart: part || undefined,
      formattedFilename,
      formattedCaption,
      groupingReason: `تحليل خوارزمي دقيق: ${reasons.join(' | ')}`,
    };
  });
}

/**
 * Main AI Batch Renamer
 * Processes a group of videos/files together to understand cross-file context,
 * common lecturers, shared topics, and sequential parts.
 */
export async function batchAnalyzeAndRenameWithAI(
  items: InputBatchItem[],
  config: AIRenamingConfig
): Promise<AIRenamedItemResult[]> {
  if (!items || items.length === 0) return [];

  // If AI renaming is toggled off, retain original names
  if (!config.enabled) {
    return items.map((i) => ({
      id: i.id,
      originalFilename: i.originalFilename,
      originalCaption: i.originalCaption,
      formattedFilename: i.originalFilename,
      formattedCaption: i.originalCaption,
      groupingReason: 'الذكاء الاصطناعي معطل (محتفظ بالاسم الأصلي)',
    }));
  }

  // 1. Check in-memory cache for blazing fast zero-latency results
  const resultsMap = new Map<string, AIRenamedItemResult>();
  const uncachedItems: InputBatchItem[] = [];

  for (const item of items) {
    const cached = getCachedAiResult(item, config);
    if (cached) {
      resultsMap.set(item.id, cached);
    } else {
      uncachedItems.push(item);
    }
  }

  // If all items were in cache, return immediately (0ms)
  if (uncachedItems.length === 0) {
    return items.map((i) => resultsMap.get(i.id)!);
  }

  const ai = getGeminiClient();
  if (!ai) {
    const heurResults = heuristicBatchRename(uncachedItems, config);
    for (const r of heurResults) {
      const orig = uncachedItems.find((u) => u.id === r.id);
      if (orig) aiCache.set(getCacheKey(orig, config), r);
      resultsMap.set(r.id, r);
    }
    return items.map((i) => resultsMap.get(i.id)!);
  }

  const namingPattern = config.namingPattern || '{subject} - د. {doctor} - {topic} [Part {part}]';
  const customInstructions = config.customInstructions || '';

  const captionStyleId = config.captionStyle || 'medpulse_box';
  const sampleCaption = generateFormattedCaption(
    {
      doctor: 'د. محمد شريف',
      subject: 'Embryology',
      topic: 'Somites Development',
      part: '1',
      originalFilename: '01. Embryology - Somites Development - Dr. Mohamed Sherif.mp4',
      originalCaption: 'محاضرة علم الأجنة الأولى وتتضمن شرح تكون الفقرات والطبقات الجنينية مع المخططات التوضيحية.',
    },
    config
  );

  const systemInstruction = `
أنت محرك ذكي فائق الدقة والتنظيم لإعادة تسمية وتنظيم وتنسيق محاضرات وفيديوهات وكورسات MedPulse التعليمية والطبية.

المبدأ الصارم والأساسي لمنع الاختلاق (Anti-Hallucination):
**استخرج المعلومات الموجودة أصلًا فقط في اسم الملف أو الوصف ⬅️ افهم المادة والكورس والدكتور والموضوع والـ Parts ⬅️ وحّد صياغتها ⬅️ أعد تنسيق اسم الملف بالنمط الثابت ⬅️ أعد تنسيق الوصف بالنمط المعتمد المختار ⬅️ لا تخترع أو تخمن أي معلومة غير موجودة إطلاقاً!**

تفاصيل ومحددات العمل الإلزامية:
1. استخراج الحقول بدقة:
   - extractedDoctor: اسم الدكتور أو المحاضر إذا كان مذكوراً (مثل: "سامح غازي"، "ناجي اسكندر"، "احمد فريد") نظيفاً بدون ألقاب أو شُرَط مائلة أو سفلية (مثل Dr_Ahmed_Farid تصبح "Ahmed Farid"). إذا لم يكن مذكوراً اتركه فارغاً.
   - extractedSubject: اسم المادة أو الكورس الأكاديمي الطبي Subject / Course (مثل: "Embryology", "Anatomy", "Physiology", "Histology", "Biochemistry", "Pathology", "علم الأجنة"، إلخ).
     * استنتاج المادة الطبية بذكاء فائق ودقة علمية:
       - المواضيع التناسلية والجنينية (مثل: Female Reproductive Cycles, Ovarian and Uterine, Chorion, Placenta, Fertilization, Cleavage, Somites, Gametogenesis, Embryo) تتبع حتماً مادة "Embryology" (أو علم الأجنة).
       - مواضيع العضلات والعظام والمفاصل وأجزاء الجسم (مثل: Muscles, Skeletal Muscle, Bones, Upper Limb, Thorax, Anatomical Position) تتبع مادة "Anatomy".
       - حدد اسم المادة بدقة من سياق المحاضرة حتى لو لم تسبقها كلمة "كورس".
   - extractedTopic: موضوع المحاضرة أو الدرس النظيف والشامل:
     * قاعدة منع بتر العناوين والامتدادات (Strict Anti-Truncation & Anti-Extension):
       - ممنوع منعاً باتاً أن ينتهي الموضوع بـ ".m" أو أي امتداد ملف مشوه (مثل ".m" أو ".mp4").
       - الأولوية المطلقة لاستخراج الموضوع (extractedTopic) كاملاً غير منقوص من الوصف أو اسم الملف.
       - لا تكرر اسم المادة Subject داخل Topic إذا كانت مفصولة بنقطتين ":" أو شرطة "-".
   - extractedPart: رقم الـ Part أو الجزء:
     * تحذير صارم: لا تضع أي Part إلا إذا كان الملف جزءاً صريحاً ومقسماً بالفعل ومذكور بكلمة "Part" أو "جزء" أو "حلقة" (مثل: Part 1, Part 2, الجزء الأول).
     * الأرقام الترتيبية للمحاضرات (مثل الرقم 11 في "11_Female_Reproductive..." أو الرقم 08 في "08 Muscles 4...") ليست Parts إطلاقاً!
     * الأرقام الواردة في السياق العلمي (مثل "Muscles 4 Skeletal..." أو "B12" أو "Type 1") ليست Parts!
     * إذا لم يكن هناك تجزئة صريحة، اترك extractedPart فارغاً تماماً "".

2. معالجة المجموعة كاملة معاً:
   - إذا كانت الفيديوهات تتبع نفس الكورس ونفس الدكتور ونفس الموضوع ومقسمة لأجزاء:
     * وحّد اسم المادة والموضوع حرفياً وتطابقاً تاماً.
     * رتّب أرقام الـ Parts بدقة متناهية.

3. إعادة تسمية الملف (formattedFilename):
   طبق النمط الثابت المعتمد:
   "${namingPattern}"
   (الافتراضي: "{subject} - د. {doctor} - {topic} [Part {part}]")
   بحيث:
   - يظهر اسم المادة {subject} بوضوح داخل اسم الملف.
   - إذا غاب أي متغير ({doctor} أو {subject} أو {part}) يتم تنظيفه وإزالته بدون ترك فواصل أو أقواس معلقة مثل "[Part ]" أو "د. - ".
   - إذا لم يكن هناك part حقيقي، لا تضف "[Part ...]" أبداً.
   - الحفاظ الصارم على الامتداد الأصلي للملف (.mp4, .mkv, .pdf, إلخ) وعدم إضافة ".m".

4. تنسيق الوصف المعتمد الشامل (formattedCaption):
   أعد صياغة وصف كل فيديو بدقة متناهية وأناقة واحترافية وفق نمط الوصف المعتمد التالي:
${sampleCaption}

   محددات وقواعد الوصف الإلزامية والصارمة لمنع التكرار والابتذال:
   - ممنوع منعاً باتاً تكرار الوصف الأصلي (originalCaption) أو إعادة كتابته تحت "📝 الوصف:" إذا كانت بياناته (المحاضر، المادة، الموضوع) قد ذُكرت في الحقول العلوية! التكرار يعتبر عيباً جسيماً ومبتذلاً جداً ومرفوضاً.
   - لا تضف أي سطر لاسم الملف "📁 الملف:" أو "▪️ الملف:" إطلاقاً إلا إذا كان القالب المختار يحتوي على ذلك صراحة.
   - كلمة MedPulse🫀 يجب أن تحتوي على الرابط مضمناً بشكل HTML: <a href="${MEDPULSE_LINK}">MedPulse🫀</a>
   - استخدم هاشتاق المادة الأكاديمي النظيف (مثل: #EMBRYOLOGY، #ANATOMY، #PHYSIOLOGY، #HISTOLOGY، إلخ).
   - تأكد من خلو نهاية حقل 📌 Topic من أي لاحقة ".m".

5. تعليمات إضافية مخصصة من المستخدم إن وجدت:
   ${customInstructions ? `"${customInstructions}"` : 'لا توجد تعليمات إضافية حالياً.'}
`;

  const simplifiedItems = uncachedItems.map((i) => {
    const { base, ext } = splitExtension(i.originalFilename);
    return {
      id: i.id,
      originalFilename: i.originalFilename,
      rawBaseName: base,
      fileExtension: ext,
      originalCaption: i.originalCaption || '',
      durationSeconds: i.duration,
      sequenceOrder: i.sequenceNumber,
    };
  });

  if (isGeminiInCooldown()) {
    const remainingSec = Math.ceil(getQuotaCooldownRemaining() / 1000);
    const now = Date.now();
    if (now - lastQuotaLogTime > 15000) {
      lastQuotaLogTime = now;
      console.log(`[AI Renamer] Gemini API quota cooldown active (${remainingSec}s remaining). Processing seamlessly using built-in heuristic engine.`);
    }
    const heurResults = heuristicBatchRename(uncachedItems, config);
    for (const r of heurResults) {
      const orig = uncachedItems.find((u) => u.id === r.id);
      if (orig) aiCache.set(getCacheKey(orig, config), r);
      resultsMap.set(r.id, r);
    }
    return items.map((i) => resultsMap.get(i.id)!);
  }

  const prompt = `
إليك قائمة ملفات الدفعة الحالية المطلوب تحليلها وتوحيد تسمياتها وأوصافها معاً:
${JSON.stringify(simplifiedItems, null, 2)}

قم بتحليل الملفات، استخرج الدكتور والمادة Subject والموضوع والـ Part، وطبق نمط التسمية الثابت مع اسم المادة، ونمط الوصف الموحد لـ MedPulse مع الرابط المضمن، مع الحفاظ الكامل على ما ورد في اسم الملف ووصفه الأصلي دون أي نقصان، مع ذكر سبب التجميع (groupingReason).
أخرج النتيجة بصيغة JSON مطابق تماماً للـ schema المطلوبة.
`;

  try {
    let responseText = '';
    let lastError: any = null;

    for (const model of GEMINI_MODELS) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.ARRAY,
              description: 'قائمة نتائج إعادة التسمية وتنسيق الوصف الذكية للمجموعة',
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  originalFilename: { type: Type.STRING },
                  extractedDoctor: { type: Type.STRING },
                  extractedSubject: { type: Type.STRING },
                  extractedTopic: { type: Type.STRING },
                  extractedPart: { type: Type.STRING },
                  formattedFilename: { type: Type.STRING },
                  formattedCaption: { type: Type.STRING },
                  groupingReason: { type: Type.STRING },
                },
                required: ['id', 'originalFilename', 'formattedFilename', 'formattedCaption', 'groupingReason'],
              },
            },
          },
        });

        responseText = response.text?.trim() || '[]';
        if (responseText && responseText !== '[]') {
          break; // Successful model run
        }
      } catch (modelErr: any) {
        lastError = modelErr;
        const errMsg = modelErr?.message || String(modelErr);
        const isQuota =
          modelErr?.status === 429 ||
          errMsg.includes('429') ||
          errMsg.includes('RESOURCE_EXHAUSTED') ||
          errMsg.includes('Quota exceeded');

        if (isQuota) {
          let retryDelaySec = 20;
          const retryMatch = errMsg.match(/retry in\s+([0-9.]+)\s*s/i) || errMsg.match(/"retryDelay":\s*"([0-9]+)s"/i);
          if (retryMatch && retryMatch[1]) {
            retryDelaySec = Math.max(5, Math.ceil(parseFloat(retryMatch[1])));
          }
          quotaCooldownUntil = Date.now() + (retryDelaySec * 1000);
          console.warn(`[AI Renamer] Quota reached on ${model} (429). Activating ${retryDelaySec}s cooldown.`);
          break; // Stop querying other models if quota limit reached on project
        } else {
          console.warn(`[AI Renamer] Model ${model} encountered an issue, checking candidate:`, errMsg);
        }
      }
    }

    if (!responseText || responseText === '[]') {
      throw lastError || new Error('No candidate Gemini model completed successfully');
    }

    const text = responseText;
    const parsed = JSON.parse(text) as AIRenamedItemResult[];

    // Ensure extensions match original exactly and captions are properly formatted
    for (const origItem of uncachedItems) {
      const { ext } = splitExtension(origItem.originalFilename);
      const matched = parsed.find((p) => p.id === origItem.id);

      let itemResult: AIRenamedItemResult;
      if (matched && matched.formattedFilename) {
        const { base: baseName } = splitExtension(origItem.originalFilename);
        const cleanExt = ext.startsWith('.') ? ext : ext ? `.${ext}` : '.mp4';
        const combinedText = `${origItem.originalFilename} ${origItem.originalCaption || ''}`;

        // Validate Subject
        if (!matched.extractedSubject) {
          const detectedSub = detectMedicalSubject(combinedText);
          if (detectedSub) {
            matched.extractedSubject = detectedSub;
          }
        }

        // Strictly validate Part: reject false positive parts like [Part 4] when it was just "Muscles 4"
        let verifiedPart = matched.extractedPart;
        if (verifiedPart && !isValidPartNumber(verifiedPart, combinedText)) {
          verifiedPart = undefined;
        }
        matched.extractedPart = verifiedPart;

        // Check if caption contains a richer, untruncated topic (e.g. filename was cut at 'anatomical pos')
        const bestTopic = extractCleanTopic(
          origItem.originalCaption,
          baseName,
          matched.extractedDoctor,
          matched.extractedSubject,
          matched.extractedPart
        );

        const cleanDoc = cleanDoctorDisplay(matched.extractedDoctor || '');
        matched.extractedDoctor = cleanDoc || undefined;

        let activeTopic = (matched.extractedTopic || '').trim()
          .replace(/\s*\.m$/i, '')
          .replace(/\s*\.[a-zA-Z0-9]{1,5}$/i, '')
          .replace(/\.+$/, '')
          .trim();

        const isAiTopicTruncated =
          !activeTopic ||
          /\b(pos|sec|pt|ch|intro|anat|med)\b$/i.test(activeTopic) ||
          (bestTopic && bestTopic.length > activeTopic.length && bestTopic.toLowerCase().includes(activeTopic.toLowerCase())) ||
          (matched.extractedSubject && activeTopic.toLowerCase().includes(matched.extractedSubject.toLowerCase()));

        if (bestTopic && (isAiTopicTruncated || bestTopic.length > activeTopic.length + 3)) {
          activeTopic = bestTopic;
          matched.extractedTopic = bestTopic;
        }

        let cleanName = applyNamingPattern(
          config.namingPattern || '{subject} - د. {doctor} - {topic} [Part {part}]',
          matched.extractedDoctor,
          matched.extractedSubject,
          activeTopic,
          matched.extractedPart,
          cleanExt
        );

        cleanName = sanitizeSafeFilename(cleanName, cleanExt);

        const finalCaption = generateFormattedCaption({
          doctor: matched.extractedDoctor,
          subject: matched.extractedSubject,
          topic: activeTopic || matched.extractedTopic,
          part: matched.extractedPart,
          originalFilename: origItem.originalFilename,
          originalCaption: origItem.originalCaption,
        }, config);

        itemResult = {
          id: origItem.id,
          originalFilename: origItem.originalFilename,
          originalCaption: origItem.originalCaption,
          extractedDoctor: matched.extractedDoctor || undefined,
          extractedSubject: matched.extractedSubject || undefined,
          extractedTopic: activeTopic || matched.extractedTopic || undefined,
          extractedPart: matched.extractedPart || undefined,
          formattedFilename: cleanName,
          formattedCaption: finalCaption,
          groupingReason: matched.groupingReason || 'تم توحيد الصياغة وتنسيق الوصف بنجاح',
        };
      } else {
        itemResult = heuristicBatchRename([origItem], config)[0];
      }

      // Store in memory cache for instant future reuse
      aiCache.set(getCacheKey(origItem, config), itemResult);
      resultsMap.set(origItem.id, itemResult);
    }

    return items.map((i) => resultsMap.get(i.id)!);
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    const isQuota =
      err?.status === 429 ||
      errMsg.includes('429') ||
      errMsg.includes('RESOURCE_EXHAUSTED') ||
      errMsg.includes('Quota exceeded');

    if (isQuota) {
      if (quotaCooldownUntil <= Date.now()) {
        quotaCooldownUntil = Date.now() + 20000;
      }
      console.warn('[AI Renamer] Gemini API rate limit / quota cooldown active (429 RESOURCE_EXHAUSTED). Falling back to high-accuracy local heuristic engine.');
    } else {
      console.warn('[AI Renamer] Gemini AI call encountered an issue, using local heuristic engine fallback:', errMsg);
    }

    const heurResults = heuristicBatchRename(uncachedItems, config);
    for (const r of heurResults) {
      const orig = uncachedItems.find((u) => u.id === r.id);
      if (orig) aiCache.set(getCacheKey(orig, config), r);
      resultsMap.set(r.id, r);
    }
    return items.map((i) => resultsMap.get(i.id)!);
  }
}
