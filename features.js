/* ===== core.js ===== */
/* Golden Hour - features/core.js
   Namespace + tiny helpers shared by the add-on modules. Touches nothing in app.js / ui.js.
   Load order: core, i18n, db, ai, emergency, cases, complaint, tracker, audit, analyzer, toolkit */
(function () {
  'use strict';
  var GHX = window.GHX = window.GHX || {};
  GHX.caseSections = []; GHX.tabs = []; GHX.hi = {}; GHX.lang = 'en'; GHX._ev = {};

  GHX.LINKS = {
    phone: '1930',
    portal: 'https://cybercrime.gov.in/',
    faq: 'https://cybercrime.gov.in/Webform/FAQ.aspx',
    status: 'https://cybercrime.gov.in/Webform/chkackstatus.aspx',
    govStatus: 'https://services.india.gov.in/service/detail/track-the-status-of-your-cyber-crime-complaints-1'
  };

  /* events */
  GHX.on = function (n, f) { (GHX._ev[n] = GHX._ev[n] || []).push(f); };
  GHX.emit = function (n, a) { (GHX._ev[n] || []).forEach(function (f) { try { f(a); } catch (e) { /* keep going */ } }); };

  /* safe DOM builder: text is always textContent, never HTML */
  GHX.h = function (tag, attrs, kids) {
    var el = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.indexOf('on') === 0 && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    });
    (kids || []).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return el;
  };
  GHX.clear = function (el) { while (el.firstChild) el.removeChild(el.firstChild); return el; };

  GHX.uid = function (p) { return (p || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); };
  GHX.caseId = function () {
    var d = new Date(), pad = function (n) { return String(n).padStart(2, '0'); };
    return 'GH-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
  };
  GHX.debounce = function (fn, ms) { var t; return function () { var a = arguments, s = this; clearTimeout(t); t = setTimeout(function () { fn.apply(s, a); }, ms); }; };

  /* dates */
  GHX.toLocalInput = function (d) { d = d || new Date(); var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()); };
  GHX.fmtDate = function (iso) {
    if (!iso) return GHX.t('Unknown');
    var d = new Date(iso); if (isNaN(d)) return GHX.t('Unknown');
    return d.toLocaleString(GHX.lang === 'hi' ? 'hi-IN' : 'en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  };
  GHX.fmtSize = function (n) { return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; };

  /* toast (own live region, independent of app.js's #toast) */
  var toastEl, toastT;
  GHX.toast = function (msg) {
    if (!toastEl) { toastEl = GHX.h('div', { class: 'ghx-toast', role: 'status', 'aria-live': 'polite' }); document.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(function () { toastEl.classList.remove('show'); }, 2600);
  };

  /* confirm dialog -> Promise<boolean> */
  GHX.confirm = function (o) {
    return new Promise(function (resolve) {
      if (!window.HTMLDialogElement) { resolve(window.confirm(o.title + '\n\n' + (o.message || ''))); return; }
      var done = false;
      var dlg = GHX.h('dialog', { class: 'ghx-dialog' });
      var finish = function (v) { if (done) return; done = true; dlg.close(); dlg.remove(); resolve(v); };
      dlg.appendChild(GHX.h('h2', { text: o.title }));
      if (o.message) dlg.appendChild(GHX.h('p', { text: o.message }));
      if (o.node) dlg.appendChild(o.node);
      dlg.appendChild(GHX.h('div', { class: 'actions' }, [
        GHX.h('button', { class: 'btn ' + (o.danger ? 'btn-danger' : 'btn-primary'), type: 'button', text: o.ok || GHX.t('OK'), onclick: function () { finish(true); } }),
        GHX.h('button', { class: 'btn btn-quiet', type: 'button', text: GHX.t('Cancel'), onclick: function () { finish(false); } })
      ]));
      dlg.addEventListener('cancel', function (e) { e.preventDefault(); finish(false); });
      document.body.appendChild(dlg); dlg.showModal();
    });
  };

  /* Supabase values come from the existing config.js. If your config uses other names, edit ONLY this function. */
  GHX.getConfig = function () {
    var c = window.GOLDEN_HOUR_CONFIG || window.GH_CONFIG || window.APP_CONFIG || window.CONFIG || window.config || {};
    return {
      url: String(c.supabaseUrl || c.SUPABASE_URL || c.url || '').replace(/\/+$/, ''),
      key: c.supabaseKey || c.SUPABASE_ANON_KEY || c.SUPABASE_KEY || c.supabaseAnonKey || c.anonKey || ''
    };
  };
})();

/* ===== i18n.js ===== */
/* Golden Hour - features/i18n.js
   English text IS the key. GHX.hi maps English -> Hindi; anything missing falls back to English,
   so a forgotten string can never break the UI. Review Hindi wording before the demo. */
(function () {
  'use strict';
  var GHX = window.GHX;
  try { var s = localStorage.getItem('gh_lang'); if (s === 'hi' || s === 'en') GHX.lang = s; } catch (e) { /* ignore */ }

  GHX.t = function (key, vars) {
    var s = (GHX.lang === 'hi' && GHX.hi[key]) || key;
    if (vars) Object.keys(vars).forEach(function (k) { s = s.split('{' + k + '}').join(vars[k]); });
    return s;
  };
  GHX.setLang = function (l) {
    GHX.lang = l === 'hi' ? 'hi' : 'en';
    try { localStorage.setItem('gh_lang', GHX.lang); } catch (e) { /* ignore */ }
    GHX.emit('lang', GHX.lang);
  };

  var hi = {
    /* emergency */
    'Financial cyber fraud? Call 1930 now.': 'आर्थिक साइबर धोखाधड़ी? अभी 1930 पर कॉल करें।',
    "Report promptly. Don't wait for Golden Hour to finish.": 'तुरंत शिकायत करें। Golden Hour के पूरा होने का इंतज़ार न करें।',
    'Call 1930': '1930 पर कॉल करें',
    'Copy 1930': '1930 कॉपी करें',
    'Copied': 'कॉपी हो गया',
    'Open National Cyber Crime Reporting Portal': 'राष्ट्रीय साइबर अपराध रिपोर्टिंग पोर्टल खोलें',
    'Check complaint status': 'शिकायत की स्थिति जांचें',
    "It's never too late to report. These options stay open even if it happened hours, days or months ago.": 'रिपोर्ट करने में कभी देर नहीं होती। घटना को घंटे, दिन या महीने बीत गए हों, तब भी ये विकल्प उपलब्ध हैं।',
    'What happened to you?': 'आपके साथ क्या हुआ?',
    'First steps for this situation': 'इस स्थिति के लिए पहले कदम',
    'Open my case workspace': 'मेरा केस वर्कस्पेस खोलें',
    'Call': 'कॉल',
    'Portal': 'पोर्टल',
    'Status': 'स्थिति',
    'Emergency help': 'आपातकालीन मदद',
    /* incident types */
    'Financial fraud (money lost)': 'आर्थिक धोखाधड़ी (पैसा गया)',
    'Account compromise (hacked account)': 'अकाउंट हैक होना',
    'Phishing (fake link, call or message)': 'फ़िशिंग (नकली लिंक, कॉल या संदेश)',
    'Impersonation (fake profile or person)': 'नकल (नकली प्रोफ़ाइल या व्यक्ति)',
    'Extortion or harassment': 'ब्लैकमेल या उत्पीड़न',
    'Other cybercrime': 'अन्य साइबर अपराध',
    /* shell */
    'Toolkit': 'टूलकिट',
    'Back to home': 'होम पर वापस',
    'My cases': 'मेरे केस',
    'Safety audit': 'सुरक्षा जांच',
    'Scam analyzer': 'स्कैम विश्लेषक',
    'Privacy & data': 'गोपनीयता और डेटा',
    'Language': 'भाषा',
    'Your case stays on this device unless you choose to share selected text with AI or an external service.': 'आपका केस इसी डिवाइस पर रहता है, जब तक आप चुने हुए टेक्स्ट को AI या किसी बाहरी सेवा के साथ साझा करना न चुनें।',
    /* cases */
    'No account needed. Cases are saved in this browser only.': 'खाता ज़रूरी नहीं। केस केवल इसी ब्राउज़र में सहेजे जाते हैं।',
    'New case': 'नया केस',
    'Start a case': 'केस शुरू करें',
    'Incident type': 'घटना का प्रकार',
    'When did it happen?': 'यह कब हुआ?',
    "What's happening now?": 'अभी क्या हो रहा है?',
    'It is still going on (calls, threats, payments)': 'अभी भी जारी है (कॉल, धमकी, भुगतान)',
    'It has stopped': 'रुक गया है',
    "I'm not sure": 'पक्का नहीं पता',
    'Create case': 'केस बनाएं',
    'No cases yet. Start one, or load demo cases to try the app.': 'अभी कोई केस नहीं। एक शुरू करें, या ऐप आज़माने के लिए डेमो केस लोड करें।',
    'Open': 'खोलें',
    'Delete': 'हटाएं',
    'Delete this case': 'इस केस को हटाएं',
    'Delete this case?': 'क्या यह केस हटाएं?',
    'This removes the case, its evidence files and notes from this browser. It cannot be undone.': 'इससे केस, उसकी सबूत फ़ाइलें और नोट्स इस ब्राउज़र से हट जाएंगे। इसे वापस नहीं किया जा सकता।',
    'Back to cases': 'केस सूची पर वापस',
    'Updated': 'अपडेट',
    'Saved on this device': 'इस डिवाइस पर सहेजा गया',
    'Could not save. Browser storage may be full or blocked.': 'सहेज नहीं सका। ब्राउज़र स्टोरेज भरा या बंद हो सकता है।',
    'DEMO: synthetic data, not a real case.': 'डेमो: बनावटी डेटा, असली केस नहीं।',
    'Organize': 'व्यवस्थित करें',
    'Tasks': 'कार्य',
    'Evidence': 'सबूत',
    'Complaint': 'शिकायत',
    'Follow-up': 'फ़ॉलो-अप',
    'Facts': 'तथ्य',
    'Leave a field blank if you do not know it. It will be marked Unknown. Never type OTPs, PINs, passwords or full card numbers.': 'जो पता न हो उसे खाली छोड़ें, उसे अज्ञात लिखा जाएगा। OTP, PIN, पासवर्ड या पूरा कार्ड नंबर कभी न लिखें।',
    'Amount lost (Rs.)': 'खोई हुई राशि (रु.)',
    'Transaction or UPI reference': 'ट्रांज़ैक्शन या UPI संदर्भ',
    'Scammer phone, UPI ID, email or profile': 'ठग का फ़ोन, UPI ID, ईमेल या प्रोफ़ाइल',
    'Links or website addresses (as text only)': 'लिंक या वेबसाइट पते (केवल टेक्स्ट)',
    'What happened, in your own words': 'क्या हुआ, अपने शब्दों में',
    'Timeline': 'समय-रेखा',
    'Add what happened and when. Leave the time empty if you are not sure.': 'क्या हुआ और कब, जोड़ें। समय पक्का न हो तो खाली छोड़ें।',
    'What happened': 'क्या हुआ',
    'Add event': 'घटना जोड़ें',
    'No events yet.': 'अभी कोई घटना नहीं।',
    'Remove': 'हटाएं',
    'Time unknown': 'समय अज्ञात',
    'Unknown': 'अज्ञात',
    'Not provided': 'उपलब्ध नहीं',
    'Done': 'पूरा',
    '{n} of {total} tasks done': '{total} में से {n} कार्य पूरे',
    'Add evidence': 'सबूत जोड़ें',
    'Files stay in this browser. Golden Hour does not check whether evidence is genuine.': 'फ़ाइलें इसी ब्राउज़र में रहती हैं। Golden Hour सबूत के असली होने की जांच नहीं करता।',
    'Evidence files': 'सबूत फ़ाइलें',
    'Note about this evidence': 'इस सबूत के बारे में नोट',
    'Add file(s) / record item': 'फ़ाइल जोड़ें / आइटम दर्ज करें',
    'Add a file or write a note first.': 'पहले फ़ाइल जोड़ें या नोट लिखें।',
    'Note only (no file)': 'सिर्फ़ नोट (फ़ाइल नहीं)',
    'File too large (limit 8 MB): {name}': 'फ़ाइल बहुत बड़ी है (सीमा 8 MB): {name}',
    'No evidence recorded yet.': 'अभी कोई सबूत दर्ज नहीं।',
    'Added by you on {date}': 'आपने {date} को जोड़ा',
    /* complaint */
    'Complaint Studio': 'शिकायत स्टूडियो',
    'Checklist before you report': 'रिपोर्ट करने से पहले चेकलिस्ट',
    'Required': 'ज़रूरी',
    'Recommended': 'अनुशंसित',
    'Missing': 'कमी',
    'Complete': 'पूरा',
    'Incident date and time': 'घटना की तारीख और समय',
    'Description of what happened (20+ characters)': 'क्या हुआ उसका विवरण (20+ अक्षर)',
    'Amount lost': 'खोई हुई राशि',
    'Transaction or UPI reference': 'ट्रांज़ैक्शन या UPI संदर्भ',
    'Scammer contact details or links': 'ठग के संपर्क विवरण या लिंक',
    'At least one evidence item': 'कम से कम एक सबूत',
    'Draft language': 'ड्राफ़्ट की भाषा',
    'Generate draft from my case': 'मेरे केस से ड्राफ़्ट बनाएं',
    'Improve wording with AI': 'AI से भाषा सुधारें',
    'Your draft (edit freely)': 'आपका ड्राफ़्ट (बदलाव कर सकते हैं)',
    'Replace your edited draft?': 'क्या आपका संपादित ड्राफ़्ट बदलें?',
    'A new draft will overwrite the text in the box.': 'नया ड्राफ़्ट बॉक्स के टेक्स्ट को बदल देगा।',
    'Replace': 'बदलें',
    'Cancel': 'रद्द करें',
    'OK': 'ठीक है',
    'Download PDF pack': 'PDF पैक डाउनलोड करें',
    'Copy text': 'टेक्स्ट कॉपी करें',
    'Download as text': 'टेक्स्ट में डाउनलोड करें',
    'Required details are missing': 'ज़रूरी जानकारी अधूरी है',
    'They will be marked Unknown in the PDF. Export anyway?': 'PDF में इन्हें अज्ञात लिखा जाएगा। फिर भी एक्सपोर्ट करें?',
    'Export anyway': 'फिर भी एक्सपोर्ट करें',
    'Golden Hour has NOT submitted this complaint.': 'Golden Hour ने यह शिकायत दर्ज नहीं की है।',
    'You must submit it yourself on the official portal. The portal may ask you to register or verify with an OTP and will give its own acknowledgement number.': 'आपको इसे आधिकारिक पोर्टल पर स्वयं जमा करना होगा। पोर्टल पंजीकरण या OTP मांग सकता है और अपना acknowledgement number देगा।',
    'Official FAQ': 'आधिकारिक FAQ',
    "I've submitted it on the portal": 'मैंने पोर्टल पर जमा कर दिया है',
    'Draft saved': 'ड्राफ़्ट सहेजा गया',
    'Copied to clipboard': 'क्लिपबोर्ड पर कॉपी हुआ',
    'Opening print dialog. Choose "Save as PDF".': 'प्रिंट डायलॉग खुल रहा है। "Save as PDF" चुनें।',
    'Please review the Hindi wording and your facts before relying on this draft.': 'इस ड्राफ़्ट पर भरोसा करने से पहले हिंदी शब्दों और अपने तथ्यों की जांच करें।',
    /* tracker */
    'Follow-up tracker': 'फ़ॉलो-अप ट्रैकर',
    'Notes here are user-recorded. Golden Hour does not fetch live status. Use the official checker for that.': 'ये नोट्स आपके द्वारा दर्ज हैं। Golden Hour लाइव स्थिति नहीं लाता। इसके लिए आधिकारिक चेकर इस्तेमाल करें।',
    'Acknowledgement number': 'Acknowledgement number (पावती संख्या)',
    'Date you filed': 'आपने कब दर्ज किया',
    'Status (recorded by you)': 'स्थिति (आपके द्वारा दर्ज)',
    'Not filed yet': 'अभी दर्ज नहीं',
    'Filed on the portal': 'पोर्टल पर दर्ज किया',
    'Waiting for a response': 'जवाब का इंतज़ार',
    'Police asked for more information': 'पुलिस ने और जानकारी मांगी',
    'Closed or resolved': 'बंद या हल',
    'Follow-up notes': 'फ़ॉलो-अप नोट्स',
    'Add note': 'नोट जोड़ें',
    'Note': 'नोट',
    'No notes yet.': 'अभी कोई नोट नहीं।',
    'Check official status (opens portal)': 'आधिकारिक स्थिति जांचें (पोर्टल खुलेगा)',
    'Government Services Portal page': 'सरकारी सेवा पोर्टल पेज',
    'A plain-language guide: an acknowledgement number is the reference the official portal gives you after you submit. You need it to check progress.': 'सरल भाषा में: acknowledgement number वह संदर्भ संख्या है जो आधिकारिक पोर्टल शिकायत जमा करने के बाद देता है। प्रगति जांचने के लिए यह चाहिए।',
    /* audit */
    'Cyber safety audit': 'साइबर सुरक्षा जांच',
    'An educational self-assessment, not a penetration test or security certification. A good score does not mean you are secure.': 'यह शैक्षिक स्व-मूल्यांकन है, पेनिट्रेशन टेस्ट या सुरक्षा प्रमाणपत्र नहीं। अच्छे स्कोर का मतलब यह नहीं कि आप सुरक्षित हैं।',
    'Yes': 'हाँ', 'Partly': 'आंशिक', 'No': 'नहीं',
    'Your score': 'आपका स्कोर',
    'Needs attention': 'ध्यान देने योग्य',
    'Nothing flagged. Keep these habits up.': 'कुछ भी चिह्नित नहीं। ये आदतें बनाए रखें।',
    'Save this assessment': 'यह जांच सहेजें',
    'Assessment saved': 'जांच सहेजी गई',
    'Past assessments': 'पिछली जांचें',
    'No saved assessments yet.': 'अभी कोई सहेजी जांच नहीं।',
    'Answer all questions to see your score.': 'स्कोर देखने के लिए सभी प्रश्नों के उत्तर दें।',
    /* analyzer */
    'Scam analyzer': 'स्कैम विश्लेषक',
    'Paste a suspicious SMS, email or chat. Golden Hour never opens links for you.': 'संदिग्ध SMS, ईमेल या चैट पेस्ट करें। Golden Hour आपके लिए कोई लिंक नहीं खोलता।',
    'Message text': 'संदेश का टेक्स्ट',
    'Link in the message (as text, optional)': 'संदेश में लिंक (टेक्स्ट के रूप में, वैकल्पिक)',
    'Try a synthetic sample': 'बनावटी नमूना आज़माएं',
    'Quick check on this device': 'इस डिवाइस पर त्वरित जांच',
    'Analyze with AI': 'AI से विश्लेषण करें',
    'Paste a message first.': 'पहले संदेश पेस्ट करें।',
    'Risk': 'जोखिम',
    'Warning signs': 'चेतावनी के संकेत',
    'Snippets from your text': 'आपके टेक्स्ट से अंश',
    'What we are unsure about': 'किस बात में अनिश्चितता है',
    'Safe next steps': 'सुरक्षित अगले कदम',
    'Local rules found no common red flags. That does not mean the message is safe.': 'स्थानीय नियमों को आम चेतावनी संकेत नहीं मिले। इसका मतलब यह नहीं कि संदेश सुरक्षित है।',
    'This is automated guidance, not proof. It cannot tell if a link or a person is safe or criminal.': 'यह स्वचालित मार्गदर्शन है, प्रमाण नहीं। यह नहीं बता सकता कि कोई लिंक या व्यक्ति सुरक्षित है या अपराधी।',
    'Analyzing...': 'विश्लेषण हो रहा है...',
    /* AI consent */
    'Send to cloud AI?': 'क्लाउड AI को भेजें?',
    'This exact text will be sent over the internet to an AI service (Golden Hour server function, then Groq). Nothing else from your case is sent.': 'यही टेक्स्ट इंटरनेट के ज़रिए AI सेवा (Golden Hour सर्वर फ़ंक्शन, फिर Groq) को भेजा जाएगा। आपके केस का और कुछ नहीं भेजा जाएगा।',
    'Hide personal details (phone numbers, emails) before sending': 'भेजने से पहले निजी जानकारी (फ़ोन नंबर, ईमेल) छिपाएं',
    'OTPs, PINs, passwords, card and ID numbers are always hidden.': 'OTP, PIN, पासवर्ड, कार्ड और ID नंबर हमेशा छिपाए जाते हैं।',
    'Send': 'भेजें',
    'You are offline. Everything else still works. Try AI again when you are connected.': 'आप ऑफ़लाइन हैं। बाकी सब काम करता है। कनेक्ट होने पर AI फिर आज़माएं।',
    'The AI service is not set up here. Add your Supabase details in config.js and deploy the scam-analyze function.': 'यहाँ AI सेवा सेट नहीं है। config.js में Supabase विवरण जोड़ें और scam-analyze फ़ंक्शन डिप्लॉय करें।',
    'The AI took too long. Please try again.': 'AI ने बहुत समय लिया। कृपया फिर कोशिश करें।',
    'Too many requests right now. Wait a minute and try again.': 'अभी बहुत अनुरोध हैं। एक मिनट रुककर फिर कोशिश करें।',
    'The AI sent a reply we could not read. Nothing was changed. Try again.': 'AI का उत्तर पढ़ा नहीं जा सका। कुछ नहीं बदला। फिर कोशिश करें।',
    'The AI service had a problem. Your case is unaffected.': 'AI सेवा में समस्या आई। आपका केस प्रभावित नहीं हुआ।',
    'Hidden before sending: {n} item(s)': 'भेजने से पहले छिपाए गए: {n} आइटम',
    /* privacy */
    'What stays on this device': 'क्या इस डिवाइस पर रहता है',
    'Cases, timelines, tasks, evidence files, drafts, follow-up notes and audit history are stored in this browser (IndexedDB). There is no login.': 'केस, समय-रेखा, कार्य, सबूत फ़ाइलें, ड्राफ़्ट, फ़ॉलो-अप नोट्स और जांच इतिहास इसी ब्राउज़र (IndexedDB) में रखे जाते हैं। कोई लॉगिन नहीं।',
    'What can leave this device': 'क्या इस डिवाइस से बाहर जा सकता है',
    'Only text you review and approve for cloud AI, and any official link you open yourself. Clearing browser data or switching devices can remove your cases.': 'केवल वह टेक्स्ट जिसे आप देखकर क्लाउड AI के लिए मंज़ूर करते हैं, और कोई आधिकारिक लिंक जो आप खुद खोलते हैं। ब्राउज़र डेटा साफ़ करने या डिवाइस बदलने से आपके केस हट सकते हैं।',
    'Demo mode': 'डेमो मोड',
    'Load demo cases': 'डेमो केस लोड करें',
    'Reset demo data': 'डेमो डेटा रीसेट करें',
    'Demo cases are synthetic and clearly labeled.': 'डेमो केस बनावटी हैं और साफ़ चिह्नित हैं।',
    'Demo cases loaded': 'डेमो केस लोड हुए',
    'Clear all local data': 'सारा लोकल डेटा साफ़ करें',
    'Clear all local data?': 'क्या सारा लोकल डेटा साफ़ करें?',
    'This deletes every case, evidence file, note and audit saved by these tools in this browser. It cannot be undone.': 'इससे इन टूल्स द्वारा इस ब्राउज़र में सहेजे गए सभी केस, सबूत फ़ाइलें, नोट्स और जांच हट जाएंगे। इसे वापस नहीं किया जा सकता।',
    'All local data cleared': 'सारा लोकल डेटा साफ़ हुआ',
    'Clear everything': 'सब साफ़ करें',
    'Storage is not available in this browser (private mode?). Emergency links still work.': 'इस ब्राउज़र में स्टोरेज उपलब्ध नहीं (प्राइवेट मोड?)। आपातकालीन लिंक फिर भी काम करते हैं।',
    /* complaint template */
    'To: The Officer In-charge, Cyber Crime Cell': 'सेवा में: प्रभारी अधिकारी, साइबर क्राइम सेल',
    'Subject: Complaint regarding {type}': 'विषय: {type} के संबंध में शिकायत',
    'I wish to report the following cyber incident.': 'मैं निम्नलिखित साइबर घटना की शिकायत दर्ज कराना चाहता/चाहती हूँ।',
    'Incident type': 'घटना का प्रकार',
    'Date and time of incident': 'घटना की तारीख और समय',
    'Amount involved': 'शामिल राशि',
    'Transaction / reference': 'ट्रांज़ैक्शन / संदर्भ',
    'Suspect contact details (as received)': 'संदिग्ध के संपर्क विवरण (जैसे प्राप्त हुए)',
    'Links (as received)': 'लिंक (जैसे प्राप्त हुए)',
    'Description': 'विवरण',
    'Timeline': 'समय-रेखा',
    'Evidence available with me': 'मेरे पास उपलब्ध सबूत',
    'I request appropriate action. The details above are as provided by me and I have not independently verified them.': 'मैं उचित कार्रवाई का अनुरोध करता/करती हूँ। ऊपर दिए विवरण मेरे द्वारा दिए गए हैं और मैंने उनकी स्वतंत्र पुष्टि नहीं की है।',
    'Name': 'नाम',
    'Prepared with Golden Hour. This has not been submitted to any authority.': 'Golden Hour की मदद से तैयार। यह किसी प्राधिकरण को जमा नहीं किया गया है।',
    'Evidence index': 'सबूत सूची',
    'Items marked Unknown were not provided. Evidence is listed as added by the user; authenticity is not verified.': 'अज्ञात चिह्नित बातें उपलब्ध नहीं कराई गईं। सबूत उपयोगकर्ता द्वारा जोड़े गए हैं; उनकी प्रामाणिकता सत्यापित नहीं है।',
    'Case ID': 'केस ID',
    'None': 'कोई नहीं'
  };
  Object.keys(hi).forEach(function (k) { GHX.hi[k] = hi[k]; });
})();
(function () {
  'use strict';
  var hi = window.GHX.hi;
  hi['Multi-factor login'] = 'मल्टी-फ़ैक्टर लॉगिन';
  hi['Account recovery'] = 'अकाउंट रिकवरी';
  hi['Device updates'] = 'डिवाइस अपडेट';
  hi['App permissions'] = 'ऐप अनुमतियाँ';
  hi['Payment verification'] = 'भुगतान सत्यापन';
  hi['Phishing awareness'] = 'फ़िशिंग जागरूकता';
  hi['Toolkit sections'] = 'टूलकिट अनुभाग';
  hi['Keeps working offline: emergency links and your local cases. Only AI needs the internet.'] = 'ऑफ़लाइन भी चलता है: आपातकालीन लिंक और आपके लोकल केस। केवल AI को इंटरनेट चाहिए।';
  hi['File'] = 'फ़ाइल'; hi['Type'] = 'प्रकार'; hi['Added'] = 'जोड़ा गया';
})();

/* ===== db.js ===== */
/* Golden Hour - features/db.js
   IndexedDB store for the new no-login workspace. Separate database from app.js's localStorage case,
   so the existing flow is never read, written or broken. Nothing here touches the network. */
(function () {
  'use strict';
  var GHX = window.GHX, DB = 'goldenHourLocal', conn = null;

  function open() {
    if (conn) return Promise.resolve(conn);
    return new Promise(function (res, rej) {
      if (!window.indexedDB) return rej(new Error('no-idb'));
      var r;
      try { r = indexedDB.open(DB, 1); } catch (e) { return rej(e); }
      r.onupgradeneeded = function () {
        var d = r.result;
        if (!d.objectStoreNames.contains('cases')) d.createObjectStore('cases', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('audits')) d.createObjectStore('audits', { keyPath: 'id' });
      };
      r.onsuccess = function () { conn = r.result; res(conn); };
      r.onerror = function () { rej(r.error || new Error('idb-open')); };
      r.onblocked = function () { rej(new Error('idb-blocked')); };
    });
  }
  function run(store, mode, fn) {
    return open().then(function (d) {
      return new Promise(function (res, rej) {
        var tx = d.transaction(store, mode), out;
        try { out = fn(tx.objectStore(store)); } catch (e) { return rej(e); }
        tx.oncomplete = function () { res(out && 'result' in out ? out.result : undefined); };
        tx.onerror = tx.onabort = function () { rej(tx.error || new Error('idb-tx')); };
      });
    });
  }

  GHX.db = {
    ready: function () { return open().then(function () { return true; }, function () { return false; }); },
    putCase: function (c) { c.updatedAt = new Date().toISOString(); return run('cases', 'readwrite', function (s) { return s.put(c); }); },
    getCase: function (id) { return run('cases', 'readonly', function (s) { return s.get(id); }); },
    listCases: function () {
      return run('cases', 'readonly', function (s) { return s.getAll(); }).then(function (a) {
        return (a || []).sort(function (x, y) { return (y.updatedAt || '').localeCompare(x.updatedAt || ''); });
      });
    },
    deleteCase: function (id) { return run('cases', 'readwrite', function (s) { return s.delete(id); }); },
    putAudit: function (a) { return run('audits', 'readwrite', function (s) { return s.put(a); }); },
    listAudits: function () {
      return run('audits', 'readonly', function (s) { return s.getAll(); }).then(function (a) {
        return (a || []).sort(function (x, y) { return y.at.localeCompare(x.at); });
      });
    },
    clearAll: function () {
      return run('cases', 'readwrite', function (s) { return s.clear(); }).then(function () {
        return run('audits', 'readwrite', function (s) { return s.clear(); });
      });
    },
    deleteDemo: function () {
      return GHX.db.listCases().then(function (a) {
        return Promise.all(a.filter(function (c) { return c.demo; }).map(function (c) { return GHX.db.deleteCase(c.id); }));
      });
    }
  };
})();

/* ===== ai.js ===== */
/* Golden Hour - features/ai.js
   Redaction + consent + safe call to the NEW Supabase Edge Function `scam-analyze`.
   The Groq key never appears in the browser. Nothing is sent unless the user approves the exact text. */
(function () {
  'use strict';
  var GHX = window.GHX, h = GHX.h;

  /* secrets are ALWAYS hidden; personal details hidden when opts.personal is true */
  GHX.redact = function (text, opts) {
    var n = 0, s = String(text || '');
    var rep = function (re, to) { s = s.replace(re, function () { n++; return typeof to === 'function' ? to.apply(null, arguments) : to; }); };
    rep(/\b(otp|pin|cvv|cvc|mpin|upi\s*pin|password|passcode|pwd)\b(\s*(?:is|:|=|-)?\s*)([^\s,;]+)/gi, function (m, k, sep) { return k + sep + '[HIDDEN]'; });
    rep(/\b(one[- ]time password|verification code|security code|code)\b([^\d\n]{0,20})(\d{4,8})\b/gi, function (m, k, mid) { return k + mid + '[HIDDEN]'; });
    rep(/\b(?:\d[ -]?){12,18}\d\b/g, '[CARD HIDDEN]');
    rep(/\b\d{4}[ -]\d{4}[ -]\d{4}\b|\b\d{12}\b/g, '[ID HIDDEN]');
    rep(/\b[A-Z]{5}\d{4}[A-Z]\b/g, '[PAN HIDDEN]');
    if (opts && opts.personal) {
      rep(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[EMAIL HIDDEN]');
      rep(/(?:\+?91[\s-]?)?\b[6-9]\d{4}[\s-]?\d{5}\b/g, '[PHONE HIDDEN]');
    }
    return { text: s, count: n };
  };

  /* Consent dialog. Resolves to the final text to send, or null if cancelled. */
  GHX.ai = {};
  GHX.ai.consent = function (rawText) {
    return new Promise(function (resolve) {
      var personal = h('input', { type: 'checkbox', checked: true });
      var preview = h('textarea', { rows: 8, readonly: true, 'aria-label': GHX.t('Send to cloud AI?') });
      var info = h('p', { class: 'muted small', role: 'status' });
      var update = function () {
        var r = GHX.redact(rawText, { personal: personal.checked });
        preview.value = r.text;
        info.textContent = GHX.t('Hidden before sending: {n} item(s)', { n: r.count });
        return r.text;
      };
      personal.addEventListener('change', update);
      var node = h('div', {}, [
        h('p', { class: 'muted', text: GHX.t('This exact text will be sent over the internet to an AI service (Golden Hour server function, then Groq). Nothing else from your case is sent.') }),
        h('label', { class: 'check' }, [personal, h('span', { text: GHX.t('Hide personal details (phone numbers, emails) before sending') })]),
        h('p', { class: 'muted small', text: GHX.t('OTPs, PINs, passwords, card and ID numbers are always hidden.') }),
        preview, info
      ]);
      update();
      var dlg = h('dialog', { class: 'ghx-dialog' });
      var done = false;
      var finish = function (v) { if (done) return; done = true; dlg.close(); dlg.remove(); resolve(v); };
      dlg.appendChild(h('h2', { text: GHX.t('Send to cloud AI?') }));
      dlg.appendChild(node);
      dlg.appendChild(h('div', { class: 'actions' }, [
        h('button', { class: 'btn btn-primary', type: 'button', text: GHX.t('Send'), onclick: function () { finish(update()); } }),
        h('button', { class: 'btn btn-quiet', type: 'button', text: GHX.t('Cancel'), onclick: function () { finish(null); } })
      ]));
      dlg.addEventListener('cancel', function (e) { e.preventDefault(); finish(null); });
      if (!dlg.showModal) { resolve(window.confirm(GHX.t('Send to cloud AI?') + '\n\n' + update()) ? update() : null); return; }
      document.body.appendChild(dlg); dlg.showModal();
    });
  };

  /* POST to the Edge Function. Always resolves {ok:true,data} or {ok:false,message}; never throws. */
  GHX.ai.call = function (task, text, extra) {
    var t = GHX.t;
    if (!navigator.onLine) return Promise.resolve({ ok: false, message: t('You are offline. Everything else still works. Try AI again when you are connected.') });
    var cfg = GHX.getConfig();
    if (!cfg.url || !cfg.key) return Promise.resolve({ ok: false, message: t('The AI service is not set up here. Add your Supabase details in config.js and deploy the scam-analyze function.') });
    var ctl = new AbortController(), timer = setTimeout(function () { ctl.abort(); }, 25000);
    return fetch(cfg.url + '/functions/v1/scam-analyze', {
      method: 'POST', signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', apikey: cfg.key, Authorization: 'Bearer ' + cfg.key },
      body: JSON.stringify({ task: task, text: text, lang: GHX.lang, extra: extra || {} })
    }).then(function (r) {
      if (r.status === 429) return { ok: false, message: t('Too many requests right now. Wait a minute and try again.') };
      if (!r.ok) return { ok: false, message: t('The AI service had a problem. Your case is unaffected.') };
      return r.json().then(function (d) {
        return d && typeof d === 'object' && !d.error ? { ok: true, data: d } : { ok: false, message: t('The AI sent a reply we could not read. Nothing was changed. Try again.') };
      }, function () { return { ok: false, message: t('The AI sent a reply we could not read. Nothing was changed. Try again.') }; });
    }).catch(function (e) {
      return { ok: false, message: e && e.name === 'AbortError' ? t('The AI took too long. Please try again.') : t('The AI service had a problem. Your case is unaffected.') };
    }).then(function (x) { clearTimeout(timer); return x; });
  };
})();

/* ===== incidents.js ===== */
/* Golden Hour - features/incidents.js
   Incident-specific guidance (EN + HI). Different crime types get different advice on purpose.
   Deterministic data: no AI involved in emergency routing. */
(function () {
  'use strict';
  var GHX = window.GHX;
  var L = function (en, hi) { return { en: en, hi: hi }; };

  GHX.incidents = [
    { id: 'financial', label: 'Financial fraud (money lost)',
      urgent: L([
        'Call 1930 now. Fast reporting gives the best chance that your bank can act on the transaction.',
        "Call your bank using the number on your card or in its official app. Tell them it was fraud and ask what they can flag or block.",
        'Report on the National Cyber Crime Reporting Portal.',
        'Do not pay anyone who offers to "recover" your money.'
      ], [
        'अभी 1930 पर कॉल करें। जल्दी रिपोर्ट करने पर बैंक के कार्रवाई कर पाने की संभावना बेहतर रहती है।',
        'अपने कार्ड पर या बैंक के आधिकारिक ऐप में दिए नंबर से बैंक को कॉल करें। बताएं कि यह धोखाधड़ी है और पूछें कि वे क्या फ़्लैग या ब्लॉक कर सकते हैं।',
        'राष्ट्रीय साइबर अपराध रिपोर्टिंग पोर्टल पर शिकायत करें।',
        'जो कोई आपका पैसा "वापस दिलाने" की बात करे, उसे भुगतान न करें।'
      ]),
      tasks: L([
        'Call 1930', 'Call your bank or UPI app support (official number only)', 'Note the transaction ID and time',
        'Save screenshots of messages, receipts and the scammer\'s details', 'Stop all contact; do not send more money', 'Prepare and submit the complaint on the official portal'
      ], [
        '1930 पर कॉल करें', 'बैंक या UPI ऐप सपोर्ट को कॉल करें (केवल आधिकारिक नंबर)', 'ट्रांज़ैक्शन ID और समय नोट करें',
        'संदेशों, रसीदों और ठग के विवरण के स्क्रीनशॉट सहेजें', 'सारा संपर्क बंद करें; और पैसे न भेजें', 'आधिकारिक पोर्टल पर शिकायत तैयार करें और जमा करें'
      ]) },
    { id: 'account', label: 'Account compromise (hacked account)',
      urgent: L([
        "From a device you trust, change the password and turn on multi-factor authentication.",
        'Sign out of all other devices and check the recovery email and phone number.',
        'If money or a payment app is involved, call 1930 and your bank now.',
        'Warn your contacts that messages from the account may not be from you.'
      ], [
        'किसी भरोसेमंद डिवाइस से पासवर्ड बदलें और मल्टी-फ़ैक्टर ऑथेंटिकेशन चालू करें।',
        'बाकी सभी डिवाइस से साइन-आउट करें और रिकवरी ईमेल व फ़ोन नंबर जांचें।',
        'अगर पैसा या पेमेंट ऐप शामिल है, तो अभी 1930 और अपने बैंक को कॉल करें।',
        'अपने संपर्कों को बताएं कि अकाउंट से आए संदेश आपके नहीं हो सकते।'
      ]),
      tasks: L([
        'Change the password from a trusted device', 'Turn on multi-factor authentication', 'Sign out all other sessions',
        'Check recovery email, phone and forwarding rules', 'Use the platform\'s official account-recovery page', 'Warn contacts', 'Report on the official portal'
      ], [
        'भरोसेमंद डिवाइस से पासवर्ड बदलें', 'मल्टी-फ़ैक्टर ऑथेंटिकेशन चालू करें', 'बाकी सभी सेशन से साइन-आउट करें',
        'रिकवरी ईमेल, फ़ोन और फ़ॉरवर्डिंग नियम जांचें', 'प्लेटफ़ॉर्म का आधिकारिक रिकवरी पेज इस्तेमाल करें', 'संपर्कों को चेतावनी दें', 'आधिकारिक पोर्टल पर रिपोर्ट करें'
      ]) },
    { id: 'phishing', label: 'Phishing (fake link, call or message)',
      urgent: L([
        'Do not click, reply or call back. Do not open links in the message.',
        'If you typed a password, change it now and turn on multi-factor authentication.',
        'If you shared card or bank details, call 1930 and your bank immediately.',
        'Save the message as it is (screenshot) before you delete anything.'
      ], [
        'क्लिक, जवाब या वापस कॉल न करें। संदेश में दिए लिंक न खोलें।',
        'अगर आपने पासवर्ड डाला है तो उसे अभी बदलें और मल्टी-फ़ैक्टर ऑथेंटिकेशन चालू करें।',
        'अगर आपने कार्ड या बैंक विवरण दिए हैं, तो तुरंत 1930 और अपने बैंक को कॉल करें।',
        'कुछ भी हटाने से पहले संदेश का स्क्रीनशॉट सहेजें।'
      ]),
      tasks: L([
        'Do not click or reply', 'Screenshot the message and sender details', 'Change any password you entered',
        'Call 1930 and your bank if money or card details were involved', 'Block the sender after saving evidence', 'Report on the official portal'
      ], [
        'क्लिक या जवाब न दें', 'संदेश और भेजने वाले के विवरण का स्क्रीनशॉट लें', 'जो पासवर्ड डाला उसे बदलें',
        'पैसा या कार्ड विवरण शामिल हो तो 1930 और बैंक को कॉल करें', 'सबूत सहेजने के बाद भेजने वाले को ब्लॉक करें', 'आधिकारिक पोर्टल पर रिपोर्ट करें'
      ]) },
    { id: 'impersonation', label: 'Impersonation (fake profile or person)',
      urgent: L([
        'Do not send money or codes. Contact the real person on a number you already know.',
        'Save the fake profile link, username and screenshots before reporting it.',
        "Report the fake profile inside the app or website.",
        'If money was sent, call 1930 and your bank now.'
      ], [
        'पैसे या कोड न भेजें। असली व्यक्ति से उस नंबर पर संपर्क करें जो आपके पास पहले से है।',
        'रिपोर्ट करने से पहले नकली प्रोफ़ाइल का लिंक, यूज़रनेम और स्क्रीनशॉट सहेजें।',
        'ऐप या वेबसाइट के अंदर नकली प्रोफ़ाइल की रिपोर्ट करें।',
        'अगर पैसा भेजा गया है, तो अभी 1930 और अपने बैंक को कॉल करें।'
      ]),
      tasks: L([
        'Verify with the real person on a known number', 'Save profile link, username and screenshots', 'Report the profile on the platform',
        'Tell friends and family not to trust the fake profile', 'Call 1930 if money was sent', 'Report on the official portal'
      ], [
        'जाने-पहचाने नंबर पर असली व्यक्ति से पुष्टि करें', 'प्रोफ़ाइल लिंक, यूज़रनेम और स्क्रीनशॉट सहेजें', 'प्लेटफ़ॉर्म पर प्रोफ़ाइल की रिपोर्ट करें',
        'मित्रों और परिवार को बताएं कि नकली प्रोफ़ाइल पर भरोसा न करें', 'पैसा भेजा हो तो 1930 पर कॉल करें', 'आधिकारिक पोर्टल पर रिपोर्ट करें'
      ]) },
    { id: 'extortion', label: 'Extortion or harassment',
      urgent: L([
        'If you are in immediate danger, call 112.',
        'Do not pay and do not delete the conversation. Take screenshots first.',
        'Tell someone you trust. You are not at fault.',
        'Report on the official portal. The portal has options for sensitive cases; check its FAQ.'
      ], [
        'अगर आप तत्काल खतरे में हैं, तो 112 पर कॉल करें।',
        'भुगतान न करें और बातचीत न हटाएं। पहले स्क्रीनशॉट लें।',
        'किसी भरोसेमंद व्यक्ति को बताएं। इसमें आपकी कोई गलती नहीं है।',
        'आधिकारिक पोर्टल पर रिपोर्ट करें। संवेदनशील मामलों के विकल्प पोर्टल के FAQ में देखें।'
      ]),
      tasks: L([
        'Do not pay or negotiate', 'Screenshot threats with dates, usernames and numbers', 'Tell a trusted person',
        'Lock down privacy settings on your accounts', 'Block the account after saving evidence', 'Report on the official portal'
      ], [
        'भुगतान या मोलभाव न करें', 'तारीख, यूज़रनेम और नंबर सहित धमकियों के स्क्रीनशॉट लें', 'किसी भरोसेमंद व्यक्ति को बताएं',
        'अपने अकाउंट की प्राइवेसी सेटिंग्स सख़्त करें', 'सबूत सहेजने के बाद अकाउंट को ब्लॉक करें', 'आधिकारिक पोर्टल पर रिपोर्ट करें'
      ]) },
    { id: 'other', label: 'Other cybercrime',
      urgent: L([
        'Save evidence now: screenshots, links, usernames, phone numbers and dates.',
        'Secure any account involved: change passwords and turn on multi-factor authentication.',
        'Report on the National Cyber Crime Reporting Portal.',
        'If money was lost, call 1930 too.'
      ], [
        'अभी सबूत सहेजें: स्क्रीनशॉट, लिंक, यूज़रनेम, फ़ोन नंबर और तारीखें।',
        'शामिल हर अकाउंट सुरक्षित करें: पासवर्ड बदलें और मल्टी-फ़ैक्टर ऑथेंटिकेशन चालू करें।',
        'राष्ट्रीय साइबर अपराध रिपोर्टिंग पोर्टल पर रिपोर्ट करें।',
        'अगर पैसा गया है, तो 1930 पर भी कॉल करें।'
      ]),
      tasks: L([
        'Save screenshots, links and dates', 'Secure involved accounts', 'Write down what happened and when', 'Report on the official portal'
      ], [
        'स्क्रीनशॉट, लिंक और तारीखें सहेजें', 'शामिल अकाउंट सुरक्षित करें', 'क्या हुआ और कब, लिख लें', 'आधिकारिक पोर्टल पर रिपोर्ट करें'
      ]) }
  ];
  GHX.incident = function (id) { return GHX.incidents.filter(function (i) { return i.id === id; })[0] || GHX.incidents[5]; };
  GHX.pick = function (o) { return o[GHX.lang === 'hi' ? 'hi' : 'en']; };
})();

/* ===== emergency.js ===== */
/* Golden Hour - features/emergency.js
   P0: always-visible emergency help. Injects (1) a card at the top of <main> and (2) a fixed bottom bar
   on small screens. No time cutoff. Works with no AI, no Supabase and no stored case. */
(function () {
  'use strict';
  var GHX = window.GHX, h = GHX.h, t = GHX.t, L = GHX.LINKS;
  var card, bar, sel = 'financial';
  var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

  function ext(href, text, cls) { return h('a', { class: 'btn ' + (cls || 'btn-quiet'), href: href, target: '_blank', rel: 'noopener noreferrer', text: text }); }

  function copy(text, btn) {
    var ok = function () { var o = btn.textContent; btn.textContent = t('Copied'); setTimeout(function () { btn.textContent = o; }, 1600); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, function () { GHX.toast(text); });
    else GHX.toast(text);
  }
  GHX.copyText = function (text, onDone) {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(onDone, function () {});
  };

  function callControl() {
    if (coarse) return h('a', { class: 'btn btn-danger ghx-call', href: 'tel:' + L.phone, text: t('Call 1930') });
    var b = h('button', { class: 'btn btn-quiet', type: 'button', text: t('Copy 1930') });
    b.addEventListener('click', function () { copy(L.phone, b); });
    return h('span', { class: 'ghx-callwrap' }, [h('strong', { class: 'ghx-number', text: '1930' }), b]);
  }

  function steps(id) {
    var inc = GHX.incident(id);
    return h('ol', { class: 'ghx-steps' }, GHX.pick(inc.urgent).map(function (s) { return h('li', { text: s }); }));
  }
  GHX.urgentSteps = steps;

  function renderCard() {
    GHX.clear(card);
    card.setAttribute('lang', GHX.lang);
    var select = h('select', { id: 'ghxIncidentSel', 'aria-label': t('What happened to you?') },
      GHX.incidents.map(function (i) { return h('option', { value: i.id, text: t(i.label), selected: i.id === sel }); }));
    select.addEventListener('change', function () { sel = select.value; GHX.clear(stepsBox).appendChild(steps(sel)); });
    var stepsBox = h('div', { class: 'ghx-stepsbox', 'aria-live': 'polite' }, [steps(sel)]);
    card.appendChild(h('div', { class: 'ghx-em-head' }, [
      h('h2', { text: t('Financial cyber fraud? Call 1930 now.') }),
      h('p', { text: t("Report promptly. Don't wait for Golden Hour to finish.") })
    ]));
    card.appendChild(h('div', { class: 'ghx-em-actions' }, [
      callControl(),
      ext(L.portal, t('Open National Cyber Crime Reporting Portal'), 'btn-primary'),
      ext(L.status, t('Check complaint status'))
    ]));
    card.appendChild(h('p', { class: 'ghx-em-note', text: t("It's never too late to report. These options stay open even if it happened hours, days or months ago.") }));
    card.appendChild(h('div', { class: 'ghx-em-pick' }, [
      h('label', { for: 'ghxIncidentSel', text: t('What happened to you?') }), select,
      h('h3', { text: t('First steps for this situation') }), stepsBox,
      h('button', { class: 'btn btn-quiet', type: 'button', text: t('Open my case workspace'), onclick: function () { if (GHX.openToolkit) GHX.openToolkit('cases'); } })
    ]));
  }

  function renderBar() {
    GHX.clear(bar);
    bar.setAttribute('lang', GHX.lang);
    bar.setAttribute('aria-label', t('Emergency help'));
    bar.appendChild(h('a', { class: 'ghx-b-call', href: 'tel:' + L.phone, text: t('Call') + ' 1930' }));
    bar.appendChild(h('a', { href: L.portal, target: '_blank', rel: 'noopener noreferrer', text: t('Portal') }));
    bar.appendChild(h('a', { href: L.status, target: '_blank', rel: 'noopener noreferrer', text: t('Status') }));
  }

  function mount() {
    var main = document.getElementById('main');
    card = h('section', { class: 'ghx-emergency', id: 'ghxEmergency', 'aria-labelledby': 'ghxEmH' });
    bar = h('nav', { class: 'ghx-bar no-print' });
    if (main) main.insertBefore(card, main.firstChild); else document.body.insertBefore(card, document.body.firstChild);
    document.body.appendChild(bar);
    renderCard(); renderBar();
    var hd = card.querySelector('h2'); if (hd) hd.id = 'ghxEmH';
  }
  GHX.on('lang', function () { if (card) { renderCard(); renderBar(); var hd = card.querySelector('h2'); if (hd) hd.id = 'ghxEmH'; } });
  GHX.mountEmergency = mount;
})();

/* ===== cases.js ===== */
/* Golden Hour - features/cases.js
   P0: local, no-login case workspace (create / save / reopen / update / delete) on IndexedDB.
   Registers the "My cases" tab and the Organize, Tasks and Evidence sections of a case. */
(function () {
  'use strict';
  var GHX = window.GHX, h = GHX.h, t = GHX.t;
  var MAX_FILE = 8 * 1024 * 1024;
  var current = null; // open case id

  function newCase(type, happenedAt, now, demo) {
    var inc = GHX.incident(type);
    return {
      id: GHX.caseId(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), demo: !!demo,
      type: type, happenedAt: happenedAt || '', nowHappening: now || 'unsure',
      facts: { amount: '', reference: '', contacts: '', urls: '', narrative: '' },
      timeline: [], tasks: inc.tasks.en.map(function (_, i) { return { idx: i, done: false }; }),
      evidence: [], draft: { lang: GHX.lang, text: '', edited: false },
      tracker: { ack: '', ackDate: '', status: 'not_filed', notes: [] }
    };
  }
  GHX.newCase = newCase;

  /* ---------- list view ---------- */
  function renderList(box) {
    GHX.clear(box);
    box.appendChild(h('p', { class: 'muted', text: t('No account needed. Cases are saved in this browser only.') }));

    var type = h('select', { id: 'ghxNewType' }, GHX.incidents.map(function (i) { return h('option', { value: i.id, text: t(i.label) }); }));
    var when = h('input', { id: 'ghxNewWhen', type: 'datetime-local', value: GHX.toLocalInput(), max: GHX.toLocalInput() });
    var now = h('select', { id: 'ghxNewNow' }, [
      h('option', { value: 'ongoing', text: t('It is still going on (calls, threats, payments)') }),
      h('option', { value: 'stopped', text: t('It has stopped') }),
      h('option', { value: 'unsure', text: t("I'm not sure"), selected: true })
    ]);
    var form = h('form', { class: 'card ghx-form', autocomplete: 'off' }, [
      h('h3', { text: t('Start a case') }),
      h('label', { for: 'ghxNewType', text: t('Incident type') }), type,
      h('label', { for: 'ghxNewWhen', text: t('When did it happen?') }), when,
      h('label', { for: 'ghxNewNow', text: t("What's happening now?") }), now,
      h('div', { class: 'actions' }, [h('button', { class: 'btn btn-primary', type: 'submit', text: t('Create case') })])
    ]);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var c = newCase(type.value, when.value ? new Date(when.value).toISOString() : '', now.value, false);
      GHX.db.putCase(c).then(function () { current = c.id; GHX.rerenderTab(); }, function () { GHX.toast(t('Could not save. Browser storage may be full or blocked.')); });
    });
    box.appendChild(form);

    var list = h('ul', { class: 'ghx-caselist' });
    box.appendChild(list);
    GHX.db.listCases().then(function (cases) {
      if (!cases.length) { list.appendChild(h('li', { class: 'ghx-empty', text: t('No cases yet. Start one, or load demo cases to try the app.') })); return; }
      cases.forEach(function (c) {
        list.appendChild(h('li', { class: 'card ghx-caseitem' }, [
          h('div', {}, [
            h('strong', { text: c.id }), c.demo ? h('span', { class: 'ghx-chip demo', text: 'DEMO' }) : null,
            h('div', { class: 'muted small', text: t(GHX.incident(c.type).label) + ' · ' + t('Updated') + ' ' + GHX.fmtDate(c.updatedAt) })
          ]),
          h('div', { class: 'actions' }, [
            h('button', { class: 'btn btn-quiet', type: 'button', text: t('Open'), onclick: function () { current = c.id; GHX.rerenderTab(); } }),
            h('button', { class: 'btn btn-quiet', type: 'button', text: t('Delete'), onclick: function () { removeCase(c.id); } })
          ])
        ]));
      });
    }, function () { list.appendChild(h('li', { class: 'notice warn', text: t('Storage is not available in this browser (private mode?). Emergency links still work.') })); });
  }

  function removeCase(id) {
    return GHX.confirm({ title: t('Delete this case?'), message: t('This removes the case, its evidence files and notes from this browser. It cannot be undone.'), ok: t('Delete'), danger: true })
      .then(function (yes) { if (!yes) return; return GHX.db.deleteCase(id).then(function () { if (current === id) current = null; GHX.rerenderTab(); }); });
  }

  /* ---------- detail view ---------- */
  var sectionId = 'organize';
  function renderDetail(box, c) {
    GHX.clear(box);
    var status = h('span', { class: 'muted small', role: 'status', 'aria-live': 'polite' });
    var persist = function () {
      return GHX.db.putCase(c).then(function () { status.textContent = t('Saved on this device'); }, function () { status.textContent = t('Could not save. Browser storage may be full or blocked.'); });
    };
    var api = { save: GHX.debounce(persist, 350), now: persist, goto: function (id) { sectionId = id; drawSection(); drawTabs(); } };

    box.appendChild(h('div', { class: 'ghx-casehead' }, [
      h('button', { class: 'btn btn-quiet', type: 'button', text: '← ' + t('Back to cases'), onclick: function () { api.now().then(function () { current = null; GHX.rerenderTab(); }); } }),
      h('div', {}, [h('h3', { text: c.id }), h('span', { class: 'muted small', text: t(GHX.incident(c.type).label) + ' · ' + GHX.fmtDate(c.happenedAt) })]),
      status,
      h('button', { class: 'btn btn-quiet', type: 'button', text: t('Delete this case'), onclick: function () { removeCase(c.id); } })
    ]));
    if (c.demo) box.appendChild(h('p', { class: 'notice warn', text: t('DEMO: synthetic data, not a real case.') }));

    var urgent = h('details', { class: 'card ghx-urgent', open: true }, [
      h('summary', { text: t('First steps for this situation') }), GHX.urgentSteps(c.type),
      h('div', { class: 'actions' }, [
        h('a', { class: 'btn btn-danger', href: 'tel:' + GHX.LINKS.phone, text: t('Call 1930') }),
        h('a', { class: 'btn btn-quiet', href: GHX.LINKS.portal, target: '_blank', rel: 'noopener noreferrer', text: t('Open National Cyber Crime Reporting Portal') }),
        h('a', { class: 'btn btn-quiet', href: GHX.LINKS.status, target: '_blank', rel: 'noopener noreferrer', text: t('Check complaint status') })
      ])
    ]);
    box.appendChild(urgent);

    var tabs = h('div', { class: 'ghx-subtabs', role: 'tablist' });
    var body = h('div', { class: 'ghx-section', role: 'tabpanel' });
    box.appendChild(tabs); box.appendChild(body);

    function drawTabs() {
      GHX.clear(tabs);
      GHX.caseSections.forEach(function (s) {
        var b = h('button', { role: 'tab', type: 'button', 'aria-selected': s.id === sectionId ? 'true' : 'false', text: t(s.label), onclick: function () { sectionId = s.id; drawSection(); drawTabs(); } });
        tabs.appendChild(b);
      });
    }
    function drawSection() {
      GHX.clear(body);
      var s = GHX.caseSections.filter(function (x) { return x.id === sectionId; })[0] || GHX.caseSections[0];
      s.render(body, c, api);
    }
    drawTabs(); drawSection();
  }

  /* ---------- section: Organize (facts + timeline) ---------- */
  function field(id, label, input) { return [h('label', { for: id, text: label }), input]; }

  GHX.caseSections.push({ id: 'organize', label: 'Organize', render: function (box, c, api) {
    box.appendChild(h('p', { class: 'notice', text: t('Leave a field blank if you do not know it. It will be marked Unknown. Never type OTPs, PINs, passwords or full card numbers.') }));
    var bind = function (key, el) { el.addEventListener('input', function () { c.facts[key] = el.value; api.save(); }); return el; };
    var amount = bind('amount', h('input', { id: 'ghxAmt', type: 'number', min: '0', inputmode: 'numeric', value: c.facts.amount }));
    var ref = bind('reference', h('input', { id: 'ghxRef', type: 'text', value: c.facts.reference, autocomplete: 'off' }));
    var contacts = bind('contacts', h('textarea', { id: 'ghxCon', rows: 2 })); contacts.value = c.facts.contacts;
    var urls = bind('urls', h('textarea', { id: 'ghxUrl', rows: 2 })); urls.value = c.facts.urls;
    var story = bind('narrative', h('textarea', { id: 'ghxStory', rows: 5 })); story.value = c.facts.narrative;
    var when = h('input', { id: 'ghxWhen', type: 'datetime-local', value: c.happenedAt ? GHX.toLocalInput(new Date(c.happenedAt)) : '' });
    when.addEventListener('change', function () { c.happenedAt = when.value ? new Date(when.value).toISOString() : ''; api.save(); });

    var facts = h('div', { class: 'card ghx-form' }, [h('h3', { text: t('Facts') })]
      .concat(field('ghxWhen', t('When did it happen?'), when))
      .concat([h('div', { class: 'row' }, [h('div', {}, field('ghxAmt', t('Amount lost (Rs.)'), amount)), h('div', {}, field('ghxRef', t('Transaction or UPI reference'), ref))])])
      .concat(field('ghxCon', t('Scammer phone, UPI ID, email or profile'), contacts))
      .concat(field('ghxUrl', t('Links or website addresses (as text only)'), urls))
      .concat(field('ghxStory', t('What happened, in your own words'), story)));
    box.appendChild(facts);

    /* timeline */
    var list = h('ul', { class: 'ghx-timeline' });
    var drawTl = function () {
      GHX.clear(list);
      if (!c.timeline.length) { list.appendChild(h('li', { class: 'ghx-empty', text: t('No events yet.') })); return; }
      c.timeline.slice().sort(function (a, b) { return (a.at || '9').localeCompare(b.at || '9'); }).forEach(function (ev) {
        list.appendChild(h('li', {}, [
          h('time', { text: ev.at ? GHX.fmtDate(ev.at) : t('Time unknown') }), h('span', { text: ev.text }),
          h('button', { class: 'link-btn', type: 'button', text: t('Remove'), onclick: function () { c.timeline = c.timeline.filter(function (x) { return x.id !== ev.id; }); api.now(); drawTl(); } })
        ]));
      });
    };
    var evAt = h('input', { id: 'ghxEvAt', type: 'datetime-local' });
    var evTx = h('input', { id: 'ghxEvTx', type: 'text', maxlength: '300', autocomplete: 'off' });
    var tlForm = h('form', { class: 'card ghx-form' }, [h('h3', { text: t('Timeline') }), h('p', { class: 'muted small', text: t('Add what happened and when. Leave the time empty if you are not sure.') }),
      h('div', { class: 'row' }, [h('div', {}, field('ghxEvAt', t('When did it happen?'), evAt)), h('div', {}, field('ghxEvTx', t('What happened'), evTx))]),
      h('div', { class: 'actions' }, [h('button', { class: 'btn btn-quiet', type: 'submit', text: t('Add event') })]), list]);
    tlForm.addEventListener('submit', function (e) {
      e.preventDefault(); var tx = evTx.value.trim(); if (!tx) { evTx.focus(); return; }
      c.timeline.push({ id: GHX.uid('ev'), at: evAt.value ? new Date(evAt.value).toISOString() : '', text: tx });
      evTx.value = ''; evAt.value = ''; api.now(); drawTl();
    });
    drawTl(); box.appendChild(tlForm);
  } });

  /* ---------- section: Tasks ---------- */
  GHX.caseSections.push({ id: 'tasks', label: 'Tasks', render: function (box, c, api) {
    var labels = GHX.pick(GHX.incident(c.type).tasks);
    var prog = h('p', { class: 'muted', role: 'status' });
    var upd = function () { prog.textContent = t('{n} of {total} tasks done', { n: c.tasks.filter(function (x) { return x.done; }).length, total: c.tasks.length }); };
    var ol = h('ul', { class: 'ghx-tasks' });
    c.tasks.forEach(function (task, i) {
      var cb = h('input', { type: 'checkbox', checked: task.done, id: 'ghxT' + i });
      cb.addEventListener('change', function () { task.done = cb.checked; upd(); api.save(); });
      ol.appendChild(h('li', {}, [h('label', { class: 'check', for: 'ghxT' + i }, [cb, h('span', { text: labels[task.idx] || '' })])]));
    });
    upd(); box.appendChild(prog); box.appendChild(ol);
  } });

  /* ---------- section: Evidence ---------- */
  GHX.caseSections.push({ id: 'evidence', label: 'Evidence', render: function (box, c, api) {
    box.appendChild(h('p', { class: 'notice', text: t('Files stay in this browser. Golden Hour does not check whether evidence is genuine.') }));
    var list = h('ul', { class: 'ghx-evlist' });
    var drawEv = function () {
      GHX.clear(list);
      if (!c.evidence.length) { list.appendChild(h('li', { class: 'ghx-empty', text: t('No evidence recorded yet.') })); return; }
      c.evidence.forEach(function (ev) {
        var note = h('input', { type: 'text', value: ev.note || '', 'aria-label': t('Note about this evidence'), maxlength: '300' });
        note.addEventListener('input', function () { ev.note = note.value; api.save(); });
        list.appendChild(h('li', { class: 'card' }, [
          h('strong', { text: ev.name }), h('span', { class: 'muted small', text: (ev.size ? ' · ' + GHX.fmtSize(ev.size) : '') + ' · ' + t('Added by you on {date}', { date: GHX.fmtDate(ev.addedAt) }) }),
          note, h('button', { class: 'link-btn', type: 'button', text: t('Remove'), onclick: function () { c.evidence = c.evidence.filter(function (x) { return x.id !== ev.id; }); api.now(); drawEv(); } })
        ]));
      });
    };
    var file = h('input', { id: 'ghxFile', type: 'file', multiple: true });
    var note = h('textarea', { id: 'ghxEvNote', rows: 2, maxlength: '300' });
    var form = h('form', { class: 'card ghx-form' }, [h('h3', { text: t('Add evidence') }),
      h('label', { for: 'ghxFile', text: t('Evidence files') }), file,
      h('label', { for: 'ghxEvNote', text: t('Note about this evidence') }), note,
      h('div', { class: 'actions' }, [h('button', { class: 'btn btn-primary', type: 'submit', text: t('Add file(s) / record item') })])]);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var files = Array.prototype.slice.call(file.files || []), nt = note.value.trim();
      if (!files.length && !nt) { GHX.toast(t('Add a file or write a note first.')); return; }
      var now = new Date().toISOString();
      if (!files.length) c.evidence.push({ id: GHX.uid('evd'), name: t('Note only (no file)'), type: 'note', size: 0, note: nt, addedAt: now });
      files.forEach(function (f) {
        if (f.size > MAX_FILE) { GHX.toast(t('File too large (limit 8 MB): {name}', { name: f.name })); return; }
        c.evidence.push({ id: GHX.uid('evd'), name: f.name, type: f.type || 'file', size: f.size, note: nt, addedAt: now, blob: f });
      });
      file.value = ''; note.value = ''; api.now(); drawEv();
    });
    box.appendChild(form); box.appendChild(list); drawEv();
  } });

  /* ---------- demo data ---------- */
  GHX.seedDemo = function () {
    var ago = function (hrs) { return new Date(Date.now() - hrs * 36e5).toISOString(); };
    var c = newCase('financial', ago(20), 'stopped', true);
    c.facts = { amount: '8000', reference: 'DEMO-UPI-000123 (fictional)', contacts: '+91 90000 00000 (fictional), demo.kyc@upi-fake', urls: 'http://kyc-update.example (fictional)', narrative: 'DEMO: I received a call saying my KYC had expired. I clicked a link and paid a Rs. 8000 fee. This is synthetic data.' };
    c.timeline = [{ id: GHX.uid('ev'), at: ago(20), text: 'Received a call about KYC expiry (demo)' }, { id: GHX.uid('ev'), at: ago(19.8), text: 'Paid Rs. 8000 through a link (demo)' }, { id: GHX.uid('ev'), at: '', text: 'Realised it was a scam (time unknown)' }];
    c.evidence = [{ id: GHX.uid('evd'), name: 'Note only (no file)', type: 'note', size: 0, note: 'Demo: screenshot of the SMS would go here', addedAt: new Date().toISOString() }];
    c.tasks[0].done = true;
    return GHX.db.putCase(c);
  };

  /* ---------- tab ---------- */
  GHX.tabs.push({ id: 'cases', label: 'My cases', render: function (box) {
    if (!current) { renderList(box); return; }
    GHX.db.getCase(current).then(function (c) { if (!c) { current = null; renderList(box); } else renderDetail(box, c); }, function () { current = null; renderList(box); });
  } });
  GHX.openCase = function (id) { current = id; };
})();

