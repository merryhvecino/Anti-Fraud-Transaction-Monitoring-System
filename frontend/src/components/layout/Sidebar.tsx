import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  Divider,
  Chip,
} from '@mui/material';
import {
  Dashboard,
  AccountBalance,
  Warning,
  FolderOpen,
  Assessment,
  Rule,
  Settings,
  Security,
  TrendingUp,
} from '@mui/icons-material';

import { useAuth } from '../../hooks/useAuth';

interface SidebarProps {
  onItemClick?: () => void;
}

interface NavigationItem {
  id: string;
  label: string;
  path: string;
  icon: React.ReactElement;
  roles?: string[];
  badge?: string | number;
}

const Sidebar: React.FC<SidebarProps> = ({ onItemClick }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const navigationItems: NavigationItem[] = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      path: '/',
      icon: <Dashboard />,
    },
    {
      id: 'transactions',
      label: 'Transactions',
      path: '/transactions',
      icon: <AccountBalance />,
    },
    {
      id: 'alerts',
      label: 'Alerts',
      path: '/alerts',
      icon: <Warning />,
      badge: 'New', // Could be dynamic count
    },
    {
      id: 'cases',
      label: 'Cases',
      path: '/cases',
      icon: <FolderOpen />,
    },
    {
      id: 'reports',
      label: 'Reports & SAR',
      path: '/reports',
      icon: <Assessment />,
      roles: ['supervisor', 'admin'],
    },
    {
      id: 'rules',
      label: 'Detection Rules',
      path: '/rules',
      icon: <Rule />,
      roles: ['supervisor', 'admin'],
    },
  ];

  const adminItems: NavigationItem[] = [
    {
      id: 'settings',
      label: 'System Settings',
      path: '/settings',
      icon: <Settings />,
      roles: ['admin'],
    },
  ];

  const handleItemClick = (path: string) => {
    navigate(path);
    onItemClick?.();
  };

  const isItemSelected = (path: string) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  const canAccessItem = (item: NavigationItem) => {
    if (!item.roles || !user) return true;
    return item.roles.includes(user.role);
  };

  const renderNavigationItems = (items: NavigationItem[]) => {
    return items
      .filter(canAccessItem)
      .map((item) => (
        <ListItem key={item.id} disablePadding>
          <ListItemButton
            selected={isItemSelected(item.path)}
            onClick={() => handleItemClick(item.path)}
            sx={{
              borderRadius: 1,
              mx: 1,
              mb: 0.5,
              '&.Mui-selected': {
                bgcolor: 'primary.main',
                color: 'primary.contrastText',
                '& .MuiListItemIcon-root': {
                  color: 'primary.contrastText',
                },
                '&:hover': {
                  bgcolor: 'primary.dark',
                },
              },
            }}
          >
            <ListItemIcon
              sx={{
                color: isItemSelected(item.path) ? 'inherit' : 'text.secondary',
              }}
            >
              {item.icon}
            </ListItemIcon>
            <ListItemText 
              primary={item.label}
              primaryTypographyProps={{
                fontSize: '0.875rem',
                fontWeight: isItemSelected(item.path) ? 600 : 400,
              }}
            />
            {item.badge && (
              <Chip
                label={item.badge}
                size="small"
                color="secondary"
                sx={{ height: 20, fontSize: '0.75rem' }}
              />
            )}
          </ListItemButton>
        </ListItem>
      ));
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Logo and Title */}
      <Toolbar sx={{ px: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
          <Security sx={{ mr: 2, color: 'primary.main' }} />
          <Box>
            <Typography 
              variant="h6" 
              sx={{ 
                fontWeight: 700, 
                color: 'primary.main',
                fontSize: '1.125rem',
              }}
            >
              AF-TMS
            </Typography>
            <Typography 
              variant="caption" 
              sx={{ 
                color: 'text.secondary',
                fontSize: '0.75rem',
                lineHeight: 1,
              }}
            >
              New Zealand
            </Typography>
          </Box>
        </Box>
      </Toolbar>

      <Divider />

      {/* User Info */}
      <Box sx={{ p: 2, bgcolor: 'grey.50' }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          {user?.firstName} {user?.lastName}
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {user?.role?.charAt(0).toUpperCase() + user?.role?.slice(1)} • {user?.department || 'Compliance'}
        </Typography>
      </Box>

      <Divider />

      {/* Navigation */}
      <Box sx={{ flexGrow: 1, overflowY: 'auto', py: 1 }}>
        <List>
          {renderNavigationItems(navigationItems)}
        </List>

        {/* Admin Section */}
        {adminItems.some(canAccessItem) && (
          <>
            <Divider sx={{ mx: 2, my: 2 }} />
            <Typography
              variant="overline"
              sx={{
                px: 2,
                color: 'text.secondary',
                fontSize: '0.75rem',
                fontWeight: 600,
              }}
            >
              Administration
            </Typography>
            <List>
              {renderNavigationItems(adminItems)}
            </List>
          </>
        )}
      </Box>

      {/* Footer */}
      <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
          <TrendingUp sx={{ fontSize: 16, mr: 1, color: 'success.main' }} />
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            System Status: Active
          </Typography>
        </Box>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          Version 1.0.0 • {new Date().getFullYear()}
        </Typography>
      </Box>
    </Box>
  );
};

export default Sidebar;
