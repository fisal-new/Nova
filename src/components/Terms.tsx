import { useState } from "react";

export const TERMS_VERSION = 1;
const TERMS_KEY = "nova-terms-accepted";

export function termsAccepted(): boolean {
  try {
    return localStorage.getItem(TERMS_KEY) === String(TERMS_VERSION);
  } catch {
    return false;
  }
}

/** First-launch gate: the IDE stays hidden until the user accepts. */
export default function Terms({ onAccept }: { onAccept: () => void }) {
  const [scrolled, setScrolled] = useState(false);

  const accept = () => {
    try {
      localStorage.setItem(TERMS_KEY, String(TERMS_VERSION));
    } catch { /* private mode — gate will show again next launch */ }
    onAccept();
  };

  return (
    <div className="overlay" style={{ paddingTop: "6vh" }}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-label="Terms and conditions" style={{ width: "min(520px, 94vw)", maxHeight: "84vh" }}>
        <div className="logo-big" style={{ width: 40, height: 40, fontSize: 20 }}>⚡</div>
        <h3>شروط وأحكام استخدام Nova IDE</h3>
        <div
          className="terms-box"
          onScroll={(e) => {
            const el = e.currentTarget;
            if (el.scrollHeight - el.scrollTop - el.clientHeight < 40) setScrolled(true);
          }}
        >
          <p><b>1. طبيعة التطبيق:</b> Nova IDE محرر أكواد للأندرويد بوضع تجريبي (Beta)، يُقدم "كما هو" بدون أي ضمان. أنت مسؤول عن نسخ مشاريعك احتياطياً.</p>
          <p><b>2. ملفاتك لك:</b> مشاريعك وأكوادك تبقى على جهازك ولا تُرسل لأي مكان — باستثناء ما تطلبه أنت صراحة (مثل إرفاق ملف للذكاء الاصطناعي).</p>
          <p><b>3. الذكاء الاصطناعي:</b> يحتاج مفتاح OpenRouter خاص بك أو رابط proxy. أي مفتاح مضمّن مع النسخة مخصص للمشاركة وقد يتوقف في أي وقت.</p>
          <p><b>4. تقارير الأخطاء التلقائية:</b> عند حدوث خطأ، يرسل التطبيق تلقائياً تقريراً يشمل: نص الخطأ، نسخة التطبيق، نوع الجهاز ودقة الشاشة، حالة التطبيق (الملف المفتوح ولغته)، وآخر سطور السجلات — <b>بعد مسح أي مفاتيح</b> — إلى قناة المطور (Discord) لغرض الإصلاح فقط. بضغط "موافق" أنت توافق على ذلك.</p>
          <p><b>5. الاستخدام العادل:</b> يمنع استخدام التطبيق أو الذكاء الاصطناعي فيه لأي نشاط غير قانوني، أو لمحاولة استخراج مفاتيح الآخرين، أو إغراق الخدمات.</p>
          <p><b>6. المسؤولية:</b> المطور غير مسؤول عن أي فقدان بيانات أو أضرار ناتجة عن الاستخدام، بما فيها تنفيذ أكواد اقترحها الذكاء الاصطناعي — راجع الكود قبل التشغيل.</p>
          <p style={{ color: "var(--txt-3)", fontSize: 12 }}>
            Terms of Nova IDE (Beta, as-is, no warranty). Your files stay on-device. AI needs your own key/proxy.
            Crash/error reports (message, device, app state, recent logs; secrets scrubbed) are sent to the
            developer's channel — accepting means you consent. Fair use only.
          </p>
        </div>
        <div className="modal-actions">
          <button
            className="btn btn-primary"
            onClick={accept}
            disabled={!scrolled}
            title={scrolled ? "Accept" : "Scroll to the end to accept"}
            style={{ flex: 1, justifyContent: "center", opacity: scrolled ? 1 : 0.55 }}
          >
            موافق — Accept{scrolled ? "" : " (مرر للأسفل أولاً)"}
          </button>
        </div>
      </div>
    </div>
  );
}