/* ===== complaint.js ===== */
/* Golden Hour - features/complaint.js
   P0: Complaint Studio. Required-field checklist, deterministic EN/HI draft built only from the user's facts,
   optional AI wording help (consent first), PDF via the browser's print dialog (no library, Hindi-safe),
   and a clear handoff to the official portal. Golden Hour never submits anything. */
(function () {
  'use strict';
  var GHX = window.GHX, h = GHX.h, t = GHX.t;

  /* ---------- checklist ---------- */
  GHX.checkComplaint = function (c) {
    var f = c.facts, fin = c.type === 'financial';
    var items = [
      { label: 'Incident date and time', ok: !!c.happenedAt, req: true },
      { label: 'Description of what happened (20+ characters)', ok: (f.narrative || '').trim().length >= 20, req: true },
      { label: 'Scammer contact details or links', ok: !!((f.contacts || '').trim() || (f.urls || '').trim()), req: true }
    ];
    if (fin) {
      items.push({ label: 'Amount lost', ok: !!String(f.amount || '').trim(), req: true });
      items.push({ label: 'Transaction or UPI reference', ok: !!(f.reference || '').trim(), req: true });
    }
    items.push({ label: 'At least one evidence item', ok: c.evidence.length > 0, req: false });
    return items;
  };

  /* ---------- draft (deterministic; unknown stays Unknown) ---------- */
  function val(s) { s = (s || '').trim(); return s || null; }
  function buildDraft(c, lang) {
    var prev = GHX.lang; GHX.lang = lang;
    var T = GHX.t, U = T('Unknown'), f = c.facts, inc = T(GHX.incident(c.type).label);
    var L = [];
    L.push(T('To: The Officer In-charge, Cyber Crime Cell'));
    L.push(T('Subject: Complaint regarding {type}', { type: inc }), '');
    L.push(T('I wish to report the following cyber incident.'), '');
    L.push(T('Incident type') + ': ' + inc);
    L.push(T('Date and time of incident') + ': ' + (c.happenedAt ? GHX.fmtDate(c.happenedAt) : U));
    if (c.type === 'financial') {
      L.push(T('Amount involved') + ': ' + (val(f.amount) ? 'Rs. ' + f.amount.trim() : U));
      L.push(T('Transaction / reference') + ': ' + (val(f.reference) || U));
    }
    L.push(T('Suspect contact details (as received)') + ': ' + (val(f.contacts) || U));
    L.push(T('Links (as received)') + ': ' + (val(f.urls) || U), '');
    L.push(T('Description') + ':', val(f.narrative) || T('Not provided'), '');
    if (c.timeline.length) {
      L.push(T('Timeline') + ':');
      c.timeline.slice().sort(function (a, b) { return (a.at || '9').localeCompare(b.at || '9'); })
        .forEach(function (e) { L.push('- ' + (e.at ? GHX.fmtDate(e.at) : T('Time unknown')) + ': ' + e.text); });
      L.push('');
    }
    L.push(T('Evidence available with me') + ':');
    if (c.evidence.length) c.evidence.forEach(function (e, i) { L.push((i + 1) + '. ' + e.name + (e.note ? ' (' + e.note + ')' : '')); });
    else L.push(T('None'));
    L.push('', T('I request appropriate action. The details above are as provided by me and I have not independently verified them.'), '', T('Name') + ': ____________');
    GHX.lang = prev;
    return L.join('\n');
  }
  GHX.buildDraft = buildDraft;

  /* ---------- PDF pack via print dialog ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]; }); }
  function printPack(c, text, lang) {
    var prev = GHX.lang; GHX.lang = lang; var T = GHX.t;
    var missing = GHX.checkComplaint(c).filter(function (i) { return !i.ok; });
    var rows = c.evidence.map(function (e, i) {
      return '<tr><td>' + (i + 1) + '</td><td>' + esc(e.name) + '</td><td>' + esc(e.type) + (e.size ? ', ' + GHX.fmtSize(e.size) : '') + '</td><td>' + esc(e.note || '') + '</td><td>' + esc(GHX.fmtDate(e.addedAt)) + '</td></tr>';
    }).join('') || '<tr><td colspan="5">' + esc(T('None')) + '</td></tr>';
    var html = '<!doctype html><html lang="' + lang + '"><head><meta charset="utf-8"><title>' + esc(c.id) + '</title><style>' +
      'body{font:13px/1.55 "Noto Sans Devanagari","Mangal","Segoe UI",Arial,sans-serif;color:#111;margin:24px}h1{font-size:18px;margin:0 0 4px}' +
      '.tag{border:1px solid #999;padding:6px 10px;margin:10px 0;font-size:12px}pre{white-space:pre-wrap;font:inherit;border-top:1px solid #ccc;padding-top:10px}' +
      'table{border-collapse:collapse;width:100%;margin-top:6px}td,th{border:1px solid #bbb;padding:4px 6px;text-align:left;vertical-align:top;font-size:12px}' +
      '.miss{color:#a00}</style></head><body><h1>Golden Hour · ' + esc(T('Case ID')) + ': ' + esc(c.id) + '</h1>' +
      '<div class="tag">' + esc(T('Prepared with Golden Hour. This has not been submitted to any authority.')) + (c.demo ? ' DEMO DATA.' : '') + '</div>' +
      (missing.length ? '<p class="miss">' + esc(T('Missing')) + ': ' + esc(missing.map(function (m) { return T(m.label); }).join('; ')) + '</p>' : '') +
      '<pre>' + esc(text) + '</pre><h2 style="font-size:14px">' + esc(T('Evidence index')) + '</h2><table><tr><th>#</th><th>File</th><th>Type</th><th>' + esc(T('Note')) + '</th><th>Added</th></tr>' + rows + '</table>' +
      '<p style="font-size:11px;color:#444">' + esc(T('Items marked Unknown were not provided. Evidence is listed as added by the user; authenticity is not verified.')) + '</p></body></html>';
    GHX.lang = prev;
    var fr = document.createElement('iframe');
    fr.setAttribute('aria-hidden', 'true'); fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(fr);
    fr.onload = function () { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (e) { GHX.toast('Print not available'); } setTimeout(function () { fr.remove(); }, 60000); };
    fr.srcdoc = html;
  }

  function download(name, text) {
    var a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' })), download: name });
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  /* ---------- section ---------- */
  GHX.caseSections.push({ id: 'complaint', label: 'Complaint', render: function (box, c, api) {
    var lang = c.draft.lang || 'en';
    var checklist = h('ul', { class: 'ghx-check' });
    var drawCheck = function () {
      GHX.clear(checklist);
      GHX.checkComplaint(c).forEach(function (i) {
        checklist.appendChild(h('li', { class: i.ok ? 'ok' : (i.req ? 'bad' : 'warn') }, [
          h('span', { class: 'ghx-mark', 'aria-hidden': 'true', text: i.ok ? '✓' : '!' }),
          h('span', { text: t(i.label) }),
          h('span', { class: 'ghx-chip', text: i.ok ? t('Complete') : t('Missing') + ' · ' + (i.req ? t('Required') : t('Recommended')) })
        ]));
      });
    };
    drawCheck();
    box.appendChild(h('div', { class: 'card' }, [h('h3', { text: t('Checklist before you report') }), checklist]));

    var langSel = h('select', { id: 'ghxDLang' }, [h('option', { value: 'en', text: 'English', selected: lang === 'en' }), h('option', { value: 'hi', text: 'हिन्दी', selected: lang === 'hi' })]);
    var ta = h('textarea', { id: 'ghxDraft', rows: 16 }); ta.value = c.draft.text || '';
    var hiNote = h('p', { class: 'notice warn', hidden: lang !== 'hi', text: t('Please review the Hindi wording and your facts before relying on this draft.') });
    ta.addEventListener('input', function () { c.draft.text = ta.value; c.draft.edited = true; api.save(); });
    langSel.addEventListener('change', function () { c.draft.lang = langSel.value; hiNote.hidden = langSel.value !== 'hi'; api.save(); });

    var gen = function () {
      var go = function () { c.draft.text = buildDraft(c, langSel.value); c.draft.lang = langSel.value; c.draft.edited = false; ta.value = c.draft.text; drawCheck(); api.now().then(function () { GHX.toast(t('Draft saved')); }); };
      if (c.draft.edited && ta.value.trim()) GHX.confirm({ title: t('Replace your edited draft?'), message: t('A new draft will overwrite the text in the box.'), ok: t('Replace') }).then(function (y) { if (y) go(); });
      else go();
    };
    var aiBtn = h('button', { class: 'btn btn-quiet', type: 'button', text: t('Improve wording with AI') });
    var aiMsg = h('p', { class: 'muted small', role: 'status' });
    aiBtn.addEventListener('click', function () {
      if (!ta.value.trim()) { gen(); return; }
      GHX.ai.consent(ta.value).then(function (text) {
        if (!text) return;
        aiBtn.disabled = true; aiMsg.textContent = t('Analyzing...');
        GHX.ai.call('draft', text, { outLang: langSel.value }).then(function (r) {
          aiBtn.disabled = false; aiMsg.textContent = '';
          if (!r.ok) { aiMsg.textContent = r.message; return; }
          var out = typeof r.data.draft === 'string' ? r.data.draft.trim() : '';
          if (!out) { aiMsg.textContent = t('The AI sent a reply we could not read. Nothing was changed. Try again.'); return; }
          ta.value = out; c.draft.text = out; c.draft.edited = true; api.now(); // user can still edit
        });
      });
    });

    var exportPdf = function () {
      var text = ta.value.trim() ? ta.value : buildDraft(c, langSel.value);
      var go = function () { GHX.toast(t('Opening print dialog. Choose "Save as PDF".')); printPack(c, text, langSel.value); };
      var miss = GHX.checkComplaint(c).filter(function (i) { return i.req && !i.ok; });
      if (miss.length) GHX.confirm({ title: t('Required details are missing'), message: t('They will be marked Unknown in the PDF. Export anyway?'), ok: t('Export anyway') }).then(function (y) { if (y) go(); });
      else go();
    };

    box.appendChild(h('div', { class: 'card ghx-form' }, [
      h('label', { for: 'ghxDLang', text: t('Draft language') }), langSel, hiNote,
      h('div', { class: 'actions' }, [h('button', { class: 'btn btn-primary', type: 'button', text: t('Generate draft from my case'), onclick: gen }), aiBtn]),
      aiMsg,
      h('label', { for: 'ghxDraft', text: t('Your draft (edit freely)') }), ta,
      h('div', { class: 'actions' }, [
        h('button', { class: 'btn btn-primary', type: 'button', text: t('Download PDF pack'), onclick: exportPdf }),
        h('button', { class: 'btn btn-quiet', type: 'button', text: t('Copy text'), onclick: function () { GHX.copyText(ta.value, function () { GHX.toast(t('Copied to clipboard')); }); } }),
        h('button', { class: 'btn btn-quiet', type: 'button', text: t('Download as text'), onclick: function () { download(c.id + '-complaint.txt', ta.value || buildDraft(c, langSel.value)); } })
      ])
    ]));

    box.appendChild(h('div', { class: 'card ghx-handoff' }, [
      h('h3', { text: t('Golden Hour has NOT submitted this complaint.') }),
      h('p', { text: t('You must submit it yourself on the official portal. The portal may ask you to register or verify with an OTP and will give its own acknowledgement number.') }),
      h('div', { class: 'actions' }, [
        h('a', { class: 'btn btn-primary', href: GHX.LINKS.portal, target: '_blank', rel: 'noopener noreferrer', text: t('Open National Cyber Crime Reporting Portal') }),
        h('a', { class: 'btn btn-quiet', href: GHX.LINKS.faq, target: '_blank', rel: 'noopener noreferrer', text: t('Official FAQ') }),
        h('button', { class: 'btn btn-quiet', type: 'button', text: t("I've submitted it on the portal"), onclick: function () { api.goto('followup'); } })
      ])
    ]));
  } });
})();

