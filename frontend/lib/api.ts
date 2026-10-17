export interface ApiError {
  detail: string;
  status: number;
}

const API_BASE = "/api/v1";

let adminToken: string | null = null;
if (typeof window !== "undefined") {
  adminToken = localStorage.getItem("cardscan_admin_token");
}

export function setAdminToken(token: string | null) {
  adminToken = token;
  if (typeof window !== "undefined") {
    if (token) {
      localStorage.setItem("cardscan_admin_token", token);
    } else {
      localStorage.removeItem("cardscan_admin_token");
    }
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  if (adminToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${adminToken}`);
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
    credentials: "include", // Send HttpOnly session cookies
  });

  if (!response.ok) {
    let errorDetail = "An unexpected error occurred.";
    try {
      const errorJson = await response.json();
      if (typeof errorJson.detail === "string") {
        errorDetail = errorJson.detail;
      } else if (Array.isArray(errorJson.detail)) {
        errorDetail = errorJson.detail.map((e: any) => e.msg).join(", ");
      }
    } catch (_) {
      errorDetail = response.statusText || errorDetail;
    }

    const error: ApiError = {
      detail: errorDetail,
      status: response.status,
    };
    throw error;
  }

  return response.json();
}

export const api = {
  // Customer PIN validation
  validatePin: (pin: string) =>
    request<{
      success: boolean;
      session_id: string;
      session_token: string;
      card_type: string;
      status: string;
      expires_at: string;
      pin_label?: string;
      remaining_scans?: number;
      redirect_url: string;
    }>("/access-pins/validate", {
      method: "POST",
      body: JSON.stringify({ pin }),
    }),

  // Customer Sessions
  getCurrentSession: () => request<any>("/sessions/current"),

  startNextSession: () =>
    request<any>("/sessions/next", {
      method: "POST",
    }),

  updateCardType: (card_type: "single" | "double") =>
    request<any>("/sessions/card-type", {
      method: "POST",
      body: JSON.stringify({ card_type }),
    }),

  uploadSessionImage: (sessionId: string, side: "front" | "back", originalBlob: Blob, processedBlob: Blob) => {
    const formData = new FormData();
    formData.append("original_file", originalBlob, `${side}_original.jpg`);
    formData.append("processed_file", processedBlob, `${side}_processed.jpg`);

    return request<any>(`/sessions/${sessionId}/images/${side}`, {
      method: "POST",
      body: formData,
    });
  },

  retakeSide: (sessionId: string, side: "front" | "back") =>
    request<any>(`/sessions/${sessionId}/retake/${side}`, {
      method: "POST",
    }),

  completeSession: (sessionId: string) =>
    request<{
      success: boolean;
      session_id: string;
      gift_card_id: string;
      reference_code: string;
      status: string;
      message: string;
    }>(`/sessions/${sessionId}/complete`, {
      method: "POST",
    }),

  cancelSession: (sessionId: string) =>
    request<any>(`/sessions/${sessionId}/cancel`, {
      method: "POST",
    }),

  // Admin Auth
  adminLogin: async (email: string, password: string) => {
    const res = await request<{ success: boolean; token: string; user: any }>("/admin/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (res.token) {
      setAdminToken(res.token);
    }
    return res;
  },

  adminLogout: async () => {
    setAdminToken(null);
    return request<{ success: boolean; message: string }>("/admin/auth/logout", {
      method: "POST",
    });
  },

  getAdminProfile: () => request<any>("/admin/auth/me"),

  // Admin Dashboard
  getAdminDashboard: () => request<any>("/admin/dashboard"),

  // Admin Cards
  listCards: (params: { query?: string; card_type?: string; status?: string; pin_id?: string; page?: number; page_size?: number } = {}) => {
    const searchParams = new URLSearchParams();
    if (params.query) searchParams.set("query", params.query);
    if (params.card_type) searchParams.set("card_type", params.card_type);
    if (params.status) searchParams.set("status", params.status);
    if (params.pin_id) searchParams.set("pin_id", params.pin_id);
    if (params.page) searchParams.set("page", params.page.toString());
    if (params.page_size) searchParams.set("page_size", params.page_size.toString());

    return request<any>(`/admin/cards?${searchParams.toString()}`);
  },

  getCardDetail: (cardId: string) => request<any>(`/admin/cards/${cardId}`),

  updateCard: (cardId: string, payload: { brand?: string; denomination?: string; notes?: string; status?: string }) =>
    request<any>(`/admin/cards/${cardId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  archiveCard: (cardId: string) =>
    request<any>(`/admin/cards/${cardId}/archive`, {
      method: "POST",
    }),

  deleteCard: (cardId: string) =>
    request<any>(`/admin/cards/${cardId}`, {
      method: "DELETE",
    }),

  // Admin PINs
  listAccessPins: (params: { status_filter?: string; page?: number; page_size?: number } = {}) => {
    const searchParams = new URLSearchParams();
    if (params.status_filter) searchParams.set("status_filter", params.status_filter);
    if (params.page) searchParams.set("page", params.page.toString());
    if (params.page_size) searchParams.set("page_size", params.page_size.toString());

    return request<any>(`/admin/access-pins?${searchParams.toString()}`);
  },

  createPin: (payload: { pin_length: number; label?: string; max_completed_scans?: number | null; expires_at?: string }) =>
    request<any>("/admin/access-pins", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  createBatchPins: (payload: { count: number; pin_length: number; label_prefix?: string; max_completed_scans?: number | null; expires_at?: string }) =>
    request<any>("/admin/access-pins/batch", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  revokePin: (pinId: string) =>
    request<any>(`/admin/access-pins/${pinId}/revoke`, {
      method: "POST",
    }),

  // Admin Audit
  getAuditLogs: (params: { action?: string; actor_type?: string; page?: number; page_size?: number } = {}) => {
    const searchParams = new URLSearchParams();
    if (params.action) searchParams.set("action", params.action);
    if (params.actor_type) searchParams.set("actor_type", params.actor_type);
    if (params.page) searchParams.set("page", params.page.toString());
    if (params.page_size) searchParams.set("page_size", params.page_size.toString());

    return request<any>(`/admin/audit-logs?${searchParams.toString()}`);
  },

  // Admin User Management (Employees & Admins)
  listUsers: (params: { page?: number; page_size?: number } = {}) => {
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.set("page", params.page.toString());
    if (params.page_size) searchParams.set("page_size", params.page_size.toString());
    return request<any>(`/admin/users?${searchParams.toString()}`);
  },

  createUser: (payload: { email: string; password: string; role: "employee" | "admin" }) =>
    request<any>("/admin/users", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateUser: (userId: string, payload: { status?: "active" | "disabled"; role?: "employee" | "admin"; password?: string }) =>
    request<any>(`/admin/users/${userId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  deleteUser: (userId: string) =>
    request<any>(`/admin/users/${userId}`, {
      method: "DELETE",
    }),
};
