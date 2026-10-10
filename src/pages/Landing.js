import React, { useState, useEffect } from 'react';
import { BookOpen, Sparkles, Users, CheckSquare, PoundSterling, FileSpreadsheet, Smartphone, Shield, CalendarDays,
  ClipboardList, BarChart3, KeyRound, ChevronDown, Check, LogIn, PlayCircle, Mail } from 'lucide-react';
import { APP_NAME, APP_NAME_ARABIC } from '../lib/branding';
import { LegalModal } from '../components/Legal';
import { countVisit } from '../lib/analytics';
import '../landing.css';

// The public front page (suhuf.uk for a device that isn't any madrasah's yet, and /about
// anywhere): what Suhuf is, with real screenshots from the demo (public/landing/*.jpg).
// "Sign in" goes to the normal sign-in screen; nothing here needs the database.

const CONTACT = 'hello@suhuf.uk';
const contactHref = `mailto:${CONTACT}?subject=${encodeURIComponent('Suhuf for our madrasah')}`;

const FEATURES = [
  {
    key: 'quran', icon: BookOpen, img: '/landing/quran.jpg', tag: "Qur'an progress",
    title: 'Every lesson, every child, every juz',
    text: "Record Hifdh Jadeed, Muraaja'ah Qareebah and Muraaja'ah by surah and ayah or in juz quarters — or Naazhirah and Qaa'idah lessons — in a couple of taps. Grade each one and add lesson notes.",
    points: ['Hifdh, Naazhirah and Qaa\'idah, or a mix in one class', 'Juz-by-juz progress and percentage of the Qur\'an', '"Same as last time" and "Until new lesson" shortcuts'],
  },
  {
    key: 'ai', icon: Sparkles, img: '/landing/report.jpg', tag: 'AI reports',
    title: 'Reports that write themselves',
    text: "Suhuf reads the teacher's lesson notes, Qur'an progress and behaviour records, and drafts a warm, accurate report paragraph in seconds. Check it, change any words, and add it to the report.",
    points: ['Monthly or termly reports, as PDFs with your logo', 'Uses exact figures — never made-up progress', 'Download a whole class at once'],
  },
  {
    key: 'parents', icon: Users, img: '/landing/parent.jpg', tag: 'Parent portal',
    title: 'Parents see how their child is doing',
    text: "Each family gets their own login to see their children's attendance, fees, Qur'an progress and finished reports — and can tell you when their child will be absent.",
    points: ['Brothers and sisters on one login', 'Send login details by WhatsApp in one tap', "Teachers' private notes are never shown to parents"],
  },
  {
    key: 'attendance', icon: CheckSquare, img: '/landing/attendance.jpg', tag: 'Registers',
    title: 'The register in seconds',
    text: 'Tap present, late or absent for each child — late times are recorded for you. See every class at a glance and each child\'s month in one view.',
    points: ['Your own madrasah days, plus days off and extra days (like Ramadhaan)', 'Absences parents report show up on the register', 'Teachers only see their own classes'],
  },
  {
    key: 'fees', icon: PoundSterling, img: '/landing/fees.jpg', tag: 'Fees',
    title: 'Know who has paid — without the notebook',
    text: 'Weekly, monthly or termly fees are added for every child automatically. Tap to mark paid; see what\'s collected and outstanding for each class.',
    points: ['Switch off holiday weeks or months', 'Siblings and different fees per child', 'Paying in advance handled'],
  },
];

const MORE = [
  [ClipboardList, 'Behaviour records', 'Daily comments, positives and concerns for each child.'],
  [FileSpreadsheet, 'Bring your students', 'Paste or upload your spreadsheet — classes and parents included.'],
  [BarChart3, 'Dashboard & stats', "This week's attendance, fees and the whole year at a glance."],
  [KeyRound, 'Logins for everyone', 'Head, teachers (or one per class) and parents — each sees only what they should.'],
  [CalendarDays, 'Your calendar', 'Your days, your terms, your holidays — not a school template.'],
  [Smartphone, 'An app on every phone', 'Installs from the browser on iPhone and Android. Nothing to download from an app store.'],
];

