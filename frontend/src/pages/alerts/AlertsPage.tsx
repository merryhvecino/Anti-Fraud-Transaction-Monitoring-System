import React from 'react';
import { Box, Typography, Paper } from '@mui/material';
import { Helmet } from 'react-helmet-async';

const AlertsPage: React.FC = () => {
  return (
    <>
      <Helmet>
        <title>Alerts - AF-TMS</title>
      </Helmet>
      
      <Box>
        <Typography variant="h4" fontWeight="bold" gutterBottom>
          Alert Management
        </Typography>
        <Typography variant="subtitle1" color="text.secondary" sx={{ mb: 3 }}>
          Review and investigate fraud detection alerts
        </Typography>
        
        <Paper sx={{ p: 3 }}>
          <Typography>
            Alert management interface will be implemented here, including:
          </Typography>
          <ul>
            <li>Alert queue with priority sorting</li>
            <li>Alert filtering and search</li>
            <li>Alert assignment and status management</li>
            <li>Alert investigation tools</li>
            <li>Alert escalation workflow</li>
          </ul>
        </Paper>
      </Box>
    </>
  );
};

export default AlertsPage;
