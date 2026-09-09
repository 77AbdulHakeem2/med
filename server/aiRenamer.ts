import { GoogleGenAI, Type } from '@google/genai';
import { AIRenamingConfig, AIRenamedItemResult } from '../src/types';
import { splitExtension } from './pipeline';

let aiClient: GoogleGenAI | null = null;

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
    description: 'إطار خطي فخم، اسم الدكتور، المادة، معرف القناة، الموضوع وهاشتاق المادة.',
    template: `━━━━━━━━━━━━━━━\n📕 Name\n{medpulse_link} | {doctor}\n{subject}\n[@MedPulseVIP]\n━━━━━━━━━━━━━━━\n📌 Topic\n{topic}\n━━━━━━━━━━━━━━━\n#{hashtag}`,
  },
  {
    id: 'academic_badges',
    name: 'النمط الأكاديمي الشامل (Academic Badges)',
    badge: 'منظم وتفصيلي 📚',
    description: 'توزيع منظم بأيقونات طبية وأكاديمية للمادة، المحاضر، العنوان ورقم الجزء.',
    template: `🩺 {medpulse_link}\n━━━━━━━━━━━━━━━━━━\n📚 المادة: {subject}\n👨‍⚕️ الدكتور: {doctor}\n📑 المحاضرة: {topic}\n🔢 الجزء: {part}\n━━━━━━━━━━━━━━━━━━\n📢 القناة: @MedPulseVIP\n#{hashtag}`,
  },
  {
    id: 'modern_minimal',
    name: 'النمط العصري الهادئ (Modern Minimal)',
    badge: 'هادئ وأنيق ✨',
    description: 'خطوط هادئة ونقاط ناعمة بدون فواصل عريضة، ممتاز للقراءة السلسة.',
    template: `{medpulse_link} | {subject}\n▪️ المحاضر: {doctor}\n▫️ الموضوع: {topic} {part}\n\n🔗 @MedPulseVIP • #{hashtag}`,
  },
  {
    id: 'compact_bullets',
    name: 'النمط الهندسي المركز (Compact Bullets)',
    badge: 'هندسي ومركّز ◈',
    description: 'نقاط هندسية واضحة وخط فاصل رفيع، خفيف ومنظم.',
    template: `◈ {medpulse_link} ◈\n▸ الكورس: {subject}\n▸ الدكتور: {doctor}\n▸ العنوان: {topic} {part}\n⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\n@MedPulseVIP • #{hashtag}`,
  },
  {
    id: 'single_line_clean',
    name: 'النمط المختصر والسريع (Direct Short)',
    badge: 'موجز وسريع ⚡',
    description: 'صيغة سريعة بدون تفاصيل إضافية لتوفير المساحة في القنوات المزدحمة.',
    template: `{medpulse_link} • {subject}\n{doctor} — {topic} {part}\n@MedPulseVIP • #{hashtag}`,
  },
  {
    id: 'custom',
    name: 'قالب مخصص بالكامل (Custom Template)',
    badge: 'حرية كاملة ✏️',
    description: 'اكتب نمطك الخاص واستخدم المتغيرات الذكية: {subject}, {doctor}, {topic}, {part}, #{hashtag}, {channel}, {medpulse_link}.',
    template: '',
  },
];

/**
 * Formats caption according to the user's selected style preset or custom template
 */
