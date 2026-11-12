import React, { useState, useEffect, useRef } from 'react';
import { BookOpen, Sparkles, Users, CheckSquare, PoundSterling, FileSpreadsheet, Smartphone, Shield,
  KeyRound, ChevronDown, Check, LogIn, PlayCircle, MessageCircle, Rocket, Library, CalendarClock,
  GraduationCap, BedDouble, Wrench, BookMarked, ClipboardCheck, BarChart3, ListChecks, Link2, HeartHandshake, ArrowDown } from 'lucide-react';
import { APP_NAME, APP_NAME_ARABIC, WHATSAPP_NUMBER } from '../lib/branding';
import { LegalModal } from '../components/Legal';
import { countVisit } from '../lib/analytics';
import '../landing.css';

// The public front page (suhuf.uk for a device that isn't any madrasah's yet, /about anywhere, and /maktab, /darul-uloom,
// /schools — the same page opened on that door, to send people the right link). Redesigned as a whole (the owner's pick, A —
// "one page, three doors"): maktabs, Darul Ulooms & Aalimiyyah courses and schools' Islamic Studies departments as equals,
// each with its own features, screenshots, demo and price behind a switch, then what everyone gets, prices, questions.
// Screenshots are from the demos, renamed to made-up places (public/landing/*.jpg). Nothing here needs the database.

const CONTACT = 'hello@suhuf.uk';
// "Start free" opens the sign-up page (/?start); WhatsApp is for questions — a chat with the message ready (the number in
// international form, no +).
const WHATSAPP = WHATSAPP_NUMBER;
const waHref = text => `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(text)}`;
const whatsappHref = waHref("Salaam, I'd like to try Suhuf for our madrasah.");
const schoolWhatsapp = waHref("Salaam, I'd like to use Suhuf for our school's Islamic Studies department.");
function WhatsApp({ className, children, href = whatsappHref }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className={className} onClick={() => countVisit('/contact/whatsapp')}><MessageCircle size={16} />{children}</a>;
}

// The three kinds of customer. `path` is the link that opens the page on that door.
const DOORS = [
  { key: 'maktab', path: '/maktab', title: 'Maktab', sub: "Evening and weekend Qur'aan classes", price: 'Free for 6 months, then £20 a month', img: '/landing/dashboard.jpg', tone: 'blue' },
  { key: 'darul-uloom', path: '/darul-uloom', title: 'Darul Uloom & Aalimiyyah', sub: 'Full-time or part-time Aalim courses', price: 'Free for 6 months, then £50 a month', img: '/landing/du-timetable.jpg', tone: 'green' },
  { key: 'schools', path: '/schools', title: 'School Islamic Studies', sub: "A primary or secondary school's department", price: 'First term free, then from £500 a year', img: '/landing/school-studies.jpg', tone: 'amber' },
];
const doorFromPath = () => (DOORS.find(d => d.path === window.location.pathname.replace(/\/$/, '')) || {}).key;

// A maktab: its five main features, each with a phone screenshot (the strip pins under the top bar as they scroll past).
const FEATURES = [
  {
    key: 'quran', icon: BookOpen, img: '/landing/quran.jpg', tag: "Qur'aan progress",
    title: 'Every lesson, every child, every juz',
    text: "Record Hifdh Jadeed, Muraaja'ah Qareebah and Muraaja'ah by surah and ayah or in juz quarters — or Naazhirah and Qaa'idah lessons — in a couple of taps. Grade each one and add lesson notes.",
    points: ["Hifdh, Naazhirah and Qaa'idah, or a mix in one class", "Juz-by-juz progress and percentage of the Qur'aan", '"Same as last time" and "Until new lesson" shortcuts'],
  },
  {
    key: 'ai', icon: Sparkles, img: '/landing/report.jpg', tag: 'AI reports',
    title: 'Reports that write themselves',
    text: "Suhuf reads the teacher's lesson notes, Qur'aan progress and behaviour records, and drafts a warm, accurate report paragraph in seconds. Check it, change any words, and add it to the report.",
    points: ['Monthly or termly reports, as PDFs with your logo', 'Uses exact figures — never made-up progress', 'Download a whole class at once'],
  },
  {
    key: 'attendance', icon: CheckSquare, img: '/landing/attendance.jpg', tag: 'Registers',
    title: 'The register in seconds',
    text: "Tap present, late or absent for each child — late times are recorded for you. See every class at a glance and each child's month in one view.",
    points: ['Your own madrasah days, plus days off and extra days (like Ramadhaan)', 'Absences parents report show up on the register', 'Teachers only see their own classes'],
  },
  {
    key: 'fees', icon: PoundSterling, img: '/landing/fees.jpg', tag: 'Fees',
    title: 'Know who has paid — without the notebook',
    text: "Weekly, monthly or termly fees are added for every child automatically. Tap to mark paid; see what's collected and outstanding for each class.",
    points: ['Switch off holiday weeks or months', 'Siblings and different fees per child', 'Paying in advance handled'],
  },
  {
    key: 'parents', icon: Users, img: '/landing/parent.jpg', tag: 'Parent portal',
    title: 'Parents see how their child is doing',
    text: "Each family gets their own login to see their children's attendance, fees, Qur'aan progress and finished reports — and can tell you when their child will be absent.",
    points: ['Brothers and sisters on one login', 'Send login details by WhatsApp in one tap', "Teachers' private notes are never shown to parents"],
  },
];

