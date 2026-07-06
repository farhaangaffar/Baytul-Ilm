// pages/Courses.js
import React from 'react';
import Layout from '../components/Layout';
import { getStudents } from '../lib/store';
import { BookOpen, Star, Scale, Music, Pencil } from 'lucide-react';

const courses = [
  { id: 'hifz', name: 'Hifz ul-Quran', desc: 'Full memorisation of the Holy Quran — 30 Juz programme with daily revision and weekly testing.', icon: BookOpen, level: 'Hifz', color: 'var(--teal)', bg: 'var(--teal-light)', teacher: 'Ustadh Ibrahim', days: 'Sat–Wed', time: '8:00–9:30 AM' },
  { id: 'nazra', name: 'Nazra (Quran Reading)', desc: 'Correct reading of the Quran with basic Tajweed rules. Foundation for all further Quranic studies.', icon: BookOpen, level: 'Nazra', color: 'var(--navy)', bg: 'var(--navy-faint)', teacher: 'Ustadha Maryam', days: 'Tue', time: '2:00–3:30 PM' },
  { id: 'arabic', name: 'Arabic Language', desc: 'Grammar (Nahw & Sarf), vocabulary, and reading comprehension. Sataeen and Hidayatun Nahw texts used.', icon: Pencil, level: 'All', color: '#378ADD', bg: '#E6F1FB', teacher: 'Ustadha Maryam', days: 'Sat, Mon, Wed', time: '10:00–11:30 AM' },
  { id: 'islamic', name: 'Islamic Studies', desc: "Aqeedah, Seerah of the Prophet ﷺ, history of Islam, and general Islamic knowledge across 4 levels.", icon: Star, level: 'All', color: 'var(--gold)', bg: 'var(--gold-light)', teacher: 'Ustadh Bilal', days: 'Sat–Tue', time: '2:00–3:30 PM' },
  { id: 'fiqh', name: 'Fiqh (Islamic Jurisprudence)', desc: 'Hanafi curriculum covering Taharah, Salah, Sawm, Zakah, and Hajj using Nur ul-Idah.', icon: Scale, level: 'Intermediate', color: '#7F77DD', bg: '#EEEDFE', teacher: 'Ustadh Bilal', days: 'Sun, Tue', time: '12:00–1:00 PM' },
  { id: 'tajweed', name: 'Tajweed', desc: 'Rules of correct Quranic recitation — Makhaarij, Sifaat, and practical application with individual assessment.', icon: Music, level: 'All', color: '#D4537E', bg: '#FBEAF0', teacher: 'Ustadha Maryam', days: 'Sun, Tue', time: '4:00–5:00 PM' },
];

export default function Courses() {
  const students = getStudents();
  const countByLevel = (level) => students.filter(s => s.level === level).length;

  return (
    <Layout title="Courses & curriculum" subtitle="Islamic studies programme — 1446 AH">
      <div className="grid-3 mb-6">
        {courses.map(c => {
          const Icon = c.icon;
          return (
            <div key={c.id} className="card" style={{ borderTop: `3px solid ${c.color}`, marginBottom: 0 }}>
              <div className="flex items-center gap-2 mb-4">
                <div style={{ width: 36, height: 36, borderRadius: 8, background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={18} color={c.color} />
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</div>
                  <span className="badge badge-blue" style={{ fontSize: 10 }}>{c.level}</span>
                </div>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 12 }}>{c.desc}</p>
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, fontSize: 12 }}>
                <div className="flex justify-between mb-4">
                  <span className="text-muted">Teacher</span>
                  <span style={{ fontWeight: 500 }}>{c.teacher}</span>
                </div>
                <div className="flex justify-between mb-4">
                  <span className="text-muted">Schedule</span>
                  <span style={{ fontWeight: 500 }}>{c.days}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Time</span>
                  <span style={{ fontWeight: 500 }}>{c.time}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="card">
        <div className="card-title" style={{ marginBottom: 14 }}>Enrolment by level</div>
        <table>
          <thead><tr><th>Level</th><th>Students enrolled</th><th>Classes</th></tr></thead>
          <tbody>
            {[['Nazra','Nazra',2],['Hifz','Hifz',3],['Alimiyya','Alimiyya',2],['Tajweed','Tajweed',1]].map(([label, level, cls]) => (
              <tr key={label}>
                <td style={{ fontWeight: 500 }}>{label}</td>
                <td>
                  <div className="flex items-center gap-2">
                    <div className="progress-bar" style={{ width: 100 }}>
                      <div className="progress-fill" style={{ width: `${Math.min(100, (countByLevel(level) / students.length) * 100 * 2)}%`, background: 'var(--navy)' }} />
                    </div>
                    <span>{countByLevel(level)} students</span>
                  </div>
                </td>
                <td>{cls} {cls === 1 ? 'class' : 'classes'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