export function generateFormattedCaption(
  data: {
    doctor?: string | null;
    subject?: string | null;
    topic?: string | null;
    part?: string | number | null;
  },
  config?: {
    captionStyle?: string;
    customCaptionTemplate?: string;
  }
): string {
  const { doctor, subject, topic, part } = data;
  const docClean = (doctor || '').trim();
  const subClean = (subject || '').trim();
  let topicClean = (topic || '').trim();
  const partStr = part !== undefined && part !== null && String(part).trim().length > 0 ? String(part).trim() : '';

  const medPulseAnchor = `<a href="${MEDPULSE_LINK}">MedPulse🫀</a>`;
  const styleId = config?.captionStyle || 'medpulse_box';

  // Hashtag calculation
  let hashtag = '';
  if (subClean) {
    const tagWord = subClean.replace(/[\s\-_/]+/g, '_').replace(/[^\p{L}\p{N}_]/gu, '');
    if (tagWord) hashtag = `#${tagWord}`;
  }
  if (!hashtag && docClean) {
    const docWord = docClean.replace(/^(د\.?|دكتور|Dr\.?)\s*/i, '').replace(/[\s\-_/]+/g, '_').replace(/[^\p{L}\p{N}_]/gu, '');
    if (docWord) hashtag = `#د_${docWord}`;
  }
  if (!hashtag) hashtag = '#MedPulse';

  // Preset 1: medpulse_box (classic official)
  if (styleId === 'medpulse_box') {
    const nameLine = docClean ? `${medPulseAnchor} | ${docClean}` : medPulseAnchor;
    const subjectLine = subClean ? `\n${subClean}` : '';
    if (partStr && !topicClean.toLowerCase().includes(`part ${partStr.toLowerCase()}`) && !topicClean.includes(`جزء ${partStr}`)) {
      topicClean = `${topicClean} [Part ${partStr}]`.trim();
    }
    const finalTopic = topicClean || 'محاضرة';
    return (
      `━━━━━━━━━━━━━━━\n` +
      `📕 Name\n` +
      `${nameLine}${subjectLine}\n` +
      `[@MedPulseVIP]\n` +
      `━━━━━━━━━━━━━━━\n` +
      `📌 Topic\n` +
      `${finalTopic}\n` +
      `━━━━━━━━━━━━━━━\n` +
      `${hashtag}`
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

  // Format variables
  let rendered = rawTemplate
    .replace(/\{medpulse_link\}/g, medPulseAnchor)
    .replace(/\{doctor\}/g, docClean)
    .replace(/\{subject\}/g, subClean)
    .replace(/\{topic\}/g, topicClean || 'محاضرة')
    .replace(/\{part\}/g, partStr ? (rawTemplate.includes('Part') ? partStr : `Part ${partStr}`) : '')
    .replace(/#\{hashtag\}/g, hashtag)
    .replace(/\{hashtag\}/g, hashtag.replace(/^#/, ''))
    .replace(/\{channel\}/g, '@MedPulseVIP');

  // Clean empty lines or dangling prefixes if doctor/subject/part were missing
  const lines = rendered.split('\n');
  const cleanedLines: string[] = [];
  for (const line of lines) {
    let l = line.trim();
    // If line only contains an empty prefix
    if (
      (!docClean && /^(👨‍⚕️\s*الدكتور:|▪️\s*المحاضر:|▸\s*الدكتور:)\s*$/.test(l)) ||
      (!subClean && /^(📚\s*المادة:|▸\s*الكورس:)\s*$/.test(l)) ||
      (!partStr && /^(🔢\s*الجزء:|Part\s*|الجزء\s*)\s*$/.test(l))
    ) {
      continue;
    }
    // Clean trailing or dangling separator
    l = l.replace(/\|\s*$/, '').replace(/^\s*\|\s*/, '').replace(/—\s*$/, '').trim();
    cleanedLines.push(l);
  }

  rendered = cleanedLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return rendered || generateFormattedCaption(data, { captionStyle: 'medpulse_box' });
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

  const docClean = (doctor || '').trim();
  const subClean = (subject || '').trim();
  const topicClean = (topic || '').trim();
  const partClean = part !== undefined && part !== null && String(part).trim().length > 0 ? String(part).trim() : '';

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
    .replace(/\[\s*\]/g, '')
    .replace(/\(\s*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s*[-–|:]\s*[-–|:]\s*/g, ' - ')
    .replace(/^\s*[-–|:]\s*/g, '')
    .replace(/\s*[-–|:]\s*$/g, '')
    .trim();

  if (!cleaned) {
    cleaned = topicClean || subClean || 'ملف';
  }

  const cleanExt = ext.startsWith('.') ? ext : ext ? `.${ext}` : '.mp4';
  return `${cleaned}${cleanExt}`;
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
    const fullText = `${base} ${item.originalCaption || ''}`;

    // 1. Detect Subject / Course
    let subject = '';
    const subjectKeywords = [
      'Physiology', 'Anatomy', 'Pathology', 'Pharmacology', 'Biochemistry',
      'Microbiology', 'Histology', 'Embryology', 'Genetics', 'Parasitology',
      'Immunology', 'Surgery', 'Pediatrics', 'Internal Medicine', 'Cardiology',
      'فسيولوجي', 'تشريح', 'باثولوجي', 'فارماكولوجي', 'فارما', 'كيمياء حيوية',
      'مايكروبيولوجي', 'هستولوجي', 'علم الأجنة', 'أجنة', 'طفيليات', 'مناعة',
      'جراحة', 'باطنة', 'أطفال'
    ];
    const explicitSubMatch = fullText.match(/(?:مادة|كورس|course|subject)[\s:_-]*([^\d\n\-_,|[\]()]+(?:\s+\d+)?)/i);
    if (explicitSubMatch && explicitSubMatch[1]) {
      subject = explicitSubMatch[1].trim();
    } else {
      for (const kw of subjectKeywords) {
        const regex = new RegExp(`\\b${kw}(?:\\s*\\d+)?\\b`, 'i');
        const match = fullText.match(regex);
        if (match) {
          subject = match[0].trim();
          break;
        }
      }
    }

    // 2. Detect Doctor
    let doctor = '';
    const docMatch = fullText.match(/(?:دكتور|د\.?|د\/|Dr\.?|Prof\.?)\s+([^\d\n\-_,|[\]()]+)/i);
    if (docMatch && docMatch[1]) {
      doctor = docMatch[1].trim().split(/\s+/).slice(0, 3).join(' ');
    }

    // 3. Detect Part number
    let part: string | number = '';
    const partMatch = fullText.match(/(?:part|pt|p|جزء|الجزء|حلقة|الحلقة|section|sec)[\s.:_-]*([0-9]{1,3})/i);
    if (partMatch) {
      part = partMatch[1];
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

    // 4. Detect Topic (scrub doctor, subject, part from base)
    let topic = base;
    if (doctor) {
      topic = topic.replace(new RegExp(`(?:دكتور|د\\.?|د\\/|Dr\\.?|Prof\\.?)\\s*${doctor}`, 'gi'), '');
    }
    if (subject) {
      topic = topic.replace(new RegExp(`(?:مادة|كورس|course|subject)?[\\s:_-]*${subject}`, 'gi'), '');
    }
    if (part) {
      topic = topic.replace(/(?:part|pt|p|جزء|الجزء|حلقة|الحلقة)[\s.:_-]*[0-9]{1,3}/gi, '');
    }
    topic = topic
      .replace(/[\[\]()_]/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .replace(/^\s*[-–|:]\s*/, '')
      .replace(/\s*[-–|:]\s*$/, '')
      .trim();

    if (!topic) topic = subject || 'محاضرة';

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

  const ai = getGeminiClient();
  if (!ai) {
    console.warn('GEMINI_API_KEY not configured, falling back to heuristic parser');
    return heuristicBatchRename(items, config);
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
    },
    config
  );

  const systemInstruction = `
أنت محرك ذكي فائق الدقة والتنظيم لإعادة تسمية وتنظيم وتنسيق محاضرات وفيديوهات وكورسات MedPulse التعليمية والطبية.

المبدأ الصارم والأساسي لمنع الاختلاق (Anti-Hallucination):
**استخرج المعلومات الموجودة أصلًا فقط في اسم الملف أو الوصف ⬅️ افهم المادة والكورس والدكتور والموضوع والـ Parts ⬅️ وحّد صياغتها ⬅️ أعد تنسيق اسم الملف بالنمط الثابت ⬅️ أعد تنسيق الوصف بالنمط المعتمد المختار ⬅️ لا تخترع أو تخمن أي معلومة غير موجودة إطلاقاً!**

تفاصيل ومحددات العمل الإلزامية:
1. استخراج الحقول بدقة:
   - extractedDoctor: اسم الدكتور أو المحاضر إذا كان مذكوراً (مثل: "د. ناجي اسكندر"، "د. محمد شريف"). إذا لم يكن مذكوراً اتركه فارغاً.
   - extractedSubject: اسم المادة أو الكورس Subject / Course (مثل: "Physiology 2", "Embryology", "Anatomy", "علم الأجنة"). جزء أساسي ومهم جداً. لا تخمنه إذا لم يكن موجوداً.
   - extractedTopic: موضوع المحاضرة أو الدرس النظيف (مثل: "Blood – Diagrams", "Somites & Folding", "Introduction").
   - extractedPart: رقم الـ Part أو الجزء إن وجد (مثل: "1", "2", "3"). لا تضع part إذا لم تكن مقسمة لأجزاء.

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
   - الحفاظ الصارم على الامتداد الأصلي للملف (.mp4, .mkv, .pdf, إلخ).

4. تنسيق الوصف المعتمد (formattedCaption):
   أعد صياغة وصف كل فيديو بدقة متناهية وفق نمط الوصف المعتمد التالي حرفياً:
${sampleCaption}

   محددات نمط الوصف:
   - كلمة MedPulse🫀 يجب أن تحتوي على الرابط مضمناً بشكل HTML: <a href="${MEDPULSE_LINK}">MedPulse🫀</a>
   - استخدم المعلومات المستخرجة الحقيقية فقط ({doctor}، {subject}، {topic}، {part}) دون أي اختراع.
   - إذا غاب اسم الدكتور أو المادة، نظف الأسطر المعلقة دون ترك أقواس فارغة.

5. تعليمات إضافية مخصصة من المستخدم إن وجدت:
   ${customInstructions ? `"${customInstructions}"` : 'لا توجد تعليمات إضافية حالياً.'}
`;

  const simplifiedItems = items.map((i) => {
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

  const prompt = `
إليك قائمة ملفات الدفعة الحالية المطلوب تحليلها وتوحيد تسمياتها وأوصافها معاً:
${JSON.stringify(simplifiedItems, null, 2)}

قم بتحليل الملفات، استخرج الدكتور والمادة Subject والموضوع والـ Part، وطبق نمط التسمية الثابت مع اسم المادة، ونمط الوصف الموحد لـ MedPulse مع الرابط المضمن، مع ذكر سبب التجميع (groupingReason).
أخرج النتيجة بصيغة JSON مطابق تماماً للـ schema المطلوبة.
`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
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

    const text = response.text?.trim() || '[]';
    const parsed = JSON.parse(text) as AIRenamedItemResult[];

    // Ensure extensions match original exactly and captions are properly formatted
    const finalResults: AIRenamedItemResult[] = items.map((origItem) => {
      const { ext } = splitExtension(origItem.originalFilename);
      const matched = parsed.find((p) => p.id === origItem.id);

      if (matched && matched.formattedFilename) {
        let cleanName = matched.formattedFilename.trim();
        // Check if extension was preserved
        if (!cleanName.toLowerCase().endsWith(ext.toLowerCase())) {
          cleanName = cleanName.replace(/\.[a-zA-Z0-9]{2,5}$/, '');
          cleanName = `${cleanName}${ext}`;
        }

        // Validate or generate caption matching selected style
        let finalCaption = matched.formattedCaption?.trim();
        if (!finalCaption || !finalCaption.includes('MedPulse')) {
          finalCaption = generateFormattedCaption({
            doctor: matched.extractedDoctor,
            subject: matched.extractedSubject,
            topic: matched.extractedTopic,
            part: matched.extractedPart,
          }, config);
        }

        return {
          id: origItem.id,
          originalFilename: origItem.originalFilename,
          originalCaption: origItem.originalCaption,
          extractedDoctor: matched.extractedDoctor || undefined,
          extractedSubject: matched.extractedSubject || undefined,
          extractedTopic: matched.extractedTopic || undefined,
          extractedPart: matched.extractedPart || undefined,
          formattedFilename: cleanName,
          formattedCaption: finalCaption,
          groupingReason: matched.groupingReason || 'تم توحيد الصياغة وتنسيق الوصف بنجاح',
        };
      } else {
        // Fallback for this single item
        return heuristicBatchRename([origItem], config)[0];
      }
    });

    return finalResults;
  } catch (err) {
    console.error('Gemini AI batch rename call failed, falling back to heuristic engine:', err);
    return heuristicBatchRename(items, config);
  }
}
