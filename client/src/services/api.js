import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json'
  }
});

// Interceptor to attach JWT token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('dairy_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Interceptor to handle 401 Unauthorized / Token Expiry
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const url = error.config?.url || '';
      if (!url.includes('/auth/login')) {
        localStorage.removeItem('dairy_token');
        localStorage.removeItem('dairy_user');
        if (window.location.pathname !== '/login' && window.location.pathname !== '/') {
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

// 1. Auth APIs
export const loginApi = (credentials) => api.post('/auth/login', credentials);
export const registerStaffApi = (userData) => api.post('/auth/register', userData);
export const getMeApi = () => api.get('/auth/me');
export const updateProfileApi = (data) => api.put('/auth/profile', data);

// 2. User Management APIs (Admin only)
export const getAllUsersApi = () => api.get('/users');
export const updateUserApi = (id, data) => api.put(`/users/${id}`, data);
export const deleteUserApi = (id) => api.delete(`/users/${id}`);

// 3. Product APIs
export const getProductsApi = (params) => api.get('/products', { params });
export const getProductByIdApi = (id) => api.get(`/products/${id}`);
export const getProductByBarcodeApi = (code) => api.get(`/products/barcode/${encodeURIComponent(code)}`);
export const getProductByCodeApi = (code) => api.get(`/products/code/${encodeURIComponent(code)}`);
export const lookupBarcodeApi = (barcode) => api.get(`/products/lookup-barcode/${encodeURIComponent(barcode)}`);
export const createProductApi = (data) => api.post('/products', data);
export const updateProductApi = (id, data) => api.put(`/products/${id}`, data);
export const deleteProductApi = (id) => api.delete(`/products/${id}`);
export const getProductQrApi = (id) => api.get(`/products/${id}/qr`);

// 4. Stock APIs
export const getStockLevelsApi = (params) => api.get('/stock', { params });
export const getStockAlertsApi = (params) => api.get('/stock/alerts', { params });
export const updateReorderThresholdApi = (productId, data) => api.put(`/stock/${productId}/threshold`, data);
export const quickStockInwardApi = (data) => api.post('/stock/inward', data);
export const resetAllStockToZeroApi = () => api.post('/stock/reset-zero');
export const adjustProductStockApi = (productId, data) => api.put(`/stock/${productId}/adjust`, data);
export const wipeAllTransactionDataApi = () => api.post('/stock/wipe-data');

// 4.1. Supplier APIs
export const getSuppliersApi = (params) => api.get('/suppliers', { params });
export const getSupplierByIdApi = (id) => api.get(`/suppliers/${id}`);
export const createSupplierApi = (data) => api.post('/suppliers', data);
export const updateSupplierApi = (id, data) => api.put(`/suppliers/${id}`, data);
export const deleteSupplierApi = (id) => api.delete(`/suppliers/${id}`);

// 5. Purchases APIs (Inward)
export const getPurchasesApi = (params) => api.get('/purchases', { params });
export const getPurchaseByIdApi = (id) => api.get(`/purchases/${id}`);
export const createPurchaseApi = (data) => api.post('/purchases', data);
export const updatePurchaseApi = (id, data) => api.put(`/purchases/${id}`, data);
export const deletePurchaseApi = (id) => api.delete(`/purchases/${id}`);

// 6. Sales APIs (Outward)
export const getSalesApi = (params) => api.get('/sales', { params });
export const getSaleByIdApi = (id) => api.get(`/sales/${id}`);
export const createSaleApi = (data) => api.post('/sales', data);
export const updateSaleApi = (id, data) => api.put(`/sales/${id}`, data);
export const deleteSaleApi = (id) => api.delete(`/sales/${id}`);

// 7. Production APIs
export const getProductionsApi = (params) => api.get('/production', { params });
export const createProductionApi = (data) => api.post('/production', data);
export const deleteProductionApi = (id) => api.delete(`/production/${id}`);

// 8. Expiry Batch APIs
export const getExpiryBatchesApi = (params) => api.get('/expiry', { params });
export const createExpiryBatchApi = (data) => api.post('/expiry', data);
export const discardBatchApi = (id, data) => api.patch(`/expiry/${id}/discard`, data);
export const deleteExpiryBatchApi = (id) => api.delete(`/expiry/${id}`);

// 9. Reports & Dashboard APIs
export const getDashboardStatsApi = () => api.get('/reports/dashboard-stats');
export const getAnalyticsReportApi = (params) => api.get('/reports/analytics', { params });
export const exportReportCsvApi = (type) => api.get('/reports/export-csv', {
  params: { type: type || 'stock' },
  responseType: 'blob'
});
export const getExportCsvUrl = (type) => {
  const token = localStorage.getItem('dairy_token');
  return `/api/reports/export-csv?type=${type || 'stock'}${token ? `&token=${encodeURIComponent(token)}` : ''}`;
};
export const bulkImportApi = (data) => api.post('/reports/bulk-import', data);
export const seedDemoDataApi = () => api.post('/admin/seed-demo');
export const clearDemoDataApi = () => api.post('/admin/clear-demo');

// 10. Audit Log APIs (Admin only)
export const getAuditLogsApi = (params) => api.get('/audit-logs', { params });

// 11. Customer Feedback & Rating APIs
export const submitFeedbackApi = (data) => api.post('/feedback', data);
export const getAllFeedbackApi = (params) => api.get('/feedback', { params });
export const updateFeedbackStatusApi = (id, data) => api.patch(`/feedback/${id}/status`, data);
export const deleteFeedbackApi = (id) => api.delete(`/feedback/${id}`);

export default api;


