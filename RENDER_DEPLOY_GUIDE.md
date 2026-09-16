# دليل تشغيل الأداة على استضافة Render المجانية وضبط UptimeRobot

هذا الدليل يشرح كيفية تشغيل الأداة على استضافة **Render** مجاناً والحفاظ على عملها 24 ساعة يومياً دون توقف عبر **UptimeRobot**، مع تشغيلها في نفس الوقت داخل **AI Studio** بدون أي تعارض.

---

## 1. إعداد الاستضافة على Render (خطوة بخطوة)

1. أنشئ حساباً مجانياً على [Render.com](https://render.com).
2. صدّر هذا المشروع إلى مستودع في حسابك على **GitHub** (من قائمة Settings في AI Studio > Export to GitHub).
3. في لوحة تحكم Render:
   - اضغط على زر **"New +"** ثم اختر **"Web Service"**.
   - اختر مستودع الـ GitHub الخاص بك واضغط **Connect**.
4. اضبط الإعدادات التالية:
   - **Name**: `telegram-auto-publisher` (أو أي اسم تفضله).
   - **Region**: اختر `Frankfurt (EU Central)` (لأفضل سرعة واتصال مع سيرفرات تيليجرام والشرق الأوسط).
   - **Branch**: `main`
   - **Runtime**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Instance Type**: `Free`
5. أضف متغيرات البيئة (**Environment Variables**):
   - `TELEGRAM_BOT_TOKEN`: التوكن الخاص ببوتك من @BotFather.
   - `GEMINI_API_KEY`: مفتاح Gemini API لمعالجة وإعادة تسمية الملفات بالذكاء الاصطناعي.
   - `ENABLE_TELEGRAM_POLLING`: `true`
6. اضغط على **"Create Web Service"**.
7. سيبدأ البناء وسيصبح موقعك جاهزاً ومتاحاً على رابط مثل:
   `https://telegram-auto-publisher.onrender.com`

---

## 2. كيفية منع Render من النوم مجاناً بواسطة UptimeRobot

استضافة Render المجانية تنام وتتوقف إذا لم يصلها أي طلب HTTP لمدة 15 دقيقة. لمنع ذلك، نستخدم **UptimeRobot** لإرسال إشارة خفيفة كل 5 دقائق:

1. افتح حساباً مجانياً على [UptimeRobot.com](https://uptimerobot.com).
2. اضغط على **"+ Add New Monitor"**.
3. املأ البيانات التالية:
   - **Monitor Type**: `HTTP(s)`
   - **Friendly Name**: `Telegram Bot Keep-Alive`
   - **URL (or IP)**: رابط صفحة الـ health الخاصة بك:
     `https://<اسم-تطبيقك>.onrender.com/health`
   - **Monitoring Interval**: اختر `5 minutes` (أو 10 دقائق كحد أقصى).
4. اضغط **"Create Monitor"**.
5. بمجرد التفعيل، سيقوم UptimeRobot باستدعاء الصفحة كل 5 دقائق، مما يُبقي خادم Render مستيقظاً 24/7 بسرعة قصوى ودون دفع أي تكاليف!

---

## 3. كيف تعمل الأداة في Render و AI Studio معاً دون أي تعارض؟

تيليجرام يسمح لخادم واحد فقط بالاستماع للرسائل في نفس اللحظة عبر الـ Polling. لتشغيل الأداة على Render و AI Studio في نفس الوقت بسلاسة:

1. **الخادم الرئيسي (Production)**:
   - خادم Render يعمل 24/7 ويستلم الرسائل والملفات من تيليجرام وينشرها في قناتك.
2. **بيئة التطوير (AI Studio)**:
   - يمكنك استخدام واجهة AI Studio في أي وقت لإدارة الإعدادات، تجربة التسمية بالذكاء الاصطناعي، ومراقبة الطابور والقناة.
   - إذا كنت تريد أن يستلم Render كل الرسائل فقط دون منافسة:
     - يمكنك بضغطة زر واحدة إيقاف الاستماع في AI Studio من زر **"إيقاف الاستماع التلقائي"** في نافذة البوت.
     - أو إذا كان الاستماع مفعلاً في كلاهما، فالنظام يحتوي على نظام ذكي مدمج يكتشف تلقائياً أن Render نشط ويدخل في وضع التراجع الهادئ (Graceful Multi-Instance Backoff) دون أي أخطاء أو توقف في سرعة المعالجة!
