// ============================================================
//  ServTrack — Mock Data
//  Replace these with API calls when backend is ready
// ============================================================

export const ROLES = {
  client:     { label: 'Client',      avatar: 'CL', color: '#1B4FD8' },
  contractor: { label: 'Contractor',  avatar: 'CO', color: '#059669' },
  supervisor: { label: 'Supervisor',  avatar: 'SV', color: '#7C3AED' },
  workman:    { label: 'Workman',     avatar: 'WM', color: '#D97706' },
  enduser:    { label: 'End User',    avatar: 'EU', color: '#6B7280' },
};

export const STATUS_CONFIG = {
  open:       { label: 'Open',             cls: 'badge-open' },
  assigned:   { label: 'Assigned',         cls: 'badge-assigned' },
  inprogress: { label: 'In Progress',      cls: 'badge-inprogress' },
  qc:         { label: 'Pending QC',       cls: 'badge-qc' },
  pending:    { label: 'Pending Approval', cls: 'badge-pending' },
  closed:     { label: 'Closed',           cls: 'badge-closed' },
  escalated:  { label: 'Escalated',        cls: 'badge-escalated' },
};

export const STATUS_FLOW = ['open', 'assigned', 'inprogress', 'qc', 'pending', 'closed'];

export const CATEGORIES = ['Electrical', 'HVAC', 'Plumbing', 'Civil', 'Fire Safety', 'Carpentry', 'Other'];

export const CONTRACTORS = [
  { id: 'c1', name: 'AlphaServ',  speciality: 'Electrical, Civil',    rating: 4.8, activeWOs: 6 },
  { id: 'c2', name: 'CoolTech',   speciality: 'HVAC',                 rating: 4.5, activeWOs: 4 },
  { id: 'c3', name: 'BrightCo',   speciality: 'Electrical, Lighting', rating: 4.6, activeWOs: 2 },
  { id: 'c4', name: 'HydroFix',   speciality: 'Plumbing, Drainage',   rating: 4.3, activeWOs: 1 },
];

export const SUPERVISORS = [
  { id: 's1', name: 'Ramesh K',   contractor: 'AlphaServ' },
  { id: 's2', name: 'Priya M',    contractor: 'CoolTech'  },
  { id: 's3', name: 'Vijay R',    contractor: 'BrightCo'  },
  { id: 's4', name: 'Anita S',    contractor: 'HydroFix'  },
];