// A Darul Uloom, or a madrasah running an Aalimiyyah course (full-time or part-time): everything a maktab has, plus these.
const DU_PARTS = [
  [Library, 'Aalim years & books', 'Your own years and books — or start from the usual Aalim years and the classical core texts.'],
  [CalendarClock, 'Timetable', 'Periods, lessons and rooms; teachers see their day and record what each lesson covered.'],
  [GraduationCap, 'Exams & report cards', 'Your own marks and pass marks, positions and grades, and report cards sent to parents.'],
  [BedDouble, 'Boarding', 'If you have boarders: rooms and beds, the night register, home weekends, signing in and out, and health notes.'],
  [PoundSterling, 'Fees in instalments', 'A yearly fee paid monthly, termly or at once — bursaries, sibling discounts and receipts.'],
  [Wrench, 'Maintenance', 'Jobs to fix around the building, for your maintenance staff to tick off.'],
];
const DU_DESK = [['/landing/du-desk-timetable.jpg', "The whole week's timetable on a computer"], ['/landing/du-desk-fees.jpg', 'Fees on a computer']];
const DU_SHOTS = [['/landing/du-timetable.jpg', 'The timetable'], ['/landing/du-exams.jpg', 'Exam results'], ['/landing/du-boarding.jpg', 'Boarding — tonight']];

// A school's Islamic Studies department (primary or secondary): its own pages.
const SCHOOL_PARTS = [
  [ListChecks, 'Trackers by year group', "Surahs, du'aas and practicals for each year — Achieved, with help or incomplete — and the aayahs each class has covered."],
  [ClipboardCheck, 'Assessments & reports', 'Take a snapshot each term, rate effort, and send every pupil a one-page report.'],
  [BookMarked, 'Homework & quizzes', 'Set homework, or quizzes marked for you — one answer, tick boxes, true / false, short and long answers.'],
  [KeyRound, "Pupils' own logins", 'Pupils sign in with the username your school gives them, to see their homework and their own marks.'],
  [Link2, 'Lesson links', 'Recitations, worksheets and videos on Google Drive, OneDrive or YouTube, one tap from each surah.'],
  [BarChart3, 'Stats', 'Year groups and forms compared fairly, through the year and year on year.'],
];
const SCHOOL_SHOTS = [['/landing/school-studies.jpg', 'A class and its surahs'], ['/landing/school-pupil.jpg', "A pupil's marks"], ['/landing/school-quiz.jpg', 'A pupil taking a quiz']];
const SCHOOL_DESK = ['/landing/school-desk-stats.jpg', 'Stats on a computer — Year 6 and its three forms'];

// What every kind gets.
const EVERYONE = [
  [Users, 'A portal for parents', "Families see their own child's progress and reports — never anyone else's, never teachers' private notes."],
  [Smartphone, 'An app on every phone', 'Installs from the browser on iPhone and Android. Nothing to download from an app store.'],
  [KeyRound, 'Logins for everyone', 'The head, each teacher and each family — and pupils at a school — see only what they should.'],
  [FileSpreadsheet, 'Bring your spreadsheet', 'Paste or upload the list you already have; Suhuf works out the columns.'],
  [Shield, 'Your records stay yours', 'Kept separate and private, and downloadable whenever you like.'],
  [HeartHandshake, 'Help getting set up', 'Message us any time — we\'ll help you get going.'],
];

