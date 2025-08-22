import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Box } from '@mui/material';
import { Helmet } from 'react-helmet-async';

import { useAuth } from './hooks/useAuth';
import Layout from './components/layout/Layout';
import LoginPage from './pages/auth/LoginPage';
import LoadingPage from './pages/LoadingPage';

// Page imports
import Dashboard from './pages/Dashboard';
import TransactionsPage from './pages/transactions/TransactionsPage';
import TransactionDetailsPage from './pages/transactions/TransactionDetailsPage';
import AlertsPage from './pages/alerts/AlertsPage';
import AlertDetailsPage from './pages/alerts/AlertDetailsPage';
import CasesPage from './pages/cases/CasesPage';
import CaseDetailsPage from './pages/cases/CaseDetailsPage';
import ReportsPage from './pages/reports/ReportsPage';
import RulesPage from './pages/rules/RulesPage';
import SettingsPage from './pages/settings/SettingsPage';
import ProfilePage from './pages/profile/ProfilePage';

// Protected Route component
interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRoles?: string[];
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
  children, 
  requiredRoles = [] 
}) => {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingPage />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRoles.length > 0 && !requiredRoles.includes(user?.role || '')) {
    return (
      <Box 
        display="flex" 
        justifyContent="center" 
        alignItems="center" 
        height="100vh"
        flexDirection="column"
      >
        <h2>Access Denied</h2>
        <p>You don't have permission to view this page.</p>
      </Box>
    );
  }

  return <>{children}</>;
};

const App: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingPage />;
  }

  return (
    <>
      <Helmet>
        <title>AF-TMS - Anti-Fraud Transaction Monitoring</title>
        <meta 
          name="description" 
          content="Comprehensive fraud detection and compliance monitoring for New Zealand financial institutions" 
        />
      </Helmet>
      
      <Routes>
        <Route 
          path="/login" 
          element={
            isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />
          } 
        />
        
        <Route 
          path="/*" 
          element={
            <ProtectedRoute>
              <Layout>
                <Routes>
                  <Route index element={<Dashboard />} />
                  
                  {/* Transactions */}
                  <Route path="transactions" element={<TransactionsPage />} />
                  <Route path="transactions/:id" element={<TransactionDetailsPage />} />
                  
                  {/* Alerts */}
                  <Route path="alerts" element={<AlertsPage />} />
                  <Route path="alerts/:id" element={<AlertDetailsPage />} />
                  
                  {/* Cases */}
                  <Route path="cases" element={<CasesPage />} />
                  <Route path="cases/:id" element={<CaseDetailsPage />} />
                  
                  {/* Reports - Supervisor+ only */}
                  <Route 
                    path="reports" 
                    element={
                      <ProtectedRoute requiredRoles={['supervisor', 'admin']}>
                        <ReportsPage />
                      </ProtectedRoute>
                    } 
                  />
                  
                  {/* Rules - Supervisor+ only */}
                  <Route 
                    path="rules" 
                    element={
                      <ProtectedRoute requiredRoles={['supervisor', 'admin']}>
                        <RulesPage />
                      </ProtectedRoute>
                    } 
                  />
                  
                  {/* Settings - Admin only */}
                  <Route 
                    path="settings" 
                    element={
                      <ProtectedRoute requiredRoles={['admin']}>
                        <SettingsPage />
                      </ProtectedRoute>
                    } 
                  />
                  
                  {/* Profile */}
                  <Route path="profile" element={<ProfilePage />} />
                  
                  {/* 404 redirect */}
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Layout>
            </ProtectedRoute>
          } 
        />
      </Routes>
    </>
  );
};

export default App;