export const WORK_ORDERS = [
  {
    id: 'WO-2401',
    title: 'Gate motor fault — B2',
    description: 'Gate motor not responding to remote control. Vehicle access blocked. Security camera shows gate stuck in open position since 08:50.',
    category: 'Electrical',
    area: 'Block B2 — Gate',
    contractor: 'AlphaServ',
    supervisorId: 's1',
    supervisor: 'Ramesh K',
    workman: 'Suresh P',
    priority: 'High',
    status: 'escalated',
    raisedBy: 'Security (End User)',
    raisedOn: '24 Apr 2026',
    due: '24 Apr',
    slaHours: 4,
    elapsedHours: 6,
    activity: [
      { id: 'a1', time: '24 Apr 09:12', by: 'Security (End User)',    action: 'Request raised',              note: 'Gate stuck open, security risk',      type: 'default' },
      { id: 'a2', time: '24 Apr 09:45', by: 'Client (Admin)',         action: 'Assigned to AlphaServ',       note: 'High priority — vehicle access route', type: 'default' },
      { id: 'a3', time: '24 Apr 11:00', by: 'AlphaServ (Supervisor)', action: 'Delegated to Suresh P',       note: '',                                    type: 'default' },
      { id: 'a4', time: '24 Apr 14:30', by: 'System',                 action: 'SLA breached — auto escalated', note: '4h SLA exceeded by 2h',             type: 'escalated' },
    ],
  },
  {
    id: 'WO-2402',
    title: 'HVAC filter replace — F3',
    description: 'HVAC filter clogged. Multiple tenants on Floor 3 reporting bad air quality and musty odour. Filter replacement overdue by 3 weeks.',
    category: 'HVAC',
    area: 'Floor 3 — AHU Room',
    contractor: 'CoolTech',
    supervisorId: 's2',
    supervisor: 'Priya M',
    workman: 'Arun S',
    priority: 'Med',
    status: 'inprogress',
    raisedBy: 'Tenant (End User)',
    raisedOn: '26 Apr 2026',
    due: '28 Apr',
    slaHours: 24,
    elapsedHours: 18,
    activity: [
      { id: 'a1', time: '26 Apr 10:00', by: 'Tenant (End User)',        action: 'Request raised',        note: 'Bad air quality reported',           type: 'default' },
      { id: 'a2', time: '26 Apr 11:30', by: 'Client (Admin)',           action: 'Assigned to CoolTech', note: 'Routine maintenance backlog',         type: 'default' },
      { id: 'a3', time: '27 Apr 08:00', by: 'CoolTech (Priya M)',       action: 'Work started',          note: 'Technician Arun S on site',          type: 'default' },
    ],
  },
  {
    id: 'WO-2403',
    title: 'Lobby lighting fix — Main',
    description: '3 overhead LED fixtures not functioning in main lobby. Affecting reception visibility and aesthetics. Bulbs likely need replacement.',
    category: 'Electrical',
    area: 'Main Lobby — Reception',
    contractor: 'BrightCo',
    supervisorId: 's3',
    supervisor: 'Vijay R',
    workman: 'Kiran T',
    priority: 'Low',
    status: 'assigned',
    raisedBy: 'Reception (End User)',
    raisedOn: '27 Apr 2026',
    due: '30 Apr',
    slaHours: 48,
    elapsedHours: 2,
    activity: [
      { id: 'a1', time: '27 Apr 09:00', by: 'Reception (End User)', action: 'Request raised',       note: 'Fixtures 3, 7, 11 not working', type: 'default' },
      { id: 'a2', time: '27 Apr 10:15', by: 'Client (Admin)',        action: 'Assigned to BrightCo', note: 'Low priority — no safety risk', type: 'default' },
    ],
  },
  {
    id: 'WO-2404',
    title: 'Pump room inspection',
    description: 'Routine scheduled pump room inspection and pressure check. Monthly preventive maintenance.',
    category: 'Plumbing',
    area: 'Basement — Pump Room',
    contractor: 'AlphaServ',
    supervisorId: 's1',
    supervisor: 'Ramesh K',
    workman: 'Dev B',
    priority: 'High',
    status: 'closed',
    raisedBy: 'Client (Admin)',
    raisedOn: '22 Apr 2026',
    due: '24 Apr',
    slaHours: 8,
    elapsedHours: 6,
    activity: [
      { id: 'a1', time: '22 Apr 08:00', by: 'Client (Admin)',         action: 'Request raised',           note: 'Scheduled monthly inspection',     type: 'default' },
      { id: 'a2', time: '22 Apr 09:00', by: 'AlphaServ',              action: 'Work started',             note: '',                                 type: 'default' },
      { id: 'a3', time: '22 Apr 14:00', by: 'Supervisor (Ramesh K)',  action: 'Marked complete',          note: 'All pressure checks passed',       type: 'default' },
      { id: 'a4', time: '22 Apr 16:00', by: 'Client (Admin)',         action: 'Approved & Closed',        note: 'Signed off — all readings normal', type: 'closed'  },
    ],
  },
  {
    id: 'WO-2405',
    title: 'Roof drainage blockage',
    description: 'Drainage outlet on the rooftop terrace is blocked causing water pooling. Risk of seepage into top floor.',
    category: 'Plumbing',
    area: 'Rooftop — Terrace',
    contractor: 'HydroFix',
    supervisorId: 's4',
    supervisor: 'Anita S',
    workman: '—',
    priority: 'High',
    status: 'open',
    raisedBy: 'Maintenance (End User)',
    raisedOn: '27 Apr 2026',
    due: '29 Apr',
    slaHours: 12,
    elapsedHours: 1,
    activity: [
      { id: 'a1', time: '27 Apr 14:00', by: 'Maintenance (End User)', action: 'Request raised', note: 'Water pooling — seepage risk', type: 'default' },
    ],
  },
  {
    id: 'WO-2406',
    title: 'Server room AC fault',
    description: 'Server room AC unit tripping repeatedly. IT has reported temperature rising above 26°C. Critical system risk if unresolved.',
    category: 'HVAC',
    area: 'IT Room — 2nd Floor',
    contractor: 'CoolTech',
    supervisorId: 's2',
    supervisor: 'Priya M',
    workman: 'Arun S',
    priority: 'High',
    status: 'pending',
    raisedBy: 'IT (End User)',
    raisedOn: '26 Apr 2026',
    due: '28 Apr',
    slaHours: 6,
    elapsedHours: 22,
    activity: [
      { id: 'a1', time: '26 Apr 15:00', by: 'IT Dept (End User)',    action: 'Request raised',                  note: 'Critical — server overheating risk', type: 'default'   },
      { id: 'a2', time: '26 Apr 16:00', by: 'Client (Admin)',         action: 'Assigned to CoolTech',           note: 'Urgent — 6h SLA',                    type: 'default'   },
      { id: 'a3', time: '27 Apr 10:00', by: 'CoolTech (Priya M)',    action: 'Job done — pending approval',    note: 'Replaced capacitor, AC stable',      type: 'default'   },
    ],
  },
];

export const NOTIFICATIONS = [
  { id: 'n1', type: 'danger',  title: 'SLA Breach — WO-2401',   body: 'Gate motor fault exceeded 4h SLA. Escalated automatically.', time: '1h ago',  read: false },
  { id: 'n2', type: 'warning', title: 'SLA Warning — WO-2406',  body: 'Server room AC: 80% of 6h SLA consumed. Act now.', time: '2h ago',  read: false },
  { id: 'n3', type: 'info',    title: 'Approval Needed — WO-2406', body: 'CoolTech marked job complete. Your sign-off is required.', time: '4h ago',  read: false },
  { id: 'n4', type: 'success', title: 'WO-2404 Closed',          body: 'Pump room inspection completed and approved.', time: '2d ago', read: true  },
];
