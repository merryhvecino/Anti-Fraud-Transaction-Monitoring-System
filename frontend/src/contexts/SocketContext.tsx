import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { useSnackbar } from 'notistack';
import { useAuth } from './AuthContext';
import { Alert, Case, SocketEvent } from '../types';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  notifications: SocketEvent[];
  clearNotifications: () => void;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

interface SocketProviderProps {
  children: ReactNode;
}

export const SocketProvider: React.FC<SocketProviderProps> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [notifications, setNotifications] = useState<SocketEvent[]>([]);
  const { user, token } = useAuth();
  const { enqueueSnackbar } = useSnackbar();

  useEffect(() => {
    if (user && token) {
      // Initialize socket connection
      const newSocket = io(process.env.REACT_APP_SOCKET_URL || 'http://localhost:5000', {
        auth: {
          token: token,
        },
        transports: ['websocket'],
        upgrade: true,
      });

      setSocket(newSocket);

      // Connection event handlers
      newSocket.on('connect', () => {
        console.log('Socket connected:', newSocket.id);
        setIsConnected(true);
        
        // Join user-specific room
        newSocket.emit('join_room', `user_${user.id}`);
        
        enqueueSnackbar('Real-time monitoring connected', { 
          variant: 'success',
          autoHideDuration: 3000,
        });
      });

      newSocket.on('disconnect', () => {
        console.log('Socket disconnected');
        setIsConnected(false);
        
        enqueueSnackbar('Real-time monitoring disconnected', { 
          variant: 'warning',
          autoHideDuration: 3000,
        });
      });

      newSocket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
        setIsConnected(false);
        
        enqueueSnackbar('Failed to connect to real-time monitoring', { 
          variant: 'error',
          autoHideDuration: 5000,
        });
      });

      // Real-time event handlers
      newSocket.on('new_alert', (alertData: Partial<Alert>) => {
        console.log('New alert received:', alertData);
        
        const event: SocketEvent = {
          type: 'new_alert',
          data: alertData,
          timestamp: new Date().toISOString(),
        };
        
        setNotifications(prev => [event, ...prev.slice(0, 49)]); // Keep last 50 notifications
        
        // Show notification based on severity
        const severity = alertData.severity;
        let variant: 'default' | 'error' | 'success' | 'warning' | 'info' = 'info';
        
        if (severity === 'critical') {
          variant = 'error';
        } else if (severity === 'high') {
          variant = 'warning';
        } else if (severity === 'medium') {
          variant = 'info';
        }
        
        enqueueSnackbar(
          `New ${severity} severity alert: ${alertData.alert_id}`,
          { 
            variant,
            autoHideDuration: severity === 'critical' ? 10000 : 5000,
            action: severity === 'critical' ? (
              <button 
                onClick={() => window.location.href = `/alerts/${alertData.id}`}
                style={{ color: 'white', background: 'none', border: '1px solid white', padding: '4px 8px', borderRadius: '4px' }}
              >
                View
              </button>
            ) : undefined,
          }
        );
      });

      newSocket.on('alert_updated', (alertData: Partial<Alert>) => {
        console.log('Alert updated:', alertData);
        
        const event: SocketEvent = {
          type: 'alert_updated',
          data: alertData,
          timestamp: new Date().toISOString(),
        };
        
        setNotifications(prev => [event, ...prev.slice(0, 49)]);
      });

      newSocket.on('new_case', (caseData: Partial<Case>) => {
        console.log('New case created:', caseData);
        
        const event: SocketEvent = {
          type: 'new_case',
          data: caseData,
          timestamp: new Date().toISOString(),
        };
        
        setNotifications(prev => [event, ...prev.slice(0, 49)]);
        
        // Show notification for new cases
        enqueueSnackbar(
          `New case created: ${caseData.case_number}`,
          { 
            variant: caseData.priority === 'urgent' ? 'error' : 'info',
            autoHideDuration: 5000,
          }
        );
      });

      newSocket.on('case_updated', (caseData: Partial<Case>) => {
        console.log('Case updated:', caseData);
        
        const event: SocketEvent = {
          type: 'case_updated',
          data: caseData,
          timestamp: new Date().toISOString(),
        };
        
        setNotifications(prev => [event, ...prev.slice(0, 49)]);
      });

      newSocket.on('system_notification', (notificationData: any) => {
        console.log('System notification:', notificationData);
        
        const event: SocketEvent = {
          type: 'system_notification',
          data: notificationData,
          timestamp: new Date().toISOString(),
        };
        
        setNotifications(prev => [event, ...prev.slice(0, 49)]);
        
        enqueueSnackbar(
          notificationData.message,
          { 
            variant: notificationData.type || 'info',
            autoHideDuration: 5000,
          }
        );
      });

      // Cleanup on unmount
      return () => {
        newSocket.close();
        setSocket(null);
        setIsConnected(false);
      };
    }
  }, [user, token, enqueueSnackbar]);

  const clearNotifications = () => {
    setNotifications([]);
  };

  const value: SocketContextType = {
    socket,
    isConnected,
    notifications,
    clearNotifications,
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = (): SocketContextType => {
  const context = useContext(SocketContext);
  if (context === undefined) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};