const FAQ = [
  ['Do teachers, parents and pupils need to download anything?', "No. Suhuf works in the phone's browser and can be added to the home screen like an app in a few seconds — on iPhone and Android. It works on computers too."],
  ['How do we start?', "Tap Start free, choose Maktab, Darul Uloom or School, enter your details, and you're in straight away — no card needed. A maktab or Darul Uloom is free for 6 months; a school has the first term free (four forms of entry or more: message us and we'll set you up)."],
  ['How long does it take to set up?', 'Most are up and running in an afternoon: add your classes, paste in your children from a spreadsheet, and give teachers their logins. We\'ll help you get started.'],
  ['We already have our children in a spreadsheet. Can we use it?', "Yes — paste the rows or upload the file. Suhuf works out the columns (names, classes, dates of birth, parents' details), lets you check everything, and adds them all at once. A school can bring in its Islamic Studies tracker sheets too."],
  ['How does the AI report work?', "For a maktab or Darul Uloom: it reads that child's lesson notes, Qur'aan progress and behaviour records, and drafts a short report paragraph. You can edit every word, and nothing reaches parents until you add it. Schools' reports are figures only — no AI."],
  ['Who can see our data?', "Only you. Each madrasah's or school's records are kept completely separate; teachers only see their own classes, parents only their own children, pupils only their own work. You can download everything at any time."],
  ['What does it cost?', 'A maktab: free for 6 months, then £20 a month or £200 a year for up to 200 children. A Darul Uloom or Aalimiyyah course: free for 6 months, then £50 a month or £500 a year for up to 500 students. A school: the first term free, then £500 a year for one form of entry, £800 for two, £1,000 for three — four or more, message us. Bigger than that? Call or message us. No contract; leave whenever you like.'],
  ["We're a Darul Uloom, or we teach an Aalimiyyah course. Does it work for us?", 'Yes — full-time or part-time. You get everything a maktab has, plus the Aalim years and their books, a timetable, exams and report cards, boarding (if you have boarders), fees in instalments and a maintenance list — all set up your way. Try the Darul Uloom demo to see it.'],
  ["We're a school. Can it run our Islamic Studies department?", "Yes — primary or secondary. Your own lists of surahs, du'aas and practicals for each year group, termly assessments and reports, homework and quizzes with pupils' own logins, and stats comparing year groups and forms. Try the school demo, then tap Start free — the first term is free."],
  ['What if we stop using it?', 'Download a full backup and a spreadsheet first; then your information is deleted. Nothing is held back.'],
];

// A computer screen.
function Laptop({ src, alt }) {
  return (
    <figure className="lp-laptop">
      <div className="lp-laptop-screen"><img src={src} alt={alt} loading="lazy" width="1280" height="800" /></div>
      <div className="lp-laptop-base" />
      <figcaption>{alt}</figcaption>
    </figure>
  );
}

function Phone({ src, alt, eager }) {
  return (
    <div className="lp-phone">
      <img src={src} alt={alt} loading={eager ? 'eager' : 'lazy'} width="390" height="844" />
    </div>
  );
}

const Grid = ({ parts }) => (
  <div className="lp-grid">
    {parts.map(([I, t, d]) => <div key={t} className="lp-card"><div className="lp-card-icon"><I size={18} /></div><h3>{t}</h3><p>{d}</p></div>)}
  </div>
);

// The maktab's features, as rows with a pinned strip of tags.
function MaktabFeatures() {
  const [active, setActive] = useState('');
  useEffect(() => {
    const els = FEATURES.map(f => document.getElementById(f.key)).filter(Boolean);
    const seen = {};
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { seen[e.target.id] = e.isIntersecting ? e.intersectionRatio : 0; });
      const best = Object.entries(seen).sort((a, b) => b[1] - a[1])[0];
      setActive(best && best[1] > 0 ? best[0] : '');
    }, { rootMargin: '-160px 0px -35% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] });
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    const b = active && document.querySelector(`.lp-strip a[href="#${active}"]`);
    if (b) b.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [active]);
  return (
    <div className="lp-features">
      <nav className="lp-strip" aria-label="Features">
        {FEATURES.map(f => <a key={f.key} href={`#${f.key}`} className={active === f.key ? 'active' : ''}><f.icon size={16} />{f.tag}</a>)}
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
      <div className="lp-cta lp-cta-center lp-door-cta">
        <a href="/?demo" className="lp-btn lp-btn-primary"><PlayCircle size={17} />Try the maktab demo</a>
        <a href="/?start" className="lp-btn lp-btn-light"><Rocket size={16} />Start free</a>
      </div>
    </div>
  );
}

