// pages/Dashboard.js
import React, { useState } from 'react';
import Layout from '../components/Layout';
import EnrollmentForm from '../components/EnrollmentForm';
import { getStudents, getFees, calcAttendancePct, avatarInitials, getClassNames } from '../lib/store';
import { Users, Coins, TrendingUp, AlertCircle, Plus } from 'lucide-react';

export default function Dashboard() {
  const [showEnroll, setShowEnroll] = useState(false);
  const [students, setStudents] = useState(getStudents);
  const classNames = getClassNames();
  const fees = getFees();

  const active = students.filter(s => s.status === 'Active').length;
  const avgAtt = students.length
    ? Math.round(students.reduce((s, st) => s + calcAttendancePct(st.id), 0) / students.length)
    : 0;
  const outstanding = fees.filter(f => f.status !== 'Paid').length;
  const collected = fees.filter(f => f.status === 'Paid').reduce((s, f) => s + Number(f.amount), 0);
  const totalOwed = fees.filter(f => f.status !== 'Paid').reduce((s, f) => s + Number(f.amount), 0);

  return (
    <Layout title="Dashboard" subtitle="Overview">
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-icon blue"><Users size={18} /></div>
          <div className="metric-value">{active}</div>
          <div className="metric-label">Active students</div>
          <div className="metric-delta">
            {classNames.map(c => `${c}: ${students.filter(s => s.class === c).length}`).join(' · ')}
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-icon teal"><TrendingUp size={18} /></div>
          <div className="metric-value">{avgAtt}%</div>
          <div className="metric-label">Avg attendance</div>
        </div>
        <div className="metric-card">
          <div className="metric-icon teal"><Coins size={18} /></div>
          <div className="metric-value">£{collected.toFixed(2)}</div>
          <div className="metric-label">Fees collected</div>
        </div>
        <div className="metric-card">
          <div className="metric-icon red"><AlertCircle size={18} /></div>
          <div className="metric-value">{outstanding}</div>
          <div className="metric-label">Unpaid records</div>
          <div className="metric-delta" style={{ color: 'var(--red)' }}>£{totalOwed.toFixed(2)} outstanding</div>
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: 22 }}>
        {classNames.map(cls => {
          const classStudents = students.filter(s => s.class === cls);
          return (
            <div className="card" key={cls}>
              <div className="card-header">
                <div>
                  <div className="card-title">{cls}</div>
                  <div className="card-sub">{classStudents.length} students</div>
                </div>
                <button className="btn btn-teal btn-sm" onClick={() => setShowEnroll(true)}>
                  <Plus size={13} /> Enroll
                </button>
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Name</th><th>Parent contact</th><th>Att.</th></tr></thead>
                  <tbody>
                    {classStudents.map(s => {
                      const att = calcAttendancePct(s.id);
                      return (
                        <tr key={s.id}>
                          <td>
                            <div className="flex items-center gap-2">
                              <div className="avatar" style={{ width: 26, height: 26, fontSize: 10 }}>{avatarInitials(s.forename + ' ' + s.surname)}</div>
                              <div style={{ fontWeight: 500 }}>{s.forename} {s.surname}</div>
                            </div>
                          </td>
                          <td className="text-muted text-sm">{s.parent1Phone}</td>
                          <td style={{ fontWeight: 600, color: att >= 90 ? 'var(--teal-dark)' : att >= 75 ? 'var(--gold)' : att > 0 ? 'var(--red)' : 'var(--text-soft)' }}>
                            {att > 0 ? `${att}%` : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>

      {showEnroll && (
        <EnrollmentForm onClose={() => setShowEnroll(false)} onSaved={() => setStudents(getStudents())} />
      )}
    </Layout>
  );
}
