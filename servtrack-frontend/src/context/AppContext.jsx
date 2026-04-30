import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const AppContext = createContext(null);

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://127.0.0.1:8000/api/v1';
const TOKEN_KEY = 'servtrack_token';

function formatDate(dateString, options) {
  if (!dateString) return '—';
  return new Intl.DateTimeFormat('en-IN', options).format(new Date(dateString));
}

function formatDateTime(dateString) {
  return formatDate(dateString, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatRelativeTime(dateString) {
  if (!dateString) return '—';
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diffMinutes = Math.max(1, Math.round((now - then) / 60000));

  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

function roleLabel(role) {
  if (!role) return 'Unknown';
  if (role === 'enduser') return 'End User';
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function mapActivity(entry) {
  return {
    id: entry.id,
    time: formatDateTime(entry.created_at),
    by: entry.user ? `${entry.user.full_name} (${roleLabel(entry.user.role)})` : 'System',
    action: entry.action,
    note: entry.note || '',
    type: entry.to_status === 'closed' ? 'closed' : entry.to_status === 'escalated' ? 'escalated' : 'default',
  };
}

function mapWorkOrder(wo, previous = null) {
  const contractorName = wo.contractor?.name || previous?.contractor || 'Unassigned';
  const supervisorName = wo.supervisor?.full_name || previous?.supervisor || '—';
  const workmanName = wo.workman?.full_name || previous?.workman || '—';
  const dueDate = wo.due_date || null;

  return {
    id: wo.id,
    refNumber: wo.ref_number,
    title: wo.title,
    description: wo.description || 'No description provided.',
    category: wo.category,
    subCategory: wo.sub_category || '',
    area: wo.area,
    preferredVisitTime: wo.preferred_visit_time || '',
    contractor: contractorName,
    contractorId: wo.contractor?.id || wo.contractor_id || null,
    supervisor: supervisorName,
    supervisorId: wo.supervisor?.id || wo.supervisor_id || null,
    workman: workmanName,
    workmanId: wo.workman?.id || wo.workman_id || null,
    priority: wo.priority,
    status: wo.status,
    raisedBy: wo.raised_by_user ? `${wo.raised_by_user.full_name} (${roleLabel(wo.raised_by_user.role)})` : '—',
    raisedOn: formatDate(wo.created_at, { day: '2-digit', month: 'short', year: 'numeric' }),
    due: formatDate(dueDate, { day: '2-digit', month: 'short' }),
    dueDate,
    slaHours: wo.sla_hours,
    elapsedHours: wo.elapsed_hours,
    slaBreached: wo.due_date
    ? (new Date(wo.due_date) < new Date() && wo.status !== 'closed')
    : wo.sla_breached,
    createdAt: wo.created_at,
    updatedAt: wo.updated_at,
    startedAt: wo.started_at,
    closedAt: wo.closed_at,
    contractorInfo: wo.contractor || previous?.contractorInfo || null,
    raisedByUser: wo.raised_by_user || previous?.raisedByUser || null,
    activity: wo.activity ? wo.activity.map(mapActivity) : previous?.activity || [],
    attachments: wo.attachments || previous?.attachments || [],
    isDetailLoaded: Array.isArray(wo.activity),
  };
}

function mapNotification(notification) {
  return {
    id: notification.id,
    type: notification.notif_type || 'info',
    title: notification.title,
    body: notification.body || '',
    time: formatRelativeTime(notification.created_at),
    read: notification.is_read,
    workOrderId: notification.work_order_id,
    createdAt: notification.created_at,
  };
}

async function parseJson(response) {
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : null;
  if (!response.ok) {
    const detail = payload?.detail;
    if (typeof detail === 'string') throw new Error(detail);
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0];
      const field = Array.isArray(first.loc) ? first.loc[first.loc.length - 1] : null;
      throw new Error(`${field ? `${field}: ` : ''}${first.msg || 'Request failed'}`);
    }
    throw new Error('Request failed');
  }
  return payload;
}

export function AppProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [workOrders, setWorkOrders] = useState([]);
  const [contractors, setContractors] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [dashboardStats, setDashboardStats] = useState(null);
  const [usersByQuery, setUsersByQuery] = useState({});
  const [toasts, setToasts] = useState([]);

  const role = currentUser?.role || null;
  const isAuthenticated = Boolean(token && currentUser);

  const showToast = useCallback((message, type = 'default') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  }, []);

  const apiFetch = useCallback(async (path, options = {}) => {
    const headers = {
      ...(options.headers || {}),
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
    });
    return parseJson(response);
  }, [token]);

  const mergeWorkOrder = useCallback((payload) => {
    setWorkOrders(prev => {
      const existing = prev.find(item => item.id === payload.id) || null;
      const mapped = mapWorkOrder(payload, existing);
      const next = prev.some(item => item.id === mapped.id)
        ? prev.map(item => (item.id === mapped.id ? mapped : item))
        : [mapped, ...prev];
      return next.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    });
  }, []);

  const loadWorkOrders = useCallback(async () => {
    const data = await apiFetch('/work-orders/');
    setWorkOrders(data.map(item => mapWorkOrder(item)));
    return data;
  }, [apiFetch]);

  const loadNotifications = useCallback(async () => {
    const data = await apiFetch('/notifications/');
    setNotifications(data.map(mapNotification));
    return data;
  }, [apiFetch]);

  const loadContractors = useCallback(async () => {
    const data = await apiFetch('/contractors/');
    setContractors(data);
    return data;
  }, [apiFetch]);

  const loadContracts = useCallback(async () => {
    const data = await apiFetch('/contractors/contracts');
    setContracts(data);
    return data;
  }, [apiFetch]);

  const loadDashboardStats = useCallback(async () => {
    const data = await apiFetch('/work-orders/dashboard-stats');
    setDashboardStats(data);
    return data;
  }, [apiFetch]);

  const loadUsers = useCallback(async ({ role: userRole, contractorId } = {}) => {
    const params = new URLSearchParams();
    if (userRole) params.set('role', userRole);
    if (contractorId) params.set('contractor_id', contractorId);
    const key = params.toString() || 'all';
    const data = await apiFetch(`/users${params.toString() ? `?${params.toString()}` : ''}`);
    setUsersByQuery(prev => ({ ...prev, [key]: data }));
    return data;
  }, [apiFetch]);

  const loadAppData = useCallback(async () => {
    setDataLoading(true);
    try {
      await Promise.all([
        loadWorkOrders(),
        loadNotifications(),
        loadContractors(),
        loadContracts(),
        loadDashboardStats(),
      ]);
    } finally {
      setDataLoading(false);
    }
  }, [loadContractors, loadContracts, loadDashboardStats, loadNotifications, loadWorkOrders]);

  const hydrateSession = useCallback(async () => {
    if (!token) {
      setAuthLoading(false);
      return;
    }

    try {
      const user = await apiFetch('/auth/me');
      setCurrentUser(user);
      await loadAppData();
    } catch (error) {
      localStorage.removeItem(TOKEN_KEY);
      setToken(null);
      setCurrentUser(null);
    } finally {
      setAuthLoading(false);
    }
  }, [apiFetch, loadAppData, token]);

  useEffect(() => {
    hydrateSession();
  }, [hydrateSession]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;

    const refresh = () => {
      loadAppData().catch(() => {});
    };

    const intervalId = window.setInterval(() => {
      if (!document.hidden) refresh();
    }, 10000);

    const handleFocus = () => refresh();
    const handleVisibilityChange = () => {
      if (!document.hidden) refresh();
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAuthenticated, loadAppData]);

  const login = useCallback(async (email, password) => {
    const data = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }).then(parseJson);

    localStorage.setItem(TOKEN_KEY, data.access_token);
    setToken(data.access_token);
    setCurrentUser(data.user);
    await Promise.all([
      (async () => {
        const authedFetch = async (path) => {
          const response = await fetch(`${API_BASE_URL}${path}`, {
            headers: { Authorization: `Bearer ${data.access_token}` },
          });
          return parseJson(response);
        };

        const [woData, notifData, contractorData, contractData, statsData] = await Promise.all([
          authedFetch('/work-orders/'),
          authedFetch('/notifications/'),
          authedFetch('/contractors/'),
          authedFetch('/contractors/contracts'),
          authedFetch('/work-orders/dashboard-stats'),
        ]);

        setWorkOrders(woData.map(item => mapWorkOrder(item)));
        setNotifications(notifData.map(mapNotification));
        setContractors(contractorData);
        setContracts(contractData);
        setDashboardStats(statsData);
      })(),
    ]);
    return data.user;
  }, []);

  const acceptInvite = useCallback(async ({ token: inviteToken, fullName, password, phone }) => {
    const data = await fetch(`${API_BASE_URL}/auth/accept-invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: inviteToken,
        full_name: fullName,
        password,
        phone: phone || null,
      }),
    }).then(parseJson);

    localStorage.setItem(TOKEN_KEY, data.access_token);
    setToken(data.access_token);
    setCurrentUser(data.user);

    const authedFetch = async (path) => {
      const response = await fetch(`${API_BASE_URL}${path}`, {
        headers: { Authorization: `Bearer ${data.access_token}` },
      });
      return parseJson(response);
    };

    const [woData, notifData, contractorData, contractData, statsData] = await Promise.all([
      authedFetch('/work-orders/'),
      authedFetch('/notifications/'),
      authedFetch('/contractors/'),
      authedFetch('/contractors/contracts'),
      authedFetch('/work-orders/dashboard-stats'),
    ]);

    setWorkOrders(woData.map(item => mapWorkOrder(item)));
    setNotifications(notifData.map(mapNotification));
    setContractors(contractorData);
    setContracts(contractData);
    setDashboardStats(statsData);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setCurrentUser(null);
    setWorkOrders([]);
    setNotifications([]);
    setContractors([]);
    setContracts([]);
    setDashboardStats(null);
    setUsersByQuery({});
  }, []);

  const loadWorkOrderDetail = useCallback(async (id) => {
    const payload = await apiFetch(`/work-orders/${id}`);
    mergeWorkOrder(payload);
    return payload;
  }, [apiFetch, mergeWorkOrder]);

  const updateWOStatus = useCallback(async (id, newStatus, note = '') => {
    const payload = await apiFetch(`/work-orders/${id}/transition`, {
      method: 'POST',
      body: JSON.stringify({ new_status: newStatus, note }),
    });
    mergeWorkOrder(payload);
    await Promise.all([loadNotifications(), loadDashboardStats()]);
    return payload;
  }, [apiFetch, loadDashboardStats, loadNotifications, mergeWorkOrder]);

  const updateWorkOrder = useCallback(async (id, updates) => {
    const payload = await apiFetch(`/work-orders/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    mergeWorkOrder(payload);
    await Promise.all([loadNotifications(), loadDashboardStats()]);
    return payload;
  }, [apiFetch, loadDashboardStats, loadNotifications, mergeWorkOrder]);

  const createWorkOrder = useCallback(async (form) => {
    if (form.photos?.length) {
      const body = new FormData();
      body.append('title', form.title);
      body.append('description', form.description || '');
      body.append('category', form.category);
      body.append('sub_category', form.subCategory || '');
      body.append('area', form.area);
      body.append('priority', form.priority);
      body.append('preferred_visit_time', form.preferredVisitTime || '');
      body.append('sla_hours', '24');
      form.photos.forEach(photo => body.append('photos', photo));

      const payload = await apiFetch('/work-orders/with-photos', {
        method: 'POST',
        body,
      });
      mergeWorkOrder(payload);
      await Promise.all([loadNotifications(), loadDashboardStats()]);
      return payload;
    }

    const payload = await apiFetch('/work-orders/', {
      method: 'POST',
      body: JSON.stringify({
        title: form.title,
        description: form.description || null,
        category: form.category,
        sub_category: form.subCategory || null,
        area: form.area,
        priority: form.priority,
        preferred_visit_time: form.preferredVisitTime || null,
        sla_hours: 24,
        due_date: null,
        contractor_id: form.contractorId ? Number(form.contractorId) : null,
        supervisor_id: null,
        workman_id: null,
      }),
    });
    mergeWorkOrder(payload);
    await Promise.all([loadNotifications(), loadDashboardStats()]);
    return payload;
  }, [apiFetch, loadDashboardStats, loadNotifications, mergeWorkOrder]);

  const markNotifRead = useCallback(async (id) => {
    await apiFetch(`/notifications/${id}/read`, { method: 'POST' });
    setNotifications(prev => prev.map(n => (n.id === id ? { ...n, read: true } : n)));
  }, [apiFetch]);

  const markAllNotificationsRead = useCallback(async () => {
    await apiFetch('/notifications/mark-all-read', { method: 'POST' });
    setNotifications(prev => prev.map(notification => ({ ...notification, read: true })));
  }, [apiFetch]);

  const escalateRequest = useCallback(async (id) => {
    const payload = await apiFetch(`/work-orders/${id}/escalate`, { method: 'POST' });
    mergeWorkOrder(payload);
    await Promise.all([loadNotifications(), loadDashboardStats()]);
    return payload;
  }, [apiFetch, loadDashboardStats, loadNotifications, mergeWorkOrder]);

  const addRequestDetails = useCallback(async (id, note) => {
    const payload = await apiFetch(`/work-orders/${id}/additional-details`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    });
    mergeWorkOrder(payload);
    await Promise.all([loadNotifications(), loadDashboardStats()]);
    return payload;
  }, [apiFetch, loadDashboardStats, loadNotifications, mergeWorkOrder]);

  const uploadWorkOrderPhotos = useCallback(async (id, files) => {
    const body = new FormData();
    files.forEach(file => body.append('photos', file));
    const payload = await apiFetch(`/work-orders/${id}/photos`, { method: 'POST', body });
    mergeWorkOrder(payload);
    await loadWorkOrderDetail(id);
    return payload;
  }, [apiFetch, loadWorkOrderDetail, mergeWorkOrder]);

  const completeWorkOrder = useCallback(async (id, files, note = '') => {
    const body = new FormData();
    if (note.trim()) body.append('note', note.trim());
    files.forEach(file => body.append('photos', file));
    const payload = await apiFetch(`/work-orders/${id}/complete`, { method: 'POST', body });
    mergeWorkOrder(payload);
    await Promise.all([loadNotifications(), loadDashboardStats()]);
    return payload;
  }, [apiFetch, loadDashboardStats, loadNotifications, mergeWorkOrder]);

  const inviteContractorUser = useCallback(async ({ email, role: inviteRole }) => {
    return apiFetch('/users/invite-contractor-user', {
      method: 'POST',
      body: JSON.stringify({ email, role: inviteRole }),
    });
  }, [apiFetch]);

  const createContractor = useCallback(async (form) => {
    const payload = await apiFetch('/contractors/', {
      method: 'POST',
      body: JSON.stringify({
        name: form.name.trim(),
        speciality: form.speciality.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
      }),
    });
    setContractors(prev => [payload, ...prev.filter(contractor => contractor.id !== payload.id)]);
    return payload;
  }, [apiFetch]);

  const discoverContractors = useCallback(async (search = '') => {
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    return apiFetch(`/contractors/discover${params.toString() ? `?${params.toString()}` : ''}`);
  }, [apiFetch]);

  const linkContractor = useCallback(async (contractorId) => {
    const payload = await apiFetch('/contractors/link', {
      method: 'POST',
      body: JSON.stringify({ contractor_id: contractorId }),
    });
    setContractors(prev => [payload, ...prev.filter(contractor => contractor.id !== payload.id)]);
    return payload;
  }, [apiFetch]);

  const createContract = useCallback(async (form) => {
    const payload = await apiFetch('/contractors/contracts', {
      method: 'POST',
      body: JSON.stringify({
        contractor_id: Number(form.contractorId),
        title: form.title.trim(),
        scope: form.scope?.trim() || null,
        start_date: form.startDate,
        end_date: form.endDate,
        value: Number(form.value || 0),
        default_sla_hours: Number(form.defaultSlaHours || 24),
        status: form.status,
      }),
    });
    setContracts(prev => [payload, ...prev.filter(contract => contract.id !== payload.id)]);
    return payload;
  }, [apiFetch]);

  const unreadCount = useMemo(
    () => notifications.filter(notification => !notification.read).length,
    [notifications]
  );

  return (
    <AppContext.Provider value={{
      apiBaseUrl: API_BASE_URL,
      authLoading,
      dataLoading,
      isAuthenticated,
      currentUser,
      role,
      login,
      logout,
      workOrders,
      loadWorkOrders,
      loadWorkOrderDetail,
      loadUsers,
      usersByQuery,
      updateWOStatus,
      updateWorkOrder,
      createWorkOrder,
      escalateRequest,
      addRequestDetails,
      uploadWorkOrderPhotos,
      completeWorkOrder,
      dashboardStats,
      contractors,
      notifications,
      markNotifRead,
      markAllNotificationsRead,
      unreadCount,
      createContractor,
      discoverContractors,
      linkContractor,
      contracts,
      loadContracts,
      createContract,
      inviteContractorUser,
      acceptInvite,
      toasts,
      showToast,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