function DarulUloomFeatures() {
  return (
    <div className="lp-section lp-door-body">
      <div className="lp-center">
        <h2>Everything a maktab has, plus what an Aalim course needs</h2>
        <p className="lp-door-lead">Full-time or part-time — every year name, period, mark, room and fee set your way. Use only the parts you need.</p>
      </div>
      <div className="lp-phones">{DU_SHOTS.map(([src, alt]) => <Phone key={src} src={src} alt={alt} />)}</div>
      <div className="lp-desk">{DU_DESK.map(([src, alt]) => <Laptop key={src} src={src} alt={alt} />)}</div>
      <Grid parts={DU_PARTS} />
      <div className="lp-cta lp-cta-center lp-door-cta">
        <a href="/?demo=darul-uloom" className="lp-btn lp-btn-primary"><PlayCircle size={17} />Try the Darul Uloom demo</a>
        <a href="/?start=darul-uloom" className="lp-btn lp-btn-light"><Rocket size={16} />Start free</a>
      </div>
    </div>
  );
}

function SchoolFeatures() {
  return (
    <div className="lp-section lp-door-body">
      <div className="lp-center">
        <h2>Islamic Studies, tracked like the rest of the school</h2>
        <p className="lp-door-lead">For a primary or secondary school's Islamic Studies department — your own lists for each year group, one form or several.</p>
      </div>
      <div className="lp-phones">{SCHOOL_SHOTS.map(([src, alt]) => <Phone key={src} src={src} alt={alt} />)}</div>
      <div className="lp-desk lp-desk-one"><Laptop src={SCHOOL_DESK[0]} alt={SCHOOL_DESK[1]} /></div>
      <Grid parts={SCHOOL_PARTS} />
      <div className="lp-cta lp-cta-center lp-door-cta">
        <a href="/?start=school" className="lp-btn lp-btn-primary"><Rocket size={17} />Start free</a>
        <a href="/?demo=school" className="lp-btn lp-btn-light"><PlayCircle size={17} />Try the school demo</a>
      </div>
      <p className="lp-door-note">The first term free. Your data processing agreement is agreed as you sign up — <a href="/dpa">read it here</a>.</p>
    </div>
  );
}