/* ===== tracker.js ===== */
/* Golden Hour - features/tracker.js
   P1: follow-up tracker. Everything here is typed by the user and stored locally; it is labelled
   "recorded by you". Live status is only ever checked on the official site, never fetched by us. */
(function () {
  'use strict';
  var GHX = window.GHX, h = GHX.h, t = GHX.t;
  var STATUS = [['not_filed', 'Not filed yet'], ['filed', 'Filed on the portal'], ['waiting', 'Waiting for a response'], ['info', 'Police asked for more information'], ['closed', 'Closed or resolved']];

  GHX.caseSections.push({ id: 'followup', label: 'Follow-up', render: function (box, c, api) {
    var tr = c.tracker = c.tracker || { ack: '', ackDate: '', status: 'not_filed', notes: [] };
    box.appendChild(h('p', { class: 'notice', text: t('Notes here are user-recorded. Golden Hour does not fetch live status. Use the official checker for that.') }));
    box.appendChild(h('p', { class: 'muted small', text: t('A plain-language guide: an acknowledgement number is the reference the official portal gives you after you submit. You need it to check progress.') }));

    var ack = h('input', { id: 'ghxAck', type: 'text', value: tr.ack, autocomplete: 'off', inputmode: 'numeric' });
    var date = h('input', { id: 'ghxAckD', type: 'date', value: tr.ackDate, max: GHX.toLocalInput().slice(0, 10) });
    var st = h('select', { id: 'ghxSt' }, STATUS.map(function (s) { return h('option', { value: s[0], text: t(s[1]), selected: tr.status === s[0] }); }));
    ack.addEventListener('input', function () { tr.ack = ack.value.trim(); api.save(); });
    date.addEventListener('change', function () { tr.ackDate = date.value; api.save(); });
    st.addEventListener('change', function () { tr.status = st.value; api.save(); });

    box.appendChild(h('div', { class: 'card ghx-form' }, [
      h('h3', { text: t('Follow-up tracker') }),
      h('div', { class: 'row' }, [
        h('div', {}, [h('label', { for: 'ghxAck', text: t('Acknowledgement number') }), ack]),
        h('div', {}, [h('label', { for: 'ghxAckD', text: t('Date you filed') }), date])]),
      h('label', { for: 'ghxSt', text: t('Status (recorded by you)') }), st,
      h('div', { class: 'actions' }, [
        h('a', { class: 'btn btn-primary', href: GHX.LINKS.status, target: '_blank', rel: 'noopener noreferrer', text: t('Check official status (opens portal)') }),
        h('a', { class: 'btn btn-quiet', href: GHX.LINKS.govStatus, target: '_blank', rel: 'noopener noreferrer', text: t('Government Services Portal page') }),
        h('button', { class: 'btn btn-quiet', type: 'button', text: t('Copy text'), onclick: function () { if (tr.ack) GHX.copyText(tr.ack, function () { GHX.toast(t('Copied to clipboard')); }); } })
      ])
    ]));

    var list = h('ul', { class: 'ghx-timeline' });
    var draw = function () {
      GHX.clear(list);
      if (!tr.notes.length) { list.appendChild(h('li', { class: 'ghx-empty', text: t('No notes yet.') })); return; }
      tr.notes.slice().reverse().forEach(function (n) {
        list.appendChild(h('li', {}, [h('time', { text: GHX.fmtDate(n.at) }), h('span', { text: n.text }),
          h('button', { class: 'link-btn', type: 'button', text: t('Remove'), onclick: function () { tr.notes = tr.notes.filter(function (x) { return x.id !== n.id; }); api.now(); draw(); } })]));
      });
    };
    var nt = h('textarea', { id: 'ghxNote', rows: 2, maxlength: '500' });
    var form = h('form', { class: 'card ghx-form' }, [h('h3', { text: t('Follow-up notes') }), h('label', { for: 'ghxNote', text: t('Note') }), nt,
      h('div', { class: 'actions' }, [h('button', { class: 'btn btn-quiet', type: 'submit', text: t('Add note') })]), list]);
    form.addEventListener('submit', function (e) {
      e.preventDefault(); var v = nt.value.trim(); if (!v) { nt.focus(); return; }
      tr.notes.push({ id: GHX.uid('n'), at: new Date().toISOString(), text: v }); nt.value = ''; api.now(); draw();
    });
    draw(); box.appendChild(form);
  } });
})();

