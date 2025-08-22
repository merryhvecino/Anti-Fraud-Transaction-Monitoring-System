import React from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  Card,
  CardContent,
  IconButton,
  Chip,
} from '@mui/material';
import {
  Warning,
  FolderOpen,
  AccountBalance,
  TrendingUp,
  TrendingDown,
  Refresh,
  Security,
} from '@mui/icons-material';
import { Helmet } from 'react-helmet-async';

import { useAuth } from '../hooks/useAuth';

// Mock data - in real app, this would come from API
const dashboardStats = {
  alerts: {
    total: 156,
    new: 23,
    critical: 8,
    trend: 12, // percentage increase
  },
  cases: {
    total: 45,
    open: 12,
    urgent: 3,
    trend: -5, // percentage decrease
  },
  transactions: {
    total: 125780,
    volume: 234500000, // NZD
    flagged: 0.8, // percentage
    trend: 8,
  },
};

const recentAlerts = [
  {
    id: 1,
    alertId: 'AL2024001',
    severity: 'critical',
    type: 'Large Cash Transaction',
    amount: 15000,
    time: '2 minutes ago',
  },
  {
    id: 2,
    alertId: 'AL2024002',
    severity: 'high',
    type: 'High Frequency Transfers',
    amount: 8500,
    time: '15 minutes ago',
  },
  {
    id: 3,
    alertId: 'AL2024003',
    severity: 'medium',
    type: 'Round Amount Pattern',
    amount: 5000,
    time: '1 hour ago',
  },
];

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactElement;
  trend?: number;
  color?: 'primary' | 'secondary' | 'error' | 'warning' | 'info' | 'success';
}