export default function Landing({ onSignIn }) {
  const [door, setDoor] = useState(() => doorFromPath() || 'maktab');
  const [open, setOpen] = useState(0);
  const [legal, setLegal] = useState(null);
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const videoCounted = useRef(false); // count the video once per visit (/video in Vercel's visitor counts)
  useEffect(() => { countVisit(window.location.pathname); }, []);
  // Opened on a door's own link (suhuf.uk/schools): straight to that door.
  useEffect(() => { if (doorFromPath()) document.getElementById('for')?.scrollIntoView(); }, []);
  const signIn = e => { e.preventDefault(); onSignIn(); };
  // Choosing a door shows its features and scrolls to them.
  const choose = (key, scroll = true) => {
    setDoor(key);
    if (scroll) requestAnimationFrame(() => document.getElementById('for')?.scrollIntoView({ behavior: 'smooth' }));
  };

  return (
    <div className="lp">
      <header className="lp-nav">
        <a href="/about" className="lp-brand" onClick={e => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
          <span className="lp-brand-ar">{APP_NAME_ARABIC}</span><span>{APP_NAME}</span>
        </a>
        <nav className="lp-links">
          {DOORS.map(d => <a key={d.key} href={d.path} onClick={e => { e.preventDefault(); choose(d.key); }}>{d.key === 'maktab' ? 'Maktabs' : d.key === 'schools' ? 'Schools' : 'Darul Ulooms'}</a>)}
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
        </nav>
        <a href="/" className="lp-btn lp-btn-ghost" onClick={signIn}><LogIn size={15} />Sign in</a>
      </header>

      <section className="lp-hero2">
        <div className="lp-hero2-text">
          <div className="lp-pill">For Islamic education in the UK</div>
          <h1>Everything your madrasah or Islamic Studies department runs on, in one simple app</h1>
          <p className="lp-lead">Registers, Qur'aan progress, reports, homework and a portal for parents — made for maktabs, Darul Ulooms and schools alike. Choose what you run:</p>
        </div>
        <div className="lp-doors">
          {DOORS.map(d => (
            <a key={d.key} href={d.path} className={`lp-door ${d.tone} ${door === d.key ? 'on' : ''}`} onClick={e => { e.preventDefault(); choose(d.key); }}>
              <div className="lp-door-shot"><img src={d.img} alt="" loading="eager" width="390" height="844" /></div>
              <div className="lp-door-text">
                <h3>{d.title}</h3>
                <p>{d.sub}</p>
                <span className="lp-door-price">{d.price}</span>
                <span className="lp-door-go">See how it works <ArrowDown size={14} /></span>
              </div>
            </a>
          ))}
        </div>
        <ul className="lp-ticks lp-ticks-center">
          <li><Check size={15} />Free to start</li>
          <li><Check size={15} />No app store needed</li>
          <li><Check size={15} />Set up in an afternoon</li>
        </ul>
      </section>

      <main>
        <section id="for" className="lp-for">
          <div className="lp-switch" role="tablist" aria-label="What you run">
            {DOORS.map(d => (
              <button key={d.key} type="button" role="tab" aria-selected={door === d.key} className={door === d.key ? 'on' : ''} onClick={() => choose(d.key, false)}>{d.title}</button>
            ))}
          </div>
          {door === 'maktab' && <MaktabFeatures />}
          {door === 'darul-uloom' && <DarulUloomFeatures />}
          {door === 'schools' && <SchoolFeatures />}
        </section>

        {/* The demo video (public/landing/suhuf-demo.mp4, made from the maktab demo as "Madrasatul Huda"): loads only when played. */}
        <section id="video" className="lp-section lp-video">
          <div className="lp-video-text">
            <div className="lp-tag"><PlayCircle size={15} />See it in under a minute</div>
            <h2>A maktab's day with {APP_NAME}</h2>
            <p>Taking the register, recording a lesson, a report written for you, and what parents see — on a phone.</p>
            <div className="lp-cta">
              <a href="/?demo" className="lp-btn lp-btn-primary"><PlayCircle size={17} />Try it yourself</a>
            </div>
          </div>
          <div className="lp-phone lp-video-phone">
            <video ref={videoRef} poster="/landing/suhuf-demo-poster.jpg" controls playsInline preload="none"
              width="390" height="844" onPlay={() => { setPlaying(true); if (!videoCounted.current) { videoCounted.current = true; countVisit('/video'); } }}>
              <source src="/landing/suhuf-demo.mp4" type="video/mp4" />
              <source src="/landing/suhuf-demo.webm" type="video/webm" />
            </video>
            {!playing && (
              <button type="button" className="lp-video-play" aria-label="Play the video" onClick={() => videoRef.current?.play()}>
                <PlayCircle size={30} /><span>Watch · 49 s</span>
              </button>
            )}
          </div>
        </section>

        <section className="lp-section lp-tinted">
          <h2 className="lp-center">What everyone gets</h2>
          <Grid parts={EVERYONE} />
        </section>

        <section className="lp-section">
          <h2 className="lp-center">Made for everyone who uses it</h2>
          <div className="lp-grid lp-grid-4">
            {[['The head', ['Every class and child in one place', 'Reports in minutes, not evenings', 'Logins you control']],
              ['Teachers', ['Their classes on their phone', 'Only their own classes', 'Lessons, marks and homework']],
              ['Parents', ["Their child's progress", 'Reports when they\'re ready', 'Homework and quiz scores']],
              ['Pupils (schools)', ['Their homework and links', 'Quizzes, marked straight away', 'Their own marks']]].map(([who, list]) => (
              <div key={who} className="lp-card lp-who"><h3>{who}</h3><ul className="lp-points">{list.map(x => <li key={x}><Check size={15} />{x}</li>)}</ul></div>
            ))}
          </div>
        </section>

        <section className="lp-section lp-trust">
          <div className="lp-card-icon lp-big"><Shield size={22} /></div>
          <h2>Your records stay yours</h2>
          <p>Each madrasah's and school's information is kept completely separate and private. Passwords are never stored readable, everything travels encrypted, and you can download all of it whenever you like. Suhuf was built inside a working UK madrasah and is used there every day.</p>
          <div className="lp-trust-links">
            <button type="button" onClick={() => setLegal('privacy')}>Privacy policy</button>
            <button type="button" onClick={() => setLegal('terms')}>Terms of use</button>
          </div>
        </section>

        <section id="pricing" className="lp-section">
          <div className="lp-center">
            <div className="lp-tag"><Sparkles size={15} />Simple pricing</div>
            <h2>One price for the whole place</h2>
            <p className="lp-door-lead">Every feature included, unlimited teachers and parents. No contract — leave any time and take your data with you.</p>
          </div>
          <div className="lp-prices">
            <div className={`lp-plan2 blue ${door === 'maktab' ? 'on' : ''}`}>
              <h3>Maktab</h3>
              <div className="lp-plan-free">Free for 6 months</div>
              <div className="lp-plan-price"><strong>£20</strong> a month</div>
              <div className="lp-plan-sub">or £200 a year (two months free)</div>
              <div className="lp-plan-size">Up to 200 children</div>
              <a href="/?start" className="lp-btn lp-btn-primary"><Rocket size={15} />Start free</a>
            </div>
            <div className={`lp-plan2 green ${door === 'darul-uloom' ? 'on' : ''}`}>
              <h3>Darul Uloom & Aalimiyyah</h3>
              <div className="lp-plan-free">Free for 6 months</div>
              <div className="lp-plan-price"><strong>£50</strong> a month</div>
              <div className="lp-plan-sub">or £500 a year (two months free)</div>
              <div className="lp-plan-size">Up to 500 students</div>
              <a href="/?start=darul-uloom" className="lp-btn lp-btn-primary"><Rocket size={15} />Start free</a>
            </div>
            <div className={`lp-plan2 amber ${door === 'schools' ? 'on' : ''}`}>
              <h3>School Islamic Studies</h3>
              <div className="lp-plan-free">The first term free</div>
              <div className="lp-plan-price"><strong>£500</strong> a year</div>
              <div className="lp-plan-sub">one form of entry · £800 two forms · £1,000 three</div>
              <div className="lp-plan-size">Four forms or more: <a href={schoolWhatsapp} target="_blank" rel="noopener noreferrer">message us</a></div>
              <a href="/?start=school" className="lp-btn lp-btn-primary"><Rocket size={15} />Start free</a>
            </div>
          </div>
          <p className="lp-price-note2">Bigger than that? <a href={`tel:+${WHATSAPP}`}>Call</a> or <a href={whatsappHref} target="_blank" rel="noopener noreferrer">message us</a> for a price. Recommend another madrasah — get a month free.</p>
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
          <p>Look around a made-up maktab, Darul Uloom or school as the head, a teacher or a parent — it takes a minute. Questions? Message us any time.</p>
          <div className="lp-cta lp-cta-center">
            <a href="/?demo" className="lp-btn lp-btn-white"><PlayCircle size={17} />Maktab demo</a>
            <a href="/?demo=darul-uloom" className="lp-btn lp-btn-outline"><PlayCircle size={17} />Darul Uloom demo</a>
            <a href="/?demo=school" className="lp-btn lp-btn-outline"><PlayCircle size={17} />School demo</a>
            <WhatsApp className="lp-btn lp-btn-outline">Message us on WhatsApp</WhatsApp>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-brand"><span className="lp-brand-ar">{APP_NAME_ARABIC}</span><span>{APP_NAME}</span></div>
        <div className="lp-footer-links">
          {DOORS.map(d => <a key={d.key} href={d.path}>{d.title}</a>)}
          <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
          <button type="button" onClick={() => setLegal('privacy')}>Privacy</button>
          <button type="button" onClick={() => setLegal('terms')}>Terms</button>
          <button type="button" onClick={() => setLegal('dpa')}>Data agreement (schools)</button>
          <a href="/" onClick={signIn}>Sign in</a>
        </div>
      </footer>
      {legal && <LegalModal kind={legal} onClose={() => setLegal(null)} />}
    </div>
  );
}