/* ===== audit.js ===== */
/* Golden Hour - features/audit.js
   P1: Cyber Safety Audit. Self-reported checklist. The score is calculated in code from the answers
   (yes=2, partly=1, no=0). No AI involved. Not a penetration test or a security certification. */
(function () {
  'use strict';
  var GHX = window.GHX, h = GHX.h, t = GHX.t;
  var Q = function (id, cat, q, qh, step, steph) { return { id: id, cat: cat, q: { en: q, hi: qh }, step: { en: step, hi: steph } }; };

  GHX.auditQuestions = [
    Q('mfa1', 'Multi-factor login', 'Is multi-factor authentication (MFA) on for your email?', 'क्या आपके ईमेल पर मल्टी-फ़ैक्टर ऑथेंटिकेशन (MFA) चालू है?', 'Turn on MFA for your main email first. Prefer an authenticator app over SMS.', 'सबसे पहले अपने मुख्य ईमेल पर MFA चालू करें। SMS की जगह ऑथेंटिकेटर ऐप बेहतर है।'),
    Q('mfa2', 'Multi-factor login', 'Is MFA on for your banking and payment apps?', 'क्या आपके बैंकिंग और पेमेंट ऐप पर MFA चालू है?', 'Turn on app lock, biometric or PIN checks in every payment app.', 'हर पेमेंट ऐप में ऐप लॉक, बायोमेट्रिक या PIN जांच चालू करें।'),
    Q('rec1', 'Account recovery', 'Are your recovery email and phone number current and yours alone?', 'क्या आपका रिकवरी ईमेल और फ़ोन नंबर अद्यतन है और सिर्फ़ आपका है?', 'Check recovery options in each important account and remove old numbers or emails.', 'हर ज़रूरी अकाउंट के रिकवरी विकल्प जांचें और पुराने नंबर या ईमेल हटाएं।'),
    Q('rec2', 'Account recovery', 'Do you use a different password for each important account?', 'क्या आप हर ज़रूरी अकाउंट के लिए अलग पासवर्ड इस्तेमाल करते हैं?', 'Use a password manager and give email and banking accounts unique passwords.', 'पासवर्ड मैनेजर इस्तेमाल करें और ईमेल व बैंकिंग को अलग पासवर्ड दें।'),
    Q('upd1', 'Device updates', 'Are your phone and apps set to update automatically?', 'क्या आपका फ़ोन और ऐप अपने आप अपडेट होते हैं?', 'Turn on automatic updates in your phone settings and the app store.', 'फ़ोन सेटिंग्स और ऐप स्टोर में ऑटोमैटिक अपडेट चालू करें।'),
    Q('upd2', 'Device updates', 'Does your phone have a screen lock?', 'क्या आपके फ़ोन में स्क्रीन लॉक है?', 'Set a screen lock and a short auto-lock time.', 'स्क्रीन लॉक और छोटा ऑटो-लॉक समय सेट करें।'),
    Q('perm1', 'App permissions', 'Do you review which apps can read SMS, contacts or your screen?', 'क्या आप जांचते हैं कि कौन से ऐप SMS, संपर्क या आपकी स्क्रीन देख सकते हैं?', 'Open app permissions and remove SMS, accessibility and screen-sharing access from apps that do not need it.', 'ऐप अनुमतियाँ खोलें और जिन ऐप को ज़रूरत नहीं उनसे SMS, एक्सेसिबिलिटी और स्क्रीन-शेयरिंग हटाएं।'),
    Q('perm2', 'App permissions', 'Do you install apps only from the official app store?', 'क्या आप ऐप सिर्फ़ आधिकारिक ऐप स्टोर से इंस्टॉल करते हैं?', 'Do not install apps from links, APK files or chat messages.', 'लिंक, APK फ़ाइल या चैट संदेश से ऐप इंस्टॉल न करें।'),
    Q('pay1', 'Payment verification', 'Do you check the name shown before approving a UPI payment?', 'क्या UPI भुगतान मंज़ूर करने से पहले आप दिखने वाला नाम जांचते हैं?', 'Always read the payee name. Remember: you never need a PIN to receive money.', 'हमेशा पाने वाले का नाम पढ़ें। याद रखें: पैसा पाने के लिए PIN की ज़रूरत नहीं होती।'),
    Q('pay2', 'Payment verification', 'Do you hang up and call back on an official number when someone claims to be your bank?', 'जब कोई खुद को बैंक बताए, क्या आप फ़ोन काटकर आधिकारिक नंबर पर वापस कॉल करते हैं?', 'End the call and dial the number on your card or the bank\'s official app.', 'कॉल काटें और कार्ड या बैंक के आधिकारिक ऐप के नंबर पर कॉल करें।'),
    Q('phi1', 'Phishing awareness', 'Do you avoid clicking links in unexpected messages?', 'क्या आप अनचाहे संदेशों के लिंक पर क्लिक करने से बचते हैं?', 'Open the official app or type the website address yourself instead of tapping links.', 'लिंक दबाने की जगह आधिकारिक ऐप खोलें या वेबसाइट का पता खुद टाइप करें।'),
    Q('phi2', 'Phishing awareness', 'Do you know that no genuine bank or officer asks for your OTP, PIN or screen-sharing?', 'क्या आप जानते हैं कि कोई असली बैंक या अधिकारी OTP, PIN या स्क्रीन-शेयरिंग नहीं मांगता?', 'Never share an OTP, PIN or password. Never install screen-sharing apps on a stranger\'s request.', 'OTP, PIN या पासवर्ड कभी साझा न करें। किसी अजनबी के कहने पर स्क्रीन-शेयरिंग ऐप इंस्टॉल न करें।')
  ];
  var POINTS = { yes: 2, partly: 1, no: 0 };

  /* pure scoring: unit-testable, no AI */
  GHX.scoreAudit = function (answers) {
    var qs = GHX.auditQuestions, got = 0, answered = 0, attention = [];
    qs.forEach(function (q) {
      var a = answers[q.id];
      if (a in POINTS) { answered++; got += POINTS[a]; if (a !== 'yes') attention.push({ q: q, a: a }); }
    });
    attention.sort(function (x, y) { return POINTS[x.a] - POINTS[y.a]; });
    return { pct: Math.round(got / (qs.length * 2) * 100), answered: answered, total: qs.length, attention: attention };
  };

  GHX.tabs.push({ id: 'audit', label: 'Safety audit', render: function (box) {
    var answers = {};
    box.appendChild(h('p', { class: 'notice', text: t('An educational self-assessment, not a penetration test or security certification. A good score does not mean you are secure.') }));
    var result = h('div', { class: 'card ghx-result', 'aria-live': 'polite' });
    var save = h('button', { class: 'btn btn-primary', type: 'button', disabled: true, text: t('Save this assessment') });
    var cat = '', form = h('div', { class: 'ghx-audit' });
    GHX.auditQuestions.forEach(function (q) {
      if (q.cat !== cat) { cat = q.cat; form.appendChild(h('h3', { text: t(cat) })); }
      var name = 'ghxQ_' + q.id;
      var opts = [['yes', 'Yes'], ['partly', 'Partly'], ['no', 'No']].map(function (o) {
        var r = h('input', { type: 'radio', name: name, value: o[0], id: name + o[0] });
        r.addEventListener('change', function () { answers[q.id] = o[0]; draw(); });
        return h('label', { class: 'ghx-opt', for: name + o[0] }, [r, h('span', { text: t(o[1]) })]);
      });
      form.appendChild(h('fieldset', { class: 'ghx-q' }, [h('legend', { text: GHX.pick(q.q) }), h('div', { class: 'ghx-opts' }, opts)]));
    });
    function draw() {
      var s = GHX.scoreAudit(answers);
      GHX.clear(result);
      if (s.answered < s.total) { result.appendChild(h('p', { class: 'muted', text: t('Answer all questions to see your score.') + ' (' + s.answered + '/' + s.total + ')' })); save.disabled = true; return; }
      result.appendChild(h('h3', { text: t('Your score') + ': ' + s.pct + '%' }));
      result.appendChild(h('div', { class: 'progress', 'aria-hidden': 'true' }, [h('span', { style: 'width:' + s.pct + '%' })]));
      result.appendChild(h('h4', { text: t('Needs attention') }));
      if (!s.attention.length) result.appendChild(h('p', { text: t('Nothing flagged. Keep these habits up.') }));
      else result.appendChild(h('ul', { class: 'ghx-steps' }, s.attention.map(function (x) { return h('li', { text: GHX.pick(x.q.step) }); })));
      save.disabled = false;
    }
    save.addEventListener('click', function () {
      var s = GHX.scoreAudit(answers);
      GHX.db.putAudit({ id: GHX.uid('au'), at: new Date().toISOString(), pct: s.pct, answers: answers }).then(function () { GHX.toast(t('Assessment saved')); drawHist(); }, function () { GHX.toast(t('Could not save. Browser storage may be full or blocked.')); });
    });
    var hist = h('ul', { class: 'ghx-timeline' });
    function drawHist() {
      GHX.db.listAudits().then(function (a) {
        GHX.clear(hist);
        if (!a.length) { hist.appendChild(h('li', { class: 'ghx-empty', text: t('No saved assessments yet.') })); return; }
        a.forEach(function (x) { hist.appendChild(h('li', {}, [h('time', { text: GHX.fmtDate(x.at) }), h('span', { text: x.pct + '%' })])); });
      }, function () { GHX.clear(hist); });
    }
    box.appendChild(form); box.appendChild(result); box.appendChild(h('div', { class: 'actions' }, [save]));
    box.appendChild(h('h3', { text: t('Past assessments') })); box.appendChild(hist);
    draw(); drawHist();
  } });
})();

