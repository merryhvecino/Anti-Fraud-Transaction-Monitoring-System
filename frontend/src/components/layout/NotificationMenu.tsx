import React from 'react';
import {
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Typography,
  Box,
  Badge,
  IconButton,
} from '@mui/material';
import {
  Warning,
  FolderOpen,
  Clear,
  MarkEmailRead,
} from '@mui/icons-material';

import { useSocket } from '../../contexts/SocketContext';

interface NotificationMenuProps {
  anchorEl: HTMLElement | null;
  open: boolean;
  onClose: () => void;
}

const NotificationMenu: React.FC<NotificationMenuProps> = ({ anchorEl, open, onClose }) => {
  const { notifications, clearNotifications } = useSocket();

  const handleClearAll = () => {
    clearNotifications();
    onClose();
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'new_alert':
        return <Warning color="warning" />;
      case 'new_case':
        return <FolderOpen color="info" />;
      default:
        return <Warning />;
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <Menu
      anchorEl={anchorEl}
      open={open}
      onClose={onClose}
      PaperProps={{
        elevation: 8,
        sx: {
          overflow: 'visible',
          filter: 'drop-shadow(0px 2px 8px rgba(0,0,0,0.32))',
          mt: 1.5,
          minWidth: 320,
          maxHeight: 400,
          '&:before': {
            content: '""',
            display: 'block',
            position: 'absolute',
            top: 0,
            right: 14,
            width: 10,
            height: 10,
            bgcolor: 'background.paper',
            transform: 'translateY(-50%) rotate(45deg)',
            zIndex: 0,
          },
        },
      }}
      transformOrigin={{ horizontal: 'right', vertical: 'top' }}
      anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
    >
      {/* Header */}
      <Box sx={{ px: 2, py: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6" fontWeight="bold">
          Notifications
        </Typography>
        <Badge badgeContent={notifications.length} color="primary">
          <IconButton size="small" onClick={handleClearAll}>
            <Clear fontSize="small" />
          </IconButton>
        </Badge>
      </Box>
      
      <Divider />
      
      {notifications.length === 0 ? (
        <Box sx={{ p: 3, textAlign: 'center' }}>
          <MarkEmailRead sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
          <Typography variant="body2" color="text.secondary">
            No new notifications
          </Typography>
        </Box>
      ) : (
        <>
          {notifications.slice(0, 10).map((notification, index) => (
            <MenuItem key={index} sx={{ whiteSpace: 'normal' }}>
              <ListItemIcon>
                {getNotificationIcon(notification.type)}
              </ListItemIcon>
              <ListItemText
                primary={
                  <Typography variant="body2" fontWeight="500">
                    {notification.type === 'new_alert' && 'New Alert'}
                    {notification.type === 'new_case' && 'New Case'}
                    {notification.type === 'alert_updated' && 'Alert Updated'}
                    {notification.type === 'case_updated' && 'Case Updated'}
                  </Typography>
                }
                secondary={
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      {notification.data.alert_id || notification.data.case_number || 'System'} •{' '}
                      {formatTime(notification.timestamp)}
                    </Typography>
                  </Box>
                }
              />
            </MenuItem>
          ))}
          
          {notifications.length > 10 && (
            <>
              <Divider />
              <MenuItem>
                <ListItemText
                  primary={
                    <Typography variant="body2" color="primary" align="center">
                      View all notifications ({notifications.length})
                    </Typography>
                  }
                />
              </MenuItem>
            </>
          )}
        </>
      )}
    </Menu>
  );
};

export default NotificationMenu;