const FAQ = [
  ['Do teachers and parents need to download anything?', 'No. Suhuf works in the phone\'s browser and can be added to the home screen like an app in a few seconds — on iPhone and Android. It works on computers too.'],
  ['How long does it take to set up?', 'Most madaaris are up and running in an afternoon: add your classes, paste in your students from a spreadsheet, set your fees and madrasah days, and give teachers their logins. We\'ll help you get started.'],
  ['We already have our students in a spreadsheet. Can we use it?', 'Yes — paste the rows or upload the file. Suhuf works out the columns (names, classes, dates of birth, mother\'s and father\'s details), lets you check everything, and adds them all at once.'],
  ['How does the AI report work?', "It reads that child's lesson notes, Qur'an progress and behaviour records for the month or term, and writes a short report paragraph. You can add instructions, edit every word, and nothing reaches parents until you press \"Add to report\"."],
  ['Who can see our data?', 'Only your madrasah. Each madrasah\'s records are kept completely separate; teachers only see their own classes, and parents only their own children. You can download everything at any time.'],
  ['What does it cost?', 'Suhuf is free for your first 6 months. After that there\'s a small monthly fee, agreed with you beforehand — no contract, and you can leave whenever you like.'],
  ['What if we stop using it?', 'Download a full backup and a spreadsheet of your students first; then your information is deleted. Nothing is held back.'],
];

function Phone({ src, alt, eager }) {
  return (
    <div className="lp-phone">
      <img src={src} alt={alt} loading={eager ? 'eager' : 'lazy'} width="390" height="844" />
    </div>
  );
}

