// A child's extra details (beyond name, class, parents' names & phones, fee and dates):
// family & contact, health, going home, and — in a Darul Uloom — boarding and background.
// The edit pop-up, the child's profile and the students spreadsheet all use this one list;
// server/routes/students.js keeps the matching columns (DETAILS there).

export const RELATIONS = ['Mother', 'Father', 'Guardian', 'Grandparent', 'Other'];

// [key, label, { section, options, du (Darul Uloom only), wide (full-width box), type }]
export const DETAIL_FIELDS = [
  ['gender', 'Boy or girl', { section: 'about', options: ['Boy', 'Girl'] }],
  ['parent1Relation', 'Parent 1 is', { section: 'parents', options: RELATIONS }],
  ['parent1Email', 'Parent 1 email', { section: 'parents', type: 'email' }],
  ['parent2Relation', 'Parent 2 is', { section: 'parents', options: RELATIONS }],
  ['parent2Email', 'Parent 2 email', { section: 'parents', type: 'email' }],
  ['mainContact', 'Contact first', { section: 'family', options: ['Parent 1', 'Parent 2'] }],
  ['address', 'Home address', { section: 'family', wide: true }],
  ['postcode', 'Postcode', { section: 'family' }],
  ['emergencyName', 'Name', { section: 'emergency' }],
  ['emergencyRelation', 'They are the child\'s', { section: 'emergency' }],
  ['emergencyPhone', 'Phone', { section: 'emergency', type: 'tel' }],
  ['allergies', 'Allergies', { section: 'health', wide: true }],
  ['medical', 'Medical conditions', { section: 'health', wide: true }],
  ['medication', 'Medication', { section: 'health', wide: true }],
  ['walksHome', 'Can go home alone', { section: 'home', options: ['Yes', 'No'] }],
  ['collectors', 'Who else may collect them', { section: 'home', wide: true }],
  ['boarding', 'Boarder or day student', { section: 'du', du: true, options: ['Boarder', 'Day student'] }],
  ['schoolYear', 'School year (if also at school)', { section: 'du', du: true }],
  ['previousSchool', 'Previous madrasah or school', { section: 'du', du: true, wide: true }],
  ['hifdhCompleted', 'Hifdh completed (year)', { section: 'du', du: true }],
];

// Sections shown as their own blocks. 'about' (boy or girl) and 'parents' (each parent's
// relation and email) sit with the name and the parents' names and phones instead.
export const DETAIL_SECTIONS = [
  ['family', 'Home & contact'],
  ['emergency', 'Emergency contact (if not a parent)'],
  ['health', 'Health'],
  ['home', 'Going home'],
  ['du', 'Darul Uloom'],
];

export const detailFields = isDarulUloom => DETAIL_FIELDS.filter(([, , o]) => !o.du || isDarulUloom);

// Allergies, conditions or medication — shown in red wherever the child is opened.
export const hasHealthNote = s => !!(s && (s.allergies || s.medical || s.medication));