/* ===== analyzer.js ===== */
/* Golden Hour - features/analyzer.js
   P1: Scam Analyzer. Works in two layers: a local rule check (no network) and an optional Groq analysis
   that only runs after the user approves the exact (redacted) text. Never opens a URL. Never labels a
   person or number a criminal. Snippets that are not literally in the user's text are dropped. */
(function () {
  'use strict';
  var GHX = window.GHX, h = GHX.h, t = GHX.t;

  GHX.samples = [
    { name: 'Fake KYC SMS (synthetic)', text: 'Dear customer, your bank KYC has expired and your account will be blocked today. Update now at http://kyc-update.example/login and share the OTP you receive to avoid suspension.' },
    { name: 'Job offer chat (synthetic)', text: 'Congratulations! You are selected for a work-from-home job, Rs. 4000 per day. Pay a registration fee of Rs. 999 on UPI demo-hr@example to confirm your slot. Offer valid for 1 hour only.' },
    { name: 'Parcel scam (synthetic)', text: 'Your parcel is held at customs. Pay Rs. 1,450 clearance charge at https://parcel-pay.example within 2 hours or it will be returned. Do not call the courier, reply here.' }
  ];

  var RULES = [
    [/\botp\b|one[- ]time password|\bpin\b|\bcvv\b/i, 'Asks for an OTP, PIN or CVV', 'OTP, PIN या CVV मांगता है'],
    [/\b(urgent|immediately|within \d+ ?(hours?|minutes?|hrs?)|today|last chance|valid for \d+)/i, 'Creates urgency or a deadline', 'जल्दबाज़ी या समय-सीमा बनाता है'],
    [/\b(blocked|suspend|expired|freeze|legal action|arrest|police case)/i, 'Threatens blocking, expiry or legal trouble', 'ब्लॉक, एक्सपायरी या कानूनी परेशानी की धमकी'],
    [/\b(registration fee|processing fee|clearance charge|pay (a )?fee|advance|deposit)\b/i, 'Asks for a fee or advance payment', 'शुल्क या अग्रिम भुगतान मांगता है'],
    [/\b(kyc|lottery|prize|reward|cashback|work[- ]from[- ]home|selected for)/i, 'Uses a common scam theme (KYC, prize, easy job)', 'आम स्कैम विषय (KYC, इनाम, आसान नौकरी)'],
    [/https?:\/\/|www\.|bit\.ly|tinyurl/i, 'Contains a link you did not ask for', 'ऐसा लिंक है जो आपने नहीं माँगा'],
    [/anydesk|teamviewer|quicksupport|screen[- ]?share/i, 'Asks you to install a remote-access or screen-sharing app', 'रिमोट-एक्सेस या स्क्रीन-शेयरिंग ऐप इंस्टॉल करने को कहता है']
  ];
  GHX.localCheck = function (text) {
    return RULES.filter(function (r) { return r[0].test(text); }).map(function (r) { return GHX.lang === 'hi' ? r[2] : r[1]; });
  };

  /* keep only what we can verify against the user's own text */
  GHX.cleanAnalysis = function (d, source) {
    var arr = function (x, n) { return Array.isArray(x) ? x.filter(function (s) { return typeof s === 'string' && s.trim(); }).slice(0, n).map(function (s) { return s.trim().slice(0, 300); }) : []; };
    var low = source.toLowerCase();
    var risk = ['low', 'medium', 'high'].indexOf(String(d.risk).toLowerCase()) > -1 ? String(d.risk).toLowerCase() : 'unknown';
    return {
      risk: risk, signs: arr(d.warning_signs, 8),
      snippets: arr(d.evidence_snippets, 6).filter(function (s) { return low.indexOf(s.toLowerCase()) > -1; }),
      uncertainty: arr(d.uncertainty, 4), steps: arr(d.safe_steps, 6)
    };
  };

  GHX.tabs.push({ id: 'analyzer', label: 'Scam analyzer', render: function (box) {
    box.appendChild(h('p', { class: 'muted', text: t('Paste a suspicious SMS, email or chat. Golden Hour never opens links for you.') }));
    var msg = h('textarea', { id: 'ghxMsg', rows: 6, maxlength: '4000' });
    var url = h('input', { id: 'ghxMsgUrl', type: 'text', maxlength: '300', autocomplete: 'off' });
    var out = h('div', { class: 'card ghx-result', 'aria-live': 'polite', hidden: true });
    var sampleSel = h('select', { id: 'ghxSample', 'aria-label': t('Try a synthetic sample') }, [h('option', { value: '', text: t('Try a synthetic sample') })]
      .concat(GHX.samples.map(function (s, i) { return h('option', { value: String(i), text: s.name }); })));
    sampleSel.addEventListener('change', function () { if (sampleSel.value !== '') { msg.value = GHX.samples[+sampleSel.value].text; url.value = ''; } });

    var show = function (nodes) { GHX.clear(out); out.hidden = false; nodes.forEach(function (n) { out.appendChild(n); }); };
    var list = function (title, items, cls) { return items.length ? h('div', {}, [h('h4', { text: title }), h('ul', { class: cls || 'ghx-steps' }, items.map(function (s) { return h('li', { text: s }); }))]) : null; };
    var disc = function () { return h('p', { class: 'muted small', text: t('This is automated guidance, not proof. It cannot tell if a link or a person is safe or criminal.') }); };

    var localBtn = h('button', { class: 'btn btn-quiet', type: 'button', text: t('Quick check on this device') });
    localBtn.addEventListener('click', function () {
      var text = (msg.value + ' ' + url.value).trim(); if (!msg.value.trim()) { GHX.toast(t('Paste a message first.')); return; }
      var s = GHX.localCheck(text);
      show([h('h3', { text: t('Quick check on this device') }), s.length ? list(t('Warning signs'), s) : h('p', { text: t('Local rules found no common red flags. That does not mean the message is safe.') }), disc()]);
    });

    var aiBtn = h('button', { class: 'btn btn-primary', type: 'button', text: t('Analyze with AI') });
    aiBtn.addEventListener('click', function () {
      if (!msg.value.trim()) { GHX.toast(t('Paste a message first.')); return; }
      var raw = msg.value.trim() + (url.value.trim() ? '\n\nLink (text only): ' + url.value.trim() : '');
      GHX.ai.consent(raw).then(function (text) {
        if (!text) return;
        aiBtn.disabled = true; show([h('p', { class: 'muted', text: t('Analyzing...') })]);
        GHX.ai.call('analyze', text).then(function (r) {
          aiBtn.disabled = false;
          if (!r.ok) { show([h('p', { class: 'notice warn', text: r.message }), disc()]); return; }
          var a = GHX.cleanAnalysis(r.data, text);
          show([h('h3', {}, [t('Risk') + ': ', h('span', { class: 'ghx-chip risk-' + a.risk, text: a.risk.toUpperCase() })]),
            list(t('Warning signs'), a.signs), list(t('Snippets from your text'), a.snippets, 'ghx-snips'),
            list(t('What we are unsure about'), a.uncertainty), list(t('Safe next steps'), a.steps), disc()]);
        });
      });
    });

    box.appendChild(h('div', { class: 'card ghx-form' }, [
      h('label', { for: 'ghxSample', text: t('Try a synthetic sample') }), sampleSel,
      h('label', { for: 'ghxMsg', text: t('Message text') }), msg,
      h('label', { for: 'ghxMsgUrl', text: t('Link in the message (as text, optional)') }), url,
      h('div', { class: 'actions' }, [aiBtn, localBtn])
    ]));
    box.appendChild(out);
  } });
})();