const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  trend,
  color = 'primary',
}) => {
  return (
    <Card elevation={2}>
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="flex-start">
          <Box>
            <Typography color="text.secondary" gutterBottom variant="body2">
              {title}
            </Typography>
            <Typography variant="h4" component="div" fontWeight="bold">
              {value}
            </Typography>
            {subtitle && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {subtitle}
              </Typography>
            )}
          </Box>
          <Box 
            sx={{ 
              bgcolor: `${color}.main`, 
              color: `${color}.contrastText`,
              borderRadius: 2,
              p: 1,
            }}
          >
            {icon}
          </Box>
        </Box>
        
        {trend !== undefined && (
          <Box display="flex" alignItems="center" sx={{ mt: 2 }}>
            {trend > 0 ? (
              <TrendingUp sx={{ fontSize: 16, color: 'error.main', mr: 0.5 }} />
            ) : (
              <TrendingDown sx={{ fontSize: 16, color: 'success.main', mr: 0.5 }} />
            )}
            <Typography 
              variant="caption" 
              sx={{ 
                color: trend > 0 ? 'error.main' : 'success.main',
                fontWeight: 500,
              }}
            >
              {Math.abs(trend)}% vs last week
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

const Dashboard: React.FC = () => {
  const { user } = useAuth();

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-NZ', {
      style: 'currency',
      currency: 'NZD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'error';
      case 'high': return 'warning';
      case 'medium': return 'info';
      case 'low': return 'success';
      default: return 'default';
    }
  };

  return (
    <>
      <Helmet>
        <title>Dashboard - AF-TMS</title>
      </Helmet>

      <Box sx={{ flexGrow: 1 }}>
        {/* Header */}
        <Box display="flex" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
          <Box>
            <Typography variant="h4" fontWeight="bold" gutterBottom>
              Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, {user?.firstName}
            </Typography>
            <Typography variant="subtitle1" color="text.secondary">
              Here's what's happening with your fraud monitoring system today
            </Typography>
          </Box>
          <IconButton>
            <Refresh />
          </IconButton>
        </Box>

        {/* Stats Grid */}
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              title="Total Alerts"
              value={dashboardStats.alerts.total}
              subtitle={`${dashboardStats.alerts.new} new alerts`}
              icon={<Warning />}
              trend={dashboardStats.alerts.trend}
              color="warning"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              title="Active Cases"
              value={dashboardStats.cases.total}
              subtitle={`${dashboardStats.cases.urgent} urgent cases`}
              icon={<FolderOpen />}
              trend={dashboardStats.cases.trend}
              color="info"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              title="Transactions Today"
              value={dashboardStats.transactions.total.toLocaleString()}
              subtitle={`${dashboardStats.transactions.flagged}% flagged`}
              icon={<AccountBalance />}
              trend={dashboardStats.transactions.trend}
              color="primary"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              title="Transaction Volume"
              value={formatCurrency(dashboardStats.transactions.volume)}
              subtitle="Last 24 hours"
              icon={<TrendingUp />}
              color="success"
            />
          </Grid>
        </Grid>

        {/* Content Grid */}
        <Grid container spacing={3}>
          {/* Recent Alerts */}
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3, height: '100%' }}>
              <Box display="flex" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                <Typography variant="h6" fontWeight="bold">
                  Recent Alerts
                </Typography>
                <IconButton size="small">
                  <Refresh />
                </IconButton>
              </Box>
              
              <Box>
                {recentAlerts.map((alert) => (
                  <Box
                    key={alert.id}
                    sx={{
                      p: 2,
                      mb: 1,
                      border: 1,
                      borderColor: 'divider',
                      borderRadius: 1,
                      '&:hover': {
                        bgcolor: 'action.hover',
                        cursor: 'pointer',
                      },
                    }}
                  >
                    <Box display="flex" justifyContent="space-between" alignItems="center">
                      <Box>
                        <Box display="flex" alignItems="center" gap={1} sx={{ mb: 0.5 }}>
                          <Chip
                            label={alert.severity}
                            size="small"
                            color={getSeverityColor(alert.severity) as any}
                            variant="outlined"
                          />
                          <Typography variant="body2" fontWeight="500">
                            {alert.alertId}
                          </Typography>
                        </Box>
                        <Typography variant="body2" color="text.secondary">
                          {alert.type}
                        </Typography>
                      </Box>
                      <Box textAlign="right">
                        <Typography variant="body2" fontWeight="500">
                          {formatCurrency(alert.amount)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {alert.time}
                        </Typography>
                      </Box>
                    </Box>
                  </Box>
                ))}
              </Box>
            </Paper>
          </Grid>

          {/* System Status */}
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3, height: '100%' }}>
              <Typography variant="h6" fontWeight="bold" sx={{ mb: 2 }}>
                System Status
              </Typography>
              
              <Box>
                <Box display="flex" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                  <Box display="flex" alignItems="center" gap={1}>
                    <Security sx={{ color: 'success.main' }} />
                    <Typography variant="body2">Detection Engine</Typography>
                  </Box>
                  <Chip label="Online" color="success" size="small" />
                </Box>
                
                <Box display="flex" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                  <Box display="flex" alignItems="center" gap={1}>
                    <AccountBalance sx={{ color: 'success.main' }} />
                    <Typography variant="body2">Data Pipeline</Typography>
                  </Box>
                  <Chip label="Processing" color="info" size="small" />
                </Box>
                
                <Box display="flex" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                  <Box display="flex" alignItems="center" gap={1}>
                    <Warning sx={{ color: 'success.main' }} />
                    <Typography variant="body2">Alert Engine</Typography>
                  </Box>
                  <Chip label="Active" color="success" size="small" />
                </Box>

                <Box sx={{ mt: 3, p: 2, bgcolor: 'success.light', borderRadius: 1 }}>
                  <Typography variant="body2" color="success.dark">
                    All systems operational. Last update: {new Date().toLocaleTimeString()}
                  </Typography>
                </Box>
              </Box>
            </Paper>
          </Grid>
        </Grid>
      </Box>
    </>
  );
};

export default Dashboard;