export default function Landing({ onSignIn }) {
  const [open, setOpen] = useState(0);
  const [active, setActive] = useState('');
  useEffect(() => { countVisit(window.location.pathname); }, []);
  // Highlight the feature currently on screen in the pinned feature bar.
  useEffect(() => {
    const els = FEATURES.map(f => document.getElementById(f.key)).filter(Boolean);
    const seen = {};
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { seen[e.target.id] = e.isIntersecting ? e.intersectionRatio : 0; });
      const best = Object.entries(seen).sort((a, b) => b[1] - a[1])[0];
      setActive(best && best[1] > 0 ? best[0] : '');
    }, { rootMargin: '-120px 0px -35% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] });
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);
  // Keep the highlighted button in view in the bar on phones (it scrolls sideways).
  useEffect(() => {
    const b = active && document.querySelector(`.lp-strip a[href="#${active}"]`);
    if (b) b.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [active]);
  const [legal, setLegal] = useState(null);
  const signIn = e => { e.preventDefault(); onSignIn(); };

  return (
    <div className="lp">
      <header className="lp-nav">
        <a href="/about" className="lp-brand" onClick={e => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
          <span className="lp-brand-ar">{APP_NAME_ARABIC}</span><span>{APP_NAME}</span>
        </a>
        <nav className="lp-links">
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
        </nav>
        <a href="/" className="lp-btn lp-btn-ghost" onClick={signIn}><LogIn size={15} />Sign in</a>
      </header>

      <section className="lp-hero">
        <div className="lp-hero-text">
          <div className="lp-pill">Built for UK madaaris</div>
          <h1>Your whole madrasah, in one simple app</h1>
          <p className="lp-lead">Registers, fees, Qur'an progress, behaviour and AI-written reports — with a portal so parents can see how their child is doing.</p>
          <div className="lp-cta">
            <a href="/?demo" className="lp-btn lp-btn-primary"><PlayCircle size={17} />Try the demo</a>
            <a href={contactHref} className="lp-btn lp-btn-light"><Mail size={16} />Get started free</a>
          </div>
          <ul className="lp-ticks">
            <li><Check size={15} />Free for 6 months</li>
            <li><Check size={15} />No app store needed</li>
            <li><Check size={15} />Set up in an afternoon</li>
          </ul>
        </div>
        <div className="lp-hero-art">
          <Phone src="/landing/dashboard.jpg" alt="The Suhuf dashboard on a phone" eager />
          <div className="lp-hero-second"><Phone src="/landing/quran.jpg" alt="Recording Qur'an progress" eager /></div>
        </div>
      </section>

      <main id="features">
        {/* The feature bar stays pinned under the top bar while the features scroll past. */}
        <div className="lp-features">
        <nav className="lp-strip" aria-label="Features">
          {FEATURES.map(f => (
            <a key={f.key} href={`#${f.key}`} className={active === f.key ? 'active' : ''}><f.icon size={16} />{f.tag}</a>
          ))}
        </nav>
        {FEATURES.map((f, i) => (
          <section key={f.key} id={f.key} className={`lp-feature ${i % 2 ? 'lp-flip' : ''}`}>
            <div className="lp-feature-text">
              <div className="lp-tag"><f.icon size={15} />{f.tag}</div>
              <h2>{f.title}</h2>
              <p>{f.text}</p>
              <ul className="lp-points">{f.points.map(pt => <li key={pt}><Check size={15} />{pt}</li>)}</ul>
            </div>
            <div className="lp-feature-art"><Phone src={f.img} alt={f.tag} /></div>
          </section>
        ))}
        </div>

        <section className="lp-section">
          <h2 className="lp-center">And everything else a madrasah needs</h2>
          <div className="lp-grid">
            {MORE.map(([I, t, d]) => (
              <div key={t} className="lp-card"><div className="lp-card-icon"><I size={18} /></div><h3>{t}</h3><p>{d}</p></div>
            ))}
          </div>
        </section>

        <section className="lp-section">
          <h2 className="lp-center">Made for everyone at your madrasah</h2>
          <div className="lp-grid lp-grid-3">
            {[['The head', ['Every class, child and fee in one place', 'Reports written in minutes, not evenings', 'Teacher and parent logins you control']],
              ['Teachers', ['The register and lessons on their phone', 'Only their own classes', 'Tick fees as parents pay']],
              ['Parents', ["Their child's attendance and progress", 'Fees owed and paid', 'Finished reports, and report an absence']]].map(([who, list]) => (
              <div key={who} className="lp-card lp-who"><h3>{who}</h3><ul className="lp-points">{list.map(x => <li key={x}><Check size={15} />{x}</li>)}</ul></div>
            ))}
          </div>
        </section>

        <section className="lp-section lp-trust">
          <div className="lp-card-icon lp-big"><Shield size={22} /></div>
          <h2>Your records stay yours</h2>
          <p>Each madrasah's information is kept completely separate and private. Passwords are never stored readable, everything travels encrypted, and you can download all of it whenever you like. Suhuf was built inside a working UK madrasah and is used there every day.</p>
          <div className="lp-trust-links">
            <button type="button" onClick={() => setLegal('privacy')}>Privacy policy</button>
            <button type="button" onClick={() => setLegal('terms')}>Terms of use</button>
          </div>
        </section>

        <section id="pricing" className="lp-section">
          <div className="lp-price">
            <div className="lp-tag"><Sparkles size={15} />Simple pricing</div>
            <div className="lp-price-big">Free for 6 months</div>
            <p>Then a small monthly fee, agreed with you beforehand.</p>
            <ul className="lp-points">
              {['Every feature included — AI reports too', 'Unlimited teachers and parent logins', 'Help getting set up', 'No contract — leave any time, take your data with you'].map(x => <li key={x}><Check size={15} />{x}</li>)}
            </ul>
            <div className="lp-cta lp-cta-center">
              <a href={contactHref} className="lp-btn lp-btn-primary"><Mail size={16} />Get started free</a>
              <a href="/?demo" className="lp-btn lp-btn-light"><PlayCircle size={17} />Try the demo</a>
            </div>
          </div>
        </section>

        <section id="faq" className="lp-section lp-faq">
          <h2 className="lp-center">Questions</h2>
          {FAQ.map(([q, a], i) => (
            <div key={q} className={`lp-q ${open === i ? 'open' : ''}`}>
              <button type="button" onClick={() => setOpen(o => (o === i ? -1 : i))} aria-expanded={open === i}>
                <span>{q}</span><ChevronDown size={18} />
              </button>
              {open === i && <p>{a}</p>}
            </div>
          ))}
        </section>

        <section className="lp-final">
          <h2>See it for yourself</h2>
          <p>Have a look around a made-up madrasah as the head, a teacher or a parent — it takes a minute.</p>
          <div className="lp-cta lp-cta-center">
            <a href="/?demo" className="lp-btn lp-btn-white"><PlayCircle size={17} />Try the demo</a>
            <a href={contactHref} className="lp-btn lp-btn-outline"><Mail size={16} />{CONTACT}</a>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-brand"><span className="lp-brand-ar">{APP_NAME_ARABIC}</span><span>{APP_NAME}</span></div>
        <div className="lp-footer-links">
          <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
          <button type="button" onClick={() => setLegal('privacy')}>Privacy</button>
          <button type="button" onClick={() => setLegal('terms')}>Terms</button>
          <a href="/" onClick={signIn}>Sign in</a>
        </div>
      </footer>
      {legal && <LegalModal kind={legal} onClose={() => setLegal(null)} />}
    </div>
  );
}