/* ===== toolkit.js ===== */
/* Golden Hour - features/toolkit.js
   Shell + boot. Adds a "Toolkit" button and a language switch to the header, a Toolkit view
   (My cases / Safety audit / Scam analyzer / Privacy & data) and mounts the emergency card.
   Opening the Toolkit only hides <main> with the `hidden` attribute; it never changes the
   existing dashboard, so app.js and ui.js behave exactly as before. */
(function () {
  'use strict';
  var GHX = window.GHX, h = GHX.h, t = GHX.t;
  var view, tabsEl, panel, active = 'cases';

  GHX.tabs.push({ id: 'privacy', label: 'Privacy & data', render: function (box) {
    var row = function (title, body) { return h('div', { class: 'card' }, [h('h3', { text: t(title) }), h('p', { text: t(body) })]); };
    box.appendChild(row('What stays on this device', 'Cases, timelines, tasks, evidence files, drafts, follow-up notes and audit history are stored in this browser (IndexedDB). There is no login.'));
    box.appendChild(row('What can leave this device', 'Only text you review and approve for cloud AI, and any official link you open yourself. Clearing browser data or switching devices can remove your cases.'));
    box.appendChild(h('div', { class: 'card' }, [
      h('h3', { text: t('Demo mode') }), h('p', { class: 'muted', text: t('Demo cases are synthetic and clearly labeled.') }),
      h('div', { class: 'actions' }, [
        h('button', { class: 'btn btn-quiet', type: 'button', text: t('Load demo cases'), onclick: function () { GHX.db.deleteDemo().then(GHX.seedDemo).then(function () { GHX.toast(t('Demo cases loaded')); }, function () { GHX.toast(t('Could not save. Browser storage may be full or blocked.')); }); } }),
        h('button', { class: 'btn btn-quiet', type: 'button', text: t('Reset demo data'), onclick: function () { GHX.db.deleteDemo().then(GHX.seedDemo).then(function () { GHX.toast(t('Demo cases loaded')); }); } })
      ])]));
    box.appendChild(h('div', { class: 'card' }, [
      h('button', { class: 'btn btn-danger', type: 'button', text: t('Clear all local data'), onclick: function () {
        GHX.confirm({ title: t('Clear all local data?'), message: t('This deletes every case, evidence file, note and audit saved by these tools in this browser. It cannot be undone.'), ok: t('Clear everything'), danger: true })
          .then(function (y) { if (y) GHX.db.clearAll().then(function () { GHX.toast(t('All local data cleared')); }); });
      } })]));
  } });

  GHX.rerenderTab = function () { if (!panel) return; GHX.clear(panel); var tab = GHX.tabs.filter(function (x) { return x.id === active; })[0]; if (tab) tab.render(panel); drawTabs(); };

  function drawTabs() {
    GHX.clear(tabsEl);
    GHX.tabs.forEach(function (x) {
      tabsEl.appendChild(h('button', { type: 'button', role: 'tab', 'aria-selected': x.id === active ? 'true' : 'false', text: t(x.label), onclick: function () { active = x.id; GHX.rerenderTab(); } }));
    });
  }

  GHX.openToolkit = function (tabId) {
    if (tabId) active = tabId;
    document.getElementById('main').hidden = true; view.hidden = false;
    GHX.rerenderTab(); window.scrollTo(0, 0);
    var hd = view.querySelector('h1'); if (hd) { hd.setAttribute('tabindex', '-1'); hd.focus(); }
  };
  GHX.closeToolkit = function () { view.hidden = true; document.getElementById('main').hidden = false; window.scrollTo(0, 0); };

  var langSel, tkBtn;
  function fillShell() {
    GHX.clear(view);
    view.setAttribute('lang', GHX.lang);
    tabsEl = h('div', { class: 'ghx-tabs', role: 'tablist', 'aria-label': t('Toolkit sections') });
    panel = h('div', { class: 'ghx-panel', role: 'tabpanel' });
    [h('div', { class: 'ghx-tkhead' }, [
        h('button', { class: 'btn btn-quiet', type: 'button', text: '\u2190 ' + t('Back to home'), onclick: GHX.closeToolkit }),
        h('h1', { text: t('Toolkit') })]),
      h('div', { class: 'ghx-strip' }, [
        h('a', { class: 'btn btn-danger', href: 'tel:1930', text: t('Call 1930') }),
        h('a', { class: 'btn btn-quiet', href: GHX.LINKS.portal, target: '_blank', rel: 'noopener noreferrer', text: t('Open National Cyber Crime Reporting Portal') }),
        h('a', { class: 'btn btn-quiet', href: GHX.LINKS.status, target: '_blank', rel: 'noopener noreferrer', text: t('Check complaint status') })]),
      h('p', { class: 'notice', text: t('Your case stays on this device unless you choose to share selected text with AI or an external service.') }),
      tabsEl, panel].forEach(function (n) { view.appendChild(n); });
    drawTabs();
    if (!view.hidden) GHX.rerenderTab();
  }

  function build() {
    var topActions = document.querySelector('.top-actions');
    langSel = h('select', { class: 'ghx-lang', id: 'ghxLang', 'aria-label': t('Language') }, [h('option', { value: 'en', text: 'English' }), h('option', { value: 'hi', text: '\u0939\u093f\u0928\u094d\u0926\u0940' })]);
    langSel.value = GHX.lang;
    langSel.addEventListener('change', function () { GHX.setLang(langSel.value); });
    tkBtn = h('button', { class: 'btn btn-quiet ghx-tk', type: 'button', id: 'ghxTkBtn', text: t('Toolkit'), onclick: function () { GHX.openToolkit(); } });
    if (topActions) { topActions.insertBefore(langSel, topActions.firstChild); topActions.insertBefore(tkBtn, topActions.firstChild); }
    view = h('section', { id: 'ghxToolkit', class: 'ghx-toolkit', hidden: true, 'aria-label': 'Toolkit' });
    var main = document.getElementById('main');
    main.parentNode.insertBefore(view, main.nextSibling);
    fillShell();
    GHX.on('lang', function () { tkBtn.textContent = t('Toolkit'); langSel.value = GHX.lang; langSel.setAttribute('aria-label', t('Language')); fillShell(); });
  }

  function boot() {
    try { build(); GHX.mountEmergency(); } catch (e) { /* never break the existing app */ if (window.console) console.warn('Golden Hour toolkit failed to start', e && e.message); return; }
      }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();

